import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb, describeOnline } from './env.ts';
import { Accounts, GOAL, anonClient, claims, itEmail, mkBooking, mkMentee, mkMentor, mkUser, lazyClient, serviceClient } from './fixtures.ts';
import { useStackEnv } from './http.ts';
import { asRole, asService, connect, expectPgError, withTx } from './sql.ts';
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
