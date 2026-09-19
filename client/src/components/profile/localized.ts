/**
 * Display helpers for the public mentor profile. Pure and locale-aware; every
 * date, time and number still goes through lib/format.ts. The list and
 * language-name helpers are local copies until lib/format.ts grows them
 * (integrator ticket): keep them dependency-free.
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

/** English language names as stored on mentors → BCP-47 codes for Intl.DisplayNames. */
const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  arabic: "ar",
  french: "fr",
  spanish: "es",
  german: "de",
  italian: "it",
  portuguese: "pt",
  dutch: "nl",
  greek: "el",
  turkish: "tr",
  russian: "ru",
  hindi: "hi",
  urdu: "ur",
  bengali: "bn",
  punjabi: "pa",
  tamil: "ta",
  telugu: "te",
  malayalam: "ml",
  kannada: "kn",
  marathi: "mr",
  gujarati: "gu",
  sinhala: "si",
  nepali: "ne",
  mandarin: "zh",
  chinese: "zh",
  cantonese: "yue",
  japanese: "ja",
  korean: "ko",
  persian: "fa",
  farsi: "fa",
  kurdish: "ku",
  pashto: "ps",
  hebrew: "he",
  swahili: "sw",
  amharic: "am",
  somali: "so",
  tagalog: "tl",
  filipino: "fil",
  indonesian: "id",
  malay: "ms",
  thai: "th",
  vietnamese: "vi",
};

const displayNames = new Map<string, Intl.DisplayNames | null>();

/** The stored language name in the active language ("Arabic" → "العربية"); unknown values pass through. */
export function languageName(stored: string, lang: string): string {
  const code = LANGUAGE_CODES[stored.trim().toLowerCase()];
  if (!code) return stored;
  const locale = intlLocale(lang);
  let names = displayNames.get(locale);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      names = null;
    }
    displayNames.set(locale, names);
  }
  try {
    return names?.of(code) ?? stored;
  } catch {
    return stored;
  }
}

/** "English, Arabic" / "الإنجليزية والعربية" — a locale-correct conjunction list. */
export function formatList(items: readonly string[], lang: string): string {
  const clean = items.filter((s) => s && s.trim());
  if (clean.length === 0) return "";
  try {
    return new Intl.ListFormat(intlLocale(lang), { style: "long", type: "conjunction" }).format(clean);
  } catch {
    return clean.join(", ");
  }
}

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
