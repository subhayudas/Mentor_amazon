/**
 * Cal.com booking sync, client side (design §3.2–§3.4, B11, F08).
 *
 * Every mentor has their own webhook secret in `mentor_cal_webhooks`; only the
 * owning mentor can read it, through `get_my_cal_webhook`. Cal.com posts to
 * `/api/webhooks/cal?mentor=<id>` and the handler records each delivery's
 * outcome, which the panel shows back to the mentor.
 *
 * Pure apart from the two RPC wrappers, which take the `rpc` function as a
 * parameter so this module never imports the Supabase client (node vitest
 * tests it directly).
 */

/** The deployment Cal.com should post to; previews sit behind Vercel protection (R9). */
export const PRODUCTION_HOST = "mentor-amazon.vercel.app";

/** How often the panel re-reads the delivery status while it is visible. */
export const CAL_SYNC_POLL_MS = 15_000;

/** Row returned by `get_my_cal_webhook` (secret only ever reaches the owning mentor). */
export interface CalWebhookInfo {
  mentor_id: string;
  secret: string | null;
  created_at: string | null;
  rotated_at: string | null;
  previous_valid_until: string | null;
  last_delivery_at: string | null;
  last_trigger: string | null;
  last_outcome: string | null;
  deliveries_total: number;
}

/** Result of `rotate_cal_webhook_secret` (the new secret is null for an admin caller). */
export interface RotatedCalSecret {
  secret: string | null;
  rotated_at: string | null;
  previous_valid_until: string | null;
}

/** Outcomes that mean "sync is working" (design §3.3, frozen vocabulary). */
export const WORKING_OUTCOMES = [
  "ping",
  "confirmed",
  "requested",
  "rejected",
  "canceled",
  "cal_booking_released",
  "rescheduled",
  "reschedule_requested",
  "rescheduled_revived",
  "no_change",
  "duplicate",
] as const;

/** Outcomes the mentor should look at (design §3.3, frozen vocabulary). */
export const ATTENTION_OUTCOMES = [
  "unmatched",
  "unmatched_direct_booking",
  "ambiguous",
  "organizer_mismatch",
  "stale_state",
  "ignored",
  "unrecognised_payload",
  "invalid_payload",
] as const;

export type CalOutcome = (typeof WORKING_OUTCOMES)[number] | (typeof ATTENTION_OUTCOMES)[number];

const WORKING = new Set<string>(WORKING_OUTCOMES);
const ATTENTION = new Set<string>(ATTENTION_OUTCOMES);

/** Cal.com triggers the setup steps ask for, plus PING. */
export const KNOWN_TRIGGERS = [
  "PING",
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REQUESTED",
  "BOOKING_REJECTED",
] as const;
const TRIGGERS = new Set<string>(KNOWN_TRIGGERS);

export type OutcomeTone = "working" | "attention" | "unknown";

export function outcomeTone(outcome: string | null | undefined): OutcomeTone {
  if (outcome && WORKING.has(outcome)) return "working";
  if (outcome && ATTENTION.has(outcome)) return "attention";
  return "unknown";
}

/** i18n key for an outcome (`calSync.outcomes.*`); anything outside the vocabulary maps to `unknown`. */
export function outcomeCopyKey(outcome: string | null | undefined): string {
  return outcome && (WORKING.has(outcome) || ATTENTION.has(outcome))
    ? `calSync.outcomes.${outcome}`
    : "calSync.outcomes.unknown";
}

/** i18n key for a trigger (`calSync.triggers.*`), or null for one we do not name (shown raw). */
export function triggerCopyKey(trigger: string | null | undefined): string | null {
  const upper = String(trigger ?? "").toUpperCase();
  return TRIGGERS.has(upper) ? `calSync.triggers.${upper}` : null;
}

export type CalSyncStatus =
  | { kind: "not_connected" }
  | { kind: "working" | "attention"; at: string; trigger: string | null; outcome: string | null };

/** What the status pill says: nothing delivered yet, working, or needs attention. */
export function calSyncStatus(info: Pick<CalWebhookInfo, "last_delivery_at" | "last_trigger" | "last_outcome"> | null | undefined): CalSyncStatus {
  if (!info?.last_delivery_at) return { kind: "not_connected" };
  const tone = outcomeTone(info.last_outcome);
  return {
    kind: tone === "attention" ? "attention" : "working",
    at: info.last_delivery_at,
    trigger: info.last_trigger ?? null,
    outcome: info.last_outcome ?? null,
  };
}

function defaultOrigin(): string {
  const configured = String(import.meta.env?.VITE_PUBLIC_APP_ORIGIN ?? "").trim();
  if (configured) return configured;
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** The Subscriber URL a mentor pastes into Cal.com. */
export function subscriberUrl(mentorId: string, origin: string = defaultOrigin()): string {
  return origin.replace(/\/+$/, "") + "/api/webhooks/cal?mentor=" + encodeURIComponent(mentorId);
}

/** True when the URL points at the production deployment (Cal.com cannot reach protected previews). */
export function isProductionUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

/** `•••• 9f3a` — enough to tell two secrets apart, never enough to use one. */
export function maskSecret(secret: string | null | undefined): string {
  const value = String(secret ?? "");
  return value ? `•••• ${value.slice(-4)}` : "••••";
}

/** PostgREST could not find the RPC: migration 0002 is not applied yet ("Sync is not available yet"). */
export function isSyncUnavailableError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? "").toUpperCase();
  return code === "PGRST202" || code === "42883";
}

export type RpcCall = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Normalises the RPC's jsonb (object, or a one-row array from older PostgREST shapes). */
export function toCalWebhookInfo(data: unknown, mentorId: string): CalWebhookInfo {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  const total = Number(row?.deliveries_total ?? 0);
  return {
    mentor_id: text(row?.mentor_id) ?? mentorId,
    secret: text(row?.secret),
    created_at: text(row?.created_at),
    rotated_at: text(row?.rotated_at),
    previous_valid_until: text(row?.previous_valid_until),
    last_delivery_at: text(row?.last_delivery_at),
    last_trigger: text(row?.last_trigger),
    last_outcome: text(row?.last_outcome),
    deliveries_total: Number.isFinite(total) ? total : 0,
  };
}

export function toRotatedCalSecret(data: unknown): RotatedCalSecret {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  return {
    secret: text(row?.secret),
    rotated_at: text(row?.rotated_at),
    previous_valid_until: text(row?.previous_valid_until),
  };
}

/** Owner only (42501 otherwise). Creates the row with a fresh secret on first call. */
export async function getMyCalWebhook(rpc: RpcCall, mentorId: string): Promise<CalWebhookInfo> {
  const { data, error } = await rpc("get_my_cal_webhook", { p_mentor_id: mentorId });
  if (error) throw error;
  return toCalWebhookInfo(data, mentorId);
}

/** The old secret keeps working for 24 hours (design §3.2). */
export async function rotateCalWebhookSecret(rpc: RpcCall, mentorId: string): Promise<RotatedCalSecret> {
  const { data, error } = await rpc("rotate_cal_webhook_secret", { p_mentor_id: mentorId });
  if (error) throw error;
  return toRotatedCalSecret(data);
}
