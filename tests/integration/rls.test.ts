import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { claims, mkBooking, mkMentee, mkMentor, mkUser } from './fixtures.ts';
import { asRole, asService, connect, expectPgError, withTx, type Tx } from './sql.ts';

/**
 * I18 — the RLS matrix behind the services the dashboards use, as anon, mentee, mentor,
 * profile-linked mentor, admin, an unrelated user and service_role (design §6.3).
 */
const sql = connect();
afterAll(() => sql.end());
const MANAV = '738d7465-42c6-5550-be9a-6e7ef35f52bc';

async function cast(tx: Tx) {
  const mentor = await mkMentor(tx, { cal_link: 'rls-mentor/30min' });
  const linkedProfile = await mkMentor(tx, { email: `profile.${randomUUID()}@mentorconnect.test` });
  const mentee = await mkMentee(tx);
  const otherMentee = await mkMentee(tx);
  const ids = { mentor: randomUUID(), linked: randomUUID(), mentee: randomUUID(), other: randomUUID(), admin: randomUUID(), stranger: randomUUID() };
  const linkedEmail = `linked.${randomUUID()}@mentorconnect.test`;
  await mkUser(tx, { id: ids.mentor, email: mentor.email, user_type: 'mentor' });
  await mkUser(tx, { id: ids.linked, email: linkedEmail, user_type: 'mentor', profile_id: linkedProfile.id });
  await mkUser(tx, { id: ids.mentee, email: mentee.email, user_type: 'mentee' });
  await mkUser(tx, { id: ids.other, email: otherMentee.email, user_type: 'mentee' });
  await mkUser(tx, { id: ids.admin, email: `admin.${randomUUID()}@mentorconnect.test`, user_type: 'admin' });
  const pending = await mkBooking(tx, mentor.id, mentee.id);
  const accepted = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
  const linkedBooking = await mkBooking(tx, linkedProfile.id, otherMentee.id);
  return {
    mentor, linkedProfile, mentee, otherMentee, pending, accepted, linkedBooking,
    as: {
      anon: () => asRole(tx, 'anon'),
      mentor: () => asRole(tx, 'authenticated', claims(ids.mentor, mentor.email)),
      linked: () => asRole(tx, 'authenticated', claims(ids.linked, linkedEmail)),
      mentee: () => asRole(tx, 'authenticated', claims(ids.mentee, mentee.email)),
      other: () => asRole(tx, 'authenticated', claims(ids.other, otherMentee.email)),
      admin: () => asRole(tx, 'authenticated', claims(ids.admin, 'admin@mentorconnect.test')),
      stranger: () => asRole(tx, 'authenticated', claims(ids.stranger, 'stranger@mentorconnect.test')),
      service: () => asRole(tx, 'service_role'),
    },
  };
}

async function visible(tx: Tx, ids: string[]): Promise<string[]> {
  const rows = await tx<{ id: string }[]>`select id from public.bookings where id = any(${ids}) order by id`;
  return rows.map((r) => r.id);
}

describeDb('I18 RLS matrix', () => {
  it('bookings: each party sees their own, the linked mentor sees the profile\'s, admins and the service role see all, anon nothing', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      const all = [c.pending, c.accepted, c.linkedBooking];
      await c.as.mentor();
      expect(await visible(tx, all)).toEqual([c.pending, c.accepted].sort());
      await c.as.mentee();
      expect(await visible(tx, all)).toEqual([c.pending, c.accepted].sort());
      await c.as.linked();
      expect(await visible(tx, all)).toEqual([c.linkedBooking]);
      await c.as.other();
      expect(await visible(tx, all)).toEqual([c.linkedBooking]);
      await c.as.stranger();
      expect(await visible(tx, all)).toEqual([]);
      await c.as.admin();
      expect(await visible(tx, all)).toEqual([...all].sort());
      await c.as.service();
      expect(await visible(tx, all)).toEqual([...all].sort());
      await c.as.anon();
      await expectPgError(tx, (sp) => sp`select id from public.bookings limit 1`, '42501', /permission denied/);
      await asService(tx);
    });
  });

  it('booking updates follow the transitions; outsiders update nothing', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      await c.as.mentee();
      await expectPgError(tx, (sp) => sp`update public.bookings set status = 'accepted' where id = ${c.pending}`, '42501', /forbidden_status_transition/);
      await c.as.stranger();
      const none = await tx`update public.bookings set goal = 'hijacked goal text here' where id = ${c.pending} returning id`;
      expect(none).toHaveLength(0);
      await c.as.mentor();
      const ok = await tx`update public.bookings set status = 'accepted', responded_at = now() where id = ${c.pending} returning status`;
      expect(ok).toEqual([{ status: 'accepted' }]);
      await c.as.linked();
      const linked = await tx`update public.bookings set status = 'rejected' where id = ${c.linkedBooking} returning status`;
      expect(linked).toEqual([{ status: 'rejected' }]);
      await asService(tx);
    });
  });

  it('mentees and mentors rows: owners update their own, nobody else does; the linked mentor edits the linked profile', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      await c.as.mentee();
      expect(await tx`update public.mentees set bio = 'mine' where id = ${c.mentee.id} returning id`).toHaveLength(1);
      expect(await tx`update public.mentees set bio = 'theirs' where id = ${c.otherMentee.id} returning id`).toHaveLength(0);
      await c.as.mentor();
      expect(await tx`update public.mentors set bio = 'mine' where id = ${c.mentor.id} returning id`).toHaveLength(1);
      expect(await tx`update public.mentors set bio = 'theirs' where id = ${c.linkedProfile.id} returning id`).toHaveLength(0);
      await c.as.linked();
      expect(await tx`update public.mentors set bio = 'linked' where id = ${c.linkedProfile.id} returning id`).toHaveLength(1);
      await c.as.mentor();
      await expectPgError(tx, (sp) => sp`update public.mentors set average_rating = 5 where id = ${c.mentor.id}`, '42501', /forbidden_column_change/);
      await c.as.admin();
      expect(await tx`update public.mentors set is_available = false where id = ${c.mentor.id} returning id`).toHaveLength(1);
      await asService(tx);
    });
  });

  it('favourites: own rows only; a featured mentor\'s database id is a valid target', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      await c.as.mentee();
      await tx`insert into public.mentee_favorites (mentee_id, mentor_id) values (${c.mentee.id}, ${MANAV})`;
      await tx`insert into public.mentee_favorites (mentee_id, mentor_id) values (${c.mentee.id}, ${c.mentor.id})`;
      await expectPgError(tx, (sp) => sp`insert into public.mentee_favorites (mentee_id, mentor_id) values (${c.otherMentee.id}, ${c.mentor.id})`, '42501', /row-level security/);
      const mine = await tx`select mentor_id from public.mentee_favorites order by mentor_id`;
      expect(mine.map((r) => r.mentor_id)).toEqual([MANAV, c.mentor.id].sort());
      await c.as.other();
      expect(await tx`select id from public.mentee_favorites where mentee_id = ${c.mentee.id}`).toHaveLength(0);
      expect(await tx`delete from public.mentee_favorites where mentee_id = ${c.mentee.id} returning id`).toHaveLength(0);
      await c.as.mentee();
      expect(await tx`delete from public.mentee_favorites where mentor_id = ${MANAV} returning id`).toHaveLength(1);
      await c.as.anon();
      await expectPgError(tx, (sp) => sp`select id from public.mentee_favorites limit 1`, '42501', /permission denied/);
      await asService(tx);
    });
  });

  it('mentor_scheduling_links: the mentee sees the Cal link only once the request is accepted', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      await c.as.mentee();
      const before = await tx`select booking_id, cal_link from public.mentor_scheduling_links where booking_id in (${c.pending}, ${c.accepted}) order by booking_id`;
      expect(before).toEqual([{ booking_id: c.accepted, cal_link: 'rls-mentor/30min' }]);
      await c.as.mentor();
      await tx`update public.bookings set status = 'accepted' where id = ${c.pending}`;
      await c.as.mentee();
      const after = await tx`select booking_id from public.mentor_scheduling_links where booking_id in (${c.pending}, ${c.accepted})`;
      expect(after).toHaveLength(2);
      await c.as.other();
      expect(await tx`select booking_id from public.mentor_scheduling_links where booking_id in (${c.pending}, ${c.accepted})`).toHaveLength(0);
      await c.as.anon();
      await expectPgError(tx, (sp) => sp`select booking_id from public.mentor_scheduling_links limit 1`, '42501', /permission denied/);
      await asService(tx);
    });
  });

  it('activity_events: people read the rows they are listed in; admins read all', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      const subjects = [c.pending, c.accepted, c.linkedBooking];
      const read = async () => (await tx<{ subject_id: string }[]>`select subject_id from public.activity_events where subject_id = any(${subjects})`).map((r) => r.subject_id).sort();
      await c.as.mentee();
      expect(await read()).toEqual([c.pending, c.accepted].sort());
      await c.as.linked();
      expect(await read()).toEqual([c.linkedBooking]);
      await c.as.stranger();
      expect(await read()).toEqual([]);
      await c.as.admin();
      expect(await read()).toEqual([...subjects].sort());
      await asService(tx);
    });
  });
});
