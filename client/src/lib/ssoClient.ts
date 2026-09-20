import type { AuthUser } from "./auth";

/**
 * Client-side helpers for the Amazon Federate sign-in bridge. The heavy
 * lifting (OIDC, allow-list, Supabase admin) happens in api/auth/*; the SPA
 * only starts the flow with a link and finishes it on /auth/sso.
 */

export const SSO_LOGIN_PATH = "/api/auth/login/amazon";
export const SSO_LOGOUT_PATH = "/api/auth/logout";

/** Same-origin path guard mirrored from api/_lib/http.ts `safeReturnTo`. */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value.split("#")[0] || fallback;
}

/** Link that starts Amazon sign-in, optionally returning to a same-origin path afterwards. */
export function ssoLoginHref(returnTo?: string): string {
  const next = safeNext(returnTo, "");
  return next ? `${SSO_LOGIN_PATH}?returnTo=${encodeURIComponent(next)}` : SSO_LOGIN_PATH;
}

export interface SsoFragment {
  tokenHash: string | null;
  type: string;
  next: string;
  /** Browser-binding nonce; must equal the `mc_sso_bind` cookie the callback set. */
  bind: string | null;
}

const BIND_COOKIE = "mc_sso_bind";

/** Read (and then expire) the browser-binding cookie the callback set. */
export function takeBridgeBindCookie(): string | null {
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${BIND_COOKIE}=`));
  const value = match ? decodeURIComponent(match.slice(BIND_COOKIE.length + 1)) : null;
  document.cookie = `${BIND_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
  return value && value.length > 0 ? value : null;
}

/**
 * Read `#token_hash=...&type=magiclink&next=/path` and immediately strip the
 * fragment from the address bar so the one-time token cannot be copied,
 * bookmarked or re-sent by a reload.
 */
export function consumeSsoFragment(): SsoFragment {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(raw);
  const fragment: SsoFragment = {
    tokenHash: params.get("token_hash"),
    type: params.get("type") ?? "magiclink",
    next: safeNext(params.get("next")),
    bind: params.get("bind"),
  };
  if (raw) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return fragment;
}

/**
 * Post-login destination by role, per the SSO contract. Mentees without a
 * `next` land on their dashboard when a mentees row exists (`profile_id`),
 * otherwise on the directory (P1-1) — never on the marketing landing.
 */
export function ssoDestination(user: AuthUser, next: string): string {
  if (user.user_type === "admin") return "/admin";
  if (user.user_type === "mentor") return user.profile_id ? "/mentor-portal" : "/mentor-onboarding";
  if (next && next !== "/") return next;
  return user.profile_id ? "/mentee-dashboard" : "/mentors";
}

/** Maps `?error=sso_*` codes from api/auth/callback to translation keys. */
export const SSO_ERROR_KEYS: Record<string, string> = {
  sso_unavailable_local: "auth.sso.errors.unavailableLocal",
  sso_state: "auth.sso.errors.sso_state",
  sso_token: "auth.sso.errors.sso_token",
  sso_failed: "auth.sso.errors.sso_failed",
};

export function ssoErrorKey(code: string | null | undefined): string | null {
  if (!code || !code.startsWith("sso_")) return null;
  return SSO_ERROR_KEYS[code] ?? "auth.sso.errors.generic";
}
