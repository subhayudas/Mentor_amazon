import type { Frame, Route } from '@playwright/test';
import { test, expect, turnstile, type Page } from '../fixtures/test';
import { ids } from '../fixtures/personas';
import { devEmail, featuredFor, purgeRequester, tr, useLanguage } from './b-helpers';

/**
 * The Cloudflare Turnstile check on the request forms, against the always-pass test sitekey
 * (scripts/e2e/env.sh), in a real browser:
 *
 * - R1-71: clicking (tapping) into the check, or tabbing through it, never blanks the page.
 *   The app-wide content guard veils the page when the window loses focus; focus moving into
 *   the check's iframe (inside a closed shadow root) used to count as that. The guard must
 *   still veil a real loss of focus, including one that starts inside the check's frame.
 * - R1-72: when the check's script cannot load, the form says so, offers Retry and (booking
 *   forms, when VITE_PROGRAMME_CONTACT_EMAIL is set) the programme team's email, and Send says
 *   why nothing went out; once the network is back, Retry loads the check and the request goes.
 */
const GOAL = 'I want feedback on our launch plan and positioning for the UAE market.';
const CHALLENGES = 'https://challenges.cloudflare.com/**';
const PROGRAMME_CONTACT = (process.env.VITE_PROGRAMME_CONTACT_EMAIL ?? '').trim();

test.beforeEach(async ({ page, lang }) => {
  expect(turnstile.enabled, 'these checks need the Turnstile test keys (scripts/e2e/env.sh with E2E_TURNSTILE=on)').toBe(true);
  await useLanguage(page, lang);
});

const tokenInput = (page: Page) => page.locator('[data-testid="turnstile"] input[name="cf-turnstile-response"]');
const tokenReady = (page: Page) => expect(tokenInput(page).first()).toHaveValue(/.+/, { timeout: 20_000 });
const isVeiled = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('guard-veiled'));

/** The check's challenge frame (its iframe sits in a closed shadow root, so no locator reaches it). */
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
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  // The page's focus is now inside the check (its shadow host), which is what blurs the window.
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="turnstile"]'))), { message: 'the click landed in the check' })
    .toBe(true);
}

async function fillSessionForm(page: Page, name: string, email: string) {
  await page.getByTestId('input-session-name').fill(name);
  await page.getByTestId('input-session-email').fill(email);
  await page.getByTestId('textarea-session-goal').fill(GOAL);
}

async function pendingRows(db: import('postgres').Sql, email: string, mentorId: string) {
  return db`select 1 from public.bookings b join public.mentees me on me.id = b.mentee_id
            where lower(me.email) = ${email.toLowerCase()} and b.mentor_id = ${mentorId} and b.status = 'pending'`;
}

test('S3t clicking into the Turnstile check keeps the booking page on screen (R1-71)', async ({ page, healthy, isMobile }, testInfo) => {
  const f = featuredFor(testInfo.project.name, 4);
  await page.goto(`/mentor/${f.slug}/book`);
  await tokenReady(page);
  await clickIntoCheck(page, isMobile);
  // Longer than a few rounds of the guard's focus poll: the page is still there.
  await page.waitForTimeout(1_000);
  await expect(page.locator('html')).not.toHaveClass(/guard-veiled/);
  await expect(page.getByTestId('guard-veil')).toBeHidden();
  await expect(page.getByTestId('textarea-session-goal')).toBeVisible();
  await expect(page.getByTestId('button-send-request')).toBeVisible();
  await healthy({ screenshotName: 'S3t-clicked-into-check' });
});

test('S3t a keyboard-only visitor tabs through the Turnstile check to Send and sends the request (R1-71)', async ({ page, db, healthy }, testInfo) => {
  const f = featuredFor(testInfo.project.name, 4);
  const email = devEmail('s29k');
  try {
    await page.goto(`/mentor/${f.slug}/book`);
    await tokenReady(page);
    await page.getByTestId('input-session-name').focus();
    await page.keyboard.type('Dev B Keyboard');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('input-session-email')).toBeFocused();
    await page.keyboard.type(email);
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('textarea-session-goal')).toBeFocused();
    await page.keyboard.type(GOAL);

    // Tab on through the check until Send has the focus: the page never blanks on the way.
    let stopsInCheck = 0;
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(400); // longer than the guard's focus poll
      expect(await isVeiled(page), `the page is veiled after Tab ${i + 1}`).toBe(false);
      const at = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          send: active?.getAttribute('data-testid') === 'button-send-request',
          inCheck: Boolean(active?.closest('[data-testid="turnstile"]')),
          pageHasFocus: document.hasFocus(),
        };
      });
      expect(at.pageHasFocus, `focus left the page at Tab ${i + 1}`).toBe(true);
      if (at.inCheck) stopsInCheck += 1;
      if (at.send) break;
    }
    expect(stopsInCheck, 'the check is in the tab order').toBeGreaterThan(0);
    await expect(page.getByTestId('button-send-request')).toBeFocused();
    await healthy({ screenshotName: 'S3t-keyboard-at-send' });

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('slot-confirmation')).toHaveAttribute('data-outcome', 'sent');
    expect(await pendingRows(db, email, f.dbId)).toHaveLength(1);
  } finally {
    await purgeRequester(db, email);
  }
});

test('S3t the content guard still blanks the page when focus leaves the window, also from inside the check (R1-71)', async ({ page, lang, isMobile }, testInfo) => {
  const f = featuredFor(testInfo.project.name, 4);
  await page.goto(`/mentor/${f.slug}/book`);
  await tokenReady(page);
  const html = page.locator('html');

  // 1. Shift+Tab from the first tab stop (the skip link) takes the focus out of the page.
  await page.locator('a[href="#main"]').first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false);
  await expect(html).toHaveClass(/guard-veiled/);
  // The veil says why the page is blank (its message used to be hidden along with the page).
  await expect(page.getByTestId('guard-veil').getByText(tr(lang, 'guard.veiled'), { exact: true })).toBeVisible();
  await expect(page.getByTestId('button-send-request')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(html).not.toHaveClass(/guard-veiled/);
  await expect(page.getByTestId('button-send-request')).toBeVisible();

  // 2. The check is made the page's last tab stop, so tabbing on from inside its frame leaves
  //    the window. The page gets no blur event then (the frame had the focus); the guard's
  //    focus poll must still blank it. A click on the page brings it back.
  await page.evaluate(() => {
    const check = document.querySelector('[data-testid="turnstile"]')!;
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input, textarea, select, [tabindex]')) {
      if (check.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !check.contains(el)) el.tabIndex = -1;
    }
  });
  await page.getByTestId('textarea-session-goal').focus();
  let enteredCheck = false;
  let leftWindow = false;
  for (let i = 0; i < 8 && !leftWindow; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => ({ inCheck: Boolean(document.activeElement?.closest('[data-testid="turnstile"]')), hasFocus: document.hasFocus() }));
    if (at.inCheck && at.hasFocus) {
      enteredCheck = true;
      expect(await isVeiled(page), 'veiled while the check holds the focus').toBe(false);
    }
    leftWindow = !at.hasFocus;
  }
  expect(enteredCheck, 'focus went through the check').toBe(true);
  expect(leftWindow, 'focus left the window from inside the check').toBe(true);
  await expect(html).toHaveClass(/guard-veiled/, { timeout: 3_000 });
  await expect(page.getByTestId('guard-veil')).toBeVisible();
  // (Headless Chromium does not route the keyboard back into a page whose focus left from an
  // out-of-process frame, so the visitor comes back with a click, on the veil itself.)
  if (isMobile) await page.touchscreen.tap(20, 400);
  else await page.mouse.click(20, 400);
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  await expect(html).not.toHaveClass(/guard-veiled/);
  await expect(page.getByTestId('textarea-session-goal')).toBeVisible();
});

test('S3t the check cannot load: the form says so and offers Retry and the programme email; after Retry the request goes out (R1-72)', async ({ page, db, healthy, lang }, testInfo) => {
  const f = featuredFor(testInfo.project.name, 4);
  const email = devEmail('s30');
  let posts = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/requests') && r.method() === 'POST') posts += 1;
  });
  try {
    // A content blocker, VPN or company proxy stops challenges.cloudflare.com.
    await page.route(CHALLENGES, (route) => route.abort());
    await page.goto(`/mentor/${f.slug}/book`);
    const failed = page.getByTestId('turnstile-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toHaveAttribute('data-reason', 'load');
    await expect(failed).toContainText(tr(lang, 'bookingRequest.captchaLoadFailed'));
    await expect(page.getByTestId('turnstile-check')).toHaveAttribute('data-status', 'failed');
    const retry = page.getByTestId('button-turnstile-retry');
    await expect(retry).toHaveText(tr(lang, 'bookingRequest.captchaRetry'));
    const contact = failed.getByTestId('link-captcha-contact');
    if (PROGRAMME_CONTACT) {
      const name = lang === 'ar' ? f.nameAr : f.name;
      await expect(failed).toContainText(tr(lang, 'bookingRequest.captchaContact', { email: PROGRAMME_CONTACT }));
      await expect(contact).toHaveText(PROGRAMME_CONTACT);
      await expect(contact).toHaveAttribute(
        'href',
        `mailto:${PROGRAMME_CONTACT}?subject=${encodeURIComponent(tr(lang, 'bookingRequest.captchaContactSubject', { name }))}`,
      );
    } else {
      await expect(contact).toHaveCount(0);
    }

    // Send says why nothing went out, and nothing did.
    await fillSessionForm(page, 'Dev B Blocked', email);
    await page.getByTestId('button-send-request').click();
    const error = page.getByTestId('booking-error');
    await expect(error).toHaveAttribute('data-kind', 'botCheck');
    await expect(error).toHaveText(tr(lang, 'bookingRequest.captchaNotSent'));
    expect(posts).toBe(0);
    await healthy({ screenshotName: 'S3t-check-blocked' });

    // The network is back: Retry loads the check, both messages go, and the request is sent.
    await page.unroute(CHALLENGES);
    await retry.click();
    await tokenReady(page);
    await expect(failed).toHaveCount(0);
    await expect(error).toHaveCount(0);
    await expect(page.getByTestId('turnstile-check')).toHaveAttribute('data-status', 'ready');
    await page.getByTestId('button-send-request').click();
    await expect(page.getByTestId('slot-confirmation')).toHaveAttribute('data-outcome', 'sent');
    expect(posts).toBe(1);
    expect(await pendingRows(db, email, f.dbId)).toHaveLength(1);
  } finally {
    await purgeRequester(db, email);
  }
});

test('S3t a check whose script never arrives says so after a while instead of leaving a blank box (R1-72)', async ({ page, lang }, testInfo) => {
  const f = featuredFor(testInfo.project.name, 4);
  // A proxy that holds the connection: the script request never answers.
  const held: Route[] = [];
  await page.route(CHALLENGES, (route) => {
    held.push(route);
  });
  await page.clock.install();
  try {
    await page.goto(`/mentor/${f.slug}/book`);
    const check = page.getByTestId('turnstile-check');
    await expect(check).toHaveAttribute('data-status', 'loading');
    await expect(page.getByTestId('turnstile-failed')).toHaveCount(0);
    // The component's load timeout (TURNSTILE_LOAD_TIMEOUT_MS, 15 s).
    await page.clock.fastForward(15_000);
    const failed = page.getByTestId('turnstile-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toHaveAttribute('data-reason', 'load');
    await expect(failed).toContainText(tr(lang, 'bookingRequest.captchaLoadFailed'));
    await expect(check).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('button-turnstile-retry')).toBeVisible();
  } finally {
    for (const route of held) await route.abort().catch(() => undefined);
  }
});

test('S3t the request dialog: a click into the check keeps the page; a check that cannot load says so and Retry recovers it (R1-71, R1-72)', async ({ page, healthy, lang, isMobile, personaProject }) => {
  const mentorId = ids(personaProject).mentor;
  // The profile has a request button in the desktop rail and one in the phone's sticky bar.
  const requestButton = page.locator('[data-testid="button-request-session"]:visible').first();
  await page.goto(`/mentor/${mentorId}`);
  await requestButton.click();
  const dialog = page.getByTestId('dialog-booking-request');
  await expect(dialog).toBeVisible();
  await tokenReady(page);
  await clickIntoCheck(page, isMobile);
  await page.waitForTimeout(1_000);
  await expect(page.locator('html')).not.toHaveClass(/guard-veiled/);
  await expect(dialog.getByTestId('button-submit-booking')).toBeVisible();
  await healthy({ screenshotName: 'S3t-dialog-clicked-into-check' });

  // A fresh visit with the check's script blocked.
  await page.route(CHALLENGES, (route) => route.abort());
  await page.reload();
  await requestButton.click();
  await expect(dialog).toBeVisible();
  const failed = dialog.getByTestId('turnstile-failed');
  await expect(failed).toBeVisible();
  await expect(failed).toContainText(tr(lang, 'bookingRequest.captchaLoadFailed'));
  if (PROGRAMME_CONTACT) await expect(failed.getByTestId('link-captcha-contact')).toHaveText(PROGRAMME_CONTACT);
  await dialog.getByTestId('input-booking-name').fill('Dev B Dialog');
  await dialog.getByTestId('input-booking-email').fill(devEmail('s30d'));
  await dialog.getByTestId('textarea-booking-goal').fill(GOAL);
  await dialog.getByTestId('button-submit-booking').click();
  const error = dialog.getByTestId('booking-error');
  await expect(error).toHaveAttribute('data-kind', 'botCheck');
  await expect(error).toContainText(tr(lang, 'bookingRequest.captchaNotSent'));
  await healthy({ screenshotName: 'S3t-dialog-check-blocked' });

  await page.unroute(CHALLENGES);
  await dialog.getByTestId('button-turnstile-retry').click();
  await tokenReady(page);
  await expect(failed).toHaveCount(0);
  await expect(error).toHaveCount(0);
});
