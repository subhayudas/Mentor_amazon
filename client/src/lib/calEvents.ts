/**
 * Cal.com embed events and config (design §3.6, B6, F26/F28/F45). Pure: no
 * DOM, no Supabase, so node vitest covers every payload shape.
 *
 * The embed reports a booking through `bookingSuccessfulV2` and a reschedule
 * through `rescheduleBookingSuccessfulV2` (the V1 events are deprecated). Both
 * carry `{ uid, title, startTime, endTime, eventTypeId, status, … }`. `status`
 * is `ACCEPTED`, or `PENDING` when the mentor's event type requires
 * confirmation; the embed confirm RPC (`record_cal_booking_from_embed`) and
 * the webhook both key on it.
 */
import { calRescheduleLink, normalizeCalLink } from "@/lib/calLink";

/** What the embed hands back after a booking or a reschedule, normalised. */
export interface CalBookingSuccess {
  /** Cal.com booking uid of the (new) booking. */
  uid?: string;
  /** ISO 8601 in UTC (`…Z`). */
  startTime?: string;
  endTime?: string;
  /** Upper-case Cal.com status: `ACCEPTED`, `PENDING`, … */
  status?: string;
  /** The uid being replaced, for a reschedule (supplied by the dialog, not by Cal.com). */
  rescheduleUid?: string;
}

/** Same shape the confirm RPC validates (`^[A-Za-z0-9_-]{6,128}$`). */
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Any parseable date string → ISO in UTC; anything else → undefined. */
export function toUtcIso(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

export function normalizeCalStatus(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toUpperCase();
  return /^[A-Z_]{2,32}$/.test(status) ? status : undefined;
}

export function isCalUid(value: unknown): value is string {
  return typeof value === "string" && UID_RE.test(value);
}

/**
 * The embed event handlers receive `CustomEvent<{ data }>`; accept the event,
 * its `detail`, or the data object itself.
 */
function payloadOf(input: unknown): Record<string, unknown> {
  const record = asRecord(input);
  const detail = asRecord(record.detail);
  if ("data" in detail) return asRecord(detail.data);
  if ("data" in record && !("uid" in record)) return asRecord(record.data);
  return record;
}

/** `bookingSuccessfulV2` → `CalBookingSuccess`; invalid fields become undefined. */
export function parseBookingSuccessV2(input: unknown): CalBookingSuccess {
  const data = payloadOf(input);
  return {
    uid: isCalUid(data.uid) ? data.uid : undefined,
    startTime: toUtcIso(data.startTime),
    endTime: toUtcIso(data.endTime),
    status: normalizeCalStatus(data.status),
  };
}

/** `rescheduleBookingSuccessfulV2` → the NEW booking; the caller adds `rescheduleUid`. */
export function parseRescheduleSuccessV2(input: unknown, rescheduleUid?: string): CalBookingSuccess {
  const parsed = parseBookingSuccessV2(input);
  return isCalUid(rescheduleUid) ? { ...parsed, rescheduleUid } : parsed;
}

/** True when the embed told us enough to record the booking (uid and start time). */
export function isRecordable(detail: CalBookingSuccess): detail is CalBookingSuccess & { uid: string; startTime: string } {
  return isCalUid(detail.uid) && typeof detail.startTime === "string";
}

/** The event the dialog listens for. */
export function calSuccessEvent(rescheduleUid?: string): "bookingSuccessfulV2" | "rescheduleBookingSuccessfulV2" {
  return rescheduleUid ? "rescheduleBookingSuccessfulV2" : "bookingSuccessfulV2";
}

/**
 * The link the embed opens: the reschedule page for an existing booking,
 * otherwise the mentor's own normalised `username/event` (empty when unusable).
 */
export function calEmbedLink(calLink: string | null | undefined, rescheduleUid?: string): string {
  if (rescheduleUid && isCalUid(rescheduleUid)) return calRescheduleLink(rescheduleUid);
  return normalizeCalLink(calLink);
}

/**
 * Embed config: prefills the booking form and tags the Cal.com booking with our
 * booking id (`metadata[mc_booking]`), which the webhook cross-checks against
 * the mentor and an attendee email before trusting it.
 */
export function calEmbedConfig(input: { menteeName?: string; menteeEmail?: string; bookingId?: string }): Record<string, string> {
  const config: Record<string, string> = {};
  const name = input.menteeName?.trim();
  const email = input.menteeEmail?.trim();
  if (name) config.name = name;
  if (email) config.email = email;
  if (input.bookingId) config["metadata[mc_booking]"] = input.bookingId;
  return config;
}

/** Outcomes of `record_cal_booking_from_embed` (design §3.2). */
export type EmbedRecordOutcome = "confirmed" | "requested" | "rescheduled" | "reschedule_requested" | "already_recorded";

export function toEmbedRecordOutcome(data: unknown): EmbedRecordOutcome | null {
  const row = asRecord(Array.isArray(data) ? data[0] : data);
  const outcome = typeof row.outcome === "string" ? row.outcome : typeof data === "string" ? data : "";
  return (["confirmed", "requested", "rescheduled", "reschedule_requested", "already_recorded"] as const).find((o) => o === outcome) ?? null;
}

/**
 * Toast copy for an outcome (null = refetch silently). Keys live in
 * `dashboardV2.cal.*`; `requested` / `reschedule_requested` interpolate the
 * mentor's name.
 */
export function embedOutcomeToastKey(outcome: EmbedRecordOutcome | null): string | null {
  switch (outcome) {
    case "confirmed":
      return "dashboardV2.cal.toastConfirmed";
    case "requested":
      return "dashboardV2.cal.toastRequested";
    case "rescheduled":
      return "dashboardV2.cal.toastRescheduled";
    case "reschedule_requested":
      return "dashboardV2.cal.toastRescheduleRequested";
    case "already_recorded":
    case null:
    default:
      return null;
  }
}
