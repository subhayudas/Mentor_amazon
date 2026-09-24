import { test, expect, turnstile, e2eEnv } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { bookingId } from '../fixtures/personas';
import { captchaReady, runsOn, tokenSettle } from './c-helpers';

/**
 * Backend mode, outage and stale browser data (design §6.4 S20–S22; C1, C2, D7, F05, F11,
 * F14, F19, F48). S20 runs against the production build with vercel.json's headers
 * (`prod-csp`), S21 against the demo-mode dev server (`demo-local*`).
 */

// ---------------------------------------------------------------- S22 stale local data

const LEGACY = {
  'mentorconnect.local.bookings': JSON.stringify([
    { id: 'local-b1', mentor_id: 'manav-gupta', mentee_id: 'local-m1', status: 'pending', goal: 'Plan my move into product management', created_at: '2026-09-01T10:00:00.000Z' },
  ]),
  'mentorconnect.local.mentees': JSON.stringify([{ id: 'local-m1', name: 'Layla', email: 'layla.preview@example.com', created_at: '2026-08-31T09:00:00.000Z' }]),
  'mentorconnect.value.session': JSON.stringify({ id: 'local-local-m1', email: 'layla.preview@example.com', user_type: 'mentee', profile_id: 'local-m1' }),
  menteeId: 'local-m1',
  menteeEmail: 'layla.preview@example.com',
  menteeName: 'Layla',
};

test('S22 preview-period data in this browser: the notice counts and lists it, clearing removes it for good', async ({ page, healthy, lang, isMobile }, testInfo) => {
  test.skip(!runsOn(testInfo, ['desktop-en', 'mobile-ar']), 'S22 runs on desktop-en and mobile-ar');
  await page.goto('/legal');
  await page.evaluate((seed) => Object.entries(seed).forEach(([k, v]) => window.localStorage.setItem(k, v)), LEGACY);
  await page.goto('/');
  const notice = page.getByTestId('notice-legacy-data');
  await expect(notice).toBeVisible();
  await expect(page.getByTestId('text-legacy-count')).toHaveAttribute('data-count', '2');

  // The stale menteeId signs nobody in: the navigation still offers Sign in.
  if (isMobile) {
    await page.getByTestId('button-mobile-menu').click();
    await expect(page.getByRole('link', { name: tr(lang, 'nav.signIn') }).first()).toBeVisible();
    await page.keyboard.press('Escape');
  } else {
    await expect(page.getByTestId('link-sign-in')).toBeVisible();
  }

  await page.getByTestId('button-legacy-show').click();
  await expect(page.getByTestId('list-legacy-items').locator('li')).toHaveCount(2);
  await healthy({ screenshotName: 'S22-notice' });

  await page.getByTestId('button-legacy-clear').click();
  await expect(notice).toHaveCount(0);
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys.filter((k) => k.startsWith('mentorconnect.local.') || k.startsWith('mentorconnect.value.') || k === 'menteeId')).toEqual([]);
  expect(keys).toEqual(expect.arrayContaining(['menteeEmail', 'menteeName', 'language']));

  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(notice).toHaveCount(0);
  await healthy({ screenshotName: 'S22-cleared' });
});

// ---------------------------------------------------------------- S20 outage in production (prod-csp)

test('S20 outage: banner, database mode kept, no local fallback, visible failure, Retry; CSP allows Turnstile and Cal @prod-csp', async ({ page, healthy, loginAs, cal, personaProject }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  const supabase = new URL(e2eEnv.supabaseUrl).origin;
  let healthBlocked = true;
  await page.route('**/auth/v1/health', (route) => (healthBlocked ? route.abort() : route.continue()));

  await page.goto('/login');
  const banner = page.getByTestId('banner-backend-degraded');
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveAttribute('role', 'alert');
  await expect(page.locator('html')).toHaveAttribute('data-backend', 'database');
  expect(await page.evaluate(() => (window as unknown as { __MC_BACKEND__?: { health: string } }).__MC_BACKEND__?.health)).toBe('degraded');
  await expect(page.getByText('admin@mentorconnect.local')).toHaveCount(0);
  await expect(page.getByTestId('link-amazon-sso')).toBeVisible();
  if (turnstile.enabled) await captchaReady(page); // the widget renders under the production CSP
  await healthy({ screenshotName: 'S20-banner' });

  // A request sent while the project is unreachable fails visibly; nothing lands in the browser store.
  await page.goto('/mentor/manav-gupta/book');
  const form = page.getByTestId('form-session-request');
  await expect(form).toBeVisible();
  await page.getByTestId('input-session-name').fill('Outage Visitor');
  await page.getByTestId('input-session-email').fill('e2e.outage.visitor@mentorconnect.test');
  await page.getByTestId('textarea-session-goal').fill('I would like feedback on our launch plan for the UAE market.');
  await captchaReady(page);
  await page.route(`${supabase}/rest/v1/**`, (route) => route.abort());
  await page.route('**/api/**', (route) => route.abort());
  await page.getByTestId('button-send-request').click();
  await expect(page.getByTestId('booking-error')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('slot-confirmation')).toHaveCount(0);
  const localKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('mentorconnect.local.')));
  expect(localKeys).toEqual([]);
  await expect(page.locator('html')).toHaveAttribute('data-backend', 'database');
  await page.unroute(`${supabase}/rest/v1/**`);
  await page.unroute('**/api/**');

  // The project answers again: Retry clears the banner.
  healthBlocked = false;
  await page.getByTestId('button-backend-retry').click();
  await expect(banner).toHaveCount(0, { timeout: 15_000 });

  // The Cal.com embed (stub) opens under the production CSP.
  await loginAs('mentee');
  await tokenSettle(page);
  await page.goto('/dashboard/bookings');
  await page.getByTestId('tab-upcoming').click();
  await page.getByTestId(`button-choose-time-${bookingId(personaProject, 'accepted')}`).click();
  await cal.frame();
  expect(cal.openedUrls.length).toBeGreaterThan(0);

  const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(violations, 'no CSP violations (Turnstile, Cal.com embed, Supabase)').toEqual([]);
  await healthy({ screenshotName: 'S20-cal-embed' });
});

// ---------------------------------------------------------------- S21 demo mode (demo-local)

test('S21 demo mode: the banner, a local registration and request, and the dashboard shows the local rows @demo-local', async ({ page, healthy, lang }) => {
  await page.goto('/');
  const banner = page.getByTestId('banner-demo-mode');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(tr(lang, 'backend.demo.body'));
  await expect(page.locator('html')).toHaveAttribute('data-backend', 'local');
  await healthy({ screenshotName: 'S21-home' });

  // A local mentee registers (demo mode has no accounts).
  const email = 'demo.mentee@example.com';
  await page.goto('/mentee-registration');
  await page.getByTestId('input-name').fill(lang === 'ar' ? 'سارة المحلية' : 'Sara Local');
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('select-languages').click();
  await page.getByRole('option').first().click();
  await page.getByTestId('experience-areas-container').locator('button').first().click();
  await page.getByTestId('button-submit').click();
  await expect(page).toHaveURL((u) => u.pathname === '/dashboard');

  // A local request to a curated mentor.
  await page.goto('/mentor/manav-gupta/book');
  await page.getByTestId('input-session-name').fill(lang === 'ar' ? 'سارة المحلية' : 'Sara Local');
  await page.getByTestId('input-session-email').fill(email);
  await page.getByTestId('textarea-session-goal').fill('I would like help preparing my first investor meetings.');
  await page.getByTestId('button-send-request').click();
  await expect(page.getByTestId('slot-confirmation')).toBeVisible();
  const local = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mentorconnect.local.bookings') || '[]') as Array<{ id: string; mentor_id: string; status: string }>);
  const mine = local.find((b) => b.mentor_id === 'manav-gupta' && b.status === 'pending');
  expect(mine, 'the request is stored in this browser').toBeTruthy();

  // The dashboard lists it (demo rows, with the demo banner).
  await page.goto('/dashboard/bookings');
  await expect(banner).toBeVisible();
  await expect(page.getByTestId(`booking-row-${mine!.id}`)).toBeVisible();
  await healthy({ screenshotName: 'S21-dashboard' });
});
