import { test, expect } from '../fixtures/test';
import { ids } from '../fixtures/personas';
import { FEATURED, FEATURED_IDS, plain, tr, useLanguage } from './b-helpers';

/**
 * S1 directory parity, S2 the unseeded state, S25 unknown ids (design §6.4, B1–B3).
 *
 * S2 is simulated in the browser: the spec drops the five curated rows from the app's
 * `mentors_public` responses (the list, and the single-row read as "no row"), which is
 * exactly what the client sees before migrations/0004 runs, without deleting shared rows
 * that other specs' requests, favourites and webhooks may reference.
 */
test.beforeEach(async ({ page, lang }) => {
  await useLanguage(page, lang);
});

test('S1 directory: one card per curated mentor with its db id, linked by slug, never fewer than the landing', async ({ page, healthy, lang }) => {
  await page.goto('/mentors');
  const grid = page.getByTestId('mentor-grid');
  await expect(grid).toBeVisible();
  for (const f of FEATURED) {
    const cards = page.getByTestId(`card-mentor-${f.dbId}`);
    await expect(cards, `exactly one card for ${f.slug}`).toHaveCount(1);
    await expect(page.getByTestId(`link-mentor-${f.dbId}`)).toHaveAttribute('href', `/mentor/${f.slug}`);
    await expect(cards.getByRole('heading')).toContainText(lang === 'ar' ? f.nameAr : f.name);
    // Slug-id duplicates of a seeded mentor must not exist.
    await expect(page.getByTestId(`card-mentor-${f.slug}`)).toHaveCount(0);
  }
  const cardCount = await grid.locator('> li').count();
  expect(cardCount).toBeGreaterThanOrEqual(5);
  // Photos load (naturalWidth > 0).
  for (const f of FEATURED) {
    const img = page.getByTestId(`card-mentor-${f.dbId}`).locator('img').first();
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  // No fabricated social proof on curated cards (D14): ratings come from the DB (0 = none).
  for (const f of FEATURED) await expect(page.getByTestId(`rating-${f.dbId}`)).toHaveCount(0);
  await healthy({ screenshotName: 'S1-directory' });
});

test('S2 unseeded: five static cards, "opening soon", no form and no heart, nothing in localStorage', async ({ page, healthy, lang }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'S2 runs on desktop-en and mobile-ar');
  await page.route('**/rest/v1/mentors_public*', async (route) => {
    const url = decodeURIComponent(route.request().url());
    const single = [...FEATURED_IDS].find((id) => url.includes(`id=eq.${id}`));
    if (single) {
      return route.fulfill({
        status: 406,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }),
      });
    }
    const response = await route.fetch();
    const rows = (await response.json()) as Array<{ id: string }>;
    return route.fulfill({ response, json: Array.isArray(rows) ? rows.filter((r) => !FEATURED_IDS.has(r.id)) : rows });
  });

  await page.goto('/mentors');
  for (const f of FEATURED) {
    const card = page.getByTestId(`card-mentor-${f.slug}`);
    await expect(card).toHaveCount(1);
    await expect(card.locator('[data-status="opening-soon"]')).toHaveText(tr(lang, 'mentorCard.openingSoon'));
    await expect(page.getByTestId(`link-mentor-${f.slug}`)).toHaveAttribute('href', `/mentor/${f.slug}`);
    await expect(page.getByTestId(`button-favorite-${f.slug}`)).toHaveCount(0);
  }
  await healthy({ screenshotName: 'S2-directory-unseeded' });

  const target = FEATURED[0];
  await page.goto(`/mentor/${target.slug}`);
  await expect(page.getByTestId('featured-opening-soon')).toBeVisible();
  await expect(page.getByTestId('link-book-session-rail')).toHaveCount(0);
  await expect(page.getByTestId(`button-favorite-${target.dbId}`)).toHaveCount(0);
  await healthy({ screenshotName: 'S2-profile-unseeded' });

  await page.goto(`/mentor/${target.slug}/book`);
  await expect(page.getByTestId('scheduler-opening-soon')).toBeVisible();
  await expect(page.getByTestId('form-session-request')).toHaveCount(0);
  await expect(page.getByTestId('turnstile')).toHaveCount(0);
  await healthy({ screenshotName: 'S2-book-unseeded' });

  const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('mentorconnect.local.')));
  expect(keys).toEqual([]);
});

test('S25 unknown ids show not found and never another mentor', async ({ page, healthy, lang }) => {
  const notFound = tr(lang, 'mentorProfile.notFound.title');
  for (const path of ['/mentor/nope', '/mentor/nope/book', '/mentor/00000000-0000-4000-8000-000000000000/book']) {
    await page.goto(path);
    await expect(page.getByTestId('mentor-not-found')).toBeVisible();
    const text = plain(await page.locator('body').innerText());
    expect(text).toContain(notFound);
    for (const f of FEATURED) expect(text, `${path} must not show ${f.name}`).not.toContain(lang === 'ar' ? f.nameAr : f.name);
    await healthy({ screenshotName: `S25${path.replace(/\//g, '_')}`, allowStatus: [{ url: /\/rest\/v1\//, status: 406 }] });
  }
});

test('S25 a curated mentor resolves by slug and by database id; a DB mentor /book redirects to its profile', async ({ page, healthy, personaProject }) => {
  const f = FEATURED[1];
  await page.goto(`/mentor/${f.dbId}`);
  await expect(page.locator('[data-page-state]')).toHaveAttribute('data-page-state', 'db');
  await expect(page.locator('#page-title')).toContainText(/\S/);
  await healthy({ screenshotName: 'S25-profile-by-dbid' });

  const mentorId = ids(personaProject).mentor;
  await page.goto(`/mentor/${mentorId}/book`);
  await expect(page).toHaveURL(new RegExp(`/mentor/${mentorId}$`));
  await expect(page.getByTestId('mentor-not-found')).toHaveCount(0);
  await healthy({ screenshotName: 'S25-db-mentor-book-redirect' });
});
