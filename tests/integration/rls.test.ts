import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { claims, mkBooking, mkMentee, mkMentor, mkUser, rand } from './fixtures.ts';
import { asRole, asService, connect, expectPgError, expectPgFailure, withTx, type Tx } from './sql.ts';

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
    mentor, linkedProfile, mentee, otherMentee, pending, accepted, linkedBooking, ids, linkedEmail,
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
  it('the public views are read-only for every API role (no writes through the owner-run view)', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      for (const role of ['anon', 'mentee', 'mentor', 'service'] as const) {
        await c.as[role]();
        await expectPgError(tx, (sp) => sp`update public.mentors_public set bio = 'defaced' where id = ${c.mentor.id}`, '42501', /permission denied/);
        await expectPgError(tx, (sp) => sp`delete from public.mentors_public where id = ${c.mentor.id}`, '42501', /permission denied/);
        await expectPgError(tx, (sp) => sp`insert into public.mentors_public (id, name) values (${randomUUID()}, 'x')`, '42501', /permission denied/);
        const [{ n }] = await tx`select count(*)::int as n from public.mentors_public where id = ${c.mentor.id}`;
        expect(n).toBe(1);
      }
      await asService(tx);
      const writes = await tx<{ view: string; role: string; priv: string }[]>`
        select v.view, r.role, p.priv from (values ('public.mentors_public'), ('public.mentor_scheduling_links')) v (view)
        cross join (values ('anon'), ('authenticated'), ('service_role')) r (role)
        cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p (priv)
        where has_table_privilege(r.role, v.view, p.priv)`;
      expect(writes).toEqual([]);
      const [row] = await tx`select bio from public.mentors where id = ${c.mentor.id}`;
      expect(row.bio).toBe('Integration test mentor');
    });
  });

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

  // ---------------------------------------------------------------------------------------------
  // Identity links (R1-07): users.profile_id opens a profile's full row, its bookings and its Cal.com
  // webhook secret (owns_profile, owns_mentor, my_profile_ids), so an account may only point it at a
  // profile under its own verified email. Admins and the SSO bridge (service role) link any profile.

  it('profile links: nobody points users.profile_id at someone else\'s profile; the mentor takeover is refused', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      await tx`insert into public.mentor_cal_webhooks (mentor_id, secret) values (${c.mentor.id}, 'it-secret-of-this-mentor')`;
      const refused = { code: '42501', message: /forbidden_column_change/, detail: /profile_id may only name your own profile/ };
      // A signed-in stranger with no users row yet creates one that points at the mentor.
      await c.as.stranger();
      await expectPgFailure(tx, (sp) => sp`
        insert into public.users (id, email, password, user_type, profile_id, created_at)
        values (${c.ids.stranger}, 'stranger@mentorconnect.test', 'x', 'mentee', ${c.mentor.id}, now())`, refused);
      // Nothing opened up.
      expect(await tx`select id from public.mentors where id = ${c.mentor.id}`).toEqual([]);
      expect(await tx`select id from public.bookings where mentor_id = ${c.mentor.id}`).toEqual([]);
      await expectPgError(tx, (sp) => sp`select public.get_my_cal_webhook(${c.mentor.id})`, '42501', /not_allowed/);
      await expectPgError(tx, (sp) => sp`select public.rotate_cal_webhook_secret(${c.mentor.id})`, '42501', /not_allowed/);
      // With a plain row of their own, re-pointing it is refused too: any mentor, any mentee.
      await tx`insert into public.users (id, email, password, user_type, created_at)
               values (${c.ids.stranger}, 'stranger@mentorconnect.test', 'x', 'mentee', now())`;
      for (const target of [c.mentor.id, c.linkedProfile.id, c.mentee.id]) {
        await expectPgFailure(tx, (sp) => sp`update public.users set profile_id = ${target} where id = ${c.ids.stranger}`, refused);
      }
      const [{ ids }] = await tx<{ ids: string[] }[]>`select public.my_profile_ids() as ids`;
      expect(ids).toEqual([]);
      // A mentee cannot claim another mentee's profile, but links their own and may clear it.
      await c.as.mentee();
      await expectPgFailure(tx, (sp) => sp`update public.users set profile_id = ${c.otherMentee.id} where id = ${c.ids.mentee}`, refused);
      expect(await tx`update public.users set profile_id = ${c.mentee.id} where id = ${c.ids.mentee} returning profile_id`).toEqual([{ profile_id: c.mentee.id }]);
      expect(await tx`update public.users set profile_id = null where id = ${c.ids.mentee} returning profile_id`).toEqual([{ profile_id: null }]);
      // The onboarding link: a mentor points it at the mentors row under their own address.
      await c.as.mentor();
      expect(await tx`update public.users set profile_id = ${c.mentor.id} where id = ${c.ids.mentor} returning profile_id`).toEqual([{ profile_id: c.mentor.id }]);
      // The admin-made link stays as it is when the linked account saves its row again.
      await c.as.linked();
      expect(await tx`update public.users set profile_id = ${c.linkedProfile.id} where id = ${c.ids.linked} returning profile_id`).toEqual([{ profile_id: c.linkedProfile.id }]);
      await expectPgFailure(tx, (sp) => sp`update public.users set profile_id = ${c.mentor.id} where id = ${c.ids.linked}`, refused);
      // An admin links any profile (an Amazon identity to a legacy row), as does the service role.
      await c.as.admin();
      expect(await tx`update public.users set profile_id = ${c.linkedProfile.id} where id = ${c.ids.other} returning profile_id`).toEqual([{ profile_id: c.linkedProfile.id }]);
      await c.as.service();
      expect(await tx`update public.users set profile_id = ${c.mentor.id} where id = ${c.ids.other} returning profile_id`).toEqual([{ profile_id: c.mentor.id }]);
      await asService(tx);
    });
  });

  // Mentor and mentee ids share one namespace: users.profile_id, my_profile_ids() and
  // activity_events.visible_to name a profile by id alone. A self-made profile under the caller's own
  // address that reuses a mentor's public id (or a mentee's id, known to their mentor from a booking)
  // must open nothing (R1-07 review: the takeover through a colliding mentees row, and the feed leak).

  it('profile ids: nobody creates or renames a profile onto an id the other table or the programme holds', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      const taken = { code: '42501', message: /forbidden_column_change/, detail: /this id belongs to a mentor profile/ };
      const menteeRow = (id: string, email: string) => ({
        id, name: 'Attacker', email, user_type: 'individual', timezone: 'UTC', languages_spoken: ['English'],
        areas_exploring: ['x'], verification_status: 'unverified', created_at: new Date().toISOString(),
      });
      // The reviewer's repro, step 1: a mentees row under my own address with the victim mentor's id.
      await c.as.stranger();
      await tx`insert into public.users (id, email, password, user_type, created_at)
               values (${c.ids.stranger}, 'stranger@mentorconnect.test', 'x', 'mentee', now())`;
      await expectPgFailure(tx, (sp) => sp`insert into public.mentees ${sp(menteeRow(c.mentor.id, 'stranger@mentorconnect.test'))}`, taken);
      await expectPgFailure(tx, (sp) => sp`insert into public.mentees ${sp(menteeRow(MANAV, 'stranger@mentorconnect.test'))}`, taken);
      // Anonymously (then signing in with that address) it is refused too: by the guard while anon
      // may still insert mentees (between 0002 and 0003), by the missing privilege after 0003.
      await c.as.anon();
      await expectPgError(tx, (sp) => sp`insert into public.mentees ${sp(menteeRow(c.mentor.id, 'stranger@mentorconnect.test'))}`, '42501');
      // A mentee row of their own cannot be renamed onto the id later.
      await c.as.stranger();
      const own = randomUUID();
      await tx`insert into public.mentees ${tx(menteeRow(own, 'stranger@mentorconnect.test'))}`;
      await expectPgFailure(tx, (sp) => sp`update public.mentees set id = ${c.mentor.id} where id = ${own}`,
        { code: '42501', detail: /a mentee profile id is set when it is created/ });
      // The other direction: an approved mentor cannot take the id of a mentee they have a booking with.
      await asService(tx);
      await tx`insert into public.approved_users (id, amazon_alias, email, role, is_active, approved_by, approved_at)
               values (${randomUUID()}, ${`itns${rand()}`}, ${c.mentor.email}, 'mentor', true, 'it', now())`;
      await c.as.mentor();
      const now = new Date().toISOString();
      await expectPgFailure(tx, (sp) => sp`insert into public.mentors ${sp({
        id: c.mentee.id, name: 'Second row', email: c.mentor.email, timezone: 'UTC', bio: 'b', cal_link: 'x/30min', expertise: ['x'],
        industries: ['x'], languages_spoken: ['English'], comms_owner: 'exec', created_at: now, updated_at: now,
      })}`, { code: '42501', message: /forbidden_column_change/, detail: /this id belongs to a mentee profile/ });
      // Nor can an admin or the service role make the collision.
      await c.as.admin();
      await expectPgFailure(tx, (sp) => sp`insert into public.mentees ${sp(menteeRow(c.mentor.id, 'stranger@mentorconnect.test'))}`, taken);
      await c.as.service();
      await expectPgFailure(tx, (sp) => sp`insert into public.mentees ${sp(menteeRow(c.linkedProfile.id, 'x@mentorconnect.test'))}`, taken);
      // Renaming a mentees row stays possible for an admin, onto a free id.
      await c.as.admin();
      const renamed = randomUUID();
      expect(await tx`update public.mentees set id = ${renamed} where id = ${own} returning id`).toEqual([{ id: renamed }]);
      await asService(tx);
    });
  });

  it('profile ids: a colliding row that already exists (made before the guard) still opens nothing', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      await tx`insert into public.mentor_cal_webhooks (mentor_id, secret) values (${c.mentor.id}, 'it-secret-of-this-mentor')`;
      await tx`insert into public.activity_events (actor_type, actor_id, type, visible_to, summary)
               values ('system', null, 'it.private', ${[c.mentor.id]}, 'private feed entry of the mentor'),
                      ('system', null, 'it.private', ${[c.mentee.id]}, 'private feed entry of the mentee')`;
      // Legacy data: the rows are written past the id guard, as they could have been before it existed.
      const attacker = `attacker.${rand()}@mentorconnect.test`;
      const nosy = `nosy.${rand()}@mentorconnect.test`;
      await tx`alter table public.mentees disable trigger user`;
      await tx`alter table public.mentors disable trigger user`;
      await tx`insert into public.mentees (id, name, email, user_type, timezone, languages_spoken, areas_exploring, verification_status, created_at)
               values (${c.mentor.id}, 'Attacker', ${attacker}, 'individual', 'UTC', '{English}', '{x}', 'unverified', now())`;
      await tx`insert into public.mentors (id, name, email, timezone, bio, cal_link, expertise, industries, languages_spoken, comms_owner, created_at, updated_at)
               values (${c.mentee.id}, 'Nosy mentor', ${nosy}, 'UTC', 'b', 'x/30min', '{x}', '{x}', '{English}', 'exec', now(), now())`;
      await tx`alter table public.mentees enable trigger user`;
      await tx`alter table public.mentors enable trigger user`;
      const refused = { code: '42501', message: /forbidden_column_change/, detail: /profile_id may only name your own profile/ };
      const feed = async () => (await tx<{ summary: string }[]>`select summary from public.activity_events where type = 'it.private' order by summary`).map((r) => r.summary);
      const myIds = async () => (await tx<{ ids: string[] }[]>`select public.my_profile_ids() as ids`)[0].ids;
      // The reviewer's repro, step 2: linking it is refused, and the victim's feed, row, bookings and
      // webhook secret stay closed.
      const sub = randomUUID();
      const nosySub = randomUUID();
      await mkUser(tx, { id: sub, email: attacker, user_type: 'mentee' });
      await mkUser(tx, { id: nosySub, email: nosy, user_type: 'mentor' });
      await asRole(tx, 'authenticated', claims(sub, attacker));
      await expectPgFailure(tx, (sp) => sp`update public.users set profile_id = ${c.mentor.id} where id = ${sub}`, refused);
      expect(await myIds()).toEqual([]);
      expect(await feed()).toEqual([]);
      await expectPgError(tx, (sp) => sp`
        insert into public.activity_events (actor_type, actor_id, type, visible_to, summary)
        values ('mentee', ${c.mentor.id}, 'it.forged', ${[c.mentor.id]}, 'forged')`, '42501');
      expect(await tx`select id from public.mentors where id = ${c.mentor.id}`).toEqual([]);
      expect(await tx`select id from public.bookings where mentor_id = ${c.mentor.id}`).toEqual([]);
      await expectPgError(tx, (sp) => sp`select public.get_my_cal_webhook(${c.mentor.id})`, '42501', /not_allowed/);
      // The other direction: a mentor's own-address row that carries a mentee's id opens neither the
      // mentee's feed nor a link to the mentee's profile.
      await asRole(tx, 'authenticated', claims(nosySub, nosy));
      expect(await myIds()).toEqual([]);
      expect(await feed()).toEqual([]);
      await expectPgFailure(tx, (sp) => sp`update public.users set profile_id = ${c.mentee.id} where id = ${nosySub}`, refused);
      // The data cannot say which side is the rightful owner, so a colliding id is nobody's feed
      // (fails closed; 0002 warns about every such id) until an admin removes the stray row.
      await c.as.mentor();
      expect(await myIds()).toEqual([]);
      await c.as.mentee();
      expect(await myIds()).toEqual([]);
      await asService(tx);
      await tx`delete from public.mentees where id = ${c.mentor.id} and email = ${attacker}`;
      await tx`delete from public.mentors where id = ${c.mentee.id} and email = ${nosy}`;
      await c.as.mentor();
      expect(await myIds()).toEqual([c.mentor.id]);
      expect(await feed()).toEqual(['private feed entry of the mentor']);
      await c.as.mentee();
      expect(await myIds()).toEqual([c.mentee.id]);
      expect(await feed()).toEqual(['private feed entry of the mentee']);
      // A mentor account links only a mentors row, a mentee account only a mentees row.
      await asService(tx);
      const mentorsMenteeRow = await mkMentee(tx, { email: c.mentor.email });
      await c.as.mentor();
      await expectPgFailure(tx, (sp) => sp`update public.users set profile_id = ${mentorsMenteeRow.id} where id = ${c.ids.mentor}`, refused);
      expect(await tx`update public.users set profile_id = ${c.mentor.id} where id = ${c.ids.mentor} returning profile_id`).toEqual([{ profile_id: c.mentor.id }]);
      await asService(tx);
      const menteesMentorRow = await mkMentor(tx, { email: c.otherMentee.email });
      await c.as.other();
      await expectPgFailure(tx, (sp) => sp`update public.users set profile_id = ${menteesMentorRow.id} where id = ${c.ids.other}`, refused);
      expect(await tx`update public.users set profile_id = ${c.otherMentee.id} where id = ${c.ids.other} returning profile_id`).toEqual([{ profile_id: c.otherMentee.id }]);
      await asService(tx);
    });
  });

  it('users.is_verified is set by the SSO bridge or an admin, never by the account', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      const verified = { code: '42501', message: /forbidden_column_change/, detail: /is_verified is set by the SSO bridge or an admin/ };
      await c.as.stranger();
      const [row] = await tx`insert into public.users (id, email, password, user_type, is_verified, created_at)
                             values (${c.ids.stranger}, 'stranger@mentorconnect.test', 'x', 'mentee', true, now()) returning is_verified`;
      expect(row.is_verified).toBe(false);
      await expectPgFailure(tx, (sp) => sp`update public.users set is_verified = true where id = ${c.ids.stranger}`, verified);
      await c.as.mentor();
      await expectPgFailure(tx, (sp) => sp`update public.users set is_verified = false where id = ${c.ids.mentor}`, verified);
      await c.as.admin();
      expect(await tx`update public.users set is_verified = true where id = ${c.ids.stranger} returning is_verified`).toEqual([{ is_verified: true }]);
      await asService(tx);
    });
  });

  // Mentor identity (R1-09): the featured ids are the programme's, and a row's id, address and
  // programme flag are set by an admin.

  it('mentor identity: reserved ids, renames, new addresses and the programme flag are refused; programme rows are admin-only', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      // A fresh Amazon mentor as the SSO bridge creates them (users row + approved 'amazon-sso').
      const sub = randomUUID();
      const email = `squatter.${rand()}@amazon.com`;
      await mkUser(tx, { id: sub, email, user_type: 'mentor' });
      await tx`insert into public.approved_users (id, amazon_alias, email, role, is_active, approved_by, approved_at)
               values (${randomUUID()}, ${`itsq${rand()}`}, ${email}, 'mentor', true, 'amazon-sso', now())`;
      const reservedForTest = randomUUID();
      await tx`insert into public.reserved_mentor_ids (id, note) values (${reservedForTest}, 'integration test')`;
      const managed = await mkMentor(tx, { email: `featured.it-${rand()}@mentorconnect.invalid`, managed_by_programme: true, cal_link: '' });
      const managedSub = randomUUID();
      const managedEmail = `staff.${rand()}@mentorconnect.test`;
      await mkUser(tx, { id: managedSub, email: managedEmail, user_type: 'mentor', profile_id: managed.id });
      const now = new Date().toISOString();
      const row = (id: string, extra: Record<string, unknown> = {}) => ({
        id, name: 'Manav Gupta', email, timezone: 'UTC', bio: 'Squatted bio', cal_link: 'squat/30min', expertise: ['x'],
        industries: ['x'], languages_spoken: ['English'], comms_owner: 'exec', created_at: now, updated_at: now, ...extra,
      });
      await asRole(tx, 'authenticated', claims(sub, email));
      const reservedRule = { code: '42501', message: /forbidden_column_change/, detail: /this mentor id is reserved for the programme/ };
      await expectPgFailure(tx, (sp) => sp`insert into public.mentors ${sp(row(MANAV))}`, reservedRule);
      await expectPgFailure(tx, (sp) => sp`insert into public.mentors ${sp(row(reservedForTest))}`, reservedRule);
      await expectPgFailure(tx, (sp) => sp`insert into public.mentors ${sp(row(randomUUID(), { managed_by_programme: true }))}`,
        { code: '42501', detail: /managed_by_programme is set by an admin/ });
      // Their own row is fine; renaming it, moving it to another address or flagging it is not.
      const own = randomUUID();
      await tx`insert into public.mentors ${tx(row(own, { name: 'Sam Squatter' }))}`;
      const identity = { code: '42501', message: /forbidden_column_change/, detail: /id, email and managed_by_programme are set by an admin/ };
      await expectPgFailure(tx, (sp) => sp`update public.mentors set id = ${reservedForTest}, name = 'Manav Gupta' where id = ${own}`, identity);
      await expectPgFailure(tx, (sp) => sp`update public.mentors set id = ${randomUUID()} where id = ${own}`, identity);
      await expectPgFailure(tx, (sp) => sp`update public.mentors set managed_by_programme = true where id = ${own}`, identity);
      expect(await tx`update public.mentors set bio = 'My real bio' where id = ${own} returning id`).toHaveLength(1);
      // A linked account cannot hand its row to another address.
      await c.as.linked();
      await expectPgFailure(tx, (sp) => sp`update public.mentors set email = 'someone.else@mentorconnect.test' where id = ${c.linkedProfile.id}`, identity);
      // An account linked to a programme-managed row still cannot edit it; an admin can.
      await asRole(tx, 'authenticated', claims(managedSub, managedEmail));
      await expectPgFailure(tx, (sp) => sp`update public.mentors set bio = 'hijacked' where id = ${managed.id}`,
        { code: '42501', detail: /a programme-managed mentor is edited by an admin/ });
      await c.as.admin();
      expect(await tx`update public.mentors set bio = 'Edited by the programme' where id = ${managed.id} returning id`).toHaveLength(1);
      expect(await tx`update public.mentors set email = ${`moved.${rand()}@mentorconnect.test`} where id = ${own} returning id`).toHaveLength(1);
      await asService(tx);
      const [m] = await tx`select name, bio, managed_by_programme from public.mentors where id = ${own}`;
      expect(m).toEqual({ name: 'Sam Squatter', bio: 'My real bio', managed_by_programme: false });
    });
  });

  // Read isolation (R1-50): who sees mentors, mentees and notifications rows.

  it('read isolation: full mentors, mentees and notifications rows only for their owners, the parties and admins; anon none', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      const loner = await mkMentor(tx);
      const lonerSub = randomUUID();
      await mkUser(tx, { id: lonerSub, email: loner.email, user_type: 'mentor' });
      const [{ id: noteId }] = await tx<{ id: string }[]>`
        insert into public.notifications (recipient_email, recipient_type, type, title, message, booking_id)
        values (${c.mentor.email}, 'mentor', 'booking_request', 'New booking request', 'secret goal', ${c.pending}) returning id`;
      const read = async () => ({
        mentor: (await tx<{ id: string; cal_link: string }[]>`select id, email, cal_link from public.mentors where id = ${c.mentor.id}`).map((r) => r.id),
        mentees: (await tx<{ id: string }[]>`select id from public.mentees where id in (${c.mentee.id}, ${c.otherMentee.id})`).map((r) => r.id).sort(),
        note: (await tx<{ id: string }[]>`select id from public.notifications where id = ${noteId}`).map((r) => r.id),
      });
      await c.as.mentor();
      expect(await read()).toEqual({ mentor: [c.mentor.id], mentees: [c.mentee.id], note: [noteId] });
      await c.as.mentee();
      expect(await read()).toEqual({ mentor: [], mentees: [c.mentee.id], note: [] });
      await c.as.other();
      expect(await read()).toEqual({ mentor: [], mentees: [c.otherMentee.id], note: [] });
      await c.as.linked();
      const linkedView = await read();
      expect({ mentor: linkedView.mentor, note: linkedView.note }).toEqual({ mentor: [], note: [] });
      expect(linkedView.mentees).not.toContain(c.mentee.id);
      await c.as.stranger();
      expect(await read()).toEqual({ mentor: [], mentees: [], note: [] });
      await asRole(tx, 'authenticated', claims(lonerSub, loner.email));
      expect(await read()).toEqual({ mentor: [], mentees: [], note: [] });
      await c.as.admin();
      expect(await read()).toEqual({ mentor: [c.mentor.id], mentees: [c.mentee.id, c.otherMentee.id].sort(), note: [noteId] });
      // Only the recipient marks it read.
      for (const who of ['admin', 'stranger', 'mentee'] as const) {
        await c.as[who]();
        expect(await tx`update public.notifications set is_read = true where id = ${noteId} returning id`).toHaveLength(0);
      }
      await c.as.mentor();
      expect(await tx`update public.notifications set is_read = true where id = ${noteId} returning is_read`).toEqual([{ is_read: true }]);
      await c.as.anon();
      for (const table of ['mentors', 'mentees', 'notifications']) {
        await expectPgError(tx, (sp) => sp`select id from ${sp('public.' + table)} limit 1`, '42501', /permission denied/);
      }
      await asService(tx);
    });
  });

  // Allow-list and SSO tables (R1-51): admins write them; nobody promotes themselves.

  it('approved_users, access_requests and user_identifiers are written by admins only; self-registration is mentee-only', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      const approvedId = randomUUID();
      const requestId = randomUUID();
      const identifierId = randomUUID();
      await tx`insert into public.approved_users (id, amazon_alias, email, role, is_active, approved_by, approved_at)
               values (${approvedId}, ${`itok${rand()}`}, ${`ok.${rand()}@amazon.com`}, 'mentor', true, 'it', now())`;
      await tx`insert into public.access_requests (id, amazon_alias, email, status, requested_at)
               values (${requestId}, ${`itreq${rand()}`}, 'req@amazon.com', 'pending', now())`;
      await tx`insert into public.user_identifiers (id, user_id, provider, subject, created_at)
               values (${identifierId}, ${c.ids.mentee}, 'amazon', ${`itsubj${rand()}`}, now())`;
      for (const who of ['mentee', 'mentor', 'linked', 'stranger'] as const) {
        await c.as[who]();
        await expectPgError(tx, (sp) => sp`
          insert into public.approved_users (id, amazon_alias, email, role, is_active, approved_by, approved_at)
          values (${randomUUID()}, ${`evil${rand()}`}, 'stranger@mentorconnect.test', 'admin', true, 'self', now())`, '42501', /row-level security/);
        expect(await tx`update public.approved_users set role = 'admin' where id = ${approvedId} returning id`).toHaveLength(0);
        expect(await tx`delete from public.approved_users where id = ${approvedId} returning id`).toHaveLength(0);
        await expectPgError(tx, (sp) => sp`
          insert into public.access_requests (id, amazon_alias, email, status, requested_at)
          values (${randomUUID()}, ${`evil${rand()}`}, 'x@amazon.com', 'approved', now())`, '42501', /row-level security/);
        expect(await tx`update public.access_requests set status = 'approved' where id = ${requestId} returning id`).toHaveLength(0);
        expect(await tx`delete from public.access_requests where id = ${requestId} returning id`).toHaveLength(0);
        await expectPgError(tx, (sp) => sp`
          insert into public.user_identifiers (id, user_id, provider, subject, created_at)
          values (${randomUUID()}, ${c.ids.mentee}, 'amazon', ${`evil${rand()}`}, now())`, '42501', /row-level security/);
        expect(await tx`update public.user_identifiers set user_id = ${c.ids.mentor} where id = ${identifierId} returning id`).toHaveLength(0);
        expect(await tx`delete from public.user_identifiers where id = ${identifierId} returning id`).toHaveLength(0);
      }
      await c.as.admin();
      expect(await tx`update public.approved_users set role = 'admin' where id = ${approvedId} returning role`).toEqual([{ role: 'admin' }]);
      expect(await tx`update public.access_requests set status = 'approved' where id = ${requestId} returning status`).toEqual([{ status: 'approved' }]);
      expect(await tx`delete from public.approved_users where id = ${approvedId} returning id`).toHaveLength(1);
      await tx`insert into public.approved_users (id, amazon_alias, email, role, is_active, approved_by, approved_at)
               values (${randomUUID()}, ${`itadm${rand()}`}, 'new@amazon.com', 'mentor', true, 'admin', now())`;
      // A new account registers itself as a mentee only.
      await c.as.stranger();
      for (const userType of ['mentor', 'admin']) {
        await expectPgError(tx, (sp) => sp`
          insert into public.users (id, email, password, user_type, created_at)
          values (${c.ids.stranger}, 'stranger@mentorconnect.test', 'x', ${userType}, now())`, '42501');
      }
      expect(await tx`insert into public.users (id, email, password, user_type, created_at)
                      values (${c.ids.stranger}, 'stranger@mentorconnect.test', 'x', 'mentee', now()) returning user_type`).toEqual([{ user_type: 'mentee' }]);
      await asService(tx);
    });
  });

  // Availability and notes (R1-59).

  it('mentor_availability is written only by its mentor (or an admin); booking_notes are read only by the parties and admins', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      const loner = await mkMentor(tx);
      const lonerSub = randomUUID();
      await mkUser(tx, { id: lonerSub, email: loner.email, user_type: 'mentor' });
      const slot = randomUUID();
      await tx`insert into public.mentor_availability (id, mentor_id, day_of_week, start_time, end_time, is_active, created_at)
               values (${slot}, ${c.mentor.id}, 1, '09:00', '10:00', true, now())`;
      const [{ id: noteId }] = await tx<{ id: string }[]>`
        insert into public.booking_notes (booking_id, author_type, author_email, content)
        values (${c.pending}, 'mentor', ${c.mentor.email}, 'private note about the mentee') returning id`;
      const outsiders = [
        () => c.as.stranger(), () => c.as.linked(), () => c.as.other(),
        () => asRole(tx, 'authenticated', claims(lonerSub, loner.email)),
      ];
      for (const as of outsiders) {
        await as();
        expect(await tx`delete from public.mentor_availability where mentor_id = ${c.mentor.id} returning id`).toHaveLength(0);
        expect(await tx`update public.mentor_availability set end_time = '11:00' where mentor_id = ${c.mentor.id} returning id`).toHaveLength(0);
        await expectPgError(tx, (sp) => sp`
          insert into public.mentor_availability (mentor_id, day_of_week, start_time, end_time, is_active)
          values (${c.mentor.id}, 2, '09:00', '10:00', true)`, '42501', /row-level security/);
        expect(await tx`select id from public.booking_notes where id = ${noteId}`).toEqual([]);
      }
      await c.as.mentee();
      expect(await tx`select id from public.booking_notes where id = ${noteId}`).toEqual([{ id: noteId }]);
      await c.as.admin();
      expect(await tx`select id from public.booking_notes where id = ${noteId}`).toEqual([{ id: noteId }]);
      await c.as.mentor();
      expect(await tx`select id from public.booking_notes where id = ${noteId}`).toEqual([{ id: noteId }]);
      expect(await tx`update public.mentor_availability set end_time = '11:00' where id = ${slot} returning end_time`).toEqual([{ end_time: '11:00' }]);
      await asService(tx);
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.mentor_availability where mentor_id = ${c.mentor.id}`;
      expect(n).toBe(1);
    });
  });

  // Size limits (R1-12): client-written free text is bounded; a notification is read-only for its
  // recipient except is_read.

  it('size limits: activity rows, notes and tasks are bounded; a recipient only marks a notification read', async () => {
    await withTx(sql, async (tx) => {
      const c = await cast(tx);
      await c.as.mentor();
      const event = (summary: string, meta: Record<string, unknown> = {}) => (sp: Tx) => sp`
        insert into public.activity_events (actor_type, actor_id, type, visible_to, summary, meta)
        values ('mentor', ${c.mentor.id}, 'profile_updated', ${[c.mentor.id]}, ${summary}, ${sp.json(meta as never)})`;
      await expectPgError(tx, event('a'.repeat(100_000)), '42501', /row-level security/);
      await expectPgError(tx, event('Updated my profile', { blob: 'b'.repeat(20_000) }), '42501', /row-level security/);
      await event('Updated my profile', { field: 'bio' })(tx);
      await expectPgError(tx, (sp) => sp`
        insert into public.booking_notes (booking_id, author_type, author_email, content)
        values (${c.pending}, 'mentor', ${c.mentor.email}, ${'n'.repeat(10_001)})`, '23514', /booking_notes_content_length/);
      await tx`insert into public.booking_notes (booking_id, author_type, author_email, content)
               values (${c.pending}, 'mentor', ${c.mentor.email}, ${'n'.repeat(10_000)})`;
      await expectPgError(tx, (sp) => sp`
        insert into public.mentor_tasks (mentor_id, title, updated_at) values (${c.mentor.id}, ${'t'.repeat(501)}, now())`, '23514', /mentor_tasks_title_length/);
      await expectPgError(tx, (sp) => sp`
        insert into public.mentor_tasks (mentor_id, title, description, updated_at)
        values (${c.mentor.id}, 'Prepare', ${'d'.repeat(10_001)}, now())`, '23514', /mentor_tasks_description_length/);
      await tx`insert into public.mentor_tasks (mentor_id, title, description, updated_at) values (${c.mentor.id}, 'Prepare', 'Slides', now())`;
      await asService(tx);
      const [{ id: noteId }] = await tx<{ id: string }[]>`
        insert into public.notifications (recipient_email, recipient_type, type, title, message, booking_id)
        values (${c.mentor.email}, 'mentor', 'booking_request', 'New booking request', 'Original text', ${c.pending}) returning id`;
      await c.as.mentor();
      await expectPgError(tx, (sp) => sp`update public.notifications set message = ${'x'.repeat(100_000)} where id = ${noteId}`, '42501', /permission denied/);
      await expectPgError(tx, (sp) => sp`update public.notifications set title = 'Rewritten' where id = ${noteId}`, '42501', /permission denied/);
      expect(await tx`update public.notifications set is_read = true where id = ${noteId} returning is_read, message`).toEqual([{ is_read: true, message: 'Original text' }]);
      await asService(tx);
    });
  });
});
