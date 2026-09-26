/**
 * Reporting helpers for the programme analytics (volunteer hours, country cut,
 * flattened booking rows for tables/CSV) and the "complete session" write.
 *
 * Everything except completeSession() is pure. The write goes through
 * database.ts completeBooking, the conditional write every completion shares (R1-16).
 */

import { supabase } from "@/lib/supabase";
import { intlLocale } from "@/lib/format";
import { parseTimestamp, timestampMs } from "@/lib/timestamps";
import { localizedField } from "@/lib/localized";
import { db, type Booking, type Mentor, type Mentee } from "@/lib/database";

// Display helpers shared with forms, cards and admin tables live in
// lib/format.ts (F-04); they are re-exported here so the analytics chunk keeps
// one import while nothing eager has to import this module.
export { REPORTING_COUNTRIES, formatList, localizeCountry, localizeLanguage } from "@/lib/format";

/**
 * Sentinel for a booking with no country on it or its mentor. Callers render it
 * through t('analytics.notSpecified'); it is kept stable so grouping/drilling
 * can compare against it.
 */
export const NOT_SPECIFIED = "Not specified";

export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 600;
export const SESSION_MINUTE_PRESETS = [15, 30, 45, 60, 90] as const;

export type StatusGroup = "clicked" | "scheduled" | "completed" | "canceled";

/** Collapses the six booking statuses into the four groups the charts use. */
export function statusGroup(status: Booking["status"] | string): StatusGroup {
  switch (status) {
    case "confirmed":
      return "scheduled";
    case "completed":
      return "completed";
    case "canceled":
    case "rejected":
      return "canceled";
    default:
      return "clicked";
  }
}

export function getMentorCountry(mentor?: Pick<Mentor, "country"> | null): string | undefined {
  const country = mentor?.country?.trim();
  return country ? country : undefined;
}

/** booking.country, else the mentor's country, else the NOT_SPECIFIED sentinel. */
export function bookingCountry(
  booking: Pick<Booking, "country">,
  mentor?: Pick<Mentor, "country"> | null,
  fallback: string = NOT_SPECIFIED,
): string {
  const own = booking.country?.trim();
  if (own) return own;
  return getMentorCountry(mentor) ?? fallback;
}

export interface VolunteerHoursSummary {
  /** Sum of session_duration_minutes over completed sessions. */
  minutes: number;
  /** minutes / 60, rounded to one decimal. */
  hours: number;
  completed: number;
  withDuration: number;
  /** Completed sessions that have no recorded duration (excluded from the sum). */
  withoutDuration: number;
}

export function volunteerHours(
  bookings: Pick<Booking, "status" | "session_duration_minutes">[],
): VolunteerHoursSummary {
  let minutes = 0;
  let completed = 0;
  let withDuration = 0;
  bookings.forEach((booking) => {
    if (booking.status !== "completed") return;
    completed += 1;
    const duration = booking.session_duration_minutes;
    if (typeof duration === "number" && duration > 0) {
      minutes += duration;
      withDuration += 1;
    }
  });
  return {
    minutes,
    hours: minutesToHours(minutes),
    completed,
    withDuration,
    withoutDuration: completed - withDuration,
  };
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/** "12.5" - one decimal, always. */
export function formatHours(minutes: number): string {
  return minutesToHours(minutes).toFixed(1);
}

export interface CountryRow {
  country: string;
  bookings: number;
  completed: number;
  volunteerMinutes: number;
  volunteerHours: number;
  uniqueMentors: number;
  uniqueMentees: number;
  /** Completed sessions in this country with no recorded duration. */
  withoutDuration: number;
}

export function groupByCountry(
  bookings: Booking[],
  mentors: Pick<Mentor, "id" | "country">[],
  fallback: string = NOT_SPECIFIED,
): CountryRow[] {
  const mentorsById = new Map(mentors.map((mentor) => [mentor.id, mentor]));
  const groups = new Map<
    string,
    { bookings: number; completed: number; minutes: number; withoutDuration: number; mentors: Set<string>; mentees: Set<string> }
  >();

  bookings.forEach((booking) => {
    const country = bookingCountry(booking, mentorsById.get(booking.mentor_id), fallback);
    let group = groups.get(country);
    if (!group) {
      group = { bookings: 0, completed: 0, minutes: 0, withoutDuration: 0, mentors: new Set(), mentees: new Set() };
      groups.set(country, group);
    }
    group.bookings += 1;
    group.mentors.add(booking.mentor_id);
    group.mentees.add(booking.mentee_id);
    if (booking.status === "completed") {
      group.completed += 1;
      const duration = booking.session_duration_minutes;
      if (typeof duration === "number" && duration > 0) {
        group.minutes += duration;
      } else {
        group.withoutDuration += 1;
      }
    }
  });

  return Array.from(groups.entries())
    .map(([country, group]) => ({
      country,
      bookings: group.bookings,
      completed: group.completed,
      volunteerMinutes: group.minutes,
      volunteerHours: minutesToHours(group.minutes),
      uniqueMentors: group.mentors.size,
      uniqueMentees: group.mentees.size,
      withoutDuration: group.withoutDuration,
    }))
    .sort((a, b) => b.completed - a.completed || b.bookings - a.bookings || a.country.localeCompare(b.country));
}

/** Sorted union of bookings.country and mentors.country (the country filter's options). */
export function countryOptions(
  bookings: Pick<Booking, "country">[],
  mentors: Pick<Mentor, "country">[],
): string[] {
  const set = new Set<string>();
  bookings.forEach((booking) => {
    const country = booking.country?.trim();
    if (country) set.add(country);
  });
  mentors.forEach((mentor) => {
    const country = getMentorCountry(mentor);
    if (country) set.add(country);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** A booking joined with its mentor and mentee, flat enough for a table row or a CSV line. */
export interface BookingRow {
  id: string;
  mentorId: string;
  mentorName: string;
  /** Arabic name when the mentor recorded one (shown when the UI is Arabic). */
  mentorNameAr?: string;
  mentorCountry: string;
  menteeId: string;
  menteeName: string;
  menteeEmail: string;
  menteeType: Mentee["user_type"] | "";
  menteeOrganization: string;
  menteeCountry: string;
  status: Booking["status"];
  statusGroup: StatusGroup;
  clickedAt?: string;
  scheduledAt?: string;
  completedAt?: string;
  durationMinutes?: number;
  /** Resolved reporting country (booking.country || mentor.country || fallback). */
  country: string;
  menteeRating?: number;
  mentorRating?: number;
}

export function toBookingRows(
  bookings: Booking[],
  mentors: Mentor[],
  mentees: Mentee[],
  fallback: string = NOT_SPECIFIED,
): BookingRow[] {
  const mentorsById = new Map(mentors.map((mentor) => [mentor.id, mentor]));
  const menteesById = new Map(mentees.map((mentee) => [mentee.id, mentee]));

  return bookings.map((booking) => {
    const mentor = mentorsById.get(booking.mentor_id);
    const mentee = menteesById.get(booking.mentee_id);
    return {
      id: booking.id,
      mentorId: booking.mentor_id,
      mentorName: mentor?.name ?? "",
      mentorNameAr: mentor?.name_ar || undefined,
      mentorCountry: getMentorCountry(mentor) ?? fallback,
      menteeId: booking.mentee_id,
      menteeName: mentee?.name ?? "",
      menteeEmail: mentee?.email ?? "",
      menteeType: mentee?.user_type ?? "",
      menteeOrganization: mentee?.organization_name ?? "",
      menteeCountry: mentee?.country?.trim() || fallback,
      status: booking.status,
      statusGroup: statusGroup(booking.status),
      clickedAt: requestedAt(booking),
      scheduledAt: booking.scheduled_at,
      completedAt: booking.completed_at,
      durationMinutes: booking.session_duration_minutes,
      country: bookingCountry(booking, mentor, fallback),
      menteeRating: booking.mentee_rating,
      mentorRating: booking.mentor_rating,
    };
  });
}

export interface CompleteSessionInput {
  /** Actual session length, 5..600 minutes. */
  minutes: number;
  /** Reporting country; when omitted the booking keeps its country or inherits the mentor's. */
  country?: string;
}

/**
 * Marks a booking completed and records how long the session ran. This is the
 * only write path that feeds volunteer hours, so the duration is mandatory.
 *
 * The write is database.ts completeBooking (R1-16): it matches only an accepted or
 * confirmed booking, so a second "Mark completed" from a stale tab changes nothing,
 * keeps the duration recorded first and throws `BookingStateChangedError`. The mentee
 * is notified only after a write that really happened.
 */
export async function completeSession(bookingId: string, input: CompleteSessionInput): Promise<Booking> {
  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < MIN_SESSION_MINUTES || minutes > MAX_SESSION_MINUTES) {
    throw new RangeError(`Session duration must be between ${MIN_SESSION_MINUTES} and ${MAX_SESSION_MINUTES} minutes`);
  }

  const country = input.country?.trim() || (await resolveCountryForBooking(bookingId));
  const completed = await db.completeBooking(bookingId, { sessionDurationMinutes: minutes, country });

  // Notifications are created server-side; a missing RPC must never block completion.
  try {
    await supabase.rpc("notify_booking_event", { p_booking_id: bookingId, p_event: "booking_completed" });
  } catch {
    // ignore
  }

  return completed;
}

/** booking.country if already set, otherwise the mentor's country. Never throws. */
async function resolveCountryForBooking(bookingId: string): Promise<string | undefined> {
  try {
    const { data: booking } = await supabase
      .from("bookings")
      .select("mentor_id, country")
      .eq("id", bookingId)
      .maybeSingle();
    const existing = (booking?.country as string | null | undefined)?.trim();
    if (existing) return existing;
    if (!booking?.mentor_id) return undefined;

    const { data: mentor } = await supabase
      .from("mentors")
      .select("country")
      .eq("id", booking.mentor_id)
      .maybeSingle();
    return getMentorCountry(mentor as Pick<Mentor, "country"> | null);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Period windows, buckets and the metric definitions behind /analytics
// (spec §9 as amended by P1-26, P2-15, P2-16). Everything below is pure.
// ---------------------------------------------------------------------------

/**
 * When a request was made. `clicked_at` is only set by the legacy direct
 * booking path; product-created requests carry `created_at` alone.
 */
export function requestedAt(booking: Pick<Booking, "clicked_at" | "created_at">): string {
  return booking.clicked_at || booking.created_at;
}

/**
 * When a completed session happened: the mentor's completion stamp, else the
 * scheduled time, else the request date. Undefined for anything not completed.
 */
export function completionDate(
  booking: Pick<Booking, "status" | "completed_at" | "scheduled_at" | "clicked_at" | "created_at">,
): string | undefined {
  if (booking.status !== "completed") return undefined;
  return booking.completed_at || booking.scheduled_at || requestedAt(booking);
}

/** "30" = last 30 days, "90", "365" = last 12 months, "all" = since the first request. */
export type Period = "30" | "90" | "365" | "all";
export const PERIODS: readonly Period[] = ["30", "90", "365", "all"];

export interface DateWindow {
  start: Date;
  /** Exclusive upper bound. */
  end: Date;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Monday-first week (UAE working week; ar-AE and en-GB agree — never `getWeekInfo`). */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7; // Monday → 0 … Sunday → 6
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function periodDays(period: Exclude<Period, "all">): number {
  return period === "30" ? 30 : period === "90" ? 90 : 365;
}

/**
 * The window a period covers, ending now. Fixed periods start at the start of
 * the day N days ago; "all" starts at the first day of the month of the oldest
 * request (or today when there are no rows).
 */
export function periodWindow(
  period: Period,
  bookings: Pick<Booking, "clicked_at" | "created_at">[],
  now: Date = new Date(),
): DateWindow {
  const end = new Date(now.getTime() + 1);
  if (period === "all") {
    let oldest = now;
    bookings.forEach((booking) => {
      const at = parseTimestamp(requestedAt(booking));
      if (at && at < oldest) oldest = at;
    });
    return { start: startOfMonth(oldest), end };
  }
  return { start: addDays(startOfDay(now), -periodDays(period)), end };
}

/** The same-length window immediately before `window`; null for "all". */
export function previousWindow(period: Period, window: DateWindow): DateWindow | null {
  if (period === "all") return null;
  const length = window.end.getTime() - window.start.getTime();
  return { start: new Date(window.start.getTime() - length), end: window.start };
}

/** Whether a stored timestamp (UTC wall-clock, lib/timestamps.ts) falls in the window. */
export function inWindow(iso: string | undefined, window: DateWindow): boolean {
  const at = timestampMs(iso);
  return !Number.isNaN(at) && at >= window.start.getTime() && at < window.end.getTime();
}

export type Bucket = "week" | "month";

/** Weekly bars for 30/90 days; monthly for 12 months and all time (a 3-year weekly series is unreadable). */
export function bucketFor(period: Period): Bucket {
  return period === "30" || period === "90" ? "week" : "month";
}

export function bucketStart(date: Date, bucket: Bucket): Date {
  return bucket === "week" ? startOfWeek(date) : startOfMonth(date);
}

/** Stable key for a bucket: the local yyyy-mm-dd of its start. */
export function bucketKey(date: Date, bucket: Bucket): string {
  const start = bucketStart(date, bucket);
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return `${start.getFullYear()}-${month}-${day}`;
}

/** Every bucket start from the window's first bucket to its last, inclusive. */
export function bucketStarts(window: DateWindow, bucket: Bucket): Date[] {
  const starts: Date[] = [];
  const last = bucketStart(new Date(window.end.getTime() - 1), bucket);
  let cursor = bucketStart(window.start, bucket);
  let guard = 0;
  while (cursor <= last && guard < 600) {
    starts.push(cursor);
    cursor = bucket === "week" ? addDays(cursor, 7) : addMonths(cursor, 1);
    guard += 1;
  }
  return starts;
}

export interface SeriesPoint {
  key: string;
  start: Date;
  /** Requests sent in the bucket. */
  requests: number;
  /** Sessions the mentor marked complete in the bucket. */
  completed: number;
}

/** Requests by the bucket they were sent in; completions by the bucket they happened in. */
export function timeSeries(
  requestRows: Booking[],
  completedRows: Booking[],
  window: DateWindow,
  bucket: Bucket,
): SeriesPoint[] {
  const points = new Map<string, SeriesPoint>();
  bucketStarts(window, bucket).forEach((start) => {
    points.set(bucketKey(start, bucket), { key: bucketKey(start, bucket), start, requests: 0, completed: 0 });
  });
  requestRows.forEach((booking) => {
    const at = parseTimestamp(requestedAt(booking));
    const point = at ? points.get(bucketKey(at, bucket)) : undefined;
    if (point) point.requests += 1;
  });
  completedRows.forEach((booking) => {
    const at = parseTimestamp(completionDate(booking));
    const point = at ? points.get(bucketKey(at, bucket)) : undefined;
    if (point) point.completed += 1;
  });
  return Array.from(points.values());
}

/** A request counts as answered once the mentor accepted or declined it (cancelling after a reply still counts). */
export function isAnswered(booking: Pick<Booking, "status" | "responded_at">): boolean {
  switch (booking.status) {
    case "accepted":
    case "confirmed":
    case "completed":
    case "rejected":
      return true;
    case "canceled":
      return Boolean(booking.responded_at);
    default:
      return false;
  }
}

export interface AnswerRate {
  answered: number;
  total: number;
  /** answered / total, or null when there were no requests. */
  rate: number | null;
}

export function answerRate(requestRows: Pick<Booking, "status" | "responded_at">[]): AnswerRate {
  const total = requestRows.length;
  const answered = requestRows.filter(isAnswered).length;
  return { answered, total, rate: total > 0 ? answered / total : null };
}

export interface PeriodSummary {
  requests: number;
  completed: number;
  hours: VolunteerHoursSummary;
  answer: AnswerRate;
  /** Distinct reporting countries among the completed sessions (the sentinel excluded). */
  countries: number;
}

/** The four tiles and the summary sentence come from this one object, so they always reconcile. */
export function summarize(
  requestRows: Booking[],
  completedRows: Booking[],
  mentors: Pick<Mentor, "id" | "country">[],
): PeriodSummary {
  const mentorsById = new Map(mentors.map((mentor) => [mentor.id, mentor]));
  const countries = new Set<string>();
  completedRows.forEach((booking) => {
    const country = bookingCountry(booking, mentorsById.get(booking.mentor_id));
    if (country !== NOT_SPECIFIED) countries.add(country);
  });
  return {
    requests: requestRows.length,
    completed: completedRows.length,
    hours: volunteerHours(completedRows),
    answer: answerRate(requestRows),
    countries: countries.size,
  };
}

export interface Delta {
  diff: number;
  /** diff / previous, only when the previous value is >= 10 (P2-15: ratios over tiny bases are noise). */
  percent: number | null;
}

export function delta(current: number, previous: number): Delta {
  const diff = current - previous;
  return { diff, percent: previous >= 10 ? diff / previous : null };
}

/** Funnel order for the request-outcomes bar: pipeline first, then the terminal negatives. */
export const OUTCOME_ORDER: readonly Booking["status"][] = ["pending", "accepted", "confirmed", "completed", "rejected", "canceled"];

export function outcomeCounts(requestRows: Pick<Booking, "status">[]): Record<Booking["status"], number> {
  const counts: Record<Booking["status"], number> = { pending: 0, accepted: 0, confirmed: 0, completed: 0, rejected: 0, canceled: 0 };
  requestRows.forEach((booking) => {
    counts[booking.status] += 1;
  });
  return counts;
}

export interface CountryBreakdownRow extends CountryRow {
  /** Requests sent in the period attributed to this country. */
  requests: number;
}

/**
 * Sessions/hours per country from the completed cohort, requests per country
 * from the request cohort, merged by country and sorted by completed sessions.
 */
export function countryBreakdown(
  requestRows: Booking[],
  completedRows: Booking[],
  mentors: Pick<Mentor, "id" | "country">[],
  fallback: string = NOT_SPECIFIED,
): CountryBreakdownRow[] {
  const mentorsById = new Map(mentors.map((mentor) => [mentor.id, mentor]));
  const rows = new Map<string, CountryBreakdownRow>(
    groupByCountry(completedRows, mentors, fallback).map((row) => [row.country, { ...row, requests: 0 }]),
  );
  // Mentors/mentees are counted over every row the period touches (requested
  // or completed), so a country with requests but no completed session never
  // reads as "0 mentors, 0 mentees".
  const people = new Map<string, { mentors: Set<string>; mentees: Set<string> }>();
  const touch = (booking: Booking) => {
    const country = bookingCountry(booking, mentorsById.get(booking.mentor_id), fallback);
    let entry = people.get(country);
    if (!entry) {
      entry = { mentors: new Set(), mentees: new Set() };
      people.set(country, entry);
    }
    entry.mentors.add(booking.mentor_id);
    entry.mentees.add(booking.mentee_id);
    return country;
  };
  completedRows.forEach(touch);
  requestRows.forEach((booking) => {
    const country = touch(booking);
    let row = rows.get(country);
    if (!row) {
      row = { country, bookings: 0, completed: 0, volunteerMinutes: 0, volunteerHours: 0, uniqueMentors: 0, uniqueMentees: 0, withoutDuration: 0, requests: 0 };
      rows.set(country, row);
    }
    row.requests += 1;
  });
  return Array.from(rows.values())
    .map((row) => {
      const entry = people.get(row.country);
      return { ...row, uniqueMentors: entry?.mentors.size ?? row.uniqueMentors, uniqueMentees: entry?.mentees.size ?? row.uniqueMentees };
    })
    .sort((a, b) => b.completed - a.completed || b.volunteerMinutes - a.volunteerMinutes || b.requests - a.requests || a.country.localeCompare(b.country));
}

export interface MentorPerformanceRow {
  id: string;
  name: string;
  nameAr?: string;
  country: string;
  /** Sessions completed in the period. */
  completed: number;
  volunteerMinutes: number;
  volunteerHours: number;
  /** Completed sessions with no recorded duration. */
  withoutDuration: number;
  ratingCount: number;
  /** Mean mentee rating over the period's completed sessions, or null when none was given. */
  avgRating: number | null;
  /** Requests sent in the period that are still awaiting this mentor. */
  pending: number;
  /** Requests sent in the period to this mentor. */
  requests: number;
}

/** Ranked by completed sessions, then hours, then pending requests. */
export function mentorPerformance(
  requestRows: Booking[],
  completedRows: Booking[],
  mentors: Pick<Mentor, "id" | "name" | "name_ar" | "country">[],
  fallback: string = NOT_SPECIFIED,
): MentorPerformanceRow[] {
  const mentorsById = new Map(mentors.map((mentor) => [mentor.id, mentor]));
  const rows = new Map<string, MentorPerformanceRow & { ratingSum: number }>();
  const rowFor = (mentorId: string) => {
    let row = rows.get(mentorId);
    if (!row) {
      const mentor = mentorsById.get(mentorId);
      row = {
        id: mentorId,
        name: mentor?.name ?? "",
        nameAr: mentor?.name_ar || undefined,
        country: getMentorCountry(mentor) ?? fallback,
        completed: 0,
        volunteerMinutes: 0,
        volunteerHours: 0,
        withoutDuration: 0,
        ratingCount: 0,
        ratingSum: 0,
        avgRating: null,
        pending: 0,
        requests: 0,
      };
      rows.set(mentorId, row);
    }
    return row;
  };
  completedRows.forEach((booking) => {
    const row = rowFor(booking.mentor_id);
    row.completed += 1;
    const duration = booking.session_duration_minutes;
    if (typeof duration === "number" && duration > 0) row.volunteerMinutes += duration;
    else row.withoutDuration += 1;
    if (typeof booking.mentee_rating === "number") {
      row.ratingSum += booking.mentee_rating;
      row.ratingCount += 1;
    }
  });
  requestRows.forEach((booking) => {
    const row = rowFor(booking.mentor_id);
    row.requests += 1;
    if (booking.status === "pending") row.pending += 1;
  });
  return Array.from(rows.values())
    .map(({ ratingSum, ...row }) => ({
      ...row,
      volunteerHours: minutesToHours(row.volunteerMinutes),
      avgRating: row.ratingCount > 0 ? Math.round((ratingSum / row.ratingCount) * 10) / 10 : null,
    }))
    .sort((a, b) => b.completed - a.completed || b.volunteerMinutes - a.volunteerMinutes || b.pending - a.pending || a.name.localeCompare(b.name));
}

/** The mentor's Arabic name when the UI is Arabic and one was recorded, else the stored name. */
export function localizedName(entity: { name: string; name_ar?: string } | { name: string; nameAr?: string }, language: string): string {
  const row = "nameAr" in entity ? { name: entity.name, name_ar: entity.nameAr } : entity;
  return localizedField(row, "name", language) || entity.name;
}

// ---- Locale-aware labels for chart buckets (Intl is allowed here per P1-11) ----

const bucketFormatters = new Map<string, Intl.DateTimeFormat>();

function bucketFormatter(kind: "tick-week" | "tick-month" | "tick-month-year" | "week-of" | "month", language: string): Intl.DateTimeFormat {
  const cacheKey = `${kind}:${language}`;
  let formatter = bucketFormatters.get(cacheKey);
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions =
      kind === "tick-week" ? { day: "numeric", month: "short" }
      : kind === "tick-month" ? { month: "short" }
      : kind === "tick-month-year" ? { month: "short", year: "numeric" }
      : kind === "week-of" ? { day: "numeric", month: "short" }
      : { month: "long", year: "numeric" };
    formatter = new Intl.DateTimeFormat(intlLocale(language), options);
    bucketFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

/**
 * Short axis tick: "25 Aug" for weeks, "Aug" for months. A month tick carries
 * its year on January and wherever the caller asks (`withYear`, e.g. the first
 * bucket of a 12-month series), in one Intl call.
 */
export function formatBucketTick(start: Date, bucket: Bucket, language: string, withYear = false): string {
  if (bucket === "week") return bucketFormatter("tick-week", language).format(start);
  return bucketFormatter(withYear || start.getMonth() === 0 ? "tick-month-year" : "tick-month", language).format(start);
}

/** Full bucket name for tooltips, legends and tables: "25 Aug" (callers wrap it in "Week of …") or "August 2026". */
export function formatBucketLabel(start: Date, bucket: Bucket, language: string): string {
  return bucketFormatter(bucket === "week" ? "week-of" : "month", language).format(start);
}

/**
 * EN → AR map for expertise tags built from every mentor's `expertise` /
 * `expertise_ar` index pairs. The filter keeps the English key; the label
 * shows the Arabic when the language is Arabic and a mapping exists.
 */
export function expertiseLabels(mentors: ReadonlyArray<Pick<Mentor, "expertise" | "expertise_ar">>): Map<string, string> {
  const map = new Map<string, string>();
  mentors.forEach((mentor) => {
    mentor.expertise?.forEach((tag, index) => {
      const arabic = mentor.expertise_ar?.[index];
      if (tag && arabic && !map.has(tag)) map.set(tag, arabic);
    });
  });
  return map;
}
