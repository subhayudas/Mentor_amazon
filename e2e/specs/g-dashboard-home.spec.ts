import { test, expect, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { ids, uuidv5 } from '../fixtures/personas';
import { expectNoDemo, recordPaths, tokenSettle } from './c-helpers';

/**
 * The mentor home in database mode says only what is true (R1-43, R1-44, R1-45):
 * - no "Mentors who fill their calendar with the programme" claim about named people: other
 *   real mentors from the directory are listed under a neutral title;
 * - "Refer now" really shares an invitation (share sheet, else the clipboard with a toast, or
 *   an e-mail draft) instead of bouncing an onboarded mentor to their own portal;
 * - the quick action that opened office hours no longer promises "session types";
 * - R1-77: the arrow on the "Your page" link points the reading way (mirrored in Arabic), like
 *   every other directional icon.
 */

type Db = import('postgres').Sql;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The mentors row behind a `/mentor/<id-or-slug>` link (a curated slug maps to its UUIDv5 row id, design §3.1). */
async function mentorBehind(db: Db, href: string) {
  const key = decodeURIComponent(href.replace(/^\/mentor\//, ''));
  const id = UUID.test(key) ? key : uuidv5(`https://mentor-amazon.vercel.app/mentor/${key}`);
  const [row] = await db<{ id: string; is_available: boolean }[]>`select id, is_available from public.mentors where id = ${id}`;
  return row;
}

async function openMentorHome(page: Page, loginAs: (p: 'mentor') => Promise<unknown>): Promise<void> {
  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('checklist')).toBeVisible();
}

test('R1-43 R1-45 the mentor home lists other real mentors with no claim about them, and the quick action says what it opens', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  await openMentorHome(page, loginAs);
  // The invented claim is gone.
  await expect(page.getByText(tr(lang, 'showcase.dashboard.inspiredSub'))).toHaveCount(0);
  await expect(page.getByRole('heading', { name: tr(lang, 'showcase.dashboard.inspired'), exact: true })).toHaveCount(0);

  // Other mentors: real, available database rows, never the viewer.
  const section = page.getByTestId('section-other-mentors');
  await expect(section.getByRole('heading', { level: 2 })).toHaveText(tr(lang, 'showcase.dashboard.otherMentors'));
  const links = section.locator('a[data-testid^="link-other-mentor-"]');
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs.length).toBeLessThanOrEqual(3);
  for (const href of hrefs) {
    const row = await mentorBehind(db, href);
    expect(row, `${href} is a mentors row`).toBeTruthy();
    expect(row.is_available, `${href} takes requests`).toBe(true);
    expect(row.id, 'the viewer is not listed').not.toBe(ids(personaProject).mentor);
  }

  // "Set office hours" opens the calendar; nothing promises session types.
  await expect(page.getByText(tr(lang, 'showcase.dashboard.addSession'), { exact: true })).toHaveCount(0);
  const officeHours = page.getByRole('link', { name: tr(lang, 'showcase.dashboard.setOfficeHours'), exact: true });
  await expect(officeHours).toHaveAttribute('href', '/dashboard/calendar');
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'R1-43-mentor-home' });
});

test('R2-04 the checklist keeps its width while the directory loads: the other-mentors column holds its place', async ({ page, loginAs, healthy }) => {
  // Hold the directory list (not single-mentor reads) until the checklist has been measured.
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/rest/v1/mentors_public?*', async (route) => {
    if (new URL(route.request().url()).searchParams.has('id')) return route.continue();
    await gate;
    await route.continue();
  });
  await openMentorHome(page, loginAs);
  const checklist = page.getByTestId('checklist');
  const loading = (await checklist.boundingBox())!;
  await page.screenshot({ path: test.info().outputPath('R2-04-directory-loading.png') });
  release();
  await expect(page.getByTestId('section-other-mentors')).toBeVisible();
  const loaded = (await checklist.boundingBox())!;
  expect(Math.round(loaded.width), 'no jump from one column to two').toBe(Math.round(loading.width));
  expect(Math.round(loaded.x)).toBe(Math.round(loading.x));
  await expect(page.getByTestId('section-other-mentors-loading')).toHaveCount(0);
  await healthy({ screenshotName: 'R2-04-directory-loaded' });
});

test('R1-44 "Refer now" hands the share sheet a sign-in invitation and keeps the mentor on the page', async ({ page, loginAs, healthy, lang, baseURL }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shared: ShareData[] }).__shared = [...((window as unknown as { __shared?: ShareData[] }).__shared ?? []), data];
      },
    });
  });
  const paths = recordPaths(page);
  await openMentorHome(page, loginAs);
  const before = paths.length;
  await page.getByTestId('button-refer-share').click();
  const shared = await page.evaluate(() => (window as unknown as { __shared?: ShareData[] }).__shared ?? []);
  expect(shared).toHaveLength(1);
  expect(shared[0].url).toBe(`${new URL(baseURL!).origin}/login`);
  expect(shared[0].title).toBe(tr(lang, 'showcase.dashboard.referSubject'));
  expect(shared[0].text).toBe(tr(lang, 'showcase.dashboard.referMessage'));
  await page.waitForTimeout(500);
  expect(paths.slice(before), 'no navigation (the old link bounced to /mentor-portal)').toEqual([]);
  await expect(page).toHaveURL((u) => u.pathname === '/dashboard');
  await healthy({ screenshotName: 'R1-44-refer-shared' });
});

test('R1-44 without a share sheet "Refer now" copies the invitation, says so, and offers an e-mail draft', async ({ page, context, loginAs, healthy, lang, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await openMentorHome(page, loginAs);
  const loginUrl = `${new URL(baseURL!).origin}/login`;
  await page.getByTestId('button-refer-share').click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: tr(lang, 'showcase.dashboard.referCopied') })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`${tr(lang, 'showcase.dashboard.referMessage')}\n${loginUrl}`);

  const mail = page.getByTestId('link-refer-email');
  await expect(mail).toHaveText(tr(lang, 'showcase.dashboard.referEmail'));
  const href = (await mail.getAttribute('href')) ?? '';
  expect(href.startsWith('mailto:?subject=')).toBe(true);
  const params = new URLSearchParams(href.slice('mailto:?'.length));
  expect(params.get('subject')).toBe(tr(lang, 'showcase.dashboard.referSubject'));
  expect(params.get('body')).toContain(loginUrl);
  await expect(page).toHaveURL((u) => u.pathname === '/dashboard');
  await healthy({ screenshotName: 'R1-44-refer-copied' });
});

test('R1-77 the "Your page" arrow points the reading way: mirrored in Arabic, untouched in English', async ({ page, loginAs, healthy, lang }) => {
  await openMentorHome(page, loginAs);
  const yourPage = page.getByTestId('link-your-page');
  await expect(yourPage).toBeVisible();
  const transform = await yourPage.locator('svg').first().evaluate((el) => getComputedStyle(el).transform);
  if (lang === 'ar') expect(transform, 'the arrow is mirrored in Arabic').toBe('matrix(-1, 0, 0, 1, 0, 0)');
  else expect(transform, 'the arrow is untouched in English').toBe('none');
  await healthy({ screenshotName: 'R1-77-your-page-arrow' });
});
