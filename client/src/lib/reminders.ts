import type { Booking } from "@/lib/database";
import { parseTimestamp } from "@/lib/timestamps";

/**
 * Session reminders. The app shows an in-app reminder for every confirmed
 * session that starts within the next 24 hours (and flags the last hour);
 * against a live project the hourly cron (`api/cron/reminders.ts`) also
 * writes a notification row and, when an email provider is configured,
 * sends the email. This helper is the single definition of "due soon" so
 * the dashboard, the bell and the cron agree.
 */
export type ReminderKind = "24h" | "1h";

export interface Reminder {
  booking: Booking;
  kind: ReminderKind;
  startsAt: Date;
  /** Minutes from now until the session starts. */
  minutesAway: number;
}

const H24 = 24 * 60;

export function dueReminders(bookings: readonly Booking[], now: Date = new Date()): Reminder[] {
  const out: Reminder[] = [];
  for (const b of bookings) {
    if (!b.scheduled_at || !["accepted", "confirmed"].includes(b.status)) continue;
    // Stored as UTC wall-clock with no offset: read it as UTC, not the viewer's zone.
    const startsAt = parseTimestamp(b.scheduled_at);
    if (!startsAt) continue;
    const minutesAway = Math.round((startsAt.getTime() - now.getTime()) / 60_000);
    if (minutesAway <= 0 || minutesAway > H24) continue;
    out.push({ booking: b, kind: minutesAway <= 60 ? "1h" : "24h", startsAt, minutesAway });
  }
  return out.sort((a, b) => a.minutesAway - b.minutesAway);
}
