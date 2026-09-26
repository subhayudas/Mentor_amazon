/**
 * Cloudflare Turnstile server-side verification (siteverify).
 *
 * `verifyTurnstile` answers ok only when Cloudflare confirms the token; every other outcome
 * is a reason the caller maps to a response: `missing` (no token), `failed` (Cloudflare said
 * no), `hostname` (issued on a host outside the allow-list), `unavailable` (siteverify could
 * not be reached or answered garbage; callers fail closed). Tokens and secrets are never logged.
 */
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult = { ok: true } | { ok: false; reason: 'missing' | 'failed' | 'unavailable' | 'hostname' };

export interface VerifyOptions {
  /** TURNSTILE_SECRET_KEY. */
  secret: string;
  /** Hostnames a valid token may have been issued on; empty or undefined = any. */
  allowedHostnames?: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** 'a.example, b.example' → ['a.example', 'b.example'] (lower case, blanks dropped). */
export function parseHostnames(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export async function verifyTurnstile(token: string | undefined | null, ip: string | undefined, opts: VerifyOptions): Promise<TurnstileResult> {
  const response = typeof token === 'string' ? token.trim() : '';
  if (!response) return { ok: false, reason: 'missing' };

  const form = new URLSearchParams({ secret: opts.secret, response });
  if (ip && ip !== 'unknown') form.set('remoteip', ip);

  let data: { success?: unknown; hostname?: unknown };
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'unavailable' };
  if (data.success !== true) return { ok: false, reason: 'failed' };

  const allowed = opts.allowedHostnames ?? [];
  if (allowed.length > 0) {
    const host = typeof data.hostname === 'string' ? data.hostname.toLowerCase() : '';
    if (!allowed.includes(host)) return { ok: false, reason: 'hostname' };
  }
  return { ok: true };
}
