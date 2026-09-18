/**
 * Reporting helpers for the programme analytics (volunteer hours, country cut,
 * flattened booking rows for tables/CSV) and the "complete session" write.
 *
 * Everything except completeSession() is pure. The write talks to Supabase
 * directly because database.ts belongs to another slice.
 */

import { supabase } from "@/lib/supabase";
import type { Booking, Mentor, Mentee } from "@/lib/database";

/**
 * Sentinel for a booking with no country on it or its mentor. Callers render it
 * through t('analytics.notSpecified'); it is kept stable so grouping/drilling
 * can compare against it.
 */
export const NOT_SPECIFIED = "Not specified";

export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 600;
export const SESSION_MINUTE_PRESETS = [15, 30, 45, 60, 90] as const;

/** Same list the mentor onboarding form offers, so reporting countries stay comparable. */
export const REPORTING_COUNTRIES: readonly string[] = [
  "United Arab Emirates",
  "Saudi Arabia",
  "Egypt",
  "Kuwait",
  "Qatar",
  "Bahrain",
  "Oman",
  "Jordan",
  "Lebanon",
  "Morocco",
  "Tunisia",
  "Algeria",
  "Iraq",
  "Syria",
  "Palestine",
  "Turkey",
  "Pakistan",
  "India",
  "Bangladesh",
  "United Kingdom",
  "United States",
  "Germany",
  "France",
  "Other",
];

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
      mentorCountry: getMentorCountry(mentor) ?? fallback,
      menteeId: booking.mentee_id,
      menteeName: mentee?.name ?? "",
      menteeEmail: mentee?.email ?? "",
      menteeType: mentee?.user_type ?? "",
      menteeOrganization: mentee?.organization_name ?? "",
      menteeCountry: mentee?.country?.trim() || fallback,
      status: booking.status,
      statusGroup: statusGroup(booking.status),
      clickedAt: booking.clicked_at,
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
 */
export async function completeSession(bookingId: string, input: CompleteSessionInput): Promise<Booking | null> {
  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < MIN_SESSION_MINUTES || minutes > MAX_SESSION_MINUTES) {
    throw new RangeError(`Session duration must be between ${MIN_SESSION_MINUTES} and ${MAX_SESSION_MINUTES} minutes`);
  }

  const country = input.country?.trim() || (await resolveCountryForBooking(bookingId));

  const update: Partial<Booking> = {
    status: "completed",
    completed_at: new Date().toISOString(),
    session_duration_minutes: minutes,
  };
  if (country) update.country = country;

  const { data, error } = await supabase
    .from("bookings")
    .update(update)
    .eq("id", bookingId)
    .select()
    .single();

  if (error && error.code !== "PGRST116") throw error;

  // Notifications are created server-side; a missing RPC must never block completion.
  try {
    await supabase.rpc("notify_booking_event", { p_booking_id: bookingId, p_event: "booking_completed" });
  } catch {
    // ignore
  }

  return data as Booking | null;
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
