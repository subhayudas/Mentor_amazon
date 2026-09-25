import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb, describeOnline } from './env.ts';
import { Accounts, GOAL, anonClient, claims, itEmail, mkBooking, mkMentee, mkMentor, mkUser, lazyClient, rand, serviceClient } from './fixtures.ts';
import { useStackEnv } from './http.ts';
import { asRole, asService, connect, expectPgError, withTx, type Tx } from './sql.ts';
import { invoke, nextIp } from '../helpers/vercel.ts';

/** I7 (request RPCs and privileges) and I12 (/api/requests end to end with Turnstile). */
const sql = connect();
const accounts = new Accounts();
afterAll(async () => {
  await accounts.cleanup(sql);
  await sql.end();
});

describeDb('I7 booking request RPCs', () => {
  it('create_booking_request (service role) creates the mentee, the booking and the mentor notification', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx);
      const email = itEmail('requester');
      const [{ r }] = await tx`select public.create_booking_request(${mentor.id}, ${email.toUpperCase()}, '  Sara K.  ', ${`  ${GOAL}  `}) as r`;
      expect(r).toMatchObject({ outcome: 'created', booking_id: expect.any(String) });
      const [b] = await tx`select b.status, b.goal, b.mentor_id, me.email, me.name, b.clicked_at is not null as clicked
                           from public.bookings b join public.mentees me on me.id = b.mentee_id where b.id = ${r.booking_id}`;
      expect(b).toEqual({ status: 'pending', goal: GOAL, mentor_id: mentor.id, email, name: 'Sara K.', clicked: true });
      const notes = await tx`select recipient_email, recipient_type, type from public.notifications where booking_id = ${r.booking_id}`;
      expect(notes).toEqual([{ recipient_email: mentor.email, recipient_type: 'mentor', type: 'booking_request' }]);
    });
  });

  it('a blank name becomes the email local part; invalid input is 22023 with the field in the message', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx);
      const email = itEmail('noname');
      const [{ r }] = await tx`select public.create_booking_request(${mentor.id}, ${email}, '   ', ${GOAL}) as r`;
      const [me] = await tx`select me.name from public.bookings b join public.mentees me on me.id = b.mentee_id where b.id = ${r.booking_id}`;
      expect(me.name).toBe(email.split('@')[0]);
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, 'not-an-email', 'x', ${GOAL})`, '22023', /invalid_email/);
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, ${email}, ${'n'.repeat(121)}, ${GOAL})`, '22023', /invalid_name/);
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, ${email}, 'x', 'too short')`, '22023', /invalid_goal/);
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, ${email}, 'x', ${'g'.repeat(1001)})`, '22023', /invalid_goal/);
    });
  });

  it('a programme-managed mentor notifies every admin and never the .invalid address', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx, { email: `featured.it-${randomUUID()}@mentorconnect.invalid`, managed_by_programme: true, cal_link: '' });
      const adminA = `admin.a.${randomUUID()}@mentorconnect.test`;
      const adminB = `admin.b.${randomUUID()}@mentorconnect.test`;
      await mkUser(tx, { email: adminA, user_type: 'admin' });
      await mkUser(tx, { email: adminB, user_type: 'admin' });
      const [{ r }] = await tx`select public.create_booking_request(${mentor.id}, ${itEmail('featured')}, 'Lina', ${GOAL}) as r`;
      const notes = await tx<{ recipient_email: string; title: string }[]>`
        select recipient_email, title from public.notifications where booking_id = ${r.booking_id}`;
      const admins = await tx<{ email: string }[]>`select lower(email) as email from public.users where user_type = 'admin'`;
      expect(notes.map((n) => n.recipient_email).sort()).toEqual(admins.map((a) => a.email).sort());
      expect(notes.map((n) => n.recipient_email)).toEqual(expect.arrayContaining([adminA, adminB]));
      expect(notes.every((n) => !n.recipient_email.endsWith('.invalid'))).toBe(true);
      expect(notes[0].title).toBe('New request for IT Mentor (programme-managed)');
    });
  });

  it('an unavailable (or unknown) mentor is 42501 mentor_unavailable', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx, { is_available: false });
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, ${itEmail('x')}, 'x', ${GOAL})`, '42501', /mentor_unavailable/);
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${randomUUID()}, ${itEmail('x')}, 'x', ${GOAL})`, '42501', /mentor_unavailable/);
    });
  });

  it('nobody can request a session with themselves (own address, linked profile, or signed in as the mentor)', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx);
      const [{ n: before }] = await tx`select count(*)::int as n from public.bookings where mentor_id = ${mentor.id}`;
      // Anonymous path under the mentor's own address (any case).
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, ${mentor.email.toUpperCase()}, 'x', ${GOAL})`, '42501', /not_allowed/);
      // Signed in with the mentor's own JWT e-mail.
      const mentorSub = randomUUID();
      await mkUser(tx, { id: mentorSub, email: mentor.email, user_type: 'mentor' });
      await asRole(tx, 'authenticated', claims(mentorSub, mentor.email));
      await expectPgError(tx, (sp) => sp`select public.create_my_booking_request(${mentor.id}, ${GOAL})`, '42501', /not_allowed/);
      await asService(tx);
      // An Amazon identity an admin linked to this mentor row (users.profile_id), both paths.
      const linkedEmail = itEmail('linked');
      const linkedSub = randomUUID();
      await mkUser(tx, { id: linkedSub, email: linkedEmail, user_type: 'mentor', profile_id: mentor.id });
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, ${linkedEmail}, 'x', ${GOAL})`, '42501', /not_allowed/);
      await asRole(tx, 'authenticated', claims(linkedSub, linkedEmail));
      await expectPgError(tx, (sp) => sp`select public.create_my_booking_request(${mentor.id}, ${GOAL})`, '42501', /not_allowed/);
      await asService(tx);
      const [{ n: after }] = await tx`select count(*)::int as n from public.bookings where mentor_id = ${mentor.id}`;
      expect(after).toBe(before);
      const [{ n: mentees }] = await tx`select count(*)::int as n from public.mentees where lower(email) in (${mentor.email}, ${linkedEmail})`;
      expect(mentees).toBe(0);
      // The same signed-in mentor can still request another mentor.
      const other = await mkMentor(tx);
      await asRole(tx, 'authenticated', claims(mentorSub, mentor.email));
      const [{ r }] = await tx`select public.create_my_booking_request(${other.id}, ${GOAL}) as r`;
      expect(r).toMatchObject({ outcome: 'created' });
      await asService(tx);
    });
  });

  it('a second request while one is pending returns already_pending and writes nothing', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx);
      const email = itEmail('twice');
      const [{ r: first }] = await tx`select public.create_booking_request(${mentor.id}, ${email}, 'x', ${GOAL}) as r`;
      const [{ n: before }] = await tx`select count(*)::int as n from public.bookings where mentor_id = ${mentor.id}`;
      const [{ r: second }] = await tx`select public.create_booking_request(${mentor.id}, ${email}, 'x', ${GOAL}) as r`;
      expect(second).toEqual({ outcome: 'already_pending', booking_id: first.booking_id });
      const [{ n: after }] = await tx`select count(*)::int as n from public.bookings where mentor_id = ${mentor.id}`;
      expect(after).toBe(before);
    });
  });

  it('the 6th request from one mentee within an hour is P0001 rate_limited', async () => {
    await withTx(sql, async (tx) => {
      const email = itEmail('busy');
      for (let i = 0; i < 5; i++) {
        const m = await mkMentor(tx);
        await tx`select public.create_booking_request(${m.id}, ${email}, 'x', ${GOAL})`;
      }
      const sixth = await mkMentor(tx);
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${sixth.id}, ${email}, 'x', ${GOAL})`, 'P0001', /rate_limited/);
    });
  });

  it('anon cannot execute the request RPCs or get_or_create_mentee', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx);
      await asRole(tx, 'anon');
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, 'a@b.co', 'x', ${GOAL})`, '42501', /permission denied/);
      await expectPgError(tx, (sp) => sp`select public.create_my_booking_request(${mentor.id}, ${GOAL})`, '42501', /permission denied/);
      await expectPgError(tx, (sp) => sp`select public.get_or_create_mentee('a@b.co', 'x')`, '42501', /permission denied/);
      await expectPgError(tx, (sp) => sp`select public._create_booking_request(${mentor.id}, 'a@b.co', 'x', ${GOAL})`, '42501', /permission denied/);
      await asRole(tx, 'authenticated', claims(randomUUID(), 'someone@mentorconnect.test'));
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, 'a@b.co', 'x', ${GOAL})`, '42501', /permission denied/);
      await expectPgError(tx, (sp) => sp`select public.get_or_create_mentee('a@b.co', 'x')`, '42501', /permission denied/);
      await asService(tx);
    });
  });

  it('create_my_booking_request always uses the JWT email; there is no email parameter', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx);
      const existing = await mkMentee(tx, { name: 'Registered Name' });
      await asRole(tx, 'authenticated', claims(randomUUID(), existing.email.toUpperCase()));
      const [{ r }] = await tx`select public.create_my_booking_request(${mentor.id}, ${GOAL}) as r`;
      await asService(tx);
      const [b] = await tx`select b.mentee_id from public.bookings b where b.id = ${r.booking_id}`;
      expect(b.mentee_id).toBe(existing.id);
      const [{ exists }] = await tx`select to_regprocedure('public.create_my_booking_request(text,text,text,text)') is not null as exists`;
      expect(exists).toBe(false);
      await asRole(tx, 'authenticated', { sub: randomUUID() });
      await expectPgError(tx, (sp) => sp`select public.create_my_booking_request(${mentor.id}, ${GOAL})`, '42501', /not_allowed/);
      await asService(tx);
    });
  });

  it('direct PostgREST inserts into bookings fail as anon and as a signed-in user; the RPCs work', async () => {
    const admin = lazyClient(serviceClient);
    const mentorEmail = itEmail('pgrst-mentor');
    accounts.track(mentorEmail);
    const mentorId = randomUUID();
    const { error: mentorError } = await admin.from('mentors').insert({
      id: mentorId, name: 'PGRST Mentor', email: mentorEmail, timezone: 'UTC', bio: 'x', cal_link: 'pgrst/30min',
      expertise: ['x'], industries: ['x'], languages_spoken: ['English'], comms_owner: 'exec',
    });
    expect(mentorError).toBeNull();
    const row = { id: randomUUID(), mentor_id: mentorId, mentee_id: randomUUID(), status: 'pending', created_at: new Date().toISOString() };

    const anon = await anonClient().from('bookings').insert(row);
    expect(anon.error?.code).toBe('42501');
    const anonRpc = await anonClient().rpc('create_booking_request', { p_mentor_id: mentorId, p_email: 'a@b.co', p_name: 'x', p_goal: GOAL });
    expect(anonRpc.error?.code).toBe('42501');

    const mentee = await accounts.create('pgrst-mentee', { userType: 'mentee' });
    const signedIn = await mentee.client.from('bookings').insert(row);
    expect(signedIn.error?.code).toBe('42501');
    const viaRpc = await mentee.client.rpc('create_my_booking_request', { p_mentor_id: mentorId, p_goal: GOAL, p_name: 'Pat' });
    expect(viaRpc.error).toBeNull();
    expect(viaRpc.data).toMatchObject({ outcome: 'created' });
    const again = await mentee.client.rpc('create_my_booking_request', { p_mentor_id: mentorId, p_goal: GOAL });
    expect(again.data).toMatchObject({ outcome: 'already_pending' });
    const { data: mine } = await mentee.client.from('bookings').select('id, status');
    expect(mine).toEqual([{ id: (viaRpc.data as { booking_id: string }).booking_id, status: 'pending' }]);
  });
});

describeDb('I7 requests under an address that has an account (R1-08)', () => {
  it('the anonymous path attaches nothing to a registered account: no booking, no mentee row, a neutral outcome, one notice to the owner', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx, { name: 'Mentor Two' });
      const mentorSub = randomUUID();
      await mkUser(tx, { id: mentorSub, email: mentor.email, user_type: 'mentor' });
      const registered = await mkMentee(tx, { name: 'Private Person', linkedin_url: 'https://linkedin.com/in/private', goals: 'private goals', organization_name: 'Secret NGO' });
      const registeredSub = randomUUID();
      await mkUser(tx, { id: registeredSub, email: registered.email, user_type: 'mentee' });
      // An Amazon account with no mentees row at all: no row may be created in its name either.
      const amazonEmail = `it${rand()}@amazon.com`;
      await mkUser(tx, { email: amazonEmail, user_type: 'mentor' });

      const [{ r }] = await tx`select public.create_booking_request(${mentor.id}, ${registered.email.toUpperCase()}, 'Anyone', ${GOAL}) as r`;
      expect(r).toEqual({ outcome: 'sign_in_required', booking_id: null });
      const [{ r: again }] = await tx`select public.create_booking_request(${mentor.id}, ${registered.email}, 'Anyone', ${GOAL}) as r`;
      expect(again).toEqual({ outcome: 'sign_in_required', booking_id: null });
      const [{ r: amazon }] = await tx`select public.create_booking_request(${mentor.id}, ${amazonEmail}, 'Anyone', ${GOAL}) as r`;
      expect(amazon).toEqual({ outcome: 'sign_in_required', booking_id: null });

      const [{ n: bookings }] = await tx`select count(*)::int as n from public.bookings where mentor_id = ${mentor.id}`;
      expect(bookings).toBe(0);
      const [{ n: rows }] = await tx`select count(*)::int as n from public.mentees where lower(email) = ${amazonEmail}`;
      expect(rows).toBe(0);
      // The mentor learns nothing about the registered person; the person sees no request they never made.
      await asRole(tx, 'authenticated', claims(mentorSub, mentor.email));
      expect(await tx`select id from public.mentees where id = ${registered.id}`).toEqual([]);
      await asRole(tx, 'authenticated', claims(registeredSub, registered.email));
      expect(await tx`select id from public.bookings`).toEqual([]);
      // The owner is told once (twice asked, one notice), in their own bell.
      const notes = await tx<{ recipient_type: string; title: string; booking_id: string | null }[]>`
        select recipient_type, title, booking_id from public.notifications`;
      expect(notes).toEqual([{ recipient_type: 'mentee', title: 'Request not sent: please sign in', booking_id: null }]);
      // Signed in, the owner sends it.
      const [{ r: mine }] = await tx`select public.create_my_booking_request(${mentor.id}, ${GOAL}) as r`;
      expect(mine).toMatchObject({ outcome: 'created' });
      await asService(tx);
      const [b] = await tx`select mentee_id from public.bookings where id = ${mine.booking_id}`;
      expect(b.mentee_id).toBe(registered.id);
    });
  });

  it('while the pre-release client is live, get_or_create_mentee hands a registered account\'s profile only to that account', async () => {
    await withTx(sql, async (tx) => {
      // The expand state (0002 without 0003): anon and signed-in callers can execute it.
      await tx`grant execute on function public.get_or_create_mentee(text, text) to anon, authenticated`;
      const registered = await mkMentee(tx);
      const registeredSub = randomUUID();
      await mkUser(tx, { id: registeredSub, email: registered.email, user_type: 'mentee' });
      const mentor = await mkMentor(tx);
      const mentorSub = randomUUID();
      await mkUser(tx, { id: mentorSub, email: mentor.email, user_type: 'mentor' });
      await asRole(tx, 'anon');
      await expectPgError(tx, (sp) => sp`select public.get_or_create_mentee(${registered.email}, 'x')`, '42501', /not_allowed/);
      await asRole(tx, 'authenticated', claims(mentorSub, mentor.email));
      await expectPgError(tx, (sp) => sp`select public.get_or_create_mentee(${registered.email.toUpperCase()}, 'x')`, '42501', /not_allowed/);
      // Unregistered addresses keep the old behaviour (design D16), and the owner gets their own id.
      const fresh = itEmail('legacy-visitor');
      const [{ id: freshId }] = await tx`select public.get_or_create_mentee(${fresh}, 'Visitor') as id`;
      expect(freshId).toMatch(/^[0-9a-f-]{36}$/);
      await asRole(tx, 'authenticated', claims(registeredSub, registered.email));
      const [{ id: own }] = await tx`select public.get_or_create_mentee(${registered.email}, 'x') as id`;
      expect(own).toBe(registered.id);
      await asService(tx);
    });
  });
});

describeDb('I7 limits and programme-managed notices (R1-57)', () => {
  it('the 21st request to one mentor within an hour is P0001 rate_limited, whoever sends it', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx);
      for (let i = 0; i < 20; i++) {
        const [{ r }] = await tx`select public.create_booking_request(${mentor.id}, ${itEmail(`crowd${i}`)}, 'x', ${GOAL}) as r`;
        expect(r.outcome).toBe('created');
      }
      await expectPgError(tx, (sp) => sp`select public.create_booking_request(${mentor.id}, ${itEmail('crowd20')}, 'x', ${GOAL})`, 'P0001', /rate_limited/);
      const [{ n }] = await tx`select count(*)::int as n from public.bookings where mentor_id = ${mentor.id}`;
      expect(n).toBe(20);
    });
  });

  it('a programme-managed request never notifies an admin account whose address is a reserved .invalid one', async () => {
    await withTx(sql, async (tx) => {
      const mentor = await mkMentor(tx, { email: `featured.it-${randomUUID()}@mentorconnect.invalid`, managed_by_programme: true, cal_link: '' });
      const realAdmin = `admin.real.${randomUUID()}@mentorconnect.test`;
      const placeholderAdmin = `admin.${randomUUID()}@programme.invalid`;
      await mkUser(tx, { email: realAdmin, user_type: 'admin' });
      await mkUser(tx, { email: placeholderAdmin, user_type: 'admin' });
      const [{ r }] = await tx`select public.create_booking_request(${mentor.id}, ${itEmail('featured-invalid')}, 'Lina', ${GOAL}) as r`;
      const notes = await tx<{ recipient_email: string }[]>`select recipient_email from public.notifications where booking_id = ${r.booking_id}`;
      expect(notes.map((x) => x.recipient_email)).toContain(realAdmin);
      expect(notes.map((x) => x.recipient_email)).not.toContain(placeholderAdmin);
      expect(notes.every((x) => !x.recipient_email.endsWith('.invalid'))).toBe(true);
    });
  });
});

describeDb('notify_booking_event routing (R1-19, R1-23)', () => {
  async function setup(tx: Tx, mentorOver: Record<string, unknown> = {}) {
    const mentor = await mkMentor(tx, { name: 'Mentor Mona', cal_link: 'mona/30min', ...mentorOver });
    const mentee = await mkMentee(tx, { name: 'Omar' });
    const mentorSub = randomUUID();
    const menteeSub = randomUUID();
    const adminSub = randomUUID();
    const adminEmail = `admin.${randomUUID()}@mentorconnect.test`;
    await mkUser(tx, { id: mentorSub, email: mentor.email, user_type: 'mentor' });
    await mkUser(tx, { id: menteeSub, email: mentee.email, user_type: 'mentee' });
    await mkUser(tx, { id: adminSub, email: adminEmail, user_type: 'admin' });
    return {
      mentor, mentee, adminEmail,
      asMentor: () => asRole(tx, 'authenticated', claims(mentorSub, mentor.email)),
      asMentee: () => asRole(tx, 'authenticated', claims(menteeSub, mentee.email)),
      asAdmin: () => asRole(tx, 'authenticated', claims(adminSub, adminEmail)),
    };
  }
  const notes = (tx: Tx, id: string) => tx<{ recipient_email: string; recipient_type: string; type: string; title: string; message: string }[]>`
    select recipient_email, recipient_type, type, title, message from public.notifications where booking_id = ${id} order by recipient_email`;

  it('the accepted notice sends the mentee to the dashboard, never to a raw cal.com link', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      const id = await mkBooking(tx, w.mentor.id, w.mentee.id, { status: 'accepted' });
      await w.asMentor();
      await tx`select public.notify_booking_event(${id}, 'booking_accepted')`;
      await asService(tx);
      const [n] = await notes(tx, id);
      expect(n).toMatchObject({ recipient_email: w.mentee.email, type: 'booking_accepted' });
      expect(n.message).toBe('Mentor Mona has accepted your mentorship request. Choose a time from your MentorConnect dashboard.');
      expect(n.message).not.toMatch(/cal\.com/i);
    });
  });

  it('a programme-managed mentor\'s notices go to every admin (never the placeholder); the mentee hears the programme will write', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx, { email: `featured.it-${randomUUID()}@mentorconnect.invalid`, managed_by_programme: true, cal_link: '' });
      const withdrawn = await mkBooking(tx, w.mentor.id, w.mentee.id, { status: 'pending' });
      await w.asMentee();
      await tx`update public.bookings set status = 'canceled', canceled_at = now() where id = ${withdrawn}`;
      await tx`select public.notify_booking_event(${withdrawn}, 'booking_canceled')`;
      await asService(tx);
      const toAdmins = await notes(tx, withdrawn);
      const admins = await tx<{ email: string }[]>`
        select lower(email) as email from public.users where user_type = 'admin' and lower(email) not like '%.invalid'`;
      expect(toAdmins.map((n) => n.recipient_email).sort()).toEqual(admins.map((a) => a.email).sort());
      expect(toAdmins.every((n) => n.title === 'Session canceled for Mentor Mona (programme-managed)' && n.recipient_type === 'mentor')).toBe(true);
      // The admin accepts a request for the programme: the mentee hears who will arrange the time.
      const accepted = await mkBooking(tx, w.mentor.id, w.mentee.id, { status: 'pending' });
      await w.asAdmin();
      await tx`update public.bookings set status = 'accepted', responded_at = now() where id = ${accepted}`;
      await tx`select public.notify_booking_event(${accepted}, 'booking_accepted')`;
      await asService(tx);
      expect((await notes(tx, accepted)).map((n) => [n.recipient_email, n.message])).toEqual([
        [w.mentee.email, 'Mentor Mona has accepted your mentorship request. The programme team will email you to arrange a time.'],
      ]);
    });
  });

  it('an admin cancel is announced to the mentee, not to the mentor as if the mentee had cancelled', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      const id = await mkBooking(tx, w.mentor.id, w.mentee.id, { status: 'confirmed', scheduled_at: '2026-10-20 10:00:00' });
      await w.asAdmin();
      await tx`update public.bookings set status = 'canceled', canceled_at = now() where id = ${id}`;
      await tx`select public.notify_booking_event(${id}, 'booking_canceled')`;
      await asService(tx);
      expect((await notes(tx, id)).map((n) => [n.recipient_email, n.type, n.message])).toEqual([
        [w.mentee.email, 'booking_canceled', 'Mentor Mona has canceled your session.'],
      ]);
    });
  });
});

describeOnline('I12 /api/requests end to end (Cloudflare Turnstile test keys)', () => {
  const admin = lazyClient(serviceClient);
  let mentorId = '';
  let restore = () => {};
  let handler: (req: never, res: never) => Promise<void>;
  beforeAll(async () => {
    restore = useStackEnv({ VITE_TURNSTILE_SITE_KEY: undefined, TURNSTILE_ALLOWED_HOSTNAMES: undefined });
    handler = (await import('../../api/requests.ts')).default as never;
    const email = itEmail('api-mentor');
    accounts.track(email);
    mentorId = randomUUID();
    const { error } = await admin.from('mentors').insert({
      id: mentorId, name: 'API Mentor', email, timezone: 'UTC', bio: 'x', cal_link: 'api/30min',
      expertise: ['x'], industries: ['x'], languages_spoken: ['English'], comms_owner: 'exec',
    });
    if (error) throw new Error(error.message);
  });
  afterAll(() => restore());

  async function post(secret: string, requester: string) {
    process.env.TURNSTILE_SECRET_KEY = secret;
    accounts.track(requester);
    return invoke(handler as never, '/api/requests', {
      method: 'POST',
      ip: nextIp(),
      headers: { 'content-type': 'application/json' },
      body: { mentorId, name: 'Test Requester', email: requester, goal: GOAL, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' },
    });
  }

  it('the always-pass secret lets the request through and a pending booking exists', async () => {
    const requester = itEmail('api-pass');
    const res = await post('1x0000000000000000000000000000000AA', requester);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const { data } = await admin.from('bookings').select('status, mentee:mentees(email)').eq('mentor_id', mentorId);
    expect(data).toEqual([{ status: 'pending', mentee: { email: requester } }]);
  });

  it('the always-fail secret is 403 and writes nothing', async () => {
    const requester = itEmail('api-fail');
    const res = await post('2x0000000000000000000000000000000AA', requester);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'captcha_failed' });
    const { data } = await admin.from('mentees').select('id').eq('email', requester);
    expect(data).toEqual([]);
  });
});
