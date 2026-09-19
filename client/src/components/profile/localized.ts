/**
 * Display helpers for the public mentor profile. Pure and locale-aware; every
 * date, time, number, list and language name goes through lib/format.ts.
 */
import type { PublicMentor } from "@/lib/database";
import { MONDAY_FIRST, weekdayLabels } from "@/lib/availability";
import { UNAVAILABLE, formatRange, intlLocale } from "@/lib/format";

const isArabic = (lang: string) => lang.startsWith("ar");

/** The `*_ar` value when the UI is Arabic and the value exists, else the English one. */
export function localizedText(lang: string, en: string | null | undefined, ar?: string | null): string {
  if (isArabic(lang) && ar && ar.trim()) return ar;
  return en ?? "";
}

export function localizedList(lang: string, en: string[] | null | undefined, ar?: string[] | null): string[] {
  if (isArabic(lang) && ar && ar.length > 0) return ar;
  return en ?? [];
}

export interface MentorDisplay {
  name: string;
  position: string;
  company: string;
  bio: string;
  expertise: string[];
  industries: string[];
}

/** Every localised text field of a mentor in one object. */
export function mentorDisplay(mentor: PublicMentor, lang: string): MentorDisplay {
  return {
    name: localizedText(lang, mentor.name, mentor.name_ar),
    position: localizedText(lang, mentor.position, mentor.position_ar),
    company: localizedText(lang, mentor.company, mentor.company_ar),
    bio: localizedText(lang, mentor.bio, mentor.bio_ar),
    expertise: localizedList(lang, mentor.expertise, mentor.expertise_ar),
    industries: localizedList(lang, mentor.industries, mentor.industries_ar),
  };
}

/** Up to two initials from a display name (the avatar fallback). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

export { formatList, languageName } from "@/lib/format";

/** Anchor a "HH:MM" wall-clock time on a fixed UTC day so Intl prints it unchanged. */
function wallClock(hhmm: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return null;
  return new Date(Date.UTC(2024, 0, 1, Number(match[1]), Number(match[2])));
}

/**
 * "18:00–20:00" (en-GB) / "6:00–8:00 م" (ar-AE) for a window stated in the
 * mentor's zone; an unparsable row shows the placeholder rather than a
 * hand-concatenated range.
 */
export function windowRange(start: string, end: string, lang: string): string {
  const a = wallClock(start);
  const b = wallClock(end);
  if (!a || !b) return UNAVAILABLE;
  return formatRange(a, b, lang, "UTC");
}

/** Long weekday name for a database `day_of_week` (0 = Sunday … 6 = Saturday). */
export function weekdayName(dayOfWeek: number, lang: string, style: "long" | "short" = "long"): string {
  const index = MONDAY_FIRST.indexOf(dayOfWeek);
  if (index < 0) return "";
  return weekdayLabels(lang, style)[index] ?? "";
}
