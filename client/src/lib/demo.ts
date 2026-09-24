/**
 * Local-persistence mode.
 *
 * On when no Supabase project is configured — the env is absent (a
 * deployment without the variables) or the placeholder URL from
 * `client/.env` — when `VITE_LOCAL=1`, or when the configured project does
 * not answer at boot (`resolveBackend()` in main.tsx probes it before the
 * first render, so a dead or unreachable project degrades to local mode
 * instead of "unable to load" on every page).
 *
 * In local mode everything people submit — mentor profiles, mentee
 * registrations, session requests, favourites, activity — is kept in this
 * browser's storage (`lib/localStore.ts`) and shows up across the app
 * immediately; against a live project the same code paths write to the
 * database instead, with no code change.
 *
 * `IS_LOCAL` is a live binding: read it where it is used, never copy it at
 * module init.
 */
const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const configuredKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** True when the env alone already rules out a real project. */
export const ENV_FORCES_LOCAL: boolean =
  import.meta.env.VITE_LOCAL === "1" ||
  import.meta.env.VITE_DEMO === "1" ||
  !configuredUrl ||
  !configuredKey ||
  configuredUrl.includes("example.supabase.co");

export let IS_LOCAL: boolean = ENV_FORCES_LOCAL;

/** Why the app is in local mode (shown in the dev console and the diagnostics badge). */
export let LOCAL_REASON: "env" | "unreachable" | null = ENV_FORCES_LOCAL ? "env" : null;

export function enableLocalMode(reason: "env" | "unreachable") {
  IS_LOCAL = true;
  LOCAL_REASON = reason;
}

/** How long the boot probe waits for the project before falling back. */
const PROBE_TIMEOUT_MS = 3500;

/**
 * Called once before the first render. Resolves quickly: no network call
 * when the env already forces local mode; otherwise one authenticated GET
 * to the project's health endpoint with a short timeout. Any failure —
 * DNS (a deleted project), CORS, 5xx, timeout — switches to local mode.
 */
export async function resolveBackend(): Promise<void> {
  if (ENV_FORCES_LOCAL) return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${configuredUrl.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: configuredKey },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`health ${res.status}`);
  } catch (err) {
    enableLocalMode("unreachable");
    if (import.meta.env.DEV) console.warn("[mentorconnect] Supabase project unreachable, running in local mode:", err);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Cal.com page used for mentors who have not added their own link yet, so the
 * booking calendar is always live. Default: Cal.com's public sample account
 * (cal.com/cal, "Cal Courtney"); set `VITE_DEFAULT_CAL_LINK` to the
 * programme's own account (username, or username/event). Empty disables the
 * shared calendar and shows the request form instead.
 */
export const DEFAULT_CAL_LINK: string = (import.meta.env.VITE_DEFAULT_CAL_LINK ?? "cal").trim();

/** Transitional re-export; the implementation lives in lib/calLink.ts. */
export { normalizeCalLink } from "@/lib/calLink";
