import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { anonClient, lazyClient, serviceClient } from './fixtures.ts';
import { useStackEnv } from './http.ts';
import { connect } from './sql.ts';
import { startMockIdp, type MockIdp } from '../helpers/mockIdp.ts';
import { CookieJar, invoke, nextIp } from '../helpers/vercel.ts';

/**
 * I19 — Amazon sign-in end to end against the REAL local stack (amendment AM3): the real
 * login and callback handlers, Pranav's mock IdP, and the real service-role client. Nothing in
 * the SSO code or its test helpers is changed; they are only imported. The stack is in the
 * contract state (0003 applied), so this also proves SSO works after the contract.
 */
const sql = connect();
const admin = lazyClient(serviceClient);
const CLIENT_ID = 'mentor-amazon.vercel.app';
const CLIENT_SECRET = 'integration-client-secret-not-real';
const APP_ORIGIN = 'https://mentor-amazon.vercel.app';
const REDIRECT_URI = `${APP_ORIGIN}/api/auth/callback/amazon`;
const alias = `it${randomBytes(4).toString('hex')}`;
const email = `${alias}@amazon.com`;

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
  const users = await sql<{ id: string }[]>`select id from public.users where amazon_alias = ${alias}`;
  await sql`delete from public.user_identifiers where lower(subject) = ${alias}`;
  await sql`delete from public.users where amazon_alias = ${alias}`;
  await sql`delete from public.approved_users where lower(amazon_alias) = ${alias}`;
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  restore();
  await idp.close();
  await sql.end();
});

/** login → IdP authorize (approves as `sub`) → callback; returns the final redirect. */
async function signIn(sub: string): Promise<{ location: URL; jar: CookieJar }> {
  idp.reset({ claims: () => ({ sub }) });
  const jar = new CookieJar();
  const ip = nextIp();
  const start = await invoke(login as never, '/api/auth/login/amazon?returnTo=/mentor-portal', { jar, ip });
  expect(start.statusCode).toBe(302);
  const authorize = await fetch(start.location, { redirect: 'manual' });
  expect(authorize.status).toBe(302);
  const back = new URL(authorize.headers.get('location') ?? '');
  const done = await invoke(callback as never, `${back.pathname}${back.search}`, { jar, ip });
  expect(done.statusCode).toBe(302);
  return { location: new URL(done.location), jar };
}

async function rows() {
  const users = await sql`select id, email, user_type, amazon_alias from public.users where amazon_alias = ${alias}`;
  const approved = await sql`select amazon_alias, role, approved_by, is_active from public.approved_users where lower(amazon_alias) = ${alias}`;
  const identifiers = await sql`select user_id, provider from public.user_identifiers where lower(subject) = ${alias}`;
  const auth = await sql`select id::text from auth.users where email = ${email}`;
  return { users, approved, identifiers, auth };
}

describeDb('I19 Amazon sign-in against the real stack', () => {
  it('the first sign-in creates the auth user, a mentor users row and an approved_users row, and the bridge token becomes a session', async () => {
    const { location } = await signIn(alias);
    expect(location.origin + location.pathname).toBe(`${APP_ORIGIN}/auth/sso`);
    const hash = new URLSearchParams(location.hash.slice(1));
    expect(hash.get('type')).toBe('magiclink');
    expect(hash.get('next')).toBe('/mentor-portal');

    const r = await rows();
    expect(r.users).toEqual([{ id: r.auth[0].id, email, user_type: 'mentor', amazon_alias: alias }]);
    expect(r.approved).toEqual([{ amazon_alias: alias, role: 'mentor', approved_by: 'amazon-sso', is_active: true }]);
    expect(r.identifiers).toEqual([{ user_id: r.auth[0].id, provider: 'amazon' }]);

    const client = anonClient();
    const { data, error } = await client.auth.verifyOtp({ token_hash: hash.get('token_hash')!, type: 'magiclink' });
    expect(error).toBeNull();
    expect(data.session?.user.email).toBe(email);
    // The session is a real one: RLS lets the account read its own users row.
    const own = await client.from('users').select('user_type, amazon_alias').eq('id', data.session!.user.id).single();
    expect(own.data).toEqual({ user_type: 'mentor', amazon_alias: alias });
  });

  it('a second sign-in reuses the same rows (no duplicates) and bridges again', async () => {
    const before = await rows();
    const { location } = await signIn(alias);
    expect(location.pathname).toBe('/auth/sso');
    const after = await rows();
    expect(after.users).toEqual(before.users);
    expect(after.approved).toEqual(before.approved);
    expect(after.identifiers).toEqual(before.identifiers);
    expect(after.auth).toEqual(before.auth);
    const token = new URLSearchParams(location.hash.slice(1)).get('token_hash')!;
    const { data } = await anonClient().auth.verifyOtp({ token_hash: token, type: 'magiclink' });
    expect(data.session?.user.id).toBe(before.auth[0].id);
  });

  it('an alias an admin deactivated is sent to /request-access?status=rejected with no session', async () => {
    await admin.from('approved_users').update({ is_active: false }).ilike('amazon_alias', alias);
    try {
      const { location } = await signIn(alias);
      expect(location.pathname).toBe('/request-access');
      expect(location.searchParams.get('status')).toBe('rejected');
      expect(location.searchParams.get('alias')).toBe(alias);
      expect(location.hash).toBe('');
    } finally {
      await admin.from('approved_users').update({ is_active: true }).ilike('amazon_alias', alias);
    }
  });

  it('the contract migration is in place while all of this works', async () => {
    const [{ value }] = await sql<{ value: string }[]>`select value from public.mc_settings where key = 'legacy_booking_writes'`;
    expect(value).toBe('blocked');
  });
});
