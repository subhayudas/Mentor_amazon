# MentorConnect — smoke-test checklist

Run this against a **Vercel preview** before merging and again against **production** after
deploying. Every item lists the steps and the expected result; anything else is a blocker.
Automated gates (`npm run check`, `npm run check:i18n`, `npm run build`) run in CI on every push
and pull request (`.github/workflows/ci.yml`) and must be green first.

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
| d10 | Browser: `/login` → "Sign in with Amazon" with an alias **not** on the allow-list | Amazon login → `/request-access?alias=<alias>` with pending badge; an `access_requests` row appears in `/admin/access`. No Supabase session is created (`/mentor-portal` still redirects to login). |
| d11 | Admin approves that alias (role mentor) in `/admin/access` → the mentor signs in with Amazon again | `/auth/sso` spinner card (`card-sso-working`), then `/mentor-onboarding` (no profile yet) or `/mentor-portal`. The address bar never keeps `#token_hash=…` (fragment is stripped). Browser back does not re-run the exchange. |
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
| e8b | Mentee: in the Cal.com dialog (e5) actually book a slot | On Cal.com's success screen the app toasts "Session confirmed" and, after closing, the booking shows as **confirmed** with the slot time (no webhook involved). If Cal.com is blocked, the mentor can still complete the *accepted* session from `/mentor-portal/sessions`. |
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

## (g) Analytics demo banner

| # | Steps | Expected |
| --- | --- | --- |
| g1 | On a project with **fewer than 5** bookings, sign in and open `/analytics` | Amber "demo data" banner (`banner-demo-data`) at the top naming the real count and the threshold (5), plus a "Demo" badge (`badge-demo-data`) in the header; charts show the seeded demo rows; CSV downloads are prefixed `DEMO-` and start with a `# DEMO DATA` row. |
| g2 | Same page after 5 or more real bookings exist | Banner and badge gone; KPIs, Countries, Mentors and Bookings tabs show the real rows; "Volunteer hours" equals sum(completed minutes)/60. |
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
| h5 | View-source of `index.html` and search the JS chunks: no `SUPABASE_SERVICE_ROLE_KEY`, no `AMAZON_OIDC_CLIENT_SECRET` (only `VITE_`-prefixed values are ever inlined). |

---

## Before merging the PR — order of operations

Do these in order; each step assumes the previous one is done.

1. **CI green** on the PR: `npm run check` (tsc), `npm run check:i18n` (EN/AR parity + every `t('…')` key defined), `npm run build`. The build uses placeholder Supabase values, so a green build does not prove the runtime config.
2. **Supabase — run the schema/RLS script once** (SQL editor, as the project owner): paste `supabase_setup_v2.sql` and run it. It is idempotent (safe to re-run) and prints only NOTICEs. Then run the checks in its section 9 ("VERIFICATION QUERIES"): `mentors_public` has no `email` column, RLS is enabled on all 13 tables, the `mentees_guard_verification` trigger fires `BEFORE INSERT OR UPDATE`. Make sure the `uploads` storage bucket exists (Storage → New bucket, public read).
3. **Supabase — Auth settings**: Authentication → Providers → Email enabled (the SSO bridge issues magic links via `generateLink`); Authentication → URL configuration → Site URL `https://mentor-amazon.vercel.app`. Confirm signups are allowed (the bridge creates auth users for approved aliases).
4. **Vercel — environment variables** (Settings → Environment Variables, tick **Production and Preview**):
   - Client (inlined at build time): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optional `VITE_PROGRAMME_CONTACT_EMAIL` (mailto shown to rejected organisations).
   - Server only (never `VITE_`): `AMAZON_OIDC_ISSUER`, `AMAZON_OIDC_CLIENT_ID` (`mentor-amazon.vercel.app`), `AMAZON_OIDC_CLIENT_SECRET`, `AMAZON_OIDC_REDIRECT_URI` (`https://mentor-amazon.vercel.app/api/auth/callback/amazon`, exact), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN` (`https://mentor-amazon.vercel.app`). Optional: `AMAZON_OIDC_SCOPES` (default `openid profile email`), `AMAZON_OIDC_DEBUG` (`true` on integ only).
   - Redeploy after adding variables (they are read at build/cold start).
5. **Amazon Federate registration** (see `api/README.md` → "What to send Amazon's identity team"): redirect URI above, client id, request `sub=amazonAlias`. Until Amazon confirms, only password login is testable; SSO checks in (d) need the production domain.
6. **Bootstrap the first admin** (nobody can self-promote): the admin signs in **once** — via Amazon (lands on `/request-access`, creating an `access_requests` row) or with email/password signup — then in the SQL editor edit the two values in section 8 (`v_email`, `v_alias`) of `supabase_setup_v2.sql` and run that `DO` block alone. Sign in again → `/admin`. Put the placeholder back so re-running the whole file stays a no-op.
7. **Run the preview smoke test**: sections (a)–(c), (e)–(h) on the preview URL; (d) on production after step 5.
8. **Merge and deploy production**, then re-run (a), (d) d1/d4/d7/d9, (g) and (h) against `https://mentor-amazon.vercel.app`.
9. **Approve mentors**: `/admin/access` → "Add alias" (or Mentors tab → "Approve access") for each Amazon mentor; they sign in with Amazon and complete `/mentor-onboarding`.
10. **Debug off**: once the ID-token claims are confirmed via `/api/auth/debug-claims`, remove `AMAZON_OIDC_DEBUG` and redeploy; re-run d7.
