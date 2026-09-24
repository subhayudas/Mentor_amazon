/**
 * Backend mode: database (a configured Supabase project) or local (demo).
 *
 * Local mode is on when the env rules out a project (`VITE_LOCAL=1`,
 * `VITE_DEMO=1`, missing variables, the `example.supabase.co` placeholder)
 * or, in development only, when the configured project does not answer the
 * boot probe. Production never switches to local mode (design D7, F05): with
 * `VITE_ALLOW_LOCAL_FALLBACK` unset the boot does not wait for the probe at
 * all, the probe runs in the background and an unreachable project shows the
 * BackendStatusBanner ("can't reach MentorConnect", Retry) while every write
 * still goes to the database and fails visibly instead of being kept in this
 * browser. The decision table lives in `lib/backendMode.ts`.
 *
 * In local mode everything people submit is kept in this browser's storage
 * (`lib/localStore.ts`) and a permanent "Demo mode" banner says so.
 *
 * `IS_LOCAL` is a live binding decided before the first render and never
 * changed afterwards: read it where it is used, never copy it at module init.
 * `<html data-backend="database|local">` and `window.__MC_BACKEND__` expose
 * the mode to tests and support.
 */
import {
  allowLocalFallback,
  createHealthStore,
  decideBackend,
  envForcesLocal,
  mustAwaitProbe,
  probeHealth,
  type BackendDecision,
  type BackendHealth,
  type BackendMode,
  type LocalReason,
} from "@/lib/backendMode";

const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const configuredKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** True when the env alone already rules out a real project. */
export const ENV_FORCES_LOCAL: boolean = envForcesLocal({
  VITE_LOCAL: import.meta.env.VITE_LOCAL,
  VITE_DEMO: import.meta.env.VITE_DEMO,
  VITE_SUPABASE_URL: configuredUrl,
  VITE_SUPABASE_ANON_KEY: configuredKey,
});

/** A failed boot probe may fall back to local mode only in dev or an explicitly flagged preview — never in production. */
export const ALLOW_LOCAL_FALLBACK: boolean = allowLocalFallback({
  DEV: import.meta.env.DEV,
  VITE_ALLOW_LOCAL_FALLBACK: import.meta.env.VITE_ALLOW_LOCAL_FALLBACK,
});

export let IS_LOCAL: boolean = ENV_FORCES_LOCAL;

/** Why the app is in local mode (shown in the dev console and on `window.__MC_BACKEND__`). */
export let LOCAL_REASON: LocalReason | null = ENV_FORCES_LOCAL ? "env" : null;

/** Reachability of the configured project in database mode; drives the outage banner. */
export const backendHealth = createHealthStore("unknown");

declare global {
  interface Window {
    /** Support/test hook: the resolved backend mode, why, and the live health state. */
    __MC_BACKEND__?: { mode: BackendMode; reason: LocalReason | null; health: BackendHealth };
  }
}

function publishMode() {
  const mode: BackendMode = IS_LOCAL ? "local" : "database";
  if (typeof document !== "undefined") document.documentElement.dataset.backend = mode;
  if (typeof window !== "undefined") window.__MC_BACKEND__ = { mode, reason: LOCAL_REASON, health: backendHealth.get() };
}

backendHealth.subscribe(publishMode);

function applyDecision(decision: BackendDecision) {
  IS_LOCAL = decision.mode === "local";
  LOCAL_REASON = decision.reason;
  backendHealth.set(decision.health);
  publishMode();
}

/** How long the dev-only boot probe may delay the first render. */
const BOOT_PROBE_TIMEOUT_MS = 3500;
/** Background probe: two attempts of five seconds each (design C1). */
const PROBE_ATTEMPTS = 2;
const PROBE_TIMEOUT_MS = 5000;
/** While the project is unreachable, look again this often. */
const REPROBE_INTERVAL_MS = 30_000;

let inflight: Promise<BackendHealth> | null = null;
let reprobeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReprobe(health: BackendHealth) {
  if (reprobeTimer !== null) {
    clearTimeout(reprobeTimer);
    reprobeTimer = null;
  }
  if (health !== "degraded") return;
  reprobeTimer = setTimeout(() => {
    reprobeTimer = null;
    void probeBackend();
  }, REPROBE_INTERVAL_MS);
}

/**
 * Probe the configured project and publish the result to `backendHealth`
 * (database mode only; a no-op in local mode). Concurrent calls share one
 * probe. While degraded, it re-probes itself every 30 seconds.
 */
export function probeBackend(): Promise<BackendHealth> {
  if (IS_LOCAL) return Promise.resolve(backendHealth.get());
  if (!inflight) {
    inflight = probeHealth({ url: configuredUrl, anonKey: configuredKey, attempts: PROBE_ATTEMPTS, timeoutMs: PROBE_TIMEOUT_MS })
      .then((result): BackendHealth => {
        const next: BackendHealth = result === "ok" ? "ok" : "degraded";
        backendHealth.set(next);
        scheduleReprobe(next);
        return next;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Called once before the first render. With the env forcing local mode it
 * resolves at once. Otherwise it waits for the probe ONLY when local fallback
 * is allowed (dev/preview), because only then can the result change the mode;
 * in production it returns immediately and the probe runs in the background.
 */
export async function resolveBackend(): Promise<void> {
  if (ENV_FORCES_LOCAL) {
    applyDecision(decideBackend({ envForcesLocal: true, allowFallback: ALLOW_LOCAL_FALLBACK, probe: "not_run" }));
    return;
  }
  if (mustAwaitProbe({ envForcesLocal: false, allowFallback: ALLOW_LOCAL_FALLBACK })) {
    const probe = await probeHealth({ url: configuredUrl, anonKey: configuredKey, attempts: 1, timeoutMs: BOOT_PROBE_TIMEOUT_MS });
    const decision = decideBackend({ envForcesLocal: false, allowFallback: true, probe });
    applyDecision(decision);
    if (decision.mode === "local" && import.meta.env.DEV) {
      console.warn("[mentorconnect] Supabase project unreachable at boot; running in local demo mode (dev only).");
    }
    return;
  }
  const decision = decideBackend({ envForcesLocal: false, allowFallback: false, probe: "not_run" });
  applyDecision(decision);
  if (decision.probeInBackground) void probeBackend();
}

/**
 * @deprecated Transitional and inert: Cal.com's public sample account is never
 * used again (design D4) and `VITE_DEFAULT_CAL_LINK` is no longer read. The
 * constant stays empty only until Track B's SessionScheduler stops importing
 * it; delete it (and the re-export below) at the Phase 3 merge.
 */
export const DEFAULT_CAL_LINK = "";

/** @deprecated Transitional re-export; import from `@/lib/calLink`. Deleted with DEFAULT_CAL_LINK at the Phase 3 merge. */
export { normalizeCalLink } from "@/lib/calLink";
