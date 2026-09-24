import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from './helpers/fakeSupabase.ts';
import { startMockIdp, type MockIdp } from './helpers/mockIdp.ts';
import { CookieJar, invoke, nextIp } from './helpers/vercel.ts';

/**
 * End-to-end tests of the Amazon Federate sign-in against a local IdP and an
 * in-memory Supabase: login → authorize → callback → bridge fragment, with the
 * real handlers, the real OIDC/JWT code and the real supabaseAdmin queries.
 * Only createAdminClient is swapped so it returns the in-memory database.
 */

let db = new FakeSupabase();
vi.mock('../api/_lib/supabaseAdmin.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/supabaseAdmin.ts')>();
  return { ...actual, createAdminClient: () => db };
});

const { default: login } = await import('../api/auth/login/amazon.ts');
const { default: callback } = await import('../api/auth/callback/amazon.ts');
const { default: debugClaims } = await import('../api/auth/debug-claims.ts');
const { default: logout } = await import('../api/auth/logout.ts');
const { deriveCookieKey, signValue } = await import('../api/_lib/cookies.ts');

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
  });
  delete process.env.AMAZON_OIDC_SCOPES;
  delete process.env.AMAZON_OIDC_DEBUG;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// helpers

interface SignInResult {
  jar: CookieJar;
  authorizeUrl: URL;
  callbackStatus: number;
  location: URL;
  logs: string[];
}

/** Drive a browser through login → IdP (auto-approves as the configured subject) → callback. */
async function signIn(opts: { returnTo?: string; jar?: CookieJar } = {}): Promise<SignInResult> {
  const jar = opts.jar ?? new CookieJar();
  const ip = nextIp();
  const loginPath = '/api/auth/login/amazon' + (opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : '');
  const loginRes = await invoke(login, loginPath, { jar, ip });
  expect(loginRes.statusCode).toBe(302);
  const authorizeUrl = new URL(loginRes.location);

  const idpRes = await fetch(authorizeUrl, { redirect: 'manual' });
  expect(idpRes.status).toBe(302);
  const back = new URL(idpRes.headers.get('location')!);
  expect(back.origin + back.pathname).toBe(REDIRECT_URI);

  const logSpy = vi.mocked(console.log);
  const before = logSpy.mock.calls.length;
  const cb = await invoke(callback, back.pathname + back.search, { jar, ip });
  const logs = logSpy.mock.calls.slice(before).map((c) => String(c[0]));
  return { jar, authorizeUrl, callbackStatus: cb.statusCode, location: new URL(cb.location), logs };
}

/** What /auth/sso would do with the fragment: check the bind cookie and find the issued token. */
function bridgeOf(result: SignInResult) {
  expect(result.location.origin + result.location.pathname).toBe(`${APP_ORIGIN}/auth/sso`);
  const fragment = new URLSearchParams(result.location.hash.slice(1));
  const link = db.issuedLinks.find((l) => l.hashedToken === fragment.get('token_hash'));
  return {
    fragment,
    link,
    bindMatches: !!fragment.get('bind') && fragment.get('bind') === result.jar.cookies.get('mc_sso_bind'),
  };
}

const rows = (table: string) => db.table(table);
const expectNoSession = () => expect(db.issuedLinks).toHaveLength(0);

// ---------------------------------------------------------------------------

describe('GET /api/auth/login/amazon', () => {
  it('redirects to Federate with the registered client, exact redirect URI, openid scope and S256 PKCE', async () => {
    const jar = new CookieJar();
    const res = await invoke(login, '/api/auth/login/amazon?returnTo=/mentor-portal', { jar });

    expect(res.statusCode).toBe(302);
    expect(res.getHeader('cache-control')).toBe('no-store');
    const url = new URL(res.location);
    expect(url.origin + url.pathname).toBe(`${idp.issuer}/api/oauth2/v1/authorize`);
    const p = url.searchParams;
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe(CLIENT_ID);
    expect(p.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(p.get('scope')).toBe('openid');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('state')).toBeTruthy();
    expect(p.get('nonce')).toBeTruthy();
    expect(res.location).not.toContain(CLIENT_SECRET);

    const cookie = res.setCookies.find((c) => c.startsWith('mc_oidc='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/Max-Age=600/);
  });

  it('uses AMAZON_OIDC_SCOPES when set', async () => {
    process.env.AMAZON_OIDC_SCOPES = 'openid groups';
    const res = await invoke(login, '/api/auth/login/amazon');
    expect(new URL(res.location).searchParams.get('scope')).toBe('openid groups');
  });

  it('fails closed with the missing variable names (never values) when unconfigured', async () => {
    delete process.env.AMAZON_OIDC_ISSUER;
    delete process.env.AMAZON_OIDC_CLIENT_SECRET;
    const res = await invoke(login, '/api/auth/login/amazon');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'server_misconfigured', missing: ['AMAZON_OIDC_ISSUER', 'AMAZON_OIDC_CLIENT_SECRET'] });
  });

  it('only allows GET/HEAD', async () => {
    const res = await invoke(login, '/api/auth/login/amazon', { method: 'POST' });
    expect(res.statusCode).toBe(405);
  });
});

describe('first sign-in of an Amazon employee (open access)', () => {
  it('lets them straight in as a mentor with alias@amazon.com when the token has only sub', async () => {
    const result = await signIn({ returnTo: '/mentor-portal' });

    expect(result.callbackStatus).toBe(302);
    const bridge = bridgeOf(result);
    expect(bridge.bindMatches).toBe(true);
    expect(bridge.fragment.get('type')).toBe('magiclink');
    expect(bridge.fragment.get('next')).toBe('/mentor-portal');

    // auth user + users row
    expect(db.authUsers).toHaveLength(1);
    const authUser = db.authUsers[0];
    expect(authUser.email).toBe('jdoe@amazon.com');
    expect(authUser.user_metadata).toMatchObject({ user_type: 'mentor', amazon_alias: 'jdoe' });
    expect(bridge.link?.userId).toBe(authUser.id);
    expect(rows('users')).toEqual([
      expect.objectContaining({ id: authUser.id, email: 'jdoe@amazon.com', user_type: 'mentor', amazon_alias: 'jdoe', is_verified: true, profile_id: null }),
    ]);

    // role row written so onboarding and the mentors INSERT policy accept them
    expect(rows('approved_users')).toEqual([
      expect.objectContaining({ amazon_alias: 'jdoe', email: 'jdoe@amazon.com', role: 'mentor', is_active: true, approved_by: 'amazon-sso' }),
    ]);
    expect(rows('access_requests')).toHaveLength(0);

    // identifier with claims but no token material
    const identifiers = rows('user_identifiers');
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0]).toMatchObject({ user_id: authUser.id, provider: 'amazon', subject: 'jdoe' });
    expect(JSON.stringify(identifiers[0].claims)).not.toMatch(/eyJ/);

    // the one-time OIDC cookie is gone
    expect(result.jar.cookies.has('mc_oidc')).toBe(false);
    expect(result.logs.some((l) => l.includes('callback.auto_approved') && l.includes('alias=jdoe'))).toBe(true);
  });

  it('exchanges the code with client_secret_basic, the PKCE verifier and the exact redirect URI', async () => {
    await signIn();
    expect(idp.tokenRequests).toHaveLength(1);
    const req = idp.tokenRequests[0];
    expect(req.status).toBe(200);
    expect(req.method).toBe('client_secret_basic');
    expect(req.form.grant_type).toBe('authorization_code');
    expect(req.form.redirect_uri).toBe(REDIRECT_URI);
    expect(req.form.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(req.form.client_secret).toBeUndefined();
  });

  it('falls back to client_secret_post when basic auth is rejected', async () => {
    idp.reset({ acceptedAuth: ['client_secret_post'] });
    const result = await signIn();
    expect(bridgeOf(result).link).toBeDefined();
    expect(idp.tokenRequests.map((r) => [r.method, r.status])).toEqual([
      ['client_secret_basic', 400],
      ['client_secret_post', 200],
    ]);
  });

  it('uses the email and name from the ID token when Amazon sends them', async () => {
    idp.reset({ claims: () => ({ sub: 'JDoe', email: 'Jane.Doe@Amazon.com', name: 'Jane Doe' }) });
    const result = await signIn();
    expect(bridgeOf(result).link?.email).toBe('jane.doe@amazon.com');
    expect(db.authUsers[0].user_metadata).toMatchObject({ amazon_alias: 'jdoe', full_name: 'Jane Doe' });
  });

  it('prefers an explicit amazonAlias claim over sub', async () => {
    idp.reset({ claims: () => ({ sub: 'opaque-subject-1', amazonAlias: 'jdoe' }) });
    await signIn();
    expect(rows('users')[0]).toMatchObject({ amazon_alias: 'jdoe', email: 'jdoe@amazon.com' });
  });

  it('takes the email from userinfo when the ID token lacks it', async () => {
    idp.reset({ userinfo: { email: 'jdoe+corp@amazon.com', given_name: 'Jane', family_name: 'Doe' } });
    await signIn();
    expect(db.authUsers[0].email).toBe('jdoe+corp@amazon.com');
    expect(db.authUsers[0].user_metadata.full_name).toBe('Jane Doe');
  });

  it('links a mentor profile that already exists under the same email', async () => {
    rows('mentors').push({ id: 'mentor-42', email: 'JDOE@amazon.com' });
    await signIn();
    expect(rows('users')[0].profile_id).toBe('mentor-42');
  });

  it('refuses a subject that is not alias-shaped instead of inventing an email', async () => {
    process.env.AMAZON_OIDC_DEBUG = 'true';
    idp.reset({ claims: () => ({ sub: 'jdoe@ANT.AMAZON.COM' }) });
    const result = await signIn();
    expect(result.location.pathname).toBe('/login');
    expect(result.location.searchParams.get('error')).toBe('sso_failed');
    expect(result.location.searchParams.get('reason')).toBe('alias_invalid');
    expect(db.authUsers).toHaveLength(0);
    expectNoSession();
  });
});

describe('returning users and roles', () => {
  it('signs a returning employee into the same account without duplicating rows', async () => {
    await signIn();
    const firstId = db.authUsers[0].id;
    const second = await signIn();

    expect(bridgeOf(second).link?.userId).toBe(firstId);
    expect(db.authUsers).toHaveLength(1);
    expect(rows('users')).toHaveLength(1);
    expect(rows('approved_users')).toHaveLength(1);
    expect(rows('user_identifiers')).toHaveLength(1);
    expect(rows('user_identifiers')[0].last_login_at).toBeTruthy();
  });

  it('gives an alias an admin listed as admin the admin role, using the recorded email', async () => {
    rows('approved_users').push({ id: 'a1', amazon_alias: 'jdoe', email: 'Jane.Admin@amazon.com', role: 'admin', mentor_id: null, is_active: true });
    const result = await signIn();
    expect(bridgeOf(result).link?.email).toBe('jane.admin@amazon.com');
    expect(rows('users')[0]).toMatchObject({ user_type: 'admin', amazon_alias: 'jdoe' });
    expect(rows('approved_users')).toHaveLength(1);
  });

  it('turns away an alias an admin deactivated, without creating a session', async () => {
    rows('approved_users').push({ id: 'a1', amazon_alias: 'jdoe', email: null, role: 'mentor', mentor_id: null, is_active: false });
    const result = await signIn();
    expect(result.location.pathname).toBe('/request-access');
    expect(result.location.searchParams.get('alias')).toBe('jdoe');
    expect(result.location.searchParams.get('status')).toBe('rejected');
    expect(db.authUsers).toHaveLength(0);
    expectNoSession();
  });

  it('also turns away a deactivated alias that already has an account', async () => {
    await signIn();
    rows('approved_users')[0].is_active = false;
    db.issuedLinks.length = 0;
    const result = await signIn();
    expect(result.location.searchParams.get('status')).toBe('rejected');
    expectNoSession();
  });
});

describe('account-takeover guards', () => {
  it('does not promote a self-registered mentee who used the employee’s address', async () => {
    process.env.AMAZON_OIDC_DEBUG = 'true';
    const squatter = db.addAuthUser({ email: 'jdoe@amazon.com', confirmed: true, signedIn: true });
    rows('users').push({ id: squatter.id, email: 'jdoe@amazon.com', user_type: 'mentee', profile_id: null, amazon_alias: null, is_verified: false });

    const result = await signIn();
    expect(result.location.searchParams.get('reason')).toBe('email_conflict');
    expect(rows('users')[0].user_type).toBe('mentee');
    expectNoSession();
  });

  it('links an admin-provisioned mentor row by email and kills its old password', async () => {
    const existing = db.addAuthUser({ email: 'jdoe@amazon.com', confirmed: true, signedIn: true });
    rows('users').push({ id: existing.id, email: 'jdoe@amazon.com', user_type: 'mentor', profile_id: 'mentor-7', amazon_alias: null, is_verified: false });

    const result = await signIn();
    expect(bridgeOf(result).link?.userId).toBe(existing.id);
    expect(rows('users')[0]).toMatchObject({ amazon_alias: 'jdoe', is_verified: true, profile_id: 'mentor-7' });
    expect(db.passwordRotations).toEqual([existing.id]);
  });

  it('refuses when the email already belongs to a different alias', async () => {
    process.env.AMAZON_OIDC_DEBUG = 'true';
    const other = db.addAuthUser({ email: 'jdoe@amazon.com', confirmed: true });
    rows('users').push({ id: other.id, email: 'jdoe@amazon.com', user_type: 'mentor', profile_id: null, amazon_alias: 'someoneelse', is_verified: true });
    const result = await signIn();
    expect(result.location.searchParams.get('reason')).toBe('alias_conflict');
    expectNoSession();
  });

  it('replaces an orphan auth user nobody ever used', async () => {
    const orphan = db.addAuthUser({ email: 'jdoe@amazon.com' });
    const result = await signIn();
    expect(db.deletedAuthUsers).toEqual([orphan.id]);
    expect(bridgeOf(result).link?.userId).not.toBe(orphan.id);
    expect(rows('users')).toHaveLength(1);
  });

  it('refuses to bind to an auth user that has been used but has no users row', async () => {
    process.env.AMAZON_OIDC_DEBUG = 'true';
    db.addAuthUser({ email: 'jdoe@amazon.com', confirmed: true, signedIn: true });
    const result = await signIn();
    expect(result.location.searchParams.get('reason')).toBe('auth_user_conflict');
    expectNoSession();
  });
});

describe('callback: state, code and token validation', () => {
  beforeEach(() => {
    process.env.AMAZON_OIDC_DEBUG = 'true';
  });

  const errorOf = (res: { location: string }) => {
    const url = new URL(res.location);
    return { path: url.pathname, error: url.searchParams.get('error'), reason: url.searchParams.get('reason') };
  };

  /** Start a login and return the jar plus a callback URL for the real code/state. */
  async function startLogin() {
    const jar = new CookieJar();
    const loginRes = await invoke(login, '/api/auth/login/amazon', { jar });
    const idpRes = await fetch(loginRes.location, { redirect: 'manual' });
    const back = new URL(idpRes.headers.get('location')!);
    return { jar, back };
  }

  it('rejects a callback with no round-trip cookie', async () => {
    const res = await invoke(callback, '/api/auth/callback/amazon?code=x&state=y');
    expect(errorOf(res)).toEqual({ path: '/login', error: 'sso_state', reason: 'no_cookie' });
  });

  it('rejects a state that does not match the cookie (login CSRF)', async () => {
    const { jar, back } = await startLogin();
    back.searchParams.set('state', 'attacker-state');
    const res = await invoke(callback, back.pathname + back.search, { jar });
    expect(errorOf(res).reason).toBe('state_mismatch');
    expectNoSession();
  });

  it('rejects a forged cookie', async () => {
    const { back } = await startLogin();
    const forged = signValue(deriveCookieKey('not-the-secret'), { st: back.searchParams.get('state'), nc: 'n', cv: 'v', rt: '/', iat: Date.now() });
    const res = await invoke(callback, back.pathname + back.search, { cookie: `mc_oidc=${encodeURIComponent(forged)}` });
    expect(errorOf(res).reason).toBe('no_cookie');
  });

  it('rejects a round trip older than 10 minutes', async () => {
    const stale = signValue(deriveCookieKey(CLIENT_SECRET), { st: 's1', nc: 'n', cv: 'v', rt: '/', iat: Date.now() - 11 * 60 * 1000 });
    const res = await invoke(callback, '/api/auth/callback/amazon?code=c&state=s1', { cookie: `mc_oidc=${encodeURIComponent(stale)}` });
    expect(errorOf(res).reason).toBe('expired');
  });

  it('cannot be replayed: the cookie is single-use', async () => {
    const { jar, back } = await startLogin();
    const cookieHeader = jar.header();
    const first = await invoke(callback, back.pathname + back.search, { jar });
    expect(new URL(first.location).pathname).toBe('/auth/sso');
    expect(jar.cookies.has('mc_oidc')).toBe(false);

    // Same URL again in the same browser: cookie is gone.
    const again = await invoke(callback, back.pathname + back.search, { jar });
    expect(errorOf(again).reason).toBe('no_cookie');

    // Even with the old cookie resent, the IdP refuses the used code.
    const replay = await invoke(callback, back.pathname + back.search, { cookie: cookieHeader });
    expect(errorOf(replay)).toMatchObject({ error: 'sso_token', reason: 'token_invalid_grant' });
    expect(db.issuedLinks).toHaveLength(1);
  });

  it('surfaces an IdP error (e.g. user cancelled) as sso_failed', async () => {
    const { jar, back } = await startLogin();
    const url = `/api/auth/callback/amazon?error=access_denied&state=${back.searchParams.get('state')}`;
    const res = await invoke(callback, url, { jar });
    expect(errorOf(res)).toMatchObject({ error: 'sso_failed', reason: 'provider_access_denied' });
  });

  it('reports a rejected client secret as sso_token', async () => {
    process.env.AMAZON_OIDC_CLIENT_SECRET = 'wrong-secret';
    const result = await signIn();
    expect(result.location.searchParams.get('error')).toBe('sso_token');
    expect(result.location.searchParams.get('reason')).toBe('token_invalid_client');
  });

  it('rejects an ID token signed with a key that is not in the JWKS', async () => {
    idp.reset({ signWithRogueKey: true });
    const result = await signIn();
    expect(result.location.searchParams.get('reason')).toBe('id_token_invalid');
    expectNoSession();
  });

  it('rejects an ID token issued to another client', async () => {
    idp.reset({ claims: () => ({ sub: 'jdoe', aud: 'some-other-app' }) });
    const result = await signIn();
    expect(result.location.searchParams.get('reason')).toBe('id_token_invalid');
  });

  it('rejects an ID token from another issuer', async () => {
    idp.reset({ claims: () => ({ sub: 'jdoe', iss: 'https://idp.federate.amazon.com' }) });
    const result = await signIn();
    expect(result.location.searchParams.get('reason')).toBe('id_token_invalid');
  });

  it('rejects an expired ID token', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    idp.reset({ claims: () => ({ sub: 'jdoe', iat: past - 60, exp: past }) });
    const result = await signIn();
    expect(result.location.searchParams.get('reason')).toBe('id_token_invalid');
  });

  it('rejects an ID token whose nonce is not ours (token injection)', async () => {
    idp.reset({ claims: () => ({ sub: 'jdoe', nonce: 'someone-elses-nonce' }) });
    const result = await signIn();
    expect(result.location.searchParams.get('reason')).toBe('id_token_nonce');
  });

  it('turns a database failure into sso_failed without a session or stack trace', async () => {
    db.failures.push({ table: 'approved_users', op: 'select' });
    const result = await signIn();
    expect(result.location.searchParams.get('error')).toBe('sso_failed');
    expect(result.location.searchParams.get('reason')).toBe('approved_lookup');
    expectNoSession();
  });

  it('never puts reasons in the URL when debug is off', async () => {
    delete process.env.AMAZON_OIDC_DEBUG;
    const res = await invoke(callback, '/api/auth/callback/amazon?code=x&state=y');
    expect(errorOf(res)).toEqual({ path: '/login', error: 'sso_state', reason: null });
  });

  it('ignores an off-site returnTo', async () => {
    const result = await signIn({ returnTo: '//evil.example/steal' });
    expect(bridgeOf(result).fragment.get('next')).toBe('/');
  });
});

describe('logs never carry secrets', () => {
  it('logs only aliases and outcome codes', async () => {
    const result = await signIn();
    const all = result.logs.join('\n');
    expect(all).not.toContain(CLIENT_SECRET);
    expect(all).not.toMatch(/eyJ/);
    expect(all).not.toContain(bridgeOf(result).fragment.get('token_hash')!);
  });
});

describe('debug-claims and logout', () => {
  it('404s unless AMAZON_OIDC_DEBUG is exactly true', async () => {
    process.env.AMAZON_OIDC_DEBUG = 'TRUE';
    expect((await invoke(debugClaims, '/api/auth/debug-claims')).statusCode).toBe(404);
  });

  it('shows the claims Amazon sent, without tokens, in the same browser', async () => {
    process.env.AMAZON_OIDC_DEBUG = 'true';
    idp.reset({ claims: () => ({ sub: 'jdoe', groups: ['mentors'], amr: ['pwd'] }) });
    const { jar } = await signIn();

    const res = await invoke(debugClaims, '/api/auth/debug-claims', { jar });
    const body = res.json();
    expect(body).toMatchObject({ alias: 'jdoe', sub: 'jdoe', sub_equals_alias: true, token_auth_method: 'client_secret_basic' });
    expect(body.id_token_claims).toMatchObject({ sub: 'jdoe', aud: CLIENT_ID, groups: ['mentors'] });
    expect(JSON.stringify(body)).not.toMatch(/eyJ/);

    // A different browser sees nothing.
    const other = await invoke(debugClaims, '/api/auth/debug-claims');
    expect(other.json().claims).toBeNull();
  });

  it('logout is POST-only and clears the OIDC cookies', async () => {
    expect((await invoke(logout, '/api/auth/logout')).statusCode).toBe(405);
    const res = await invoke(logout, '/api/auth/logout', { method: 'POST' });
    expect(res.statusCode).toBe(302);
    expect(res.location).toBe(`${APP_ORIGIN}/login`);
    expect(res.setCookies.filter((c) => /Max-Age=0/.test(c)).map((c) => c.split('=')[0]).sort()).toEqual(['mc_oidc', 'mc_oidc_debug']);
  });
});
