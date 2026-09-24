import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { anonClient, claims, mkBooking, mkMentee, mkMentor, mkUser } from './fixtures.ts';
import { asRole, asService, connect, expectPgError, withTx, type Tx } from './sql.ts';

/**
 * I5 (constraints and the booking guard), I6 (unique Cal uid) and I14 (activity trigger and
 * the tightened events policy), in rolled-back transactions with PostgREST's roles.
 * The shared stack is in the contract state (0003 applied).
 */
const sql = connect();
afterAll(() => sql.end());
/** A UTC date `n` days from now (YYYY-MM-DD): embed starts must lie in the bookable window. */
const dayOf = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const [D1, D2, D3] = [dayOf(7), dayOf(8), dayOf(9)];

async function parties(tx: Tx) {
  const mentor = await mkMentor(tx, { country: 'United Arab Emirates', name: 'Mentor Mona' });
  const mentee = await mkMentee(tx, { name: 'Mentee Omar' });
  const mentorSub = randomUUID();
  const menteeSub = randomUUID();
  const adminSub = randomUUID();
  await mkUser(tx, { id: mentorSub, email: mentor.email, user_type: 'mentor' });
  await mkUser(tx, { id: menteeSub, email: mentee.email, user_type: 'mentee' });
  await mkUser(tx, { id: adminSub, email: `admin.${randomUUID()}@mentorconnect.test`, user_type: 'admin' });
  return {
    mentor,
    mentee,
    asMentor: () => asRole(tx, 'authenticated', claims(mentorSub, mentor.email)),
    asMentee: () => asRole(tx, 'authenticated', claims(menteeSub, mentee.email)),
    asAdmin: () => asRole(tx, 'authenticated', claims(adminSub, 'admin@mentorconnect.test')),
  };
}

describeDb('I5 constraints and the booking guard', () => {
  it('rejects unknown statuses, ratings outside 1..5 and unknown cal_status / canceled_by values', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await parties(tx);
      await expectPgError(tx, (sp) => mkBooking(sp, mentor.id, mentee.id, { status: 'bogus' }), '23514', /bookings_status_check/);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'completed' });
      await expectPgError(tx, (sp) => sp`update public.bookings set mentee_rating = 6 where id = ${id}`, '23514', /bookings_mentee_rating_check/);
      await expectPgError(tx, (sp) => sp`update public.bookings set mentor_rating = 0 where id = ${id}`, '23514', /bookings_mentor_rating_check/);
      await expectPgError(tx, (sp) => sp`update public.bookings set cal_status = 'maybe' where id = ${id}`, '23514', /bookings_cal_status_check/);
      await expectPgError(tx, (sp) => sp`update public.bookings set canceled_by = 'robot' where id = ${id}`, '23514', /bookings_canceled_by_check/);
    });
  });

  it('a mentee cannot rate a booking that is not completed, nor write scheduling columns, nor self-confirm', async () => {
    await withTx(sql, async (tx) => {
      const p = await parties(tx);
      const pending = await mkBooking(tx, p.mentor.id, p.mentee.id, { status: 'pending' });
      const accepted = await mkBooking(tx, p.mentor.id, p.mentee.id, { status: 'accepted' });
      await p.asMentee();
      await expectPgError(tx, (sp) => sp`update public.bookings set mentee_rating = 5 where id = ${pending}`, '42501', /forbidden_column_change/);
      await expectPgError(tx, (sp) => sp`update public.bookings set scheduled_at = now() where id = ${accepted}`, '42501', /forbidden_column_change/);
      await expectPgError(tx, (sp) => sp`update public.bookings set cal_event_uri = 'selfMadeUid1' where id = ${accepted}`, '42501', /forbidden_column_change/);
      await expectPgError(tx, (sp) => sp`update public.bookings set cal_status = 'accepted' where id = ${accepted}`, '42501', /forbidden_column_change/);
      await expectPgError(tx, (sp) => sp`update public.bookings set status = 'confirmed' where id = ${accepted}`, '42501', /forbidden_status_transition/);
      await expectPgError(tx, (sp) => sp`update public.bookings set canceled_by = 'mentor' where id = ${accepted}`, '42501', /forbidden_column_change/);
      await p.asMentor();
      await expectPgError(tx, (sp) => sp`update public.bookings set scheduled_at = now() where id = ${accepted}`, '42501', /forbidden_column_change/);
      await asService(tx);
    });
  });

  it('mentor completion still works, fills the country, and then the mentee can rate', async () => {
    await withTx(sql, async (tx) => {
      const p = await parties(tx);
      const id = await mkBooking(tx, p.mentor.id, p.mentee.id, { status: 'accepted' });
      await p.asMentor();
      await tx`update public.bookings set status = 'completed', completed_at = now(), session_duration_minutes = 45 where id = ${id}`;
      await p.asMentee();
      await tx`update public.bookings set mentee_rating = 5, mentee_feedback = 'Great' where id = ${id}`;
      await asService(tx);
      const [row] = await tx`select status, country, session_duration_minutes, mentee_rating from public.bookings where id = ${id}`;
      expect(row).toEqual({ status: 'completed', country: 'United Arab Emirates', session_duration_minutes: 45, mentee_rating: 5 });
      const [m] = await tx`select average_rating::text as avg, total_ratings from public.mentors where id = ${p.mentor.id}`;
      expect(m).toEqual({ avg: '5.00', total_ratings: 1 });
    });
  });

  it('a self-booking (caller owns both sides) can be canceled but never completed or rated', async () => {
    await withTx(sql, async (tx) => {
      // A legacy row (or one made before 0002's self-request check) where the mentor's own
      // address is also the mentee's.
      const mentor = await mkMentor(tx, { country: 'Jordan' });
      const selfMentee = await mkMentee(tx, { email: mentor.email });
      const sub = randomUUID();
      await mkUser(tx, { id: sub, email: mentor.email, user_type: 'mentor' });
      const pending = await mkBooking(tx, mentor.id, selfMentee.id, { status: 'pending' });
      const accepted = await mkBooking(tx, mentor.id, selfMentee.id, { status: 'accepted' });
      const completed = await mkBooking(tx, mentor.id, selfMentee.id, { status: 'completed' });
      const cancelMe = await mkBooking(tx, mentor.id, selfMentee.id, { status: 'accepted' });
      await asRole(tx, 'authenticated', claims(sub, mentor.email));
      await expectPgError(tx, (sp) => sp`update public.bookings set status = 'accepted' where id = ${pending}`, '42501', /forbidden_self_booking/);
      await expectPgError(tx, (sp) => sp`update public.bookings set status = 'completed' where id = ${accepted}`, '42501', /forbidden_self_booking/);
      await expectPgError(tx, (sp) => sp`update public.bookings set mentee_rating = 5 where id = ${completed}`, '42501', /forbidden_self_booking/);
      await expectPgError(tx, (sp) => sp`update public.bookings set mentee_feedback = 'Great' where id = ${completed}`, '42501', /forbidden_self_booking/);
      await expectPgError(tx, (sp) => sp`update public.bookings set mentor_rating = 5 where id = ${completed}`, '42501', /forbidden_self_booking/);
      await tx`update public.bookings set status = 'canceled', canceled_at = now() where id = ${cancelMe}`;
      await asService(tx);
      const [row] = await tx`select status from public.bookings where id = ${cancelMe}`;
      expect(row.status).toBe('canceled');
      const [m] = await tx`select average_rating::text as avg, total_ratings from public.mentors where id = ${mentor.id}`;
      expect(m).toEqual({ avg: '0.00', total_ratings: 0 });
    });
  });

  it('a client cancel is stamped with canceled_by (mentee, mentor, admin)', async () => {
    await withTx(sql, async (tx) => {
      const p = await parties(tx);
      const a = await mkBooking(tx, p.mentor.id, p.mentee.id);
      const b = await mkBooking(tx, p.mentor.id, p.mentee.id, { status: 'accepted' });
      const c = await mkBooking(tx, p.mentor.id, p.mentee.id, { status: 'confirmed' });
      await p.asMentee();
      await tx`update public.bookings set status = 'canceled', canceled_at = now() where id = ${a}`;
      await p.asMentor();
      await tx`update public.bookings set status = 'canceled', canceled_at = now() where id = ${b}`;
      await p.asAdmin();
      await tx`update public.bookings set status = 'canceled', canceled_at = now() where id = ${c}`;
      await asService(tx);
      const rows = await tx<{ id: string; canceled_by: string }[]>`select id, canceled_by from public.bookings where id in (${a}, ${b}, ${c})`;
      expect(Object.fromEntries(rows.map((r) => [r.id, r.canceled_by]))).toEqual({ [a]: 'mentee', [b]: 'mentor', [c]: 'admin' });
    });
  });

  it('mc.internal_write cannot be set through PostgREST (set_config is not exposed)', async () => {
    const { error, status } = await anonClient().rpc('set_config', { setting_name: 'mc.internal_write', new_value: 'on', is_local: true });
    expect(status).toBe(404);
    expect(error?.code).toBe('PGRST202');
  });
});

describeDb('I6 unique Cal uid', () => {
  it('a duplicate non-null cal_event_uri is 23505; many NULLs are fine', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await parties(tx);
      await mkBooking(tx, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'uniqUid123' });
      await expectPgError(tx, (sp) => mkBooking(sp, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'uniqUid123' }), '23505', /bookings_cal_event_uri_unique/);
      for (let i = 0; i < 3; i++) await mkBooking(tx, mentor.id, mentee.id, { cal_event_uri: null });
    });
  });
});

describeDb('I14 activity trigger and policy', () => {
  type Ev = { id: string; type: string; actor_type: string; actor_id: string | null; visible_to: string[]; subject_type: string; meta: Record<string, unknown> };
  async function newEvents(tx: Tx, bookingId: string, seen: Set<string>): Promise<Ev[]> {
    const rows = await tx<Ev[]>`select id, type, actor_type, actor_id, visible_to, subject_type, meta from public.activity_events where subject_id = ${bookingId}`;
    const fresh = rows.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => seen.add(r.id));
    return fresh;
  }

  it('every lifecycle transition writes exactly one row with the §3.5 shape', async () => {
    await withTx(sql, async (tx) => {
      const p = await parties(tx);
      const seen = new Set<string>();
      const id = await mkBooking(tx, p.mentor.id, p.mentee.id);
      const expectOne = async (type: string, extra: Partial<Ev> = {}, meta: Record<string, unknown> = {}) => {
        await asService(tx);
        const fresh = await newEvents(tx, id, seen);
        expect(fresh.map((e) => e.type), `after ${type}`).toEqual([type]);
        expect(fresh[0]).toMatchObject({ subject_type: 'booking', visible_to: [p.mentor.id, p.mentee.id], ...extra });
        expect(fresh[0].meta).toMatchObject({
          source: 'db_trigger',
          booking_id: id,
          mentor_id: p.mentor.id,
          mentee_id: p.mentee.id,
          mentor_name: 'Mentor Mona',
          mentee_name: 'Mentee Omar',
          ...meta,
        });
      };
      await expectOne('request_sent', { actor_type: 'system' }, { from_status: null, to_status: 'pending', change_source: 'app' });

      await p.asMentor();
      await tx`update public.bookings set status = 'accepted', responded_at = now() where id = ${id}`;
      await expectOne('request_accepted', { actor_type: 'mentor', actor_id: p.mentor.id }, { from_status: 'pending', to_status: 'accepted' });

      await p.asMentee();
      await tx`select public.record_cal_booking_from_embed(${id}, 'embedUid001', ${`${D1}T14:00:00+04:00`}, 'PENDING')`;
      await expectOne('booking_time_requested', { actor_type: 'mentee' }, { requested_start: `${D1}T10:00:00Z` });

      await tx`select public.cal_apply_event('it-rej-' || ${id}, ${p.mentor.id}, 'BOOKING_REJECTED', 'embedUid001', null,
                 ${`${D1}T10:00:00Z`}, ${`${D1}T10:30:00Z`}, 'REJECTED', array[${p.mentee.email}], null, null, 'busy', 'sha')`;
      await expectOne('booking_time_declined', { actor_type: 'system', actor_id: null }, { change_source: 'cal' });

      await p.asMentee();
      await tx`select public.record_cal_booking_from_embed(${id}, 'embedUid002', ${`${D2}T09:00:00Z`}, 'ACCEPTED')`;
      await expectOne('booking_confirmed', { actor_type: 'mentee' }, { to_status: 'confirmed', scheduled_at: `${D2}T09:00:00Z` });

      await tx`select public.cal_apply_event('it-res-' || ${id}, ${p.mentor.id}, 'BOOKING_RESCHEDULED', 'embedUid003', 'embedUid002',
                 ${`${D3}T09:00:00Z`}, ${`${D3}T09:30:00Z`}, 'ACCEPTED', array[${p.mentee.email}], null, null, null, 'sha')`;
      await expectOne('booking_rescheduled', { actor_type: 'system' }, { change_source: 'cal', scheduled_at: `${D3}T09:00:00Z` });

      await p.asMentor();
      await tx`update public.bookings set status = 'completed', completed_at = now(), session_duration_minutes = 40 where id = ${id}`;
      await expectOne('session_completed', { actor_type: 'mentor' }, { duration_minutes: 40, to_status: 'completed' });

      await p.asMentee();
      await tx`update public.bookings set mentee_rating = 4 where id = ${id}`;
      await expectOne('feedback_left', { actor_type: 'mentee' }, { rating: 4 });

      // pending → rejected and → canceled on fresh bookings
      const declined = await mkBooking(tx, p.mentor.id, p.mentee.id);
      const canceled = await mkBooking(tx, p.mentor.id, p.mentee.id);
      await p.asMentor();
      await tx`update public.bookings set status = 'rejected' where id = ${declined}`;
      await p.asMentee();
      await tx`update public.bookings set status = 'canceled', canceled_at = now() where id = ${canceled}`;
      await asService(tx);
      const types = await tx<{ subject_id: string; type: string; actor_type: string }[]>`
        select subject_id, type, actor_type from public.activity_events where subject_id in (${declined}, ${canceled}) and type <> 'request_sent'`;
      expect(types.sort((a, b) => a.type.localeCompare(b.type))).toEqual([
        { subject_id: canceled, type: 'booking_canceled', actor_type: 'mentee' },
        { subject_id: declined, type: 'request_declined', actor_type: 'mentor' },
      ]);

      // A change that is not a lifecycle event writes nothing.
      await p.asMentor();
      await tx`update public.bookings set goal = 'edited goal text for the record' where id = ${declined}`;
      await asService(tx);
      expect(await newEvents(tx, id, seen)).toEqual([]);
    });
  });

  it('a mentee cannot post into someone else\'s feed, but can post into their own', async () => {
    await withTx(sql, async (tx) => {
      const p = await parties(tx);
      const stranger = await mkMentor(tx);
      await p.asMentee();
      await expectPgError(
        tx,
        (sp) => sp`insert into public.activity_events (actor_type, actor_id, type, visible_to, summary)
                   values ('mentee', ${p.mentee.id}, 'profile_updated', ${[p.mentee.id, stranger.id]}, 'x')`,
        '42501',
        /row-level security/,
      );
      await expectPgError(
        tx,
        (sp) => sp`insert into public.activity_events (actor_type, actor_id, type, visible_to, summary)
                   values ('mentee', ${stranger.id}, 'profile_updated', ${[stranger.id]}, 'x')`,
        '42501',
        /row-level security/,
      );
      await tx`insert into public.activity_events (actor_type, actor_id, type, visible_to, summary)
               values ('mentee', ${p.mentee.id}, 'profile_updated', ${[p.mentee.id]}, 'Updated my profile')`;
      await asService(tx);
    });
  });

  it('a mentor linked by users.profile_id reads and writes their own feed', async () => {
    await withTx(sql, async (tx) => {
      const profile = await mkMentor(tx, { email: `profile.${randomUUID()}@mentorconnect.test` });
      const sub = randomUUID();
      const signInEmail = `signin.${randomUUID()}@mentorconnect.test`;
      await mkUser(tx, { id: sub, email: signInEmail, user_type: 'mentor', profile_id: profile.id });
      const mentee = await mkMentee(tx);
      const booking = await mkBooking(tx, profile.id, mentee.id);
      await asRole(tx, 'authenticated', claims(sub, signInEmail));
      await tx`insert into public.activity_events (actor_type, actor_id, type, visible_to, summary)
               values ('mentor', ${profile.id}, 'calendar_updated', ${[profile.id]}, 'Updated availability')`;
      const rows = await tx<{ type: string }[]>`select type from public.activity_events where visible_to @> ${[profile.id]} order by type`;
      expect(rows.map((r) => r.type)).toEqual(['calendar_updated', 'request_sent']);
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.bookings where id = ${booking}`;
      expect(n).toBe(1);
      await asService(tx);
    });
  });
});
