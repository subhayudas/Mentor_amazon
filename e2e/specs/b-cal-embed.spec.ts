import { test, expect, signedCalPost, type Page } from '../fixtures/test';
import { bookingId, confirmedCalUid, displayName, ids, mentorCalLink, personaEmail } from '../fixtures/personas';
import { recordToasts } from '../fixtures/toasts';
import { calUid, calWebhookBody, plain, tr, useLanguage, webhookSecret } from './b-helpers';

/**
 * S10–S12 (design §6.4, B6/B7, F26/F28/F45): the mentee picks or moves a time in the Cal.com
 * embed (stubbed: e2e/stubs/cal-embed.html) and the booking row follows through
 * record_cal_booking_from_embed. The /mentee-dashboard entry points are Track B's; the
 * /dashboard/bookings ones (tagged @needs-track-c) exercise Track C's page with the same embed.
 */
type Sql = import('postgres').Sql;

test.beforeEach(async ({ page, lang }) => {
  await useLanguage(page, lang);
});

function v2(uid: string, startIso: string, status = 'ACCEPTED') {
  const end = new Date(new Date(startIso).getTime() + 30 * 60_000).toISOString();
  return { uid, title: '30 Min Meeting', startTime: startIso, endTime: end, eventTypeId: 1, status, paymentRequired: false, isRecurring: false };
}

/** A whole hour two to three days ahead, in UTC. */
function slot(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

async function row(db: Sql, id: string) {
  const [r] = await db<{ status: string; cal_event_uri: string | null; cal_status: string | null; scheduled: string | null; requested: string | null }[]>`
    select status, cal_event_uri, cal_status,
           to_char(scheduled_at, 'YYYY-MM-DD"T"HH24:MI:SS') as scheduled,
           to_char(cal_requested_start, 'YYYY-MM-DD"T"HH24:MI:SS') as requested
    from public.bookings where id = ${id}`;
  return r;
}
const utcWall = (iso: string) => iso.slice(0, 19);

/** Put a fixture booking back the way scripts/e2e/seed.ts leaves it (re-runs without a re-seed). */
async function restoreAccepted(db: Sql, id: string) {
  await db`update public.bookings set status = 'accepted', scheduled_at = null, cal_event_uri = null, cal_status = null,
           cal_requested_start = null where id = ${id}`;
}
async function restoreConfirmed(db: Sql, id: string, uid: string) {
  await db`delete from public.booking_reminders where booking_id = ${id}`;
  await db`update public.bookings set status = 'confirmed', scheduled_at = timezone('utc', now()) + interval '20 hours',
           cal_event_uri = ${uid}, cal_status = 'accepted', cal_requested_start = null where id = ${id}`;
}

async function openChooseTime(page: Page, bookingKey: string, from: 'mentee-dashboard' | 'dashboard') {
  if (from === 'mentee-dashboard') {
    await page.goto('/mentee-dashboard/bookings');
    await page.getByTestId(`button-schedule-booking-${bookingKey}`).click();
  } else {
    await page.goto('/dashboard/bookings');
    const button = page.getByTestId(`button-choose-time-${bookingKey}`);
    if (!(await button.isVisible())) await page.getByTestId('tab-upcoming').click();
    await button.click();
  }
  await expect(page.getByTestId('dialog-cal-embed')).toHaveAttribute('data-mode', 'book');
}

for (const from of ['mentee-dashboard', 'dashboard'] as const) {
  const tag = from === 'dashboard' ? ' @needs-track-c' : '';
  test(`S10 the mentee chooses a time from /${from}: metadata[mc_booking] in the embed, the row is confirmed${tag}`, async ({ page, db, cal, loginAs, healthy, lang, personaProject }) => {
    const id = bookingId(personaProject, 'accepted');
    const uid = calUid('s10');
    const start = slot(2);
    try {
      await loginAs('mentee');
      await openChooseTime(page, id, from);
      await cal.frame();
      const opened = cal.openedUrls.at(-1) ?? '';
      expect(opened).toContain(`/${mentorCalLink(personaProject)}/embed`);
      expect(opened).toContain(`metadata%5Bmc_booking%5D=${id}`);
      const params = new URL(opened).searchParams;
      expect(params.get('email')).toBe(personaEmail(personaProject, 'mentee'));
      expect(params.get('name')).toBeTruthy();
      // Always light, month view: a mentor's own (possibly dark) Cal.com theme never shows in the white dialog (R1-80).
      expect(params.get('theme')).toBe('light');
      expect(params.get('layout')).toBe('month_view');
      await healthy({ screenshotName: `S10-embed-${from}` });

      await cal.post('bookingSuccessfulV2', v2(uid, start));
      await expect(page.getByText(tr(lang, 'dashboardV2.cal.toastConfirmed'), { exact: true })).toBeVisible();
      await expect.poll(async () => (await row(db, id))?.status).toBe('confirmed');
      const r = await row(db, id);
      expect(r).toMatchObject({ cal_event_uri: uid, cal_status: 'accepted', scheduled: utcWall(start) });
    } finally {
      await restoreAccepted(db, id);
    }
  });
}

test('S11 requires confirmation: PENDING waits (no confirmed toast), the BOOKING_CREATED webhook confirms it', async ({ page, db, cal, request, clientIp, loginAs, healthy, lang, personaProject }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'S11 runs on desktop-en and mobile-ar');
  const id = bookingId(personaProject, 'accepted');
  const mentorId = ids(personaProject).mentor;
  const uid = calUid('s11');
  const start = slot(3);
  try {
    await loginAs('mentee');
    await openChooseTime(page, id, 'mentee-dashboard');
    // Every toast from here on is recorded: a "confirmed" toast for a PENDING time must never appear,
    // not even one that is gone again by the time we look (R1-54: toHaveCount(0) would wait it out).
    const toasts = await recordToasts(page);
    await cal.post('bookingSuccessfulV2', v2(uid, start, 'PENDING'));
    await expect.poll(async () => (await row(db, id))?.cal_status).toBe('requested');
    expect(await row(db, id)).toMatchObject({ status: 'accepted', cal_event_uri: uid, requested: utcWall(start) });
    // Wait for the outcome toast (the "waiting for the mentor" one), then check it was not "confirmed".
    await expect.poll(async () => (await toasts.texts()).length, { message: 'the embed outcome shows a toast' }).toBeGreaterThan(0);
    expect(await toasts.seen(tr(lang, 'dashboardV2.cal.toastConfirmed')), 'no "Session confirmed" toast for a time still waiting on the mentor').toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`badge-time-waiting-${id}`)).toBeVisible();
    await expect(page.getByTestId(`button-schedule-booking-${id}`)).toHaveCount(0);
    await healthy({ screenshotName: 'S11-waiting' });

    // The mentor accepts the time in Cal.com: BOOKING_CREATED (ACCEPTED) for the same uid.
    const secret = await webhookSecret(db, mentorId);
    const body = calWebhookBody('BOOKING_CREATED', {
      uid,
      start,
      status: 'ACCEPTED',
      attendees: [personaEmail(personaProject, 'mentee')],
      organizerUsername: mentorCalLink(personaProject).split('/')[0],
      mcBooking: id,
    });
    const res = await signedCalPost(request, { mentorId, secret, body, ip: clientIp });
    expect(res.status()).toBe(200);
    expect((await res.json()).outcome).toBe('confirmed');
    await page.reload();
    await expect(page.getByTestId(`card-booking-${id}`).first()).toHaveAttribute('data-status', 'confirmed');
    await expect(page.getByTestId(`badge-time-waiting-${id}`)).toHaveCount(0);
    await healthy({ screenshotName: 'S11-confirmed' });
  } finally {
    await restoreAccepted(db, id);
  }
});

for (const from of ['mentee-dashboard', 'dashboard'] as const) {
  const tag = from === 'dashboard' ? ' @needs-track-c' : '';
  test(`S12 the mentee reschedules from /${from}: /reschedule/<uid>/embed, same row, new uid and time, reminders cleared${tag}`, async ({ page, db, cal, loginAs, healthy, lang, personaProject }, testInfo) => {
    test.skip(!['desktop-en', 'desktop-ar'].includes(testInfo.project.name), 'S12 runs on desktop-en and desktop-ar');
    const id = bookingId(personaProject, 'confirmed');
    const oldUid = confirmedCalUid(personaProject);
    const newUid = calUid('s12');
    const start = slot(4);
    const menteeId = ids(personaProject).mentee;
    try {
      await db`insert into public.booking_reminders (booking_id, kind) values (${id}, '24h') on conflict (booking_id, kind) do nothing`;
      const [{ count: before }] = await db<{ count: number }[]>`select count(*)::int as count from public.bookings where mentee_id = ${menteeId}`;
      await loginAs('mentee');
      if (from === 'mentee-dashboard') {
        await page.goto('/mentee-dashboard/bookings');
        await page.getByTestId(`button-reschedule-booking-${id}`).click();
      } else {
        await page.goto('/dashboard/bookings');
        const button = page.getByTestId(`button-reschedule-${id}`);
        if (!(await button.isVisible())) await page.getByTestId('tab-upcoming').click();
        await button.click();
      }
      await expect(page.getByTestId('dialog-cal-embed')).toHaveAttribute('data-mode', 'reschedule');
      const title = plain(await page.getByTestId('dialog-cal-embed').getByRole('heading').first().innerText());
      expect(title).toBe(tr(lang, 'dashboardV2.cal.rescheduleTitle', { name: displayName(personaProject, 'mentor') }));
      await cal.frame();
      expect(new URL(cal.openedUrls.at(-1) ?? 'https://x').pathname).toBe(`/reschedule/${oldUid}/embed`);
      await healthy({ screenshotName: `S12-reschedule-embed-${from}` });

      await cal.post('rescheduleBookingSuccessfulV2', v2(newUid, start));
      await expect(page.getByText(tr(lang, 'dashboardV2.cal.toastRescheduled'), { exact: true })).toBeVisible();
      await expect.poll(async () => (await row(db, id))?.cal_event_uri).toBe(newUid);
      expect(await row(db, id)).toMatchObject({ status: 'confirmed', scheduled: utcWall(start) });
      const [{ count: after }] = await db<{ count: number }[]>`select count(*)::int as count from public.bookings where mentee_id = ${menteeId}`;
      expect(after).toBe(before);
      expect(await db`select 1 from public.booking_reminders where booking_id = ${id}`).toHaveLength(0);
    } finally {
      await restoreConfirmed(db, id, oldUid);
    }
  });
}
