import { test, expect } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { ids } from '../fixtures/personas';
import { recordToasts } from '../fixtures/toasts';
import { expectNoDemo, tokenSettle } from './c-helpers';

/**
 * `/dashboard/calendar` in database mode.
 * - R1-49: with nothing changed, "Save changes" says so and does nothing (aria-disabled with
 *   the reason as its description) instead of silently swallowing the click.
 * - R1-69 (design C8/F13 acceptance): the demo-only controls (cancellation policy, booking
 *   period, notice, "Connect calendar") are not shown; the Cal.com rows replace them.
 */

test('R1-49 with nothing changed, Save says there is nothing to save and writes nothing', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const mentorId = ids(personaProject).mentor;
  await db`update public.mentors set timezone = 'UTC' where id = ${mentorId}`;
  const writes: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if ((url.includes('/rest/v1/rpc/set_my_availability') && req.method() === 'POST') || (url.includes('/rest/v1/mentors') && req.method() === 'PATCH')) {
      writes.push(`${req.method()} ${url}`);
    }
  });
  await loginAs('mentor');
  await tokenSettle(page);
  const toasts = await recordToasts(page);
  await page.goto('/dashboard/calendar');
  await expect(page.getByTestId('select-calendar-timezone')).toHaveValue('UTC');

  const save = page.getByTestId('button-save-calendar');
  const status = page.getByTestId('text-calendar-status');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(status).toHaveText(tr(lang, 'showcase.calendar.noChangesLive'));
  // The reason is the button's description, and the button stays reachable by keyboard.
  await expect(save).toHaveAccessibleDescription(tr(lang, 'showcase.calendar.noChangesLive'));
  await save.focus();
  await expect(save).toBeFocused();
  const [before] = await db<{ n: number }[]>`
    select count(*)::int as n from public.activity_events where type = 'calendar_updated' and ${mentorId} = any(visible_to)`;

  // A person can still click it (Playwright's actionability treats aria-disabled as disabled, hence force).
  await save.click({ force: true });
  await page.waitForTimeout(800);
  expect(writes, 'no write for an unchanged form').toEqual([]);
  expect(await toasts.seen(tr(lang, 'showcase.calendar.savedToast')), 'no "saved" toast').toBe(false);
  const [after] = await db<{ n: number }[]>`
    select count(*)::int as n from public.activity_events where type = 'calendar_updated' and ${mentorId} = any(visible_to)`;
  expect(after.n, 'no activity line for a save that saved nothing').toBe(before.n);
  await healthy({ screenshotName: 'R1-49-nothing-to-save' });

  // A change makes it a real Save again; undoing it goes back to "nothing to save".
  await page.getByTestId('select-calendar-timezone').selectOption('Europe/London');
  await expect(save).not.toHaveAttribute('aria-disabled', 'true');
  await expect(status).toHaveText(tr(lang, 'showcase.calendar.unsaved'));
  await page.getByTestId('select-calendar-timezone').selectOption('UTC');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
});

test('R1-69 the database calendar shows the Cal.com rows and none of the demo-only settings', async ({ page, loginAs, healthy, lang }) => {
  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/dashboard/calendar');
  await expect(page.getByTestId('select-calendar-timezone')).toBeVisible();
  for (const key of ['policy', 'bookingPeriod', 'notice', 'integrationTitle', 'integrationCta']) {
    await expect(page.getByText(tr(lang, `showcase.calendar.${key}`), { exact: true }), `no demo-only "${key}" control`).toHaveCount(0);
  }
  await expect(page.getByText(tr(lang, 'showcase.calendar.calcomTitle'), { exact: true })).toBeVisible();
  await expect(page.getByTestId('link-cal-availability')).toBeVisible();
  await expect(page.getByTestId('link-cal-sync')).toHaveAttribute('href', '/dashboard/profile#cal-sync');
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'R1-69-calendar-db' });
});
