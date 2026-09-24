import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from '../_lib/env.js';
import { noStore, sendJson, sendMethodNotAllowed, sendUnavailable } from '../_lib/http.js';
import {
  recipientsFor,
  reminderEmail,
  reminderKind,
  reminderNotification,
  type ReminderRow,
} from '../_lib/reminders.js';
import { createAdminClient } from '../_lib/supabaseAdmin.js';

/**
 * GET /api/cron/reminders — hourly (.github/workflows/reminders.yml; Vercel's own `crons`
 * cannot run hourly on the Hobby plan). Authenticated by `Authorization: Bearer CRON_SECRET`.
 *
 * For every CONFIRMED booking starting within 24 hours ('24h') or one hour ('1h'):
 *   1. claim the reminder: insert (booking_id, kind) into booking_reminders, ON CONFLICT DO
 *      NOTHING — only the run that claims it continues, so concurrent runs send once;
 *   2. write an in-app notification per party (explicit id and created_at; every error checked);
 *   3. when RESEND_API_KEY is set, e-mail each party (escaped HTML);
 *   4. if nothing reached anyone, release the claim so the next run retries;
 *   5. record the channels and a `reminder_sent` activity row.
 * Programme-managed mentors (placeholder .invalid addresses) receive nothing.
 * Response: { ok, reminders, emails, failures }.
 */
async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function bearerMatches(header: string | string[] | undefined, secret: string): boolean {
  const value = Array.isArray(header) ? header[0] : header;
  const given = Buffer.from(value ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendMethodNotAllowed(res, ['GET', 'POST']);
    return;
  }
  const envResult = readEnv(['cronSecret', 'supabaseUrl', 'supabaseServiceRoleKey', 'resendApiKey', 'mailFrom', 'appOrigin'] as const);
  if (!envResult.ok) {
    console.error('[reminders] server env missing:', envResult.missing.join(', '));
    sendUnavailable(res);
    return;
  }
  const { cronSecret, resendApiKey, mailFrom, appOrigin } = envResult.env;
  if (!bearerMatches(req.headers.authorization, cronSecret)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  const admin = createAdminClient(envResult.env.supabaseUrl, envResult.env.supabaseServiceRoleKey);
  const now = Date.now();
  const { data, error } = await admin
    .from('bookings')
    .select('id, scheduled_at, goal, mentor:mentors(id, name, email), mentee:mentees(id, name, email)')
    .eq('status', 'confirmed')
    .gt('scheduled_at', new Date(now).toISOString())
    .lte('scheduled_at', new Date(now + 24 * 60 * 60 * 1000).toISOString());
  if (error) {
    console.error('[reminders] booking query failed', { code: error.code });
    sendJson(res, 500, { error: 'server_error' });
    return;
  }

  let reminders = 0;
  let emails = 0;
  let failures = 0;
  for (const row of (data ?? []) as unknown as ReminderRow[]) {
    const kind = reminderKind(now, row.scheduled_at);
    if (!kind) continue;

    const { data: claimed, error: claimError } = await admin
      .from('booking_reminders')
      .upsert({ booking_id: row.id, kind, channels: [] }, { onConflict: 'booking_id,kind', ignoreDuplicates: true })
      .select('id');
    if (claimError) {
      console.error('[reminders] claim failed', { booking: row.id, kind, code: claimError.code });
      failures += 1;
      continue;
    }
    const claimId = (claimed as Array<{ id: string }> | null)?.[0]?.id;
    if (!claimId) continue; // another run (or an earlier one) owns this reminder

    const channels = new Set<string>();
    const recipients = recipientsFor(row);
    for (const r of recipients) {
      const { title, message } = reminderNotification(kind, row, r);
      const { error: notifyError } = await admin.from('notifications').insert({
        id: randomUUID(),
        recipient_email: r.email,
        recipient_type: r.type,
        type: 'reminder',
        title,
        message,
        booking_id: row.id,
        is_read: false,
        created_at: new Date().toISOString(),
      });
      if (notifyError) {
        console.error('[reminders] notification insert failed', { booking: row.id, kind, code: notifyError.code });
        failures += 1;
      } else {
        channels.add('in_app');
      }
      if (resendApiKey) {
        const mail = reminderEmail(kind, row, r, appOrigin);
        if (await sendEmail(resendApiKey, mailFrom, r.email, mail.subject, mail.html)) {
          emails += 1;
          channels.add('email');
        } else {
          console.error('[reminders] e-mail failed', { booking: row.id, kind, recipient: r.type });
          failures += 1;
        }
      }
    }

    if (channels.size === 0) {
      // Nobody was reached: give the reminder back so the next run tries again.
      const { error: releaseError } = await admin.from('booking_reminders').delete().eq('id', claimId);
      if (releaseError) console.error('[reminders] could not release claim', { booking: row.id, kind, code: releaseError.code });
      continue;
    }

    const channelList = Array.from(channels);
    const { error: channelError } = await admin.from('booking_reminders').update({ channels: channelList }).eq('id', claimId);
    if (channelError) console.error('[reminders] channel update failed', { booking: row.id, kind, code: channelError.code });
    const { error: activityError } = await admin.from('activity_events').insert({
      id: randomUUID(),
      actor_type: 'system',
      actor_id: null,
      actor_name: null,
      type: 'reminder_sent',
      subject_type: 'booking',
      subject_id: row.id,
      visible_to: [row.mentor?.id, row.mentee?.id].filter((v): v is string => Boolean(v)),
      summary: `${kind === '1h' ? '1-hour' : '24-hour'} reminder sent (${channelList.join(', ')})`,
      meta: { source: 'cron', kind, channels: channelList, booking_id: row.id },
      created_at: new Date().toISOString(),
    });
    if (activityError) console.error('[reminders] activity insert failed', { booking: row.id, kind, code: activityError.code });
    reminders += 1;
  }

  sendJson(res, 200, { ok: true, reminders, emails, failures });
}
