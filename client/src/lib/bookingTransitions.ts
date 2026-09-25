/**
 * Which booking statuses a client write may start from (R1-16). Pure: no Supabase import, so
 * node vitest covers it.
 *
 * Every status change the app makes through PostgREST is a conditional update: it only
 * matches a row that is still in one of these statuses. Two tabs (or a person and Cal.com)
 * acting on the same booking cannot both win: the second write matches no row, changes
 * nothing, notifies nobody, and the person is told the booking changed in the meantime.
 * Without the condition a stale "Cancel" re-cancelled a session the mentee had already
 * cancelled (overwriting canceled_at and telling the mentee the MENTOR cancelled), and a
 * second "Mark completed" overwrote the recorded duration and notified twice.
 */
import type { Booking } from "@/lib/database";

type Status = Booking["status"];

const ALLOWED_FROM: Partial<Record<Status, readonly Status[]>> = {
  accepted: ["pending"],
  rejected: ["pending"],
  confirmed: ["accepted"],
  completed: ["accepted", "confirmed"],
  canceled: ["pending", "accepted", "confirmed"],
};

/** The statuses a change to `target` may start from; undefined for a target the app never writes. */
export function allowedFromStatuses(target: Status | string): readonly Status[] | undefined {
  return ALLOWED_FROM[target as Status];
}

/** Whether a booking now in `current` may still move to `target` (so a write that matched nothing lost a race only when this is false). */
export function canTransition(current: Status | string, target: Status | string): boolean {
  const from = allowedFromStatuses(target);
  return from ? from.includes(current as Status) : true;
}
