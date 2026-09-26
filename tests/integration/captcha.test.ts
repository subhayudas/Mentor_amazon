import { createClient } from '@supabase/supabase-js';
import { afterAll, expect, it } from 'vitest';
import { describeCaptcha, TEST_ANON_KEY, TEST_SERVICE_KEY, TEST_URL } from './env.ts';
import { itEmail } from './fixtures.ts';

/**
 * I17 — Supabase Auth with Turnstile captcha switched on (design D6, R7). Runs only with
 * SUPABASE_TEST_CAPTCHA=on against a stack whose auth server has
 *   [auth.captcha] enabled = true, provider = "turnstile", secret = "1x0000000000000000000000000000000AA"
 * (Cloudflare's always-pass test secret; the checks call Cloudflare, so internet is needed).
 * Proves the three password flows need a token, and that the Amazon SSO bridge
 * (admin.generateLink + verifyOtp with token_hash) keeps working with captcha on.
 */
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const client = () => createClient(TEST_URL, TEST_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = () => createClient(TEST_URL, TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const created: string[] = [];

afterAll(async () => {
  for (const id of created) await admin().auth.admin.deleteUser(id);
});

describeCaptcha('I17 captcha on', () => {
  it('sign-up needs a captcha token', async () => {
    const email = itEmail('captcha-signup');
    const without = await client().auth.signUp({ email, password: 'Captcha-Pass-123!' });
    expect(without.error?.message ?? '').toMatch(/captcha/i);
    const withToken = await client().auth.signUp({ email, password: 'Captcha-Pass-123!', options: { captchaToken: TOKEN } });
    expect(withToken.error).toBeNull();
    if (withToken.data.user) created.push(withToken.data.user.id);
  });

  it('password sign-in and password reset need a captcha token', async () => {
    const email = itEmail('captcha-login');
    const password = 'Captcha-Pass-123!';
    const { data } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    created.push(data.user!.id);
    expect((await client().auth.signInWithPassword({ email, password })).error?.message ?? '').toMatch(/captcha/i);
    const ok = await client().auth.signInWithPassword({ email, password, options: { captchaToken: TOKEN } });
    expect(ok.error).toBeNull();
    expect(ok.data.session?.user.email).toBe(email);
    expect((await client().auth.resetPasswordForEmail(email)).error?.message ?? '').toMatch(/captcha/i);
    expect((await client().auth.resetPasswordForEmail(email, { captchaToken: TOKEN })).error).toBeNull();
  });

  it('the SSO bridge (generateLink magiclink → verifyOtp token_hash) still issues a session', async () => {
    const email = itEmail('captcha-sso');
    const { data: user } = await admin().auth.admin.createUser({ email, email_confirm: true });
    created.push(user.user!.id);
    const { data: link, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email });
    expect(error).toBeNull();
    const verified = await client().auth.verifyOtp({ token_hash: link.properties!.hashed_token, type: 'magiclink' });
    expect(verified.error).toBeNull();
    expect(verified.data.session?.user.email).toBe(email);
  });
});
