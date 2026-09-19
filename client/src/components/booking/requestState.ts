import type { Booking } from "@/lib/database";
import type { SentRequest } from "@/lib/sentRequests";
import type { RailStopState } from "@/components/RequestRail";

/** Statuses that mean "a request to this mentor is live" (P1-21). */
export const ACTIVE_REQUEST_STATUSES: ReadonlyArray<Booking["status"]> = ["pending", "accepted", "confirmed"];

/**
 * What the request slot shows for one mentor:
 * - `cta`: accepting and nothing sent → the primary button;
 * - `unavailable`: not accepting → status text + "Find similar mentors";
 * - `sent`: a live booking row (signed in) or the 7-day localStorage memory.
 */
export type RequestState =
  | { kind: "cta" }
  | { kind: "unavailable" }
  | {
      kind: "sent";
      email: string;
      sentAt: string;
      /** Present when a real booking row is visible (signed-in users). */
      status?: Booking["status"];
      source: "row" | "local";
    };

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Prefer the real row (newest live booking for this mentor) over the local
 * memory; fall back to the memory only when no row is visible yet. A signed-in
 * viewer never inherits a memory written under a different email (someone
 * else may have used this browser anonymously).
 */
export function resolveRequestState(params: {
  mentorId: string;
  isAvailable: boolean;
  bookings: ReadonlyArray<Booking> | undefined;
  viewerEmail: string | undefined;
  local: SentRequest | null;
}): RequestState {
  const { mentorId, isAvailable, bookings, viewerEmail, local } = params;
  const row = (bookings ?? [])
    .filter((b) => b.mentor_id === mentorId && ACTIVE_REQUEST_STATUSES.includes(b.status))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (row && viewerEmail) {
    return { kind: "sent", email: viewerEmail, sentAt: row.created_at, status: row.status, source: "row" };
  }
  if (local && (!viewerEmail || sameEmail(local.email, viewerEmail))) {
    return { kind: "sent", email: local.email, sentAt: local.sentAt, source: "local" };
  }
  return isAvailable ? { kind: "cta" } : { kind: "unavailable" };
}

/**
 * Rail progress for a request state (F-09): the ONE mapping from request
 * state to the three stops of the request rail, shared by the profile rail
 * card, the mobile action bar, the landing hero and the dashboard so the rail
 * and the StatusBadge never tell two stories on one page.
 */
export interface RailProgress {
  states: [RailStopState, RailStopState, RailStopState];
  /**
   * i18n key of the sentence to show under the rail when the mentee can only
   * wait: the mentor accepted but has no calendar link yet. Interpolates
   * `{ name }` (pass it through `bidi()`).
   */
  waitingKey?: string;
  /** The mentee owes the next action — pick a time on the mentor's calendar link. */
  canChooseTime: boolean;
}

export const RAIL_WAITING_FOR_LINK_KEY = "dashboardV2.rail.acceptedNoLink";

/**
 * - `cta` / `unavailable` (nothing sent) → all `next`;
 * - sent with no visible row (localStorage memory) or `pending` → ['done', 'current', 'next'];
 * - `accepted` without a calendar link → ['done', 'current', 'next'] + the waiting sentence;
 * - `accepted` with a link → ['done', 'done', 'current'] and `canChooseTime`;
 * - `confirmed` (and later) → all `done`.
 */
export function railStatesFor(request: RequestState, options: { hasLink?: boolean } = {}): RailProgress {
  if (request.kind !== "sent") return { states: ["next", "next", "next"], canChooseTime: false };
  switch (request.status) {
    case "accepted":
      return options.hasLink
        ? { states: ["done", "done", "current"], canChooseTime: true }
        : { states: ["done", "current", "next"], waitingKey: RAIL_WAITING_FOR_LINK_KEY, canChooseTime: false };
    case "confirmed":
    case "completed":
      return { states: ["done", "done", "done"], canChooseTime: false };
    case "pending":
    case undefined:
    default:
      return { states: ["done", "current", "next"], canChooseTime: false };
  }
}
