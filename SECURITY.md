# MentorConnect security overview

Factual description of what the application stores, who can reach it, and how
that is enforced. Written for the Amazon security/privacy review of the UAE
mentorship programme. Database setup, in order: `supabase_setup_v2.sql`,
`supabase_phase2.sql`, `migrations/0002_production_readiness.sql`, and — once the
current client is deployed — `migrations/0003_restrict_legacy_writes.sql`
(`migrations/0004_seed_featured_mentors.sql` is optional). This document
describes the state after 0003.

## 1. Architecture in one paragraph

Static React SPA (Vite) on Vercel + two kinds of server code: Vercel
serverless functions under `api/` (Amazon Federate OIDC bridge, anonymous
booking requests, the Cal.com webhook, the reminder cron) and Postgres
functions inside Supabase. The browser talks to Supabase directly with the
**anon key**; **row level security (RLS) is the security boundary**, not the
client. `server-legacy/` is dead code and is never deployed.

## 2. Data inventory

| Table | Personal data | Who writes it | Who can read it |
|---|---|---|---|
| `mentors` | name, work email, LinkedIn URL, Cal.com links, assistant email, bio, photo, country, timezone | the mentor (own row), admin | owner, admin. **Public directory** reads only the `mentors_public` view (no email / LinkedIn / Cal.com / assistant / why_joined). |
| `mentees` | name, email, organisation details, verification reference, bio, LinkedIn, photo, goals | the mentee; the request RPCs (name + email only) | owner, admin, mentors who have a booking with that mentee |
| `bookings` | goal text, ratings, free-text feedback, session duration, country, Cal.com booking uid and time | created only by the request RPCs (`/api/requests` for anonymous visitors, `create_my_booking_request` when signed in); status changes by the parties; Cal.com columns only by Cal sync | the two parties, admin |
| `mentee_favorites` | which mentors a mentee saved | the mentee | the mentee, admin |
| `activity_events` | who did what to a booking or profile (names, statuses, times) | a database trigger for every booking change; users only into their own feed | the people listed in `visible_to`, admin |
| `booking_reminders` | booking id, reminder kind, channels | reminder cron (service role) | service role only |
| `cal_webhook_events` | delivery log: mentor id, trigger, Cal.com booking uid, outcome, payload SHA-256 (no payload) | webhook (service role) | service role only |
| `mentor_cal_webhooks` | per-mentor webhook secret, previous secret (24 h grace), last-delivery status | `get_my_cal_webhook` / `rotate_cal_webhook_secret` | the secret: **only the owning mentor**, through `get_my_cal_webhook`; admins see status via `cal_webhook_status` (never a secret); the webhook verifies with the service role. No table grants to anon or authenticated |
| `booking_notes` | free text between the parties | parties | parties, admin |
| `notifications` | recipient email + generated text | database only (`notify_booking_event`) | recipient, admin |
| `users` | email, role, Amazon alias, placeholder password (Supabase Auth holds the real credential) | Supabase signup (mentee), SSO callback (service role), admin | self, admin |
| `approved_users` | Amazon alias, email, role | admin | admin, the person it names |
| `access_requests` | Amazon alias, email, name | SSO callback (service role) | admin |
| `user_identifiers` | alias, email, non-secret OIDC claims | SSO callback (service role) | self, admin |
| `mentor_activity_log`, `mentor_tasks`, `mentor_availability` | operational, low sensitivity | mentor / database | mentor, admin (availability is public) |
| `mentor_earnings` | not used by this deployment | admin-only RPC | mentor, admin |
| Storage bucket `uploads` | profile photos (≤ 5 MB; JPEG, PNG, WebP, GIF) | signed-in users | public (URLs are unguessable UUID paths) |

The five featured mentors (`migrations/0004`, optional) are programme-managed
rows (`managed_by_programme = true`) with placeholder addresses under the
reserved `.invalid` domain: nobody can sign in as them and nothing is sent to
them. Requests to them notify every admin, who answers them in `/admin/bookings`.

Hosting region: Supabase project region **to be confirmed** by the programme
owner (recommended: `eu-central-1` or the closest region approved for UAE
personal data). Vercel functions run in the default region; the static site is
on Vercel's CDN.

## 3. Identity model

* **Mentors and admins** sign in with Amazon Federate (OIDC, authorization
  code + PKCE, confidential client). `api/auth/callback/amazon` verifies the
  `id_token` with the issuer's JWKS, reads `amazonAlias` (`sub`), and only
  then bridges into a Supabase session (`generateLink` magic-link token sent
  in the URL fragment, never in a query string or log).
* **Open access for Amazon employees**: Amazon restricts who can complete
  Federate sign-in for this app with an internal group on their side (their
  identity team's recommendation); anyone who gets through gets a session.
  Federate's `error=access_denied` is shown as `sso_denied`. On an alias's first sign-in the callback writes an
  active `approved_users` row with role `mentor`; that row is what mentor
  onboarding and the `mentors` INSERT policy check. An admin revokes an alias
  by setting `is_active = false` (the callback then refuses it and sends it to
  `/request-access?status=rejected`) and grants admin by setting `role`.
* **Roles**: `users.user_type` is `mentor`, `mentee` or `admin` and is the
  authoritative role (auth metadata is a fallback for legacy accounts). It can
  only be changed by an admin or the service role (database trigger).
* **Mentees** self-register with email/password through Supabase Auth; a
  mentee can never self-select another role, and an SSO login never promotes
  a self-registered mentee row or binds to a previously used auth user with
  the same email (see `api/README.md` → Account rules). **Email confirmation
  must stay enabled** in Supabase Auth so a squatted address is never a
  usable account.
* Booking status transitions are role-bound in the database: only the mentor
  accepts/rejects/completes; a mentee can cancel. A session is confirmed and
  its time and Cal.com uid are written only by Cal.com sync (the webhook, or
  the mentee's embed through `record_cal_booking_from_embed`), never by a
  direct client update. Each side writes only its own rating, and only once
  the session is completed; ratings on `mentors` are derived and cannot be
  typed in. Nobody can request a session with themselves, and a booking whose
  caller owns both sides (a legacy row) can only be canceled, never completed
  or rated. The embed's uid and start come from the browser: the RPC takes
  them only from the booking's mentee, for a start between an hour ago and a
  year ahead, and only provisionally. The signed webhook is the authority: it
  corrects a uid, start or status the browser recorded for the same booking,
  records the uid it verified (`bookings.cal_verified_uid`, never writable by
  a client), and the embed can no longer change a verified booking.
* Ownership everywhere is `lower(email) = lower(auth.jwt()->>'email')`;
  `localStorage` is never an identity source.

## 4. RLS model

`public.is_admin()` = the `users` row for `auth.uid()` has `user_type = 'admin'`.
"Party" = owning mentor or owning mentee of the booking. Anonymous = anon key,
no session.

| Table | anon | authenticated (non-party) | party / owner | admin |
|---|---|---|---|---|
| `mentors` | none (grant revoked); `mentors_public` view only | `mentors_public` only | SELECT/UPDATE own; INSERT own email if allow-listed | all |
| `mentees` | none (privileges revoked) | INSERT own email only | SELECT/UPDATE own; mentors with a booking: SELECT | all; verification columns admin-only |
| `bookings` | none (privileges revoked; `/api/requests` → service-role RPC) | none (no INSERT privilege; `create_my_booking_request`) | SELECT/UPDATE; parties, duration/country, scheduling columns, ratings before completion are guarded | all |
| `mentee_favorites` | none | none | ALL own rows | all |
| `activity_events` | none | INSERT only as themselves, visible only to themselves | SELECT rows listing them | all |
| `booking_reminders`, `cal_webhook_events`, `mentor_cal_webhooks`, `schema_migrations`, `mc_settings` | none | none | none (RPCs only) | via RPCs |
| `booking_notes` | none | none | SELECT/INSERT; UPDATE/DELETE own notes | all |
| `notifications` | RPC only | RPC only | SELECT/UPDATE own; **no INSERT policy** | SELECT all |
| `mentor_tasks`, `mentor_availability` | availability: SELECT | availability: SELECT | ALL own | all |
| `mentor_activity_log` | none | none | SELECT own; INSERT via `log_mentor_activity` | all |
| `mentor_earnings` | none | none | SELECT own; INSERT via admin RPC | all |
| `users` | none | SELECT/UPDATE own; INSERT own (mentee) | — | all; `user_type`/`amazon_alias` admin-only |
| `approved_users` | none | SELECT own row | — | all |
| `access_requests` | none (service role inserts) | none | — | SELECT/UPDATE/DELETE |
| `user_identifiers` | none | SELECT own | — | SELECT |

Notable mechanics:

* `mentors_public` and `mentor_scheduling_links` are owner-privilege views
  (`security_invoker = false`, Postgres 15+). The first exposes directory
  columns only (plus `managed_by_programme`, which the directory needs); the
  second returns Cal.com links only for the caller's own
  accepted/confirmed/completed bookings. Both are **SELECT-only** for every
  API role: `mentors_public` is a single-table view, so it is auto-updatable
  and would otherwise let anyone edit or delete any mentor past RLS through
  the write privileges Supabase's default privileges grant (0002 revokes them).
* Notifications are created by `notify_booking_event(booking_id, event)`
  (signed-in parties and the service role; not anon), the request RPCs, the
  Cal.com sync RPC and the reminder cron. Recipients and text are derived from
  the booking; the event must match the booking's real state; duplicates
  within 5 minutes collapse.
* Requests: `create_booking_request` is executable only by the service role
  (`/api/requests`, after Turnstile and an IP limit); `create_my_booking_request`
  only by signed-in users and always under their own JWT email. Both validate,
  dedupe a pending request and rate-limit in the database.
* Every new `SECURITY DEFINER` function pins `search_path = public, pg_temp`
  and has EXECUTE revoked from `PUBLIC`, `anon` and `authenticated` before
  narrow grants (the full matrix is asserted by the integration suite).
* `mc.internal_write`, the flag trusted RPCs set for their own writes, cannot be
  set through PostgREST (`set_config` is not exposed).
* Mentor ratings are recomputed by a trigger (a mentee cannot update `mentors`).
* `INSERT … RETURNING` is subject to SELECT policies, so anonymous inserts do
  not ask for the row back; the client generates ids.

## 5. Secrets

| Secret | Where | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server env only | bypasses RLS; used only by `api/` (SSO bridge, requests, Cal webhook, reminders) |
| `AMAZON_OIDC_CLIENT_SECRET` | Vercel server env only | also derives the HMAC key for the `mc_oidc` state cookie |
| `TURNSTILE_SECRET_KEY` | Vercel server env only | verifies Turnstile tokens; with the site key set and this missing, `/api/requests` refuses (fail closed) |
| Per-mentor Cal.com webhook secrets | `mentor_cal_webhooks` (database) | 32 random bytes; readable only by the owning mentor through an RPC; rotation keeps the old one valid for 24 h |
| `CAL_WEBHOOK_SECRET` | Vercel server env only, optional | only for a programme Cal.com Team/Org webhook; ≥ 16 characters |
| `CRON_SECRET` | Vercel + GitHub Actions secret | bearer token of the reminder cron (constant-time check) |
| `RESEND_API_KEY` | Vercel server env only, optional | reminder e-mails |
| `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_TURNSTILE_SITE_KEY` | client bundle | public by design; grant nothing beyond RLS |
| Cal.com | no API keys stored | mentors paste their public booking slug |

Nothing prefixed `VITE_` may hold a secret. `.env*` files are git-ignored;
`.env.example` documents names only.

## 6. Transport, headers, CSP

`vercel.json` sets HSTS (2 years, preload), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
`Permissions-Policy`, `Cache-Control: no-store` for `/api/*`, and a CSP that
allows scripts only from self and Cal.com, connections only to Supabase and
Cal.com, frames only from Cal.com, and `frame-ancestors 'self'
https://*.amazon.com`. `style-src 'unsafe-inline'` remains for Tailwind/shadcn
runtime styles (known, low impact).

## 7. Rate limiting and abuse controls

* Anonymous requests: Cloudflare **Turnstile** verified server-side in
  `/api/requests` (token required whenever `TURNSTILE_SECRET_KEY` is set;
  Cloudflare unreachable → refused), plus an IP limit of 10 requests per 10
  minutes. Supabase Auth captcha (sign-up, password sign-in, reset) is switched
  on in the dashboard only after the client that sends the token is live.
* In the database (request RPCs and triggers): max 5 booking requests per
  mentee per hour, 20 per mentor per hour, 3 mentee profile creations per email
  per day, one pending request per mentor and mentee. They raise `rate_limited`.
* Bookings are created only `pending`, for an available mentor; `created_at`
  is stamped server-side so windows cannot be dodged.
* Cal.com webhook: requests with a malformed signature header or mentor id are
  refused before any database call; 600 deliveries a minute per IP, and 30
  failed signatures a minute per IP before `429`.
* Supabase's own API rate limits and Vercel's edge protection apply in front.

## 8. Logging

* Production client paths never log personal data. Data-layer warnings carry
  only booking ids and event names; auth errors log provider messages, not
  credentials.
* The SSO callback logs step names and error codes, never tokens or claims.
  `AMAZON_OIDC_DEBUG=true` exposes claims via `/api/auth/debug-claims` and is
  for the integration environment only.
* Supabase keeps Postgres and API logs per its retention; no application log
  aggregation is configured.

## 9. Retention and deletion

No automatic retention job exists yet. To delete a person on request (run as
`postgres` in the SQL editor; replace the email):

```sql
-- Mentee (replace the email; every statement scopes by it so they can run one by one)
DELETE FROM public.booking_notes WHERE booking_id IN
  (SELECT b.id FROM public.bookings b JOIN public.mentees m ON m.id = b.mentee_id WHERE lower(m.email) = lower('person@example.com'));
DELETE FROM public.notifications WHERE lower(recipient_email) = lower('person@example.com') OR booking_id IN
  (SELECT b.id FROM public.bookings b JOIN public.mentees m ON m.id = b.mentee_id WHERE lower(m.email) = lower('person@example.com'));
DELETE FROM public.mentor_activity_log WHERE mentee_id IN (SELECT id FROM public.mentees WHERE lower(email) = lower('person@example.com'));
DELETE FROM public.mentor_tasks WHERE mentee_id IN (SELECT id FROM public.mentees WHERE lower(email) = lower('person@example.com'));
DELETE FROM public.bookings WHERE mentee_id IN (SELECT id FROM public.mentees WHERE lower(email) = lower('person@example.com'));
DELETE FROM public.mentees WHERE lower(email) = lower('person@example.com');

-- Mentor: bookings are kept, anonymised, for programme statistics (delete them too if the request requires it)
UPDATE public.mentors SET name = 'Former mentor', name_ar = NULL, email = concat('deleted+', id, '@invalid'), linkedin_url = NULL,
  cal_link = '', cal_15min = NULL, cal_30min = NULL, cal_60min = NULL, assistant_email = NULL, photo_url = NULL,
  bio = '', bio_ar = NULL, why_joined = NULL, is_available = false
WHERE lower(email) = lower('person@example.com');
DELETE FROM public.notifications WHERE lower(recipient_email) = lower('person@example.com');

-- Account rows (either role)
DELETE FROM public.user_identifiers WHERE user_id IN (SELECT id FROM public.users WHERE lower(email) = lower('person@example.com'));
DELETE FROM public.approved_users WHERE lower(email) = lower('person@example.com');
DELETE FROM public.access_requests WHERE lower(email) = lower('person@example.com');
DELETE FROM public.users WHERE lower(email) = lower('person@example.com');
-- Then delete the auth user in Dashboard → Authentication, and the photo in Storage → uploads.
```

## 10. Third-party processors

| Processor | Purpose | Data |
|---|---|---|
| Supabase | database, auth, storage | everything in section 2 |
| Vercel | hosting, serverless functions | request logs, OIDC exchange (transient) |
| Amazon Federate | mentor/admin identity | alias, email, name (claims) |
| Cal.com | scheduling (embedded) | whatever the mentee enters on Cal.com; the app stores only the event URI and time |
| Google Fonts, Fontshare | web fonts | requester IP (font CDN logs) |

## 11. Known gaps

1. Booking notifications are in-app only (reminders can also e-mail through
   Resend when configured). Notification text generated in the database is
   English.
2. Cal.com is an external dependency for scheduling; the app learns about
   Cal.com bookings only through the signed webhook and the embed, and Cal.com
   does not retry a failed delivery.
3. Anonymous booking requests accept any email address, so a visitor can file
   a request *on behalf of* an address (they cannot read anything back).
   Bounded by Turnstile, the IP and database limits and the pending-request
   dedupe; requiring a session for requests would close it at the cost of the
   anonymous flow the programme asked for.
4. Mentee surfaces (`/mentee-dashboard`, `/my-bookings`, `/mentee-registration`)
   now require a session and use the session email; the old typed-email
   access is gone.
5. No admin-note column for verification decisions (`verification_reference`
   is the mentee-supplied value).
6. `style-src 'unsafe-inline'` in the CSP.
7. Storage bucket is public-read; photos are not access-controlled beyond URL
   secrecy.
8. An Amazon SSO account with mailbox access can still obtain a password
   recovery session from Supabase; the reset page refuses it and signs it
   out, but the server-side hook that would stop the session being issued is
   a follow-up.

## 12. Pre-review checklist

- [ ] `supabase_setup_v2.sql`, `supabase_phase2.sql`, `migrations/0002` and
      (after the deploy) `migrations/0003` applied; the verification queries
      at the bottom of each file pass (anon cannot read `mentors` or
      `bookings`; policies present on every table).
- [ ] First admin promoted (section 8 of the script) and can open `/admin`.
- [ ] Supabase: email confirmation on, anon signups limited to mentees,
      `uploads` bucket exists, project region confirmed and recorded above.
- [ ] Vercel: all `AMAZON_OIDC_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `APP_ORIGIN`, `CRON_SECRET` set for Production and Preview;
      `VITE_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` both set (or both
      unset); `AMAZON_OIDC_DEBUG` and `VITE_ALLOW_LOCAL_FALLBACK` unset.
- [ ] Redirect URI registered with Amazon exactly as
      `https://mentor-amazon.vercel.app/api/auth/callback/amazon`.
- [ ] Security headers verified on the live origin (`curl -I`).
- [ ] Deletion procedure (section 9) rehearsed on a test account.
- [ ] Dependency audit (`npm audit --omit=dev`) reviewed.
