import { test, expect, type Page } from '../fixtures/test';
import { featuredFor, useLanguage } from './b-helpers';

/**
 * Direction details of the curated session page's request form, in both languages:
 *
 * - R1-76: an empty name or goal field follows the page's direction (so the Arabic placeholder
 *   and caret sit on the right); once text is typed, the text sets the field's direction.
 * - R1-77: the Send icon (a paper plane) points the reading way: mirrored in Arabic.
 */
test.beforeEach(async ({ page, lang }) => {
  await useLanguage(page, lang);
});

const direction = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => ({ dir: el.getAttribute('dir'), direction: getComputedStyle(el).direction, align: getComputedStyle(el).textAlign }));

test('S3b the request form: empty fields follow the page direction, typed text sets its own; the Send icon points the reading way (R1-76, R1-77)', async ({ page, healthy, lang }, testInfo) => {
  const f = featuredFor(testInfo.project.name, 1);
  const pageDirection = lang === 'ar' ? 'rtl' : 'ltr';
  await page.goto(`/mentor/${f.slug}/book`);
  await expect(page.getByTestId('form-session-request')).toBeVisible();

  // Empty: the page's direction, so the Arabic placeholder starts on the right.
  for (const id of ['input-session-name', 'textarea-session-goal']) {
    await expect.poll(() => direction(page, id), { message: `${id} when empty` }).toMatchObject({ dir: null, direction: pageDirection });
  }
  await healthy({ screenshotName: 'S3b-form-empty' });

  // Typed: the text decides (Latin text is LTR in either language, Arabic text is RTL).
  await page.getByTestId('textarea-session-goal').fill('We need help with our seed round deck and investor list.');
  await page.getByTestId('input-session-name').fill('ليلى المنصوري');
  await expect.poll(() => direction(page, 'textarea-session-goal')).toMatchObject({ dir: 'auto', direction: 'ltr' });
  await expect.poll(() => direction(page, 'input-session-name')).toMatchObject({ dir: 'auto', direction: 'rtl' });
  // Cleared again: back to the page's direction.
  await page.getByTestId('textarea-session-goal').fill('');
  await expect.poll(() => direction(page, 'textarea-session-goal')).toMatchObject({ dir: null, direction: pageDirection });

  // The paper plane on Send is mirrored in Arabic, untouched in English.
  const transform = await page.getByTestId('button-send-request').locator('svg').first().evaluate((el) => getComputedStyle(el).transform);
  if (lang === 'ar') expect(transform).toBe('matrix(-1, 0, 0, 1, 0, 0)');
  else expect(transform).toBe('none');
  await healthy({ screenshotName: 'S3b-form-typed' });
});
