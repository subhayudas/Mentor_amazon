import type { TFunction } from "i18next";

import type { Booking, Mentor } from "@/lib/database";
import type { SentRequest } from "@/lib/sentRequests";
import { DEFAULT_STOPS, type RailStop, type RailStopState } from "@/components/RequestRail";
import { isFeaturedDbId } from "@/data/featuredMentors";

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
      /**
       * State of the time the mentee picked on Cal.com (F28): `requested` while a
       * requires-confirmation event waits for the mentor, `rejected` when the
       * mentor declined that time (the mentee chooses another).
       */
      calStatus?: Booking["cal_status"];
      /** A curated, programme-managed mentor: the programme team arranges the time by email. */
      programmeManaged?: boolean;
    };

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The per-browser "request sent" memory as one viewer may see it: anyone
 * signed out sees it; a signed-in viewer only when they sent it signed in, from
 * their own address. Someone else may have used this browser anonymously, and a
 * signed-out send proves nothing about the account: for an address that has one,
 * the server created nothing and answered the same (R1-08), so their own rows
 * decide (R2-01). One rule for the cards, the profile and the scheduler.
 */
export function sentMemoryForViewer(memory: SentRequest | null, viewerEmail: string | null | undefined): SentRequest | null {
  if (!memory) return null;
  if (!viewerEmail) return memory;
  return !memory.anonymous && sameEmail(memory.email, viewerEmail) ? memory : null;
}

type VisibleBookings = ReadonlyArray<Booking & { mentor?: Pick<Mentor, "cal_link"> | null }>;

/**
 * Whether the per-browser memory is out of date for a signed-in viewer: their
 * bookings were fetched after the send (`bookingsAsOf`, epoch ms, react-query's
 * `dataUpdatedAt`) and hold no live request to this mentor, because it was
 * declined, withdrawn or removed. The memory only stands in for a row nobody can
 * read back (anonymous requesters) and bridges a send until the refetch lands.
 * Without this rule, a signed-in mentee saw "Request sent" and no request
 * button for up to 7 days after a decline.
 */
export function isSentMemoryStale(params: {
  mentorId: string;
  bookings: VisibleBookings | undefined;
  bookingsAsOf: number | undefined;
  viewerEmail: string | undefined;
  local: SentRequest | null;
}): boolean {
  const { mentorId, bookings, bookingsAsOf, viewerEmail, local } = params;
  if (!local || !viewerEmail || bookings === undefined || !bookingsAsOf) return false;
  const sentAt = Date.parse(local.sentAt);
  if (Number.isNaN(sentAt) || bookingsAsOf < sentAt) return false;
  return !bookings.some((b) => b.mentor_id === mentorId && ACTIVE_REQUEST_STATUSES.includes(b.status));
}

/**
 * Prefer the real row (newest live booking for this mentor) over the local
 * memory; fall back to the memory only when no row is visible yet. A signed-in
 * viewer never inherits a memory written under a different email or while
 * signed out (`sentMemoryForViewer`), and once their bookings were fetched after
 * the send, those bookings decide (`isSentMemoryStale`).
 */
export function resolveRequestState(params: {
  mentorId: string;
  isAvailable: boolean;
  bookings: VisibleBookings | undefined;
  /** When `bookings` was fetched (epoch ms); lets a signed-in viewer's rows overrule the memory. */
  bookingsAsOf?: number;
  viewerEmail: string | undefined;
  local: SentRequest | null;
}): RequestState {
  const { mentorId, isAvailable, bookings, bookingsAsOf, viewerEmail, local } = params;
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
      calStatus: row.cal_status ?? null,
      programmeManaged: isFeaturedDbId(row.mentor_id),
    };
  }
  if (
    local &&
    sentMemoryForViewer(local, viewerEmail) &&
    !isSentMemoryStale({ mentorId, bookings, bookingsAsOf, viewerEmail, local })
  ) {
    return { kind: "sent", email: local.email, sentAt: local.sentAt, source: "local" };
  }
  return isAvailable ? { kind: "cta" } : { kind: "unavailable" };
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
  /**
   * i18n key replacing the third stop's label ("Pick a time…") when the time
   * step is in a special state: waiting for the mentor to confirm a requested
   * time, a declined time to replace, or the programme team arranging it.
   * Interpolates `{ name }` (pass it through `bidi()`).
   */
  stop3Key?: string;
  /** The mentor declined the time picked on Cal.com: the action reads "Choose another time". */
  chooseAnother?: boolean;
}

export const RAIL_WAITING_FOR_LINK_KEY = "dashboardV2.rail.acceptedNoLink";
export const RAIL_WAITING_CONFIRM_KEY = "dashboardV2.rail.waitingConfirm";
export const RAIL_TIME_DECLINED_KEY = "dashboardV2.rail.timeDeclined";
export const RAIL_PROGRAMME_TEAM_KEY = "dashboardV2.rail.programmeTeam";

/**
 * - `cta` / `unavailable` (nothing sent) → all `next`;
 * - sent with no visible row (localStorage memory) or `pending` → ['done', 'current', 'next'];
 * - `accepted` with a Cal.com time awaiting the mentor (`cal_status` requested)
 *   → ['done', 'done', 'current'], no action, "waiting for {name} to confirm";
 * - `accepted` without a calendar link → ['done', 'current', 'next'] + the waiting
 *   sentence; for a programme-managed mentor ['done', 'done', 'current'] + "the
 *   programme team will email you";
 * - `accepted` with a link → ['done', 'done', 'current'] and `canChooseTime`
 *   (`chooseAnother` when the mentor declined the last time picked);
 * - `confirmed` (and later) → all `done`.
 *
 * `options.hasLink` overrides the link the state itself carries (`calLink`).
 */
export function railStatesFor(request: RequestState, options: { hasLink?: boolean } = {}): RailProgress {
  if (request.kind !== "sent") return { states: ["next", "next", "next"], canChooseTime: false };
  const hasLink = options.hasLink ?? Boolean(request.calLink);
  switch (request.status) {
    case "accepted":
      if (request.calStatus === "requested") {
        return { states: ["done", "done", "current"], waitingKey: RAIL_WAITING_CONFIRM_KEY, stop3Key: RAIL_WAITING_CONFIRM_KEY, canChooseTime: false };
      }
      if (!hasLink) {
        return request.programmeManaged
          ? { states: ["done", "done", "current"], waitingKey: RAIL_PROGRAMME_TEAM_KEY, stop3Key: RAIL_PROGRAMME_TEAM_KEY, canChooseTime: false }
          : { states: ["done", "current", "next"], waitingKey: RAIL_WAITING_FOR_LINK_KEY, canChooseTime: false };
      }
      return request.calStatus === "rejected"
        ? { states: ["done", "done", "current"], stop3Key: RAIL_TIME_DECLINED_KEY, canChooseTime: true, chooseAnother: true }
        : { states: ["done", "done", "current"], canChooseTime: true };
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
  // A signed-out visitor's browser memory only knows that the form went out. The server never says
  // whether the email already has an account, and for one that does nothing reached the mentor
  // (R1-08), so that first stop reads "Request submitted". A signed-in request is exact.
  const firstLabel = request.source === "local" && !options.signedIn ? t("dashboardV2.rail.submitted") : t("dashboardV2.rail.sent");
  const replyLabel =
    s2 === "done"
      ? t("dashboardV2.rail.accepted", { name: options.name })
      : progress.waitingKey
        ? t(progress.waitingKey, { name: options.name })
        : t(options.signedIn ? "common.rail.step2SignedIn" : "common.rail.step2");
  return {
    progress,
    stops: [
      { label: firstLabel, state: s1 },
      { label: replyLabel, state: s2 },
      { label: progress.stop3Key ? t(progress.stop3Key, { name: options.name }) : t("common.rail.step3"), state: s3 },
    ],
  };
}
