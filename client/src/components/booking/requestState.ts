import type { Booking } from "@/lib/database";
import type { SentRequest } from "@/lib/sentRequests";

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
