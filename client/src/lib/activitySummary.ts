/**
 * Localised lines for booking events written by the database trigger
 * `bookings_activity_events` (design §3.5, C9, fix F22). The trigger stores an
 * English `summary` plus structured `meta`; the feed renders
 * the `showcase.activity.summaries.<key>` string from that meta so Arabic
 * readers get Arabic lines, and falls back to `summary` for anything else
 * (settings, favourites, registrations, older rows). Pure: no i18n, no
 * Supabase, so node vitest proves the mapping.
 */
import type { ActivityEvent, ActivityType } from "@/lib/database";

/** Event types the trigger writes (design §3.5 type mapping). */
export const TRIGGER_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  "request_sent",
  "request_accepted",
  "request_declined",
  "booking_confirmed",
  "booking_rescheduled",
  "session_completed",
  "booking_canceled",
  "booking_time_requested",
  "booking_time_declined",
  "feedback_left",
]);

export interface TriggerSummary {
  /** Suffix under `showcase.activity.summaries.` */
  key: string;
  params: { mentor: string; mentee: string; when?: string; minutes?: number };
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

/**
 * The summary key and interpolation params for a trigger event (or a
 * reminder written by the cron, `meta.source = 'cron'`), or `null` for
 * anything else (render `event.summary`).
 * `formatWhen` formats `meta.scheduled_at` (ISO) in the viewer's zone;
 * `fallbacks` name a party whose row no longer has a name.
 */
export function triggerSummary(
  event: Pick<ActivityEvent, "type" | "actor_type" | "meta">,
  options: { formatWhen: (iso: string) => string; fallbacks: { mentor: string; mentee: string } },
): TriggerSummary | null {
  const meta = event.meta && typeof event.meta === "object" ? (event.meta as Record<string, unknown>) : null;
  if (meta?.source === "cron" && event.type === "reminder_sent" && (meta.kind === "1h" || meta.kind === "24h")) {
    return { key: meta.kind === "1h" ? "reminder_sent_1h" : "reminder_sent_24h", params: { mentor: options.fallbacks.mentor, mentee: options.fallbacks.mentee } };
  }
  if (!meta || meta.source !== "db_trigger" || !TRIGGER_TYPES.has(event.type)) return null;

  const mentor = text(meta.mentor_name) ?? options.fallbacks.mentor;
  const mentee = text(meta.mentee_name) ?? options.fallbacks.mentee;
  const scheduledAt = text(meta.scheduled_at);
  const when = scheduledAt && !Number.isNaN(new Date(scheduledAt).getTime()) ? options.formatWhen(scheduledAt) : undefined;
  const rawMinutes = meta.duration_minutes;
  const minutes = typeof rawMinutes === "number" && Number.isFinite(rawMinutes) && rawMinutes > 0 ? Math.round(rawMinutes) : undefined;
  const fromCal = meta.change_source === "cal";
  const byAdmin = event.actor_type === "admin" || meta.change_source === "admin";
  const params = { mentor, mentee, ...(when ? { when } : {}), ...(minutes ? { minutes } : {}) };

  switch (event.type) {
    case "request_sent":
      return { key: "request_sent", params };
    case "request_accepted":
      return { key: byAdmin ? "request_accepted_admin" : "request_accepted", params };
    case "request_declined":
      return { key: byAdmin ? "request_declined_admin" : "request_declined", params };
    case "booking_confirmed":
      return { key: when ? "booking_confirmed" : "booking_confirmed_untimed", params };
    case "booking_rescheduled":
      return { key: when ? "booking_rescheduled" : "booking_rescheduled_untimed", params };
    case "session_completed":
      return { key: minutes ? "session_completed" : "session_completed_untimed", params };
    case "booking_canceled":
      if (fromCal) return { key: "booking_canceled_cal", params };
      if (byAdmin) return { key: "booking_canceled_admin", params };
      if (event.actor_type === "mentor") return { key: "booking_canceled_mentor", params };
      if (event.actor_type === "mentee") return { key: "booking_canceled_mentee", params };
      return { key: "booking_canceled", params };
    case "booking_time_requested":
      return { key: when ? "booking_time_requested" : "booking_time_requested_untimed", params };
    case "booking_time_declined":
      return { key: "booking_time_declined", params };
    case "feedback_left":
      return { key: "feedback_left", params };
    default:
      return null;
  }
}

/** Every summary key `triggerSummary` can return (the locale test checks each exists in EN and AR). */
export const TRIGGER_SUMMARY_KEYS: readonly string[] = [
  "request_sent",
  "request_accepted",
  "request_accepted_admin",
  "request_declined",
  "request_declined_admin",
  "booking_confirmed",
  "booking_confirmed_untimed",
  "booking_rescheduled",
  "booking_rescheduled_untimed",
  "session_completed",
  "session_completed_untimed",
  "booking_canceled",
  "booking_canceled_cal",
  "booking_canceled_admin",
  "booking_canceled_mentor",
  "booking_canceled_mentee",
  "booking_time_requested",
  "booking_time_requested_untimed",
  "booking_time_declined",
  "feedback_left",
  "reminder_sent_1h",
  "reminder_sent_24h",
];
