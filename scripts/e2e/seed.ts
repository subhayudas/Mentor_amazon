/**
 * E2E personas and fixture bookings on the LOCAL stack (design §5.3 A12). Idempotent, and
 * a reset: re-running puts every persona of the selected projects back into its initial
 * state (passwords, rows, fixture bookings, favourites, availability, Cal webhook, bell),
 * removes rows specs created around those personas, and removes SSO test identities
 * (aliases starting with "e2e").
 *
 *   source scripts/e2e/env.sh && npx tsx scripts/e2e/seed.ts [project ...]
 *   (also runs under vite-node; E2E_NS=b|c namespaces the personas, see e2e/fixtures/personas.ts)
 *
 * Per project:
 *   mentee         auth user + users + mentees row; party of the accepted/confirmed/completed fixtures
 *   mentee-empty   auth user + users + mentees row, no bookings
 *   mentee-new     confirmed auth user + users row, no mentees row
 *   mentor         auth user + users + approved_users + mentors row (cal_link e2e-<project>/30min)
 *   mentor-new     auth user + users + approved_users, no mentors row
 *   mentor-linked  users.profile_id (and approved_users.mentor_id) → a mentors row with another email
 *   admin          auth user + users row with user_type admin
 * Fixture bookings of `mentor`: 3 pending (from three requester mentees), 1 accepted without a
 * Cal uid, 1 confirmed with cal_event_uri starting in 20 hours, 1 completed (30 min).
 */
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import {
  ACCOUNT_PERSONAS,
  E2E_PASSWORD,
  E2E_PROJECTS,
  bookingId,
  confirmedCalUid,
  displayName,
  ids,
  mentorCalLink,
  personaAlias,
  personaEmail,
  type AccountPersona,
} from '../../e2e/fixtures/personas';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const host = new URL(DB_URL).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  console.error(`[e2e-seed] refusing to seed ${host}: local stack only`);
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error('[e2e-seed] SUPABASE_SERVICE_ROLE_KEY is not set (source scripts/e2e/env.sh)');
  process.exit(1);
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const projects = requested.length > 0 ? requested : [...E2E_PROJECTS];

const sql = postgres(DB_URL, { max: 1, onnotice: () => undefined });
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function ensureAuthUser(email: string, name: string): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`select id::text from auth.users where lower(email) = ${email}`;
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error) throw new Error(`update ${email}: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`create ${email}: ${error?.message ?? 'no user'}`);
  return data.user.id;
}

/** Remove bookings (and what references them) matching a condition, except the fixtures. */
async function purgeBookings(tx: postgres.TransactionSql, bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  await tx`delete from public.notifications where booking_id = any(${bookingIds})`;
  await tx`delete from public.booking_notes where booking_id = any(${bookingIds})`;
  await tx`delete from public.mentor_tasks where booking_id = any(${bookingIds})`;
  await tx`delete from public.mentor_activity_log where booking_id = any(${bookingIds})`;
  await tx`delete from public.mentor_earnings where booking_id = any(${bookingIds})`;
  await tx`delete from public.activity_events where subject_id = any(${bookingIds})`;
  await tx`delete from public.bookings where id = any(${bookingIds})`;
}

async function purgeMentor(tx: postgres.TransactionSql, mentorId: string): Promise<void> {
  const rows = await tx<{ id: string }[]>`select id from public.bookings where mentor_id = ${mentorId}`;
  await purgeBookings(tx, rows.map((r) => r.id));
  await tx`delete from public.mentor_tasks where mentor_id = ${mentorId}`;
  await tx`delete from public.mentor_activity_log where mentor_id = ${mentorId}`;
  await tx`delete from public.mentor_earnings where mentor_id = ${mentorId}`;
  await tx`delete from public.mentor_availability where mentor_id = ${mentorId}`;
  await tx`update public.approved_users set mentor_id = null where mentor_id = ${mentorId}`;
  await tx`update public.users set profile_id = null where profile_id = ${mentorId}`;
  await tx`delete from public.mentors where id = ${mentorId}`;
}

async function purgeMentee(tx: postgres.TransactionSql, menteeId: string): Promise<void> {
  const rows = await tx<{ id: string }[]>`select id from public.bookings where mentee_id = ${menteeId}`;
  await purgeBookings(tx, rows.map((r) => r.id));
  await tx`delete from public.mentor_tasks where mentee_id = ${menteeId}`;
  await tx`delete from public.mentor_activity_log where mentee_id = ${menteeId}`;
  await tx`delete from public.mentees where id = ${menteeId}`;
}

/** SSO test identities (mock IdP aliases starting with "e2e"): gone, so a first sign-in is a first sign-in. */
async function purgeSsoTestIdentities(): Promise<number> {
  const users = await sql<{ id: string; email: string }[]>`
    select id, email from public.users where amazon_alias like 'e2e%'`;
  await sql.begin(async (tx) => {
    for (const u of users) {
      const mentors = await tx<{ id: string }[]>`select id from public.mentors where lower(email) = lower(${u.email})`;
      for (const m of mentors) await purgeMentor(tx, m.id);
      await tx`delete from public.user_identifiers where user_id = ${u.id}`;
      await tx`delete from public.notifications where lower(recipient_email) = lower(${u.email})`;
      await tx`delete from public.users where id = ${u.id}`;
    }
    const orphanMentors = await tx<{ id: string }[]>`select id from public.mentors where lower(email) like 'e2e%@amazon.com'`;
    for (const m of orphanMentors) await purgeMentor(tx, m.id);
    await tx`delete from public.user_identifiers where provider = 'amazon' and subject like 'e2e%'`;
    await tx`delete from public.approved_users where amazon_alias like 'e2e%' and approved_by = 'amazon-sso'`;
    await tx`delete from public.access_requests where amazon_alias like 'e2e%'`;
  });
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error && !/not.?found/i.test(error.message)) throw new Error(`delete auth user ${u.email}: ${error.message}`);
  }
  return users.length;
}

async function seedProject(project: string): Promise<void> {
  const id = ids(project);
  const email = (p: AccountPersona) => personaEmail(project, p);
  const authIds = {} as Record<AccountPersona, string>;
  for (const persona of ACCOUNT_PERSONAS) {
    authIds[persona] = await ensureAuthUser(email(persona), displayName(project, persona));
  }
  const requesters = [1, 2, 3].map((n) => ({ id: id.requesters[n - 1], email: personaEmail(project, `requester-${n}`), name: displayName(project, `requester-${n}`) }));
  const fixtureIds = (['pending-1', 'pending-2', 'pending-3', 'accepted', 'confirmed', 'completed'] as const).map((k) => bookingId(project, k));
  const personaEmails = [...ACCOUNT_PERSONAS.map(email), personaEmail(project, 'mentor-linked-profile'), ...requesters.map((r) => r.email)];

  await sql.begin(async (tx) => {
    // Rows specs created around these personas (requests, registrations, onboarding).
    const strayBookings = await tx<{ id: string }[]>`
      select b.id from public.bookings b
      left join public.mentees me on me.id = b.mentee_id
      left join public.mentors m on m.id = b.mentor_id
      where b.id <> all(${fixtureIds})
        and (lower(me.email) = any(${personaEmails}) or lower(m.email) = any(${personaEmails}))`;
    await purgeBookings(tx, strayBookings.map((r) => r.id));
    const strayMentors = await tx<{ id: string }[]>`
      select id from public.mentors
      where lower(email) = any(${personaEmails}) and id <> all(${[id.mentor, id.mentorLinkedProfile]})`;
    for (const m of strayMentors) await purgeMentor(tx, m.id);
    const strayMentees = await tx<{ id: string }[]>`
      select id from public.mentees
      where lower(email) = any(${personaEmails}) and id <> all(${[id.mentee, id.menteeEmpty, ...id.requesters]})`;
    for (const m of strayMentees) await purgeMentee(tx, m.id);

    // users rows (id = auth user id)
    const userRows: Array<[AccountPersona, 'mentee' | 'mentor' | 'admin', string | null]> = [
      ['mentee', 'mentee', null],
      ['mentee-empty', 'mentee', null],
      ['mentee-new', 'mentee', null],
      ['mentor', 'mentor', null],
      ['mentor-new', 'mentor', null],
      ['mentor-linked', 'mentor', id.mentorLinkedProfile],
      ['admin', 'admin', null],
    ];

    // mentors (the persona and the profile linked to mentor-linked)
    for (const [mentorId, mentorEmail, name, calLink] of [
      [id.mentor, email('mentor'), displayName(project, 'mentor'), mentorCalLink(project)],
      [id.mentorLinkedProfile, personaEmail(project, 'mentor-linked-profile'), displayName(project, 'mentor-linked'), ''],
    ] as const) {
      await tx`
        insert into public.mentors (id, name, email, company, position, timezone, country, bio, cal_link, expertise, industries,
                                    languages_spoken, comms_owner, mentorship_preference, is_available, average_rating,
                                    total_ratings, managed_by_programme, created_at, updated_at)
        values (${mentorId}, ${name}, ${mentorEmail}, 'MentorConnect E2E', 'Test mentor', 'UTC', 'United Arab Emirates',
                'Seeded for the end-to-end tests. Helps founders with go-to-market and fundraising questions.',
                ${calLink}, ${['Go-to-market', 'Fundraising']}, ${['Technology']}, ${['English', 'Arabic']}, 'exec', 'either', true,
                0, 0, false, timezone('utc', now()), timezone('utc', now()))
        on conflict (id) do update set name = excluded.name, email = excluded.email, cal_link = excluded.cal_link,
          is_available = true, timezone = 'UTC', average_rating = 0, total_ratings = 0, managed_by_programme = false,
          bio = excluded.bio, expertise = excluded.expertise, industries = excluded.industries,
          languages_spoken = excluded.languages_spoken, photo_url = null`;
      await tx`delete from public.mentor_availability where mentor_id = ${mentorId}`;
      await tx`delete from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
    }

    for (const [persona, userType, profileId] of userRows) {
      // An older row for the same email (auth user recreated since) would collide on email.
      const stale = await tx<{ id: string }[]>`
        select id from public.users where lower(email) = ${email(persona)} and id <> ${authIds[persona]}`;
      for (const row of stale) {
        await tx`delete from public.user_identifiers where user_id = ${row.id}`;
        await tx`delete from public.users where id = ${row.id}`;
      }
      await tx`
        insert into public.users (id, email, password, user_type, profile_id, amazon_alias, is_verified, created_at)
        values (${authIds[persona]}, ${email(persona)}, 'managed-by-supabase-auth', ${userType}, ${profileId}, null, true,
                timezone('utc', now()))
        on conflict (id) do update set email = excluded.email, user_type = excluded.user_type,
          profile_id = excluded.profile_id, amazon_alias = null, is_verified = true`;
    }

    for (const [persona, mentorId] of [['mentor', id.mentor], ['mentor-new', null], ['mentor-linked', id.mentorLinkedProfile]] as const) {
      await tx`
        insert into public.approved_users (id, amazon_alias, email, role, mentor_id, is_active, approved_by, approved_at, note)
        values (gen_random_uuid()::text, ${personaAlias(project, persona)}, ${email(persona)}, 'mentor', ${mentorId}, true,
                'e2e-seed', timezone('utc', now()), 'E2E persona')
        on conflict (amazon_alias) do update set email = excluded.email, role = 'mentor', mentor_id = excluded.mentor_id,
          is_active = true`;
    }

    // mentees (personas + the three requesters behind the pending fixtures); mentee-new has none
    await tx`delete from public.mentees where lower(email) = ${email('mentee-new')}`;
    for (const [menteeId, menteeEmail, name] of [
      [id.mentee, email('mentee'), displayName(project, 'mentee')],
      [id.menteeEmpty, email('mentee-empty'), displayName(project, 'mentee-empty')],
      ...requesters.map((r) => [r.id, r.email, r.name] as const),
    ] as const) {
      await tx`
        insert into public.mentees (id, name, email, user_type, timezone, languages_spoken, areas_exploring,
                                    verification_status, created_at)
        values (${menteeId}, ${name}, ${menteeEmail}, 'individual', 'UTC', ${['English']}, ${['Career Development']},
                'unverified', timezone('utc', now()))
        on conflict (id) do update set name = excluded.name, email = excluded.email, user_type = 'individual',
          verification_status = 'unverified', verification_reference = null, timezone = 'UTC'`;
      await tx`delete from public.mentee_favorites where mentee_id = ${menteeId}`;
    }

    // fixture bookings, reset to their initial state
    const fixtures: Array<{ key: (typeof fixtureIds)[number]; mentee: string; status: string; goal: string; scheduled: string | null;
      uid: string | null; calStatus: string | null; completed: boolean; responded: boolean }> = [
      ...requesters.map((r, i) => ({
        key: fixtureIds[i], mentee: r.id, status: 'pending',
        goal: `E2E pending request ${i + 1}: help me plan a go-to-market for our pilot.`,
        scheduled: null, uid: null, calStatus: null, completed: false, responded: false,
      })),
      { key: fixtureIds[3], mentee: id.mentee, status: 'accepted', goal: 'E2E accepted request: review our fundraising narrative.',
        scheduled: null, uid: null, calStatus: null, completed: false, responded: true },
      { key: fixtureIds[4], mentee: id.mentee, status: 'confirmed', goal: 'E2E confirmed session: pricing and positioning.',
        scheduled: '20 hours', uid: confirmedCalUid(project), calStatus: 'accepted', completed: false, responded: true },
      { key: fixtureIds[5], mentee: id.mentee, status: 'completed', goal: 'E2E completed session: first investor meetings.',
        scheduled: '-3 days', uid: null, calStatus: null, completed: true, responded: true },
    ];
    for (const [i, f] of fixtures.entries()) {
      await tx`delete from public.booking_reminders where booking_id = ${f.key}`;
      await tx`
        insert into public.bookings (id, mentor_id, mentee_id, status, goal, scheduled_at, cal_event_uri, cal_status,
                                     clicked_at, responded_at, completed_at, session_duration_minutes, country, created_at)
        values (${f.key}, ${id.mentor}, ${f.mentee}, ${f.status}, ${f.goal},
                case when ${f.scheduled}::text is null then null else timezone('utc', now()) + ${f.scheduled}::interval end,
                ${f.uid}, ${f.calStatus},
                timezone('utc', now()) - ${`${10 - i} days`}::interval,
                case when ${f.responded} then timezone('utc', now()) - interval '1 day' else null end,
                case when ${f.completed} then timezone('utc', now()) - interval '3 days' + interval '30 minutes' else null end,
                case when ${f.completed} then 30 else null end,
                case when ${f.completed} then 'United Arab Emirates' else null end,
                timezone('utc', now()) - ${`${10 - i} days`}::interval)
        on conflict (id) do update set mentor_id = excluded.mentor_id, mentee_id = excluded.mentee_id,
          status = excluded.status, goal = excluded.goal, scheduled_at = excluded.scheduled_at,
          cal_event_uri = excluded.cal_event_uri, cal_status = excluded.cal_status, cal_requested_start = null,
          canceled_at = null, canceled_by = null, responded_at = excluded.responded_at,
          completed_at = excluded.completed_at, session_duration_minutes = excluded.session_duration_minutes,
          country = excluded.country, mentee_rating = null, mentee_feedback = null, mentor_rating = null,
          mentor_feedback = null, created_at = excluded.created_at, clicked_at = excluded.clicked_at`;
    }

    // A clean bell and feed for these personas.
    await tx`delete from public.notifications where lower(recipient_email) = any(${personaEmails})`;
    await tx`delete from public.activity_events
             where visible_to && ${[id.mentor, id.mentorLinkedProfile, id.mentee, id.menteeEmpty, ...id.requesters]}::text[]`;
    await tx`delete from public.mentor_activity_log where mentor_id = any(${[id.mentor, id.mentorLinkedProfile]})`;
    await tx`update public.mentors set average_rating = 0, total_ratings = 0 where id = ${id.mentor}`;
  });
  console.log(`[e2e-seed] ${project}: ${ACCOUNT_PERSONAS.length} personas, ${fixtureIds.length} fixture bookings`);
}

try {
  const removed = await purgeSsoTestIdentities();
  if (removed > 0) console.log(`[e2e-seed] removed ${removed} SSO test identities`);
  for (const project of projects) await seedProject(project);
  await sql`notify pgrst, 'reload schema'`;
} finally {
  await sql.end();
}
