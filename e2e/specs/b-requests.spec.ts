import { test, expect, turnstile, type Page } from '../fixtures/test';
import { displayName, ids, personaEmail } from '../fixtures/personas';
import { devEmail, featuredFor, insertPendingRequest, plain, purgeRequester, tr, useLanguage } from './b-helpers';

/**
 * Session requests (design §6.4 S3–S6, S8; B3/B4, F03/F31/F42): the curated session page's
 * request form and the DB profile's request dialog, end to end through /api/requests
 * (Turnstile test keys) or the signed-in RPC, with the rows checked in Postgres.
 */
const GOAL = 'I want feedback on our launch plan and positioning for the UAE market.';
const tokenInput = (page: Page) => page.locator('[data-testid="turnstile"] input[name="cf-turnstile-response"]');

test.beforeEach(async ({ page, lang }) => {
  await useLanguage(page, lang);
});

async function fillSessionForm(page: Page, name: string, email: string, goal = GOAL) {
  await page.getByTestId('input-session-name').fill(name);
  await page.getByTestId('input-session-email').fill(email);
  await page.getByTestId('textarea-session-goal').fill(goal);
}

async function requestRows(db: import('postgres').Sql, email: string) {
  return db<{ id: string; status: string; mentor_id: string; goal: string }[]>`
    select b.id, b.status, b.mentor_id, b.goal from public.bookings b
    join public.mentees me on me.id = b.mentee_id where lower(me.email) = ${email.toLowerCase()}`;
}

test('S3 anonymous request to a curated mentor: validation, Turnstile, DB row, admin bell, honest success', async ({ page, db, healthy, lang }, testInfo) => {
  const f = featuredFor(testInfo.project.name);
  const email = devEmail('s3');
  const posts: Array<Record<string, unknown>> = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/requests') && r.method() === 'POST') posts.push(r.postDataJSON() as Record<string, unknown>);
  });
  try {
    await page.goto(`/mentor/${f.slug}/book`);
    const form = page.getByTestId('form-session-request');
    await expect(form).toBeVisible();
    await expect(page.locator('iframe[src*="cal.com"]')).toHaveCount(0);

    // Localized validation, nothing sent.
    await page.getByTestId('button-send-request').click();
    await expect(form.getByText(tr(lang, 'bookingRequest.validation.name'), { exact: true })).toBeVisible();
    await expect(form.getByText(tr(lang, 'bookingRequest.validation.email'), { exact: true })).toBeVisible();
    await expect(form.locator('p[role="alert"]')).toHaveCount(3);
    expect(posts).toHaveLength(0);

    if (turnstile.enabled) {
      await expect(page.getByTestId('turnstile')).toBeVisible();
      await expect(tokenInput(page)).toHaveValue(/.+/, { timeout: 20_000 });
    }
    await fillSessionForm(page, 'Dev B Requester', email);
    await page.getByTestId('button-send-request').click();
    const done = page.getByTestId('slot-confirmation');
    await expect(done).toBeVisible();
    await expect(done).toHaveAttribute('data-outcome', 'sent');
    // Signed out, the server never says whether the email already has an account (then nothing is
    // sent), so the page says "Request submitted" and what to do in either case (R1-08).
    await expect(done.getByRole('heading')).toHaveText(tr(lang, 'showcase.scheduler.submittedTitle'));
    const followup = plain(await page.getByTestId('text-request-followup').innerText());
    expect(followup).toBe(tr(lang, 'showcase.scheduler.submittedBodyProgramme', { email }));
    expect(plain(await done.innerText())).not.toContain(tr(lang, 'showcase.picker.sentTitle', { name: '' }).trim());
    await expect(page.getByTestId('link-success-signup')).toHaveAttribute('href', '/signup?next=%2Fmentee-dashboard%2Fbookings');
    if (turnstile.enabled) expect(posts[0]?.turnstileToken).toBeTruthy();
    await healthy({ screenshotName: 'S3-success' });

    const rows = await requestRows(db, email);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', mentor_id: f.dbId, goal: GOAL });
    const bell = await db<{ recipient_email: string; recipient_type: string }[]>`
      select recipient_email, recipient_type from public.notifications where booking_id = ${rows[0].id}`;
    expect(bell.length, 'one notification per admin').toBeGreaterThan(0);
    expect(bell.every((n) => !n.recipient_email.endsWith('.invalid'))).toBe(true);
    const admins = await db<{ email: string }[]>`select lower(email) as email from public.users where user_type = 'admin'`;
    expect(bell.every((n) => admins.some((a) => a.email === n.recipient_email))).toBe(true);

    const localKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('mentorconnect.local.')));
    expect(localKeys).toEqual([]);

    // Revisiting the profile shows the request, as submitted (R1-08).
    await page.goto(`/mentor/${f.slug}`);
    const remembered = page.getByTestId('featured-request-sent');
    await expect(remembered).toBeVisible();
    await expect(remembered).toContainText(tr(lang, 'bookingRequest.status.submitted'));
    await expect(remembered).not.toContainText(tr(lang, 'bookingRequest.status.sent'));
    await healthy({ screenshotName: 'S3-profile-request-sent' });
  } finally {
    await purgeRequester(db, email);
  }
});

test('S4 bot check: no token means no POST; a request the server rejects shows the bot-check failure', async ({ page, db, healthy, healthTracker, lang }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'S4 runs on desktop-en and mobile-ar');
  test.skip(!turnstile.enabled, 'Turnstile keys are off (E2E_TURNSTILE=off)');
  const f = featuredFor(testInfo.project.name, 1);
  const email = devEmail('s4');
  let posts = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/requests') && r.method() === 'POST') posts += 1;
  });
  try {
    // 1. The widget never hands out a token (its script cannot load): the check says so, and the
    //    send is refused locally with a message that points at it (R1-72).
    await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
    await page.goto(`/mentor/${f.slug}/book`);
    await expect(page.getByTestId('turnstile-failed')).toBeVisible();
    await fillSessionForm(page, 'Dev B Bot', email);
    await page.getByTestId('button-send-request').click();
    const error = page.getByTestId('booking-error');
    await expect(error).toHaveAttribute('data-kind', 'botCheck');
    await expect(error).toHaveText(tr(lang, 'bookingRequest.captchaNotSent'));
    expect(posts).toBe(0);
    await healthy({ screenshotName: 'S4-no-token' });
    await page.unroute('https://challenges.cloudflare.com/**');
    healthTracker.reset();

    // 2. The server refuses the request (the real /api/requests: no token → 403 captcha_failed).
    await page.route('**/api/requests', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      delete body.turnstileToken;
      await route.continue({ postData: JSON.stringify(body) });
    });
    await page.reload();
    await fillSessionForm(page, 'Dev B Bot', email);
    await expect(tokenInput(page)).toHaveValue(/.+/, { timeout: 20_000 });
    const response = page.waitForResponse((r) => r.url().endsWith('/api/requests'));
    await page.getByTestId('button-send-request').click();
    expect((await response).status()).toBe(403);
    await expect(error).toHaveAttribute('data-kind', 'captcha');
    await expect(error).toHaveText(tr(lang, 'bookingRequest.error.captcha'));
    await healthy({ screenshotName: 'S4-server-refused', allowStatus: [{ url: /\/api\/requests$/, status: 403 }] });
    expect(await requestRows(db, email)).toHaveLength(0);
  } finally {
    await purgeRequester(db, email);
  }
});

test('S5 a mentor who stops accepting: no request button, the API answers 422, the dialog says so', async ({ page, db, healthy, healthTracker, request, clientIp, personaProject }, testInfo) => {
  test.skip(!['desktop-en', 'desktop-ar'].includes(testInfo.project.name), 'S5 runs on desktop-en and desktop-ar');
  const mentorId = ids(personaProject).mentor;
  const email = devEmail('s5');
  try {
    // Open the dialog while the mentor accepts, then an admin flips them off before the send.
    await page.goto(`/mentor/${mentorId}`);
    await page.getByTestId('button-request-session').first().click();
    const dialog = page.getByTestId('dialog-booking-request');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('input-booking-name').fill('Dev B Late');
    await dialog.getByTestId('input-booking-email').fill(email);
    await dialog.getByTestId('textarea-booking-goal').fill(GOAL);
    if (turnstile.enabled) await expect(dialog.locator('[data-testid="turnstile"] input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await db`update public.mentors set is_available = false where id = ${mentorId}`;
    await dialog.getByTestId('button-submit-booking').click();
    const error = dialog.getByTestId('booking-error');
    await expect(error).toHaveAttribute('data-kind', 'unavailable');
    await expect(error).toContainText(/\S/);
    await healthy({ screenshotName: 'S5-dialog-unavailable', allowStatus: [{ url: /\/api\/requests$/, status: 422 }] });
    healthTracker.reset(); // the expected 422 is accounted for; later visits start clean

    // A fresh load hides the request button and shows the not-accepting block.
    await page.goto(`/mentor/${mentorId}`);
    await expect(page.getByTestId('mentor-unavailable').first()).toBeVisible();
    await expect(page.getByTestId('button-request-session')).toHaveCount(0);
    await healthy({ screenshotName: 'S5-profile-not-accepting' });

    // A direct POST is refused with 422 and nothing is written.
    const res = await request.post('/api/requests', {
      data: { mentorId, name: 'Dev B Direct', email, goal: GOAL, turnstileToken: turnstile.dummyToken },
      headers: { 'x-e2e-client-ip': clientIp },
    });
    expect(res.status()).toBe(422);
    expect(await res.json()).toEqual({ error: 'mentor_unavailable' });
    expect(await requestRows(db, email)).toHaveLength(0);
  } finally {
    await db`update public.mentors set is_available = true where id = ${mentorId}`;
    await purgeRequester(db, email);
  }
});

test('S5 a curated mentor who is not accepting has no Book button and no form', async ({ page, healthy }, testInfo) => {
  test.skip(!['desktop-en', 'desktop-ar'].includes(testInfo.project.name), 'S5 runs on desktop-en and desktop-ar');
  const f = featuredFor(testInfo.project.name, 2);
  // The curated rows are shared, so the flip is made in the app's view of the row only.
  await page.route('**/rest/v1/mentors_public*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const patch = (row: { id: string; is_available: boolean }) => (row.id === f.dbId ? { ...row, is_available: false } : row);
    return route.fulfill({ response, json: Array.isArray(body) ? body.map(patch) : patch(body) });
  });
  await page.goto(`/mentor/${f.slug}`);
  await expect(page.getByTestId('mentor-unavailable')).toBeVisible();
  await expect(page.getByTestId('link-book-session-rail')).toHaveCount(0);
  await expect(page.getByTestId(`button-favorite-${f.dbId}`)).toHaveCount(0);
  await healthy({ screenshotName: 'S5-featured-not-accepting' });
  await page.goto(`/mentor/${f.slug}/book`);
  await expect(page.getByTestId('mentor-unavailable')).toBeVisible();
  await expect(page.getByTestId('form-session-request')).toHaveCount(0);
});

test('S6 the sixth request from one email within an hour is rate limited', async ({ page, db, healthy, lang, personaProject }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-en', 'S6 runs on desktop-en');
  const f = featuredFor(testInfo.project.name, 3);
  const email = devEmail('s6');
  try {
    // Five requests in the last hour (closed ones, so the pending dedupe does not apply).
    for (let i = 0; i < 5; i++) {
      await insertPendingRequest(db, { mentorId: ids(personaProject).mentor, email, name: 'Dev B Busy', status: 'rejected' });
    }
    await page.goto(`/mentor/${f.slug}/book`);
    await fillSessionForm(page, 'Dev B Busy', email);
    if (turnstile.enabled) await expect(tokenInput(page)).toHaveValue(/.+/, { timeout: 20_000 });
    await page.getByTestId('button-send-request').click();
    const error = page.getByTestId('booking-error');
    await expect(error).toHaveAttribute('data-kind', 'rateLimited');
    expect([tr(lang, 'bookingRequest.error.rateLimited'), tr(lang, 'bookingRequest.error.rateLimitedSoon')]).toContain(plain(await error.innerText()).trim());
    await healthy({ screenshotName: 'S6-rate-limited', allowStatus: [{ url: /\/api\/requests$/, status: 429 }] });
    expect((await requestRows(db, email)).filter((r) => r.status === 'pending')).toHaveLength(0);
  } finally {
    await purgeRequester(db, email);
  }
});

test('S6b a server outage is not blamed on the connection; a 429 blocks Send only until its Retry-After', async ({ page, healthy, lang }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'S6b runs on desktop-en and mobile-ar');
  const f = featuredFor(testInfo.project.name, 3);
  const email = devEmail('s6b');
  // Both answers are simulated: nothing reaches the database.
  let answer: { status: number; body: unknown; headers?: Record<string, string> } = { status: 503, body: { error: 'unavailable' } };
  await page.route('**/api/requests', (route) =>
    route.fulfill({ status: answer.status, contentType: 'application/json', headers: answer.headers, body: JSON.stringify(answer.body) }),
  );
  await page.goto(`/mentor/${f.slug}/book`);
  await fillSessionForm(page, 'Dev B Outage', email);
  if (turnstile.enabled) await expect(tokenInput(page)).toHaveValue(/.+/, { timeout: 20_000 });
  const send = page.getByTestId('button-send-request');
  await send.click();
  const error = page.getByTestId('booking-error');
  await expect(error).toHaveAttribute('data-kind', 'service');
  await expect(error).toHaveText(tr(lang, 'bookingRequest.error.service'));
  await expect(error).not.toContainText(tr(lang, 'bookingRequest.error.generic'));
  await expect(send).not.toHaveAttribute('aria-disabled', 'true');
  await healthy({ screenshotName: 'S6b-service', allowStatus: [{ url: /\/api\/requests$/, status: 503 }] });

  answer = { status: 429, body: { error: 'rate_limited', retry_after_seconds: 6 }, headers: { 'Retry-After': '6' } };
  if (turnstile.enabled) await expect(tokenInput(page)).toHaveValue(/.+/, { timeout: 20_000 });
  await send.click();
  await expect(error).toHaveAttribute('data-kind', 'rateLimited');
  await expect(error).toHaveText(tr(lang, 'bookingRequest.error.rateLimitedSoon'));
  await expect(send).toHaveAttribute('aria-disabled', 'true');
  // A screen reader tabbing back to the dimmed Send hears why (R1-81), as in the dialog.
  await expect(send).toHaveAccessibleDescription(tr(lang, 'bookingRequest.error.rateLimitedSoon'));
  // After the Retry-After the person can try again without reloading.
  await expect(send).not.toHaveAttribute('aria-disabled', 'true', { timeout: 12_000 });
  await expect(send).not.toHaveAttribute('aria-describedby', /.+/);
  await healthy({ screenshotName: 'S6b-rate-limit-cooled', allowStatus: [{ url: /\/api\/requests$/, status: 429 }, { url: /\/api\/requests$/, status: 503 }] });
});

test('S8 a signed-in mentee requests through the RPC: no captcha, a row, then "already waiting" with no new row; a declined request gives the button back', async ({ page, context, db, healthy, lang, loginAs, personaProject }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'S8 runs on desktop-en and mobile-ar');
  const mentorId = ids(personaProject).mentor;
  const menteeId = ids(personaProject).menteeEmpty;
  const accountEmail = personaEmail(personaProject, 'mentee-empty');
  try {
    await loginAs('mentee-empty');
    await page.goto(`/mentor/${mentorId}`);
    // A second tab on the same profile, opened before the first send (a double submit). Its data
    // must have settled (no request yet) before the first tab sends: a tab whose bookings land
    // after the send rightly shows "Request sent" instead of the button (the old S8 flake).
    const second = await context.newPage();
    await useLanguage(second, lang);
    await second.goto(`/mentor/${mentorId}`);
    await second.waitForLoadState('networkidle');
    await expect(second.getByTestId('button-request-session').first()).toBeVisible();

    let apiPosts = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/requests')) apiPosts += 1;
    });
    await page.getByTestId('button-request-session').first().click();
    const dialog = page.getByTestId('dialog-booking-request');
    await expect(dialog.getByTestId('input-booking-email')).toHaveValue(accountEmail);
    await expect(dialog.getByTestId('input-booking-email')).toHaveAttribute('readonly', '');
    await expect(dialog.getByTestId('turnstile')).toHaveCount(0);
    // The mentees row supplies the name (read-only); the goal is the only thing to write.
    await expect(dialog.getByTestId('input-booking-name')).not.toHaveValue('');
    await dialog.getByTestId('textarea-booking-goal').fill(GOAL);
    const rpc = page.waitForResponse((r) => r.url().includes('/rest/v1/rpc/create_my_booking_request'));
    await dialog.getByTestId('button-submit-booking').click();
    expect((await rpc).status()).toBe(200);
    await expect(page.getByTestId('booking-success-title')).toHaveAttribute('data-outcome', 'sent');
    expect(apiPosts).toBe(0);
    await healthy({ screenshotName: 'S8-sent' });

    const rows = await db<{ id: string; status: string }[]>`
      select id, status from public.bookings where mentee_id = ${menteeId} and mentor_id = ${mentorId} and status = 'pending'`;
    expect(rows).toHaveLength(1);

    await second.getByTestId('button-request-session').first().click();
    const dialog2 = second.getByTestId('dialog-booking-request');
    await dialog2.getByTestId('textarea-booking-goal').fill(`${GOAL} (again)`);
    await dialog2.getByTestId('button-submit-booking').click();
    await expect(second.getByTestId('booking-success-title')).toHaveAttribute('data-outcome', 'already_pending');
    const after = await db`select 1 from public.bookings where mentee_id = ${menteeId} and mentor_id = ${mentorId} and status = 'pending'`;
    expect(after).toHaveLength(1);
    await second.close();

    // The mentor declines. This browser still remembers the send, but the mentee's bookings,
    // fetched after it, decide: the profile offers a new request instead of "Request sent".
    await db`update public.bookings set status = 'rejected', responded_at = timezone('utc', now()) where id = ${rows[0].id}`;
    await page.reload();
    await expect(page.getByTestId('button-request-session').first()).toBeVisible();
    await expect
      .poll(() => page.evaluate((id) => JSON.parse(window.localStorage.getItem('mc.sentRequests') ?? '{}')[id] ?? null, mentorId))
      .toBeNull();
    await healthy({ screenshotName: 'S8-declined-button-back' });
  } finally {
    const created = await db<{ id: string }[]>`select id from public.bookings where mentee_id = ${menteeId} and mentor_id = ${mentorId}`;
    for (const { id } of created) {
      await db`delete from public.notifications where booking_id = ${id}`;
      await db`delete from public.mentor_activity_log where booking_id = ${id}`;
      await db`delete from public.activity_events where subject_id = ${id}`;
      await db`delete from public.bookings where id = ${id}`;
    }
  }
});

test('S8c a signed-in mentor who requests another mentor still sees "Request sent" once their bookings are refetched', async ({ page, db, healthy, loginAs, personaProject }, testInfo) => {
  test.skip(!['desktop-en', 'mobile-ar'].includes(testInfo.project.name), 'S8c runs on desktop-en and mobile-ar');
  // mentor-linked's users.profile_id points at its own mentors row: the requests it sends live
  // under the mentees row that has its email, which is what the profile must read.
  const target = ids(personaProject).mentor;
  const requesterEmail = personaEmail(personaProject, 'mentor-linked');
  const cleanup = async () => {
    const rows = await db<{ id: string }[]>`
      select b.id from public.bookings b join public.mentees me on me.id = b.mentee_id
      where b.mentor_id = ${target} and lower(me.email) = ${requesterEmail}`;
    for (const { id } of rows) {
      await db`delete from public.notifications where booking_id = ${id}`;
      await db`delete from public.mentor_activity_log where booking_id = ${id}`;
      await db`delete from public.activity_events where subject_id = ${id}`;
      await db`delete from public.bookings where id = ${id}`;
    }
  };
  try {
    await loginAs('mentor-linked');
    await page.goto(`/mentor/${target}`);
    await page.getByTestId('button-request-session').first().click();
    const dialog = page.getByTestId('dialog-booking-request');
    await expect(dialog.getByTestId('input-booking-email')).toHaveValue(requesterEmail);
    await dialog.getByTestId('textarea-booking-goal').fill(GOAL);
    await dialog.getByTestId('button-submit-booking').click();
    await expect(page.getByTestId('booking-success-title')).toHaveAttribute('data-outcome', 'sent');
    const rows = await db`select 1 from public.bookings b join public.mentees me on me.id = b.mentee_id
                          where b.mentor_id = ${target} and lower(me.email) = ${requesterEmail} and b.status = 'pending'`;
    expect(rows).toHaveLength(1);

    // A fresh load reads the row itself: still "Request sent", no second request button.
    await page.reload();
    await expect(page.locator('[data-testid="booking-section"][data-state="sent"]').first()).toBeVisible();
    await expect(page.getByTestId('button-request-session')).toHaveCount(0);
    await healthy({ screenshotName: 'S8c-mentor-request-sent' });
  } finally {
    await cleanup();
  }
});

test('R1-08 signed out, a request never claims it was sent: an email with an account and a new one see the same "Request submitted", and only the new one reaches the mentor', async ({ page, db, healthy, lang, personaProject }) => {
  const mentorId = ids(personaProject).mentor;
  const mentorName = displayName(personaProject, 'mentor');
  const accountEmail = devEmail('r108-account');
  const newEmail = devEmail('r108-new');
  const dialog = page.getByTestId('dialog-booking-request');
  const cleanup = async () => {
    await purgeRequester(db, newEmail);
    await purgeRequester(db, accountEmail);
    await db`delete from public.notifications where recipient_email = ${accountEmail}`;
    await db`delete from public.users where email = ${accountEmail}`;
  };

  // Someone who has an account (a users row) but is not signed in on this browser.
  await db`insert into public.users (id, email, password, user_type, is_verified, created_at)
           values (gen_random_uuid()::text, ${accountEmail}, 'managed-by-supabase-auth', 'mentee', true, timezone('utc', now()))`;
  async function sendAs(email: string, name: string) {
    await page.goto(`/mentor/${mentorId}`);
    await page.getByTestId('button-request-session').first().click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('input-booking-name').fill(name);
    await dialog.getByTestId('input-booking-email').fill(email);
    await dialog.getByTestId('textarea-booking-goal').fill(GOAL);
    if (turnstile.enabled) await expect(dialog.locator('[data-testid="turnstile"] input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    const response = page.waitForResponse((r) => r.url().endsWith('/api/requests') && r.request().method() === 'POST');
    await dialog.getByTestId('button-submit-booking').click();
    const answer = await response;
    // One neutral answer for every outcome: the endpoint is no account oracle.
    expect(answer.status()).toBe(200);
    expect(await answer.json()).toEqual({ ok: true });
  }
  async function expectSubmitted(email: string) {
    await expect(dialog.getByTestId('booking-success-title')).toHaveText(tr(lang, 'bookingRequest.success.anonymousTitle'));
    const text = plain(await dialog.innerText());
    expect(text).toContain(tr(lang, 'bookingRequest.success.anonymous', { email, name: mentorName }));
    expect(text).toContain(tr(lang, 'dashboardV2.rail.submitted'));
    expect(text, 'nothing says the request was sent').not.toContain(tr(lang, 'dashboardV2.rail.sent'));
    expect(text).not.toContain(tr(lang, 'bookingRequest.success.title', { name: mentorName }));
  }

  try {
    // 1. An address with an account: no booking, no mentee row; the owner is told in their bell.
    await sendAs(accountEmail, 'Dev B Account');
    await expectSubmitted(accountEmail);
    await healthy({ screenshotName: 'R1-08-account-email-submitted' });
    expect(await requestRows(db, accountEmail)).toHaveLength(0);
    expect(await db`select 1 from public.mentees where lower(email) = ${accountEmail}`).toHaveLength(0);
    const bell = await db<{ title: string; booking_id: string | null }[]>`
      select title, booking_id from public.notifications where recipient_email = ${accountEmail}`;
    expect(bell).toEqual([{ title: 'Request not sent: please sign in', booking_id: null }]);

    // The profile and the directory card remember it as submitted, never as sent.
    await page.keyboard.press('Escape');
    const section = page.locator('[data-testid="booking-section"][data-state="sent"]').first();
    await expect(section).toContainText(tr(lang, 'bookingRequest.status.submitted'));
    await expect(section).toContainText(tr(lang, 'bookingRequest.status.anonHint', { name: mentorName }));
    await expect(section).not.toContainText(tr(lang, 'bookingRequest.status.sent'));
    await healthy({ screenshotName: 'R1-08-profile-submitted' });
    await page.goto(`/mentors?q=${encodeURIComponent(mentorName)}`);
    await expect(page.getByTestId(`badge-request-memory-${mentorId}`)).toHaveText(tr(lang, 'mentorCard.requestSubmitted'));
    await healthy({ screenshotName: 'R1-08-card-submitted' });

    // 2. A new address: the same words on screen, and this time the mentor has a pending request.
    await page.evaluate(() => window.localStorage.removeItem('mc.sentRequests'));
    await sendAs(newEmail, 'Dev B Newcomer');
    await expectSubmitted(newEmail);
    await healthy({ screenshotName: 'R1-08-new-email-submitted' });
    const rows = await requestRows(db, newEmail);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', mentor_id: mentorId, goal: GOAL });
  } finally {
    await cleanup();
  }
});

test('S21 demo mode: the curated /book page is the request form, never a Cal.com calendar; the request stays in this browser @demo-local', async ({ page, healthy }) => {
  await page.goto('/mentor/manav-gupta/book');
  await expect(page.getByTestId('form-session-request')).toBeVisible();
  await expect(page.locator('iframe[src*="cal.com"]')).toHaveCount(0);
  await expect(page.getByTestId('turnstile')).toHaveCount(0);
  await fillSessionForm(page, 'Demo Visitor', 'demo.visitor@example.com', 'I would like help preparing my first investor meetings.');
  await page.getByTestId('button-send-request').click();
  await expect(page.getByTestId('slot-confirmation')).toBeVisible();
  const local = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mentorconnect.local.bookings') || '[]') as Array<{ mentor_id: string; status: string }>);
  expect(local.some((b) => b.mentor_id === 'manav-gupta' && b.status === 'pending')).toBe(true);
  expect(page.frames().some((f) => /cal\.com/.test(f.url()))).toBe(false);
  await healthy({ screenshotName: 'S21-demo-book' });
});
