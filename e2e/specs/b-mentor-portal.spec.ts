import { test, expect } from '../fixtures/test';
import { ids, mentorCalLink } from '../fixtures/personas';
import { devEmail, insertPendingRequest, purgeRequester, tr, useLanguage } from './b-helpers';

/**
 * The legacy mentor portal pieces Track B owns (design B8, B10; F12, F13):
 * - availability is replaced in one transaction by `set_my_availability`;
 * - the Cal.com link is normalised by the shared helper, and clearing it stores '';
 * - an inbox answer to a request that is no longer pending says so (BookingNotPendingError).
 */
test.beforeEach(async ({ page, lang }) => {
  await useLanguage(page, lang);
});

test('B8 the legacy availability page saves through set_my_availability', async ({ page, db, loginAs, healthy, lang, personaProject }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'runs on desktop-en and mobile-ar');
  const mentorId = ids(personaProject).mentor;
  try {
    await db`delete from public.mentor_availability where mentor_id = ${mentorId}`;
    await loginAs('mentor');
    await page.goto('/mentor-portal/availability');
    await page.getByTestId('button-add-slot-1').click();
    await page.getByTestId('button-add-slot-3').click();
    const rpc = page.waitForResponse((r) => r.url().includes('/rest/v1/rpc/set_my_availability'));
    await page.getByTestId('button-save-availability').click();
    expect((await rpc).status()).toBe(200);
    await expect(page.getByText(tr(lang, 'dashboardV2.availability.saved'), { exact: true })).toBeVisible();
    const rows = await db<{ id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean; created_at: string | null }[]>`
      select id, day_of_week, start_time, end_time, is_active, created_at::text from public.mentor_availability
      where mentor_id = ${mentorId} order by day_of_week`;
    expect(rows.map((r) => [r.day_of_week, r.start_time.slice(0, 5), r.end_time.slice(0, 5), r.is_active])).toEqual([
      [1, '09:00', '17:00', true],
      [3, '09:00', '17:00', true],
    ]);
    expect(rows.every((r) => r.id && r.created_at)).toBe(true);
    await healthy({ screenshotName: 'B8-availability-saved' });
  } finally {
    await db`delete from public.mentor_availability where mentor_id = ${mentorId}`;
  }
});

test('B10 the Cal.com link is normalised on save and clearing it stores an empty link', async ({ page, db, loginAs, healthy, personaProject }, testInfo) => {
  test.skip(!['desktop-en', 'desktop-ar'].includes(testInfo.project.name), 'runs on desktop-en and desktop-ar');
  const mentorId = ids(personaProject).mentor;
  const calLink = async () => (await db<{ cal_link: string }[]>`select cal_link from public.mentors where id = ${mentorId}`)[0]?.cal_link;
  try {
    await loginAs('mentor');
    await page.goto('/mentor-portal/profile');
    const field = page.getByTestId('input-calcom');
    await field.fill('https://app.cal.com/Some.Mentor/Intro-Call/?month=2026-10#top');
    await page.getByTestId('button-save-profile').click();
    await expect.poll(calLink).toBe('Some.Mentor/Intro-Call');
    await expect(field).toHaveValue('Some.Mentor/Intro-Call');

    await field.fill('');
    await page.getByTestId('button-save-profile').click();
    await expect.poll(calLink).toBe('');
    await expect(page.getByTestId('cal-sync-no-link')).toBeVisible();
    await healthy({ screenshotName: 'B10-cleared' });
  } finally {
    await db`update public.mentors set cal_link = ${mentorCalLink(personaProject)} where id = ${mentorId}`;
  }
});

test('S7c a mentor answering a request the mentee already withdrew is told so, and nothing is overwritten', async ({ page, db, loginAs, healthy, lang, personaProject }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'runs on desktop-en and mobile-ar');
  const email = devEmail('s7w');
  try {
    const stale = await insertPendingRequest(db, { mentorId: ids(personaProject).mentor, email, name: 'Dev B Withdrawn' });
    await loginAs('mentor');
    await page.goto('/mentor-portal');
    const row = page.getByTestId(`booking-row-${stale.bookingId}`);
    await expect(row).toBeVisible();
    // The mentee withdraws it while the inbox is open.
    await db`update public.bookings set status = 'canceled', canceled_by = 'mentee', canceled_at = timezone('utc', now())
             where id = ${stale.bookingId}`;
    await page.getByTestId(`button-accept-${stale.bookingId}`).click();
    await expect(page.getByText(tr(lang, 'dashboardV2.inbox.decisionStale'))).toBeVisible();
    await expect(page.getByText(tr(lang, 'dashboardV2.inbox.acceptedToast'))).toHaveCount(0);
    await expect(page.getByText(tr(lang, 'dashboardV2.inbox.decisionError'))).toHaveCount(0);
    // The list shows the database's truth again: the withdrawn request is gone from the inbox.
    await expect(row).toHaveCount(0);
    expect((await db`select status from public.bookings where id = ${stale.bookingId}`)[0]?.status).toBe('canceled');
    const note = await db`select 1 from public.notifications where booking_id = ${stale.bookingId} and type = 'booking_accepted'`;
    expect(note, 'no acceptance notice for a withdrawn request').toHaveLength(0);
    await healthy({ screenshotName: 'S7c-inbox-stale-decision' });
  } finally {
    await purgeRequester(db, email);
  }
});
