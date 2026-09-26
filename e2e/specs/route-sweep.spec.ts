import { test, expect, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { ids } from '../fixtures/personas';

/**
 * Route sweep (design §6.4): every route × every persona × the four viewport/language
 * projects, data-driven. Each visit runs the health checks (html[data-backend], dir/lang,
 * no page errors or failing responses, no horizontal overflow, no raw i18n keys, a heading,
 * a full-page screenshot). Cells marked "existing" assert only the health checks.
 *
 * The cells assert Track B/C behaviour (the data-backend attribute, /book, guards, the
 * dashboard states and their data-testids), so the sweep runs green only on the merged tree
 * (Phase 3), not on Track A's branch alone.
 */
const MANAV_DB_ID = '738d7465-42c6-5550-be9a-6e7ef35f52bc';
const PERSONAS = ['anon', 'mentee', 'mentee-new', 'mentor', 'mentor-new', 'admin'] as const;
type SweepPersona = (typeof PERSONAS)[number];

type Expectation =
  | 'ok' // healthy, not redirected to login, not the not-found or no-access page
  | 'existing' // healthy only ("existing behaviour" in §6.4)
  | 'login' // sent to /login?next=<the route>
  | 'notFound'
  | 'forbidden'
  | 'forbiddenViaAdmin' // redirected to /admin, which refuses
  | 'featured' // the featured profile of Manav Gupta
  | 'dbProfile' // the e2e mentor's DB profile
  | 'requestForm' // /book: the request form, no Cal.com iframe (e-mail read-only when signed in)
  | 'resetInvalid' // /reset-password without a recovery session: the invalid-link state, no form
  | 'confirmExpired' // /auth/confirm without a session: "expired or already used" with a resend form
  | 'menteeHome'
  | 'mentorHome'
  | 'registrationCta' // a mentee account without a mentees row: "complete your registration"
  | 'finishProfile' // an approved mentor without a mentors row: "finish your profile"
  | 'noBookings' // no booking rows: the empty state or the profile-needed card
  | 'calPanel' // the mentor's profile page with the Cal.com sync panel
  | 'gate' // /mentor-onboarding refuses a non-mentor with the gate card
  | { redirect: RegExp; next?: boolean }; // next: the redirect carries ?next=<the route>

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
  // An ordinary session is not a recovery session, so every persona gets the invalid-link state.
  { routes: ['/reset-password'], cells: all('resetInvalid') },
  // With a session the page finishes the sign-in and moves on (existing behaviour).
  { routes: ['/auth/confirm'], cells: signedIn('confirmExpired', { mentee: 'existing', 'mentee-new': 'existing', mentor: 'existing', 'mentor-new': 'existing', admin: 'existing' }) },
  {
    routes: ['/mentee-registration'],
    cells: signedIn({ redirect: /^\/signup$/, next: true }, { mentee: 'existing', 'mentee-new': 'ok', mentor: 'existing', 'mentor-new': 'existing', admin: 'existing' }),
  },
  {
    routes: ['/mentee-dashboard', '/mentee-dashboard/bookings'],
    cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'existing', mentor: 'existing', 'mentor-new': 'existing', admin: 'existing' }),
  },
  { routes: ['/dashboard'], cells: signedIn('login', { mentee: 'menteeHome', 'mentee-new': 'registrationCta', mentor: 'mentorHome', 'mentor-new': 'finishProfile', admin: { redirect: /^\/admin$/ } }) },
  { routes: ['/dashboard/bookings'], cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'noBookings', mentor: 'ok', 'mentor-new': 'noBookings', admin: { redirect: /^\/admin\/bookings$/ } }) },
  { routes: ['/dashboard/calendar'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'ok', 'mentor-new': 'ok', admin: { redirect: /^\/admin$/ } }) },
  { routes: ['/dashboard/profile'], cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'registrationCta', mentor: 'calPanel', 'mentor-new': 'finishProfile', admin: { redirect: /^\/admin$/ } }) },
  { routes: ['/dashboard/activity'], cells: signedIn('login', { mentee: 'ok', 'mentee-new': 'ok', mentor: 'ok', 'mentor-new': 'ok', admin: 'ok' }) },
  { routes: ['/dashboard/admin'], cells: signedIn('login', { mentee: 'forbiddenViaAdmin', 'mentee-new': 'forbidden', mentor: 'forbidden', 'mentor-new': 'forbidden', admin: { redirect: /^\/admin$/ } }) },
  { routes: ['/analytics'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'ok', 'mentor-new': 'ok', admin: 'ok' }) },
  { routes: ['/analytics/report'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'forbidden', 'mentor-new': 'forbidden', admin: 'ok' }) },
  { routes: ['/analytics/reports'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'ok', 'mentor-new': 'ok', admin: 'ok' }) },
  { routes: ['/mentor-onboarding'], cells: signedIn('login', { mentee: 'gate', 'mentee-new': 'gate', mentor: { redirect: /^\/mentor-portal/ }, 'mentor-new': 'ok', admin: 'existing' }) },
  { routes: ['/mentor-portal'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'ok', 'mentor-new': 'ok', admin: 'forbidden' }) },
  { routes: ['/mentor-portal/profile'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'calPanel', 'mentor-new': 'ok', admin: 'forbidden' }) },
  { routes: ['/admin', '/admin/bookings', '/admin/mentees', '/admin/access'], cells: signedIn('login', { mentee: 'forbidden', 'mentee-new': 'forbidden', mentor: 'forbidden', 'mentor-new': 'forbidden', admin: 'ok' }) },
];

/** States that wait for the auth client (an 8 s budget in the app) before they settle. */
const AUTH_WAIT = { timeout: 15_000 };

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

          const notLoginOrRefused = async () => {
            expect(pathOf(page), 'not sent to login').not.toBe('/login');
            await expect(page.getByText(tr(lang, 'errors.notFoundTitle'))).toHaveCount(0);
            await expect(page.getByText(tr(lang, 'guard.noAccessTitle'))).toHaveCount(0);
          };
          const byTestId = (id: string) => page.getByTestId(id);

          if (typeof expectation === 'object') {
            await expect(page).toHaveURL((u) => expectation.redirect.test(u.pathname));
            if (expectation.next) await expect(page).toHaveURL((u) => u.searchParams.get('next') === route);
          } else {
            switch (expectation) {
              case 'login':
                await expect(page).toHaveURL((u) => u.pathname === '/login' && u.searchParams.get('next') === route);
                break;
              case 'notFound':
                await expect(page.getByRole('heading', { level: 1 })).toHaveText(tr(lang, 'errors.notFoundTitle'));
                break;
              case 'forbidden':
                await expect(page.getByText(tr(lang, 'guard.noAccessTitle')).first()).toBeVisible();
                break;
              case 'forbiddenViaAdmin':
                await expect(page).toHaveURL((u) => u.pathname === '/admin');
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
              case 'resetInvalid':
                await expect(byTestId('card-reset-invalid')).toBeVisible(AUTH_WAIT);
                await expect(byTestId('button-reset-password')).toHaveCount(0);
                break;
              case 'confirmExpired':
                await expect(byTestId('card-confirm-expired')).toBeVisible(AUTH_WAIT);
                await expect(byTestId('card-confirm-expired').getByRole('button').first()).toBeVisible();
                break;
              case 'menteeHome':
                await notLoginOrRefused();
                await expect(byTestId('mentee-stats')).toBeVisible();
                await expect(byTestId('card-complete-registration')).toHaveCount(0);
                break;
              case 'mentorHome':
                await notLoginOrRefused();
                await expect(byTestId('period-stats')).toBeVisible();
                await expect(byTestId('card-finish-profile')).toHaveCount(0);
                break;
              case 'registrationCta':
                await expect(byTestId('card-complete-registration')).toBeVisible();
                await expect(byTestId('link-complete-registration')).toHaveAttribute('href', '/mentee-registration');
                break;
              case 'finishProfile':
                await expect(byTestId('card-finish-profile')).toBeVisible();
                await expect(byTestId('link-finish-profile')).toHaveAttribute('href', '/mentor-onboarding');
                break;
              case 'noBookings':
                await notLoginOrRefused();
                await expect(byTestId('bookings-empty').or(byTestId('card-complete-registration')).or(byTestId('card-finish-profile'))).toBeVisible();
                await expect(page.locator('[data-testid^="booking-row-"]')).toHaveCount(0);
                break;
              case 'calPanel':
                await notLoginOrRefused();
                await expect(byTestId('cal-sync-panel')).toBeVisible();
                break;
              case 'gate':
                await expect(byTestId('card-onboarding-gate')).toBeVisible();
                await expect(byTestId('input-name')).toHaveCount(0);
                break;
              case 'ok':
                if (route === '/login') {
                  await expect(page.getByText(tr(lang, 'errors.notFoundTitle'))).toHaveCount(0);
                } else {
                  await notLoginOrRefused();
                }
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
