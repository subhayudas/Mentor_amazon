import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv, isDebugEnabled } from '../../_lib/env.js';
import {
  appendSetCookie,
  deriveCookieKey,
  expiredCookie,
  parseCookies,
  serializeCookie,
  signValue,
  verifyValue,
  DEBUG_COOKIE,
  DEBUG_COOKIE_MAX_AGE,
  OIDC_COOKIE,
  OIDC_COOKIE_MAX_AGE,
  bridgeBindCookie,
  type OidcCookiePayload,
} from '../../_lib/cookies.js';
import {
  exchangeCode,
  extractIdentity,
  fetchUserinfo,
  getDiscovery,
  randomUrlSafe,
  stripTokenMaterial,
  verifyIdToken,
  OidcError,
} from '../../_lib/oidc.js';
import {
  createAdminClient,
  createAuthUser,
  deleteAuthUser,
  findApprovedUser,
  findAuthUserByEmail,
  findMentorIdByEmail,
  findUserByAlias,
  findUserByEmail,
  generateMagicLink,
  insertUsersRow,
  rotateAuthPassword,
  syncAuthMetadata,
  updateUsersRow,
  upsertAccessRequest,
  upsertIdentifier,
  SsoDataError,
  type UsersRow,
} from '../../_lib/supabaseAdmin.js';
import {
  loginErrorUrl,
  logSso,
  noStore,
  queryParam,
  safeReturnTo,
  sendMethodNotAllowed,
  sendMisconfigured,
  sendRedirect,
  type SsoErrorCode,
} from '../../_lib/http.js';

/**
 * GET /api/auth/callback/amazon?code=...&state=...
 *
 * Registered with Amazon's identity team as the exact redirect URI
 *   https://mentor-amazon.vercel.app/api/auth/callback/amazon
 * Never move or rename this route without a Federate re-registration.
 *
 * Outcomes (all 302, never a stack trace):
 *   missing/reused state         → /login?error=sso_state
 *   token endpoint rejected code → /login?error=sso_token
 *   alias not on the allow-list  → /request-access?alias=<alias>
 *   approved                     → /auth/sso#token_hash=...&type=magiclink&next=/path
 *   anything else                → /login?error=sso_failed
 * With AMAZON_OIDC_DEBUG=true a `&reason=<code>` is appended to error redirects.
 */

export interface DebugCookiePayload {
  alias: string;
  sub: string;
  email?: string;
  name?: string;
  token_auth_method: string;
  captured_at: string;
  id_token_claims: Record<string, unknown>;
  userinfo: Record<string, unknown> | null;
  truncated?: boolean;
}

const DEBUG_COOKIE_BUDGET = 3600; // bytes; browsers cap a single cookie near 4 KiB

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function sameText(a: string | null | undefined, b: string): boolean {
  return typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function debugPayload(payload: DebugCookiePayload): DebugCookiePayload {
  if (JSON.stringify(payload).length <= DEBUG_COOKIE_BUDGET) return payload;
  // Keep the claims the identity team actually needs to confirm; drop the bulk.
  const keep = ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce', 'amazonAlias', 'email', 'name', 'given_name', 'family_name', 'preferred_username'];
  const slim: Record<string, unknown> = { _all_claim_keys: Object.keys(payload.id_token_claims) };
  for (const k of keep) if (k in payload.id_token_claims) slim[k] = payload.id_token_claims[k];
  return { ...payload, id_token_claims: slim, userinfo: payload.userinfo ? { _keys: Object.keys(payload.userinfo) } : null, truncated: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendMethodNotAllowed(res, ['GET', 'HEAD']);
    return;
  }

  const envResult = readEnv([
    'issuer',
    'clientId',
    'clientSecret',
    'redirectUri',
    'supabaseUrl',
    'supabaseServiceRoleKey',
    'appOrigin',
  ] as const);
  if (!envResult.ok) {
    sendMisconfigured(res, envResult.missing);
    return;
  }
  const env = envResult.env;
  const debug = isDebugEnabled();
  const key = deriveCookieKey(env.clientSecret);

  const fail = (code: SsoErrorCode, reason: string, alias?: string): void => {
    logSso('callback.failed', { alias, outcome: code, reason });
    sendRedirect(res, loginErrorUrl(env.appOrigin, code, reason, debug));
  };

  // The round-trip cookie is single-use: clear it whatever happens next.
  const cookies = parseCookies(req);
  const session = verifyValue<OidcCookiePayload>(key, cookies[OIDC_COOKIE]);
  appendSetCookie(res, expiredCookie(OIDC_COOKIE));
  if (!debug) appendSetCookie(res, expiredCookie(DEBUG_COOKIE));

  const stateParam = queryParam(req, 'state');
  const code = queryParam(req, 'code');
  const providerError = queryParam(req, 'error');

  if (!session || typeof session.st !== 'string' || typeof session.nc !== 'string' || typeof session.cv !== 'string') {
    fail('sso_state', 'no_cookie');
    return;
  }
  if (!stateParam) {
    fail('sso_state', 'no_state');
    return;
  }
  if (!safeEqual(session.st, stateParam)) {
    fail('sso_state', 'state_mismatch');
    return;
  }
  if (typeof session.iat !== 'number' || Date.now() - session.iat > OIDC_COOKIE_MAX_AGE * 1000) {
    fail('sso_state', 'expired');
    return;
  }
  const returnTo = safeReturnTo(session.rt);

  if (providerError) {
    // Attacker-controllable query value: keep only a short token-safe slug before it reaches logs/URLs.
    fail('sso_failed', `provider_${providerError.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)}`);
    return;
  }
  if (!code) {
    fail('sso_failed', 'no_code');
    return;
  }

  // --- Discovery -----------------------------------------------------------
  let discovery;
  try {
    discovery = await getDiscovery(env.issuer);
  } catch (err) {
    fail('sso_failed', err instanceof OidcError ? err.code : 'discovery');
    return;
  }

  // --- Code exchange -------------------------------------------------------
  let tokens;
  let tokenAuthMethod: string;
  try {
    ({ tokens, method: tokenAuthMethod } = await exchangeCode({
      tokenEndpoint: discovery.token_endpoint,
      code,
      codeVerifier: session.cv,
      redirectUri: env.redirectUri,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
    }));
  } catch (err) {
    fail('sso_token', err instanceof OidcError ? err.code : 'token');
    return;
  }

  // --- ID token ------------------------------------------------------------
  let claims;
  try {
    claims = await verifyIdToken({
      idToken: tokens.id_token,
      issuer: discovery.issuer,
      clientId: env.clientId,
      nonce: session.nc,
      jwksUri: discovery.jwks_uri,
    });
  } catch (err) {
    fail('sso_failed', err instanceof OidcError ? err.code : 'id_token');
    return;
  }

  let identity = extractIdentity(claims);
  if (!identity.alias) {
    fail('sso_failed', 'no_alias');
    return;
  }
  const alias = identity.alias;

  // --- Userinfo fallback (only when the ID token is missing email or name) --
  let userinfo: Record<string, unknown> | null = null;
  if ((!identity.email || !identity.name) && tokens.access_token && discovery.userinfo_endpoint) {
    userinfo = await fetchUserinfo({
      userinfoEndpoint: discovery.userinfo_endpoint,
      accessToken: tokens.access_token,
      issuer: discovery.issuer,
      clientId: env.clientId,
      jwksUri: discovery.jwks_uri,
      expectedSub: identity.sub,
    });
    if (userinfo) identity = extractIdentity(claims, userinfo);
  }

  const safeClaims = stripTokenMaterial(claims as Record<string, unknown>);
  const safeUserinfo = userinfo ? stripTokenMaterial(userinfo) : null;

  if (debug) {
    const payload = debugPayload({
      alias,
      sub: identity.sub,
      email: identity.email,
      name: identity.name,
      token_auth_method: tokenAuthMethod,
      captured_at: new Date().toISOString(),
      id_token_claims: safeClaims,
      userinfo: safeUserinfo,
    });
    appendSetCookie(res, serializeCookie(DEBUG_COOKIE, signValue(key, payload), { maxAge: DEBUG_COOKIE_MAX_AGE }));
  }

  // --- Allow-list + account bridge ----------------------------------------
  const sb = createAdminClient(env.supabaseUrl, env.supabaseServiceRoleKey);

  try {
    const approved = await findApprovedUser(sb, alias);
    if (!approved) {
      try {
        const outcome = await upsertAccessRequest(sb, { alias, email: identity.email, name: identity.name });
        logSso('callback.not_approved', { alias, outcome: 'request_access', request: outcome });
      } catch (err) {
        // The user still gets the request-access screen; an admin can add them by hand.
        logSso('callback.not_approved', { alias, outcome: 'request_access', request: 'write_failed', reason: err instanceof SsoDataError ? err.code : 'db' });
      }
      const target = new URL('/request-access', env.appOrigin);
      target.searchParams.set('alias', alias);
      sendRedirect(res, target.toString());
      return;
    }

    const email = identity.email ?? (approved.email ? approved.email.trim().toLowerCase() : undefined);
    if (!email) {
      fail('sso_failed', 'no_email', alias);
      return;
    }

    let user: UsersRow | null = (await findUserByAlias(sb, alias)) ?? (await findUserByEmail(sb, email));
    if (user && user.amazon_alias && !sameText(user.amazon_alias, alias)) {
      // The email is already bound to a different Amazon alias: refuse rather than re-link.
      fail('sso_failed', 'alias_conflict', alias);
      return;
    }

    // An existing row matched by email only (no alias yet) is linked solely
    // when it is the kind of account an admin provisions for this role. A
    // self-registered mentee row must never be promoted by an SSO login —
    // anyone can sign up with someone else's corporate address ahead of time.
    if (user && !user.amazon_alias && user.user_type !== approved.role) {
      fail('sso_failed', 'email_conflict', alias);
      return;
    }
    const linkingLegacyRow = Boolean(user && !user.amazon_alias);

    // The session must belong to the account we found, even if Amazon now reports a different email.
    const sessionEmail = user ? user.email : email;

    let createdAuthId: string | null = null;
    if (!user) {
      createdAuthId = await createAuthUser(sb, { email, role: approved.role, alias, name: identity.name });
      if (!createdAuthId) {
        // An auth user already owns this email but has no users row. Bind to
        // it only if nobody has ever confirmed or used it (an orphan
        // pre-registration): delete it and start clean. Anything that has
        // been signed into is somebody's account and needs an admin to merge.
        const existing = await findAuthUserByEmail(sb, email);
        if (!existing) {
          fail('sso_failed', 'auth_user_conflict', alias);
          return;
        }
        const neverUsed = !existing.emailConfirmedAt && !existing.lastSignInAt;
        if (!neverUsed) {
          logSso('callback.refused', { alias, reason: 'auth_user_conflict', providers: existing.providers.join('+') });
          fail('sso_failed', 'auth_user_conflict', alias);
          return;
        }
        await deleteAuthUser(sb, existing.id);
        createdAuthId = await createAuthUser(sb, { email, role: approved.role, alias, name: identity.name });
        if (!createdAuthId) {
          fail('sso_failed', 'auth_user_conflict', alias);
          return;
        }
        logSso('callback.orphan_replaced', { alias });
      }
    } else if (linkingLegacyRow) {
      // A credential set on this account before the SSO link must not keep working.
      await rotateAuthPassword(sb, user.id);
    }

    const link = await generateMagicLink(sb, sessionEmail);

    if (!user) {
      if (!createdAuthId || link.userId !== createdAuthId) {
        fail('sso_failed', 'auth_user_mismatch', alias);
        return;
      }
      const profileId = approved.mentor_id ?? (await findMentorIdByEmail(sb, email));
      user = await insertUsersRow(sb, { id: createdAuthId, email, role: approved.role, alias, profileId });
      logSso('callback.user_created', { alias, role: approved.role, linked_profile: Boolean(profileId) });
    } else {
      if (link.userId !== user.id) {
        // The auth user that owns this email is not the account the users row
        // describes; signing one in as the other would cross identities.
        fail('sso_failed', 'auth_user_mismatch', alias);
        return;
      }
      const patch: Partial<Pick<UsersRow, 'amazon_alias' | 'profile_id' | 'is_verified'>> = {};
      if (!sameText(user.amazon_alias, alias)) patch.amazon_alias = alias;
      if (!user.profile_id) {
        const profileId = approved.mentor_id ?? (await findMentorIdByEmail(sb, user.email));
        if (profileId) patch.profile_id = profileId;
      }
      if (!user.is_verified) patch.is_verified = true;
      if (Object.keys(patch).length > 0) {
        await updateUsersRow(sb, user.id, patch);
        if (patch.amazon_alias) await syncAuthMetadata(sb, link.userId, { amazon_alias: alias });
      }
    }

    await upsertIdentifier(sb, {
      userId: user.id,
      alias,
      email: identity.email ?? email,
      claims: { id_token_claims: safeClaims, userinfo: safeUserinfo, token_auth_method: tokenAuthMethod },
    });

    // Bind the bridge to this browser: the SPA only redeems the token when the
    // fragment's nonce matches a cookie set here, so a captured bridge URL
    // cannot log a different browser into this account (login CSRF).
    const bind = randomUrlSafe(16);
    appendSetCookie(res, bridgeBindCookie(bind));

    const bridge = new URL('/auth/sso', env.appOrigin);
    bridge.hash = `token_hash=${encodeURIComponent(link.hashedToken)}&type=magiclink&bind=${bind}&next=${encodeURIComponent(returnTo)}`;
    logSso('callback.success', { alias, role: user.user_type, returnTo });
    sendRedirect(res, bridge.toString());
  } catch (err) {
    fail('sso_failed', err instanceof SsoDataError ? err.code : 'bridge', alias);
  }
}
