import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from '../_lib/env.js';
import { noStore, sendJson, sendMisconfigured } from '../_lib/http.js';
import { createAdminClient } from '../_lib/supabaseAdmin.js';

/**
 * GET /api/cron/reminders — hourly (vercel.json `crons`).
 *
 * For every confirmed booking that starts in the next 24 hours (24h
 * reminder) or the next hour (1h reminder) and has not had that reminder
 * yet, writes an in-app notification for the mentor and the mentee and,
 * when `RESEND_API_KEY` is set, sends the email. One row per
 * (booking, kind) in `booking_reminders` keeps it idempotent across runs.
 *
 * Authenticated by Vercel's cron header (`Authorization: Bearer CRON_SECRET`).
 */
type Row = {
  id: string;
  scheduled_at: string;
  goal: string | null;
  mentor: { id: string; name: string; email: string | null } | null;
  mentee: { id: string; name: string; email: string } | null;
};

async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  const envResult = readEnv(['cronSecret', 'supabaseUrl', 'supabaseServiceRoleKey', 'resendApiKey', 'mailFrom', 'appOrigin'] as const);
  if (!envResult.ok) {
    sendMisconfigured(res, envResult.missing);
    return;
  }
  const { cronSecret, resendApiKey, mailFrom, appOrigin } = envResult.env;
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  const admin = createAdminClient(envResult.env.supabaseUrl, envResult.env.supabaseServiceRoleKey);
  const now = Date.now();
  const horizon = new Date(now + 25 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('bookings')
    .select('id, scheduled_at, goal, mentor:mentors(id, name, email), mentee:mentees(id, name, email)')
    .in('status', ['accepted', 'confirmed'])
    .gte('scheduled_at', new Date(now).toISOString())
    .lte('scheduled_at', horizon);
  if (error) {
    sendJson(res, 500, { error: 'query_failed', detail: error.message });
    return;
  }

  const { data: sentRows } = await admin.from('booking_reminders').select('booking_id, kind');
  const sent = new Set((sentRows ?? []).map((r: { booking_id: string; kind: string }) => `${r.booking_id}:${r.kind}`));

  let written = 0;
  let emailed = 0;
  for (const row of (data ?? []) as unknown as Row[]) {
    const minutesAway = (new Date(row.scheduled_at).getTime() - now) / 60_000;
    const kind: '24h' | '1h' | null = minutesAway <= 60 ? '1h' : minutesAway <= 24 * 60 ? '24h' : null;
    if (!kind || sent.has(`${row.id}:${kind}`)) continue;

    const when = new Date(row.scheduled_at).toUTCString();
    const channels: string[] = ['in_app'];
    const recipients = [
      row.mentor?.email ? { email: row.mentor.email, type: 'mentor' as const, name: row.mentee?.name ?? 'your mentee' } : null,
      row.mentee?.email ? { email: row.mentee.email, type: 'mentee' as const, name: row.mentor?.name ?? 'your mentor' } : null,
    ].filter((r): r is NonNullable<typeof r> => Boolean(r));

    const title = kind === '1h' ? 'Your session starts in an hour' : 'Session tomorrow';
    for (const r of recipients) {
      const message = `${row.goal ?? 'Mentoring session'} with ${r.name} — ${when}`;
      await admin.from('notifications').insert({ recipient_email: r.email, recipient_type: r.type, type: 'reminder', title, message, booking_id: row.id, is_read: false });
      if (resendApiKey) {
        const ok = await sendEmail(resendApiKey, mailFrom, r.email, `${title}: ${row.goal ?? 'Mentoring session'}`, `<p>${message}</p><p><a href="${appOrigin}/dashboard/bookings">Open MentorConnect</a></p>`);
        if (ok) {
          emailed += 1;
          if (!channels.includes('email')) channels.push('email');
        }
      }
    }
    await admin.from('booking_reminders').insert({ booking_id: row.id, kind, channels });
    await admin.from('activity_events').insert({
      actor_type: 'system',
      type: 'reminder_sent',
      subject_type: 'booking',
      subject_id: row.id,
      visible_to: [row.mentor?.id, row.mentee?.id].filter(Boolean),
      summary: `${kind === '1h' ? '1-hour' : '24-hour'} reminder sent (${channels.join(', ')})`,
      meta: { kind, channels },
    });
    written += 1;
  }

  sendJson(res, 200, { ok: true, reminders: written, emails: emailed, checked: data?.length ?? 0 });
}
