import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv, isDebugEnabled } from '../../_lib/env.js';
import {
  appendSetCookie,
  deriveCookieKey,
  serializeCookie,
  signValue,
  OIDC_COOKIE,
  OIDC_COOKIE_MAX_AGE,
  type OidcCookiePayload,
} from '../../_lib/cookies.js';
import { buildAuthorizationUrl, createPkce, getDiscovery, randomUrlSafe, OidcError } from '../../_lib/oidc.js';
import {
  loginErrorUrl,
  logSso,
  noStore,
  queryParam,
  safeReturnTo,
  sendMethodNotAllowed,
  sendMisconfigured,
  sendRedirect,
} from '../../_lib/http.js';

/**
 * GET /api/auth/login/amazon[?returnTo=/path]
 *
 * Starts the Amazon Federate OIDC flow: discovery → PKCE + state + nonce in a
 * signed HttpOnly cookie → 302 to the authorization endpoint.
 */

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendMethodNotAllowed(res, ['GET', 'HEAD']);
    return;
  }

  const envResult = readEnv(['issuer', 'clientId', 'clientSecret', 'redirectUri', 'scopes', 'appOrigin'] as const);
  if (!envResult.ok) {
    sendMisconfigured(res, envResult.missing);
    return;
  }
  const env = envResult.env;
  const debug = isDebugEnabled();
  const returnTo = safeReturnTo(queryParam(req, 'returnTo'));

  let authorizationEndpoint: string;
  try {
    ({ authorization_endpoint: authorizationEndpoint } = await getDiscovery(env.issuer));
  } catch (err) {
    const reason = err instanceof OidcError ? err.code : 'discovery';
    logSso('login.discovery_failed', { reason });
    sendRedirect(res, loginErrorUrl(env.appOrigin, 'sso_failed', reason, debug));
    return;
  }

  const pkce = createPkce();
  const state = randomUrlSafe(32);
  const nonce = randomUrlSafe(32);

  const payload: OidcCookiePayload = { st: state, nc: nonce, cv: pkce.verifier, rt: returnTo, iat: Date.now() };
  const cookieValue = signValue(deriveCookieKey(env.clientSecret), payload);
  appendSetCookie(res, serializeCookie(OIDC_COOKIE, cookieValue, { maxAge: OIDC_COOKIE_MAX_AGE }));

  const location = buildAuthorizationUrl({
    authorizationEndpoint,
    clientId: env.clientId,
    redirectUri: env.redirectUri,
    scopes: env.scopes,
    state,
    nonce,
    codeChallenge: pkce.challenge,
  });

  logSso('login.redirect', { returnTo });
  sendRedirect(res, location);
}
