# SSO helpers — manual self-check

Sections 2 and 3 are now automated: `npm test` runs them (and much more)
against a local mock of Federate and an in-memory Supabase — see `tests/` and
"Local development" in `api/README.md`. The manual steps below still work and
need no Amazon credentials; the last section needs a deployed integ
environment.

## 1. Type-check the functions

```bash
npx tsc --noEmit 2>&1 | grep -E "api/" ; echo "(nothing above = clean)"
```

## 2. Exercise the pure helpers with tsx (no network)

Create a throwaway `.mts` file outside the repo:

```ts
import assert from "node:assert/strict";
import { deriveCookieKey, signValue, verifyValue } from "<repo>/api/_lib/cookies.ts";
import { safeReturnTo } from "<repo>/api/_lib/http.ts";
import { createPkce, stripTokenMaterial, extractIdentity } from "<repo>/api/_lib/oidc.ts";

const key = deriveCookieKey("test-secret");
const signed = signValue(key, { st: "s", nc: "n", cv: "v", rt: "/x", iat: Date.now() });
assert.ok(verifyValue(key, signed));
assert.equal(verifyValue(key, signed.slice(0, -2) + "zz"), null);        // tampered
assert.equal(verifyValue(deriveCookieKey("other"), signed), null);       // wrong key

assert.equal(safeReturnTo("//evil.com"), "/");
assert.equal(safeReturnTo("https://evil.com"), "/");
assert.equal(safeReturnTo("/mentor-portal?tab=1"), "/mentor-portal?tab=1");

const p = createPkce();
assert.ok(p.verifier.length >= 43 && p.verifier.length <= 128);

assert.deepEqual(stripTokenMaterial({ sub: "a", access_token: "x" }), { sub: "a" });
assert.equal(extractIdentity({ sub: "JDoe" }).alias, "jdoe");
assert.equal(extractIdentity({ sub: "x", amazonAlias: "jdoe" }).alias, "jdoe");
console.log("ok");
```

```bash
npx tsx ./sso-selftest.mts
```

## 3. Exercise the handlers with a fake request/response (no Supabase)

The handlers only need `{ method, url, headers }` and a response object with
`setHeader/getHeader/end/statusCode`. Import a handler the same way and call
it with the env vars unset to see the `server_misconfigured` JSON, then with
`AMAZON_OIDC_*`/`SUPABASE_*`/`APP_ORIGIN` pointed at a local mock issuer that
serves `/.well-known/openid-configuration`. Expected:

| Call | Expect |
| --- | --- |
| login, env missing | 500 `{"error":"server_misconfigured","missing":[…]}` |
| login, env set | 302 to `authorization_endpoint` with S256 challenge + `Set-Cookie: mc_oidc=…` |
| callback, no cookie | 302 `/login?error=sso_state` and `mc_oidc` expired |
| callback, wrong state | 302 `/login?error=sso_state` |
| callback, `?error=access_denied` | 302 `/login?error=sso_failed` |
| callback, token endpoint 400 | 302 `/login?error=sso_token` |
| logout | 302 `/login`, two expired cookies |
| debug-claims, flag off | 404 `{"error":"not_found"}` |

## 4. On integ (needs Amazon)

Follow `api/README.md` → "How to test on integ".
