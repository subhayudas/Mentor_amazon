import { describe, expect, it } from 'vitest';
import en from '../client/src/locales/en.json';
import ar from '../client/src/locales/ar.json';
import {
  AuthFlowError,
  authErrorKey,
  codeFromMessage,
  cooldownRemaining,
  mapAuthError,
  toAuthFlowError,
  type AuthErrorKind,
} from '../client/src/lib/authErrors.ts';
import { asAuthFlowError, parseAuthRedirect } from '../client/src/lib/authFlow.ts';
import { authConfirmUrl, confirmDestination, sameOriginPath } from '../client/src/lib/routes.ts';

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('mapAuthError: GoTrue codes', () => {
  it.each<[string, AuthErrorKind]>([
    ['invalid_credentials', 'invalid_credentials'],
    ['email_not_confirmed', 'email_not_confirmed'],
    ['user_already_exists', 'email_in_use'],
    ['email_exists', 'email_in_use'],
    ['identity_already_exists', 'email_in_use'],
    ['over_email_send_rate_limit', 'email_rate_limited'],
    ['over_request_rate_limit', 'request_rate_limited'],
    ['email_address_not_authorized', 'send_failed'],
    ['email_send_failed', 'send_failed'],
    ['email_provider_disabled', 'send_failed'],
    ['weak_password', 'weak_password'],
    ['same_password', 'same_password'],
    ['captcha_failed', 'captcha_failed'],
    ['validation_failed', 'invalid_email'],
    ['email_address_invalid', 'invalid_email'],
    ['otp_expired', 'link_expired'],
    ['flow_state_expired', 'link_expired'],
    ['network', 'network'],
  ])('%s → %s', (code, kind) => {
    expect(mapAuthError(code, 400)).toBe(kind);
  });
});

describe('mapAuthError: status fallbacks for unknown codes', () => {
  it('429 is a rate limit', () => {
    expect(mapAuthError('something_new', 429)).toBe('request_rate_limited');
    expect(mapAuthError(null, 429)).toBe('request_rate_limited');
  });
  it('status 0 is the network', () => {
    expect(mapAuthError(undefined, 0)).toBe('network');
  });
  it('a 5xx on a call that sends email is a mailer failure', () => {
    expect(mapAuthError('unexpected_failure', 500, 'signup')).toBe('send_failed');
    expect(mapAuthError('unexpected_failure', 500, 'recover')).toBe('send_failed');
    expect(mapAuthError(null, 502, 'resend')).toBe('send_failed');
  });
  it('a 5xx elsewhere stays unknown (the page shows its generic copy)', () => {
    expect(mapAuthError('unexpected_failure', 500, 'login')).toBe('unknown');
    expect(mapAuthError('unexpected_failure', 500)).toBe('unknown');
  });
  it('an unknown 4xx stays unknown', () => {
    expect(mapAuthError('bad_json', 400, 'signup')).toBe('unknown');
  });
  it('the code wins over the status', () => {
    expect(mapAuthError('captcha_failed', 500, 'signup')).toBe('captcha_failed');
    expect(mapAuthError('over_email_send_rate_limit', 429, 'resend')).toBe('email_rate_limited');
  });
});

describe('codeFromMessage (older GoTrue without codes)', () => {
  it.each([
    ['Invalid login credentials', 'invalid_credentials'],
    ['Email not confirmed', 'email_not_confirmed'],
    ['User already registered', 'user_already_exists'],
    ['captcha protection: request disallowed (timeout-or-duplicate)', 'captcha_failed'],
    ['Email rate limit exceeded', 'over_email_send_rate_limit'],
    ['For security purposes, you can only request this after 59 seconds.', 'over_email_send_rate_limit'],
    ['Request rate limit reached', 'over_request_rate_limit'],
    ['Error sending confirmation email', 'email_send_failed'],
    ['Error sending recovery email', 'email_send_failed'],
    ['Password should be at least 6 characters.', 'weak_password'],
    ['New password should be different from the old password.', 'same_password'],
    ['Email link is invalid or has expired', 'otp_expired'],
    ['Failed to fetch', 'network'],
  ])('%s → %s', (message, code) => {
    expect(codeFromMessage(message)).toBe(code);
  });
  it('returns null for anything else', () => {
    expect(codeFromMessage('Something odd happened')).toBeNull();
    expect(codeFromMessage('')).toBeNull();
    expect(codeFromMessage(undefined)).toBeNull();
  });
});

describe('toAuthFlowError', () => {
  it('keeps code and status from a supabase-js AuthApiError', () => {
    const err = toAuthFlowError({ name: 'AuthApiError', code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' });
    expect(err).toBeInstanceOf(AuthFlowError);
    expect(err.code).toBe('email_not_confirmed');
    expect(err.status).toBe(400);
  });
  it('derives the code from the message when GoTrue sent none', () => {
    expect(toAuthFlowError({ name: 'AuthApiError', status: 400, message: 'Invalid login credentials' }).code).toBe('invalid_credentials');
  });
  it('treats AuthRetryableFetchError and TypeError as the network', () => {
    expect(toAuthFlowError({ name: 'AuthRetryableFetchError', status: 0, message: '{}' }).code).toBe('network');
    expect(toAuthFlowError(new TypeError('Failed to fetch')).code).toBe('network');
  });
  it('passes an AuthFlowError through unchanged', () => {
    const original = new AuthFlowError('user_already_exists', 422);
    expect(toAuthFlowError(original)).toBe(original);
  });
  it('never throws on junk', () => {
    expect(toAuthFlowError(undefined).code).toBe('unknown');
    expect(toAuthFlowError('boom').code).toBe('unknown');
    expect(toAuthFlowError({ status: 500 }).status).toBe(500);
  });
});

describe('authErrorKey', () => {
  const kinds: AuthErrorKind[] = [
    'invalid_credentials',
    'email_not_confirmed',
    'email_in_use',
    'email_rate_limited',
    'request_rate_limited',
    'send_failed',
    'weak_password',
    'same_password',
    'captcha_failed',
    'invalid_email',
    'link_expired',
    'network',
  ];
  it('has no key for unknown (pages keep their own generic copy)', () => {
    expect(authErrorKey('unknown')).toBeNull();
  });
  it.each(kinds)('%s resolves to a real, translated string in EN and AR', (kind) => {
    const key = authErrorKey(kind)!;
    const enValue = lookup(en, key);
    const arValue = lookup(ar, key);
    expect(typeof enValue).toBe('string');
    expect(typeof arValue).toBe('string');
    expect((arValue as string).trim()).not.toBe('');
    expect(arValue).not.toBe(enValue);
    expect(arValue as string).toMatch(/[؀-ۿ]/);
  });
});

describe('cooldownRemaining', () => {
  it('counts down whole seconds from the send', () => {
    const sentAt = 1_000_000;
    expect(cooldownRemaining(sentAt, sentAt)).toBe(60);
    expect(cooldownRemaining(sentAt, sentAt + 500)).toBe(60);
    expect(cooldownRemaining(sentAt, sentAt + 59_001)).toBe(1);
    expect(cooldownRemaining(sentAt, sentAt + 60_000)).toBe(0);
    expect(cooldownRemaining(sentAt, sentAt + 120_000)).toBe(0);
  });
  it('is zero before anything was sent', () => {
    expect(cooldownRemaining(null, 5)).toBe(0);
  });
});


describe('parseAuthRedirect (read before supabase-js strips the fragment)', () => {
  it('reads a recovery session fragment without keeping any token', () => {
    const parsed = parseAuthRedirect('#access_token=secret&refresh_token=secret2&expires_in=3600&token_type=bearer&type=recovery', '');
    expect(parsed).toEqual({ type: 'recovery', error: null, errorCode: null, errorDescription: null, hasSession: true });
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });
  it('reads GoTrue errors from the fragment', () => {
    expect(parseAuthRedirect('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', '')).toEqual({
      type: null,
      error: 'access_denied',
      errorCode: 'otp_expired',
      errorDescription: 'Email link is invalid or has expired',
      hasSession: false,
    });
  });
  it('falls back to the query for PKCE-style errors', () => {
    expect(parseAuthRedirect('', '?error=access_denied&error_code=otp_expired&error_description=x').errorCode).toBe('otp_expired');
  });
  it("ignores the app's own ?error=sso_* (no GoTrue error code)", () => {
    expect(parseAuthRedirect('', '?error=sso_state&reason=expired')).toEqual({ type: null, error: null, errorCode: null, errorDescription: null, hasSession: false });
  });
  it('reads the SSO bridge fragment as a magic link without a session', () => {
    const parsed = parseAuthRedirect('#token_hash=abc&type=magiclink&bind=xyz&next=%2F', '');
    expect(parsed.type).toBe('magiclink');
    expect(parsed.hasSession).toBe(false);
  });
  it('handles empty input', () => {
    expect(parseAuthRedirect('', '')).toEqual({ type: null, error: null, errorCode: null, errorDescription: null, hasSession: false });
  });
});

describe('asAuthFlowError (the always-loaded wrapper) and toAuthFlowError', () => {
  it('keeps GoTrue codes, never interprets messages itself', () => {
    expect(asAuthFlowError({ code: 'weak_password', status: 422, message: 'Password should be…' }).code).toBe('weak_password');
    expect(asAuthFlowError({ status: 400, message: 'Invalid login credentials' }).code).toBe('unknown');
    expect(asAuthFlowError({ name: 'AuthRetryableFetchError', status: 0 }).code).toBe('network');
  });
  it('toAuthFlowError derives the code from the message only when GoTrue sent none', () => {
    const wrapped = asAuthFlowError({ status: 400, message: 'Invalid login credentials' });
    expect(toAuthFlowError(wrapped).code).toBe('invalid_credentials');
    expect(toAuthFlowError(wrapped).status).toBe(400);
    expect(toAuthFlowError(asAuthFlowError({ status: 500 })).code).toBe('unknown');
  });
});

describe('sameOriginPath / authConfirmUrl / confirmDestination', () => {
  it('only accepts same-origin paths', () => {
    expect(sameOriginPath('/mentee-dashboard/bookings')).toBe('/mentee-dashboard/bookings');
    expect(sameOriginPath('/x#frag')).toBe('/x');
    expect(sameOriginPath('//evil.example')).toBe('/');
    expect(sameOriginPath('/\\evil.example')).toBe('/');
    expect(sameOriginPath('https://evil.example')).toBe('/');
    expect(sameOriginPath(null, '')).toBe('');
  });
  it('builds the confirmation redirect with an encoded, safe next', () => {
    expect(authConfirmUrl('http://localhost:5173/', '/mentee-dashboard/bookings')).toBe('http://localhost:5173/auth/confirm?next=%2Fmentee-dashboard%2Fbookings');
    expect(authConfirmUrl('https://mentor-amazon.vercel.app', '//evil.example')).toBe('https://mentor-amazon.vercel.app/auth/confirm?next=%2F');
    expect(authConfirmUrl('https://mentor-amazon.vercel.app')).toBe('https://mentor-amazon.vercel.app/auth/confirm?next=%2F');
  });
  it('routes after confirmation: next, else registration, else dashboard', () => {
    expect(confirmDestination({ role: 'mentee', hasProfile: false, next: '/mentee-dashboard/bookings' })).toBe('/mentee-dashboard/bookings');
    expect(confirmDestination({ role: 'mentee', hasProfile: false, next: '/' })).toBe('/mentee-registration');
    expect(confirmDestination({ role: 'mentee', hasProfile: true, next: null })).toBe('/mentee-dashboard');
    expect(confirmDestination({ role: 'mentee', hasProfile: false, next: 'https://evil.example' })).toBe('/mentee-registration');
    expect(confirmDestination({ role: 'mentee', hasProfile: true, next: '/auth/confirm?next=%2F' })).toBe('/mentee-dashboard');
    expect(confirmDestination({ role: 'mentor', hasProfile: false })).toBe('/mentor-onboarding');
    expect(confirmDestination({ role: 'mentor', hasProfile: true })).toBe('/mentor-portal');
    expect(confirmDestination({ role: 'admin', hasProfile: false })).toBe('/admin');
  });
});
