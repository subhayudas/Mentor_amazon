/**
 * Backend-mode decision (design D7, fix F05). Pure: no Supabase client, no
 * DOM, no `import.meta.env` reads, so node vitest can prove the table.
 *
 * - The env alone can force local (demo) mode: `VITE_LOCAL=1`, `VITE_DEMO=1`,
 *   a missing URL or key, or the `example.supabase.co` placeholder.
 * - Otherwise a real project is configured and the app runs against it. A
 *   failed boot probe may switch to local mode ONLY when local fallback is
 *   allowed (`import.meta.env.DEV` or `VITE_ALLOW_LOCAL_FALLBACK=1`, never set
 *   in production). In production the probe runs in the background and only
 *   drives the "can't reach MentorConnect" banner; the mode stays `database`,
 *   so nothing a visitor submits is ever diverted into browser storage.
 */

export type BackendMode = "database" | "local";
/** Why the app runs in local mode: the env said so, or the dev-only boot probe failed. */
export type LocalReason = "env" | "unreachable";
/** Result of the background health probe: not known yet, reachable, or not reachable. */
export type BackendHealth = "unknown" | "ok" | "degraded";
/** Outcome of the boot probe; `not_run` when the boot did not wait for one. */
export type ProbeResult = "ok" | "failed" | "not_run";

/** The `import.meta.env` fields the decision reads (strings as Vite provides them). */
export interface BackendEnv {
  VITE_LOCAL?: string;
  VITE_DEMO?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_ALLOW_LOCAL_FALLBACK?: string;
  DEV?: boolean;
}

/** True when the env alone rules out a real project. */
export function envForcesLocal(env: BackendEnv): boolean {
  const url = String(env.VITE_SUPABASE_URL ?? "").trim();
  const key = String(env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  return env.VITE_LOCAL === "1" || env.VITE_DEMO === "1" || !url || !key || url.includes("example.supabase.co");
}

/** Local fallback after a failed probe is a dev/preview convenience only. */
export function allowLocalFallback(env: BackendEnv): boolean {
  return env.DEV === true || env.VITE_ALLOW_LOCAL_FALLBACK === "1";
}

/** Whether the boot must wait for the probe before the first render (only when its result can change the mode). */
export function mustAwaitProbe(input: { envForcesLocal: boolean; allowFallback: boolean }): boolean {
  return !input.envForcesLocal && input.allowFallback;
}

export interface BackendDecision {
  mode: BackendMode;
  reason: LocalReason | null;
  /** Initial health; `unknown` until the background probe reports. Meaningless in local mode. */
  health: BackendHealth;
  /** The boot did not probe: start the background probe that feeds `health`. */
  probeInBackground: boolean;
}

/**
 * The decision table (tests/backend-mode.test.ts):
 * | envForcesLocal | allowFallback | probe   | mode     | reason      | health   | background |
 * | yes            | any           | any     | local    | env         | unknown  | no         |
 * | no             | yes           | failed  | local    | unreachable | unknown  | no         |
 * | no             | any           | ok      | database | —           | ok       | no         |
 * | no             | no            | failed  | database | —           | degraded | no         |
 * | no             | any           | not_run | database | —           | unknown  | yes        |
 */
export function decideBackend(input: { envForcesLocal: boolean; allowFallback: boolean; probe: ProbeResult }): BackendDecision {
  if (input.envForcesLocal) return { mode: "local", reason: "env", health: "unknown", probeInBackground: false };
  if (input.probe === "failed" && input.allowFallback) return { mode: "local", reason: "unreachable", health: "unknown", probeInBackground: false };
  if (input.probe === "ok") return { mode: "database", reason: null, health: "ok", probeInBackground: false };
  if (input.probe === "failed") return { mode: "database", reason: null, health: "degraded", probeInBackground: false };
  return { mode: "database", reason: null, health: "unknown", probeInBackground: true };
}

/** The Supabase Auth health endpoint for a project URL (trailing slashes tolerated). */
export function healthUrl(projectUrl: string): string {
  return `${projectUrl.trim().replace(/\/+$/, "")}/auth/v1/health`;
}

type FetchLike = (input: string, init?: { headers?: Record<string, string>; signal?: AbortSignal; cache?: RequestCache }) => Promise<{ ok: boolean }>;

/**
 * One or more GETs to the health endpoint, each bounded by `timeoutMs`.
 * Resolves `ok` on the first 2xx, `failed` when every attempt failed (DNS,
 * CORS, 5xx, timeout, abort). Never throws.
 */
export async function probeHealth(options: {
  url: string;
  anonKey: string;
  attempts?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<"ok" | "failed"> {
  const attempts = Math.max(1, options.attempts ?? 1);
  const timeoutMs = options.timeoutMs ?? 5000;
  const doFetch: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(healthUrl(options.url), { headers: { apikey: options.anonKey }, signal: controller.signal, cache: "no-store" });
      if (res.ok) return "ok";
    } catch {
      // network error, CORS or abort: try again if attempts remain
    } finally {
      clearTimeout(timer);
    }
  }
  return "failed";
}

/** A tiny external store for the health state (fed by the probe, read by the banner via useSyncExternalStore). */
export interface HealthStore {
  get(): BackendHealth;
  set(next: BackendHealth): void;
  subscribe(listener: () => void): () => void;
}

export function createHealthStore(initial: BackendHealth = "unknown"): HealthStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (next === value) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
