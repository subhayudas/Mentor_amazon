import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readEnv } from '../_lib/env.js';
import { noStore, sendJson, sendMethodNotAllowed, sendMisconfigured } from '../_lib/http.js';
import { RULES, enforceRateLimit } from '../_lib/ratelimit.js';
import { createAdminClient } from '../_lib/supabaseAdmin.js';

/**
 * POST /api/webhooks/cal — Cal.com booking webhooks.
 *
 * Cal.com signs every delivery with HMAC-SHA256 of the raw body under the
 * webhook's secret (`X-Cal-Signature-256`). The signature is verified in
 * constant time before anything is parsed; a bad or missing signature is a
 * 401 and nothing is stored.
 *
 * Handles BOOKING_CREATED, BOOKING_RESCHEDULED and BOOKING_CANCELLED:
 *   - the matching MentorConnect booking is found by Cal's booking uid
 *     (`bookings.cal_event_uri`), else by mentor (the organizer's Cal.com
 *     username matches `mentors.cal_link`) + attendee email on the newest
 *     open request; if none exists a confirmed booking is created, so a
 *     session booked directly on cal.com still reaches the app;
 *   - the booking becomes confirmed with the slot (created / rescheduled)
 *     or canceled;
 *   - an activity event is appended for both parties.
 *
 * Idempotent: each delivery id (trigger + uid + payload updated-at) is
 * recorded in `cal_webhook_events`; a replay answers 200 without touching
 * the booking again.
 *
 * Configure in Cal.com: Settings → Developer → Webhooks → subscriber URL
 * `https://<app>/api/webhooks/cal`, secret = `CAL_WEBHOOK_SECRET`.
 */
type CalPayload = {
  triggerEvent?: string;
  createdAt?: string;
  payload?: {
    uid?: string;
    startTime?: string;
    endTime?: string;
    title?: string;
    organizer?: { username?: string; email?: string; name?: string };
    attendees?: { email?: string; name?: string }[];
    responses?: { email?: { value?: string } | string; name?: { value?: string } | string };
    metadata?: Record<string, unknown>;
    updatedAt?: string;
    cancellationReason?: string;
  };
};

// @vercel/node reads the body for `req.body` and then restores the stream, so the raw bytes are still readable here.
async function rawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export function verifySignature(body: string, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const given = header.trim().toLowerCase().replace(/^sha256=/, '');
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
}

function responseValue(v: { value?: string } | string | undefined): string | undefined {
  if (!v) return undefined;
  return typeof v === 'string' ? v : v.value;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, ['POST']);
    return;
  }
  if (!(await enforceRateLimit(req, res, RULES.calWebhook))) return;

  const envResult = readEnv(['calWebhookSecret', 'supabaseUrl', 'supabaseServiceRoleKey'] as const);
  if (!envResult.ok) {
    sendMisconfigured(res, envResult.missing);
    return;
  }
  const { calWebhookSecret } = envResult.env;

  const body = await rawBody(req);
  const signature = req.headers['x-cal-signature-256'];
  if (!verifySignature(body, Array.isArray(signature) ? signature[0] : signature, calWebhookSecret)) {
    sendJson(res, 401, { error: 'invalid_signature' });
    return;
  }

  let event: CalPayload;
  try {
    event = JSON.parse(body) as CalPayload;
  } catch {
    sendJson(res, 400, { error: 'invalid_json' });
    return;
  }
  const trigger = event.triggerEvent ?? '';
  const p = event.payload ?? {};
  if (trigger === 'PING') {
    sendJson(res, 200, { ok: true, ping: true });
    return;
  }
  if (!['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'].includes(trigger) || !p.uid) {
    sendJson(res, 200, { ok: true, ignored: trigger || 'unknown' });
    return;
  }

  const admin = createAdminClient(envResult.env.supabaseUrl, envResult.env.supabaseServiceRoleKey);
  const deliveryId = `${trigger}:${p.uid}:${p.updatedAt ?? event.createdAt ?? ''}`;

  // Idempotency: the primary key makes a replay a no-op.
  const { error: dupError } = await admin.from('cal_webhook_events').insert({ id: deliveryId, trigger, booking_uid: p.uid, outcome: 'processing' });
  if (dupError) {
    if (dupError.code === '23505') {
      sendJson(res, 200, { ok: true, duplicate: true });
      return;
    }
    console.error('[cal-webhook] could not record delivery', dupError.message);
    sendJson(res, 500, { error: 'store_unavailable' });
    return;
  }

  const attendeeEmail = (p.attendees?.[0]?.email ?? responseValue(p.responses?.email) ?? '').toLowerCase();
  const attendeeName = p.attendees?.[0]?.name ?? responseValue(p.responses?.name) ?? attendeeEmail;
  const organizerUser = (p.organizer?.username ?? '').toLowerCase();

  type BookingRow = { id: string; mentor_id: string; mentee_id: string; status: string };
  // 1. By Cal uid.
  let booking = ((await admin.from('bookings').select('id, mentor_id, mentee_id, status').eq('cal_event_uri', p.uid).maybeSingle()).data as BookingRow | null) ?? null;

  // 2. By mentor (organizer's Cal username ↔ mentors.cal_link) + attendee email, newest open request.
  let mentorId: string | null = booking?.mentor_id ?? null;
  if (!booking && organizerUser) {
    const { data: mentors } = await admin.from('mentors').select('id, cal_link, name').ilike('cal_link', `${organizerUser}%`).limit(5);
    mentorId = mentors?.[0]?.id ?? null;
    if (mentorId && attendeeEmail) {
      const { data: mentee } = await admin.from('mentees').select('id').ilike('email', attendeeEmail).maybeSingle();
      if (mentee?.id) {
        const { data: open } = await admin
          .from('bookings')
          .select('id, mentor_id, mentee_id, status')
          .eq('mentor_id', mentorId)
          .eq('mentee_id', mentee.id)
          .in('status', ['pending', 'accepted'])
          .order('created_at', { ascending: false })
          .limit(1);
        booking = ((open?.[0] as BookingRow | undefined) ?? null);
        // 3. No open request: the session was booked straight on cal.com — create it.
        if (!booking && trigger !== 'BOOKING_CANCELLED') {
          const { data: created } = await admin
            .from('bookings')
            .insert({ mentor_id: mentorId, mentee_id: mentee.id, status: 'confirmed', scheduled_at: p.startTime, cal_event_uri: p.uid, goal: p.title ?? 'Mentoring session' })
            .select('id, mentor_id, mentee_id, status')
            .single();
          booking = ((created as BookingRow | null) ?? null);
        }
      }
    }
  }

  let outcome = 'unmatched';
  if (booking) {
    const patch =
      trigger === 'BOOKING_CANCELLED'
        ? { status: 'canceled', canceled_at: new Date().toISOString(), cal_event_uri: p.uid }
        : { status: 'confirmed', scheduled_at: p.startTime, cal_event_uri: p.uid };
    const { error } = await admin.from('bookings').update(patch).eq('id', booking.id);
    outcome = error ? `update_failed:${error.message}` : trigger.toLowerCase();
    if (!error) {
      const type = trigger === 'BOOKING_CANCELLED' ? 'booking_canceled' : trigger === 'BOOKING_RESCHEDULED' ? 'booking_rescheduled' : 'booking_confirmed';
      const when = p.startTime ? new Date(p.startTime).toISOString() : '';
      await admin.from('activity_events').insert({
        actor_type: 'system',
        actor_name: attendeeName,
        type,
        subject_type: 'booking',
        subject_id: booking.id,
        visible_to: [booking.mentor_id, booking.mentee_id],
        summary:
          type === 'booking_canceled'
            ? `Session cancelled on Cal.com${p.cancellationReason ? ` — ${p.cancellationReason}` : ''}`
            : `${type === 'booking_rescheduled' ? 'Rescheduled' : 'Confirmed'} on Cal.com for ${when}`,
        meta: { cal_uid: p.uid, trigger },
      });
    }
  } else {
    console.warn('[cal-webhook] no matching booking', { trigger, uid: p.uid, organizerUser, attendeeEmail: attendeeEmail ? 'present' : 'absent' });
  }

  await admin.from('cal_webhook_events').update({ outcome }).eq('id', deliveryId);
  sendJson(res, 200, { ok: true, outcome });
}
