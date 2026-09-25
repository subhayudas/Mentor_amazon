import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { readEnv } from './_lib/env.js';
import { noStore, readRawBody, sendJson, sendMethodNotAllowed, sendUnavailable } from './_lib/http.js';
import { clientIp, enforceRateLimit, type RateLimitRule } from './_lib/ratelimit.js';
import { createAdminClient } from './_lib/supabaseAdmin.js';
import { parseHostnames, verifyTurnstile } from './_lib/turnstile.js';

/**
 * POST /api/requests — an anonymous mentorship request (design §3.4).
 *
 * Body (application/json, ≤ 16 KiB):
 *   { mentorId: uuid, name: 1..120, email: ≤ 254, goal: 20..1000 (trimmed), turnstileToken?: ≤ 2048 }
 * Checks, in order: method (405) → size (413) and content type (415) → validation (400
 * { error: 'invalid_request', fields }) → IP limit, 10 per 10 minutes (429 + Retry-After) →
 * Turnstile when TURNSTILE_SECRET_KEY is set (403 captcha_failed / 503 captcha_unavailable;
 * a site key without its secret fails closed with 503; in Production, VERCEL_ENV=production,
 * no keys at all also fails closed with 503 captcha_unavailable unless TURNSTILE_DISABLED=1
 * is set, which is logged on every request) → server env (503) → the
 * create_booking_request RPC under the service role, which validates again, dedupes a pending
 * request, rate-limits per mentee and mentor, and notifies the mentor (or every admin for a
 * programme-managed mentor).
 * Success is 200 { ok: true } whether the request was created or was already pending, so the
 * endpoint never reveals whether someone has an open request. A request under the mentor's own
 * address (42501 not_allowed, detail self_request) creates nothing but also answers 200: a
 * distinct status would tell anyone which address belongs to which mentor, and mentor e-mails
 * are never public. Responses never name env vars.
 * Signed-in visitors use the create_my_booking_request RPC instead.
 */
export const MAX_BODY_BYTES = 16 * 1024;
export const REQUESTS_RULE: RateLimitRule = { name: 'booking-requests', limit: 10, windowSeconds: 600 };

export const requestSchema = z.object({
  mentorId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254).email(),
  goal: z.string().trim().min(20).max(1000),
  turnstileToken: z.string().max(2048).optional(),
});

const RPC_FIELD: Record<string, string> = { invalid_email: 'email', invalid_name: 'name', invalid_goal: 'goal' };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, ['POST']);
    return;
  }

  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  const declared = Number(req.headers['content-length'] ?? '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    sendJson(res, 413, { error: 'payload_too_large' });
    return;
  }
  if (!contentType.startsWith('application/json')) {
    sendJson(res, 415, { error: 'unsupported_media_type' });
    return;
  }
  const raw = await readRawBody(req, MAX_BODY_BYTES);
  if (!raw.ok) {
    sendJson(res, 413, { error: 'payload_too_large' });
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.body.toString('utf8'));
  } catch {
    json = undefined;
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    const fields = Array.from(new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'body'))));
    sendJson(res, 400, { error: 'invalid_request', fields });
    return;
  }
  const input = parsed.data;

  if (!(await enforceRateLimit(req, res, REQUESTS_RULE))) return;

  const turnstileEnv = readEnv([
    'turnstileSecret',
    'turnstileSiteKey',
    'turnstileAllowedHostnames',
    'turnstileDisabled',
    'vercelEnv',
  ] as const);
  const turnstile = turnstileEnv.ok
    ? turnstileEnv.env
    : { turnstileSecret: '', turnstileSiteKey: '', turnstileAllowedHostnames: '', turnstileDisabled: '', vercelEnv: '' };
  if (turnstile.turnstileSecret) {
    const verdict = await verifyTurnstile(input.turnstileToken, clientIp(req), {
      secret: turnstile.turnstileSecret,
      allowedHostnames: parseHostnames(turnstile.turnstileAllowedHostnames),
    });
    if (!verdict.ok) {
      if (verdict.reason === 'unavailable') {
        console.error('[requests] Turnstile siteverify unreachable; refusing the request');
        sendJson(res, 503, { error: 'captcha_unavailable' });
      } else {
        sendJson(res, 403, { error: 'captcha_failed' });
      }
      return;
    }
  } else if (turnstile.turnstileSiteKey) {
    console.error('[requests] TURNSTILE_SECRET_KEY missing while the site key is set; refusing requests');
    sendUnavailable(res);
    return;
  } else if (turnstile.vercelEnv === 'production') {
    // No captcha keys at all is the local-development mode; Production never falls into it by
    // accident. Only an explicit TURNSTILE_DISABLED=1 lets anonymous requests through here.
    if (turnstile.turnstileDisabled !== '1') {
      console.error(
        '[requests] TURNSTILE_SECRET_KEY is not set in Production; refusing anonymous requests. ' +
          'Set TURNSTILE_SECRET_KEY and VITE_TURNSTILE_SITE_KEY, or TURNSTILE_DISABLED=1 to accept requests without a captcha.',
      );
      sendJson(res, 503, { error: 'captcha_unavailable' });
      return;
    }
    console.warn('[requests] TURNSTILE_DISABLED=1: accepting an anonymous request in Production without a captcha');
  }

  const env = readEnv(['supabaseUrl', 'supabaseServiceRoleKey'] as const);
  if (!env.ok) {
    console.error('[requests] server env missing:', env.missing.join(', '));
    sendUnavailable(res);
    return;
  }

  const admin = createAdminClient(env.env.supabaseUrl, env.env.supabaseServiceRoleKey);
  const { error } = await admin.rpc('create_booking_request', {
    p_mentor_id: input.mentorId.toLowerCase(),
    p_email: input.email,
    p_name: input.name,
    p_goal: input.goal,
  });
  if (!error) {
    sendJson(res, 200, { ok: true });
    return;
  }
  const code = error.code ?? '';
  const message = error.message ?? '';
  const details = (error as { details?: string | null }).details ?? '';
  if (code === '22023') {
    sendJson(res, 400, { error: 'invalid_request', fields: RPC_FIELD[message] ? [RPC_FIELD[message]] : [] });
  } else if (code === '42501' && message.includes('mentor_unavailable')) {
    sendJson(res, 422, { error: 'mentor_unavailable' });
  } else if (code === '42501' && message.includes('not_allowed') && details.includes('self_request')) {
    console.error('[requests] refused a request addressed to the mentor themselves');
    sendJson(res, 200, { ok: true });
  } else if (code === 'P0001') {
    sendJson(res, 429, { error: 'rate_limited' });
  } else if (code === 'PGRST202') {
    console.error('[requests] create_booking_request is missing: apply migrations/0002_production_readiness.sql');
    sendUnavailable(res);
  } else {
    console.error('[requests] create_booking_request failed', { code });
    sendJson(res, 500, { error: 'server_error' });
  }
}
