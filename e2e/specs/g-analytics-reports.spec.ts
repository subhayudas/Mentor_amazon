import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { bookingId } from '../fixtures/personas';
import { expectNoDemo, tokenSettle } from './c-helpers';

/**
 * Growth analytics `/analytics/reports` in database mode (R1-42, R1-65; F16): an admin sees
 * the programme's real rows however few there are, never the sample set, and the CSV export
 * holds only those rows. A young production database has fewer than five bookings, which is
 * exactly when the old page swapped in 160 invented ones, so the bookings read is trimmed to
 * this project's own fixture rows (or to nothing) while every other read stays real.
 */

type Row = { id: string; status: string };

/** Serve the admin's `bookings` read with only the rows `keep` picks from the real response. */
async function trimBookings(page: Page, keep: (rows: Row[]) => Row[]): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith('/rest/v1/bookings') && url.searchParams.get('select') === '*',
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const rows = (await response.json()) as Row[];
      await route.fulfill({ response, json: keep(rows) });
    },
  );
}

/** Export the current view and return the CSV text (the phone layout puts the button in a popover). */
async function exportView(page: Page, isMobile: boolean): Promise<{ name: string; text: string }> {
  if (isMobile) await page.getByTestId('button-export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('button-export-view').click()]);
  const file = await download.path();
  return { name: download.suggestedFilename(), text: readFileSync(file, 'utf8').replace(/^﻿/, '') };
}

test('R1-42 an admin with fewer than five real bookings sees those real numbers, never sample data, and exports only them', async ({ page, loginAs, healthy, lang, personaProject, isMobile }) => {
  const real = [bookingId(personaProject, 'pending-1'), bookingId(personaProject, 'completed')];
  await loginAs('admin');
  await tokenSettle(page);
  await trimBookings(page, (rows) => rows.filter((r) => real.includes(r.id)));
  await page.goto('/analytics/reports');

  // The real rows: two requests in the last 30 days, one of them a completed 30-minute session.
  await expect(page.getByTestId('metric-requests')).toHaveText('2');
  await expect(page.getByTestId('metric-completed')).toHaveText('1');
  await expect(page.getByTestId('banner-demo-data')).toHaveCount(0);
  await expect(page.getByTestId('badge-demo-data')).toHaveCount(0);
  await expect(page.getByText(tr(lang, 'analytics.demoBannerTitle'))).toHaveCount(0);
  // An honest note says the numbers are real, and how few there are yet (Arabic: "طلبان", the dual).
  const note = page.getByTestId('note-low-data');
  await expect(note).toBeVisible();
  await expect(note).toContainText(tr(lang, `analyticsV2.lowData.few_${new Intl.PluralRules(lang).select(2)}`).replace('{{count}}', '2'));
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'R1-42-reports-two-real-bookings' });

  // The CSV carries exactly the two real rows, with no demo marker in the name or the file.
  const csv = await exportView(page, isMobile);
  expect(csv.name).not.toMatch(/DEMO/i);
  expect(csv.text).not.toMatch(/DEMO DATA/);
  const lines = csv.text.trim().split(/\r?\n/);
  expect(lines, 'header + the two real rows').toHaveLength(3);
  for (const id of real) expect(csv.text).toContain(id);
});

test('R1-65 an admin with no bookings at all sees zeros and an honest empty note, never sample data', async ({ page, loginAs, healthy, lang }) => {
  await loginAs('admin');
  await tokenSettle(page);
  await trimBookings(page, () => []);
  await page.goto('/analytics/reports');

  await expect(page.getByTestId('metric-requests')).toHaveText('0');
  await expect(page.getByTestId('metric-completed')).toHaveText('0');
  await expect(page.getByTestId('banner-demo-data')).toHaveCount(0);
  await expect(page.getByTestId('badge-demo-data')).toHaveCount(0);
  await expect(page.getByTestId('note-low-data')).toContainText(tr(lang, 'analyticsV2.lowData.none'));
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'R1-65-reports-no-bookings' });
});

test('R1-42 with five or more real bookings there is no low-data note', async ({ page, loginAs, healthy, personaProject }) => {
  const fixtures = (['pending-1', 'pending-2', 'pending-3', 'accepted', 'confirmed', 'completed'] as const).map((k) => bookingId(personaProject, k));
  await loginAs('admin');
  await tokenSettle(page);
  await trimBookings(page, (rows) => rows.filter((r) => fixtures.includes(r.id)));
  await page.goto('/analytics/reports');
  await expect(page.getByTestId('metric-requests')).toHaveText('6');
  await expect(page.getByTestId('note-low-data')).toHaveCount(0);
  await expect(page.getByTestId('banner-demo-data')).toHaveCount(0);
  await healthy({ screenshotName: 'R1-42-reports-six-real-bookings' });
});

test('R1-65 growth analytics are for admins and mentors: a mentee gets the no-access card', async ({ page, loginAs, healthy, lang }) => {
  await loginAs('mentee');
  await tokenSettle(page);
  await page.goto('/analytics/reports');
  await expect(page.getByText(tr(lang, 'guard.noAccessTitle')).first()).toBeVisible();
  await expect(page.getByTestId('metric-requests')).toHaveCount(0);
  await expect(page.getByTestId('analytics-nothing-yet')).toHaveCount(0);
  await healthy({ screenshotName: 'R1-65-mentee-forbidden' });
});

test('R1-65 a mentor still opens growth analytics (their own sessions)', async ({ page, loginAs, healthy }) => {
  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/analytics/reports');
  await expect(page.getByTestId('analytics-summary')).toBeVisible();
  await expect(page.getByTestId('banner-demo-data')).toHaveCount(0);
  await expect(page.getByTestId('note-low-data'), 'the low-data note is the programme view only').toHaveCount(0);
  await healthy({ screenshotName: 'R1-65-mentor-reports' });
});
