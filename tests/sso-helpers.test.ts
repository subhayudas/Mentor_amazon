import { afterEach, describe, expect, it } from 'vitest';
import { deriveCookieKey, signValue, verifyValue } from '../api/_lib/cookies.ts';
import { DEFAULT_SCOPES, readEnv } from '../api/_lib/env.ts';
import { safeReturnTo } from '../api/_lib/http.ts';
import {
  aliasEmail,
  buildAuthorizationUrl,
  createPkce,
  extractIdentity,
  isValidAlias,
  stripTokenMaterial,
} from '../api/_lib/oidc.ts';
import { createHash } from 'node:crypto';

describe('env', () => {
  afterEach(() => {
    delete process.env.AMAZON_OIDC_SCOPES;
  });

  it('defaults to the only scope Federate supports', () => {
    expect(DEFAULT_SCOPES).toBe('openid');
    const result = readEnv(['scopes'] as const);
    expect(result).toEqual({ ok: true, env: { scopes: 'openid' } });
  });

  it('reports missing variables by name without their values', () => {
    delete process.env.AMAZON_OIDC_CLIENT_SECRET;
    const result = readEnv(['clientSecret'] as const);
    expect(result).toEqual({ ok: false, missing: ['AMAZON_OIDC_CLIENT_SECRET'] });
  });
});

describe('PKCE and the authorization URL', () => {
  it('creates an RFC 7636 S256 pair', () => {
    const pkce = createPkce();
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.verifier.length).toBeLessThanOrEqual(128);
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pkce.challenge).toBe(createHash('sha256').update(pkce.verifier).digest('base64url'));
    expect(createPkce().verifier).not.toBe(pkce.verifier);
  });

  it('builds the authorize URL with exactly the registered parameters', () => {
    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: 'https://idp-integ.federate.amazon.com/api/oauth2/v1/authorize',
        clientId: 'mentor-amazon.vercel.app',
        redirectUri: 'https://mentor-amazon.vercel.app/api/auth/callback/amazon',
        scopes: 'openid',
        state: 's',
        nonce: 'n',
        codeChallenge: 'c',
      }),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'mentor-amazon.vercel.app',
      redirect_uri: 'https://mentor-amazon.vercel.app/api/auth/callback/amazon',
      scope: 'openid',
      state: 's',
      nonce: 'n',
      code_challenge: 'c',
      code_challenge_method: 'S256',
    });
  });
});

describe('signed round-trip cookie', () => {
  const key = deriveCookieKey('test-secret');
  const payload = { st: 's', nc: 'n', cv: 'v', rt: '/x', iat: 1 };

  it('round-trips', () => {
    expect(verifyValue(key, signValue(key, payload))).toEqual(payload);
  });

  it('rejects tampering, a different key and junk', () => {
    const signed = signValue(key, payload);
    const [v, body, sig] = signed.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, rt: '/admin' })).toString('base64url');
    expect(verifyValue(key, `${v}.${forged}.${sig}`)).toBeNull();
    expect(verifyValue(key, `${v}.${body}.${sig.slice(0, -2)}AA`)).toBeNull();
    expect(verifyValue(deriveCookieKey('other-secret'), signed)).toBeNull();
    expect(verifyValue(key, 'garbage')).toBeNull();
    expect(verifyValue(key, undefined)).toBeNull();
  });
});

describe('safeReturnTo', () => {
  it.each([
    ['//evil.com', '/'],
    ['https://evil.com', '/'],
    ['/\\evil.com', '/'],
    ['evil', '/'],
    ['/ok\nSet-Cookie: x', '/'],
    ['/' + 'a'.repeat(600), '/'],
    ['/mentor-portal?tab=1', '/mentor-portal?tab=1'],
    ['/mentors#frag', '/mentors'],
  ])('%j → %j', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

describe('identity', () => {
  it('uses sub as the alias, lowercased', () => {
    expect(extractIdentity({ sub: 'JDoe' })).toEqual({ alias: 'jdoe', sub: 'JDoe', email: undefined, name: undefined });
  });

  it('prefers an explicit amazonAlias claim', () => {
    expect(extractIdentity({ sub: 'opaque-123', amazonAlias: 'jdoe' }).alias).toBe('jdoe');
    expect(extractIdentity({ sub: 'opaque-123', amazon_alias: 'jdoe' }).alias).toBe('jdoe');
  });

  it('merges userinfo but lets the ID token win', () => {
    const identity = extractIdentity({ sub: 'jdoe', email: 'Token@Amazon.com' }, { sub: 'jdoe', email: 'other@amazon.com', given_name: 'Jane', family_name: 'Doe' });
    expect(identity.email).toBe('token@amazon.com');
    expect(identity.name).toBe('Jane Doe');
  });

  it.each(['jdoe', 'j.doe', 'jdoe-x', 'a1'])('accepts alias %j', (alias) => {
    expect(isValidAlias(alias)).toBe(true);
  });

  it.each(['', 'jdoe@ant.amazon.com', 'j doe', '-jdoe', 'JDoe', 'a'.repeat(65), 'jdoe/../x'])('refuses alias %j', (alias) => {
    expect(isValidAlias(alias)).toBe(false);
  });

  it('derives the corporate email from the alias', () => {
    expect(aliasEmail('jdoe')).toBe('jdoe@amazon.com');
  });

  it('strips anything token-shaped before claims are stored', () => {
    const jwtish = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJqZG9lIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
    expect(
      stripTokenMaterial({ sub: 'jdoe', access_token: 'x', id_token: 'y', code: 'z', client_secret: 's', nested: { refresh_token: 'r', ok: 1 }, blob: jwtish }),
    ).toEqual({ sub: 'jdoe', nested: { ok: 1 } });
  });
});
