import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Small response helpers shared by the auth functions. Every response goes
 * through one of these so `Cache-Control: no-store` is never forgotten.
 */

export function noStore(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  noStore(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function sendRedirect(res: VercelResponse, location: string): void {
  noStore(res);
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

export function sendMisconfigured(res: VercelResponse, missing: string[]): void {
  sendJson(res, 500, { error: 'server_misconfigured', missing });
}

export function sendMethodNotAllowed(res: VercelResponse, allow: string[]): void {
  res.setHeader('Allow', allow.join(', '));
  sendJson(res, 405, { error: 'method_not_allowed' });
}

/** Parse the request URL once; Vercel's `req.query` helper is not relied on. */
export function requestUrl(req: VercelRequest): URL {
  return new URL(req.url ?? '/', 'http://localhost');
}

export function queryParam(req: VercelRequest, name: string): string | undefined {
  const value = requestUrl(req).searchParams.get(name);
  return value === null || value === '' ? undefined : value;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * Only same-origin absolute paths are accepted as post-login targets: must
 * start with a single '/', never '//' (protocol-relative) or a backslash
 * trick, and never contain a fragment (the bridge adds its own).
 */
export function safeReturnTo(value: string | undefined, fallback = '/'): string {
  if (!value) return fallback;
  if (value.length > 512) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (CONTROL_CHARS.test(value)) return fallback;
  const withoutFragment = value.split('#')[0];
  return withoutFragment.length > 0 ? withoutFragment : fallback;
}

export type SsoErrorCode = 'sso_state' | 'sso_token' | 'sso_failed';

/**
 * Build the login-page error URL. `reason` is a short machine code appended
 * only when debug mode is on so the team can tell failures apart on integ
 * without ever exposing internals in production.
 */
export function loginErrorUrl(appOrigin: string, code: SsoErrorCode, reason?: string, debug = false): string {
  const url = new URL('/login', appOrigin);
  url.searchParams.set('error', code);
  if (debug && reason) url.searchParams.set('reason', reason.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 64));
  return url.toString();
}

/** Structured, token-free log line. Only aliases and outcome codes go in here. */
export function logSso(event: string, fields: Record<string, string | number | boolean | undefined> = {}): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  console.log(`[sso] ${event}${parts.length ? ' ' + parts.join(' ') : ''}`);
}
