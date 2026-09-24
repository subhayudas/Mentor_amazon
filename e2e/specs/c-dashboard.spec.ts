import { test, expect, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { bookingId, displayName, ids, mentorCalLink } from '../fixtures/personas';
import { TINY_PNG, expectNoDemo, plain, reseed, runsOn, toast, tokenSettle } from './c-helpers';

/**
 * Dashboards on the database (design §6.4 S9, S14–S17, S19, S26; C3–C10, F01/F02/F12/F13/
 * F16–F18/F22/F39–F41). Every assertion reads what a visitor reads (locale strings) and
 * checks the rows in Postgres. The file starts from the seeded state of its project (the
 * fixture bookings are changed by S9), so it reseeds in beforeAll; a retry reseeds again.
 */
test.beforeAll(async ({}, testInfo) => {
  reseed(testInfo.project.name);
});

type Db = import('postgres').Sql;

async function bookingRow(db: Db, id: string) {
  const [row] = await db<{ status: string; session_duration_minutes: number | null; canceled_by: string | null }[]>`
    select status, session_duration_minutes, canceled_by from public.bookings where id = ${id}`;
  return row;
}

async function activityFor(db: Db, id: string) {
  return db<{ type: string; visible_to: string[] }[]>`
    select type, visible_to from public.activity_events where subject_id = ${id} order by created_at`;
}

const rows = (page: Page) => page.locator('[data-testid^="booking-row-"]');

// ---------------------------------------------------------------- S16 dashboard home

test('S16 a mentee with no bookings sees an honest empty state: no demo rows, no reminders', async ({ page, loginAs, healthy, lang }) => {
  await loginAs('mentee-empty');
  await tokenSettle(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('mentee-empty')).toBeVisible();
  await expect(page.getByTestId('reminders-banner')).toHaveCount(0);
  await expect(page.locator('[data-testid^="mentee-session-"]')).toHaveCount(0);
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'S16-mentee-empty-home' });

  await page.goto('/dashboard/bookings');
  await expect(page.getByTestId('bookings-empty')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await healthy({ screenshotName: 'S16-mentee-empty-bookings' });
});

test('S16 a mentor sees exactly the three seeded requests and one reminder (the confirmed session within 24 h)', async ({ page, loginAs, healthy, lang, personaProject }) => {
  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('text-pending-count')).toContainText('3');
  const banner = page.getByTestId('reminders-banner');
  await expect(banner).toBeVisible();
  await expect(page.locator('[data-testid^="reminder-"]')).toHaveCount(1);
  await expect(page.getByTestId(`reminder-${bookingId(personaProject, 'confirmed')}`)).toBeVisible();
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'S16-mentor-home' });

  await page.goto('/dashboard/bookings');
  await expect(page.getByTestId('bookings-list')).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  const shown = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('booking-row-', '')).sort());
  expect(shown).toEqual((['pending-1', 'pending-2', 'pending-3'] as const).map((k) => bookingId(personaProject, k)).sort());
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'S16-mentor-bookings' });
});

test('S16 a mentor without a profile is asked to finish it', async ({ page, loginAs, healthy, lang }) => {
  await loginAs('mentor-new');
  await tokenSettle(page);
  await page.goto('/dashboard');
  const card = page.getByTestId('card-finish-profile');
  await expect(card).toBeVisible();
  await expect(card).toContainText(tr(lang, 'showcase.dashboard.finishProfileTitle'));
  await expect(card.locator('a[href="/mentor-onboarding"]')).toBeVisible();
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'S16-mentor-new-home' });
});

test('S16 an admin opening /dashboard is sent to /admin', async ({ page, loginAs, healthy }) => {
  await loginAs('admin');
  await tokenSettle(page);
  await page.goto('/dashboard');
  await expect(page).toHaveURL((u) => u.pathname === '/admin');
  await healthy({ screenshotName: 'S16-admin-redirect' });
});

// ---------------------------------------------------------------- S9 mentor actions (+ S17 feed lines)

test('S9 mentor accepts, declines, cancels and completes on /dashboard/bookings; the database and the feed agree', async ({ page, loginAs, healthy, db, lang, personaProject }, testInfo) => {
  const p = personaProject;
  const mentorId = ids(p).mentor;
  const [pending1, pending2, pending3] = (['pending-1', 'pending-2', 'pending-3'] as const).map((k) => bookingId(p, k));
  const accepted = bookingId(p, 'accepted');
  const confirmed = bookingId(p, 'confirmed');
  const requester = (n: number) => ids(p).requesters[n - 1];

  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/dashboard/bookings');
  await expect(page.getByTestId(`booking-row-${pending1}`)).toBeVisible();

  // Accept: the PATCH is held, and no success toast shows until the database answered.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/rest/v1/bookings?**', async (route) => {
    if (route.request().method() === 'PATCH') await held;
    await route.continue();
  });
  await page.getByTestId(`button-accept-${pending1}`).click();
  await page.waitForTimeout(1_000);
  await expect(toast(page, tr(lang, 'showcase.bookings.toast.accepted'))).toHaveCount(0);
  expect((await bookingRow(db, pending1)).status).toBe('pending');
  release();
  await expect(toast(page, tr(lang, 'showcase.bookings.toast.accepted'))).toBeVisible();
  await page.unroute('**/rest/v1/bookings?**');
  await expect.poll(async () => (await bookingRow(db, pending1)).status).toBe('accepted');
  const acceptedEvents = await activityFor(db, pending1);
  expect(acceptedEvents.map((e) => e.type)).toEqual(['request_accepted']);
  expect(acceptedEvents[0].visible_to).toEqual(expect.arrayContaining([mentorId, requester(1)]));
  const bell = await db<{ type: string }[]>`
    select type from public.notifications where booking_id = ${pending1} and type = 'booking_accepted'`;
  expect(bell.length, 'the mentee is told the request was accepted').toBeGreaterThan(0);

  // Decline, through the confirmation dialog.
  await page.getByTestId('tab-requests').click();
  await page.getByTestId(`button-decline-${pending2}`).click();
  const dialog = page.getByTestId('dialog-booking-confirm');
  await expect(dialog).toBeVisible();
  await healthy({ screenshotName: 'S9-decline-dialog' });
  await dialog.getByTestId('button-confirm-action').click();
  await expect(toast(page, tr(lang, 'showcase.bookings.toast.declined'))).toBeVisible();
  await expect.poll(async () => (await bookingRow(db, pending2)).status).toBe('rejected');
  expect((await activityFor(db, pending2)).map((e) => e.type)).toEqual(['request_declined']);

  // An aborted PATCH: the error toast, the row unchanged, no activity.
  await page.getByTestId('tab-requests').click();
  await page.route('**/rest/v1/bookings?**', (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
  await page.getByTestId(`button-accept-${pending3}`).click();
  await expect(toast(page, tr(lang, 'showcase.bookings.toast.error'))).toBeVisible();
  await expect(toast(page, tr(lang, 'showcase.bookings.toast.accepted'))).toHaveCount(0);
  await page.unroute('**/rest/v1/bookings?**');
  expect((await bookingRow(db, pending3)).status).toBe('pending');
  expect(await activityFor(db, pending3)).toEqual([]);
  await expect(page.getByTestId(`booking-row-${pending3}`)).toHaveAttribute('data-status', 'pending');

  // Complete the accepted session through the dialog with 45 minutes.
  await page.getByTestId('tab-upcoming').click();
  await page.getByTestId(`button-complete-${accepted}`).click();
  const complete = page.getByTestId('dialog-complete-session');
  await expect(complete).toBeVisible();
  await complete.getByTestId('button-minutes-45').click();
  await healthy({ screenshotName: 'S9-complete-dialog' });
  await complete.getByTestId('button-confirm-complete').click();
  await expect(toast(page, tr(lang, 'showcase.bookings.toast.completed'))).toBeVisible();
  await expect.poll(async () => (await bookingRow(db, accepted)).status).toBe('completed');
  expect((await bookingRow(db, accepted)).session_duration_minutes).toBe(45);
  const completedEvents = await activityFor(db, accepted);
  expect(completedEvents.map((e) => e.type)).toEqual(['session_completed']);
  expect(completedEvents[0].visible_to).toEqual(expect.arrayContaining([mentorId, ids(p).mentee]));

  // Cancel the confirmed session, with confirmation; it is on Cal.com too, so the dialog says so.
  await page.getByTestId('tab-upcoming').click();
  await page.getByTestId(`button-cancel-${confirmed}`).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('text-cancel-cal-note')).toBeVisible();
  await dialog.getByTestId('button-confirm-action').click();
  await expect(toast(page, tr(lang, 'showcase.bookings.toast.canceled'))).toBeVisible();
  await expect.poll(async () => (await bookingRow(db, confirmed)).status).toBe('canceled');
  expect((await bookingRow(db, confirmed)).canceled_by).toBe('mentor');
  expect((await activityFor(db, confirmed)).map((e) => e.type)).toEqual(['booking_canceled']);
  await healthy({ screenshotName: 'S9-after-actions' });

  // S17: the feed renders these trigger events as localized lines (desktop-en, desktop-ar).
  if (runsOn(testInfo, ['desktop-en', 'desktop-ar'])) {
    const mentor = displayName(p, 'mentor');
    const line = (key: string, vars: Record<string, string>) =>
      Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), tr(lang, `showcase.activity.summaries.${key}`));
    await page.goto('/dashboard/activity');
    const feed = page.getByTestId('activity-list');
    await expect(feed).toBeVisible();
    const text = async (type: string) => plain(await feed.locator(`[data-testid="activity-item"][data-type="${type}"]`).first().innerText());
    expect(await text('request_accepted')).toContain(line('request_accepted', { mentor, mentee: displayName(p, 'requester-1') }));
    expect(await text('request_declined')).toContain(line('request_declined', { mentor, mentee: displayName(p, 'requester-2') }));
    expect(await text('session_completed')).toContain(line('session_completed', { mentor, mentee: displayName(p, 'mentee'), minutes: '45' }));
    expect(await text('booking_canceled')).toContain(line('booking_canceled_mentor', { mentor, mentee: displayName(p, 'mentee') }));
    if (lang === 'ar') expect(await feed.innerText()).toMatch(/[\u0600-\u06FF]/);
    await healthy({ screenshotName: 'S17-feed' });
  }
});

// ---------------------------------------------------------------- S9 mentee actions

test('S9 a mentee withdraws a pending request and cancels an accepted session on /dashboard/bookings', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const p = personaProject;
  const { mentor, mentee } = ids(p);
  // Rows of this test only (the fixture bookings belong to the mentor test above).
  const withdrawId = `${bookingId(p, 'pending-1')}-mentee-withdraw`;
  const cancelId = `${bookingId(p, 'accepted')}-mentee-cancel`;
  const mine = [withdrawId, cancelId];
  const cleanup = async () => {
    await db`delete from public.notifications where booking_id = any(${mine})`;
    await db`delete from public.activity_events where subject_id = any(${mine})`;
    await db`delete from public.mentor_activity_log where booking_id = any(${mine})`;
    await db`delete from public.bookings where id = any(${mine})`;
  };
  try {
    await cleanup();
    await db`
      insert into public.bookings (id, mentor_id, mentee_id, status, goal, clicked_at, responded_at, created_at)
      values (${withdrawId}, ${mentor}, ${mentee}, 'pending', 'E2E: a request the mentee withdraws again.',
              timezone('utc', now()), null, timezone('utc', now())),
             (${cancelId}, ${mentor}, ${mentee}, 'accepted', 'E2E: an accepted session the mentee cancels.',
              timezone('utc', now()), timezone('utc', now()), timezone('utc', now()))`;
    await db`delete from public.activity_events where subject_id = any(${mine})`;

    await loginAs('mentee');
    await tokenSettle(page);
    await page.goto('/dashboard/bookings');
    await page.getByTestId('tab-requests').click();
    await expect(page.getByTestId(`booking-row-${withdrawId}`)).toBeVisible();
    await expectNoDemo(page, lang);

    // Withdraw, through the confirmation dialog.
    await page.getByTestId(`button-withdraw-${withdrawId}`).click();
    const dialog = page.getByTestId('dialog-booking-confirm');
    await expect(dialog).toBeVisible();
    await healthy({ screenshotName: 'S9-mentee-withdraw-dialog' });
    await dialog.getByTestId('button-confirm-action').click();
    await expect(toast(page, tr(lang, 'showcase.bookings.toast.withdrawn'))).toBeVisible();
    await expect.poll(async () => (await bookingRow(db, withdrawId)).status).toBe('canceled');
    expect((await bookingRow(db, withdrawId)).canceled_by).toBe('mentee');
    expect((await activityFor(db, withdrawId)).map((e) => e.type)).toEqual(['booking_canceled']);
    await expect(page.getByTestId(`booking-row-${withdrawId}`)).toHaveCount(0);

    // Cancel the accepted session, with confirmation.
    await page.getByTestId('tab-upcoming').click();
    await page.getByTestId(`button-cancel-${cancelId}`).click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('button-confirm-action').click();
    await expect(toast(page, tr(lang, 'showcase.bookings.toast.canceled'))).toBeVisible();
    await expect.poll(async () => (await bookingRow(db, cancelId)).status).toBe('canceled');
    expect((await bookingRow(db, cancelId)).canceled_by).toBe('mentee');
    const canceled = await activityFor(db, cancelId);
    expect(canceled.map((e) => e.type)).toEqual(['booking_canceled']);
    expect(canceled[0].visible_to).toEqual(expect.arrayContaining([mentor, mentee]));

    // Both rows are now under Canceled.
    await page.getByTestId('tab-canceled').click();
    await expect(page.getByTestId(`booking-row-${withdrawId}`)).toBeVisible();
    await expect(page.getByTestId(`booking-row-${cancelId}`)).toBeVisible();
    await healthy({ screenshotName: 'S9-mentee-after-actions' });
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- S17 feed error state

test('S17 an aborted activity read shows the error state, and Retry loads the feed', async ({ page, loginAs, healthy, lang }, testInfo) => {
  test.skip(!runsOn(testInfo, ['desktop-en', 'desktop-ar']), 'S17 runs on desktop-en and desktop-ar');
  await loginAs('mentor');
  await tokenSettle(page);
  await page.route('**/rest/v1/activity_events?**', (route) => route.abort());
  await page.goto('/dashboard/activity');
  const error = page.getByTestId('dashboard-error');
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText(tr(lang, 'showcase.activity.loadError'));
  await page.unroute('**/rest/v1/activity_events?**');
  await page.getByTestId('button-dashboard-retry').click();
  await expect(page.getByTestId('activity-list').or(page.getByTestId('activity-empty'))).toBeVisible();
  await expect(error).toHaveCount(0);
  await healthy({ screenshotName: 'S17-retry' });
});

// ---------------------------------------------------------------- S19 analytics

const DEMO_ONLY = ['showcase.analytics.kpi.views', 'showcase.analytics.sources', 'showcase.analytics.devices'];

test('S19 a mentor sees their own real numbers: no views, sources or devices; the report is admin-only', async ({ page, loginAs, healthy, lang }, testInfo) => {
  test.skip(!runsOn(testInfo, ['desktop-en', 'desktop-ar']), 'S19 runs on desktop-en and desktop-ar');
  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-kpis')).toBeVisible();
  await expect(page.getByTestId('analytics-funnel')).toBeVisible();
  for (const key of DEMO_ONLY) await expect(page.getByText(tr(lang, key), { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('note-sample-data')).toHaveCount(0);
  await expect(page.getByTestId('link-impact-report')).toHaveCount(0);
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'S19-mentor-analytics' });

  await page.goto('/analytics/report');
  await expect(page.getByText(tr(lang, 'guard.noAccessTitle')).first()).toBeVisible();
  await healthy({ screenshotName: 'S19-mentor-report-forbidden' });
});

test('S19 an admin sees programme numbers with real top mentors, and the impact report', async ({ page, loginAs, healthy, db, lang }, testInfo) => {
  test.skip(!runsOn(testInfo, ['desktop-en', 'desktop-ar']), 'S19 runs on desktop-en and desktop-ar');
  await loginAs('admin');
  await tokenSettle(page);
  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-kpis')).toBeVisible();
  const top = page.getByTestId('analytics-top-mentors');
  await expect(top).toBeVisible();
  for (const key of DEMO_ONLY) await expect(page.getByText(tr(lang, key), { exact: true })).toHaveCount(0);
  await expectNoDemo(page, lang);
  if (lang === 'en') {
    // Every name listed is a mentor with completed sessions in the database (or the generic
    // "Mentor" label for one the directory no longer lists), never the curated sample.
    const real = new Set(
      (await db<{ name: string }[]>`
        select distinct m.name from public.bookings b join public.mentors m on m.id = b.mentor_id where b.status = 'completed'`).map((r) => r.name),
    );
    real.add(tr(lang, 'showcase.bookings.mentor'));
    const labels = await top.locator('li').evaluateAll((lis) =>
      lis.map((li) => li.children[1]?.firstElementChild?.textContent?.trim() ?? '').filter(Boolean),
    );
    for (const label of labels) expect(real, `top mentor "${label}" is a real mentor`).toContain(label);
  }
  await healthy({ screenshotName: 'S19-admin-analytics' });

  await page.goto('/analytics/report');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(tr(lang, 'showcase.report.title'));
  await expect(page.getByText(tr(lang, 'guard.noAccessTitle'))).toHaveCount(0);
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'S19-admin-report' });
});

test('S19 a mentee may not open analytics', async ({ page, loginAs, healthy, lang }, testInfo) => {
  test.skip(!runsOn(testInfo, ['desktop-en', 'desktop-ar']), 'S19 runs on desktop-en and desktop-ar');
  await loginAs('mentee');
  await tokenSettle(page);
  await page.goto('/analytics');
  await expect(page.getByText(tr(lang, 'guard.noAccessTitle')).first()).toBeVisible();
  await expect(page.getByTestId('analytics-kpis')).toHaveCount(0);
  await healthy({ screenshotName: 'S19-mentee-forbidden' });
});

// ---------------------------------------------------------------- S26 admin

test('S26 /dashboard/admin goes to /admin, and the admin bookings tab lists database rows', async ({ page, loginAs, healthy, personaProject }, testInfo) => {
  test.skip(!runsOn(testInfo, ['desktop-en']), 'S26 runs on desktop-en');
  await loginAs('admin');
  await tokenSettle(page);
  await page.goto('/dashboard/admin');
  await expect(page).toHaveURL((u) => u.pathname === '/admin');
  await healthy({ screenshotName: 'S26-admin' });
  await page.goto('/dashboard/bookings');
  await expect(page).toHaveURL((u) => u.pathname === '/admin/bookings');
  for (const key of ['pending-3', 'completed'] as const) {
    await expect(page.getByTestId(`row-booking-${bookingId(personaProject, key)}`)).toBeVisible();
  }
  await healthy({ screenshotName: 'S26-admin-bookings' });
});

// ---------------------------------------------------------------- S14 profile

test('S14 a mentor edits the profile: validation, saved fields, photo in storage, cleared Cal link, public page', async ({ page, loginAs, healthy, db, lang, personaProject, browser, baseURL }) => {
  const p = personaProject;
  const mentorId = ids(p).mentor;
  const newName = `E2E Mentor Renamed (${p})`;
  const calUser = mentorCalLink(p).split('/')[0];
  try {
    await loginAs('mentor');
    await tokenSettle(page);
    await page.goto('/dashboard/profile');
    const form = page.getByTestId('form-mentor-profile');
    await expect(form).toBeVisible();
    await expect(page.getByTestId('input-profile-name')).toHaveValue(displayName(p, 'mentor'));
    await expectNoDemo(page, lang);
    await healthy({ screenshotName: 'S14-mentor-profile' });

    // An invalid Cal.com link is refused inline; nothing is written.
    await page.getByTestId('input-profile-cal').fill('not a link');
    await page.getByTestId('button-save-profile').click();
    await expect(form.getByText(tr(lang, 'mentorOnboarding.validation.calLink')).first()).toBeVisible();
    expect((await db<{ cal_link: string }[]>`select cal_link from public.mentors where id = ${mentorId}`)[0].cal_link).toBe(mentorCalLink(p));

    // Valid edits: the name, and a full Cal.com URL stored as username/event.
    await page.getByTestId('input-profile-name').fill(newName);
    await page.getByTestId('input-profile-cal').fill(`https://cal.com/${calUser}/45min?utm_source=e2e`);
    await page.getByTestId('button-save-profile').click();
    await expect.poll(async () => (await db<{ name: string; cal_link: string }[]>`
      select name, cal_link from public.mentors where id = ${mentorId}`)[0]).toEqual({ name: newName, cal_link: `${calUser}/45min` });
    const [ratings] = await db<{ total_ratings: number }[]>`select total_ratings from public.mentors where id = ${mentorId}`;
    expect(ratings.total_ratings, 'ratings are not written by a profile save').toBe(0);

    // A photo goes to the public uploads bucket and its URL is saved on the row.
    await expect(page.getByTestId('button-save-profile')).toBeEnabled();
    await page.getByTestId('input-profile-photo').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: TINY_PNG });
    const img = page.getByTestId('img-profile-photo');
    await expect(img).toHaveAttribute('src', /\/storage\/v1\/object\/public\/uploads\//);
    const src = (await img.getAttribute('src'))!;
    // Until Save, the page says the new photo is not kept yet (the row still has none).
    await expect(page.getByTestId('text-photo-status')).toHaveText(tr(lang, 'showcase.profileSettings.photoPending'));
    expect((await db<{ photo_url: string | null }[]>`select photo_url from public.mentors where id = ${mentorId}`)[0].photo_url ?? '').toBe('');
    await expect(page.getByTestId('button-save-profile')).toBeEnabled();
    await page.getByTestId('button-save-profile').click();
    await expect.poll(async () => (await db<{ photo_url: string | null }[]>`select photo_url from public.mentors where id = ${mentorId}`)[0].photo_url).toBe(src);
    await expect(page.getByTestId('text-photo-status')).toHaveText(tr(lang, 'showcase.profileSettings.photoHintLive'));
    expect((await page.request.get(src)).ok(), 'the public photo URL serves the file').toBe(true);

    // Clearing the Cal.com link stores an empty string.
    await expect(page.getByTestId('button-save-profile')).toBeEnabled();
    await page.getByTestId('input-profile-cal').fill('');
    await page.getByTestId('button-save-profile').click();
    await expect.poll(async () => (await db<{ cal_link: string | null }[]>`select cal_link from public.mentors where id = ${mentorId}`)[0].cal_link).toBe('');
    await healthy({ screenshotName: 'S14-mentor-saved' });

    // Another browser (no session) sees the saved name on the public profile.
    const other = await browser.newContext({ baseURL });
    try {
      const visitor = await other.newPage();
      await visitor.goto(`/mentor/${mentorId}`);
      await expect(visitor.getByRole('heading', { level: 1 })).toContainText(newName);
    } finally {
      await other.close();
    }
  } finally {
    await db`update public.mentors set name = ${displayName(p, 'mentor')}, cal_link = ${mentorCalLink(p)}, photo_url = null where id = ${mentorId}`;
  }
});

test('S14 a mentee edits the profile: goals persist, verification is untouched', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const menteeId = ids(personaProject).mentee;
  const goals = lang === 'ar' ? 'أريد خطة واضحة لأول جولة تمويل خلال ستة أشهر.' : 'I want a clear plan for our first funding round within six months.';
  await loginAs('mentee');
  await tokenSettle(page);
  await page.goto('/dashboard/profile');
  await expect(page.getByTestId('form-mentee-profile')).toBeVisible();
  await page.getByTestId('input-profile-goals').fill(goals);
  await page.getByTestId('button-save-profile').click();
  await expect.poll(async () => (await db<{ goals: string | null }[]>`select goals from public.mentees where id = ${menteeId}`)[0].goals).toBe(goals);
  const [row] = await db<{ verification_status: string }[]>`select verification_status from public.mentees where id = ${menteeId}`;
  expect(row.verification_status).toBe('unverified');
  await expectNoDemo(page, lang);
  await healthy({ screenshotName: 'S14-mentee-saved' });
});

// ---------------------------------------------------------------- S15 calendar

test('S15 a mentor saves office hours and the timezone; the public profile shows the hours', async ({ page, loginAs, healthy, db, lang, personaProject, browser, baseURL }, testInfo) => {
  test.skip(!runsOn(testInfo, ['desktop-en', 'mobile-ar']), 'S15 runs on desktop-en and mobile-ar');
  const mentorId = ids(personaProject).mentor;
  await db`delete from public.mentor_availability where mentor_id = ${mentorId}`;
  try {
    await loginAs('mentor');
    await tokenSettle(page);
    await page.goto('/dashboard/calendar');
    await expect(page.getByTestId('select-calendar-timezone')).toHaveValue('UTC');
    await expectNoDemo(page, lang);
    await healthy({ screenshotName: 'S15-calendar-settings' });

    await page.getByRole('button', { name: tr(lang, 'showcase.calendar.schedule'), exact: true }).click();
    await expect(page.getByTestId('list-office-hours')).toBeVisible();
    await page.getByTestId('button-add-mon').click();
    await page.getByTestId('input-from-mon').fill('09:00');
    await page.getByTestId('input-to-mon').fill('12:00');
    await page.getByTestId('button-add-wed').click();
    await page.getByTestId('input-from-wed').fill('14:00');
    await page.getByTestId('input-to-wed').fill('13:00');
    await page.getByTestId('button-save-calendar').click();
    await expect(page.getByText(tr(lang, 'showcase.calendar.endAfterStart')).first()).toBeVisible();
    expect(await db`select 1 from public.mentor_availability where mentor_id = ${mentorId}`).toHaveLength(0);

    await page.getByTestId('input-to-wed').fill('17:00');
    await page.getByTestId('button-save-calendar').click();
    await expect(page.getByText(tr(lang, 'showcase.calendar.savedToast')).first()).toBeVisible();
    await expect
      .poll(async () =>
        (await db<{ d: number; s: string; e: string }[]>`
          select day_of_week as d, to_char(start_time::time, 'HH24:MI') as s, to_char(end_time::time, 'HH24:MI') as e
          from public.mentor_availability where mentor_id = ${mentorId} and is_active order by day_of_week`).map((r) => `${r.d} ${r.s}-${r.e}`),
      )
      .toEqual(['1 09:00-12:00', '3 14:00-17:00']);
    await healthy({ screenshotName: 'S15-schedule-saved' });

    // The timezone is saved on the mentor row.
    await page.getByRole('button', { name: tr(lang, 'showcase.calendar.settings'), exact: true }).click();
    await page.getByTestId('select-calendar-timezone').selectOption('Europe/London');
    await page.getByTestId('button-save-calendar').click();
    await expect.poll(async () => (await db<{ timezone: string }[]>`select timezone from public.mentors where id = ${mentorId}`)[0].timezone).toBe('Europe/London');

    // Another browser (no session) sees the two windows on the public profile.
    const other = await browser.newContext({ baseURL });
    try {
      const visitor = await other.newPage();
      await visitor.goto(`/mentor/${mentorId}`);
      await expect(visitor.locator('section[aria-labelledby="profile-availability"] li').first()).toBeVisible();
      await expect(visitor.locator('section[aria-labelledby="profile-availability"]').first().locator('li')).toHaveCount(2);
    } finally {
      await other.close();
    }
  } finally {
    await db`update public.mentors set timezone = 'UTC' where id = ${mentorId}`;
    await db`delete from public.mentor_availability where mentor_id = ${mentorId}`;
  }
});
