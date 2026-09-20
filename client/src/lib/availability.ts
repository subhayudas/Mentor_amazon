/**
 * Public weekly availability (P0-4 ENG, P1-9 ENG).
 *
 * `mentor_availability` rows are weekly windows (`day_of_week` 0 = Sunday …
 * 6 = Saturday, `start_time`/`end_time` as "HH:MM") with no zone column; they
 * are interpreted in `mentors_public.timezone` and labelled "mentor's time",
 * never converted to the viewer's zone. They are a typical-availability signal,
 * never a bookable slot. One public read feeds discovery and the profile.
 *
 * The week starts on Monday for both locales (UAE working week; ar-AE and
 * en-GB weekInfo agree) — a fixed array, never `Intl.Locale.getWeekInfo`.
 */
import { useQuery } from "@tanstack/react-query";

import i18n from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { bidi, intlLocale } from "@/lib/format";

export interface AvailabilityRow {
  mentor_id: string;
  /** 0 = Sunday … 6 = Saturday (database convention). */
  day_of_week: number;
  /** "HH:MM" in the mentor's zone. */
  start_time: string;
  end_time: string;
}

export const AVAILABILITY_QUERY_KEY = ["availability", "public"] as const;

/** DB weekday indices in display order, Monday first. */
export const MONDAY_FIRST: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/** Every active window for every mentor; cached 5 minutes and shared by discovery and the profile. */
export function usePublicAvailability() {
  return useQuery({
    queryKey: AVAILABILITY_QUERY_KEY,
    queryFn: async (): Promise<AvailabilityRow[]> => {
      const { data, error } = await supabase
        .from("mentor_availability")
        .select("mentor_id, day_of_week, start_time, end_time")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as AvailabilityRow[];
    },
    staleTime: 5 * 60_000,
  });
}

/** One mentor's windows in Monday-first, then start-time order. */
export function windowsForMentor<T extends Pick<AvailabilityRow, "mentor_id" | "day_of_week" | "start_time">>(
  rows: readonly T[] | undefined,
  mentorId: string,
): T[] {
  return (rows ?? [])
    .filter((r) => r.mentor_id === mentorId)
    .sort((a, b) => {
      const da = MONDAY_FIRST.indexOf(a.day_of_week);
      const db = MONDAY_FIRST.indexOf(b.day_of_week);
      return da !== db ? da - db : a.start_time.localeCompare(b.start_time);
    });
}

/** A Monday-first week of concrete dates (2024-01-01 is a Monday) for Intl weekday labels. */
const WEEK_DATES = MONDAY_FIRST.map((_, i) => new Date(Date.UTC(2024, 0, 1 + i, 12)));

/** Seven weekday labels, Monday first. `style` "narrow" = one letter, "long" = full name. */
export function weekdayLabels(lang?: string, style: "narrow" | "short" | "long" = "narrow"): string[] {
  const fmt = new Intl.DateTimeFormat(intlLocale(lang), { weekday: style, timeZone: "UTC" });
  return WEEK_DATES.map((d) => fmt.format(d));
}

export interface AvailabilitySummary {
  /** Monday-first; true when the mentor has at least one window that day. */
  days: boolean[];
  /** Human sentence for `aria-label`, e.g. "Usually available Monday and Wednesday (mentor's time, Asia/Dubai)". */
  summaryText: string;
  /** Long weekday names of the active days, Monday first. */
  dayNames: string[];
}

/** Summarise a mentor's windows for the strip; `days` is all-false and the text empty when there are none. */
export function summarizeAvailability(
  rows: ReadonlyArray<Pick<AvailabilityRow, "day_of_week">> | undefined,
  mentorTz: string | null | undefined,
  lang: string = i18n.language,
): AvailabilitySummary {
  const active = new Set((rows ?? []).map((r) => r.day_of_week));
  const days = MONDAY_FIRST.map((d) => active.has(d));
  const longNames = weekdayLabels(lang, "long");
  const dayNames = longNames.filter((_, i) => days[i]);
  if (dayNames.length === 0) return { days, summaryText: "", dayNames };
  const list = new Intl.ListFormat(intlLocale(lang), { style: "long", type: "conjunction" }).format(dayNames);
  const t = i18n.getFixedT(lang);
  const summaryText = mentorTz
    ? t("format.availabilitySummaryTz", { days: list, tz: bidi(mentorTz) })
    : t("format.availabilitySummary", { days: list });
  return { days, summaryText, dayNames };
}
