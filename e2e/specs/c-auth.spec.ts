import { test, expect, mailpit, turnstile, e2eEnv, type Page } from '../fixtures/test';
import { tr } from '../fixtures/i18n';
import { E2E_PASSWORD, e2eNamespace, personaEmail } from '../fixtures/personas';
import { adminClient, anonClient, captchaReady, deleteAccounts, runsOn, tokenSettle } from './c-helpers';

/**
 * Password accounts end to end against the local GoTrue and Mailpit (design §6.4 S23, S24;
 * C11, F31–F34, F50): sign-up confirmation through /auth/confirm, resend with its cooldown,
 * mapped errors, password recovery, and the request-interception check that the Turnstile
 * token reaches GoTrue on signup, token and recover. E-mail links only return to
 * http://localhost:5173 (the GoTrue allow-list), so these run on the default port.
 */
const PROJECTS = ['desktop-en', 'desktop-ar'];
const NEW_PASSWORD = 'E2e-new-Passw0rd!';

/** A fresh address for an account this spec creates (deleted in its cleanup). */
function freshEmail(project: string, tag: string): string {
  const ns = e2eNamespace();
  return `e2e.${ns ? `${ns}.` : ''}${project}.${tag}-${Date.now().toString(36)}@mentorconnect.test`;
}

/** Bodies of the GoTrue calls a page makes (for the captcha_token check). */
function recordAuthCalls(page: Page) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (req.method() === 'POST' && url.pathname.startsWith('/auth/v1/')) {
      try {
        calls.push({ path: url.pathname, body: (req.postDataJSON() ?? {}) as Record<string, unknown> });
      } catch {
        calls.push({ path: url.pathname, body: {} });
      }
    }
  });
  return (path: string) => calls.filter((c) => c.path === path).map((c) => c.body);
}

function captchaTokenOf(body: Record<string, unknown> | undefined): unknown {
  return (body?.gotrue_meta_security as { captcha_token?: unknown } | undefined)?.captcha_token;
}

/** Main-frame paths visited, in order. */
function recordPaths(page: Page): string[] {
  const paths: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname);
  });
  return paths;
}

// ---------------------------------------------------------------- S23 sign-up

test('S23 sign-up: token sent, check-email card with a working Resend, then /auth/confirm → registration → dashboard', async ({ page, healthy, db, lang, personaProject, baseURL }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S23 runs on desktop-en and desktop-ar');
  const email = freshEmail(personaProject, 'signup');
  const bodies = recordAuthCalls(page);
  const paths = recordPaths(page);
  try {
    // The Resend button starts in its 60 s cooldown; the fake clock skips it.
    await page.clock.install();
    await page.goto('/signup');
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-password').fill(E2E_PASSWORD);
    await page.getByTestId('input-confirm-password').fill(E2E_PASSWORD);
    await captchaReady(page);
    const sentAt = new Date(Date.now() - 1_000);
    await page.getByTestId('button-signup').click();
    const card = page.getByTestId('card-confirm-email');
    await expect(card).toBeVisible();
    if (turnstile.enabled) expect(captchaTokenOf(bodies('/auth/v1/signup')[0]), 'signup carries the captcha token').toBeTruthy();
    await healthy({ screenshotName: 'S23-check-email' });

    const first = await mailpit.waitFor(email, { since: sentAt });
    const redirectTo = new URL(mailpit.link(first, '/auth/v1/verify')).searchParams.get('redirect_to') ?? '';
    expect(redirectTo.startsWith(`${new URL(baseURL!).origin}/auth/confirm?next=`), `redirect_to ${redirectTo}`).toBe(true);

    // Resend: disabled while the first email is fresh, then a second email.
    const resend = card.getByTestId('button-resend-confirmation');
    await expect(resend).toBeDisabled();
    await page.clock.fastForward(61_000);
    await expect(resend).toBeEnabled();
    await captchaReady(card);
    await page.waitForTimeout(1_500); // the local stack allows one confirmation email per second
    const resentAt = new Date(Date.now() - 500);
    await resend.click();
    await expect(card.locator('[data-testid="text-resend-status"][data-state="ok"]')).toBeVisible();
    const second = await mailpit.waitFor(email, { since: resentAt });
    expect(second.id).not.toBe(first.id);
    await expect(resend).toBeDisabled();
    await healthy({ screenshotName: 'S23-resent' });

    // The newest link: /auth/confirm, then registration (no mentees row yet).
    await page.goto(mailpit.link(second, '/auth/v1/verify'));
    await expect(page).toHaveURL((u) => u.pathname === '/mentee-registration', { timeout: 20_000 });
    expect(paths).toContain('/auth/confirm');
    await healthy({ screenshotName: 'S23-registration' });

    // Registration, then the dashboard.
    await page.getByTestId('input-name').fill(lang === 'ar' ? 'ليلى المنصوري' : 'Layla Mansouri');
    await page.getByTestId('select-languages').click();
    await page.getByRole('option').first().click();
    await page.getByTestId('experience-areas-container').locator('button').first().click();
    await page.getByTestId('button-submit').click();
    await expect(page).toHaveURL((u) => u.pathname.startsWith('/mentee-dashboard'), { timeout: 20_000 });
    const [row] = await db<{ email: string }[]>`select email from public.mentees where lower(email) = ${email}`;
    expect(row?.email).toBe(email);
    await healthy({ screenshotName: 'S23-dashboard' });
  } finally {
    await deleteAccounts(db, [email]);
  }
});

test('S23 signing up with an existing email says the email is in use', async ({ page, healthy, lang, personaProject }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S23 runs on desktop-en and desktop-ar');
  await page.goto('/signup');
  await page.getByTestId('input-email').fill(personaEmail(personaProject, 'mentee'));
  await page.getByTestId('input-password').fill(E2E_PASSWORD);
  await page.getByTestId('input-confirm-password').fill(E2E_PASSWORD);
  await captchaReady(page);
  await page.getByTestId('button-signup').click();
  const alert = page.getByTestId('alert-signup-error');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(tr(lang, 'auth.emailInUse'));
  await expect(page.getByTestId('card-confirm-email')).toHaveCount(0);
  // GoTrue answers the duplicate with 422 user_already_exists: that refusal is the expected outcome.
  await healthy({ screenshotName: 'S23-duplicate', allowStatus: [{ url: /\/auth\/v1\/signup/, status: 422 }] });
});

test('S23 an unconfirmed sign-in says "Confirm your email first", and its Resend sends a new email', async ({ page, healthy, db, lang, personaProject }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S23 runs on desktop-en and desktop-ar');
  const email = freshEmail(personaProject, 'unconfirmed');
  const bodies = recordAuthCalls(page);
  try {
    const { error } = await adminClient().auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: false });
    if (error) throw error;
    await page.goto('/login');
    await page.getByTestId('button-toggle-password-login').click(); // the password form is folded under Amazon sign-in
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-password').fill(E2E_PASSWORD);
    await captchaReady(page);
    await page.getByTestId('button-login').click();
    const alert = page.getByTestId('alert-login-error');
    await expect(alert).toHaveAttribute('data-kind', 'email_not_confirmed');
    await expect(alert).toContainText(tr(lang, 'auth.errors.confirmFirstTitle'));
    if (turnstile.enabled) expect(captchaTokenOf(bodies('/auth/v1/token')[0]), 'the password grant carries the captcha token').toBeTruthy();
    // GoTrue refuses the password grant with 400 email_not_confirmed: the outcome under test.
    await healthy({ screenshotName: 'S23-unconfirmed', allowStatus: [{ url: /\/auth\/v1\/token/, status: 400 }] });

    await captchaReady(alert);
    await page.waitForTimeout(1_500);
    const since = new Date(Date.now() - 500);
    await alert.getByTestId('button-resend-confirmation').click();
    await expect(alert.locator('[data-testid="text-resend-status"][data-state="ok"]')).toBeVisible();
    const mail = await mailpit.waitFor(email, { since });
    expect(mailpit.link(mail, '/auth/v1/verify')).toContain('redirect_to=');
  } finally {
    await deleteAccounts(db, [email]);
  }
});

// ---------------------------------------------------------------- S24 password reset

test('S24 password reset: the Mailpit link opens the form; the new password works and the old one fails', async ({ page, healthy, db, personaProject }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S24 runs on desktop-en and desktop-ar');
  const email = freshEmail(personaProject, 'reset');
  const bodies = recordAuthCalls(page);
  try {
    const { error } = await adminClient().auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true });
    if (error) throw error;
    await page.goto('/forgot-password');
    await page.getByTestId('input-email').fill(email);
    await captchaReady(page);
    const since = new Date(Date.now() - 1_000);
    await page.getByTestId('button-send-reset-link').click();
    await expect(page.getByTestId('card-reset-email-sent')).toBeVisible();
    if (turnstile.enabled) expect(captchaTokenOf(bodies('/auth/v1/recover')[0]), 'recover carries the captcha token').toBeTruthy();
    const mail = await mailpit.waitFor(email, { since });
    const link = mailpit.link(mail, '/auth/v1/verify');
    expect(new URL(link).searchParams.get('redirect_to') ?? '').toMatch(/\/reset-password$/);

    await page.goto(link);
    await expect(page.getByTestId('button-reset-password')).toBeVisible({ timeout: 20_000 });
    await healthy({ screenshotName: 'S24-form' });
    await page.getByTestId('input-password').fill(NEW_PASSWORD);
    await page.getByTestId('input-confirm-password').fill(NEW_PASSWORD);
    await page.getByTestId('button-reset-password').click();
    await expect(page.getByTestId('card-reset-success')).toBeVisible();
    await healthy({ screenshotName: 'S24-success' });

    const client = anonClient();
    expect((await client.auth.signInWithPassword({ email, password: NEW_PASSWORD })).error, 'the new password signs in').toBeNull();
    expect((await client.auth.signInWithPassword({ email, password: E2E_PASSWORD })).error, 'the old password fails').not.toBeNull();
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), e2eEnv.authStorageKey);
    expect(stored, 'the recovery session is signed out').toBeNull();
  } finally {
    await deleteAccounts(db, [email]);
  }
});

test('S24 /reset-password with an ordinary session shows the invalid-link state', async ({ page, loginAs, healthy }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S24 runs on desktop-en and desktop-ar');
  await loginAs('mentee');
  await tokenSettle(page);
  await page.goto('/reset-password');
  await expect(page.getByTestId('card-reset-invalid')).toBeVisible();
  await expect(page.getByTestId('button-reset-password')).toHaveCount(0);
  await healthy({ screenshotName: 'S24-invalid' });
});

test('S24 an Amazon account in a recovery session is refused and signed out', async ({ page, healthy, db, personaProject, baseURL }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S24 runs on desktop-en and desktop-ar');
  const email = freshEmail(personaProject, 'amazon');
  const alias = `e2e-s24-${(e2eNamespace() ? `${e2eNamespace()}-` : '') + personaProject}`;
  try {
    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true });
    if (error || !data.user) throw error ?? new Error('no user');
    await db`delete from public.users where amazon_alias = ${alias}`;
    await db`
      insert into public.users (id, email, password, user_type, amazon_alias, is_verified, created_at)
      values (${data.user.id}, ${email}, 'managed-by-supabase-auth', 'mentor', ${alias}, true, timezone('utc', now()))`;
    const origin = new URL(baseURL!).origin;
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${origin}/reset-password` } });
    if (linkError || !link.properties?.action_link) throw linkError ?? new Error('no recovery link');

    await page.goto(link.properties.action_link);
    await expect(page.getByTestId('card-reset-amazon')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('button-reset-password')).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), e2eEnv.authStorageKey)).toBeNull();
    // The header's bell may already be loading for the recovery session when the page signs it
    // out; supabase-js then sends that read without a session (401). Nothing is shown for it.
    await healthy({ screenshotName: 'S24-amazon-refused', allowStatus: [{ url: /\/rest\/v1\/notifications/, status: 401 }] });
  } finally {
    await deleteAccounts(db, [email]);
  }
});

/**
 * An account the Amazon SSO bridge would have made (a users row with `amazon_alias`), and a
 * recovery link for it. `stamped` also puts the alias on the auth user's metadata, as the
 * bridge does (api/_lib/supabaseAdmin.ts); without it only the users row knows.
 */
async function amazonRecoveryLink(db: Parameters<typeof deleteAccounts>[0], email: string, alias: string, origin: string, stamped: boolean) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: stamped ? { amazon_alias: alias } : {},
  });
  if (error || !data.user) throw error ?? new Error('no user');
  await db`delete from public.users where amazon_alias = ${alias}`;
  await db`
    insert into public.users (id, email, password, user_type, amazon_alias, is_verified, created_at)
    values (${data.user.id}, ${email}, 'managed-by-supabase-auth', 'mentor', ${alias}, true, timezone('utc', now()))`;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${origin}/reset-password` } });
  if (linkError || !link.properties?.action_link) throw linkError ?? new Error('no recovery link');
  return link.properties.action_link;
}

test('S24 fail closed: when the account lookup fails, an Amazon account gets an error with Retry, never the form (F11)', async ({ page, healthy, db, personaProject, baseURL }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S24 runs on desktop-en and desktop-ar');
  const email = freshEmail(personaProject, 'amazon-down');
  const alias = `e2e-s24d-${(e2eNamespace() ? `${e2eNamespace()}-` : '') + personaProject}`;
  try {
    const link = await amazonRecoveryLink(db, email, alias, new URL(baseURL!).origin, false);
    // The users table is unreachable while GoTrue still works.
    await page.route('**/rest/v1/users?**', (route) => route.abort());
    await page.goto(link);
    await expect(page.getByTestId('card-reset-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('button-reset-password')).toHaveCount(0);
    await healthy({ screenshotName: 'S24-lookup-failed' });

    // Back online: Retry reads the users row, refuses the Amazon account and signs it out.
    await page.unroute('**/rest/v1/users?**');
    await page.getByTestId('button-reset-retry').click();
    await expect(page.getByTestId('card-reset-amazon')).toBeVisible();
    await expect(page.getByTestId('button-reset-password')).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), e2eEnv.authStorageKey)).toBeNull();
  } finally {
    await deleteAccounts(db, [email]);
  }
});

test('S24 an alias on the session itself is refused without any database read (F11)', async ({ page, healthy, db, personaProject, baseURL }, testInfo) => {
  test.skip(!runsOn(testInfo, PROJECTS), 'S24 runs on desktop-en and desktop-ar');
  const email = freshEmail(personaProject, 'amazon-stamped');
  const alias = `e2e-s24s-${(e2eNamespace() ? `${e2eNamespace()}-` : '') + personaProject}`;
  try {
    const link = await amazonRecoveryLink(db, email, alias, new URL(baseURL!).origin, true);
    await page.route('**/rest/v1/users?**', (route) => route.abort());
    await page.goto(link);
    await expect(page.getByTestId('card-reset-amazon')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('button-reset-password')).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), e2eEnv.authStorageKey)).toBeNull();
    // As above: a header read already in flight when the page signs out may answer 401; nothing is shown for it.
    await healthy({ screenshotName: 'S24-amazon-stamped', allowStatus: [{ url: /\/rest\/v1\/notifications/, status: 401 }] });
  } finally {
    await page.unroute('**/rest/v1/users?**');
    await deleteAccounts(db, [email]);
  }
});
