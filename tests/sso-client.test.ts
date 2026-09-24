import { describe, expect, it } from 'vitest';
import en from '../client/src/locales/en.json';
import ar from '../client/src/locales/ar.json';
import { SSO_ERROR_KEYS, ssoErrorKey } from '../client/src/lib/ssoClient.ts';
import type { SsoErrorCode } from '../api/_lib/http.ts';

/** Every `?error=` code the callback can send must reach a real message in both languages. */
const CALLBACK_CODES: SsoErrorCode[] = ['sso_state', 'sso_token', 'sso_failed', 'sso_denied'];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('login page SSO error messages', () => {
  it.each(CALLBACK_CODES)('%s has its own translated message', (code) => {
    const key = ssoErrorKey(code);
    expect(key).toBe(SSO_ERROR_KEYS[code]);
    expect(key).not.toBe('auth.sso.errors.generic');
    expect(typeof lookup(en, key!)).toBe('string');
    expect(typeof lookup(ar, key!)).toBe('string');
  });

  it('falls back to the generic message for unknown sso_ codes and ignores others', () => {
    expect(ssoErrorKey('sso_something_new')).toBe('auth.sso.errors.generic');
    expect(ssoErrorKey('not_sso')).toBeNull();
    expect(ssoErrorKey(null)).toBeNull();
  });
});
