import type { TFunction } from "i18next";

import type { Booking, Mentor } from "@/lib/database";
import type { SentRequest } from "@/lib/sentRequests";
import { DEFAULT_STOPS, type RailStop, type RailStopState } from "@/components/RequestRail";

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
      /** The visible row's id (signed-in users) — what "Choose a time" confirms. */
      bookingId?: string;
      /** The mentor's Cal.com link, released to the mentee once the row is accepted. */
      calLink?: string;
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
  bookings: ReadonlyArray<Booking & { mentor?: Pick<Mentor, "cal_link"> | null }> | undefined;
  viewerEmail: string | undefined;
  local: SentRequest | null;
}): RequestState {
  const { mentorId, isAvailable, bookings, viewerEmail, local } = params;
  const row = (bookings ?? [])
    .filter((b) => b.mentor_id === mentorId && ACTIVE_REQUEST_STATUSES.includes(b.status))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (row && viewerEmail) {
    return {
      kind: "sent",
      email: viewerEmail,
      sentAt: row.created_at,
      status: row.status,
      bookingId: row.id,
      calLink: row.mentor?.cal_link || undefined,
      source: "row",
    };
  }
  if (local && (!viewerEmail || sameEmail(local.email, viewerEmail))) {
    return { kind: "sent", email: local.email, sentAt: local.sentAt, source: "local" };
  }
  return isAvailable ? { kind: "cta" } : { kind: "unavailable" };
}

/**
 * True while a request the mentee cannot add to is live: a visible
 * pending/accepted/confirmed row, or the local memory (which only ever
 * records a request that went out and has not been answered as far as this
 * browser knows). "Send another request" is offered only when this is false.
 */
export function hasOpenRequest(request: RequestState): boolean {
  if (request.kind !== "sent") return false;
  return request.status === undefined || ACTIVE_REQUEST_STATUSES.includes(request.status);
}

/**
 * Rail progress for a request state (F-09): the ONE mapping from request
 * state to the three stops of the request rail, shared by the profile rail
 * card, the mobile action bar, the booking success state, the landing hero
 * and the dashboard so the rail and the StatusBadge never tell two stories
 * on one page.
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
 *
 * `options.hasLink` overrides the link the state itself carries (`calLink`).
 */
export function railStatesFor(request: RequestState, options: { hasLink?: boolean } = {}): RailProgress {
  if (request.kind !== "sent") return { states: ["next", "next", "next"], canChooseTime: false };
  const hasLink = options.hasLink ?? Boolean(request.calLink);
  switch (request.status) {
    case "accepted":
      return hasLink
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

/**
 * The three stops with state-aware labels: before anything is sent the
 * programme copy (`DEFAULT_STOPS`); once a request exists, the same labels
 * the dashboard rail uses ("Request sent", "{name} accepted your request" /
 * "… calendar link isn't set up yet", "Pick a time on their calendar link"),
 * so one request reads the same on the profile, in the dialog and on the
 * dashboard. `name` must already be wrapped by `bidi()`.
 */
export function railStopsFor(
  t: TFunction,
  request: RequestState,
  options: { signedIn?: boolean; name: string; hasLink?: boolean },
): { stops: RailStop[]; progress: RailProgress } {
  const progress = railStatesFor(request, { hasLink: options.hasLink });
  if (request.kind !== "sent") {
    return { stops: DEFAULT_STOPS(t, progress.states, { signedIn: options.signedIn }), progress };
  }
  const [s1, s2, s3] = progress.states;
  const replyLabel =
    s2 === "done"
      ? t("dashboardV2.rail.accepted", { name: options.name })
      : progress.waitingKey
        ? t(progress.waitingKey, { name: options.name })
        : t(options.signedIn ? "common.rail.step2SignedIn" : "common.rail.step2");
  return {
    progress,
    stops: [
      { label: t("dashboardV2.rail.sent"), state: s1 },
      { label: replyLabel, state: s2 },
      { label: t("common.rail.step3"), state: s3 },
    ],
  };
}
