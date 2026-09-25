import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from '../_lib/env.js';
import { noStore, sendJson, sendMethodNotAllowed, sendUnavailable } from '../_lib/http.js';
import {
  CLAIM_LEASE_MS,
  channelNames,
  channelsToStore,
  claimProgress,
  forEachLimit,
  isReclaimable,
  neededParts,
  recipientsFor,
  reminderEmail,
  reminderKind,
  reminderNotification,
  reminderPart,
  reminderTitle,
  type ReminderKind,
  type ReminderRow,
} from '../_lib/reminders.js';
import { createAdminClient, type AdminClient } from '../_lib/supabaseAdmin.js';

/**
 * GET /api/cron/reminders — hourly (.github/workflows/reminders.yml; Vercel's own `crons`
 * cannot run hourly on the Hobby plan). Authenticated by `Authorization: Bearer CRON_SECRET`.
 * vercel.json gives it maxDuration 60.
 *
 * For every CONFIRMED booking starting within 24 hours ('24h') or one hour ('1h'), up to
 * five reminders at a time:
 *   1. claim the reminder: insert (booking_id, kind) into booking_reminders, ON CONFLICT DO
 *      NOTHING — only the run that claims it continues, so concurrent runs send once. A claim
 *      that is still empty or only partly delivered after 15 minutes (its run died, or a part
 *      failed) is taken over by one later run (a conditional update on `sent_at`);
 *   2. send what is still missing, all at once: an in-app notification per party (explicit id
 *      and created_at; every error checked) and, when RESEND_API_KEY is set, an e-mail per party
 *      (escaped HTML). On a take-over, reminder notifications already written count as sent;
 *   3. if nothing reached anyone, release the claim so the next run retries;
 *   4. record the channels (or, while a part is missing, the parts delivered) and, on the first
 *      delivery, a `reminder_sent` activity row.
 * Programme-managed mentors (placeholder .invalid addresses) receive nothing.
 * Response: { ok, reminders, emails, failures }.
 */
const CONCURRENCY = 5;

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

interface Outcome {
  reminders: number;
  emails: number;
  failures: number;
}

interface Claim {
  id: string;
  /** Parts delivered before this run. */
  before: Set<string>;
  resumed: boolean;
}

/** Claim a reminder, or take over a stale one. null = someone else has it, or it is done. */
async function claimReminder(admin: AdminClient, row: ReminderRow, kind: ReminderKind, now: number, out: Outcome): Promise<Claim | null> {
  const { data: inserted, error: claimError } = await admin
    .from('booking_reminders')
    .upsert({ booking_id: row.id, kind, channels: [] }, { onConflict: 'booking_id,kind', ignoreDuplicates: true })
    .select('id');
  if (claimError) {
    console.error('[reminders] claim failed', { booking: row.id, kind, code: claimError.code });
    out.failures += 1;
    return null;
  }
  const insertedId = (inserted as Array<{ id: string }> | null)?.[0]?.id;
  if (insertedId) return { id: insertedId, before: new Set(), resumed: false };

  const { data: existing, error: readError } = await admin
    .from('booking_reminders')
    .select('id, channels, sent_at')
    .eq('booking_id', row.id)
    .eq('kind', kind)
    .maybeSingle();
  if (readError) {
    console.error('[reminders] claim lookup failed', { booking: row.id, kind, code: readError.code });
    out.failures += 1;
    return null;
  }
  const current = existing as { id: string; channels: string[] | null; sent_at: string } | null;
  // Gone (released a moment ago), complete, or still within its run's lease.
  if (!current || !isReclaimable(current, now)) return null;

  const { data: taken, error: takeError } = await admin
    .from('booking_reminders')
    .update({ sent_at: new Date(now).toISOString() })
    .eq('id', current.id)
    .lt('sent_at', new Date(now - CLAIM_LEASE_MS).toISOString())
    .select('id');
  if (takeError) {
    console.error('[reminders] take-over failed', { booking: row.id, kind, code: takeError.code });
    out.failures += 1;
    return null;
  }
  if (!(taken as Array<{ id: string }> | null)?.length) return null; // another run took it first
  console.log(`[reminders] resuming a stale claim booking=${row.id} kind=${kind}`);
  return { id: current.id, before: claimProgress(current.channels).done, resumed: true };
}

async function processReminder(
  admin: AdminClient,
  row: ReminderRow,
  kind: ReminderKind,
  now: number,
  mail: { resendApiKey: string; mailFrom: string; appOrigin: string },
  out: Outcome,
): Promise<void> {
  const recipients = recipientsFor(row);
  if (recipients.length === 0) return;
  const claim = await claimReminder(admin, row, kind, now, out);
  if (!claim) return;

  const done = new Set(claim.before);
  if (claim.resumed) {
    // A run that died may have written some notifications before recording them.
    const { data: notes, error } = await admin
      .from('notifications')
      .select('recipient_email')
      .eq('booking_id', row.id)
      .eq('type', 'reminder')
      .eq('title', reminderTitle(kind));
    if (error) {
      console.error('[reminders] notification lookup failed', { booking: row.id, kind, code: error.code });
      out.failures += 1;
      return; // the claim stays stale and is retried by the next run
    }
    for (const note of (notes ?? []) as Array<{ recipient_email: string | null }>) {
      const r = recipients.find((x) => x.email === (note.recipient_email ?? '').trim().toLowerCase());
      if (r) done.add(reminderPart(r.type, 'in_app'));
    }
  }
  const fromEarlierRuns = new Set(done);

  const tasks: Array<Promise<void>> = [];
  for (const r of recipients) {
    if (!done.has(reminderPart(r.type, 'in_app'))) {
      const { title, message } = reminderNotification(kind, row, r);
      tasks.push(
        (async () => {
          const { error } = await admin.from('notifications').insert({
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
          if (error) {
            console.error('[reminders] notification insert failed', { booking: row.id, kind, code: error.code });
            out.failures += 1;
          } else {
            done.add(reminderPart(r.type, 'in_app'));
          }
        })(),
      );
    }
    if (mail.resendApiKey && !done.has(reminderPart(r.type, 'email'))) {
      const message = reminderEmail(kind, row, r, mail.appOrigin);
      tasks.push(
        (async () => {
          if (await sendEmail(mail.resendApiKey, mail.mailFrom, r.email, message.subject, message.html)) {
            out.emails += 1;
            done.add(reminderPart(r.type, 'email'));
          } else {
            console.error('[reminders] e-mail failed', { booking: row.id, kind, recipient: r.type });
            out.failures += 1;
          }
        })(),
      );
    }
  }
  await Promise.all(tasks);

  if (done.size === 0) {
    // Nobody was reached: give the reminder back so the next run tries again.
    const { error: releaseError } = await admin.from('booking_reminders').delete().eq('id', claim.id);
    if (releaseError) console.error('[reminders] could not release claim', { booking: row.id, kind, code: releaseError.code });
    return;
  }

  const channels = channelsToStore(done, neededParts(recipients, Boolean(mail.resendApiKey)));
  const { error: channelError } = await admin.from('booking_reminders').update({ channels }).eq('id', claim.id);
  if (channelError) console.error('[reminders] channel update failed', { booking: row.id, kind, code: channelError.code });

  const delivered = Array.from(done).filter((p) => !fromEarlierRuns.has(p));
  if (delivered.length === 0) return;
  out.reminders += 1;
  // A run that recorded progress also wrote the activity row; write it once, on the first delivery.
  if (claim.before.size > 0) return;

  const channelList = channelNames(done);
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

  const out: Outcome = { reminders: 0, emails: 0, failures: 0 };
  const due = ((data ?? []) as unknown as ReminderRow[])
    .map((row) => ({ row, kind: reminderKind(now, row.scheduled_at) }))
    .filter((d): d is { row: ReminderRow; kind: ReminderKind } => d.kind !== null);
  await forEachLimit(due, CONCURRENCY, ({ row, kind }) => processReminder(admin, row, kind, now, { resendApiKey, mailFrom, appOrigin }, out));

  sendJson(res, 200, { ok: true, ...out });
}
