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
import { isValidCalLink } from "@/lib/calLink";
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

/** The `/dashboard/bookings` tab a row belongs to. A confirmed session whose time has passed waits under Completed for its duration. */
export type BookingsTab = "requests" | "upcoming" | "completed" | "canceled";

function isPast(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  return !Number.isNaN(at) && at <= now;
}

export function bookingsTabFor(b: Pick<Booking, "status" | "scheduled_at">, now: number): BookingsTab {
  switch (b.status) {
    case "pending":
      return "requests";
    case "accepted":
      return "upcoming";
    case "confirmed":
      return isPast(b.scheduled_at, now) ? "completed" : "upcoming";
    case "completed":
      return "completed";
    default:
      return "canceled";
  }
}

export type RowAction = "accept" | "decline" | "complete" | "cancel" | "withdraw" | "chooseTime" | "chooseAnotherTime" | "reschedule";
export type RowNote =
  | "waitingForTime"
  | "timeRequested"
  | "timeRequestedMentor"
  | "timeDeclined"
  | "programmeArranges"
  | "mentorWillShare"
  | "awaitingCompletion"
  | "sessionPassed"
  | null;

/**
 * What a signed-in mentor or mentee can do with one of their own rows in
 * database mode (design C5), and the one-line note that explains the state.
 * Mirrors the status guard in the database: a mentor accepts or declines
 * pending requests, completes or cancels accepted/confirmed sessions; a
 * mentee withdraws a pending request, picks (or re-picks) a time on the
 * mentor's Cal.com link once accepted, reschedules a Cal booking, cancels.
 */
export function rowActionsFor(
  b: Pick<Booking, "status" | "scheduled_at" | "cal_event_uri" | "cal_status">,
  context: { role: "mentor" | "mentee"; now: number; hasCalLink: boolean; programmeManaged: boolean },
): { actions: RowAction[]; note: RowNote } {
  const past = isPast(b.scheduled_at, context.now);
  if (context.role === "mentor") {
    switch (b.status) {
      case "pending":
        return { actions: ["accept", "decline"], note: null };
      case "accepted":
        return { actions: ["complete", "cancel"], note: b.cal_status === "requested" ? "timeRequestedMentor" : "waitingForTime" };
      case "confirmed":
        return { actions: ["complete", "cancel"], note: past ? "awaitingCompletion" : null };
      default:
        return { actions: [], note: null };
    }
  }
  switch (b.status) {
    case "pending":
      return { actions: ["withdraw"], note: null };
    case "accepted":
      if (b.cal_status === "requested") return { actions: ["cancel"], note: "timeRequested" };
      if (b.cal_status === "rejected") return { actions: context.hasCalLink ? ["chooseAnotherTime", "cancel"] : ["cancel"], note: "timeDeclined" };
      if (!b.cal_event_uri && context.hasCalLink) return { actions: ["chooseTime", "cancel"], note: null };
      return { actions: ["cancel"], note: context.programmeManaged ? "programmeArranges" : "mentorWillShare" };
    case "confirmed":
      if (past) return { actions: [], note: "sessionPassed" };
      return { actions: b.cal_event_uri && context.hasCalLink ? ["reschedule", "cancel"] : ["cancel"], note: null };
    default:
      return { actions: [], note: null };
  }
}

/** The "Make the page yours" steps on the mentor home. */
export const CHECKLIST_KEYS = ["availability", "profile", "sessions", "calendar", "share"] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

/** The profile fields a mentee judges the page by: photo, headline, bio and the areas mentored on. */
export function mentorProfileComplete(m: Pick<Mentor, "name" | "bio" | "photo_url" | "expertise" | "position" | "company"> | null | undefined): boolean {
  if (!m) return false;
  return Boolean(m.name?.trim() && m.bio?.trim() && m.photo_url?.trim() && (m.expertise?.length ?? 0) > 0 && (m.position?.trim() || m.company?.trim()));
}

/**
 * Checklist state computed from the database (design C6, F40), never ticked by
 * hand — except "share", which only this browser can know about.
 */
export function checklistDone(input: {
  mentor: Pick<Mentor, "name" | "bio" | "photo_url" | "expertise" | "position" | "company" | "cal_link"> | null | undefined;
  availabilityWindows: number;
  bookings: number;
  shared: boolean;
}): Set<ChecklistKey> {
  const done = new Set<ChecklistKey>();
  if (input.availabilityWindows > 0) done.add("availability");
  if (mentorProfileComplete(input.mentor)) done.add("profile");
  if (input.bookings > 0) done.add("sessions");
  if (isValidCalLink(input.mentor?.cal_link)) done.add("calendar");
  if (input.shared) done.add("share");
  return done;
}

/** Confirmed sessions starting within `days` from `now` (the home's "upcoming" strip). */
export function upcomingWithin<T extends Pick<Booking, "status" | "scheduled_at">>(rows: readonly T[], now: number, days: number): T[] {
  const end = now + days * 86_400_000;
  return rows
    .filter((b) => {
      if (b.status !== "confirmed" || !b.scheduled_at) return false;
      const at = new Date(b.scheduled_at).getTime();
      return !Number.isNaN(at) && at > now && at <= end;
    })
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
}
