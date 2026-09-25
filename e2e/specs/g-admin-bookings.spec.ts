import { test, expect, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { bookingId, displayName, e2eNamespace, ids, personaEmail, uuidv5 } from '../fixtures/personas';
import { recordToasts } from '../fixtures/toasts';
import { tokenSettle } from './c-helpers';

/**
 * `/admin/bookings` in database mode.
 * - R1-68: an admin can cancel a pending, accepted or confirmed booking from its detail sheet
 *   (the demo's local admin could; the database admin could not). The database stamps
 *   canceled_by 'admin', writes one activity line and tells the mentee and the mentor that the
 *   programme team cancelled (never "<Mentor> has canceled your session"); a session also booked
 *   on Cal.com links to its Cal.com cancel page; a booking that changed meanwhile is left alone.
 * - R1-83: a pending request to a programme-managed mentor reads "Awaiting programme team",
 *   because the programme team answers it, not the mentor.
 * Rows are this project's own (namespaced ids) and are removed in `finally`.
 */

type Db = import('postgres').Sql;

async function status(db: Db, id: string) {
  const [r] = await db<{ status: string; canceled_by: string | null; canceled_at: string | null }[]>`
    select status, canceled_by, canceled_at::text from public.bookings where id = ${id}`;
  return r;
}

async function purge(db: Db, bookingIds: string[]): Promise<void> {
  await db`delete from public.notifications where booking_id = any(${bookingIds})`;
  await db`delete from public.activity_events where subject_id = any(${bookingIds})`;
  await db`delete from public.mentor_activity_log where booking_id = any(${bookingIds})`;
  await db`delete from public.booking_reminders where booking_id = any(${bookingIds})`;
  await db`delete from public.bookings where id = any(${bookingIds})`;
}

async function openSheet(page: Page, id: string): Promise<void> {
  await page.getByTestId(`button-view-booking-${id}`).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Close the detail sheet with its own Close button (after any confirmation dialog has gone). */
async function closeSheet(page: Page, lang: 'en' | 'ar'): Promise<void> {
  await expect(page.getByTestId('dialog-admin-cancel')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: tr(lang, 'common.close'), exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('R1-68 an admin cancels bookings from the detail sheet; the database, the feed, the mentee and the mentor agree', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const p = personaProject;
  const ns = e2eNamespace();
  const { mentor, mentee } = ids(p);
  const accepted = `${bookingId(p, 'accepted')}-admin-cancel`;
  const confirmed = `${bookingId(p, 'confirmed')}-admin-cancel`;
  const stale = `${bookingId(p, 'accepted')}-admin-stale`;
  const done = `${bookingId(p, 'completed')}-admin-view`;
  const uid = `e2eadmincancel${ns}${p.replace(/[^a-z0-9]/g, '')}`;
  const mine = [accepted, confirmed, stale, done];
  await purge(db, mine);
  try {
    await db`
      insert into public.bookings (id, mentor_id, mentee_id, status, goal, scheduled_at, cal_event_uri, cal_status, clicked_at, responded_at, created_at)
      values (${accepted}, ${mentor}, ${mentee}, 'accepted', 'E2E: an accepted session the programme team cancels.', null, null, null,
              timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
             (${confirmed}, ${mentor}, ${mentee}, 'confirmed', 'E2E: a Cal.com session the programme team cancels.',
              timezone('utc', now()) + interval '2 days', ${uid}, 'accepted', timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
             (${stale}, ${mentor}, ${mentee}, 'accepted', 'E2E: a session the mentee cancels first.', null, null, null,
              timezone('utc', now()), timezone('utc', now()), timezone('utc', now()))`;
    await db`
      insert into public.bookings (id, mentor_id, mentee_id, status, goal, scheduled_at, clicked_at, responded_at, completed_at,
                                   session_duration_minutes, created_at)
      values (${done}, ${mentor}, ${mentee}, 'completed', 'E2E: a completed session.', timezone('utc', now()) - interval '2 days',
              timezone('utc', now()), timezone('utc', now()), timezone('utc', now()) - interval '2 days', 30, timezone('utc', now()))`;
    await db`delete from public.activity_events where subject_id = any(${mine})`;

    await loginAs('admin');
    await tokenSettle(page);
    const toasts = await recordToasts(page);
    await page.goto('/admin/bookings');
    await expect(page.getByTestId(`row-booking-${accepted}`)).toBeVisible();

    // A completed session has nothing to cancel.
    await openSheet(page, done);
    await expect(page.getByTestId('button-admin-cancel-booking')).toHaveCount(0);
    await closeSheet(page, lang);

    // Cancel the accepted booking, with confirmation (no Cal.com note: it has no Cal.com booking).
    await openSheet(page, accepted);
    await page.getByTestId('button-admin-cancel-booking').click();
    const dialog = page.getByTestId('dialog-admin-cancel');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(displayName(p, 'mentor'));
    await expect(dialog.getByTestId('text-admin-cancel-cal-note')).toHaveCount(0);
    await healthy({ screenshotName: 'R1-68-cancel-dialog' });
    await dialog.getByTestId('button-admin-cancel-confirm').click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: tr(lang, 'admin.bookings.canceledToast') })).toBeVisible();
    await expect.poll(async () => (await status(db, accepted)).status).toBe('canceled');
    expect((await status(db, accepted)).canceled_by).toBe('admin');
    const events = await db<{ type: string }[]>`select type from public.activity_events where subject_id = ${accepted}`;
    expect(events.map((e) => e.type), 'one activity line').toEqual(['booking_canceled']);
    // Both are told, and the programme team (not the mentor) is named as the one who cancelled.
    const notices = await db<{ recipient_type: string; recipient_email: string; message: string }[]>`
      select recipient_type, recipient_email, message from public.notifications
      where booking_id = ${accepted} and type = 'booking_canceled' order by recipient_type`;
    expect(notices, 'the mentee and the mentor are told the programme team cancelled').toEqual([
      {
        recipient_type: 'mentee',
        recipient_email: personaEmail(p, 'mentee'),
        message: `The programme team has canceled your session with ${displayName(p, 'mentor')}.`,
      },
      {
        recipient_type: 'mentor',
        recipient_email: personaEmail(p, 'mentor'),
        message: `The programme team has canceled your session with ${displayName(p, 'mentee')}.`,
      },
    ]);
    // Keyboard focus lands on the sheet title, not the page body, once the cancel button is gone.
    await expect(page.getByTestId('button-admin-cancel-booking')).toHaveCount(0);
    await expect(page.getByRole('dialog').getByRole('heading', { name: tr(lang, 'admin.bookings.detailTitle') })).toBeFocused();

    // A Cal.com session: the dialog links to its Cal.com cancel page; "Keep booking" writes nothing.
    await closeSheet(page, lang);
    await openSheet(page, confirmed);
    await page.getByTestId('button-admin-cancel-booking').click();
    await expect(dialog.getByTestId('link-admin-cancel-on-cal')).toHaveAttribute('href', `https://app.cal.com/booking/${uid}?cancel=true`);
    await dialog.getByTestId('button-admin-cancel-keep').click();
    await expect(dialog).toHaveCount(0);
    expect((await status(db, confirmed)).status).toBe('confirmed');
    await page.getByTestId('button-admin-cancel-booking').click();
    await dialog.getByTestId('button-admin-cancel-confirm').click();
    await expect.poll(async () => (await status(db, confirmed)).status).toBe('canceled');
    expect((await status(db, confirmed)).canceled_by).toBe('admin');

    // A booking the mentee cancelled while the sheet was open: nothing is overwritten, the admin is told.
    await closeSheet(page, lang);
    await openSheet(page, stale);
    await db`update public.bookings set status = 'canceled', canceled_by = 'mentee', canceled_at = timezone('utc', now()) - interval '5 minutes' where id = ${stale}`;
    const before = await status(db, stale);
    await toasts.clear();
    await page.getByTestId('button-admin-cancel-booking').click();
    await dialog.getByTestId('button-admin-cancel-confirm').click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: tr(lang, 'admin.bookings.cancelStale') })).toBeVisible();
    expect(await toasts.seen(tr(lang, 'admin.bookings.canceledToast')), 'no success toast').toBe(false);
    expect(await status(db, stale), 'the mentee\'s cancellation stands').toEqual(before);
    await healthy({ screenshotName: 'R1-68-after-cancel' });
  } finally {
    await purge(db, mine);
  }
});

test('R1-83 a pending request to a programme-managed mentor reads "Awaiting programme team"', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const p = personaProject;
  const ns = e2eNamespace();
  const scope = `${ns ? `${ns}.` : ''}${p}`;
  const programmeMentor = uuidv5(`https://mentorconnect.test/e2e/${scope}/programme-mentor`);
  const programmeEmail = `e2e.${scope}.programme-mentor@mentorconnect.test`;
  const request = `${bookingId(p, 'pending-1')}-programme`;
  const ordinary = `${bookingId(p, 'pending-2')}-ordinary`;
  const cleanup = async () => {
    await purge(db, [request, ordinary]);
    await db`delete from public.mentors where id = ${programmeMentor}`;
  };
  await cleanup();
  try {
    await db`
      insert into public.mentors (id, name, email, company, position, timezone, country, bio, cal_link, expertise, industries,
                                  languages_spoken, comms_owner, mentorship_preference, is_available, average_rating,
                                  total_ratings, managed_by_programme, created_at, updated_at)
      values (${programmeMentor}, ${`E2E Programme Mentor (${scope})`}, ${programmeEmail}, 'MentorConnect E2E', 'Programme mentor', 'UTC',
              'United Arab Emirates', 'Seeded by the admin bookings spec.', '', ${['Fundraising']}, ${['Technology']}, ${['English']},
              'exec', 'either', true, 0, 0, true, timezone('utc', now()), timezone('utc', now()))`;
    await db`
      insert into public.bookings (id, mentor_id, mentee_id, status, goal, clicked_at, created_at)
      values (${request}, ${programmeMentor}, ${ids(p).mentee}, 'pending', 'E2E: a request the programme team answers.',
              timezone('utc', now()), timezone('utc', now())),
             (${ordinary}, ${ids(p).mentor}, ${ids(p).mentee}, 'pending', 'E2E: a request its mentor answers.',
              timezone('utc', now()), timezone('utc', now()))`;

    await loginAs('admin');
    await tokenSettle(page);
    await page.goto('/admin/bookings');
    const row = page.getByTestId(`row-booking-${request}`);
    await expect(row.getByTestId('badge-awaiting-programme')).toHaveText(tr(lang, 'admin.bookings.awaitingProgramme'));
    await expect(row.getByText(tr(lang, 'status.pending'), { exact: true })).toHaveCount(0);
    // A request to an ordinary mentor still waits for that mentor.
    const own = page.getByTestId(`row-booking-${ordinary}`);
    await expect(own.getByText(tr(lang, 'status.pending'), { exact: true })).toBeVisible();

    // With the programme filter on, the pending chip says who it is waiting for.
    const pendingChip = page.getByTestId('chip-booking-pending');
    await expect(pendingChip).toContainText(tr(lang, 'status.pending'));
    await page.getByTestId('chip-booking-programme').click();
    await expect(pendingChip).toContainText(tr(lang, 'admin.bookings.awaitingProgramme'));
    await expect(pendingChip).not.toContainText(tr(lang, 'status.pending'));
    await healthy({ screenshotName: 'R1-83-programme-view' });

    // The detail sheet says the same.
    await openSheet(page, request);
    await expect(page.getByRole('dialog').getByTestId('badge-awaiting-programme')).toBeVisible();
  } finally {
    await cleanup();
  }
});
