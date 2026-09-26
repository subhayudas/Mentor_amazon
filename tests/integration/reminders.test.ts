import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { Accounts, itEmail, mkBooking, mkMentee, mkMentor } from './fixtures.ts';
import { useStackEnv } from './http.ts';
import { connect } from './sql.ts';
import { invoke } from '../helpers/vercel.ts';

/** I13 — the reminder cron end to end against the stack (design §5.3 A10). */
const sql = connect();
const accounts = new Accounts();
let restore = () => {};
let cron: (req: never, res: never) => Promise<void>;
const CRON = 'integration-cron-secret-0123456789';

beforeAll(async () => {
  restore = useStackEnv({ CRON_SECRET: CRON, APP_ORIGIN: 'http://localhost:5173', RESEND_API_KEY: undefined });
  cron = (await import('../../api/cron/reminders.ts')).default as never;
});
afterAll(async () => {
  await accounts.cleanup(sql);
  restore();
  await sql.end();
});

const run = () => invoke(cron as never, '/api/cron/reminders', { method: 'GET', headers: { authorization: `Bearer ${CRON}` } });

async function world(status: string, minutesAway: number) {
  const mentorEmail = itEmail('rem-mentor');
  const menteeEmail = itEmail('rem-mentee');
  accounts.track(mentorEmail);
  accounts.track(menteeEmail);
  const mentor = await mkMentor(sql, { email: mentorEmail });
  const mentee = await mkMentee(sql, { email: menteeEmail });
  const [{ at }] = await sql<{ at: string }[]>`select (timezone('utc', now()) + ${`${minutesAway} minutes`}::interval)::text as at`;
  const id = await mkBooking(sql, mentor.id, mentee.id, { status, scheduled_at: at, goal: 'Reminder <b>check</b>' });
  return { id, mentorEmail, menteeEmail };
}

describeDb('I13 reminders', () => {
  it('confirmed in 50 minutes: one 1h reminder, notifications with ids; accepted gets none; a second (concurrent) run sends nothing', async () => {
    const confirmed = await world('confirmed', 50);
    const accepted = await world('accepted', 50);
    const [first, second] = await Promise.all([run(), run()]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const [claims] = await sql<{ n: number; kind: string; channels: string[] }[]>`
      select count(*)::int as n, min(kind) as kind, min(channels::text)::text[] as channels from public.booking_reminders where booking_id = ${confirmed.id}`;
    expect(claims).toEqual({ n: 1, kind: '1h', channels: ['in_app'] });
    const notes = await sql<{ id: string; recipient_email: string; type: string }[]>`
      select id, recipient_email, type from public.notifications where booking_id = ${confirmed.id} order by recipient_email`;
    expect(notes.map((n) => [n.recipient_email, n.type])).toEqual([confirmed.mentorEmail, confirmed.menteeEmail].sort().map((e) => [e, 'reminder']));
    for (const n of notes) expect(n.id).toMatch(/^[0-9a-f-]{36}$/);
    const [{ none }] = await sql<{ none: number }[]>`
      select count(*)::int as none from public.notifications where booking_id = ${accepted.id} and type = 'reminder'`;
    expect(none).toBe(0);
    const [{ events }] = await sql<{ events: number }[]>`
      select count(*)::int as events from public.activity_events where subject_id = ${confirmed.id} and type = 'reminder_sent'`;
    expect(events).toBe(1);
    const third = await run();
    expect(third.json()).toMatchObject({ ok: true });
    const [{ still }] = await sql<{ still: number }[]>`select count(*)::int as still from public.notifications where booking_id = ${confirmed.id}`;
    expect(still).toBe(2);
  });

  it('a notification failure removes the claim, so the next run retries', async () => {
    const b = await world('confirmed', 20 * 60);
    const fn = `it_fail_notify_${randomBytes(4).toString('hex')}`;
    await sql.unsafe(`
      create function public.${fn}() returns trigger language plpgsql as $$
      begin if new.booking_id = '${b.id}' then raise exception 'forced failure'; end if; return new; end $$;
      create trigger ${fn} before insert on public.notifications for each row execute function public.${fn}();`);
    try {
      const failed = await run();
      expect(failed.json()).toMatchObject({ ok: true });
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.booking_reminders where booking_id = ${b.id}`;
      expect(n).toBe(0);
    } finally {
      await sql.unsafe(`drop trigger if exists ${fn} on public.notifications; drop function if exists public.${fn}();`);
    }
    await run();
    const [claim] = await sql<{ kind: string }[]>`select kind from public.booking_reminders where booking_id = ${b.id}`;
    expect(claim.kind).toBe('24h');
  });
});
