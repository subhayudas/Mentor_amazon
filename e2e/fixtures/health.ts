import { expect, type Page, type Response, type TestInfo } from '@playwright/test';

/**
 * Health checks every visit makes (design §6.4). A tracker records page errors and failing
 * same-origin / Supabase responses from the moment the page is created; expectHealthyPage()
 * asserts on them together with the page's shape and attaches a full-page screenshot. The
 * checks are soft: one run reports every problem on the page (the test still fails).
 * The design's axe scan is not included: no axe package is installed (package.json is frozen).
 */
export interface HealthTracker {
  pageErrors: string[];
  badResponses: Array<{ url: string; status: number; method: string }>;
  reset(): void;
}

export function trackHealth(page: Page, opts: { appOrigin: string; supabaseOrigin: string }): HealthTracker {
  const tracker: HealthTracker = {
    pageErrors: [],
    badResponses: [],
    reset() {
      tracker.pageErrors.length = 0;
      tracker.badResponses.length = 0;
    },
  };
  page.on('pageerror', (err) => tracker.pageErrors.push(err.message));
  page.on('response', (res: Response) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (url.startsWith(opts.appOrigin) || url.startsWith(opts.supabaseOrigin)) {
      tracker.badResponses.push({ url, status, method: res.request().method() });
    }
  });
  return tracker;
}

export interface HealthyPageOptions {
  lang: 'en' | 'ar';
  backend?: 'database' | 'local';
  /** Responses with status >= 400 that this visit expects (e.g. [/\/rest\/v1\/.*\bstatus 406/]). */
  allowStatus?: Array<{ url?: RegExp; status: number }>;
  /** Skip the heading check (pages that deliberately render no h1, e.g. a redirect in flight). */
  noHeading?: boolean;
  screenshotName?: string;
}

// A dotted lower-camel identifier with 3+ segments looks like an untranslated i18n key.
const RAW_KEY = /\b[a-z][A-Za-z0-9]+(?:\.[A-Za-z0-9_]+){2,}\b/g;
const DOMAIN_LIKE = /\.(?:com|app|test|invalid|net|org|io|ae|co|dev|local)$/i;

export async function expectHealthyPage(page: Page, tracker: HealthTracker, testInfo: TestInfo, opts: HealthyPageOptions): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  const html = page.locator('html');
  await expect.soft(html, 'data-backend attribute (design D7)').toHaveAttribute('data-backend', opts.backend ?? 'database');
  await expect.soft(html, 'document direction').toHaveAttribute('dir', opts.lang === 'ar' ? 'rtl' : 'ltr');
  await expect.soft(html, 'document language').toHaveAttribute('lang', new RegExp(`^${opts.lang}`));

  if (!opts.noHeading) {
    await expect.soft(page.locator('h1, [data-page-title]').first(), 'page heading').toBeVisible();
  }

  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect.soft(overflow.scroll, `horizontal overflow (${overflow.scroll} > ${overflow.inner})`).toBeLessThanOrEqual(overflow.inner + 1);

  const text = await page.evaluate(() => document.body?.innerText ?? '');
  const rawKeys = [...text.matchAll(RAW_KEY)]
    .map((m) => ({ key: m[0], before: text[m.index! - 1] ?? '', after: text[m.index! + m[0].length] ?? '' }))
    .filter((m) => !DOMAIN_LIKE.test(m.key) && m.before !== '@' && m.before !== '/' && m.after !== '@' && m.after !== '/')
    .map((m) => m.key);
  expect.soft(rawKeys, 'visible untranslated i18n keys').toEqual([]);

  expect.soft(tracker.pageErrors, 'uncaught page errors').toEqual([]);
  // PostgREST answers a `.single()` lookup that finds no row with 406 (PGRST116), which the
  // client treats as "none"; that one status on /rest/v1 is a normal outcome, not a failure.
  const allowed = [{ url: /\/rest\/v1\//, status: 406 }, ...(opts.allowStatus ?? [])];
  const unexpected = tracker.badResponses.filter((r) => !allowed.some((a) => a.status === r.status && (!a.url || a.url.test(r.url))));
  expect.soft(unexpected, 'failing same-origin / Supabase responses').toEqual([]);

  const shot = await page.screenshot({ fullPage: true });
  await testInfo.attach(opts.screenshotName ?? 'page', { body: shot, contentType: 'image/png' });
}
