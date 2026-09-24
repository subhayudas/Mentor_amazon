import { test, expect, turnstile } from '../fixtures/test';
import { bookingId, personaEmail } from '../fixtures/personas';
import { devEmail, featuredFor, insertPendingRequest, purgeRequester, tr, useLanguage } from './b-helpers';

/**
 * S7 (design §6.4, B5, F07): the programme team answers requests to the curated
 * (programme-managed) mentors from /admin/bookings. One request arrives through the real
 * /api/requests (so the admins' bell gets the "New request … (programme-managed)" line), the
 * other is written directly; the admin accepts one and declines the other.
 */
test.beforeEach(async ({ page, lang }) => {
  await useLanguage(page, lang);
});

test('S7 an admin accepts and declines programme-managed requests; other mentors\' rows have no actions', async ({ page, db, request, clientIp, loginAs, healthy, lang, personaProject }, testInfo) => {
  const f = featuredFor(testInfo.project.name, 4);
  const acceptEmail = devEmail('s7a');
  const declineEmail = devEmail('s7d');
  try {
    // 1. A request through the public API (as an anonymous visitor would send it).
    const res = await request.post('/api/requests', {
      data: {
        mentorId: f.dbId,
        name: 'Dev B Accept',
        email: acceptEmail,
        goal: 'Please help me prepare the first investor meetings for our seed round.',
        ...(turnstile.enabled ? { turnstileToken: turnstile.dummyToken } : {}),
      },
      headers: { 'x-e2e-client-ip': clientIp },
    });
    expect(res.status()).toBe(200);
    const [accepted] = await db<{ id: string }[]>`
      select b.id from public.bookings b join public.mentees me on me.id = b.mentee_id where lower(me.email) = ${acceptEmail}`;
    const adminEmail = personaEmail(personaProject, 'admin');
    const adminBell = await db`select 1 from public.notifications where booking_id = ${accepted.id} and recipient_email = ${adminEmail}`;
    expect(adminBell, 'this project\'s admin received the request notification').toHaveLength(1);
    // 2. A second pending request, written directly.
    const declined = await insertPendingRequest(db, { mentorId: f.dbId, email: declineEmail, name: 'Dev B Decline' });

    await loginAs('admin');
    await page.goto('/admin/bookings');
    const callout = page.getByTestId('programme-callout');
    await expect(callout).toBeVisible();
    await expect(page.getByTestId('badge-unread-count')).toBeVisible();
    await healthy({ screenshotName: 'S7-admin-bookings' });

    await page.getByTestId('button-show-programme-pending').click();
    await expect(page.getByTestId('chip-booking-programme')).toHaveAttribute('aria-pressed', 'true');
    const acceptRow = page.getByTestId(`row-booking-${accepted.id}`);
    const declineRow = page.getByTestId(`row-booking-${declined.bookingId}`);
    await expect(acceptRow).toHaveAttribute('data-programme', 'true');
    await expect(declineRow).toBeVisible();
    // Rows of mentors who answer for themselves carry no admin actions and are filtered out here.
    const ownPending = bookingId(personaProject, 'pending-1');
    await expect(page.getByTestId(`row-booking-${ownPending}`)).toHaveCount(0);

    // Accept, behind a confirmation that names the mentee's address.
    await page.getByTestId(`button-accept-booking-${accepted.id}`).click();
    const confirm = page.getByTestId('dialog-confirm-decision');
    await expect(confirm).toContainText(acceptEmail);
    await healthy({ screenshotName: 'S7-confirm-accept' });
    await page.getByTestId('button-decision-confirm').click();
    await expect(page.getByText(tr(lang, 'admin.bookings.acceptedToast'))).toBeVisible();
    await expect.poll(async () => (await db`select status from public.bookings where id = ${accepted.id}`)[0]?.status).toBe('accepted');
    const menteeNote = await db<{ type: string }[]>`
      select type from public.notifications where booking_id = ${accepted.id} and recipient_email = ${acceptEmail}`;
    expect(menteeNote.map((n) => n.type)).toContain('booking_accepted');

    // Decline the other one.
    await page.getByTestId(`button-decline-booking-${declined.bookingId}`).click();
    await page.getByTestId('button-decision-confirm').click();
    await expect.poll(async () => (await db`select status from public.bookings where id = ${declined.bookingId}`)[0]?.status).toBe('rejected');

    // The sheet explains who answers and links the mentee's address.
    await page.getByTestId('chip-booking-all').click();
    await page.getByTestId(`button-view-booking-${accepted.id}`).click();
    await expect(page.getByTestId('programme-explain')).toContainText(tr(lang, 'admin.bookings.programmeExplain'));
    await expect(page.getByTestId('link-email-mentee')).toHaveAttribute('href', `mailto:${encodeURIComponent(acceptEmail)}`);
    await expect(page.getByTestId(`button-accept-booking-${accepted.id}`)).toHaveCount(0);
    await healthy({ screenshotName: 'S7-sheet' });
    await page.keyboard.press('Escape');

    // A non-managed pending row (the E2E mentor's own request) has no Accept / Decline.
    await page.getByTestId('chip-booking-programme').click();
    await expect(page.getByTestId('chip-booking-programme')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('chip-booking-pending').click();
    await expect(page.getByTestId(`row-booking-${ownPending}`)).toBeVisible();
    await expect(page.getByTestId(`button-accept-booking-${ownPending}`)).toHaveCount(0);
    await expect(page.getByTestId(`button-decline-booking-${ownPending}`)).toHaveCount(0);
  } finally {
    await purgeRequester(db, acceptEmail);
    await purgeRequester(db, declineEmail);
  }
});
