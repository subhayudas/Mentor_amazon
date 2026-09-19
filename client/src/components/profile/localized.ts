/**
 * Display helpers for the public mentor profile. Pure and locale-aware; every
 * date, time, number, list and language name goes through lib/format.ts and
 * the bilingual field lookups through lib/localized.ts (F-05: no local copies).
 */
import type { PublicMentor } from "@/lib/database";
import { MONDAY_FIRST, weekdayLabels } from "@/lib/availability";
import { UNAVAILABLE, formatRange } from "@/lib/format";
import { localizedField, localizedList } from "@/lib/localized";

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
    name: localizedField(mentor, "name", lang),
    position: localizedField(mentor, "position", lang),
    company: localizedField(mentor, "company", lang),
    bio: localizedField(mentor, "bio", lang),
    expertise: localizedList(mentor, "expertise", lang),
    industries: localizedList(mentor, "industries", lang),
  };
}

export { formatList, languageName } from "@/lib/format";
/** Avatar initials from the displayed name (the shared helper under its profile-local name). */
export { initialsOf as initials } from "@/lib/localized";

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
