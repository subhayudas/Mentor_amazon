import { test, expect, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { bookingId, ids } from '../fixtures/personas';
import { recordToasts } from '../fixtures/toasts';
import { tokenSettle } from './c-helpers';

/**
 * A stale tab cannot overwrite a booking that changed underneath it (R1-16). The mentor's
 * /dashboard/bookings stays open while the booking is cancelled by the mentee, or completed
 * from another tab; the mentor then clicks Cancel or Mark completed on the old row. The write
 * is conditional on the status it starts from, so it changes nothing (canceled_by,
 * canceled_at and the recorded duration stay), nobody is notified, and the mentor is told the
 * session changed in the meantime instead of "Session cancelled".
 */

type Db = import('postgres').Sql;

async function row(db: Db, id: string) {
  const [r] = await db<{ status: string; canceled_by: string | null; canceled_at: string | null; session_duration_minutes: number | null }[]>`
    select status, canceled_by, canceled_at::text, session_duration_minutes from public.bookings where id = ${id}`;
  return r;
}

async function counts(db: Db, id: string) {
  const [n] = await db<{ n: number }[]>`select count(*)::int as n from public.notifications where booking_id = ${id}`;
  const [a] = await db<{ n: number }[]>`select count(*)::int as n from public.activity_events where subject_id = ${id}`;
  return { notifications: n.n, activity: a.n };
}

async function withAcceptedBooking(db: Db, project: string, suffix: string, body: (id: string) => Promise<void>): Promise<void> {
  const id = `${bookingId(project, 'accepted')}-${suffix}`;
  const { mentor, mentee } = ids(project);
  const cleanup = async () => {
    await db`delete from public.notifications where booking_id = ${id}`;
    await db`delete from public.activity_events where subject_id = ${id}`;
    await db`delete from public.mentor_activity_log where booking_id = ${id}`;
    await db`delete from public.booking_reminders where booking_id = ${id}`;
    await db`delete from public.bookings where id = ${id}`;
  };
  await cleanup();
  try {
    await db`
      insert into public.bookings (id, mentor_id, mentee_id, status, goal, clicked_at, responded_at, created_at)
      values (${id}, ${mentor}, ${mentee}, 'accepted', 'E2E: an accepted session two tabs act on.',
              timezone('utc', now()), timezone('utc', now()), timezone('utc', now()))`;
    await body(id);
  } finally {
    await cleanup();
  }
}

async function openUpcoming(page: Page, id: string): Promise<void> {
  await page.goto('/dashboard/bookings');
  await page.getByTestId('tab-upcoming').click();
  await expect(page.getByTestId(`booking-row-${id}`)).toBeVisible();
}

test('R1-16 a stale Cancel on a session the mentee already cancelled changes nothing and tells nobody the mentor cancelled', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  await withAcceptedBooking(db, personaProject, 'stale-cancel', async (id) => {
    await loginAs('mentor');
    await tokenSettle(page);
    const toasts = await recordToasts(page);
    await openUpcoming(page, id);

    // Meanwhile the mentee cancels (ten minutes ago); this tab still shows the session.
    await db`
      update public.bookings set status = 'canceled', canceled_by = 'mentee',
        canceled_at = timezone('utc', now()) - interval '10 minutes'
      where id = ${id}`;
    const before = await row(db, id);
    const sent = await counts(db, id);

    await page.getByTestId(`button-cancel-${id}`).click();
    const dialog = page.getByTestId('dialog-booking-confirm');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('button-confirm-action').click();

    await expect(page.locator('[data-sonner-toast]').filter({ hasText: tr(lang, 'showcase.bookings.toast.stale') })).toBeVisible();
    expect(await toasts.seen(tr(lang, 'showcase.bookings.toast.canceled')), 'no "Session cancelled" for a write that changed nothing').toBe(false);
    expect(await row(db, id), 'canceled_by and canceled_at stay the mentee\'s').toEqual(before);
    expect(await counts(db, id), 'no notification ("Mentor has canceled your session") and no activity line').toEqual(sent);
    await healthy({ screenshotName: 'R1-16-stale-cancel' });
  });
});

test('R1-16 a stale Mark completed keeps the duration recorded first and notifies nobody again', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  await withAcceptedBooking(db, personaProject, 'stale-complete', async (id) => {
    await loginAs('mentor');
    await tokenSettle(page);
    const toasts = await recordToasts(page);
    await openUpcoming(page, id);

    // Another tab completes it first, with 30 minutes.
    await db`
      update public.bookings set status = 'completed', session_duration_minutes = 30,
        completed_at = timezone('utc', now())
      where id = ${id}`;
    const before = await row(db, id);
    const sent = await counts(db, id);

    await page.getByTestId(`button-complete-${id}`).click();
    const complete = page.getByTestId('dialog-complete-session');
    await expect(complete).toBeVisible();
    await complete.getByTestId('button-minutes-45').click();
    await complete.getByTestId('button-confirm-complete').click();

    await expect(page.locator('[data-sonner-toast]').filter({ hasText: tr(lang, 'showcase.bookings.toast.stale') })).toBeVisible();
    expect(await toasts.seen(tr(lang, 'showcase.bookings.toast.completed')), 'no "Session marked completed" for a write that changed nothing').toBe(false);
    expect(await row(db, id), 'the first recorded duration stands').toEqual(before);
    expect((await row(db, id)).session_duration_minutes).toBe(30);
    expect(await counts(db, id), 'no second booking_completed notification').toEqual(sent);
    await healthy({ screenshotName: 'R1-16-stale-complete' });
  });
});

test('R1-16 a fresh Cancel still works: the write matches, the mentee is told once', async ({ page, loginAs, db, lang, personaProject }) => {
  await withAcceptedBooking(db, personaProject, 'fresh-cancel', async (id) => {
    await loginAs('mentor');
    await tokenSettle(page);
    await openUpcoming(page, id);
    const sent = await counts(db, id);
    await page.getByTestId(`button-cancel-${id}`).click();
    await page.getByTestId('dialog-booking-confirm').getByTestId('button-confirm-action').click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: tr(lang, 'showcase.bookings.toast.canceled') })).toBeVisible();
    await expect.poll(async () => (await row(db, id)).status).toBe('canceled');
    expect((await row(db, id)).canceled_by).toBe('mentor');
    const [notices] = await db<{ n: number }[]>`
      select count(*)::int as n from public.notifications where booking_id = ${id} and type = 'booking_canceled'`;
    expect(notices.n, 'one cancellation notice').toBe(1);
    expect((await counts(db, id)).activity).toBe(sent.activity + 1);
  });
});
