import { test, expect, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { displayName, e2eNamespace, ids, personaEmail, ssoTestAlias, uuidv5 } from '../fixtures/personas';
import { recordToasts } from '../fixtures/toasts';
import { expectNoDemo, tokenSettle } from './c-helpers';

/**
 * The admin screen's Mentors, Mentees and Access tabs save what their buttons say (R1-64).
 * Every step clicks the real control as the seeded admin, then reads the row in Postgres,
 * reloads the page and reads the saved state again; an aborted write shows the error toast,
 * never a success toast, and leaves the row as it was. Rows the spec creates carry this
 * project's namespace and are removed in `finally` (and before the test, in case a previous
 * run crashed). The Bookings tab is covered by S7/S26 and by g-admin-bookings.
 */

type Db = import('postgres').Sql;
const BIDI = '[\\u2066-\\u2069\\u200e\\u200f]*';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The locale string at `key` with its {{placeholders}} filled, as a pattern that tolerates the bidi marks around values. */
function filled(lang: 'en' | 'ar', key: string, vars: Record<string, string>): RegExp {
  const parts = tr(lang, key).split(/(\{\{[^}]+\}\})/);
  return new RegExp(
    parts
      .map((part) => {
        const m = /^\{\{([^}]+)\}\}$/.exec(part);
        return m ? `${BIDI}${escape(vars[m[1]] ?? '')}${BIDI}` : escape(part);
      })
      .join(''),
  );
}

const toastMatching = (page: Page, pattern: RegExp) => page.locator('[data-sonner-toast]').filter({ hasText: pattern });

function scopedEmail(project: string, label: string): string {
  const ns = e2eNamespace();
  return `e2e.${ns ? `${ns}.` : ''}${project}.${label}@mentorconnect.test`;
}

async function mentorAvailable(db: Db, id: string): Promise<boolean> {
  const [row] = await db<{ is_available: boolean }[]>`select is_available from public.mentors where id = ${id}`;
  return row.is_available;
}

async function menteeStatus(db: Db, id: string): Promise<string | null> {
  const [row] = await db<{ verification_status: string | null }[]>`select verification_status from public.mentees where id = ${id}`;
  return row?.verification_status ?? null;
}

async function approvedRow(db: Db, alias: string) {
  const [row] = await db<{ id: string; is_active: boolean; role: string; approved_by: string | null; mentor_id: string | null; email: string | null }[]>`
    select id, is_active, role, approved_by, mentor_id, email from public.approved_users where amazon_alias = ${alias}`;
  return row;
}

/** Open a row's detail sheet: the table row itself on desktop, its "View details" button on a phone. */
async function openDetail(page: Page, isMobile: boolean, kind: 'mentor' | 'mentee', id: string): Promise<void> {
  if (isMobile) await page.getByTestId(`button-view-${kind}-${id}`).click();
  else await page.getByTestId(`row-${kind}-${id}`).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

// ---------------------------------------------------------------- Mentors tab

test('R1-64 Mentors tab: deactivate, reactivate and approve Amazon access are saved, survive a reload, and a failed write changes nothing', async ({ page, loginAs, healthy, db, lang, personaProject, isMobile }) => {
  const p = personaProject;
  const mentorId = ids(p).mentor;
  const mentorName = displayName(p, 'mentor');
  const adminEmail = personaEmail(p, 'admin');
  const newAlias = ssoTestAlias('admok', p);
  const search = async () => {
    await page.getByTestId('input-mentor-search').fill(personaEmail(p, 'mentor'));
    await expect(page.getByTestId(`row-mentor-${mentorId}`)).toBeVisible();
  };
  const availabilityShown = (label: string) =>
    expect(page.getByTestId(`row-mentor-${mentorId}`).getByText(tr(lang, label), { exact: true })).toBeVisible();
  const cleanup = async () => {
    await db`delete from public.approved_users where amazon_alias = ${newAlias}`;
    await db`update public.mentors set is_available = true where id = ${mentorId}`;
  };
  await cleanup();
  try {
    await loginAs('admin');
    await tokenSettle(page);
    const toasts = await recordToasts(page);
    await page.goto('/admin');
    await search();
    await availabilityShown('admin.mentors.available');
    await expectNoDemo(page, lang);
    await healthy({ screenshotName: 'R1-64-mentors-tab' });

    // Deactivate (with confirmation): the row is saved as not accepting requests.
    await openDetail(page, isMobile, 'mentor', mentorId);
    await page.getByTestId('button-sheet-deactivate').click();
    await page.getByTestId('button-deactivate-confirm').click();
    await expect(toastMatching(page, filled(lang, 'admin.mentors.deactivated', { name: mentorName }))).toBeVisible();
    await expect.poll(() => mentorAvailable(db, mentorId)).toBe(false);
    await page.keyboard.press('Escape');
    await page.reload();
    await search();
    await availabilityShown('admin.mentors.inactive');

    // Reactivate from the detail sheet.
    await openDetail(page, isMobile, 'mentor', mentorId);
    await page.getByTestId('button-sheet-reactivate').click();
    await expect(toastMatching(page, filled(lang, 'admin.mentors.reactivated', { name: mentorName }))).toBeVisible();
    await expect.poll(() => mentorAvailable(db, mentorId)).toBe(true);

    // Approve Amazon access under a new alias: an approved_users row linked to this mentor.
    await page.getByTestId('button-sheet-approve-access').click();
    await page.getByTestId('input-approve-alias').fill(newAlias);
    await page.getByTestId('button-approve-confirm').click();
    await expect(toastMatching(page, filled(lang, 'admin.mentors.accessApproved', { alias: newAlias }))).toBeVisible();
    await expect.poll(async () => (await approvedRow(db, newAlias)) ?? null).toMatchObject({
      is_active: true,
      role: 'mentor',
      mentor_id: mentorId,
      approved_by: adminEmail,
    });
    await page.keyboard.press('Escape');
    await page.reload();
    await search();
    await availabilityShown('admin.mentors.available');
    await expect(page.getByTestId(`row-mentor-${mentorId}`)).toContainText(newAlias);
    await healthy({ screenshotName: 'R1-64-mentors-saved' });

    // A failed write: the error toast, never the success toast, and the row stays available.
    await page.route('**/rest/v1/mentors?**', (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
    await toasts.clear();
    await openDetail(page, isMobile, 'mentor', mentorId);
    await page.getByTestId('button-sheet-deactivate').click();
    await page.getByTestId('button-deactivate-confirm').click();
    await expect(toastMatching(page, new RegExp(escape(tr(lang, 'errors.somethingWentWrong'))))).toBeVisible();
    expect(await toasts.seen(filled(lang, 'admin.mentors.deactivated', { name: mentorName })), 'no success toast for a failed write').toBe(false);
    await page.unroute('**/rest/v1/mentors?**');
    expect(await mentorAvailable(db, mentorId)).toBe(true);
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------- Mentees tab

test('R1-64 Mentees tab: verifying and rejecting an organisation are saved, survive a reload, and a failed write changes nothing', async ({ page, loginAs, healthy, db, lang, personaProject, isMobile }) => {
  const p = personaProject;
  const ns = e2eNamespace();
  const menteeId = uuidv5(`https://mentorconnect.test/e2e/${ns ? `${ns}.` : ''}${p}/admin-org-mentee`);
  const org = `E2E Org Admin Tab (${ns ? `${ns}.` : ''}${p})`;
  const email = scopedEmail(p, 'admin-org-mentee');
  const seed = async () => {
    await db`delete from public.mentees where lower(email) = ${email} and id <> ${menteeId}`;
    await db`
      insert into public.mentees (id, name, email, user_type, organization_name, verification_status, verification_reference,
                                  timezone, languages_spoken, areas_exploring, created_at)
      values (${menteeId}, ${`E2E Org Contact (${p})`}, ${email}, 'organization', ${org}, 'pending', 'E2E-REF-1',
              'UTC', ${['English']}, ${['Career Development']}, timezone('utc', now()))
      on conflict (id) do update set user_type = 'organization', organization_name = excluded.organization_name,
        verification_status = 'pending', email = excluded.email`;
  };
  const search = async () => {
    await page.getByTestId('input-mentee-search').fill(org);
    await expect(page.getByTestId(`row-mentee-${menteeId}`)).toBeVisible();
  };
  const badge = (key: string) => expect(page.getByTestId(`row-mentee-${menteeId}`).getByText(tr(lang, key), { exact: true })).toBeVisible();
  await seed();
  try {
    await loginAs('admin');
    await tokenSettle(page);
    const toasts = await recordToasts(page);
    await page.goto('/admin/mentees');
    await search();
    await badge('admin.verification.pending');
    await healthy({ screenshotName: 'R1-64-mentees-tab' });

    // Verify.
    await openDetail(page, isMobile, 'mentee', menteeId);
    await page.getByTestId('button-mark-verified').click();
    await expect(toastMatching(page, filled(lang, 'admin.mentees.markedVerified', { name: org }))).toBeVisible();
    await expect.poll(() => menteeStatus(db, menteeId)).toBe('verified');
    await page.reload();
    await search();
    await badge('admin.verification.verified');

    // Reject.
    await openDetail(page, isMobile, 'mentee', menteeId);
    await page.getByTestId('button-mark-rejected').click();
    await expect(toastMatching(page, filled(lang, 'admin.mentees.markedRejected', { name: org }))).toBeVisible();
    await expect.poll(() => menteeStatus(db, menteeId)).toBe('rejected');
    await page.reload();
    await search();
    await badge('admin.verification.rejected');
    await healthy({ screenshotName: 'R1-64-mentees-saved' });

    // A failed write changes nothing and never says it did.
    await page.route('**/rest/v1/mentees?**', (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
    await toasts.clear();
    await openDetail(page, isMobile, 'mentee', menteeId);
    await page.getByTestId('button-mark-verified').click();
    await expect(toastMatching(page, new RegExp(escape(tr(lang, 'errors.somethingWentWrong'))))).toBeVisible();
    expect(await toasts.seen(filled(lang, 'admin.mentees.markedVerified', { name: org })), 'no success toast for a failed write').toBe(false);
    await page.unroute('**/rest/v1/mentees?**');
    expect(await menteeStatus(db, menteeId)).toBe('rejected');
  } finally {
    await db`delete from public.mentees where id = ${menteeId}`;
  }
});

// ---------------------------------------------------------------- Access tab

test('R1-64 Access tab: approving and rejecting requests, adding, deactivating and reactivating an alias are all saved and survive a reload', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const p = personaProject;
  const ns = e2eNamespace();
  const adminEmail = personaEmail(p, 'admin');
  const approveAlias = ssoTestAlias('accok', p);
  const rejectAlias = ssoTestAlias('accno', p);
  const addedAlias = ssoTestAlias('accadd', p);
  const requestId = (alias: string) => uuidv5(`https://mentorconnect.test/e2e/${ns ? `${ns}.` : ''}${p}/access-request/${alias}`);
  const [approveId, rejectId] = [requestId(approveAlias), requestId(rejectAlias)];
  const aliases = [approveAlias, rejectAlias, addedAlias];
  const cleanup = async () => {
    await db`delete from public.access_requests where id = any(${[approveId, rejectId]}) or amazon_alias = any(${aliases})`;
    await db`delete from public.approved_users where amazon_alias = any(${aliases})`;
  };
  const requestRow = async (id: string) =>
    (await db<{ status: string; resolved_by: string | null; resolved_at: string | null }[]>`
      select status, resolved_by, resolved_at::text from public.access_requests where id = ${id}`)[0];
  const role = tr(lang, 'admin.role.mentor');
  await cleanup();
  try {
    await db`
      insert into public.access_requests (id, amazon_alias, email, name, status, requested_at)
      values (${approveId}, ${approveAlias}, ${`${approveAlias}@amazon.com`}, 'E2E Access Approve', 'pending', timezone('utc', now())),
             (${rejectId}, ${rejectAlias}, ${`${rejectAlias}@amazon.com`}, 'E2E Access Reject', 'pending', timezone('utc', now()))`;

    await loginAs('admin');
    await tokenSettle(page);
    const toasts = await recordToasts(page);
    await page.goto('/admin/access');
    await expect(page.getByTestId(`row-request-${approveId}`)).toBeVisible();
    await expect(page.getByTestId(`row-request-${rejectId}`)).toBeVisible();
    await healthy({ screenshotName: 'R1-64-access-tab' });

    // Approve one request (role mentor): the request is closed by this admin and the alias is allow-listed.
    await page.getByTestId(`button-approve-${approveId}`).click();
    await expect(toastMatching(page, filled(lang, 'admin.access.approvedToast', { alias: approveAlias, role }))).toBeVisible();
    await expect.poll(async () => (await requestRow(approveId)).status).toBe('approved');
    const approvedRequest = await requestRow(approveId);
    expect(approvedRequest.resolved_by).toBe(adminEmail);
    expect(approvedRequest.resolved_at).not.toBeNull();
    expect(await approvedRow(db, approveAlias)).toMatchObject({ is_active: true, role: 'mentor', approved_by: adminEmail, email: `${approveAlias}@amazon.com` });

    // Reject the other: closed, and nobody is allow-listed.
    await page.getByTestId(`button-reject-${rejectId}`).click();
    await expect(toastMatching(page, filled(lang, 'admin.access.rejectedToast', { alias: rejectAlias }))).toBeVisible();
    await expect.poll(async () => (await requestRow(rejectId)).status).toBe('rejected');
    expect((await requestRow(rejectId)).resolved_by).toBe(adminEmail);
    expect(await approvedRow(db, rejectAlias)).toBeUndefined();

    // After a reload both are resolved (the audit trail lists them) and no longer pending.
    await page.reload();
    await expect(page.getByTestId(`row-approved-${(await approvedRow(db, approveAlias)).id}`)).toBeVisible();
    await expect(page.getByTestId(`row-request-${approveId}`)).toHaveCount(0);
    await expect(page.getByTestId(`row-request-${rejectId}`)).toHaveCount(0);
    await page.getByTestId('button-toggle-resolved').click();
    await expect(page.getByTestId(`row-resolved-${approveId}`)).toBeVisible();
    await expect(page.getByTestId(`row-resolved-${rejectId}`)).toBeVisible();

    // Add an alias by hand.
    await page.getByTestId('input-add-alias').fill(addedAlias);
    await page.getByTestId('input-add-email').fill(`${addedAlias}@amazon.com`);
    await page.getByTestId('button-add-alias').click();
    await expect(toastMatching(page, filled(lang, 'admin.access.addedToast', { alias: addedAlias }))).toBeVisible();
    await expect.poll(async () => (await approvedRow(db, addedAlias)) ?? null).toMatchObject({ is_active: true, role: 'mentor', approved_by: adminEmail });
    const added = await approvedRow(db, addedAlias);
    const addedRow = page.getByTestId(`row-approved-${added.id}`);
    const inactive = () => addedRow.getByText(tr(lang, 'admin.access.inactive'), { exact: true });

    // Deactivate it; the saved state survives a reload.
    await page.getByTestId(`button-toggle-approved-${added.id}`).click();
    await expect(toastMatching(page, filled(lang, 'admin.access.deactivatedToast', { alias: addedAlias }))).toBeVisible();
    await expect.poll(async () => (await approvedRow(db, addedAlias)).is_active).toBe(false);
    await page.reload();
    await expect(inactive()).toBeVisible();

    // Reactivate it.
    await page.getByTestId(`button-toggle-approved-${added.id}`).click();
    await expect(toastMatching(page, filled(lang, 'admin.access.reactivatedToast', { alias: addedAlias }))).toBeVisible();
    await expect.poll(async () => (await approvedRow(db, addedAlias)).is_active).toBe(true);
    await page.reload();
    await expect(addedRow.getByText(tr(lang, 'admin.access.active'), { exact: true })).toBeVisible();
    await expect(inactive()).toHaveCount(0);
    await healthy({ screenshotName: 'R1-64-access-saved' });

    // A failed write: the error toast, no success toast, the alias stays active.
    await page.route('**/rest/v1/approved_users?**', (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
    await toasts.clear();
    await page.getByTestId(`button-toggle-approved-${added.id}`).click();
    await expect(toastMatching(page, new RegExp(escape(tr(lang, 'errors.somethingWentWrong'))))).toBeVisible();
    expect(await toasts.seen(filled(lang, 'admin.access.deactivatedToast', { alias: addedAlias })), 'no success toast for a failed write').toBe(false);
    await page.unroute('**/rest/v1/approved_users?**');
    expect((await approvedRow(db, addedAlias)).is_active).toBe(true);
  } finally {
    await cleanup();
  }
});
