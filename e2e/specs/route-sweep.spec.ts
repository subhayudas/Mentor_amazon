import { test, expect, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { ids } from '../fixtures/personas';

/**
 * Route sweep (design §6.4): every route × every persona × the four viewport/language
 * projects, data-driven. Each visit runs the health checks (html[data-backend], dir/lang,
 * no page errors or failing responses, no horizontal overflow, no raw i18n keys, a heading,
 * a full-page screenshot). Cells marked "existing" assert only the health checks.
 */
const MANAV_DB_ID = '738d7465-42c6-5550-be9a-6e7ef35f52bc';
const PERSONAS = ['anon', 'mentee', 'mentee-new', 'mentor', 'mentor-new', 'admin'] as const;
type SweepPersona = (typeof PERSONAS)[number];

type Expectation =
  | 'ok' // healthy, not redirected to login, not the not-found page
  | 'existing' // healthy only
  | 'login' // sent to /login
  | 'notFound'
  | 'forbidden'
  | 'featured' // the featured profile of Manav Gupta
  | 'dbProfile' // the e2e mentor's DB profile
  | 'requestForm' // /book: the request form, no Cal.com iframe
  | { redirect: RegExp };

/** Route templates; `{mentor}` is the project's e2e mentor id (resolved per project). */
type Row = { routes: string[]; cells: Record<SweepPersona, Expectation> };
const all = (e: Expectation): Record<SweepPersona, Expectation> => ({
  anon: e, mentee: e, 'mentee-new': e, mentor: e, 'mentor-new': e, admin: e,
});
const signedIn = (anon: Expectation, rest: Omit<Record<SweepPersona, Expectation>, 'anon'>) => ({ anon, ...rest });

const ROWS: Row[] = [
  { routes: ['/', '/mentors', '/legal', '/request-access', '/login', '/signup', '/forgot-password'], cells: all('ok') },
  { routes: ['/mentor/manav-gupta', `/mentor/${MANAV_DB_ID}`, `/mentors/${MANAV_DB_ID}`], cells: all('featured') },
  { routes: ['/mentor/{mentor}'], cells: all('dbProfile') },
  { routes: ['/mentor/manav-gupta/book'], cells: all('requestForm') },
  { routes: ['/mentor/{mentor}/book'], cells: all({ redirect: /^\/mentor\/[0-9a-f-]{36}$/ }) },
  { routes: ['/mentor/nope', '/mentor/nope/book', '/nonexistent'], cells: all('notFound') },
  { routes: ['/profile/mentor/{mentor}'], cells: all({ redirect: /^\/mentors?\/[0-9a-f-]{36}$/ }) },
  { routes: ['/reset-password'], cells: all('existing') },
  { routes: ['/auth/confirm'], cells: signedIn('ok', { mentee: 'existing', 'mentee-new': 'existing', mentor: 'existing', 'mentor-new': 'existing', admin: 'existing' }) },
  {
    routes: ['/mentee-registration'],
    cells: signedIn({ redirect: /^\/signup$/ }, { mentee: 'existing', 'mentee-new': 'ok', mentor: 'existing', 'mentor-new': 'existing', admin: 'existing' }),
  },
  {
    routes: ['/mentee-dashboard', '/mentee-dashboard/bookings'],
    cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'existing', mentor: 'existing', 'mentor-new': 'existing', admin: 'existing' }),
  },
  { routes: ['/dashboard'], cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'ok', mentor: 'ok', 'mentor-new': 'ok', admin: { redirect: /^\/admin$/ } }) },
  { routes: ['/dashboard/bookings'], cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'ok', mentor: 'ok', 'mentor-new': 'ok', admin: { redirect: /^\/admin\/bookings$/ } }) },
  { routes: ['/dashboard/calendar'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'ok', 'mentor-new': 'ok', admin: { redirect: /^\/admin$/ } }) },
  { routes: ['/dashboard/profile'], cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'ok', mentor: 'ok', 'mentor-new': 'ok', admin: { redirect: /^\/admin$/ } }) },
  { routes: ['/dashboard/activity'], cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'ok', mentor: 'ok', 'mentor-new': 'ok', admin: 'ok' }) },
  { routes: ['/dashboard/admin'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'forbidden', 'mentor-new': 'forbidden', admin: { redirect: /^\/admin$/ } }) },
  { routes: ['/analytics'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'ok', 'mentor-new': 'ok', admin: 'ok' }) },
  { routes: ['/analytics/report'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'forbidden', 'mentor-new': 'forbidden', admin: 'ok' }) },
  { routes: ['/analytics/reports'], cells: signedIn('login', { mentee: 'existing', 'mentee-new': 'existing', mentor: 'ok', 'mentor-new': 'ok', admin: 'ok' }) },
  { routes: ['/mentor-onboarding'], cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'ok', mentor: { redirect: /^\/mentor-portal/ }, 'mentor-new': 'ok', admin: 'existing' }) },
  { routes: ['/mentor-portal', '/mentor-portal/profile'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'ok', 'mentor-new': 'ok', admin: 'forbidden' }) },
  { routes: ['/admin', '/admin/bookings', '/admin/mentees', '/admin/access'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'forbidden', 'mentor-new': 'forbidden', admin: 'ok' }) },
];

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

for (const persona of PERSONAS) {
  test.describe(`route sweep as ${persona}`, () => {
    for (const row of ROWS) {
      for (const template of row.routes) {
        test(`${persona} ${template}`, async ({ page, loginAs, healthy, lang, personaProject }) => {
          const route = template.replace('{mentor}', ids(personaProject).mentor);
          const expectation = row.cells[persona];
          if (persona !== 'anon') await loginAs(persona);
          await page.goto(route);
          await settle(page);

          if (typeof expectation === 'object') {
            await expect(page).toHaveURL((u) => expectation.redirect.test(u.pathname));
          } else {
            switch (expectation) {
              case 'login':
                await expect(page).toHaveURL((u) => u.pathname === '/login');
                break;
              case 'notFound':
                await expect(page.getByRole('heading', { level: 1 })).toHaveText(tr(lang, 'errors.notFoundTitle'));
                break;
              case 'forbidden':
                await expect(page.getByText(tr(lang, 'guard.noAccessTitle')).first()).toBeVisible();
                break;
              case 'featured':
                await expect(page.getByRole('heading', { level: 1 })).toContainText(lang === 'ar' ? 'ماناف' : 'Manav Gupta');
                break;
              case 'dbProfile':
                await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E Mentor');
                break;
              case 'requestForm':
                await expect(page.locator('form textarea').first()).toBeVisible();
                await expect(page.locator('iframe[src*="cal.com"]')).toHaveCount(0);
                if (persona !== 'anon') await expect(page.locator('input[type="email"]').first()).not.toBeEditable();
                break;
              case 'ok':
                if (route !== '/login') expect(pathOf(page), 'not sent to login').not.toBe('/login');
                await expect(page.getByText(tr(lang, 'errors.notFoundTitle'))).toHaveCount(0);
                await expect(page.getByText(tr(lang, 'guard.noAccessTitle'))).toHaveCount(0);
                break;
              case 'existing':
                break;
            }
          }
          await healthy({ screenshotName: `${persona}${route.replace(/\//g, '_')}` });
        });
      }
    }
  });
}
