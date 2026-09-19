/**
 * Pure grouping of a mentee's bookings for the dashboard (P1-24). The DB is
 * the source of truth for `status`; this only decides which list a row sits in:
 * - next: the earliest confirmed session with a future `scheduled_at`
 * - needsAction: accepted requests (the mentee picks a time on the mentor's link)
 * - waiting: pending requests
 * - upcoming: the other confirmed future sessions, soonest first, then
 *   confirmed sessions whose time Cal.com never reported ("Time not recorded")
 * - past: completed, cancelled, declined, and confirmed sessions whose time
 *   has passed without the mentor marking them complete
 */
import type { Booking, Mentor } from "@/lib/database";

export type BookingWithMentor = Booking & { mentor?: Mentor };

export interface GroupedBookings<T extends Booking> {
  next: T | null;
  needsAction: T[];
  waiting: T[];
  upcoming: T[];
  past: T[];
}

export function isFuture(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t > now.getTime();
}

const byScheduledAsc = <T extends Booking>(a: T, b: T) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "");
const byCreatedDesc = <T extends Booking>(a: T, b: T) => (b.created_at ?? "").localeCompare(a.created_at ?? "");
const byRecentDesc = <T extends Booking>(a: T, b: T) => {
  const ka = a.completed_at ?? a.canceled_at ?? a.responded_at ?? a.scheduled_at ?? a.created_at ?? "";
  const kb = b.completed_at ?? b.canceled_at ?? b.responded_at ?? b.scheduled_at ?? b.created_at ?? "";
  return kb.localeCompare(ka);
};

export function groupMenteeBookings<T extends Booking>(rows: readonly T[] | undefined, now: Date = new Date()): GroupedBookings<T> {
  const list = rows ?? [];
  const confirmedFuture = list.filter((b) => b.status === "confirmed" && isFuture(b.scheduled_at, now)).sort(byScheduledAsc);
  const confirmedNoTime = list.filter((b) => b.status === "confirmed" && !b.scheduled_at).sort(byCreatedDesc);
  const [next = null, ...rest] = confirmedFuture;
  const upcoming = [...rest, ...confirmedNoTime];
  const needsAction = list.filter((b) => b.status === "accepted").sort(byCreatedDesc);
  const waiting = list.filter((b) => b.status === "pending").sort(byCreatedDesc);
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
