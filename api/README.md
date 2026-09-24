# `api/` — Vercel serverless functions

Node runtime, TypeScript, one file per route. Everything here runs server-side
with secrets that must **never** be prefixed `VITE_` or imported from `client/`.

| Route | File | Purpose |
| --- | --- | --- |
| `GET /api/auth/login/amazon` | `auth/login/amazon.ts` | Start Amazon Federate sign-in (OIDC code + PKCE) |
| `GET /api/auth/callback/amazon` | `auth/callback/amazon.ts` | Registered redirect URI — token exchange, role lookup, Supabase bridge |
| `POST /api/auth/logout` | `auth/logout.ts` | Clear `mc_oidc*` cookies, 302 to `/login` |
| `GET /api/auth/debug-claims` | `auth/debug-claims.ts` | Integ-only: show the claims from the last sign-in (404 unless `AMAZON_OIDC_DEBUG=true`) |
| `POST /api/webhooks/cal` | `webhooks/cal.ts` | Cal.com booking webhooks — HMAC-SHA256 verified, idempotent; confirms / reschedules / cancels the matching booking, creates it when booked directly on cal.com |
| `GET /api/cron/reminders` | `cron/reminders.ts` | Hourly (GitHub Actions `reminders.yml`, bearer `CRON_SECRET`): 24h and 1h session reminders as in-app notifications (+ email via Resend when configured) |
| `POST /api/turnstile` | `turnstile.ts` | Verifies a Cloudflare Turnstile token for the public request form (no-op when not configured) |

Shared helpers live in `_lib/` (the leading underscore keeps Vercel from
exposing them as routes): `env.ts` (Zod-validated variables), `http.ts`,
`cookies.ts`, `oidc.ts`, `supabaseAdmin.ts`, `ratelimit.ts` (per-IP fixed
window; Upstash Redis when configured, in-memory per instance otherwise). Relative imports use the `.js` suffix on purpose — the
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
| alias deactivated by an admin (`approved_users.is_active = false`) | `/request-access?alias=<alias>&status=rejected` |
| any other Amazon employee | `/auth/sso#token_hash=…&type=magiclink&next=<returnTo>` |
| anything else (discovery, ID-token, provider `error=`, DB) | `/login?error=sso_failed` |

When `AMAZON_OIDC_DEBUG=true`, error redirects carry `&reason=<code>`
(e.g. `token_invalid_grant`, `id_token_nonce`, `alias_conflict`, `alias_invalid`).
Never enable this in production.

Any missing env var → `500 {"error":"server_misconfigured","missing":[...]}`.
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

## Environment variables (Vercel → Settings → Environment Variables, Production **and** Preview)

| Name | Required | Value |
| --- | --- | --- |
| `AMAZON_OIDC_ISSUER` | yes | Issuer URL from Amazon's identity team (integ now, prod TBC). Discovery is fetched from `{issuer}/.well-known/openid-configuration`; the document's `issuer` must match exactly. |
| `AMAZON_OIDC_CLIENT_ID` | yes | `mentor-amazon.vercel.app` (integ; prod TBC) |
| `AMAZON_OIDC_CLIENT_SECRET` | yes | From Amazon's identity team. Also seeds the cookie-signing key. |
| `AMAZON_OIDC_REDIRECT_URI` | yes | `https://mentor-amazon.vercel.app/api/auth/callback/amazon` — exact match, no trailing slash |
| `AMAZON_OIDC_SCOPES` | no | default `openid` (the only scope Federate advertises) |
| `AMAZON_OIDC_DEBUG` | no | `true` enables `/api/auth/debug-claims` and `&reason=` on error redirects. Integ only. |
| `SUPABASE_URL` | yes | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key (bypasses RLS). Server only. |
| `APP_ORIGIN` | yes | `https://mentor-amazon.vercel.app` (every redirect target is built from this) |

See the root `.env.example`. For `vercel dev` put them in a root `.env`.

Preview deployments: Amazon only allows the registered redirect URI, so SSO
can only be exercised on the production domain (or a preview domain that
Amazon has also registered). Password login keeps working everywhere.

---

## What to send Amazon's identity team (Federate registration)

Checklist — copy into the ticket:

1. **Application name:** MentorConnect (Amazon UAE mentorship programme).
2. **Protocol:** OpenID Connect, authorization code flow with PKCE (S256), confidential client.
3. **Redirect URI (exact match):** `https://mentor-amazon.vercel.app/api/auth/callback/amazon`
4. **Client ID requested:** `mentor-amazon.vercel.app` (integ; production client id/issuer TBC).
5. **Token endpoint auth:** `client_secret_basic` preferred; `client_secret_post` supported as fallback.
6. **Scopes:** `openid`.
7. **Claims needed in the ID token:** `sub`, `amazonAlias`, `email`, `name` (or `given_name` + `family_name`). Please configure **`sub = amazonAlias`** (the app also reads an explicit `amazonAlias` claim and prefers it when present).
8. **Signing:** RS256 (or any asymmetric alg published in `jwks_uri`); HS256 is not accepted.
9. **Post-logout redirect:** not required (no RP-initiated logout is used).
10. **Ask back:** issuer URL, client secret (out-of-band), whether `userinfo_endpoint` is available, the Amazon group/POSIX group that gates access on their side, and the integ vs prod values of 1–4.

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

`vite` alone serves only the SPA. To run the functions locally use
`vercel dev` with a root `.env` (the discovery document must be reachable
from your machine).

`npm test` runs the SSO suite (`tests/`, Vitest) with no network and no
credentials: a local mock of Federate (same endpoint paths as the real
discovery document; it enforces the exact redirect URI, S256 PKCE, client
authentication and single-use codes, and signs RS256 ID tokens) and an
in-memory Supabase that the real `supabaseAdmin.ts` queries run against. It
drives the real handlers through login → authorize → callback → bridge and
covers first sign-in, returning users, roles, revocation, the takeover guards,
state/nonce/signature/audience/expiry failures, the basic→post fallback,
debug-claims and logout.
