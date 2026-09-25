import { test, expect } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { displayName, ids, personaEmail } from '../fixtures/personas';
import { adminClient, tokenSettle } from './c-helpers';

/**
 * Design acceptance items that had no test (R1-69):
 * - F17 / C6: a pending organisation sees the verification banner on the mentee home (an
 *   individual sees none);
 * - F48: the role comes from the users row only. An account whose own (self-writable)
 *   user_metadata claims admin is still a mentee: no admin screen, no admin navigation.
 * (The calendar item, F13 / C8, is in g-calendar.spec.ts.)
 */

test('R1-69 F17 a pending organisation sees the verification banner on /dashboard; an individual sees none', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const menteeId = ids(personaProject).mentee;
  const org = `E2E Org Pending (${personaProject})`;
  const reset = () => db`
    update public.mentees set user_type = 'individual', organization_name = null, verification_status = 'unverified'
    where id = ${menteeId}`;
  await reset();
  try {
    await loginAs('mentee');
    await tokenSettle(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('verification-banner')).toHaveCount(0);

    await db`
      update public.mentees set user_type = 'organization', organization_name = ${org}, verification_status = 'pending'
      where id = ${menteeId}`;
    await page.reload();
    const banner = page.getByTestId('verification-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-status', 'pending');
    await expect(banner).toContainText(tr(lang, 'showcase.verification.pending.title').split('{{')[0].trim());
    await expect(banner).toContainText(tr(lang, 'showcase.verification.pending.body'));
    await healthy({ screenshotName: 'R1-69-verification-banner' });
  } finally {
    await reset();
  }
});

test('R1-69 F48 a mentee whose user_metadata claims admin is still a mentee', async ({ page, loginAs, healthy, db, lang, personaProject }) => {
  const email = personaEmail(personaProject, 'mentee');
  const [authUser] = await db<{ id: string }[]>`select id::text from auth.users where lower(email) = ${email}`;
  const admin = adminClient();
  const restore = () => admin.auth.admin.updateUserById(authUser.id, { user_metadata: { full_name: displayName(personaProject, 'mentee'), user_type: null, role: null } });
  try {
    const { error } = await admin.auth.admin.updateUserById(authUser.id, { user_metadata: { full_name: displayName(personaProject, 'mentee'), user_type: 'admin', role: 'admin' } });
    if (error) throw error;
    const session = await loginAs('mentee');
    expect(session.user.user_metadata.user_type, 'the session carries the claim').toBe('admin');
    const [row] = await db<{ user_type: string }[]>`select user_type from public.users where id = ${authUser.id}`;
    expect(row.user_type).toBe('mentee');
    await tokenSettle(page);

    await page.goto('/admin');
    await expect(page.getByText(tr(lang, 'guard.noAccessTitle')).first()).toBeVisible();
    await expect(page.getByTestId(/^row-mentor-/)).toHaveCount(0);
    // The mentee home, not a redirect to /admin, and no admin link in the navigation.
    await page.goto('/dashboard');
    await expect(page.getByTestId('mentee-sessions').or(page.getByTestId('mentee-empty'))).toBeVisible();
    await expect(page).toHaveURL((u) => u.pathname === '/dashboard');
    await expect(page.getByRole('link', { name: tr(lang, 'nav.admin'), exact: true })).toHaveCount(0);
    await healthy({ screenshotName: 'R1-69-metadata-admin-is-mentee' });
  } finally {
    await restore();
  }
});
