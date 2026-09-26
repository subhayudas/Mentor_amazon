/**
 * Pure grouping of a mentee's bookings for the dashboard (P1-24, F-12). The DB
 * is the source of truth for `status`; this decides which list a row sits in
 * by what the MENTEE can do next, not by status alone:
 * - next: the earliest confirmed session with a future `scheduled_at`
 * - needsAction: accepted requests whose mentor has a calendar link — the
 *   mentee owes the next step (pick a time)
 * - waiting: pending requests, and accepted requests whose mentor has no
 *   calendar link yet (the mentee can only wait); accepted rows first
 * - upcoming: the other confirmed future sessions, soonest first, then
 *   confirmed sessions whose time Cal.com never reported ("Time not recorded")
 * - past: completed, cancelled, declined, and confirmed sessions whose time
 *   has passed without the mentor marking them complete
 * The needsAction / waiting split is `railStatesFor` (F-09), so the request
 * rail beside the group and the group heading never disagree.
 */
import type { Booking, Mentor } from "@/lib/database";
import { timestampMs } from "@/lib/timestamps";
import { railStatesFor, type RailProgress } from "@/components/booking/requestState";

export type BookingWithMentor = Booking & { mentor?: Mentor };

/** Whether the mentor on this row has published a calendar link the mentee can use. */
export function hasSchedulingLink(b: Booking & { mentor?: Pick<Mentor, "cal_link"> }): boolean {
  return Boolean(b.mentor?.cal_link);
}

/** Rail progress for one of the mentee's own rows (the row IS the request state). */
export function railProgressFor(b: Booking & { mentor?: Pick<Mentor, "cal_link"> }): RailProgress {
  return railStatesFor(
    { kind: "sent", email: "", sentAt: b.created_at, status: b.status, source: "row" },
    { hasLink: hasSchedulingLink(b) },
  );
}

export interface GroupedBookings<T extends Booking> {
  next: T | null;
  needsAction: T[];
  waiting: T[];
  upcoming: T[];
  past: T[];
}

/** Whether a stored timestamp (UTC wall-clock, lib/timestamps.ts) is after `now`. */
export function isFuture(iso: string | null | undefined, now: Date = new Date()): boolean {
  const t = timestampMs(iso);
  return !Number.isNaN(t) && t > now.getTime();
}

const byScheduledAsc = <T extends Booking>(a: T, b: T) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "");
const byCreatedDesc = <T extends Booking>(a: T, b: T) => (b.created_at ?? "").localeCompare(a.created_at ?? "");
const byRecentDesc = <T extends Booking>(a: T, b: T) => {
  const ka = a.completed_at ?? a.canceled_at ?? a.responded_at ?? a.scheduled_at ?? a.created_at ?? "";
  const kb = b.completed_at ?? b.canceled_at ?? b.responded_at ?? b.scheduled_at ?? b.created_at ?? "";
  return kb.localeCompare(ka);
};

export function groupMenteeBookings<T extends Booking & { mentor?: Pick<Mentor, "cal_link"> }>(
  rows: readonly T[] | undefined,
  now: Date = new Date(),
): GroupedBookings<T> {
  const list = rows ?? [];
  const confirmedFuture = list.filter((b) => b.status === "confirmed" && isFuture(b.scheduled_at, now)).sort(byScheduledAsc);
  const confirmedNoTime = list.filter((b) => b.status === "confirmed" && !b.scheduled_at).sort(byCreatedDesc);
  const [next = null, ...rest] = confirmedFuture;
  const upcoming = [...rest, ...confirmedNoTime];
  const accepted = list.filter((b) => b.status === "accepted").sort(byCreatedDesc);
  const needsAction = accepted.filter((b) => railProgressFor(b).canChooseTime);
  const waiting = [...accepted.filter((b) => !railProgressFor(b).canChooseTime), ...list.filter((b) => b.status === "pending").sort(byCreatedDesc)];
  const past = list
    .filter(
      (b) =>
        b.status === "completed" ||
        b.status === "canceled" ||
        b.status === "rejected" ||
        (b.status === "confirmed" && !!b.scheduled_at && !isFuture(b.scheduled_at, now)),
    )
    .sort(byRecentDesc);
  return { next, needsAction, waiting, upcoming, past };
}

/** Confirmed but the session time has passed and the mentor has not marked it complete. */
export function isConfirmedPast(b: Booking, now: Date = new Date()): boolean {
  return b.status === "confirmed" && !!b.scheduled_at && !isFuture(b.scheduled_at, now);
}

/** Confirmed with no recorded time (Cal.com returned no start time). */
export function isConfirmedWithoutTime(b: Booking): boolean {
  return b.status === "confirmed" && !b.scheduled_at;
}
