import { test, expect, type Locator } from '../fixtures/test';
import { tokenSettle } from './c-helpers';

/**
 * `/analytics` charts follow the reading direction (R1-78). The funnel's value legend is a
 * grid in document order, so in Arabic it runs right to left; the bars must run the same way,
 * or every value sits under the wrong bar. The requests-over-time chart mirrors too (time runs
 * right to left, the value axis on the right), matching the rest of the RTL page.
 */

/** Horizontal centres of the x-axis tick labels, in data (DOM) order. */
async function tickCentres(chart: Locator): Promise<Array<{ label: string; x: number }>> {
  return chart.locator('.recharts-xAxis .recharts-cartesian-axis-tick').evaluateAll((ticks) =>
    ticks.map((t) => {
      const r = t.getBoundingClientRect();
      return { label: (t.textContent ?? '').trim(), x: r.left + r.width / 2 };
    }),
  );
}

test('R1-78 the funnel bars run in the reading direction, each over its own value', async ({ page, loginAs, healthy, lang }) => {
  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/analytics');
  const legend = page.getByTestId('analytics-funnel');
  await expect(legend).toBeVisible();
  const chart = page.getByTestId('chart-funnel');
  await expect(chart.locator('.recharts-xAxis .recharts-cartesian-axis-tick').first()).toBeVisible();

  const ticks = await tickCentres(chart);
  const items = await legend.locator('li').evaluateAll((lis) =>
    lis.map((li) => {
      const r = li.getBoundingClientRect();
      // The label is the text after the value line.
      return { label: (li.lastChild?.textContent ?? '').trim(), x: r.left + r.width / 2 };
    }),
  );
  expect(ticks.map((t) => t.label)).toEqual(items.map((i) => i.label));
  const leftToRight = (list: Array<{ label: string; x: number }>) => [...list].sort((a, b) => a.x - b.x).map((e) => e.label);
  expect(leftToRight(ticks), 'bars and values read in the same order').toEqual(leftToRight(items));
  // And that order is the reading direction: the first step (Requests) starts at the reading start.
  const first = ticks[0].x;
  const last = ticks[ticks.length - 1].x;
  if (lang === 'ar') expect(first).toBeGreaterThan(last);
  else expect(first).toBeLessThan(last);
  await healthy({ screenshotName: 'R1-78-funnel' });
});

test('R1-78 the requests-over-time chart runs in the reading direction with its value axis at the start side', async ({ page, loginAs, lang }) => {
  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/analytics');
  const chart = page.getByTestId('chart-requests');
  await expect(chart.locator('.recharts-xAxis .recharts-cartesian-axis-tick').first()).toBeVisible();
  const ticks = await tickCentres(chart);
  expect(ticks.length).toBeGreaterThan(1);
  const first = ticks[0].x;
  const last = ticks[ticks.length - 1].x;
  const box = (await chart.boundingBox())!;
  const yAxis = (await chart.locator('.recharts-yAxis').boundingBox())!;
  const yCentre = yAxis.x + yAxis.width / 2;
  if (lang === 'ar') {
    expect(first, 'the oldest bucket at the right').toBeGreaterThan(last);
    expect(yCentre, 'values on the right').toBeGreaterThan(box.x + box.width / 2);
  } else {
    expect(first).toBeLessThan(last);
    expect(yCentre).toBeLessThan(box.x + box.width / 2);
  }
});
