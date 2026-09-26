import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { Accounts, anonClient, itEmail, lazyClient, rand, serviceClient } from './fixtures.ts';
import { useStackEnv } from './http.ts';
import { connect } from './sql.ts';
import { startMockIdp, type MockIdp } from '../helpers/mockIdp.ts';
import { CookieJar, invoke, nextIp } from '../helpers/vercel.ts';

/**
 * I19b — Amazon accounts against the REAL local stack (GoTrue, PostgREST, the real SSO handlers
 * and Pranav's mock IdP; nothing in the SSO code or its helpers is changed):
 *   - an Amazon account cannot give itself a password through the Auth API, so a password never
 *     outlives an admin's deactivation of the alias (R1-37; the auth.users trigger of 0002 §3a);
 *     an e-mail account still changes its password;
 *   - the bridge still links a legacy account (rotateAuthPassword runs before the alias is set);
 *   - users.profile_id is linked by the bridge (approved_users.mentor_id) and by the onboarding
 *     and registration writes of the account itself, and by nothing else (R1-07).
 */
const sql = connect();
const admin = lazyClient(serviceClient);
const accounts = new Accounts();
const CLIENT_ID = 'mentor-amazon.vercel.app';
const CLIENT_SECRET = 'integration-client-secret-not-real';
const APP_ORIGIN = 'https://mentor-amazon.vercel.app';
const REDIRECT_URI = `${APP_ORIGIN}/api/auth/callback/amazon`;
const aliases: string[] = [];
const newAlias = () => {
  const alias = `itpw${randomBytes(4).toString('hex')}`;
  aliases.push(alias);
  return alias;
};

let idp: MockIdp;
let restore = () => {};
let login: (req: never, res: never) => Promise<void>;
let callback: (req: never, res: never) => Promise<void>;

beforeAll(async () => {
  idp = await startMockIdp({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI });
  restore = useStackEnv({
    AMAZON_OIDC_ISSUER: idp.issuer,
    AMAZON_OIDC_CLIENT_ID: CLIENT_ID,
    AMAZON_OIDC_CLIENT_SECRET: CLIENT_SECRET,
    AMAZON_OIDC_REDIRECT_URI: REDIRECT_URI,
    AMAZON_OIDC_SCOPES: undefined,
    AMAZON_OIDC_DEBUG: undefined,
    APP_ORIGIN,
  });
  login = (await import('../../api/auth/login/amazon.ts')).default as never;
  callback = (await import('../../api/auth/callback/amazon.ts')).default as never;
});

afterAll(async () => {
  for (const alias of aliases) {
    const users = await sql<{ id: string; email: string }[]>`select id, email from public.users where amazon_alias = ${alias}`;
    await sql`delete from public.user_identifiers where lower(subject) = ${alias}`;
    await sql`delete from public.users where amazon_alias = ${alias}`;
    await sql`delete from public.approved_users where lower(amazon_alias) = ${alias}`;
    for (const u of users) {
      accounts.track(u.email);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await accounts.cleanup(sql);
  restore();
  await idp.close();
  await sql.end();
});

/** login → IdP authorize (approves as `alias`) → callback; returns the final redirect. */
async function signIn(alias: string): Promise<URL> {
  idp.reset({ claims: () => ({ sub: alias }) });
  const jar = new CookieJar();
  const ip = nextIp();
  const start = await invoke(login as never, '/api/auth/login/amazon?returnTo=/mentor-portal', { jar, ip });
  expect(start.statusCode).toBe(302);
  const authorize = await fetch(start.location, { redirect: 'manual' });
  expect(authorize.status).toBe(302);
  const back = new URL(authorize.headers.get('location') ?? '');
  const done = await invoke(callback as never, `${back.pathname}${back.search}`, { jar, ip });
  expect(done.statusCode).toBe(302);
  return new URL(done.location);
}

/** The session the SPA gets from the bridge redirect. */
async function bridgeSession(location: URL) {
  expect(location.pathname).toBe('/auth/sso');
  const client = anonClient();
  const token = new URLSearchParams(location.hash.slice(1)).get('token_hash') ?? '';
  const { data, error } = await client.auth.verifyOtp({ token_hash: token, type: 'magiclink' });
  expect(error).toBeNull();
  return { client, user: data.session!.user };
}

async function passwordHash(id: string): Promise<string | null> {
  const [row] = await sql<{ h: string | null }[]>`select encrypted_password as h from auth.users where id = ${id}`;
  return row.h;
}

describeDb('I19b Amazon accounts have no password (R1-37)', () => {
  it('an Amazon session cannot set a password with updateUser, so no password sign-in exists to survive a deactivation', async () => {
    const alias = newAlias();
    const { client, user } = await bridgeSession(await signIn(alias));
    const before = await passwordHash(user.id);
    const chosen = `Chosen-${rand(6)}!`;
    const { error } = await client.auth.updateUser({ password: chosen });
    expect(error, 'GoTrue refuses the new password').not.toBeNull();
    expect(await passwordHash(user.id)).toBe(before);
    const attempt = await anonClient().auth.signInWithPassword({ email: user.email!, password: chosen });
    expect(attempt.error?.code).toBe('invalid_credentials');
    // Deactivated: the bridge refuses, and there is no password to fall back on.
    await admin.from('approved_users').update({ is_active: false }).ilike('amazon_alias', alias);
    const refused = await signIn(alias);
    expect(refused.pathname).toBe('/request-access');
    expect((await anonClient().auth.signInWithPassword({ email: user.email!, password: chosen })).error).not.toBeNull();
    // The session itself still works for everything else (profile metadata, the users row).
    const meta = await client.auth.updateUser({ data: { full_name: 'Still Allowed' } });
    expect(meta.error).toBeNull();
  });

  it('an e-mail account still changes its password and signs in with it', async () => {
    const account = await accounts.create('pw-mentee', { userType: 'mentee' });
    const next = `Next-${rand(6)}!`;
    const { error } = await account.client.auth.updateUser({ password: next });
    expect(error).toBeNull();
    const again = await anonClient().auth.signInWithPassword({ email: account.email, password: next });
    expect(again.error).toBeNull();
    expect(again.data.user?.id).toBe(account.id);
  });

  it('the bridge still links a legacy account: its old password is rotated away and the Amazon session works', async () => {
    const alias = newAlias();
    const email = itEmail('legacy-mentor');
    accounts.track(email);
    const oldPassword = `Legacy-${rand(6)}!`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password: oldPassword, email_confirm: true });
    expect(createError).toBeNull();
    const authId = created.user!.id;
    accounts.authIds.push(authId);
    await sql`insert into public.users (id, email, password, user_type, is_verified, created_at)
              values (${authId}, ${email}, 'managed-by-supabase-auth', 'mentor', false, now())`;
    await sql`insert into public.approved_users (id, amazon_alias, email, role, is_active, approved_by, approved_at)
              values (${randomUUID()}, ${alias}, ${email}, 'mentor', true, 'admin', now())`;
    expect((await anonClient().auth.signInWithPassword({ email, password: oldPassword })).error).toBeNull();

    const { user } = await bridgeSession(await signIn(alias));
    expect(user.id).toBe(authId);
    const [row] = await sql`select amazon_alias, is_verified from public.users where id = ${authId}`;
    expect(row).toEqual({ amazon_alias: alias, is_verified: true });
    expect((await anonClient().auth.signInWithPassword({ email, password: oldPassword })).error?.code).toBe('invalid_credentials');
    // Once linked, even the service role cannot put a password back on it.
    const { error } = await admin.auth.admin.updateUserById(authId, { password: oldPassword });
    expect(error).not.toBeNull();
  });
});

describeDb('I19b profile links (R1-07)', () => {
  it('the bridge links the profile an admin assigned (approved_users.mentor_id) on the first sign-in', async () => {
    const alias = newAlias();
    const profileEmail = itEmail('legacy-profile');
    accounts.track(profileEmail);
    const mentorId = randomUUID();
    await sql`insert into public.mentors (id, name, email, timezone, bio, cal_link, expertise, industries, languages_spoken,
                                          comms_owner, is_available, created_at, updated_at)
              values (${mentorId}, 'Legacy Mentor', ${profileEmail}, 'UTC', 'bio', 'legacy/30min', ${['x']}, ${['x']},
                      ${['English']}, 'exec', true, now(), now())`;
    await sql`insert into public.approved_users (id, amazon_alias, email, role, mentor_id, is_active, approved_by, approved_at)
              values (${randomUUID()}, ${alias}, null, 'mentor', ${mentorId}, true, 'admin', now())`;
    const { client, user } = await bridgeSession(await signIn(alias));
    const [row] = await sql`select profile_id from public.users where id = ${user.id}`;
    expect(row.profile_id).toBe(mentorId);
    // The link gives this account its profile: the full row and its webhook settings.
    const own = await client.from('mentors').select('id, email').eq('id', mentorId).single();
    expect(own.data).toEqual({ id: mentorId, email: profileEmail });
    const webhook = await client.rpc('get_my_cal_webhook', { p_mentor_id: mentorId });
    expect(webhook.error).toBeNull();
    // It cannot move the link to someone else's profile.
    const other = await client.from('users').update({ profile_id: randomUUID() }).eq('id', user.id);
    expect(other.error?.code).toBe('42501');
  });

  it('onboarding (a mentor) and registration (a mentee) link their own new row through PostgREST; any other row is refused', async () => {
    // An Amazon mentor onboarding: the mentors row carries the session e-mail.
    const alias = newAlias();
    const { client, user } = await bridgeSession(await signIn(alias));
    const mentorId = randomUUID();
    const now = new Date().toISOString();
    const insert = await client.from('mentors').insert({
      id: mentorId, name: 'New Mentor', email: user.email, timezone: 'UTC', bio: 'bio', cal_link: `${alias}/30min`,
      expertise: ['x'], industries: ['x'], languages_spoken: ['English'], comms_owner: 'exec', is_available: true,
      created_at: now, updated_at: now, average_rating: '0', total_ratings: 0,
    }).select('id').single();
    expect(insert.error).toBeNull();
    const link = await client.from('users').update({ profile_id: mentorId }).eq('id', user.id).select('profile_id').single();
    expect(link.error).toBeNull();
    expect(link.data).toEqual({ profile_id: mentorId });
    const [{ id: someoneElse }] = await sql<{ id: string }[]>`select id from public.mentors where id <> ${mentorId} limit 1`;
    const hijack = await client.from('users').update({ profile_id: someoneElse }).eq('id', user.id);
    expect(hijack.error?.code).toBe('42501');

    // A mentee registering: the mentees row carries the session e-mail.
    const mentee = await accounts.create('register-mentee', { userType: 'mentee' });
    const menteeId = randomUUID();
    const reg = await mentee.client.from('mentees').insert({
      id: menteeId, name: 'New Mentee', email: mentee.email, user_type: 'individual', timezone: 'UTC',
      languages_spoken: ['English'], areas_exploring: ['Career Development'], created_at: now,
    });
    expect(reg.error).toBeNull();
    const own = await mentee.client.from('users').update({ profile_id: menteeId }).eq('id', mentee.id).select('profile_id').single();
    expect(own.error).toBeNull();
    expect(own.data).toEqual({ profile_id: menteeId });
    const steal = await mentee.client.from('users').update({ profile_id: mentorId }).eq('id', mentee.id);
    expect(steal.error?.code).toBe('42501');
    const [row] = await sql`select profile_id from public.users where id = ${mentee.id}`;
    expect(row.profile_id).toBe(menteeId);
  });
});

/** supabase_setup_v2.sql §8 (first admin) with its two values filled in, as TESTING.md step 7 says. */
function firstAdminBlock(email: string, alias: string): string {
  const v2 = readFileSync(new URL('../../supabase_setup_v2.sql', import.meta.url), 'utf8');
  const section = v2.slice(v2.indexOf('-- 8. FIRST ADMIN'), v2.indexOf('-- 9. VERIFICATION'));
  const block = section.slice(section.indexOf('DO $$'), section.lastIndexOf('END $$;') + 'END $$;'.length);
  const filled = block
    .replace(/v_email text := '[^']*';/, `v_email text := '${email}';`)
    .replace(/v_alias text := '[^']*';/, `v_alias text := '${alias}';`);
  expect(filled).toContain(`'${email}'`);
  return filled;
}

/** 0002's password step, exactly as the file runs it (drop the guard, retire Amazon passwords, re-create it). */
function amazonPasswordStep(): string {
  const m = readFileSync(new URL('../../migrations/0002_production_readiness.sql', import.meta.url), 'utf8');
  const start = m.indexOf('DROP TRIGGER IF EXISTS auth_users_block_sso_password ON auth.users;');
  const create = m.indexOf('CREATE TRIGGER auth_users_block_sso_password', start);
  const end = m.indexOf(';', create) + 1;
  expect(start).toBeGreaterThan(0);
  return m.slice(start, end);
}

describeDb('I19c the first-admin bootstrap (supabase_setup_v2.sql §8)', () => {
  it('an e-mail/password admin keeps a working password: §8 (even with an alias given), a password change and a re-run of 0002', async () => {
    const account = await accounts.create('first-admin', { userType: 'mentee' });
    const alias = newAlias();
    await sql.unsafe(firstAdminBlock(account.email, alias));
    const [row] = await sql`select user_type, amazon_alias from public.users where id = ${account.id}`;
    expect(row, 'admin, and still an e-mail account').toEqual({ user_type: 'admin', amazon_alias: null });
    const [role] = await sql`select role, is_active, lower(email) as email from public.approved_users where lower(amazon_alias) = ${alias}`;
    expect(role).toEqual({ role: 'admin', is_active: true, email: account.email });
    // A password change (and the reset flow, which ends in the same updateUser) works.
    const next = `Admin-${rand(6)}!`;
    expect((await account.client.auth.updateUser({ password: next })).error).toBeNull();
    // Re-running 0002 leaves an e-mail admin's password alone.
    await sql.begin((tx) => tx.unsafe(amazonPasswordStep()));
    const again = await anonClient().auth.signInWithPassword({ email: account.email, password: next });
    expect(again.error).toBeNull();
    expect(again.data.user?.id).toBe(account.id);
  });

  it('an e-mail/password admin with no Amazon alias gets the admin role and no allow-list row', async () => {
    const account = await accounts.create('first-admin-noalias', { userType: 'mentee' });
    await sql.unsafe(firstAdminBlock(account.email, ''));
    const [row] = await sql`select user_type, amazon_alias from public.users where id = ${account.id}`;
    expect(row).toEqual({ user_type: 'admin', amazon_alias: null });
    const rows = await sql`select 1 from public.approved_users where lower(email) = ${account.email}`;
    expect(rows).toHaveLength(0);
    expect((await account.client.auth.updateUser({ password: `Admin-${rand(6)}!` })).error).toBeNull();
  });

  it('an Amazon admin: §8 gives the admin role, the account stays Amazon-only, and the next Amazon sign-in keeps it admin', async () => {
    const alias = newAlias();
    const { client, user } = await bridgeSession(await signIn(alias));
    await sql.unsafe(firstAdminBlock(user.email!, alias));
    const [row] = await sql`select user_type, amazon_alias from public.users where id = ${user.id}`;
    expect(row).toEqual({ user_type: 'admin', amazon_alias: alias });
    expect((await client.auth.updateUser({ password: `Nope-${rand(6)}!` })).error, 'still no password').not.toBeNull();
    const second = await bridgeSession(await signIn(alias));
    expect(second.user.id).toBe(user.id);
    const [after] = await sql`select user_type from public.users where id = ${user.id}`;
    expect(after.user_type).toBe('admin');
  });
});
