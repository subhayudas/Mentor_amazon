# `api/` — Vercel serverless functions

Node runtime, TypeScript, one file per route. Everything here runs server-side
with secrets that must **never** be prefixed `VITE_` or imported from `client/`.

| Route | File | Purpose |
| --- | --- | --- |
| `GET /api/auth/login/amazon` | `auth/login/amazon.ts` | Start Amazon Federate sign-in (OIDC code + PKCE) |
| `GET /api/auth/callback/amazon` | `auth/callback/amazon.ts` | Registered redirect URI — token exchange, role lookup, Supabase bridge |
| `POST /api/auth/logout` | `auth/logout.ts` | Clear `mc_oidc*` cookies, 302 to `/login` |
| `GET /api/auth/debug-claims` | `auth/debug-claims.ts` | Integ-only: show the claims from the last sign-in (404 unless `AMAZON_OIDC_DEBUG=true`) |
| `POST /api/requests` | `requests.ts` | Anonymous mentorship request: validation, IP limit, Cloudflare Turnstile (server-side), then the `create_booking_request` RPC. Signed-in visitors use the `create_my_booking_request` RPC instead |
| `POST /api/webhooks/cal?mentor=<id>` | `webhooks/cal.ts` | Cal.com booking webhooks — per-mentor secret (or the optional global one), HMAC-SHA256 over the raw body, one transactional `cal_apply_event` per event. Never creates a booking |
| `GET /api/cron/reminders` | `cron/reminders.ts` | Hourly (GitHub Actions `reminders.yml`, bearer `CRON_SECRET`): 24h and 1h reminders for **confirmed** sessions as in-app notifications (+ email via Resend when configured), each claimed once |

Shared helpers live in `_lib/` (the leading underscore keeps Vercel from
exposing them as routes): `env.ts` (Zod-validated variables), `http.ts`,
`cookies.ts`, `oidc.ts`, `supabaseAdmin.ts`, `ratelimit.ts` (per-IP fixed
window; Upstash Redis when configured, in-memory per instance otherwise),
`turnstile.ts` (siteverify), `calWebhook.ts` and `reminders.ts` (pure logic,
unit-tested). Relative imports use the `.js` suffix on purpose — the
project is `"type": "module"` and Vercel emits each `.ts` as an ES module, so
Node needs the full filename at runtime.

Dependencies used: `jose` (JWT verification), `@supabase/supabase-js`
(service-role client), Node `crypto`, global `fetch`. Nothing else.

---

## Sign-in flow

```
Browser                    Vercel function                       Amazon Federate            Supabase
  |                              |                                     |                       |
  |-- GET /api/auth/login/amazon |                                     |                       |
  |                              |-- GET {issuer}/.well-known/openid-configuration (cached 10 min)
  |                              |<-- authorization_endpoint, token_endpoint, jwks_uri, userinfo_endpoint
  |                              |  make PKCE verifier/challenge, state, nonce
  |<-- 302 authorization_endpoint?response_type=code&client_id&redirect_uri&scope&state&nonce&code_challenge(S256)
  |    Set-Cookie: mc_oidc=v1.<payload>.<hmac>  (HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600)
  |                              |                                     |                       |
  |-- Amazon login (Midway) ---------------------------------------->|                       |
  |<-- 302 https://mentor-amazon.vercel.app/api/auth/callback/amazon?code=...&state=...      |
  |                              |                                     |                       |
  |-- GET /api/auth/callback/amazon (cookie mc_oidc)                  |                       |
  |                              |  verify cookie HMAC, state, age     |                       |
  |                              |-- POST token_endpoint (code, code_verifier, redirect_uri)   |
  |                              |   client_secret_basic → retry client_secret_post on 401/invalid_client
  |                              |<-- id_token (+ access_token)        |                       |
  |                              |  jose.jwtVerify(id_token, JWKS): iss, aud=client_id, exp (60 s tolerance), nonce
  |                              |  alias = claims.amazonAlias ?? claims.sub                   |
  |                              |  (userinfo_endpoint only if email/name missing)             |
  |                              |  email = token/userinfo email ?? approved_users.email ?? <alias>@amazon.com
  |                              |-- approved_users where amazon_alias = alias ----------------->|
  |                              |   is_active = false → 302 /request-access?alias=<alias>&status=rejected
  |                              |   not found → insert approved_users(role mentor, approved_by 'amazon-sso')
  |                              |   then      → users row by alias, else by email, else auth.admin.createUser + insert users
  |                              |               upsert user_identifiers (provider 'amazon', claims minus tokens)
  |                              |-- auth.admin.generateLink({ type: 'magiclink', email }) ---->|
  |                              |<-- properties.hashed_token                                   |
  |<-- 302 /auth/sso#token_hash=<hashed_token>&type=magiclink&next=/path   (cookie mc_oidc cleared)
  |                              |                                     |                       |
  |  SPA /auth/sso: supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) ---------------->|
  |  auth.getCurrentUser() → syncRoleStorage → queryClient.clear() → route by role              |
```

Redirect outcomes from the callback (always 302, never a stack trace):

| Situation | Redirect |
| --- | --- |
| cookie missing / state mismatch / cookie older than 10 min | `/login?error=sso_state` |
| token endpoint rejected the code | `/login?error=sso_token` |
| Federate refused the user (`error=access_denied`: not in the Amazon group allowed on the profile) | `/login?error=sso_denied` |
| alias deactivated by an admin (`approved_users.is_active = false`) | `/request-access?alias=<alias>&status=rejected` |
| any other Amazon employee | `/auth/sso#token_hash=…&type=magiclink&next=<returnTo>` |
| anything else (discovery, ID-token, any other provider `error=`, DB) | `/login?error=sso_failed` |

When `AMAZON_OIDC_DEBUG=true`, error redirects carry `&reason=<code>`
(e.g. `token_invalid_grant`, `id_token_nonce`, `alias_conflict`, `alias_invalid`).
Never enable this in production.

Any missing SSO env var → `500 {"error":"server_misconfigured","missing":[...]}`.
(The request, webhook and cron routes answer `503 {"error":"unavailable"}`
instead and name nothing; the missing names go to the function log.)
Logs contain only `[sso] <event> alias=<alias> outcome=<code>` — never tokens,
codes or secrets.

### Cookies

| Name | Set by | Contents | Lifetime |
| --- | --- | --- | --- |
| `mc_oidc` | login | `{state, nonce, code_verifier, returnTo, iat}` HMAC-SHA256 signed with an HKDF key derived from `AMAZON_OIDC_CLIENT_SECRET` | 600 s, cleared by callback |
| `mc_oidc_debug` | callback (debug only) | signed ID-token claims + userinfo (token strings stripped) | 900 s, cleared by logout |

All cookies: `HttpOnly; Secure; SameSite=Lax; Path=/api/auth`.

### Account rules

- **Open access:** every Amazon employee who completes Federate sign-in gets
  in. `approved_users` is a role list, not a gate: an alias with no row is
  written there on its first sign-in as an active `mentor`
  (`approved_by = 'amazon-sso'`), which is also what the onboarding page and the
  `mentors` INSERT policy (`is_approved_mentor()`) check. An admin makes someone
  an admin by setting `role = 'admin'` (before their first sign-in, or together
  with `users.user_type`), and revokes someone by setting `is_active = false`.
- `approved_users.role` decides the account type on first login (`mentor` or `admin`).
- The alias must look like an alias (`^[a-z0-9][a-z0-9._-]{0,63}$` after
  lowercasing); anything else in `sub` is refused (`alias_invalid`) rather than
  turned into an email.
- `users` row is written with `id = auth user id`, `password = 'managed-by-amazon-sso'`,
  `is_verified = true`, `amazon_alias = alias`, `profile_id = approved.mentor_id`
  or the `mentors` row with the same email (else `null` → mentor completes onboarding).
- An existing `users` row found **by alias** is reused. A row found only **by
  email** (no alias yet) is linked only when its `user_type` already equals
  the approved role — i.e. an admin-provisioned mentor/admin row. A
  self-registered `mentee` row is never promoted by SSO (`email_conflict`):
  anyone could sign up with a colleague's corporate address ahead of time.
  When a legacy row is linked its auth password is rotated so a credential set
  before the link stops working.
- If no `users` row exists but an auth user already owns the email, the bridge
  binds to it only when that auth user was never confirmed and never signed in
  (an orphan pre-registration): it is deleted and re-created. Anything that has
  been used is somebody's account → `auth_user_conflict`; an admin merges by hand.
- If the email is already bound to a *different* alias the login is refused
  (`sso_failed`, reason `alias_conflict`).
- The bridge URL carries a `bind` nonce that must match the `mc_sso_bind`
  cookie set by the callback, so the one-time token only works in the browser
  that completed the Amazon round trip.
- Email: the ID token's (or userinfo's) email if present, else
  `approved_users.email`, else `<alias>@amazon.com`. Federate's discovery
  document lists no email claim, so the last fallback is the normal case.

---

## Booking requests — `POST /api/requests`

The only way an anonymous visitor creates a request (the `bookings` table
accepts no inserts from the browser once `migrations/0003` has run).

Request: `Content-Type: application/json`, body ≤ 16 KiB:

```json
{ "mentorId": "<uuid>", "name": "1..120", "email": "≤ 254", "goal": "20..1000 (trimmed)", "turnstileToken": "optional, ≤ 2048" }
```

Checks, in order:

| Step | Failure |
| --- | --- |
| method is POST | `405` |
| size, then `Content-Type` | `413 payload_too_large`, `415 unsupported_media_type` |
| body shape (Zod) | `400 {"error":"invalid_request","fields":["email",…]}` |
| IP limit: 10 per 10 minutes | `429 {"error":"rate_limited"}` + `Retry-After` |
| Turnstile, when `TURNSTILE_SECRET_KEY` is set: token verified with Cloudflare (`remoteip` sent; `TURNSTILE_ALLOWED_HOSTNAMES` enforced when set) | `403 {"error":"captcha_failed"}`; Cloudflare unreachable → `503 {"error":"captcha_unavailable"}` (fail closed) |
| `VITE_TURNSTILE_SITE_KEY` set but the secret missing | `503 {"error":"unavailable"}` (logged: the widget would be shown but nothing verified) |
| Production (`VERCEL_ENV=production`) with neither key set | `503 {"error":"captcha_unavailable"}`, logged, unless `TURNSTILE_DISABLED=1` (then the request goes through without a captcha and a warning is logged for each one) |
| server env | `503 {"error":"unavailable"}` |
| `create_booking_request` (service role): validates again, dedupes a pending request, limits 5 per requester and 20 per mentor per hour, notifies the mentor (every admin for a programme-managed mentor) | `22023` → `400 invalid_request` with the field · `mentor_unavailable` → `422` · `P0001` → `429 rate_limited` · function missing (migration not applied) → `503` · anything else → `500 server_error` |

Success is always `200 {"ok":true}` — the same answer whether the request was
created or one was already pending, so the endpoint cannot be used to learn
whether someone has an open request. A request under the mentor's own address
(or an identity an admin linked to that mentor) is refused by the RPC
(`42501 not_allowed`, detail `self_request`, nothing written) but also answers
`200`: a distinct status would reveal which address belongs to which mentor.
Signed-in callers of `create_my_booking_request` get the `not_allowed` error.

With neither Turnstile key set there is no captcha check on a local machine, in
development or on a Preview deployment; only the IP and database limits apply.
Production never runs that way by accident: with `VERCEL_ENV=production` and no
keys, every anonymous request is refused (`503 captcha_unavailable`, and the
function log says which variables to set). Set both keys for Production. The only
way to run Production without a captcha is the explicit `TURNSTILE_DISABLED=1`,
which is logged on every request it lets through and has no effect while
`TURNSTILE_SECRET_KEY` is set.

---

## Cal.com webhooks — `POST /api/webhooks/cal`

Each mentor connects their own Cal.com account from **Profile settings → Cal.com
booking sync** (dashboard or mentor portal). The panel shows:

- **Subscriber URL:** `https://mentor-amazon.vercel.app/api/webhooks/cal?mentor=<their mentor id>`
- **Secret:** 64 hex characters, readable only by that mentor
  (`get_my_cal_webhook`). **Rotate** creates a new one; the previous secret keeps
  verifying for 24 hours so Cal.com can be updated calmly. Admins can rotate a
  leaked secret but never read one.

In Cal.com: **Settings → Developer → Webhooks → New**, paste the URL and the
secret, tick **Booking Created, Booking Rescheduled, Booking Cancelled, Booking
Requested and Booking Rejected**, and **leave "Custom payload template" empty**
(the handler reads Cal.com's standard payload). Save, then **Ping test**: the
panel shows "Ping · just now".

A programme Cal.com Team/Org webhook can use the URL **without** `?mentor=` and
the optional global secret `CAL_WEBHOOK_SECRET` (at least 16 characters;
`openssl rand -hex 32`). Unset means that path is off.

Handling, in order: `405` for anything but POST → `413` over 256 KiB → a
malformed `?mentor=` or `x-cal-signature-256` header is `401` without touching
the database → `503` without server env → HMAC-SHA256 of the raw
body against the mentor's secret (and the previous one within its grace), or
the global secret → the same `401 {"error":"invalid_signature"}` for an unknown
mentor, a missing secret, `no-secret-provided` or a wrong secret (30 failures a
minute from one IP → `429`) → `400` for invalid JSON → `200` with the outcome.

Only deliveries that fail the signature check are rate-limited. Cal.com sends
every mentor's webhooks from the same few egress IPs and never retries, so a
limit counted before the check would let anyone with a Cal.com account (a
webhook aimed at any mentor id, with a wrong secret) get real deliveries
refused. A delivery whose signature verifies is never answered `429`.

Every booking event is applied by the `cal_apply_event` RPC in one
transaction: the delivery is recorded first (a replay answers `duplicate`),
the booking is matched **exactly** (Cal uid, the reschedule uid, the
`metadata.mc_booking` our embed sends — only when the attendee's email and the
mentor agree — then a unique attendee e-mail), the Cal organizer must be the
mentor's Cal.com username, the transition table decides the change, reminders
are reset when the time moves, and both parties get a neutral notification.
A booking made directly on Cal.com is **recorded, never created**
(`unmatched_direct_booking`).

Outcomes (shown in the mentor's panel; the last one is kept per mentor):

| Working | Needs attention |
| --- | --- |
| `ping`, `confirmed`, `requested`, `rejected`, `canceled`, `cal_booking_released`, `rescheduled`, `reschedule_requested`, `rescheduled_revived`, `no_change`, `duplicate` | `unmatched`, `unmatched_direct_booking`, `ambiguous`, `organizer_mismatch`, `stale_state`, `ignored`, `unrecognised_payload`, `invalid_payload` |

Cal.com does not retry a failed delivery, so a `5xx` (for example a database
outage) loses that event; the mentee's embed confirmation
(`record_cal_booking_from_embed`) is the second path for confirmations. Its uid
and start come from the browser, so the RPC accepts only the booking's own
mentee, a well-formed uid no other booking holds, and a start between one hour
ago and 366 days ahead (`22023 invalid_state` otherwise).

The signed webhook is the authority, whichever arrives first. Each applied
delivery stores the uid it vouched for in `bookings.cal_verified_uid`:

- **Embed first:** what the browser recorded is provisional. A delivery for the
  same booking (the uid, or `metadata.mc_booking` with the mentee among the
  attendees, which our embed always sends) replaces a wrong uid or start with
  Cal.com's (`rescheduled` with a "Session moved" notice when the time differs),
  and turns a browser-claimed confirmation back into a requested time when
  Cal.com says the event awaits the mentor (`requested`).
- **Webhook first:** once `cal_verified_uid = cal_event_uri`, the embed changes
  nothing. A report of the same booking, or a reschedule of it, answers
  `already_recorded` (the reschedule arrives as `BOOKING_RESCHEDULED`); any other
  uid is `22023 invalid_state`.

A uid the booking moved away from (a reschedule, a correction, a rejected or released
time) is kept in `booking_cal_superseded_uids`. A late delivery about it answers
`stale_state` and changes nothing, and the embed cannot record it again.

Clients can never write `cal_verified_uid` (booking guard) or the superseded list (no grants).
The cost of this rule: once Cal.com has verified a booking, a reschedule made through the
embed is recorded only when its `BOOKING_RESCHEDULED` delivery arrives. If that delivery is
lost (Cal.com does not retry a `5xx`) or the mentor has removed the webhook, the app keeps the
old time, while Cal.com's own e-mails and calendar invites carry the new one.

---

## Reminder cron — `GET /api/cron/reminders`

Called hourly by `.github/workflows/reminders.yml` with
`Authorization: Bearer $CRON_SECRET` (set the same value as a GitHub Actions
secret and on Vercel). For each **confirmed** session starting within 24 hours
(`24h`) or 1 hour (`1h`) it first claims the reminder
(`booking_reminders`, unique per booking and kind — concurrent runs send once),
then writes an in-app notification per party and, with `RESEND_API_KEY`, sends
an e-mail with escaped HTML, all parts at once and up to five reminders at a
time (`vercel.json` gives the function `maxDuration: 60`). If nothing reached
anyone the claim is released and the next run retries. Programme-managed
mentors (placeholder `.invalid` addresses) receive nothing. Response:
`{"ok":true,"reminders":n,"emails":n,"failures":n}`.

`booking_reminders.channels` holds the channel names (`{in_app,email}`) once
every part went out. While a part is missing it holds the parts that did, e.g.
`{mentor:in_app,mentor:email,mentee:email}`. A claim that is still empty or
partial 15 minutes after it was made (`sent_at`) belongs to a run that died or
to a part that failed. The next run takes it over (one run wins, through a
conditional update on `sent_at`) and sends only what is missing. On a take-over,
a reminder notification that is already in `notifications` counts as sent. An
e-mail sent just before a crash can still go out twice; nothing else does.

---

## Environment variables (Vercel → Settings → Environment Variables)

Tick **Production and Preview** for each, except where a row says otherwise (the
Turnstile variables are Production-only).

| Name | Required | Value |
| --- | --- | --- |
| `AMAZON_OIDC_ISSUER` | yes | Issuer URL from Amazon's identity team (integ now, prod TBC). Discovery is fetched from `{issuer}/.well-known/openid-configuration`; the document's `issuer` must match exactly. |
| `AMAZON_OIDC_CLIENT_ID` | yes | `mentor-amazon.vercel.app` (integ; Amazon expects the same for prod, to be confirmed) |
| `AMAZON_OIDC_CLIENT_SECRET` | yes | From Amazon's identity team. Also seeds the cookie-signing key. |
| `AMAZON_OIDC_REDIRECT_URI` | yes | `https://mentor-amazon.vercel.app/api/auth/callback/amazon` — exact match, no trailing slash |
| `AMAZON_OIDC_SCOPES` | no | default `openid` (the only scope Federate advertises) |
| `AMAZON_OIDC_DEBUG` | no | `true` enables `/api/auth/debug-claims` and `&reason=` on error redirects. Integ only. |
| `SUPABASE_URL` | yes | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key (bypasses RLS). Server only. |
| `APP_ORIGIN` | yes | `https://mentor-amazon.vercel.app` (every redirect target is built from this) |
| `CRON_SECRET` | yes (reminders) | ≥ 16 characters; the same value as the GitHub Actions secret |
| `RESEND_API_KEY`, `MAIL_FROM` | no | E-mail reminders through Resend; unset → in-app only |
| `TURNSTILE_SECRET_KEY` | **Production** (with the site key) | Cloudflare Turnstile secret for the widget registered on `mentor-amazon.vercel.app`. Set it **and** `VITE_TURNSTILE_SITE_KEY` for the **Production** environment only: in Production without both, `/api/requests` refuses with 503 (and a site key without the secret refuses everywhere). On **Preview** leave both unset, or use Cloudflare's always-pass test pair (see `TESTING.md` → "Before merging"), because the production widget rejects preview hostnames and password sign-in needs a token whenever the site key is set |
| `TURNSTILE_ALLOWED_HOSTNAMES` | no | Production only, e.g. `mentor-amazon.vercel.app`; tokens issued elsewhere are refused |
| `TURNSTILE_DISABLED` | no | Leave unset. Exactly `1` lets Production accept anonymous requests with no Turnstile keys (logged on every request). No effect while `TURNSTILE_SECRET_KEY` is set |
| `CAL_WEBHOOK_SECRET` | no | Only for a programme Cal.com Team/Org webhook without `?mentor=` (≥ 16 characters). Per-mentor secrets live in the database |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | no | Shared rate-limit counters across function instances |

See the root `.env.example`. For `vercel dev` put them in a root `.env`.

Preview deployments and local dev: Amazon only allows the registered redirect
URI, so SSO can only be exercised on the production domain. Amazon did **not**
register `http://localhost:3000/api/auth/callback/amazon`, so a real Amazon
sign-in cannot be done from a local machine; use `npm test` (mock Federate)
instead. Password login keeps working everywhere.

---

## Federate registration (as configured by Amazon's identity team)

What Amazon set up on their side, per the onboarding thread (Jul–Aug 2026):

| Item | Integ | Prod |
| --- | --- | --- |
| Discovery | `https://idp-integ.federate.amazon.com/.well-known/openid-configuration` | `https://idp.federate.amazon.com/.well-known/openid-configuration` |
| Flow | Authorization code + PKCE (S256), confidential client (secret) | same |
| Client ID | `mentor-amazon.vercel.app` | issued by Amazon (set in Vercel) |
| Client secret | delivered out-of-band (encrypted zip) | issued out-of-band (set in Vercel; never in the repo) |
| Redirect URI | `https://mentor-amazon.vercel.app/api/auth/callback/amazon` (exact). Localhost was **not** added. | same; Amazon accepted `mentor-amazon.vercel.app` as the production domain |
| Subject | `sub` = Amazon alias. No additional claims (no email or name); the app falls back to `<alias>@amazon.com`. | same |
| Who may sign in | Restricted **on Amazon's side** by internal group. For integ testing only the identity team's own org is allowed; Amazon switches it to the programme's team/group when it is ready. | the programme's group |
| Token endpoint auth | `client_secret_basic` and `client_secret_post` both accepted; a bad credential is answered `400 invalid_client` | same |

Because Amazon decides who reaches the app, the app lets every Amazon
sign-in in (see "Account rules"). Someone outside the allowed group is
refused by Federate: if it sends them back with `error=access_denied` they get
`/login?error=sso_denied` ("your Amazon account does not have access yet")
instead of the generic retry message.

Still open with Amazon: a test account (nobody on the build team has an
Amazon login). The production client ID/secret are issued and
`mentor-amazon.vercel.app` is accepted as the production domain (Sept 2026).
Amazon has asked for confirmation that the integration works "with the
claims"; see "How to test on integ" step 4 — someone in the allowed group
signs in once with `AMAZON_OIDC_DEBUG=true` and shares `/api/auth/debug-claims`.

---

## How to test on integ

Prerequisites: env vars above set on Vercel, `AMAZON_OIDC_DEBUG=true` on the
integ deployment, and the SQL migration for `approved_users`,
`access_requests`, `user_identifiers` applied. No `approved_users` rows are
needed: the first sign-in creates one.

### 1. Configuration check (no Amazon involvement)

```bash
# Missing env → 500 JSON with the names, never a stack trace
curl -si https://mentor-amazon.vercel.app/api/auth/login/amazon | head -20

# Debug endpoint is 404 unless AMAZON_OIDC_DEBUG is exactly 'true'
curl -si https://mentor-amazon.vercel.app/api/auth/debug-claims
```

### 2. Login redirect

```bash
curl -si "https://mentor-amazon.vercel.app/api/auth/login/amazon?returnTo=/mentor-portal" \
  | grep -iE "^(HTTP|location|set-cookie|cache-control)"
# Expect: HTTP/2 302, Location: <authorization_endpoint>?response_type=code&client_id=mentor-amazon.vercel.app
#         &redirect_uri=https%3A%2F%2Fmentor-amazon.vercel.app%2Fapi%2Fauth%2Fcallback%2Famazon&scope=openid+profile+email
#         &state=…&nonce=…&code_challenge=…&code_challenge_method=S256
#         Set-Cookie: mc_oidc=…; Path=/api/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax
#         Cache-Control: no-store
```

### 3. Callback guards (no cookie / bad state must not 500)

```bash
curl -si "https://mentor-amazon.vercel.app/api/auth/callback/amazon?code=x&state=y" | grep -iE "^(HTTP|location)"
# Expect: 302 → https://mentor-amazon.vercel.app/login?error=sso_state&reason=no_cookie   (reason only with debug on)
```

### 4. Full browser round trip

1. Open `https://mentor-amazon.vercel.app/login` → **Sign in with Amazon**.
2. Authenticate with Midway.
3. You land on `/auth/sso` (spinner) and then `/mentor-onboarding` (first
   sign-in, no profile yet), `/mentor-portal` or `/admin`. A new
   `approved_users` row (`approved_by = amazon-sso`) appears in `/admin/access`.
   An alias an admin deactivated → `/request-access?alias=<alias>&status=rejected`.
4. Confirm the claims Amazon sent:

   ```bash
   # In the same browser, within 15 minutes of the callback:
   open https://mentor-amazon.vercel.app/api/auth/debug-claims
   ```

   Response shape:

   ```json
   {
     "alias": "jdoe",
     "sub": "jdoe",
     "email": "jdoe@amazon.com",
     "name": "Jane Doe",
     "token_auth_method": "client_secret_basic",
     "captured_at": "2026-09-19T10:00:00.000Z",
     "id_token_claims": { "iss": "…", "sub": "jdoe", "aud": "mentor-amazon.vercel.app", "amazonAlias": "jdoe", "email": "…", "nonce": "…", "exp": 0, "iat": 0 },
     "userinfo": null,
     "sub_equals_alias": true
   }
   ```

   `sub_equals_alias: true` confirms the `sub = amazonAlias` configuration.
   Share `id_token_claims` (it contains no tokens) with the identity team if
   any expected claim is missing. The same claims are stored in
   `user_identifiers.claims` for approved users.

5. Sign out from the app (calls `supabase.auth.signOut()`), then optionally
   `curl -si -X POST https://mentor-amazon.vercel.app/api/auth/logout` — expect 302 to
   `/login` with both cookies expired.

### 5. Turn debug off

Set `AMAZON_OIDC_DEBUG=false` (or remove it) and redeploy before production
traffic. `/api/auth/debug-claims` then returns 404 and error redirects carry
no `reason`.

---

## Local development

Plain `vite` serves only the SPA. With the local Supabase stack, the dev server
also runs the functions:

```bash
source scripts/e2e/env.sh          # local stack keys, MC_LOCAL_API=1, Turnstile test keys, mock-IdP OIDC env
npx tsx scripts/e2e/mock-idp.ts &  # only needed for "Sign in with Amazon"
npx vite --port 5173 --strictPort
```

With `MC_LOCAL_API=1`, `vite.config.ts` serves `/api/requests`,
`/api/webhooks/cal` and `/api/cron/reminders` through `ssrLoadModule` (the raw
body is kept, and `x-e2e-client-ip` becomes `x-forwarded-for` so each E2E spec
has its own rate-limit bucket). When `AMAZON_OIDC_ISSUER` is also set,
`/api/auth/*` runs too, against the mock IdP on `127.0.0.1:54399`; otherwise the
SSO entry keeps redirecting to `/login?error=sso_unavailable_local`.
`vercel dev` with a root `.env` also works.

`npm test` (Vitest, no network, no database) runs the unit suites for the
request, webhook, Turnstile and reminder handlers and the SSO suite. The SSO
suite uses no credentials: a local mock of Federate (same endpoint paths as the real
discovery document; it enforces the exact redirect URI, S256 PKCE, client
authentication and single-use codes, and signs RS256 ID tokens) and an
in-memory Supabase that the real `supabaseAdmin.ts` queries run against. It
drives the real handlers through login → authorize → callback → bridge and
covers first sign-in, returning users, roles, revocation, the takeover guards,
state/nonce/signature/audience/expiry failures, the basic→post fallback,
debug-claims and logout.

`npm run test:integration` drives the same handlers against the local Supabase
stack (real Postgres, PostgREST and GoTrue), including an Amazon sign-in end to
end with the mock IdP; see `TESTING.md`.
