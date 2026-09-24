import { test, expect } from '../fixtures/test';
import { e2eNamespace, personaEmail } from '../fixtures/personas';
import { expectNoDemo, fillMentorOnboarding, purgeMentorsByEmail, runsOn, tokenSettle } from './c-helpers';

/**
 * Mentor onboarding in database mode (design §6.4 S27; C12, F25, F49, AM3). A mentor whose
 * profile already exists (or was linked by the programme) never sees the form again; a new
 * mentor completes it and lands on /mentor-portal, which reads the mentors row and its
 * requests from Supabase (no demo banner or badge, nothing in the browser store).
 */
const PROJECTS = ['desktop-en', 'mobile-ar'];

test('S27 a mentor whose profile the programme linked goes to the portal, with no form and no second profile', async ({ page, loginAs, healthy, db, personaProject }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S27 runs on desktop-en and mobile-ar');
  await loginAs('mentor-linked');
  await tokenSettle(page);
  await page.goto('/mentor-onboarding');
  await expect(page).toHaveURL((u) => u.pathname.startsWith('/mentor-portal'));
  await expect(page.getByTestId('input-name')).toHaveCount(0);
  const [own] = await db<{ n: number }[]>`
    select count(*)::int as n from public.mentors where lower(email) = ${personaEmail(personaProject, 'mentor-linked')}`;
  expect(own.n, 'no second mentors row for the linked mentor').toBe(0);
  await healthy({ screenshotName: 'S27-linked-portal' });
});

test('S27 a mentor with a profile goes to the portal', async ({ page, loginAs, healthy }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S27 runs on desktop-en and mobile-ar');
  await loginAs('mentor');
  await tokenSettle(page);
  await page.goto('/mentor-onboarding');
  await expect(page).toHaveURL((u) => u.pathname.startsWith('/mentor-portal'));
  await expect(page.getByTestId('input-name')).toHaveCount(0);
  await healthy({ screenshotName: 'S27-existing-portal' });
});

test('S27 a new mentor completes onboarding and lands on the database-backed portal', async ({ page, loginAs, healthy, db, lang, personaProject }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S27 runs on desktop-en and mobile-ar');
  const email = personaEmail(personaProject, 'mentor-new');
  const slug = `e2e-onboard-${(e2eNamespace() ? `${e2eNamespace()}-` : '') + personaProject}`;
  const name = lang === 'ar' ? 'ريم الحسيني' : 'Reem Hosseini';
  await purgeMentorsByEmail(db, email);
  try {
    await loginAs('mentor-new');
    await tokenSettle(page);
    await page.goto('/mentor-onboarding');
    await expect(page.getByTestId('input-name')).toBeVisible();
    await expect(page.getByTestId('input-email')).toHaveValue(email);
    await healthy({ screenshotName: 'S27-form' });

    await fillMentorOnboarding(page, { name, calLink: `https://cal.com/${slug}/30min` });
    await page.getByTestId('button-submit').click();
    await expect(page).toHaveURL((u) => u.pathname === '/mentor-portal', { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
    await expectNoDemo(page, lang);

    const [mentor] = await db<{ id: string; cal_link: string }[]>`select id, cal_link from public.mentors where lower(email) = ${email}`;
    expect(mentor?.cal_link).toBe(`${slug}/30min`);
    const [user] = await db<{ profile_id: string | null }[]>`select profile_id from public.users where lower(email) = ${email}`;
    expect(user.profile_id, 'the account is linked to the new profile').toBe(mentor.id);
    await healthy({ screenshotName: 'S27-portal' });

    // Opening onboarding again goes straight to the portal; still one profile.
    await page.goto('/mentor-onboarding');
    await expect(page).toHaveURL((u) => u.pathname.startsWith('/mentor-portal'));
    const [count] = await db<{ n: number }[]>`select count(*)::int as n from public.mentors where lower(email) = ${email}`;
    expect(count.n).toBe(1);
  } finally {
    // Back to "approved, no profile yet" for the other specs.
    await purgeMentorsByEmail(db, email);
  }
});
