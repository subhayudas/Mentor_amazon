/**
 * Route constants, page-title lookup and URL helpers. Every path in App.tsx
 * has a constant here so links never carry string literals. `pageTitleKey`
 * feeds `document.title` + the route-change focus effect (P1-29).
 */
import { type DiscoveryState, serializeDiscovery } from "@/lib/discoveryState";

export const ROUTES = {
  home: "/",
  mentors: "/mentors",
  mentor: (id: string) => `/mentor/${encodeURIComponent(id)}`,
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  authSso: "/auth/sso",
  authConfirm: "/auth/confirm",
  requestAccess: "/request-access",
  menteeRegistration: "/mentee-registration",
  myBookings: "/my-bookings",
  menteeDashboard: "/mentee-dashboard",
  menteeBookings: "/mentee-dashboard/bookings",
  analytics: "/analytics",
  mentorOnboarding: "/mentor-onboarding",
  mentorDashboard: "/mentor-dashboard",
  mentorPortal: "/mentor-portal",
  admin: "/admin",
} as const;

/** Paths that render their own shell chrome (kept for consumers; the header is mounted everywhere per C12). */
export const APP_SHELL_PREFIXES = [ROUTES.menteeDashboard, ROUTES.mentorPortal, ROUTES.admin] as const;

const MENTEE_PATH_PREFIXES = [ROUTES.menteeDashboard, ROUTES.myBookings, ROUTES.menteeRegistration, ROUTES.mentors, "/mentor/"] as const;

/** A `?next` target only a mentee would arrive from (dashboard, bookings, registration, discovery, a profile). */
export function isMenteePath(path: string): boolean {
  return MENTEE_PATH_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path.startsWith(`${p}?`));
}

export function isAppShellPath(pathname: string): boolean {
  return APP_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type TitleRule = { test: (pathname: string) => boolean; key: string };

const TITLE_RULES: TitleRule[] = [
  { test: (p) => p === "/", key: "nav.titles.home" },
  { test: (p) => p === "/mentors", key: "nav.titles.mentors" },
  { test: (p) => /^\/(mentor|mentors|profile\/mentor)\/[^/]+$/.test(p), key: "nav.titles.mentor" },
  { test: (p) => /^\/mentor\/[^/]+\/book$/.test(p), key: "nav.titles.book" },
  { test: (p) => p === "/login", key: "nav.titles.login" },
  { test: (p) => p === "/signup", key: "nav.titles.signup" },
  { test: (p) => p === "/forgot-password", key: "nav.titles.forgotPassword" },
  { test: (p) => p === "/reset-password", key: "nav.titles.resetPassword" },
  { test: (p) => p === "/auth/sso", key: "nav.titles.sso" },
  { test: (p) => p === "/auth/confirm", key: "nav.titles.authConfirm" },
  { test: (p) => p === "/request-access", key: "nav.titles.requestAccess" },
  { test: (p) => p === "/mentee-registration", key: "nav.titles.menteeRegistration" },
  { test: (p) => p === "/my-bookings", key: "nav.titles.myBookings" },
  { test: (p) => p === "/mentee-dashboard" || p.startsWith("/mentee-dashboard/"), key: "nav.titles.menteeDashboard" },
  { test: (p) => /^\/profile\/mentee\/[^/]+$/.test(p), key: "nav.titles.menteeProfile" },
  { test: (p) => p === "/analytics" || p === "/analytics/reports", key: "nav.titles.analytics" },
  { test: (p) => p === "/dashboard", key: "nav.titles.dashboard" },
  { test: (p) => p === "/legal", key: "nav.titles.legal" },
  { test: (p) => p === "/dashboard/bookings", key: "nav.titles.dashboardBookings" },
  { test: (p) => p === "/dashboard/calendar", key: "nav.titles.dashboardCalendar" },
  { test: (p) => p === "/dashboard/profile", key: "nav.titles.dashboardProfile" },
  { test: (p) => p === "/dashboard/activity", key: "nav.titles.dashboardActivity" },
  { test: (p) => p === "/dashboard/admin", key: "nav.titles.dashboardAdmin" },
  { test: (p) => p === "/analytics/report", key: "nav.titles.analyticsReport" },
  { test: (p) => p === "/mentor-onboarding", key: "nav.titles.mentorOnboarding" },
  { test: (p) => p === "/mentor-dashboard", key: "nav.titles.mentorDashboard" },
  { test: (p) => p === "/mentor-portal" || p.startsWith("/mentor-portal/"), key: "nav.titles.mentorPortal" },
  { test: (p) => p === "/admin" || p.startsWith("/admin/"), key: "nav.titles.admin" },
];

/** i18n key (`nav.titles.*`) for the page title of a pathname; unknown paths map to the not-found title. */
export function pageTitleKey(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  return TITLE_RULES.find((r) => r.test(path))?.key ?? "nav.titles.notFound";
}

/** `/mentors?…` for a (partial) discovery state; defaults are omitted. */
export function discoveryUrl(state: Partial<DiscoveryState>): string {
  const qs = serializeDiscovery(state).toString();
  return qs ? `${ROUTES.mentors}?${qs}` : ROUTES.mentors;
}

/** `/login?next=<path>` — the guard/redirect contract used across the app. */
export function loginHref(next?: string): string {
  return next ? `${ROUTES.login}?next=${encodeURIComponent(next)}` : ROUTES.login;
}

/**
 * Same-origin path guard (mirrors `safeNext` in lib/ssoClient.ts, which is
 * frozen SSO code): only `/path` values, never `//host` or `/\host`, fragment
 * dropped; anything else gives `fallback`.
 */
export function sameOriginPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value.split("#")[0] || fallback;
}

/**
 * Where Supabase sends the sign-up confirmation link (F32): `/auth/confirm`
 * with the same-origin `next` the person signed up from, so confirming lands
 * back in the app instead of on the Site URL.
 */
export function authConfirmUrl(origin: string, next?: string | null): string {
  return `${origin.replace(/\/+$/, "")}${ROUTES.authConfirm}?next=${encodeURIComponent(sameOriginPath(next))}`;
}

/**
 * After an email confirmation: a real `next` wins; otherwise a mentee without
 * a mentees row registers first and one with a row goes to their dashboard.
 * Mentor and admin accounts (created through Amazon sign-in, so rarely here)
 * go where Amazon sign-in would send them.
 */
export function confirmDestination(input: { role: "mentor" | "mentee" | "admin"; hasProfile: boolean; next?: string | null }): string {
  const next = sameOriginPath(input.next, "");
  if (next && next !== "/" && !next.startsWith(ROUTES.authConfirm)) return next;
  if (input.role === "admin") return ROUTES.admin;
  if (input.role === "mentor") return input.hasProfile ? ROUTES.mentorPortal : ROUTES.mentorOnboarding;
  return input.hasProfile ? ROUTES.menteeDashboard : ROUTES.menteeRegistration;
}
