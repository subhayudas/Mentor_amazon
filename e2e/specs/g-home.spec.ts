import { test, expect } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { expectNoDemo } from './c-helpers';

/**
 * The landing page in database mode advertises only what exists (R1-48): there is a
 * directory with search and filters, not "smart matching that pairs you with the right
 * mentor". The demo keeps the showcase wording.
 */
test('R1-48 the landing page offers search and filters, not smart matching', async ({ page, healthy, lang }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByText(tr(lang, 'showcase.bento.t6a'), { exact: true }), 'no "Smart matching"').toHaveCount(0);
  await expect(page.getByText(tr(lang, 'showcase.bento.t6big'), { exact: true }), 'no "Get matched"').toHaveCount(0);
  const tile = page.getByTestId('bento-find');
  await tile.scrollIntoViewIfNeeded();
  await expect(tile).toContainText(tr(lang, 'showcase.bento.t6dbBig'));
  await expect(tile).toContainText(tr(lang, 'showcase.bento.t6dbA'));
  await expect(tile).toContainText(tr(lang, 'showcase.bento.t6dbB'));
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'R1-48-landing' });
});
