import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb, TEST_DB_URL } from './env.ts';
import { Accounts, GOAL, anonClient, claims, itEmail, mkBooking, mkMentee, mkMentor, mkUser, lazyClient, serviceClient, type Account } from './fixtures.ts';
import { createScratchDb, readSql, SQL, type ScratchDb } from './scratchDb.ts';
import { asRole, asService, connect, withTx } from './sql.ts';

/**
 * I0 — expand/contract compatibility (amendment AM1), with supabase-js calls shaped exactly
 * like the currently deployed client's (origin/main a4f3fbd, client/src/lib/database.ts and
 * services.ts):
 *   (a) after 0002 alone every legacy path still works;
 *   (b) after 0003 the legacy writes fail with permission errors while the new paths work.
 * (a) is proven twice. First on a real throwaway database that only ever saw v2 → phase2 →
 * 0002 (the production state between the 0002 release and 0003): the legacy calls run there
 * at the SQL level with PostgREST's roles and claims, and its catalog fingerprint is taken.
 * Then the shared stack (which PostgREST serves) is brought to the expand state by the
 * rollback block documented at the bottom of migrations/0003, its fingerprint must equal that
 * real expand database's, and the supabase-js calls run against it; 0003 is re-applied
 * afterwards. The new client works in both states, which is the point of expand/contract.
 * (c) — each file's idempotency and the v2 → phase2 → 0002 → 0003 re-run chain — is in
 * migrations.test.ts.
 *
 * !! SHARED-STACK WARNING: the second I0 (a) block re-grants the legacy anonymous writes on the
 * !! SHARED database (the 0003 rollback block) until this file's afterAll re-applies 0003. Anything
 * !! else using the stack meanwhile (Playwright, a dev server, another integration run) sees the
 * !! expand state. Run `npm run test:integration` only on a quiet stack, never next to E2E.
 */
const sql = connect();
const script = connect(TEST_DB_URL, 1);
const accounts = new Accounts();
const admin = lazyClient(serviceClient);

/** The commented ROLLBACK block of migrations/0003, uncommented. */
export function rollbackBlock(): string {
  const text = readSql(SQL.m0003);
  const start = text.indexOf('-- ROLLBACK');
  const lines = text.slice(start).split('\n').filter((l) => /^-- (BEGIN|GRANT|UPDATE|DELETE|NOTIFY|COMMIT)/.test(l) || /^--\s{3}public\./.test(l));
  return lines.map((l) => l.replace(/^-- ?/, '')).join('\n');
}

async function runScript(text: string) {
  await script.unsafe(text).simple();
}

let mentorId = '';
let mentor: Account;
let mentee: Account;

async function legacyAnonymousRequest(email: string) {
  // services.ts createRequest for a visitor without a session (a4f3fbd)
  const anon = anonClient();
  const { data: menteeId, error: menteeError } = await anon.rpc('get_or_create_mentee', { p_email: email, p_name: 'Legacy Visitor' });
  const bookingId = randomUUID();
  const now = new Date().toISOString();
  const { error: insertError } = await anon
    .from('bookings')
    .insert({ id: bookingId, mentor_id: mentorId, mentee_id: menteeId, goal: GOAL, status: 'pending', clicked_at: now, created_at: now });
  const { error: notifyError } = await anon.rpc('notify_booking_event', { p_booking_id: bookingId, p_event: 'booking_request' });
  return { menteeError, insertError, notifyError, bookingId };
}

async function legacySignedInRequest(client: Account['client'], email: string) {
  const { data: menteeId, error: menteeError } = await client.rpc('get_or_create_mentee', { p_email: email, p_name: 'Legacy Mentee' });
  const bookingId = randomUUID();
  const now = new Date().toISOString();
  const { error: insertError } = await client
    .from('bookings')
    .insert({ id: bookingId, mentor_id: mentorId, mentee_id: menteeId, goal: GOAL, status: 'pending', clicked_at: now, created_at: now });
  const { error: notifyError } = await client.rpc('notify_booking_event', { p_booking_id: bookingId, p_event: 'booking_request' });
  return { menteeError, insertError, notifyError, bookingId };
}

async function legacyConfirm(client: Account['client'], bookingId: string, uid: string) {
  // database.ts confirmBooking: the client writes status, scheduled_at and cal_event_uri itself
  return client
    .from('bookings')
    .update({ status: 'confirmed', responded_at: new Date().toISOString(), scheduled_at: '2026-10-03T09:00:00.000Z', cal_event_uri: uid })
    .eq('id', bookingId)
    .eq('status', 'accepted')
    .select()
    .single();
}

beforeAll(async () => {
  mentor = await accounts.create('compat-mentor', { userType: 'mentor' });
  mentee = await accounts.create('compat-mentee', { userType: 'mentee' });
  mentorId = (await mkMentor(sql, { email: mentor.email, cal_link: 'compat/30min' })).id;
  await mkMentee(sql, { email: mentee.email });
});

afterAll(async () => {
  await runScript(readSql(SQL.m0003)); // always leave the stack in the contract state
  await accounts.cleanup(sql);
  await script.end();
  await sql.end();
});

/** Catalog of a real v2 → phase2 → 0002 database, taken by the first I0 (a) block. */
let expandFingerprint: string[] | undefined;

function diff(a: string[], b: string[]): { onlyInA: string[]; onlyInB: string[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  return { onlyInA: a.filter((l) => !sb.has(l)), onlyInB: b.filter((l) => !sa.has(l)) };
}

describeDb('I0 (a) on a real database that has only v2, phase2 and 0002', () => {
  let db: ScratchDb | undefined;
  afterAll(async () => {
    await db?.drop();
  });

  it('the legacy anonymous request, mentor accept, mentee confirm and early feedback all succeed', async () => {
    db = await createScratchDb();
    for (const f of [SQL.v2, SQL.phase2, SQL.m0002]) await db.apply(f);
    expandFingerprint = await db.fingerprint();
    await withTx(db.sql, async (tx) => {
      const [{ value }] = await tx`select value from public.mc_settings where key = 'legacy_booking_writes'`;
      expect(value).toBe('allowed');
      const m = await mkMentor(tx, { cal_link: 'expand/30min' });
      const mentorSub = randomUUID();
      await mkUser(tx, { id: mentorSub, email: m.email, user_type: 'mentor' });
      // services.ts createRequest for a visitor without a session (a4f3fbd), as PostgREST's anon.
      const email = itEmail('expand-anon');
      await asRole(tx, 'anon');
      const [{ id: menteeId }] = await tx`select public.get_or_create_mentee(${email}, 'Legacy Visitor') as id`;
      const bookingId = randomUUID();
      await tx`insert into public.bookings (id, mentor_id, mentee_id, goal, status, clicked_at, created_at)
               values (${bookingId}, ${m.id}, ${menteeId}, ${GOAL}, 'pending', now(), now())`;
      await tx`select public.notify_booking_event(${bookingId}, 'booking_request')`;
      // Mentor accepts; the mentee confirms by writing the scheduling columns; the mentor rates early.
      await asRole(tx, 'authenticated', claims(mentorSub, m.email));
      await tx`update public.bookings set status = 'accepted', responded_at = now() where id = ${bookingId}`;
      await asService(tx);
      const menteeSub = randomUUID();
      await mkUser(tx, { id: menteeSub, email, user_type: 'mentee' });
      await asRole(tx, 'authenticated', claims(menteeSub, email));
      const confirmed = await tx`update public.bookings set status = 'confirmed', scheduled_at = '2026-10-03T09:00:00',
                                   cal_event_uri = ${`expandUid${randomUUID().slice(0, 8)}`}
                                 where id = ${bookingId} and status = 'accepted' returning status`;
      expect(confirmed.map((r) => r.status)).toEqual(['confirmed']);
      await asRole(tx, 'authenticated', claims(mentorSub, m.email));
      await tx`update public.bookings set mentor_rating = 5, mentor_feedback = 'Prepared and focused' where id = ${bookingId}`;
      await asService(tx);
      const notes = await tx`select recipient_email, type from public.notifications where booking_id = ${bookingId} order by type`;
      expect(notes).toEqual([{ recipient_email: m.email, type: 'booking_request' }]);
    });
  });

  it('0003 followed by its documented rollback block gives back exactly that catalog', async () => {
    expect(db, 'the previous test built the database').toBeDefined();
    await db!.apply(SQL.m0003);
    await db!.apply(rollbackBlock());
    expect(diff(expandFingerprint!, await db!.fingerprint())).toEqual({ onlyInA: [], onlyInB: [] });
    const [{ value }] = await db!.sql`select value from public.mc_settings where key = 'legacy_booking_writes'`;
    expect(value).toBe('allowed');
  });
});

describeDb('I0 (a) after 0002 alone the deployed client keeps working', () => {
  beforeAll(async () => {
    const block = rollbackBlock();
    expect(block).toMatch(/^BEGIN;/);
    expect(block).toMatch(/COMMIT;$/);
    await runScript(block);
    const [{ value }] = await sql<{ value: string }[]>`select value from public.mc_settings where key = 'legacy_booking_writes'`;
    expect(value).toBe('allowed');
  });

  it('the shared stack in this state has the same catalog as the real v2 → phase2 → 0002 database', async () => {
    expect(expandFingerprint, 'built by the previous block').toBeDefined();
    const rows = await sql.unsafe<{ line: string }[]>(readSql(SQL.fingerprint));
    expect(diff(expandFingerprint!, rows.map((r) => r.line))).toEqual({ onlyInA: [], onlyInB: [] });
  });

  it('anonymous request: get_or_create_mentee + direct insert + notify_booking_event', async () => {
    const email = itEmail('legacy-anon');
    accounts.track(email);
    const r = await legacyAnonymousRequest(email);
    expect(r).toMatchObject({ menteeError: null, insertError: null, notifyError: null });
    const { data } = await admin.from('notifications').select('recipient_email, type').eq('booking_id', r.bookingId);
    expect(data).toEqual([{ recipient_email: mentor.email, type: 'booking_request' }]);
  });

  it('signed-in request through the same three calls', async () => {
    const r = await legacySignedInRequest(mentee.client, mentee.email);
    expect(r).toMatchObject({ menteeError: null, insertError: null, notifyError: null });
  });

  it('mentor accepts, the mentee confirms by writing scheduled_at / cal_event_uri / status, notifications flow', async () => {
    const { data: me } = await admin.from('mentees').select('id').eq('email', mentee.email).single();
    const bookingId = await mkBooking(sql, mentorId, me!.id, { status: 'pending' });
    const accept = await mentor.client.from('bookings').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', bookingId).select().single();
    expect(accept.error).toBeNull();
    expect((await mentor.client.rpc('notify_booking_event', { p_booking_id: bookingId, p_event: 'booking_accepted' })).error).toBeNull();
    const confirm = await legacyConfirm(mentee.client, bookingId, `legacyUid${randomUUID().slice(0, 8)}`);
    expect(confirm.error).toBeNull();
    expect(confirm.data).toMatchObject({ status: 'confirmed', scheduled_at: '2026-10-03T09:00:00' });
    expect((await mentee.client.rpc('notify_booking_event', { p_booking_id: bookingId, p_event: 'booking_confirmed' })).error).toBeNull();
    // MySessions offers feedback once a confirmed session's time has passed (not only when completed)
    const feedback = await mentor.client.from('bookings').update({ mentor_rating: 5, mentor_feedback: 'Prepared and focused' }).eq('id', bookingId).select().single();
    expect(feedback.error).toBeNull();
  });

  it('availability (delete + insert), favourites and a self-scoped activity row still work', async () => {
    const del = await mentor.client.from('mentor_availability').delete().eq('mentor_id', mentorId);
    expect(del.error).toBeNull();
    const ins = await mentor.client
      .from('mentor_availability')
      .insert([{ id: randomUUID(), mentor_id: mentorId, day_of_week: 1, start_time: '09:00', end_time: '10:00', is_active: true, created_at: new Date().toISOString() }])
      .select();
    expect(ins.error).toBeNull();
    const { data: me } = await admin.from('mentees').select('id').eq('email', mentee.email).single();
    const fav = await mentee.client.from('mentee_favorites').insert({ mentee_id: me!.id, mentor_id: mentorId });
    expect(fav.error).toBeNull();
    const ev = await mentee.client.from('activity_events').insert({ actor_type: 'mentee', actor_id: me!.id, type: 'favorite_added', subject_type: 'mentor', subject_id: mentorId, visible_to: [me!.id], summary: 'Saved a mentor' });
    expect(ev.error).toBeNull();
    // The old client also logged booking events visible to both parties; the database trigger
    // writes those now, and the tightened policy refuses the client copy (logActivity ignores errors).
    const dup = await mentee.client.from('activity_events').insert({ actor_type: 'mentee', actor_id: me!.id, type: 'request_sent', visible_to: [me!.id, mentorId], summary: 'x' });
    expect(dup.error?.code).toBe('42501');
  });
});

describeDb('I0 (b) after 0003 the legacy writes fail and the new paths work', () => {
  beforeAll(async () => {
    await runScript(readSql(SQL.m0003));
  });

  it('the anonymous legacy calls are refused', async () => {
    const email = itEmail('legacy-anon-2');
    accounts.track(email);
    const r = await legacyAnonymousRequest(email);
    expect(r.menteeError?.code).toBe('42501');
    expect(r.insertError?.code).toBe('42501');
    expect(r.notifyError?.code).toBe('42501');
  });

  it('the signed-in legacy calls are refused', async () => {
    const r = await legacySignedInRequest(mentee.client, mentee.email);
    expect(r.menteeError?.code).toBe('42501');
    expect(r.insertError?.code).toBe('42501');
  });

  it('the client-side confirm and early feedback are refused', async () => {
    const { data: me } = await admin.from('mentees').select('id').eq('email', mentee.email).single();
    const bookingId = await mkBooking(sql, mentorId, me!.id, { status: 'accepted' });
    const confirm = await legacyConfirm(mentee.client, bookingId, `legacyUid${randomUUID().slice(0, 8)}`);
    expect(confirm.error?.code).toBe('42501');
    const feedback = await mentor.client.from('bookings').update({ mentor_rating: 5 }).eq('id', bookingId).select().single();
    expect(feedback.error?.code).toBe('42501');
  });

  it('the new paths work: create_booking_request (service), create_my_booking_request, record_cal_booking_from_embed', async () => {
    const email = itEmail('new-anon');
    accounts.track(email);
    const viaService = await admin.rpc('create_booking_request', { p_mentor_id: mentorId, p_email: email, p_name: 'New Visitor', p_goal: GOAL });
    expect(viaService.error).toBeNull();
    expect(viaService.data).toMatchObject({ outcome: 'created' });

    const other = await mkMentor(sql, { email: itEmail('compat-mentor-2') });
    accounts.track(other.email);
    const mine = await mentee.client.rpc('create_my_booking_request', { p_mentor_id: other.id, p_goal: GOAL });
    expect(mine.error).toBeNull();
    const bookingId = (mine.data as { booking_id: string }).booking_id;
    await sql`update public.bookings set status = 'accepted' where id = ${bookingId}`;
    const embed = await mentee.client.rpc('record_cal_booking_from_embed', {
      p_booking_id: bookingId, p_uid: `embedUid${randomUUID().slice(0, 8)}`, p_start: new Date(Date.now() + 10 * 86_400_000).toISOString(), p_status: 'ACCEPTED',
    });
    expect(embed.error).toBeNull();
    expect(embed.data).toMatchObject({ outcome: 'confirmed' });
  });
});
