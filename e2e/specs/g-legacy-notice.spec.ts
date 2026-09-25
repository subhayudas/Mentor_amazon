import { test, expect } from '../fixtures/test';

/**
 * The "saved in this browser during the preview" list (R1-82): each item's date sits on the
 * same baseline as its description, not raised like a superscript. The row is a flex line
 * mixing body-sm text with a smaller caption; with the default `align-items: stretch` the
 * caption's text rode at the top of its box. Baselines are measured with a zero-size
 * inline-block probe (its bottom edge sits on the baseline of the line it is placed in).
 */
const LEGACY = {
  'mentorconnect.local.bookings': JSON.stringify([
    { id: 'local-b1', mentor_id: 'manav-gupta', mentee_id: 'local-m1', status: 'pending', goal: 'Plan my move into product management', created_at: '2026-09-01T10:00:00.000Z' },
  ]),
  'mentorconnect.local.mentees': JSON.stringify([{ id: 'local-m1', name: 'Layla', email: 'layla.preview@example.com', created_at: '2026-08-31T09:00:00.000Z' }]),
  menteeId: 'local-m1',
};

test('R1-82 each preview-period item and its date share one baseline', async ({ page, healthy }) => {
  await page.goto('/legal');
  await page.evaluate((seed) => Object.entries(seed).forEach(([k, v]) => window.localStorage.setItem(k, v)), LEGACY);
  await page.goto('/');
  await expect(page.getByTestId('notice-legacy-data')).toBeVisible();
  await page.getByTestId('button-legacy-show').click();
  const items = page.getByTestId('list-legacy-items').locator('li');
  await expect(items).toHaveCount(2);

  const rows = await items.evaluateAll((lis) =>
    lis.map((li) => {
      const [text, date] = Array.from(li.children) as HTMLElement[];
      const firstBaseline = (el: HTMLElement) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        el.insertBefore(probe, el.firstChild);
        const y = probe.getBoundingClientRect().bottom;
        probe.remove();
        return y;
      };
      const t = text.getBoundingClientRect();
      const d = date.getBoundingClientRect();
      return { sameLine: d.top < t.bottom - 1, text: firstBaseline(text), date: firstBaseline(date) };
    }),
  );
  const sharing = rows.filter((r) => r.sameLine);
  expect(sharing.length, 'at least one item keeps its date on the same line').toBeGreaterThan(0);
  for (const r of sharing) expect(Math.abs(r.date - r.text), `date baseline ${r.date} vs text baseline ${r.text}`).toBeLessThanOrEqual(1);
  await healthy({ screenshotName: 'R1-82-legacy-list' });

  // Leave the browser clean for the next test.
  await page.getByTestId('button-legacy-clear').click();
});
