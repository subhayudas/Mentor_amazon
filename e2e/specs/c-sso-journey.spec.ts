import { test, expect, e2eEnv } from '../fixtures/test';
import { e2eNamespace } from '../fixtures/personas';
import {
  expectNoDemo,
  fillMentorOnboarding,
  insertPendingRequest,
  purgeRequester,
  purgeSsoIdentity,
  recordPaths,
  runsOn,
  signOut,
} from './c-helpers';

/**
 * S28 "Amazon tester journey" (design-amendments AM3) on the real local stack: the dev
 * server's /api/auth/* handlers (MC_LOCAL_API=1) against Track A's mock IdP, the real
 * Supabase admin API and the SPA. No SSO code is stubbed. Each attempt uses its own alias
 * (starting with "e2e", so scripts/e2e/seed.ts also clears it), so the first sign-in is a
 * first sign-in.
 */
test('S28 Amazon sign-in → onboarding → database-backed portal → accept a request → sign out → straight back in', async ({ page, request, db, lang, isMobile, healthy, personaProject }, testInfo) => {
  test.skip(!runsOn(testInfo, ['desktop-en', 'mobile-ar']), 'S28 runs on desktop-en and mobile-ar');
  test.setTimeout(120_000);
  const ns = e2eNamespace();
  const alias = `e2e-s28-${ns ? `${ns}-` : ''}${personaProject}-${testInfo.retry}`;
  const amazonEmail = `${alias}@amazon.com`;
  const requesterEmail = `e2e.${ns ? `${ns}.` : ''}${personaProject}.s28-requester@mentorconnect.test`;
  const name = lang === 'ar' ? 'سلمى العتيبي' : 'Salma Otaibi';
  const paths = recordPaths(page);
  await purgeSsoIdentity(db, alias);
  await purgeRequester(db, requesterEmail);

  const counts = async () => {
    const [row] = await db<{ users: number; approved: number; mentors: number; auth: number }[]>`
      select (select count(*)::int from public.users where amazon_alias = ${alias}) as users,
             (select count(*)::int from public.approved_users where amazon_alias = ${alias}) as approved,
             (select count(*)::int from public.mentors where lower(email) = ${amazonEmail}) as mentors,
             (select count(*)::int from auth.users where lower(email) = ${amazonEmail}) as auth`;
    return row;
  };

  try {
    const subject = await request.post(`${e2eEnv.mockIdpControl}/subject`, { data: { sub: alias } });
    expect(subject.ok(), 'mock IdP subject set').toBe(true);

    // 1. /login → "Sign in with Amazon" → the IdP approves → /auth/sso → onboarding (first sign-in).
    await page.goto('/login');
    await expect(page.getByTestId('link-amazon-sso')).toBeVisible();
    await healthy({ screenshotName: 'S28-1-login' });
    await page.getByTestId('link-amazon-sso').click();
    await expect(page).toHaveURL((u) => u.pathname === '/mentor-onboarding', { timeout: 30_000 });
    expect(paths, 'the bridge page ran').toContain('/auth/sso');
    await expect(page.getByTestId('input-name')).toBeVisible();
    await expect(page.getByTestId('input-email')).toHaveValue(amazonEmail);
    const [user] = await db<{ user_type: string; profile_id: string | null }[]>`
      select user_type, profile_id from public.users where amazon_alias = ${alias}`;
    expect(user).toEqual({ user_type: 'mentor', profile_id: null });
    const [approved] = await db<{ approved_by: string; is_active: boolean }[]>`
      select approved_by, is_active from public.approved_users where amazon_alias = ${alias}`;
    expect(approved).toEqual({ approved_by: 'amazon-sso', is_active: true });
    await expectNoDemo(page, lang);
    await healthy({ screenshotName: 'S28-2-onboarding' });

    // 2. Onboarding with the mentor's own Cal.com link → /mentor-portal (reads Supabase; no demo data).
    await fillMentorOnboarding(page, { name, calLink: `https://cal.com/${alias}/30min` });
    await page.getByTestId('button-submit').click();
    await expect(page).toHaveURL((u) => u.pathname === '/mentor-portal', { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
    await expectNoDemo(page, lang);
    const [mentor] = await db<{ id: string; cal_link: string }[]>`select id, cal_link from public.mentors where lower(email) = ${amazonEmail}`;
    expect(mentor?.cal_link).toBe(`${alias}/30min`);
    await healthy({ screenshotName: 'S28-3-portal' });

    // 3. A pending request for this mentor shows in the portal inbox; Accept writes the database.
    const requestId = await insertPendingRequest(db, {
      mentorId: mentor.id,
      email: requesterEmail,
      name: 'E2E S28 Requester',
      goal: 'E2E S28: help me plan the first product launch for our pilot customers.',
    });
    await page.reload();
    await expect(page.getByTestId(`booking-row-${requestId}`)).toBeVisible();
    await healthy({ screenshotName: 'S28-4-inbox' });
    await page.getByTestId(`button-accept-${requestId}`).click();
    await expect
      .poll(async () => (await db<{ status: string }[]>`select status from public.bookings where id = ${requestId}`)[0].status)
      .toBe('accepted');
    const bell = await db<{ type: string }[]>`
      select type from public.notifications where booking_id = ${requestId} and lower(recipient_email) = ${requesterEmail}`;
    expect(bell.map((n) => n.type), 'the mentee is notified').toContain('booking_accepted');
    await expect(page.getByTestId(`badge-decision-${requestId}`)).toBeVisible();
    await healthy({ screenshotName: 'S28-5-accepted' });

    // 4. Sign out, sign in with Amazon again: straight to the portal, no onboarding, no duplicates.
    await signOut(page, lang, isMobile);
    paths.length = 0;
    await expect(page.getByTestId('link-amazon-sso')).toBeVisible();
    await page.getByTestId('link-amazon-sso').click();
    await expect(page).toHaveURL((u) => u.pathname === '/mentor-portal', { timeout: 30_000 });
    expect(paths, 'the bridge page ran').toContain('/auth/sso');
    expect(paths, 'no second onboarding').not.toContain('/mentor-onboarding');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
    await expect(page.getByTestId(`booking-row-${requestId}`)).toHaveCount(0); // answered: no longer waiting
    expect(await counts()).toEqual({ users: 1, approved: 1, mentors: 1, auth: 1 });
    await expectNoDemo(page, lang);
    await healthy({ screenshotName: 'S28-6-signed-in-again' });
  } finally {
    await request.post(`${e2eEnv.mockIdpControl}/reset`).catch(() => undefined);
    await purgeSsoIdentity(db, alias);
    await purgeRequester(db, requesterEmail);
  }
});
