# MentorConnect — testing

1. [Automated tests](#automated-tests): unit, database integration, migration idempotency, browser E2E.
2. [Database apply order](#database-apply-order).
3. [Manual smoke-test checklist](#manual-smoke-test-checklist) (a)–(i), before and after a deploy.
4. [Cal.com live test](#calcom-live-test) — required before mentors are told to connect Cal.com.
5. [Removing test data](#removing-test-data).

---

## Automated tests

| Layer | Command | Needs | Proves |
| --- | --- | --- | --- |
| Unit | `npm test` | nothing (no network, no database) | request / webhook / Turnstile / reminder handlers with fakes, the SQL mirror check, the 77 SSO tests, client logic |
| Database integration | `bash scripts/db/test-integration.sh` (or `npm run test:integration` with the `SUPABASE_TEST_*` env set) | the local Supabase stack | SQL, RLS, grants, RPCs, triggers and the real handlers against real Postgres, PostgREST and GoTrue (suites I0–I19) |
| Migration idempotency | `bash scripts/db/verify-idempotency.sh` | the local Postgres | every SQL file re-runs as a no-op; `v2` alone and the whole chain run twice leave the catalog identical |
| Browser E2E | `npx playwright test` (or `--project=desktop-en e2e/specs/…`) | the local stack; Chromium (`npx playwright install chromium`) | every route × persona × EN/AR × desktop/mobile, flows through the UI to the database |

CI (`.github/workflows/ci.yml`) runs type-check, unit tests, i18n parity, the build and
`npm run check:entry-i18n` (the entry chunk bundles only the English namespaces its own
modules use, see `client/src/lib/i18n.ts`; the check fails naming any namespace an
entry-chunk module uses but the eager import leaves out) on every push, and the
integration suites plus the idempotency check on a fresh
`supabase start` (job `db-integration`). The E2E suite runs locally (it needs a browser and
internet for Turnstile); attach its report to the PR.

The unit suite runs in `Asia/Dubai` (`env.TZ` in `vitest.config.ts`), not the machine's zone.
Base-table timestamps are UTC wall-clock with no offset, and a client that reads one as local
time is only wrong away from UTC; `tests/timestamps.test.ts` fails on such a misread even on a
UTC CI runner. Parse stored timestamps with `client/src/lib/timestamps.ts` (the shared
formatters in `client/src/lib/format.ts` already do).

### The local stack

```bash
supabase start                          # uses supabase/config.toml (API 54321, DB 54322, Mailpit 54324)
bash scripts/db/reset-local.sh          # drizzle push → v2 → phase2 → 0002 → 0003 → 0004; refuses non-local hosts
source scripts/e2e/env.sh && npx tsx scripts/e2e/seed.ts   # E2E personas (Playwright also reseeds before each run)
```

`reset-local.sh --no-contract` stops after 0002 (the state production is in between the
migration and the deploy) and `--no-seed` skips 0004 (featured mentors static, "opening soon").
The integration suites never reset anything: row tests run in transactions that are rolled
back, migration tests build throwaway databases, and PostgREST tests create
`it.<random>@mentorconnect.test` rows and delete them. `SUPABASE_TEST_OFFLINE=1` skips the
suite that calls Cloudflare; `SUPABASE_TEST_CAPTCHA=on` (with `[auth.captcha]` enabled in
`supabase/config.toml` and the stack restarted) runs I17.

### Browser E2E

`playwright.config.ts` loads `scripts/e2e/env.sh`, starts the dev server on `E2E_PORT`
(default 5173 — the only port GoTrue accepts in e-mail links) with `MC_LOCAL_API=1`, starts the
mock Amazon IdP (`scripts/e2e/mock-idp.ts`, port 54399), and reseeds the personas of the
selected projects (`E2E_SKIP_SEED=1` skips that). Another `E2E_PORT` (e.g. 5174) gets its own
mock-IdP, preview and demo ports, so two checkouts can run Playwright side by side. Projects: `desktop-en`, `desktop-ar`,
`mobile-en`, `mobile-ar`, plus `prod-csp` (production build behind the `vercel.json`
headers, tests tagged `@prod-csp`) and `demo-local` / `demo-local-ar` (`VITE_LOCAL=1`, tests
tagged `@demo-local`). Specs import `test` from `e2e/fixtures/test.ts`: `loginAs(persona)`,
`healthy()` (the per-page checks), `cal` (Cal.com iframe stub), `db`, `mailpit`,
`signedCalPost`. Every `healthy()` visit also runs an axe scan (`@axe-core/playwright`): all
violations are attached to the test as `<screenshot>-axe.json`; only a critical one fails the
visit (pre-existing critical findings would be listed, with evidence, in
`PREEXISTING_CRITICAL` in `e2e/fixtures/health.ts`; there are none). `E2E_AXE=off` skips the
scan. Personas are `e2e.<project>.<persona>@mentorconnect.test` (password in
`e2e/fixtures/personas.ts`); `E2E_NS=<x>` namespaces them so two people can run the same
project against one stack. `e2e/specs/a-infra.spec.ts` checks the harness itself.

---

## Database apply order

On a new project or when repairing one, in the Supabase SQL editor, each file whole:

1. Tables: `npm run db:push` (drizzle, from `shared/schema.ts`). Never run `drizzle-kit generate` into `./migrations`.
2. `supabase_setup_v2.sql` — policies, helpers, triggers.
3. `supabase_phase2.sql` — favourites, activity feed, reminder and webhook bookkeeping.
4. `migrations/0002_production_readiness.sql` — EXPAND. Safe while the previous client is live.
5. Deploy the new client, smoke-test production.
6. `migrations/0003_restrict_legacy_writes.sql` — CONTRACT (removes the old client's write paths). Rollback: the block at the bottom of the file.
7. Optional: `migrations/0004_seed_featured_mentors.sql`, once the five featured mentors agree to be requestable.

`supabase_setup.sql` (v1) is superseded — do not run it. After any re-run of step 2 or 3,
re-run step 4 (and 6 if it had been applied); every file is idempotent.

---

## Manual smoke-test checklist

Run this against a **Vercel preview** before merging and again against **production** after
deploying. Every item lists the steps and the expected result; anything else is a blocker.
The automated gates above must be green first.

Base URL below is `https://mentor-amazon.vercel.app`; substitute the preview URL where noted.
"Fresh browser" means a private/incognito window with no localStorage and no Supabase session.

Test accounts you need: one **mentor** (password login, has a mentors row), a second mentor's id
(any `/mentor/:id` from the directory), one **mentee** (organisation type preferred), one **admin**
(`users.user_type = 'admin'`, see "Before merging" step 6).

---

## (a) Fresh-browser deep links render the SPA

The `vercel.json` rewrite sends every non-`/api/*` path to `index.html`; guards then decide.
A Vercel "404: NOT_FOUND" page on any of these is a deploy/rewrite regression.

| # | Steps | Expected |
| --- | --- | --- |
| a1 | Fresh browser → open `/mentor-portal/bookings` directly | App shell (navigation pill) renders, a brief skeleton with "Checking access…", then redirect to `/login?next=%2Fmentor-portal%2Fbookings`. Never a Vercel 404. |
| a2 | Fresh browser → `/login` | Login page: orange "Sign in with Amazon" (`link-amazon-sso`), "or" divider, collapsed "Use email and password" disclosure (`button-toggle-password-login`). |
| a3 | Fresh browser → `/analytics` | Skeleton, then redirect to `/login?next=%2Fanalytics`. |
| a4 | Fresh browser → `/admin` and `/admin/access` | Skeleton, then redirect to `/login?next=%2Fadmin` (resp. `%2Fadmin%2Faccess`). |
| a5 | Fresh browser → `/request-access?alias=jdoe` | "Request access" card (`card-request-access`) with alias `jdoe` and a **pending** badge; "Back to home" and "Sign in with Amazon again" links. No sign-in required. |
| a6 | Fresh browser → `/request-access` (no alias) | Same card with the generic copy (no alias line). |
| a7 | Fresh browser → `/auth/sso` (no fragment) | Error card (`card-sso-error`) "Sign-in could not be completed" with "Try again with Amazon" (`link-sso-retry`, href `/api/auth/login/amazon`) and "Use email and password" (`link-sso-use-password`, href `/login`). Not a blank page, not a 404. |
| a8 | Hard-reload (Cmd/Ctrl+Shift+R) on `/mentor/<id>` and `/mentee-dashboard/bookings` | Both render from a cold load (lazy chunk downloads, skeleton first). |
| a9 | Open DevTools → Network on `/` | `index-*.js` plus `vendor-react/-supabase/-motion/-i18n` are the only JS loaded; **no** `Analytics-*.js` and no `recharts` code until `/analytics` is visited. |

## (b) Mentor login lands on own portal; localStorage cannot switch identity

| # | Steps | Expected |
| --- | --- | --- |
| b1 | `/login` → expand password disclosure → sign in as mentor A (`button-login`) | Toast "Login successful", redirect to `/mentor-portal` (or `/mentor-onboarding` if A has no mentors row). Dashboard shows A's name, A's bookings, "Volunteer hours" and "This month" tiles. |
| b2 | Repeat b1 but start from `/login?next=%2Fmentor-portal%2Fsessions` | After login you land on `/mentor-portal/sessions`, not the dashboard home. |
| b3 | While signed in as A: DevTools → Application → localStorage → set `mentorId` to mentor B's id and `mentorEmail` to B's email → reload `/mentor-portal` | Portal still shows **A** (identity comes from the Supabase session, never from storage). A's bookings only; B's never appear. The storage values are re-synced to A's. |
| b4 | Signed in as A → open `/mentor/<B id>` | Public profile of B renders **without** email, assistant email, LinkedIn or Cal.com link (served by the `mentors_public` view). |
| b5 | Signed in as A → in DevTools console run `await (await fetch('<SUPABASE_URL>/rest/v1/mentors?select=email&id=eq.<B id>', {headers:{apikey:'<anon key>', Authorization:'Bearer '+JSON.parse(localStorage.getItem('sb-<ref>-auth-token')).access_token}})).json()` | `[]` (RLS: a mentor can read only their own full row). |
| b6 | Signed in as A → `/mentor-portal/profile` → change bio → save | Toast + persisted after reload; the mentors_public card on `/` reflects the change. |

## (c) Anonymous visitor cannot reach protected areas

| # | Steps | Expected |
| --- | --- | --- |
| c1 | Fresh browser → `/mentor-portal`, `/mentor-portal/requests`, `/mentor-dashboard` | Each redirects to `/login?next=…`; nothing from the portal renders (no booking rows in the DOM, check Elements). |
| c2 | Fresh browser → `/admin`, `/admin/mentees`, `/admin/bookings` | Redirect to `/login?next=…`. |
| c3 | Fresh browser → `/analytics` | Redirect to `/login?next=%2Fanalytics`. |
| c4 | Sign in as a **mentee** → open `/admin` | "No access" card (`card-access-denied`) explaining admins only, with "Go to your area" → `/mentee-dashboard`. No redirect loop, no admin data. |
| c5 | Sign in as a **mentor** → open `/admin` | Same "No access" card; "Go to your area" → `/mentor-portal`. |
| c6 | Sign in as a **mentee** → open `/mentor-portal` | "No access" card (mentors only). |
| c7 | Fresh browser → `/mentor-onboarding` | Redirect to `/login?next=%2Fmentor-onboarding`. Sign in as an approved mentor without a profile → the form renders with the email field read-only (session email). Sign in as an unapproved mentor → "not approved" card linking to `/request-access?alias=…`. |
| c8 | Fresh browser → `curl -s '<SUPABASE_URL>/rest/v1/mentors?select=email' -H 'apikey: <anon key>'` | HTTP 401/403 or `[]` — anon has no grant on `mentors`; `…/rest/v1/mentors_public?select=id,name` returns rows without an `email` column. |

## (d) SSO endpoints (production domain — Amazon only allows the registered redirect URI)

All checks use `curl -si … | grep -iE '^(HTTP|location|cache-control|set-cookie)'`.

| # | Steps | Expected |
| --- | --- | --- |
| d1 | `curl -si https://mentor-amazon.vercel.app/api/auth/callback/amazon` (no params, no cookie) | `HTTP/2 302`, `location: https://mentor-amazon.vercel.app/login?error=sso_state` (`&reason=no_cookie` appended only while `AMAZON_OIDC_DEBUG=true`). `cache-control: no-store`. **Not** 404, **not** 500. |
| d2 | `curl -si 'https://mentor-amazon.vercel.app/api/auth/callback/amazon?code=x&state=y'` | Same `302 → /login?error=sso_state`. |
| d3 | Open `/login?error=sso_state` in a browser | Red alert (`alert-sso-error`) "Your sign-in session expired or the link was already used…"; page otherwise usable. |
| d4 | `curl -si https://mentor-amazon.vercel.app/api/auth/login/amazon` | `302`, `location:` starts with the Amazon issuer's `authorization_endpoint` and contains `response_type=code`, `client_id=mentor-amazon.vercel.app`, `code_challenge_method=S256`, `state=`, `nonce=`, `redirect_uri=https%3A%2F%2Fmentor-amazon.vercel.app%2Fapi%2Fauth%2Fcallback%2Famazon`. `set-cookie: mc_oidc=…; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`. |
| d5 | `curl -si 'https://mentor-amazon.vercel.app/api/auth/login/amazon?returnTo=https://evil.example'` | Still 302 to Amazon; the cookie's returnTo is dropped (after login you land on `/`, never on evil.example). |
| d6 | Any env var unset on a preview (e.g. `AMAZON_OIDC_CLIENT_SECRET`) → `curl -si …/api/auth/login/amazon` | `500` JSON `{"error":"server_misconfigured","missing":["AMAZON_OIDC_CLIENT_SECRET"]}` — never a stack trace, never a secret. |
| d7 | `AMAZON_OIDC_DEBUG` unset or not exactly `true` → `curl -si https://mentor-amazon.vercel.app/api/auth/debug-claims` | `404` JSON `{"error":"not_found"}`. |
| d8 | `AMAZON_OIDC_DEBUG=true` (integ only) → complete one browser SSO round trip → `/api/auth/debug-claims` | JSON with the ID-token claims and `sub_equals_alias: true`. Turn the flag **off** afterwards and re-check d7. |
| d9 | `curl -si -X POST https://mentor-amazon.vercel.app/api/auth/logout` | `302 → https://mentor-amazon.vercel.app/login`, `set-cookie` clearing `mc_oidc` and `mc_oidc_debug`. |
| d10 | Browser: `/login` → "Sign in with Amazon" with an alias that has never signed in | `/auth/sso` spinner card (`card-sso-working`), then `/mentor-onboarding` (no profile yet). An `approved_users` row (role mentor, approved by `amazon-sso`) appears in `/admin/access`; the account email is the token's email or `<alias>@amazon.com`. The address bar never keeps `#token_hash=…` (fragment is stripped). Browser back does not re-run the exchange. |
| d11 | Admin deactivates that alias in `/admin/access` → it signs in with Amazon again | `/request-access?alias=<alias>&status=rejected` ("Not approved" card). No Supabase session is created (`/mentor-portal` still redirects to login). Reactivate it before d12. |
| d12 | Same alias signs in a third time | Straight to the portal (existing users row is reused; no duplicate users/auth rows in Supabase → Authentication → Users). |

## (e) Booking lifecycle, feedback both ways, notifications

Use a mentee (org type) and a mentor whose profile has a Cal.com link.

| # | Steps | Expected |
| --- | --- | --- |
| e1 | Mentee: `/mentors` → open a mentor card (`link-mentor-<id>`) → "Request a session" (`button-request-session`) → fill the goal (≥ 20 characters) → "Send request" | The dialog itself becomes the success state (`[data-testid=booking-success]`: the title reads "Request sent to <name>", the rail shows stop 1 done; no toast fires) and the profile's request card becomes the anchored "Request sent" block with stop 1 done. Anonymous visitors get one "Sign in" button (`/login?next=%2Fmentee-dashboard%2Fbookings`) plus a "Back to mentors" link and an inline "Create one" account link in the success state, never a redirect before the request; both `/login?next=…` and `/signup?next=…` open with the email field prefilled with the address the request was sent from (editable). Escape after success closes the dialog. Signed in, `/mentee-dashboard` lists the request under "Waiting for a reply" as **Awaiting mentor**. Mentor: reload any page → the bell (`button-notification-bell`) shows +1 with a "new booking request" notification (the bell refreshes on reload/navigation, it does not poll). |
| e2 | Mentee (org, pending verification): dashboard header | Org name with the amber "Verification pending" badge and the "Verification in review" banner; browsing/requesting still works. |
| e3 | Mentor: `/mentor-portal/requests` | The request row shows the mentee name, the org name and an amber "Verification pending" badge with the muted "not verified yet" note. |
| e4 | Mentor: click **Accept** | Row highlights, turns green with an "Accepted" pill for ~2.5 s, then leaves the pending list; toast fires. |
| e5 | Mentee: reload `/mentee-dashboard` | Green "request has been accepted" card; the booking shows **Schedule now**. Clicking it opens the Cal.com dialog (`dialog-cal-embed`) with the mentor's calendar (iframe loads from app.cal.com — CSP must allow it, see (h)). Close button works. |
| e6 | Mentee: reload → bell | "Booking accepted" notification present; mark read → unread count drops immediately. |
| e7 | Mentor: `/mentor-portal/sessions` → **Mark complete** on the accepted session → dialog (`dialog-complete-session`) → choose 45 min → confirm (`button-confirm-complete`) | Toast "…45 minutes"; the card moves to the Completed tab, is scrolled into view and rings for 2 s, shows "45 min". Dashboard "Volunteer hours" tile increases by 0.8. |
| e8 | Mentee: `/mentee-dashboard/bookings` → **Give feedback** on the completed session (`button-give-feedback-<id>`) → rate → submit (`button-submit-feedback`) | Dialog closes, toast, the rated card scrolls into view and rings orange for ~2 s and now shows the rating; mentor (after reload) sees a "feedback received" notification; mentor's average rating on `/` updates (trigger-recomputed). Same dialog on `/my-bookings`. |
| e8b | Mentee: in the Cal.com dialog (e5) actually book a slot | On Cal.com's success screen the app toasts "Session confirmed" and, after closing, the booking shows as **confirmed** with the slot time (recorded by `record_cal_booking_from_embed`; the webhook, when connected, reaches the same state and reports `no_change`). With "Requires confirmation" on the Cal.com event the booking waits as "Waiting for <mentor> to confirm the time" instead. If Cal.com is blocked, the mentor can still complete the *accepted* session from `/mentor-portal/sessions`. |
| e9 | Mentor: `/mentor-portal/feedback` → leave feedback for the mentee | Toast; mentee (after reload) sees a "feedback received" notification and the mentor's feedback on their dashboard. |
| e10 | Mentor: Decline a second request | Row turns muted red with "Declined" pill; mentee (after reload) sees **rejected** and a notification. |
| e11 | Repeat e1 six times quickly with the same mentee email | The 6th request fails with the inline `booking-error` alert (`role="alert"`, `data-kind="rateLimited"`): "You've reached the limit of requests for now. Try again in an hour." Input is preserved (DB trigger: 5 per mentee per hour). |

## (f) EN/AR toggle and RTL at 375 / 768 / 1440 px

Toggle with the text button in the header (`button-language-toggle`; it reads "عربي" in English and "English" in Arabic). For each page below, in **both** languages and at each of the three widths (DevTools device toolbar): no horizontal scrollbar, no clipped text, icons sit on the correct side (they flip in RTL), tabs stay uniform width, nothing glued to the viewport edge, `<html dir="rtl" lang="ar">` in Arabic.

| # | Page | Extra checks |
| --- | --- | --- |
| f1 | `/` (landing) and `/mentors` (directory + filters) | Hero search submit is the only orange fill above the fold; on `/mentors` the filter rail sits at the inline-start on ≥ 1024 and the "Filters (n)" drawer opens on phones; example chips scroll on one line with a peek; cards keep their status badge on the trailing edge. `button-book-<id>` is the label span inside the single `link-mentor-<id>` anchor. |
| f2 | `/login` (incl. `?error=sso_state`) | SSO CTA, divider, collapsible form; icons inside inputs sit at the start edge. |
| f3 | `/auth/sso` (error state) and `/request-access?alias=x` | Cards centred; buttons wrap on 375. |
| f4 | `/mentee-registration` (individual **and** organisation) | Verification section + amber note; after an org submit the "Verification in review" card is at the top and focused. |
| f5 | `/mentee-dashboard` (org mentee) | Badge + banner; Schedule-now dialog opens and closes at 375. |
| f6 | `/mentor-onboarding` (approved mentor, no profile) | Read-only email; gate cards (not approved / mentors only). |
| f7 | `/mentor-portal` (Inbox tab; `/mentor-portal/requests` is an alias), `/mentor-portal/sessions` (complete dialog) | No sidebar: `PageHeader` + tab row (icon + ≤ 2 words) that is sticky under the header on phones; the two tiles reflow to one column at 375; verification badges; duration presets. |
| f8 | `/analytics` (admin sees "Programme analytics"; mentors/mentees see "Your sessions") | Tabs are RTL-aware (DirectionProvider), horizontal bar charts mirror (value axis grows toward the inline-end), the weekly trend never mirrors, legends are text lists, "View as table" exposes exact values, CSV export popover opens (admin). |
| f9 | `/admin`, `/admin/mentees`, `/admin/bookings`, `/admin/access` | Stat strip, tables scroll horizontally *inside* the table only, detail Sheets open from the trailing side, dialogs usable at 375. |
| f10 | Reload any page while in Arabic | Language persists (localStorage `language`), direction applied before first paint (no LTR flash). |

## (g) Analytics shows real data only

| # | Steps | Expected |
| --- | --- | --- |
| g1 | Sign in as a mentor or an admin and open `/analytics` | Only real bookings: no demo banner, no page-view, traffic-source or device panels; top mentors are the mentors with the most real requests; sessions without a recorded duration are counted as "not recorded" rather than guessed. A mentee gets the "No access" card. |
| g2 | Admin: `/analytics/report` | The impact report renders; a mentor gets "No access". |
| g3 | Click any bar, bar segment, legend chip or ranked-table name (there are no pie/donut charts) | "Showing: <segment> · Clear" chip and a details table appear under the chart; Clear restores. |

## (h) Security headers

```bash
curl -sI https://mentor-amazon.vercel.app/ | grep -iE '^(content-security-policy|x-content-type-options|referrer-policy|permissions-policy|strict-transport-security):'
curl -si -X POST https://mentor-amazon.vercel.app/api/auth/logout | grep -iE '^(cache-control|content-security-policy):'
```

| # | Expected |
| --- | --- |
| h1 | `content-security-policy` present with `default-src 'self'`, `frame-src` including `https://app.cal.com` and `https://*.cal.com`, `connect-src` including `https://*.supabase.co` and `wss://*.supabase.co`, `object-src 'none'`, `frame-ancestors 'self' https://*.amazon.com`. |
| h2 | `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=(), payment=()`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`. |
| h3 | Every `/api/*` response carries `cache-control: no-store`. |
| h4 | Browser console on `/`, `/login`, `/mentee-dashboard` (with the Cal dialog open) and `/analytics` shows **no** CSP violation reports. |
| h5 | View-source of `index.html` and search the JS chunks: no `SUPABASE_SERVICE_ROLE_KEY`, no `AMAZON_OIDC_CLIENT_SECRET`, no `TURNSTILE_SECRET_KEY` (only `VITE_`-prefixed values are ever inlined). |

## (i) Booking requests, Turnstile and Cal.com sync

| # | Steps | Expected |
| --- | --- | --- |
| i1 | Fresh browser → a featured mentor's `/mentor/<slug>/book` → submit the form | The Turnstile widget is shown (when the keys are set); "Request sent" only after the server answered; the request is in `/admin/bookings` under "Programme-managed" and every admin's bell has it. No Cal.com calendar is embedded on this page. |
| i2 | `curl -si -X POST <origin>/api/requests -H 'content-type: application/json' -d '{"mentorId":"<uuid>","name":"x","email":"x@example.com","goal":"at least twenty characters here"}'` with Turnstile configured | `403 {"error":"captcha_failed"}` (no token); nothing is written. |
| i3 | Signed-in mentee → request a session from a mentor profile | No captcha; the account's own e-mail is used (read-only); a second request while one is pending says it is already pending. |
| i4 | Mentor → Profile settings → "Cal.com booking sync" | Subscriber URL with `?mentor=<id>`, masked secret with Show/Copy, the numbered Cal.com steps, Rotate (warns the old secret works for 24 h). |
| i5 | In Cal.com add the webhook (see `api/README.md`), click **Ping test** | The panel shows "Ping · just now" within 15 s. |
| i6 | `curl -si -X POST '<origin>/api/webhooks/cal?mentor=<id>' -H 'x-cal-signature-256: no-secret-provided' -d '{}'` | `401 {"error":"invalid_signature"}`. |
| i7 | Cron: `curl -si <origin>/api/cron/reminders -H "Authorization: Bearer $CRON_SECRET"` | `200 {"ok":true,"reminders":n,"emails":n,"failures":0}`; without the header `401`. |
| i8 | Local only, with Cloudflare's failing test keys: start the dev server with `VITE_TURNSTILE_SITE_KEY=2x00000000000000000000AB` (the widget always fails), then separately with the passing site key and `TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA` (the server always refuses), and submit a featured `/book` form each time | Always-failing widget: the widget shows "Verification failed" and Send says "Complete the security check to send your request." without any POST. Always-refusing secret: the POST answers `403 captcha_failed` and the form says "The security check didn't pass. Try it again, then send." No booking row either way. |

---

## Before merging the PR — order of operations

Do these in order; each step assumes the previous one is done.

1. **CI green** on the PR: `build` (tsc, unit tests, i18n parity, build) and `db-integration` (integration suites and the idempotency check on a fresh local stack). The build uses placeholder Supabase values, so a green build does not prove the runtime config.
2. **Supabase — database** (SQL editor, as the project owner), following [Database apply order](#database-apply-order): run the read-only checks from the PR first, then `migrations/0002_production_readiness.sql` (one transaction; a failed pre-check names the rows to fix and applies nothing), then its verification queries. `0002` creates the `uploads` bucket (public, 5 MB, images). `0003` runs only **after** the deploy in step 8.
3. **Supabase — Auth settings**: Authentication → Providers → Email enabled (the SSO bridge issues magic links via `generateLink`); Authentication → URL configuration → Site URL `https://mentor-amazon.vercel.app`. Confirm signups are allowed (the bridge creates auth users for approved aliases).
4. **Vercel — environment variables** (Settings → Environment Variables, tick **Production and Preview**):
   - Client (inlined at build time): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optional `VITE_PROGRAMME_CONTACT_EMAIL` (mailto shown to rejected organisations).
   - Server only (never `VITE_`): `AMAZON_OIDC_ISSUER`, `AMAZON_OIDC_CLIENT_ID` (`mentor-amazon.vercel.app`), `AMAZON_OIDC_CLIENT_SECRET`, `AMAZON_OIDC_REDIRECT_URI` (`https://mentor-amazon.vercel.app/api/auth/callback/amazon`, exact), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN` (`https://mentor-amazon.vercel.app`), `CRON_SECRET` (also as a GitHub Actions secret). Optional: `AMAZON_OIDC_SCOPES` (default `openid`), `AMAZON_OIDC_DEBUG` (`true` on integ only), `TURNSTILE_SECRET_KEY` + `VITE_TURNSTILE_SITE_KEY` (both or neither), `TURNSTILE_ALLOWED_HOSTNAMES`, `CAL_WEBHOOK_SECRET` (programme Cal.com Team/Org webhook only), `RESEND_API_KEY`, `VITE_PUBLIC_APP_ORIGIN`. Never set `VITE_ALLOW_LOCAL_FALLBACK` in Production.
   - Redeploy after adding variables (they are read at build/cold start).
5. **Amazon Federate registration** (see `api/README.md` → "Federate registration"): redirect URI above, client id, request `sub=amazonAlias`. Until Amazon confirms, only password login is testable; SSO checks in (d) need the production domain.
6. **Bootstrap the first admin** (nobody can self-promote): the admin signs in **once** — via Amazon (lands on `/mentor-onboarding` as a mentor) or with email/password signup — then in the SQL editor edit the two values in section 8 (`v_email`, `v_alias`) of `supabase_setup_v2.sql` and run that `DO` block alone. Sign in again → `/admin`. Put the placeholder back so re-running the whole file stays a no-op.
7. **Run the preview smoke test**: sections (a)–(c), (e)–(h) on the preview URL; (d) on production after step 5.
8. **Merge and deploy production**, then re-run (a), (d) d1/d4/d7/d9, (g), (h) and (i) against `https://mentor-amazon.vercel.app`. Then run `migrations/0003_restrict_legacy_writes.sql` and repeat e1 and i1.
9. **Approve mentors**: `/admin/access` → "Add alias" (or Mentors tab → "Approve access") for each Amazon mentor; they sign in with Amazon and complete `/mentor-onboarding`.
10. **Debug off**: once the ID-token claims are confirmed via `/api/auth/debug-claims`, remove `AMAZON_OIDC_DEBUG` and redeploy; re-run d7.

---

## Cal.com live test

Required before mentors are told to connect Cal.com (design §6.6); it needs a real (free)
Cal.com test account and a public URL: production, an unprotected preview (Vercel Deployment
Protection answers Cal.com with 401), or a tunnel (e.g. `cloudflared`) to the dev server
running with `MC_LOCAL_API=1`.

1. Point a webhook at `…/api/webhooks/cal?mentor=<test mentor id>` with that mentor's secret
   (Profile settings → Cal.com booking sync). Leave "Custom payload template" empty.
2. **Ping test** → the panel shows "Ping".
3. Book through our embed ("Choose a time") and capture the payload: `metadata.mc_booking` is
   present, `organizer.username` equals the username in the mentor's `cal_link`, `status` is
   `ACCEPTED`; the booking is confirmed once (the embed and the webhook agree: one
   `booking_confirmed` activity row).
4. Turn on **Requires confirmation** on the event type: capture BOOKING_REQUESTED (`PENDING`,
   the booking waits), accept it in Cal.com (BOOKING_CREATED → confirmed), and reject another
   (BOOKING_REJECTED → the mentee is asked to choose another time).
5. Reschedule from the attendee e-mail and record whether a BOOKING_CANCELLED for the old uid
   is also sent and in which order (the handler revives a session cancelled by Cal.com within
   7 days either way). Also reschedule through our `reschedule/<uid>` embed.
6. Cancel from the Cal.com dashboard → the booking is canceled by `cal`, both parties notified.
7. An unsigned POST gets `401`; re-sending a captured body answers `duplicate`.
8. Save the payloads (secrets and e-mails redacted) under `tests/fixtures/cal/` and adjust the
   transition table in `migrations/0002` §11 and its tests if Cal.com behaves differently.

---

## Removing test data

Testers' rows on a real project, in delete order (SQL editor as the owner). Replace the
condition with the testers' addresses, e.g. `lower(email) like '%@example.test'`. It covers
every foreign key into `mentors`, `mentees`, `bookings` and `users` (checked against the
catalog); run it in one transaction (`begin; … commit;`) so a surprise leaves nothing half-done:

```sql
-- the people and their rows
create temp table t_mentors as select id from public.mentors where lower(email) like '%@example.test';
create temp table t_mentees as select id from public.mentees where lower(email) like '%@example.test';
create temp table t_bookings as select id from public.bookings
  where mentor_id in (select id from t_mentors) or mentee_id in (select id from t_mentees);

delete from public.activity_events where subject_id in (select id from t_bookings)
  or visible_to && array(select id::text from t_mentors union all select id::text from t_mentees);
delete from public.booking_reminders where booking_id in (select id from t_bookings);
delete from public.mentee_favorites where mentee_id in (select id from t_mentees) or mentor_id in (select id from t_mentors);
delete from public.mentor_cal_webhooks where mentor_id in (select id from t_mentors);
delete from public.notifications where booking_id in (select id from t_bookings) or lower(recipient_email) like '%@example.test';
delete from public.booking_notes where booking_id in (select id from t_bookings);
delete from public.mentor_tasks where booking_id in (select id from t_bookings) or mentor_id in (select id from t_mentors)
  or mentee_id in (select id from t_mentees);
delete from public.mentor_earnings where booking_id in (select id from t_bookings) or mentor_id in (select id from t_mentors);
delete from public.mentor_activity_log where booking_id in (select id from t_bookings) or mentor_id in (select id from t_mentors)
  or mentee_id in (select id from t_mentees);
delete from public.mentor_availability where mentor_id in (select id from t_mentors);
delete from public.bookings where id in (select id from t_bookings);
update public.approved_users set mentor_id = null where mentor_id in (select id from t_mentors);
update public.users set profile_id = null where profile_id in (select id from t_mentors union all select id from t_mentees);
delete from public.mentors where id in (select id from t_mentors);
delete from public.mentees where id in (select id from t_mentees);
delete from public.user_identifiers where user_id in (select id from public.users where lower(email) like '%@example.test');
delete from public.users where lower(email) like '%@example.test';
delete from public.approved_users where lower(email) like '%@example.test';
```

Then delete the auth users in Dashboard → Authentication → Users (and their photos in
Storage → uploads). The `cal_webhook_events` log keeps only ids, triggers and outcomes; it can
be left or trimmed by `received_at`.
