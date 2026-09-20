import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * HMAC-signed, HttpOnly cookies for the OIDC round trip.
 *
 * Format: `v1.<base64url(payload json)>.<base64url(hmac-sha256)>`
 * The signing key is derived from AMAZON_OIDC_CLIENT_SECRET with HKDF so the
 * secret itself is never used directly as a MAC key, and rotating the client
 * secret automatically invalidates any in-flight cookies.
 */

export const OIDC_COOKIE = 'mc_oidc';
export const DEBUG_COOKIE = 'mc_oidc_debug';
export const COOKIE_PATH = '/api/auth';
export const OIDC_COOKIE_MAX_AGE = 600; // 10 minutes for the auth round trip
export const DEBUG_COOKIE_MAX_AGE = 900; // 15 minutes to read /api/auth/debug-claims

/** What the login handler stores in `mc_oidc` for the duration of one round trip. */
export interface OidcCookiePayload {
  st: string; // state
  nc: string; // nonce
  cv: string; // PKCE code verifier
  rt: string; // same-origin return path
  iat: number; // issued at (ms since epoch)
}

const VERSION = 'v1';
const KEY_INFO = 'mentorconnect/mc_oidc-cookie/v1';

export function deriveCookieKey(clientSecret: string): Buffer {
  const key = hkdfSync('sha256', clientSecret, 'mentorconnect-sso', KEY_INFO, 32);
  return Buffer.from(key);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function mac(key: Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export function signValue(key: Buffer, payload: unknown): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(mac(key, `${VERSION}.${body}`));
  return `${VERSION}.${body}.${sig}`;
}

/** Returns the parsed payload, or null when the value is absent, malformed or tampered with. */
export function verifyValue<T = unknown>(key: Buffer, value: string | undefined): T | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, body, sig] = parts;
  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = mac(key, `${VERSION}.${body}`);
    provided = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAge: number;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${opts.maxAge}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

export const BRIDGE_BIND_COOKIE = 'mc_sso_bind';
export const BRIDGE_BIND_MAX_AGE = 300;

/**
 * Readable by the SPA on purpose (not HttpOnly): /auth/sso compares it with
 * the `bind` value in the bridge fragment before redeeming the magic-link
 * token, so the token only works in the browser that completed OIDC.
 */
export function bridgeBindCookie(value: string): string {
  return [
    `${BRIDGE_BIND_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${BRIDGE_BIND_MAX_AGE}`,
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

export function expiredCookie(name: string): string {
  return [
    `${name}=`,
    `Path=${COOKIE_PATH}`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

/** Append Set-Cookie headers without clobbering ones already queued on the response. */
export function appendSetCookie(res: VercelResponse, ...cookies: string[]): void {
  const existing = res.getHeader('Set-Cookie');
  const list: string[] = Array.isArray(existing)
    ? [...existing]
    : typeof existing === 'string'
      ? [existing]
      : [];
  res.setHeader('Set-Cookie', [...list, ...cookies]);
}

export function clearAuthCookies(res: VercelResponse): void {
  appendSetCookie(res, expiredCookie(OIDC_COOKIE), expiredCookie(DEBUG_COOKIE));
}
