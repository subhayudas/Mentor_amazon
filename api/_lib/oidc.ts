import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';

/**
 * OpenID Connect primitives for the Amazon Federate integration:
 * discovery (cached), PKCE, the authorization-code exchange, ID-token
 * validation and the userinfo fallback. Nothing in this module logs.
 */

export interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
}

/** Module-scope cache: survives across invocations of a warm function. */
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const discoveryCache = new Map<string, { doc: DiscoveryDocument; expiresAt: number }>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export class OidcError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'OidcError';
  }
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new OidcError('discovery_invalid', `discovery document lacks ${key}`);
  }
  return value;
}

export async function getDiscovery(issuer: string): Promise<DiscoveryDocument> {
  const now = Date.now();
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > now) return cached.doc;

  const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new OidcError('discovery_unreachable');
  }
  if (!response.ok) throw new OidcError('discovery_http_' + response.status);

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new OidcError('discovery_invalid', 'discovery document is not JSON');
  }
  if (!raw || typeof raw !== 'object') throw new OidcError('discovery_invalid');
  const obj = raw as Record<string, unknown>;

  const doc: DiscoveryDocument = {
    issuer: requireString(obj, 'issuer'),
    authorization_endpoint: requireString(obj, 'authorization_endpoint'),
    token_endpoint: requireString(obj, 'token_endpoint'),
    jwks_uri: requireString(obj, 'jwks_uri'),
    userinfo_endpoint: typeof obj.userinfo_endpoint === 'string' ? obj.userinfo_endpoint : undefined,
    end_session_endpoint: typeof obj.end_session_endpoint === 'string' ? obj.end_session_endpoint : undefined,
    token_endpoint_auth_methods_supported: Array.isArray(obj.token_endpoint_auth_methods_supported)
      ? (obj.token_endpoint_auth_methods_supported as unknown[]).filter((m): m is string => typeof m === 'string')
      : undefined,
  };

  // OIDC Discovery §4.3: the issuer in the document must match the one we asked for.
  if (doc.issuer.replace(/\/+$/, '') !== issuer.replace(/\/+$/, '')) {
    throw new OidcError('discovery_issuer_mismatch');
  }

  discoveryCache.set(issuer, { doc, expiresAt: now + DISCOVERY_TTL_MS });
  return doc;
}

function getJwks(jwksUri: string) {
  let jwks = jwksCache.get(jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60 * 1000,
    });
    jwksCache.set(jwksUri, jwks);
  }
  return jwks;
}

// ---------------------------------------------------------------------------
// PKCE / random values

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export interface Pkce {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export function createPkce(): Pkce {
  const verifier = randomUrlSafe(48); // 64 chars, within RFC 7636's 43..128
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

export interface AuthorizationUrlInput {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', input.scopes);
  url.searchParams.set('state', input.state);
  url.searchParams.set('nonce', input.nonce);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token exchange

export interface TokenResponse {
  id_token: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface TokenExchangeInput {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}

type TokenAuthMethod = 'client_secret_basic' | 'client_secret_post';

async function postToken(input: TokenExchangeInput, method: TokenAuthMethod): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('code', input.code);
  form.set('redirect_uri', input.redirectUri);
  form.set('code_verifier', input.codeVerifier);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (method === 'client_secret_basic') {
    // RFC 6749 §2.3.1: form-encode id and secret before base64.
    const credentials = `${encodeURIComponent(input.clientId)}:${encodeURIComponent(input.clientSecret)}`;
    headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
  } else {
    form.set('client_id', input.clientId);
    form.set('client_secret', input.clientSecret);
  }

  let response: Response;
  try {
    response = await fetch(input.tokenEndpoint, { method: 'POST', headers, body: form.toString() });
  } catch {
    throw new OidcError('token_unreachable');
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/**
 * Exchange the code. Tries `client_secret_basic` first (the OIDC default) and
 * retries once with `client_secret_post` when the server rejects the client
 * authentication itself (401 or `invalid_client`). Any other failure is not
 * retried because the code may already be consumed.
 */
export async function exchangeCode(input: TokenExchangeInput): Promise<{ tokens: TokenResponse; method: TokenAuthMethod }> {
  let method: TokenAuthMethod = 'client_secret_basic';
  let result = await postToken(input, method);

  const clientAuthRejected =
    result.status === 401 || (result.body && result.body.error === 'invalid_client');
  if (clientAuthRejected) {
    method = 'client_secret_post';
    result = await postToken(input, method);
  }

  if (result.status < 200 || result.status >= 300 || !result.body) {
    const code = typeof result.body?.error === 'string' ? result.body.error : `http_${result.status}`;
    throw new OidcError(`token_${code}`);
  }
  const idToken = result.body.id_token;
  if (typeof idToken !== 'string' || idToken.length === 0) throw new OidcError('token_no_id_token');

  return {
    method,
    tokens: {
      id_token: idToken,
      access_token: typeof result.body.access_token === 'string' ? result.body.access_token : undefined,
      token_type: typeof result.body.token_type === 'string' ? result.body.token_type : undefined,
      expires_in: typeof result.body.expires_in === 'number' ? result.body.expires_in : undefined,
      scope: typeof result.body.scope === 'string' ? result.body.scope : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// ID token + userinfo

export interface VerifyIdTokenInput {
  idToken: string;
  issuer: string;
  clientId: string;
  nonce: string;
  jwksUri: string;
}

export type IdTokenClaims = JWTPayload & Record<string, unknown>;

export async function verifyIdToken(input: VerifyIdTokenInput): Promise<IdTokenClaims> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(input.idToken, getJwks(input.jwksUri), {
      issuer: input.issuer,
      audience: input.clientId,
      clockTolerance: 60,
    }));
  } catch {
    throw new OidcError('id_token_invalid');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new OidcError('id_token_no_sub');
  if (payload.nonce !== input.nonce) throw new OidcError('id_token_nonce');

  // OIDC Core §3.1.3.7 (4): with several audiences, azp must be our client id.
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (audiences.length > 1 && payload.azp !== undefined && payload.azp !== input.clientId) {
    throw new OidcError('id_token_azp');
  }
  return payload as IdTokenClaims;
}

export interface UserinfoInput {
  userinfoEndpoint: string;
  accessToken: string;
  issuer: string;
  clientId: string;
  jwksUri: string;
  expectedSub: string;
}

/**
 * Fetch userinfo. JSON responses are used as-is; signed (application/jwt)
 * responses are verified against the same JWKS. Returns null on any problem
 * so callers can treat it strictly as a fallback.
 */
export async function fetchUserinfo(input: UserinfoInput): Promise<Record<string, unknown> | null> {
  let response: Response;
  try {
    response = await fetch(input.userinfoEndpoint, {
      headers: { Authorization: `Bearer ${input.accessToken}`, Accept: 'application/json, application/jwt' },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') ?? '';
  let claims: Record<string, unknown> | null = null;
  try {
    if (contentType.includes('application/jwt')) {
      const jwt = await response.text();
      try {
        const { payload } = await jwtVerify(jwt, getJwks(input.jwksUri), {
          issuer: input.issuer,
          audience: input.clientId,
          clockTolerance: 60,
        });
        claims = payload as Record<string, unknown>;
      } catch {
        // Some providers sign userinfo without an aud. The response still came
        // over TLS from the discovered endpoint with our access token, so fall
        // back to the decoded payload as long as iss and (below) sub match.
        const decoded = decodeJwt(jwt) as Record<string, unknown>;
        claims = decoded.iss === input.issuer ? decoded : null;
      }
    } else {
      const parsed: unknown = await response.json();
      claims = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    }
  } catch {
    return null;
  }

  // OIDC Core §5.3.2: the userinfo sub MUST match the ID token sub.
  if (!claims || claims.sub !== input.expectedSub) return null;
  return claims;
}

// ---------------------------------------------------------------------------
// Claim helpers

const TOKEN_LIKE_KEY = /(token|secret|password|passwd|credential|assertion)/i;
const JWT_SHAPE = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

/**
 * Remove anything that could be token material before claims are persisted
 * or shown in debug output: keys that look like tokens, `code`, and any
 * string value shaped like a JWT.
 */
export function stripTokenMaterial(claims: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(claims)) {
    if (TOKEN_LIKE_KEY.test(key) || key === 'code') continue;
    if (typeof value === 'string' && JWT_SHAPE.test(value)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = stripTokenMaterial(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export interface Identity {
  alias: string;
  sub: string;
  email?: string;
  name?: string;
}

/** Amazon configures sub=amazonAlias; prefer the explicit claim, fall back to sub. */
export function extractIdentity(claims: Record<string, unknown>, userinfo?: Record<string, unknown> | null): Identity {
  const merged: Record<string, unknown> = { ...(userinfo ?? {}), ...claims };
  const sub = str(claims.sub) ?? '';
  const alias = (str(merged.amazonAlias) ?? str(merged.amazon_alias) ?? sub).toLowerCase();

  const email = (str(merged.email) ?? str(merged.mail) ?? str(merged.upn))?.toLowerCase();
  const composedName = [str(merged.given_name), str(merged.family_name)].filter(Boolean).join(' ');
  const name = str(merged.name) ?? (composedName.length > 0 ? composedName : undefined) ?? str(merged.preferred_username);

  return { alias, sub, email, name };
}
