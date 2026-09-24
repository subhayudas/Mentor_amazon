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

/**
 * 503 for a route that cannot serve right now (missing server env, migration not applied).
 * Deliberately names nothing: the caller logs the details with console.error.
 */
export function sendUnavailable(res: VercelResponse): void {
  sendJson(res, 503, { error: 'unavailable' });
}

export type RawBody = { ok: true; body: Buffer } | { ok: false; reason: 'too_large' };

/**
 * Read the raw request body from the stream, refusing more than `limitBytes` (checked on the
 * declared content-length first, then on the bytes actually received). `req.body` is never
 * touched, so signature checks see exactly the bytes that were sent.
 */
export async function readRawBody(req: VercelRequest, limitBytes: number): Promise<RawBody> {
  const declared = Number(req.headers['content-length'] ?? '');
  if (Number.isFinite(declared) && declared > limitBytes) return { ok: false, reason: 'too_large' };
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > limitBytes) return { ok: false, reason: 'too_large' };
    chunks.push(buf);
  }
  return { ok: true, body: Buffer.concat(chunks) };
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

export type SsoErrorCode = 'sso_state' | 'sso_token' | 'sso_failed' | 'sso_denied';

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
