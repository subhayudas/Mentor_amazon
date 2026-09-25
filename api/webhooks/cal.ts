import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  normalizeCalEvent,
  parseMentorParam,
  parseSignatureHeader,
  recordId,
  deliveryId,
  sha256Hex,
  verifyHmac,
} from '../_lib/calWebhook.js';
import { readEnv } from '../_lib/env.js';
import { noStore, queryParam, readRawBody, sendJson, sendMethodNotAllowed, sendUnavailable } from '../_lib/http.js';
import { enforceRateLimit, type RateLimitRule } from '../_lib/ratelimit.js';
import { createAdminClient } from '../_lib/supabaseAdmin.js';

/**
 * POST /api/webhooks/cal[?mentor=<uuid>] — Cal.com booking webhooks (design §3.3, §3.4).
 *
 * Each mentor connects their own Cal.com account from the "Cal.com booking sync" panel:
 * subscriber URL `https://<app>/api/webhooks/cal?mentor=<their mentor id>` and the secret the
 * panel shows (mentor_cal_webhooks; the previous secret keeps working for 24 h after a
 * rotation). Without `?mentor=`, the optional global CAL_WEBHOOK_SECRET verifies a programme
 * Cal.com Team/Org webhook. Leave Cal.com's "Custom payload template" empty.
 *
 * Checks, in order: method (405) → body ≤ 256 KiB (413) → `?mentor=` shape and signature
 * header shape (401, no database call) → server env (503) → HMAC-SHA256 of the raw body
 * against the candidate secrets in constant time (401, the same answer for an unknown mentor,
 * a missing secret or a wrong one; repeated failures from one IP → 429) → JSON (400).
 * Only deliveries that fail the signature check are ever rate-limited: Cal.com sends every
 * mentor's webhooks from shared egress IPs and does not retry, so a limit counted before the
 * check would let anyone's failing webhooks get real deliveries refused. A delivery whose
 * signature verifies is never answered 429.
 * Deliveries that change no booking (PING, unsupported trigger, unreadable payload) are logged
 * with cal_record_delivery and answered 200. Booking events go to cal_apply_event, which
 * applies the whole change in one transaction: exact matching (Cal uid, reschedule uid,
 * cross-checked metadata.mc_booking, then a unique attendee email), the transition table,
 * reminders reset and notifications. A booking made directly on Cal.com is recorded as
 * `unmatched_direct_booking`; nothing is ever inserted into bookings here. Replays answer
 * `duplicate`. Logs carry the mentor id, trigger and outcome only (never secrets or emails).
 * `req.body` is never read, so the raw bytes stay exactly as Cal.com signed them.
 */
export const MAX_BODY_BYTES = 256 * 1024;
/** Failed signature checks per IP per minute before those failures are answered 429. */
export const FAIL_LIMIT: RateLimitRule = { name: 'cal-webhook-fail', limit: 30, windowSeconds: 60 };

type SecretRow = { secret: string; previous_secret: string | null; previous_valid_until: string | null };

function logOutcome(mentorId: string | null, trigger: string, outcome: string): void {
  console.log(`[cal-webhook] mentor=${mentorId ?? 'global'} trigger=${trigger || 'none'} outcome=${outcome}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, ['POST']);
    return;
  }

  const raw = await readRawBody(req, MAX_BODY_BYTES);
  if (!raw.ok) {
    sendJson(res, 413, { error: 'payload_too_large' });
    return;
  }

  const mentorId = parseMentorParam(queryParam(req, 'mentor'));
  const signature = parseSignatureHeader(req.headers['x-cal-signature-256']);
  if (mentorId === false || !signature) {
    sendJson(res, 401, { error: 'invalid_signature' });
    return;
  }

  const env =readEnv(['supabaseUrl', 'supabaseServiceRoleKey'] as const);
  if (!env.ok) {
    console.error('[cal-webhook] server env missing:', env.missing.join(', '));
    sendUnavailable(res);
    return;
  }
  const admin = createAdminClient(env.env.supabaseUrl, env.env.supabaseServiceRoleKey);

  const secrets: string[] = [];
  if (mentorId) {
    const { data, error } = await admin
      .from('mentor_cal_webhooks')
      .select('secret, previous_secret, previous_valid_until')
      .eq('mentor_id', mentorId)
      .maybeSingle();
    if (error) {
      // A failed lookup is never treated as "no such webhook".
      console.error('[cal-webhook] secret lookup failed', { mentor: mentorId, code: error.code });
      if (error.code === 'PGRST205' || error.code === '42P01') sendUnavailable(res);
      else sendJson(res, 500, { error: 'server_error' });
      return;
    }
    const row = data as SecretRow | null;
    if (row?.secret) secrets.push(row.secret);
    if (row?.previous_secret && row.previous_valid_until && new Date(row.previous_valid_until).getTime() > Date.now()) {
      secrets.push(row.previous_secret);
    }
  } else {
    const global = readEnv(['calWebhookSecret'] as const);
    if (!global.ok) console.error('[cal-webhook] CAL_WEBHOOK_SECRET is set but invalid (at least 16 characters); global deliveries are refused');
    else if (global.env.calWebhookSecret) secrets.push(global.env.calWebhookSecret);
  }

  if (!verifyHmac(raw.body, signature, secrets)) {
    if (!(await enforceRateLimit(req, res, FAIL_LIMIT))) return;
    sendJson(res, 401, { error: 'invalid_signature' });
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.body.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'invalid_json' });
    return;
  }

  const payloadSha256 = sha256Hex(raw.body);
  const normalized = normalizeCalEvent(json);
  if (normalized.kind !== 'event') {
    const outcome =
      normalized.kind === 'ping' ? 'ping' : normalized.kind === 'ignored' ? 'ignored' : normalized.kind === 'invalid' ? 'invalid_payload' : 'unrecognised_payload';
    const { data, error } = await admin.rpc('cal_record_delivery', {
      p_delivery_id: recordId(mentorId, normalized.trigger, payloadSha256),
      p_mentor_id: mentorId,
      p_trigger: normalized.trigger,
      p_outcome: outcome,
      p_payload_sha256: payloadSha256,
    });
    if (error) {
      console.error('[cal-webhook] cal_record_delivery failed', { mentor: mentorId, trigger: normalized.trigger, code: error.code });
      sendJson(res, 500, { error: 'server_error' });
      return;
    }
    const recorded = (data as { outcome?: string } | null)?.outcome ?? outcome;
    logOutcome(mentorId, normalized.trigger, recorded);
    sendJson(res, 200, { ok: true, outcome: recorded });
    return;
  }

  const e = normalized.event;
  const { data, error } = await admin.rpc('cal_apply_event', {
    p_delivery_id: deliveryId(mentorId, e),
    p_mentor_id: mentorId,
    p_trigger: e.trigger,
    p_uid: e.uid,
    p_reschedule_uid: e.rescheduleUid,
    p_start: e.startIso,
    p_end: e.endIso,
    p_status: e.status,
    p_attendee_emails: e.attendeeEmails,
    p_mc_booking: e.mcBooking,
    p_organizer_username: e.organizerUsername,
    p_reason: e.reason,
    p_payload_sha256: payloadSha256,
  });
  if (error) {
    console.error('[cal-webhook] cal_apply_event failed', { mentor: mentorId, trigger: e.trigger, code: error.code });
    sendJson(res, 500, { error: 'server_error' });
    return;
  }
  const outcome = (data as { outcome?: string } | null)?.outcome ?? 'unknown';
  logOutcome(mentorId, e.trigger, outcome);
  sendJson(res, 200, { ok: true, outcome });
}
