/**
 * Which booking rows the `/dashboard/*` pages show (design C4, fix F01). Pure:
 * types only, no Supabase or storage access, so node vitest proves the rules.
 *
 * - Database mode: ONLY the caller's own rows from the per-role query (a
 *   mentor's bookings, a mentee's bookings, or everything for an admin under
 *   RLS). Never mock rows, never browser rows, never a "demo" badge. No
 *   profile yet (an approved mentor who has not onboarded, a mentee who has
 *   not registered) means no rows and `needsProfile`.
 * - Local (demo) mode: unchanged — a local account sees its own browser rows;
 *   the showcase (no account) sees the browser rows plus the seeded sample set
 *   behind the "Demo data" badge.
 */
import type { Booking, Mentee, Mentor } from "@/lib/database";

export type DashboardRole = "mentor" | "mentee" | "admin";

/** A booking with the counterpart embedded by the per-role query (mentee for mentors, mentor for mentees). */
export type DashboardBooking = Booking & { mentee?: Mentee | null; mentor?: Mentor | null };

export interface SelectRowsInput<T extends Booking> {
  isLocal: boolean;
  role: DashboardRole | null;
  profileId: string | null;
  /** Database mode: rows returned by the caller's own query (undefined while loading). */
  dbRows?: readonly T[];
  /** Local mode: rows people created in this browser. */
  localRows?: readonly Booking[];
  /** Local mode: the seeded sample set for the showcase. */
  mockRows?: readonly Booking[];
}

export interface SelectedRows<T extends Booking> {
  rows: T[];
  /** True only in local mode for the showcase picture; always false in database mode. */
  demo: boolean;
  /** Database mode: the signed-in mentor/mentee has no profile row yet. */
  needsProfile: boolean;
}

/** Keep only rows the role is a party to (defence in depth on top of RLS). */
export function ownRows<T extends Pick<Booking, "mentor_id" | "mentee_id">>(rows: readonly T[], role: DashboardRole | null, profileId: string | null): T[] {
  if (role === "admin") return rows.slice();
  if (!profileId) return [];
  if (role === "mentor") return rows.filter((b) => b.mentor_id === profileId);
  if (role === "mentee") return rows.filter((b) => b.mentee_id === profileId);
  return [];
}

export function selectDashboardRows<T extends Booking>(input: SelectRowsInput<T>): SelectedRows<T | Booking> {
  const { isLocal, role, profileId } = input;
  if (!isLocal) {
    const needsProfile = (role === "mentor" || role === "mentee") && !profileId;
    if (needsProfile || !role) return { rows: [], demo: false, needsProfile };
    return { rows: ownRows(input.dbRows ?? [], role, profileId), demo: false, needsProfile: false };
  }
  const local = input.localRows ?? [];
  if (profileId && role) {
    return { rows: ownRows(local, role, profileId), demo: false, needsProfile: false };
  }
  return { rows: [...local, ...(input.mockRows ?? [])], demo: true, needsProfile: false };
}

/** `2026-09-24T10:00:00` (a `timestamp without time zone`, stored as UTC) → `2026-09-24T10:00:00Z`. */
export function asUtcIso(value: string | null | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  const trimmed = value.trim().replace(" ", "T");
  // Already carries an offset or a Z.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return trimmed;
  // Date-time without an offset: PostgREST returns base-table timestamps this way (UTC wall-clock).
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return `${trimmed}Z`;
  return trimmed;
}

const TIME_FIELDS = ["scheduled_at", "clicked_at", "responded_at", "completed_at", "canceled_at", "created_at", "cal_requested_start"] as const;

/**
 * Base-table timestamps are UTC wall-clock without a zone (open risk R14), and
 * `new Date("2026-09-24T10:00:00")` would read them as the viewer's local time.
 * Normalising them once here makes every dashboard time correct in the
 * viewer's zone.
 */
export function normalizeBookingTimes<T extends Booking>(row: T): T {
  const out = { ...row } as T;
  for (const field of TIME_FIELDS) {
    const value = (row as Record<string, unknown>)[field];
    if (typeof value === "string") (out as Record<string, unknown>)[field] = asUtcIso(value);
  }
  return out;
}

/** Sum of recorded session durations, and how many completed sessions have none (never assumed 30 min). */
export function recordedMinutes(rows: ReadonlyArray<Pick<Booking, "status" | "session_duration_minutes">>): { minutes: number; missing: number } {
  let minutes = 0;
  let missing = 0;
  for (const b of rows) {
    if (b.status !== "completed") continue;
    if (typeof b.session_duration_minutes === "number" && Number.isFinite(b.session_duration_minutes) && b.session_duration_minutes > 0) minutes += b.session_duration_minutes;
    else missing += 1;
  }
  return { minutes, missing };
}

/** Name for greetings: the profile row's name, else the local part of the email. */
export function displayNameFor(name: string | null | undefined, email: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) return trimmed;
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  return local;
}

/** First word of a display name ("Layla Haddad" → "Layla"; an email local part stays whole). */
export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}
