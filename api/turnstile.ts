import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from './_lib/env.js';
import { noStore, sendJson, sendMethodNotAllowed } from './_lib/http.js';
import { RULES, clientIp, enforceRateLimit } from './_lib/ratelimit.js';

/**
 * POST /api/turnstile — verifies a Cloudflare Turnstile token for the public
 * session-request form. Body: `{ token }`. Answers `{ ok: true }` when
 * Cloudflare confirms the token (or when Turnstile is not configured, so a
 * deployment without the keys keeps working), `{ ok: false }` otherwise.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, ['POST']);
    return;
  }
  if (!(await enforceRateLimit(req, res, RULES.turnstile))) return;

  const env = readEnv(['turnstileSecret'] as const);
  const secret = env.ok ? env.env.turnstileSecret : '';
  if (!secret) {
    sendJson(res, 200, { ok: true, configured: false });
    return;
  }

  const token = typeof req.body === 'object' && req.body ? String((req.body as { token?: unknown }).token ?? '') : '';
  if (!token) {
    sendJson(res, 400, { ok: false, error: 'missing_token' });
    return;
  }
  try {
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: clientIp(req) }),
    });
    const result = (await verify.json()) as { success?: boolean; 'error-codes'?: string[] };
    sendJson(res, result.success ? 200 : 403, { ok: Boolean(result.success), configured: true, errors: result['error-codes'] ?? [] });
  } catch {
    sendJson(res, 502, { ok: false, error: 'verify_unavailable' });
  }
}
