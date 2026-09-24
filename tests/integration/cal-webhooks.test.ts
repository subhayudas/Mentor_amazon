import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { Accounts, anonClient, claims, itEmail, mkBooking, mkMentee, mkMentor, mkUser, serviceClient } from './fixtures.ts';
import { useStackEnv } from './http.ts';
import { asRole, asService, connect, expectPgError, withTx, type Tx } from './sql.ts';
import { calEvent, calHeaders, pingEvent } from '../helpers/cal.ts';
import { invoke, nextIp } from '../helpers/vercel.ts';

/** I10 (mentor_cal_webhooks and its RPCs) and I11 (the real webhook handler against the stack). */
const sql = connect();
const accounts = new Accounts();
afterAll(async () => {
  await accounts.cleanup(sql);
  await sql.end();
});

async function owners(tx: Tx) {
  const mentor = await mkMentor(tx);
  const other = await mkMentor(tx);
  const sub = randomUUID();
  const otherSub = randomUUID();
  const adminSub = randomUUID();
  await mkUser(tx, { id: sub, email: mentor.email, user_type: 'mentor' });
  await mkUser(tx, { id: otherSub, email: other.email, user_type: 'mentor' });
  await mkUser(tx, { id: adminSub, email: `admin.${randomUUID()}@mentorconnect.test`, user_type: 'admin' });
  return {
    mentor,
    asOwner: () => asRole(tx, 'authenticated', claims(sub, mentor.email)),
    asOther: () => asRole(tx, 'authenticated', claims(otherSub, other.email)),
    asAdmin: () => asRole(tx, 'authenticated', claims(adminSub, 'admin@mentorconnect.test')),
  };
}

describeDb('I10 mentor_cal_webhooks', () => {
  it('nobody reads the table directly (anon, authenticated via PostgREST)', async () => {
    const anon = await anonClient().from('mentor_cal_webhooks').select('secret');
    expect(anon.error?.code).toBe('42501');
    const account = await accounts.create('hook-reader', { userType: 'mentor' });
    const signedIn = await account.client.from('mentor_cal_webhooks').select('secret');
    expect(signedIn.error?.code).toBe('42501');
  });

  it('get_my_cal_webhook: owner only (another mentor and an admin get 42501); the secret is stable', async () => {
    await withTx(sql, async (tx) => {
      const o = await owners(tx);
      await o.asOwner();
      const [{ w }] = await tx<{ w: Record<string, unknown> }[]>`select public.get_my_cal_webhook(${o.mentor.id}) as w`;
      expect(w).toMatchObject({ mentor_id: o.mentor.id, secret: expect.stringMatching(/^[0-9a-f]{64}$/), deliveries_total: 0, last_delivery_at: null });
      const [{ again }] = await tx<{ again: Record<string, unknown> }[]>`select public.get_my_cal_webhook(${o.mentor.id}) as again`;
      expect(again.secret).toBe(w.secret);
      await o.asOther();
      await expectPgError(tx, (sp) => sp`select public.get_my_cal_webhook(${o.mentor.id})`, '42501', /not_allowed/);
      await o.asAdmin();
      await expectPgError(tx, (sp) => sp`select public.get_my_cal_webhook(${o.mentor.id})`, '42501', /not_allowed/);
      await asService(tx);
    });
  });

  it('rotate: the owner gets a new secret, the old one stays valid ~24 h; an admin rotates without seeing it', async () => {
    await withTx(sql, async (tx) => {
      const o = await owners(tx);
      await o.asOwner();
      const [{ w }] = await tx<{ w: { secret: string } }[]>`select public.get_my_cal_webhook(${o.mentor.id}) as w`;
      const [{ r }] = await tx<{ r: { secret: string; previous_valid_until: string; rotated_at: string } }[]>`
        select public.rotate_cal_webhook_secret(${o.mentor.id}) as r`;
      expect(r.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(r.secret).not.toBe(w.secret);
      const hours = (new Date(r.previous_valid_until).getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(23.9);
      expect(hours).toBeLessThan(24.1);
      await asService(tx);
      const [row] = await tx`select previous_secret from public.mentor_cal_webhooks where mentor_id = ${o.mentor.id}`;
      expect(row.previous_secret).toBe(w.secret);
      await o.asAdmin();
      const [{ a }] = await tx<{ a: { secret: string | null } }[]>`select public.rotate_cal_webhook_secret(${o.mentor.id}) as a`;
      expect(a.secret).toBeNull();
      await o.asOther();
      await expectPgError(tx, (sp) => sp`select public.rotate_cal_webhook_secret(${o.mentor.id})`, '42501', /not_allowed/);
      await asService(tx);
    });
  });

  it('cal_webhook_status is admin-only and never returns a secret', async () => {
    await withTx(sql, async (tx) => {
      const o = await owners(tx);
      await o.asOwner();
      await tx`select public.get_my_cal_webhook(${o.mentor.id})`;
      await expectPgError(tx, (sp) => sp`select public.cal_webhook_status()`, '42501', /not_allowed/);
      await o.asAdmin();
      const [{ s }] = await tx<{ s: Array<Record<string, unknown>> }[]>`select public.cal_webhook_status() as s`;
      const mine = s.find((e) => e.mentor_id === o.mentor.id);
      expect(mine).toMatchObject({ configured: false, deliveries_total: 0 });
      expect(JSON.stringify(s)).not.toMatch(/"secret"|previous_secret/);
      await asService(tx);
    });
  });

  it('deleting a mentor removes their webhook row', async () => {
    await withTx(sql, async (tx) => {
      const m = await mkMentor(tx);
      await tx`insert into public.mentor_cal_webhooks (mentor_id) values (${m.id})`;
      await tx`delete from public.mentors where id = ${m.id}`;
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.mentor_cal_webhooks where mentor_id = ${m.id}`;
      expect(n).toBe(0);
    });
  });
});

describeDb('I11 webhook handler end to end', () => {
  const admin = serviceClient();
  let restore = () => {};
  let handler: (req: never, res: never) => Promise<void>;
  const mentorEmail = itEmail('hook-mentor');
  const menteeEmail = itEmail('hook-mentee');
  let mentorId = '';
  let menteeId = '';
  let secret = '';

  beforeAll(async () => {
    restore = useStackEnv({ CAL_WEBHOOK_SECRET: undefined });
    handler = (await import('../../api/webhooks/cal.ts')).default as never;
    accounts.track(mentorEmail);
    accounts.track(menteeEmail);
    mentorId = (await mkMentor(sql, { email: mentorEmail, cal_link: 'hook.mentor/30min' })).id;
    menteeId = (await mkMentee(sql, { email: menteeEmail })).id;
    await sql`insert into public.mentor_cal_webhooks (mentor_id) values (${mentorId})`;
    [{ secret }] = await sql<{ secret: string }[]>`select secret from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
  });
  afterAll(async () => {
    await sql`delete from public.cal_webhook_events where mentor_id = ${mentorId} or id like ${'global:%' + menteeEmail + '%'}`;
    restore();
  });

  const post = (body: unknown, key: string, path = `/api/webhooks/cal?mentor=${mentorId}`) => {
    const raw = JSON.stringify(body);
    return invoke(handler as never, path, { method: 'POST', body: raw, headers: calHeaders(raw, key), ip: nextIp() });
  };
  const eventsCount = async () => (await sql<{ n: number }[]>`select count(*)::int as n from public.cal_webhook_events`)[0].n;

  it('every trigger through the real handler and database', async () => {
    const bookingId = await mkBooking(sql, mentorId, menteeId, { status: 'accepted' });
    const common = { attendees: [menteeEmail], organizerUsername: 'hook.mentor', mcBooking: bookingId };

    const ping = await post(pingEvent(), secret);
    expect(ping.json()).toEqual({ ok: true, outcome: 'ping' });

    const requested = await post(calEvent('BOOKING_REQUESTED', { uid: 'e2eHookUid1', ...common }), secret);
    expect(requested.json()).toEqual({ ok: true, outcome: 'requested' });
    const rejected = await post(calEvent('BOOKING_REJECTED', { uid: 'e2eHookUid1', ...common }), secret);
    expect(rejected.json()).toEqual({ ok: true, outcome: 'rejected' });
    const created = await post(calEvent('BOOKING_CREATED', { uid: 'e2eHookUid2', start: '2026-11-01T10:00:00+04:00', ...common }), secret);
    expect(created.json()).toEqual({ ok: true, outcome: 'confirmed' });
    const replay = await post(calEvent('BOOKING_CREATED', { uid: 'e2eHookUid2', start: '2026-11-01T10:00:00+04:00', ...common }), secret);
    expect(replay.json()).toEqual({ ok: true, outcome: 'duplicate' });
    const moved = await post(calEvent('BOOKING_RESCHEDULED', { uid: 'e2eHookUid3', rescheduleUid: 'e2eHookUid2', start: '2026-11-02T10:00:00Z', ...common }), secret);
    expect(moved.json()).toEqual({ ok: true, outcome: 'rescheduled' });
    const cancelled = await post(calEvent('BOOKING_CANCELLED', { uid: 'e2eHookUid3', ...common }), secret);
    expect(cancelled.json()).toEqual({ ok: true, outcome: 'canceled' });

    const [b] = await sql`select status, canceled_by, cal_event_uri, scheduled_at::text from public.bookings where id = ${bookingId}`;
    expect(b).toEqual({ status: 'canceled', canceled_by: 'cal', cal_event_uri: 'e2eHookUid3', scheduled_at: '2026-11-02 10:00:00' });
    const [w] = await sql`select last_trigger, last_outcome, deliveries_total from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
    expect(w).toEqual({ last_trigger: 'BOOKING_CANCELLED', last_outcome: 'canceled', deliveries_total: 6 });
  });

  it('the previous secret works inside the 24 h grace and not after it', async () => {
    const old = secret;
    await sql`update public.mentor_cal_webhooks set previous_secret = secret, secret = encode(extensions.gen_random_bytes(32), 'hex'),
              previous_valid_until = now() + interval '24 hours', rotated_at = now() where mentor_id = ${mentorId}`;
    expect((await post(pingEvent(new Date().toISOString()), old)).statusCode).toBe(200);
    await sql`update public.mentor_cal_webhooks set previous_valid_until = now() - interval '1 second' where mentor_id = ${mentorId}`;
    expect((await post(pingEvent(new Date(Date.now() + 1).toISOString()), old)).statusCode).toBe(401);
    [{ secret }] = await sql<{ secret: string }[]>`select secret from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
  });

  it('the global path verifies CAL_WEBHOOK_SECRET and finds the booking by cross-checked metadata', async () => {
    const bookingId = await mkBooking(sql, mentorId, menteeId, { status: 'accepted' });
    process.env.CAL_WEBHOOK_SECRET = 'global-integration-secret-123';
    try {
      const res = await post(calEvent('BOOKING_CREATED', { uid: `glob${randomUUID().slice(0, 8)}`, attendees: [menteeEmail], mcBooking: bookingId, organizerUsername: null }), 'global-integration-secret-123', '/api/webhooks/cal');
      expect(res.json()).toEqual({ ok: true, outcome: 'confirmed' });
    } finally {
      delete process.env.CAL_WEBHOOK_SECRET;
    }
    const [b] = await sql`select status from public.bookings where id = ${bookingId}`;
    expect(b.status).toBe('confirmed');
  });

  it('401s never write a delivery row', async () => {
    const before = await eventsCount();
    const body = calEvent('BOOKING_CREATED', { uid: 'e2eHookUid9', attendees: [menteeEmail] });
    expect((await post(body, 'f'.repeat(64))).statusCode).toBe(401);
    expect((await post(body, secret, '/api/webhooks/cal?mentor=00000000-0000-4000-8000-000000000000')).statusCode).toBe(401);
    expect((await post(body, secret, '/api/webhooks/cal')).statusCode).toBe(401);
    const raw = JSON.stringify(body);
    const noSig = await invoke(handler as never, `/api/webhooks/cal?mentor=${mentorId}`, { method: 'POST', body: raw, headers: { 'x-cal-signature-256': 'no-secret-provided' }, ip: nextIp() });
    expect(noSig.statusCode).toBe(401);
    expect(await eventsCount()).toBe(before);
  });
});
