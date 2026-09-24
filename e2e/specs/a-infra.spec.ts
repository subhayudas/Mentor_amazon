import { test, expect, e2eEnv, mailpit, signedCalPost } from '../fixtures/test';
import { ids, personaEmail } from '../fixtures/personas';
import { pingEvent } from '../../tests/helpers/cal';

/**
 * The E2E harness itself (Track A): personas, the dev server's local API, the Cal.com
 * stub, the mock IdP, Mailpit, and a browser Amazon sign-in through the real handlers.
 * These do not depend on any page's markup, so they stay green on every track's branch.
 */

test('a seeded persona signs in and the session is where supabase-js reads it', async ({ page, loginAs }) => {
  const session = await loginAs('mentor');
  expect(session.user.email).toContain('.mentor@mentorconnect.test');
  await page.goto('/legal');
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), e2eEnv.authStorageKey);
  expect(stored, 'session injected').toContain(session.access_token);
});

test('the dev server runs /api/requests (validation answers 400 with a field list)', async ({ request, clientIp }) => {
  const res = await request.post('/api/requests', {
    data: JSON.stringify({ mentorId: 'not-a-uuid' }),
    headers: { 'content-type': 'application/json', 'x-e2e-client-ip': clientIp },
  });
  expect(res.status()).toBe(400);
  const body = (await res.json()) as { error: string; fields: string[] };
  expect(body.error).toBe('invalid_request');
  expect(body.fields).toEqual(expect.arrayContaining(['mentorId', 'email', 'goal']));
});

test('the dev server runs /api/webhooks/cal (unsigned → 401, signed PING → 200 on the mentor webhook)', async ({ request, db, personaProject, clientIp }) => {
  const mentorId = ids(personaProject).mentor;
  const unsigned = await request.post(`/api/webhooks/cal?mentor=${mentorId}`, {
    data: JSON.stringify(pingEvent()),
    headers: { 'content-type': 'application/json', 'x-e2e-client-ip': clientIp },
  });
  expect(unsigned.status()).toBe(401);

  await db`insert into public.mentor_cal_webhooks (mentor_id) values (${mentorId}) on conflict (mentor_id) do nothing`;
  const [{ secret }] = await db<{ secret: string }[]>`select secret from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
  const ping = await signedCalPost(request, { mentorId, secret, body: pingEvent(), ip: clientIp });
  expect(ping.status()).toBe(200);
  expect(await ping.json()).toMatchObject({ ok: true, outcome: 'ping' });
  const [row] = await db<{ last_outcome: string; last_trigger: string }[]>`
    select last_outcome, last_trigger from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
  expect(row).toEqual({ last_outcome: 'ping', last_trigger: 'PING' });
});

test('the Cal.com stub opens in the embed and its events reach the page', async ({ page, cal, baseURL }) => {
  await page.route(`${baseURL}/__cal-harness`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><div id="cal" style="height:600px"></div><script>
        (function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document;
          C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments;
            if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; }
            if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || [];
              if (typeof namespace === "string") { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ["initNamespace", namespace]); }
              else p(cal, ar); return; }
            p(cal, ar); };
        })(window, "https://app.cal.com/embed/embed.js", "init");
        window.__events = [];
        Cal("init", "harness", { origin: "https://app.cal.com" });
        Cal.ns.harness("inline", { elementOrSelector: "#cal", calLink: "e2e-harness/30min",
          config: { name: "E2E", email: "e2e@mentorconnect.test", "metadata[mc_booking]": "abc-123" } });
        Cal.ns.harness("on", { action: "bookingSuccessfulV2", callback: (e) => window.__events.push(e.detail) });
      </script></body></html>`,
    }),
  );
  await page.goto('/__cal-harness');
  const frame = await cal.frame();
  const opened = new URL(frame.url());
  expect(opened.pathname).toContain('/e2e-harness/30min');
  expect(opened.searchParams.get('metadata[mc_booking]')).toBe('abc-123');
  expect(opened.searchParams.get('email')).toBe('e2e@mentorconnect.test');

  await cal.post('bookingSuccessfulV2', { uid: 'harnessuid1', startTime: '2026-10-01T10:00:00.000Z', status: 'ACCEPTED' });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __events: Array<{ data: { uid: string } }> }).__events.length)).toBe(1);
  const detail = await page.evaluate(() => (window as unknown as { __events: Array<{ data: unknown }> }).__events[0]);
  expect(detail).toMatchObject({ data: { uid: 'harnessuid1', status: 'ACCEPTED' } });
});

test('the mock IdP and Mailpit are reachable', async ({ request }) => {
  const discovery = await request.get(`${process.env.AMAZON_OIDC_ISSUER}/.well-known/openid-configuration`);
  expect(discovery.status()).toBe(200);
  expect((await discovery.json()).issuer).toBe(process.env.AMAZON_OIDC_ISSUER);
  const info = await request.get(`${e2eEnv.mailpitUrl}/api/v1/info`);
  expect(info.status()).toBe(200);
  expect(await mailpit.latest(personaEmail('none', 'mentee'))).toBeNull();
});

test('Amazon sign-in through the dev server ends in a Supabase session (AM3)', async ({ page, request, db, personaProject }) => {
  const alias = `e2e-infra-${personaProject}`.replace(/[^a-z0-9-]/g, '');
  const setSubject = await request.post(`${e2eEnv.mockIdpControl}/subject`, { data: { sub: alias } });
  expect(setSubject.ok()).toBe(true);
  try {
    await page.goto('/api/auth/login/amazon?returnTo=/legal');
    // A first Amazon sign-in has no mentor profile yet, so the bridge sends it to onboarding.
    await expect(page).toHaveURL((u) => u.pathname === '/mentor-onboarding', { timeout: 20_000 });
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), e2eEnv.authStorageKey);
    expect(stored, 'Supabase session stored by the /auth/sso bridge').toContain(`${alias}@amazon.com`);
    const [user] = await db<{ user_type: string; amazon_alias: string }[]>`
      select user_type, amazon_alias from public.users where amazon_alias = ${alias}`;
    expect(user).toEqual({ user_type: 'mentor', amazon_alias: alias });
  } finally {
    await request.post(`${e2eEnv.mockIdpControl}/reset`);
    const rows = await db<{ id: string }[]>`select id from public.users where amazon_alias = ${alias}`;
    await db`delete from public.user_identifiers where subject = ${alias}`;
    await db`delete from public.users where amazon_alias = ${alias}`;
    await db`delete from public.approved_users where amazon_alias = ${alias}`;
    for (const r of rows) await db`delete from auth.users where id = ${r.id}::uuid`;
  }
});
