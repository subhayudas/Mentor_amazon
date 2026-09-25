import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from './helpers/fakeSupabase.ts';
import { startMockIdp, type MockIdp } from './helpers/mockIdp.ts';
import { CookieJar, invoke, nextIp } from './helpers/vercel.ts';

/**
 * R1-60 — the Amazon callback's identity-crossing guards, driven like tests/sso-flow.test.ts
 * (real login and callback handlers, the mock Federate IdP, the in-memory Supabase). That suite
 * and the helpers are imported, never edited.
 *
 * The session the bridge hands out must belong to the account the callback resolved. When the
 * auth user that owns the e-mail is not the `users` row found for the alias (or not the auth
 * user just created), signing that auth user in would log the employee into someone else's
 * account, so the callback refuses (`auth_user_mismatch`) and no token reaches the browser.
 */

let db = new FakeSupabase();
vi.mock('../api/_lib/supabaseAdmin.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/supabaseAdmin.ts')>();
  return { ...actual, createAdminClient: () => db };
});

const { default: login } = await import('../api/auth/login/amazon.ts');
const { default: callback } = await import('../api/auth/callback/amazon.ts');

const CLIENT_ID = 'mentor-amazon.vercel.app';
const CLIENT_SECRET = 'integ-test-secret-not-real';
const REDIRECT_URI = 'https://mentor-amazon.vercel.app/api/auth/callback/amazon';
const APP_ORIGIN = 'https://mentor-amazon.vercel.app';

let idp: MockIdp;

beforeAll(async () => {
  idp = await startMockIdp({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI });
});

afterAll(async () => {
  await idp.close();
});

beforeEach(() => {
  db = new FakeSupabase();
  idp.reset();
  Object.assign(process.env, {
    AMAZON_OIDC_ISSUER: idp.issuer,
    AMAZON_OIDC_CLIENT_ID: CLIENT_ID,
    AMAZON_OIDC_CLIENT_SECRET: CLIENT_SECRET,
    AMAZON_OIDC_REDIRECT_URI: REDIRECT_URI,
    SUPABASE_URL: 'https://fake-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-not-real',
    APP_ORIGIN,
    AMAZON_OIDC_DEBUG: 'true',
  });
  delete process.env.AMAZON_OIDC_SCOPES;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

/** login → mock IdP (approves the configured subject, `jdoe`) → callback, in one browser. */
async function signIn() {
  const jar = new CookieJar();
  const ip = nextIp();
  const loginRes = await invoke(login, '/api/auth/login/amazon', { jar, ip });
  expect(loginRes.statusCode).toBe(302);
  const idpRes = await fetch(loginRes.location, { redirect: 'manual' });
  const back = new URL(idpRes.headers.get('location')!);
  const res = await invoke(callback, back.pathname + back.search, { jar, ip });
  return { res, jar, location: new URL(res.location) };
}

function expectRefusedWithoutSession(result: Awaited<ReturnType<typeof signIn>>) {
  expect(result.res.statusCode).toBe(302);
  expect(result.location.origin + result.location.pathname).toBe(`${APP_ORIGIN}/login`);
  expect(result.location.searchParams.get('error')).toBe('sso_failed');
  expect(result.location.searchParams.get('reason')).toBe('auth_user_mismatch');
  // No bridge: the one-time token never reaches the browser, and the bind cookie is not set.
  expect(result.location.hash).toBe('');
  expect(result.res.location).not.toContain('token_hash');
  expect(result.jar.cookies.has('mc_sso_bind')).toBe(false);
}

describe('account-takeover guards: the session must be the account the callback resolved', () => {
  it('refuses when the auth user owning the e-mail is not the users row found by alias', async () => {
    // users row U1 carries the alias; the auth user that owns the address is a different one, U2.
    const other = db.addAuthUser({ email: 'jdoe@amazon.com', confirmed: true, signedIn: true });
    const u1 = '11111111-1111-4111-8111-111111111111';
    db.table('users').push({ id: u1, email: 'jdoe@amazon.com', user_type: 'mentor', profile_id: null, amazon_alias: 'jdoe', is_verified: true });

    const result = await signIn();
    expectRefusedWithoutSession(result);
    expect(other.id).not.toBe(u1);
    // Nothing was re-linked or recorded for either identity.
    expect(db.table('users')).toEqual([
      { id: u1, email: 'jdoe@amazon.com', user_type: 'mentor', profile_id: null, amazon_alias: 'jdoe', is_verified: true },
    ]);
    expect(db.table('user_identifiers')).toEqual([]);
    expect(db.passwordRotations).toEqual([]);
  });

  it('refuses when the magic link for a newly created account comes back for another auth user', async () => {
    const generateLink = db.auth.admin.generateLink;
    db.auth.admin.generateLink = async (args: { type: string; email: string }) => {
      const real = await generateLink(args);
      return { ...real, data: { ...real.data, user: { id: '22222222-2222-4222-8222-222222222222' } } };
    };

    const result = await signIn();
    expectRefusedWithoutSession(result);
    // The auth user was created, but no users row or identifier was bound to the wrong id.
    expect(db.authUsers).toHaveLength(1);
    expect(db.table('users')).toEqual([]);
    expect(db.table('user_identifiers')).toEqual([]);
  });

  it('the same sign-in succeeds once the ids agree (control)', async () => {
    const owner = db.addAuthUser({ email: 'jdoe@amazon.com', confirmed: true, signedIn: true });
    db.table('users').push({ id: owner.id, email: 'jdoe@amazon.com', user_type: 'mentor', profile_id: null, amazon_alias: 'jdoe', is_verified: true });

    const result = await signIn();
    expect(result.location.pathname).toBe('/auth/sso');
    expect(new URLSearchParams(result.location.hash.slice(1)).get('token_hash')).toBeTruthy();
    expect(db.issuedLinks.map((l) => l.userId)).toEqual([owner.id]);
  });
});
