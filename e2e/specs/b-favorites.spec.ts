import { test, expect } from '../fixtures/test';
import { ids } from '../fixtures/personas';
import { featuredFor, tr, useLanguage } from './b-helpers';

/**
 * S18 (design §6.4, B9, F15): favourites point at real mentors rows — a curated mentor by its
 * database id, an onboarded mentor by its row id — toggle optimistically, and a failed write
 * rolls the heart back with an error toast.
 */
test.beforeEach(async ({ page, lang }) => {
  await useLanguage(page, lang);
});

test('S18 favourites persist with real mentor ids, un-favourite deletes, a failed insert rolls back', async ({ page, db, loginAs, healthy, lang, personaProject }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'S18 runs on desktop-en and mobile-ar');
  const menteeId = ids(personaProject).menteeEmpty;
  const dbMentor = ids(personaProject).mentor;
  const curated = featuredFor(testInfo.project.name);
  const other = featuredFor(testInfo.project.name, 1);
  const favourites = async () =>
    (await db<{ mentor_id: string }[]>`select mentor_id from public.mentee_favorites where mentee_id = ${menteeId} order by mentor_id`).map((r) => r.mentor_id);
  try {
    await db`delete from public.mentee_favorites where mentee_id = ${menteeId}`;
    await loginAs('mentee-empty');
    await page.goto('/mentors');

    const heart = (mentorId: string) => page.getByTestId(`button-favorite-${mentorId}`);
    await heart(curated.dbId).click();
    await expect(heart(curated.dbId)).toHaveAttribute('aria-pressed', 'true');
    await heart(dbMentor).click();
    await expect(heart(dbMentor)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(favourites).toEqual([curated.dbId, dbMentor].sort());
    await healthy({ screenshotName: 'S18-favourites' });

    // Un-favourite deletes the row.
    await heart(dbMentor).click();
    await expect(heart(dbMentor)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(favourites).toEqual([curated.dbId]);

    // The profile page's heart reads the same row (curated mentor by db id).
    await page.goto(`/mentor/${curated.slug}`);
    await expect(heart(curated.dbId)).toHaveAttribute('aria-pressed', 'true');

    // A failed insert: the heart flips, then rolls back with an error toast; nothing is stored.
    await page.goto('/mentors');
    await page.route('**/rest/v1/mentee_favorites*', (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
    await heart(other.dbId).click();
    await expect(page.getByText(tr(lang, 'showcase.favorites.error'), { exact: true })).toBeVisible();
    await expect(heart(other.dbId)).toHaveAttribute('aria-pressed', 'false');
    expect(await favourites()).toEqual([curated.dbId]);
  } finally {
    await db`delete from public.mentee_favorites where mentee_id = ${menteeId}`;
  }
});
