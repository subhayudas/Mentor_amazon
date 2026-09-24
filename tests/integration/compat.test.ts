import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb, TEST_DB_URL } from './env.ts';
import { Accounts, GOAL, anonClient, itEmail, mkBooking, mkMentee, mkMentor, serviceClient, type Account } from './fixtures.ts';
import { readSql, SQL } from './scratchDb.ts';
import { connect } from './sql.ts';

/**
 * I0 — expand/contract compatibility (amendment AM1), with supabase-js calls shaped exactly
 * like the currently deployed client's (origin/main a4f3fbd, client/src/lib/database.ts and
 * services.ts):
 *   (a) after 0002 alone every legacy path still works;
 *   (b) after 0003 the legacy writes fail with permission errors while the new paths work.
 * The expand state is reached by running the rollback block documented at the bottom of
 * migrations/0003 (so that rollback is proven too); 0003 is re-applied afterwards. The new
 * client works in both states, which is the point of expand/contract. (c) — each file's
 * idempotency and the v2 → phase2 → 0002 → 0003 re-run chain — is in migrations.test.ts.
 */
const sql = connect();
const script = connect(TEST_DB_URL, 1);
const accounts = new Accounts();
const admin = serviceClient();

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

describeDb('I0 (a) after 0002 alone the deployed client keeps working', () => {
  beforeAll(async () => {
    const block = rollbackBlock();
    expect(block).toMatch(/^BEGIN;/);
    expect(block).toMatch(/COMMIT;$/);
    await runScript(block);
    const [{ value }] = await sql<{ value: string }[]>`select value from public.mc_settings where key = 'legacy_booking_writes'`;
    expect(value).toBe('allowed');
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
      p_booking_id: bookingId, p_uid: `embedUid${randomUUID().slice(0, 8)}`, p_start: '2026-10-04T09:00:00Z', p_status: 'ACCEPTED',
    });
    expect(embed.error).toBeNull();
    expect(embed.data).toMatchObject({ outcome: 'confirmed' });
  });
});
