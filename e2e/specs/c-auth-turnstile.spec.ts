import type { Frame } from '@playwright/test';
import { test, expect, turnstile, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { E2E_PASSWORD } from '../fixtures/personas';

/**
 * The Turnstile bot check on the password forms (sign-up, sign-in, forgot password), with the
 * always-pass test sitekey, in a real browser. Nothing here creates an account.
 *
 * - R1-71: a click (tap) into the check, or tabbing through it, never blanks the page (the
 *   content guard used to take focus moving into the check's iframe for a capture), and the
 *   keyboard reaches the submit button.
 * - R1-72: when the check's script cannot load, the form says so with Retry, submitting says
 *   why nothing happened, and Retry recovers once the network is back.
 */
const CHALLENGES = 'https://challenges.cloudflare.com/**';

test.beforeEach(() => {
  expect(turnstile.enabled, 'these checks need the Turnstile test keys (scripts/e2e/env.sh with E2E_TURNSTILE=on)').toBe(true);
});

const tokenReady = (page: Page) =>
  expect(page.locator('[data-testid="turnstile"] input[name="cf-turnstile-response"]').first()).toHaveValue(/.+/, { timeout: 20_000 });
const isVeiled = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('guard-veiled'));

async function challengeFrame(page: Page): Promise<Frame> {
  await expect.poll(() => page.frames().some((f) => f.url().startsWith('https://challenges.cloudflare.com/'))).toBe(true);
  return page.frames().find((f) => f.url().startsWith('https://challenges.cloudflare.com/'))!;
}

/** A real click (a tap on phones) in the middle of the check's iframe; resolves once the focus is in the check. */
async function clickIntoCheck(page: Page, isMobile: boolean): Promise<void> {
  const frame = await challengeFrame(page);
  const iframe = await frame.frameElement();
  await iframe.scrollIntoViewIfNeeded();
  const box = await iframe.boundingBox();
  if (!box) throw new Error('the check has no box');
  if (isMobile) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // The page's focus is now inside the check (its shadow host), which is what blurs the window.
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="turnstile"]'))), { message: 'the click landed in the check' })
    .toBe(true);
}

async function expectPageStays(page: Page, submit: string): Promise<void> {
  await page.waitForTimeout(1_000); // a few rounds of the guard's focus poll
  await expect(page.locator('html')).not.toHaveClass(/guard-veiled/);
  await expect(page.getByTestId('guard-veil')).toBeHidden();
  await expect(page.getByTestId(submit)).toBeVisible();
}

/** Tab from `from` through the check to `submit`; the page never blanks and never loses focus on the way. */
async function tabThroughCheckTo(page: Page, from: string, submit: string): Promise<void> {
  await page.getByTestId(from).focus();
  let stopsInCheck = 0;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400); // longer than the guard's focus poll
    expect(await isVeiled(page), `the page is veiled after Tab ${i + 1}`).toBe(false);
    const at = await page.evaluate((id) => {
      const active = document.activeElement;
      return { submit: active?.getAttribute('data-testid') === id, inCheck: Boolean(active?.closest('[data-testid="turnstile"]')), hasFocus: document.hasFocus() };
    }, submit);
    expect(at.hasFocus, `focus left the page at Tab ${i + 1}`).toBe(true);
    if (at.inCheck) stopsInCheck += 1;
    if (at.submit) break;
  }
  expect(stopsInCheck, 'the check is in the tab order').toBeGreaterThan(0);
  await expect(page.getByTestId(submit)).toBeFocused();
}

test('S31 sign-up: a click into the bot check keeps the page, and the keyboard tabs through it to Create account (R1-71)', async ({ page, healthy, isMobile }) => {
  await page.goto('/signup');
  await page.getByTestId('input-email').fill('e2e.nobody@mentorconnect.test');
  await page.getByTestId('input-password').fill(E2E_PASSWORD);
  await page.getByTestId('input-confirm-password').fill(E2E_PASSWORD);
  await tokenReady(page);
  await clickIntoCheck(page, isMobile);
  await expectPageStays(page, 'button-signup');
  await healthy({ screenshotName: 'S31-signup-clicked-into-check' });
  await tabThroughCheckTo(page, 'input-confirm-password', 'button-signup');
});

test('S31 sign-in and forgot password: a click into the bot check keeps the page, the keyboard reaches the button (R1-71)', async ({ page, healthy, isMobile }) => {
  await page.goto('/login');
  await page.getByTestId('button-toggle-password-login').click();
  await page.getByTestId('input-email').fill('e2e.nobody@mentorconnect.test');
  await page.getByTestId('input-password').fill(E2E_PASSWORD);
  await tokenReady(page);
  await clickIntoCheck(page, isMobile);
  await expectPageStays(page, 'button-login');
  await healthy({ screenshotName: 'S31-login-clicked-into-check' });
  await tabThroughCheckTo(page, 'input-password', 'button-login');

  await page.goto('/forgot-password');
  await page.getByTestId('input-email').fill('e2e.nobody@mentorconnect.test');
  await tokenReady(page);
  await clickIntoCheck(page, isMobile);
  await expectPageStays(page, 'button-send-reset-link');
  await healthy({ screenshotName: 'S31-forgot-clicked-into-check' });
  await tabThroughCheckTo(page, 'input-email', 'button-send-reset-link');
});

test('S32 the bot check cannot load: sign-up says so, submitting explains why, Retry recovers it (R1-72)', async ({ page, healthy, lang }) => {
  let signups = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/auth/v1/signup') signups += 1;
  });
  await page.route(CHALLENGES, (route) => route.abort());
  await page.goto('/signup');
  const failed = page.getByTestId('turnstile-failed');
  await expect(failed).toBeVisible();
  await expect(failed).toHaveAttribute('data-reason', 'load');
  await expect(failed).toContainText(tr(lang, 'auth.captcha.loadFailed'));
  const retry = page.getByTestId('button-turnstile-retry');
  await expect(retry).toHaveText(tr(lang, 'auth.captcha.retry'));
  // The booking forms' programme-email fallback is not offered on account forms.
  await expect(failed.getByTestId('link-captcha-contact')).toHaveCount(0);

  await page.getByTestId('input-email').fill('e2e.nobody@mentorconnect.test');
  await page.getByTestId('input-password').fill(E2E_PASSWORD);
  await page.getByTestId('input-confirm-password').fill(E2E_PASSWORD);
  await page.getByTestId('button-signup').click();
  const alert = page.getByTestId('alert-signup-error');
  await expect(alert).toContainText(tr(lang, 'auth.captcha.unavailable'));
  expect(signups).toBe(0);
  await healthy({ screenshotName: 'S32-signup-check-blocked' });

  await page.unroute(CHALLENGES);
  await retry.click();
  await tokenReady(page);
  await expect(failed).toHaveCount(0);
  await expect(page.getByTestId('turnstile-check')).toHaveAttribute('data-status', 'ready');
});

test('S32 forgot password: a check that cannot load says so, and Retry recovers it (R1-72)', async ({ page, lang }) => {
  let recovers = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/auth/v1/recover') recovers += 1;
  });
  await page.route(CHALLENGES, (route) => route.abort());
  await page.goto('/forgot-password');
  const failed = page.getByTestId('turnstile-failed');
  await expect(failed).toContainText(tr(lang, 'auth.captcha.loadFailed'));
  await page.getByTestId('input-email').fill('e2e.nobody@mentorconnect.test');
  await page.getByTestId('button-send-reset-link').click();
  await expect(page.getByRole('alert').filter({ hasText: tr(lang, 'auth.captcha.unavailable') })).toBeVisible();
  expect(recovers).toBe(0);

  await page.unroute(CHALLENGES);
  await page.getByTestId('button-turnstile-retry').click();
  await tokenReady(page);
  await expect(failed).toHaveCount(0);
});
