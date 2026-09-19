/**
 * Locale-aware formatting (P1-11). Every date, time, number and unit in the UI
 * goes through here — never `toLocaleString()` with no argument, never string
 * concatenation of two numbers or a date and a time.
 *
 * Convention (from commit 1b64798): Western/Latin digits in both languages —
 * `-u-nu-latn` pins it so no ICU build switches Arabic to Arabic-Indic digits —
 * with Arabic month, weekday and day-period names and each locale's own hour
 * cycle (en-GB "18:00", ar-AE "6:00 م"). Time zones are always labelled.
 */
import i18n from "@/lib/i18n";

export const LOCALE = { en: "en-GB", ar: "ar-AE" } as const;
export type Lang = keyof typeof LOCALE;

/** BCP-47 tag for Intl calls; defaults to the active i18n language. */
export const intlLocale = (lang: string = i18n.language ?? "en"): string =>
  lang.startsWith("ar") ? "ar-AE-u-nu-latn" : "en-GB";

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Placeholder for a missing or unparsable value; distinct from a real zero. */
export const UNAVAILABLE = "—";

function dtf(lang: string | undefined, options: Intl.DateTimeFormatOptions, timeZone?: string) {
  return new Intl.DateTimeFormat(intlLocale(lang), timeZone ? { ...options, timeZone } : options);
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** "19 Sept 2026" / "19 سبتمبر 2026". */
export function formatDate(value: DateInput, lang?: string, timeZone?: string): string {
  const d = toDate(value);
  return d ? dtf(lang, DATE_OPTS, timeZone).format(d) : UNAVAILABLE;
}

/** "18:00" / "6:00 م" (the locale's own hour cycle). */
export function formatTime(value: DateInput, lang?: string, timeZone?: string): string {
  const d = toDate(value);
  return d ? dtf(lang, TIME_OPTS, timeZone).format(d) : UNAVAILABLE;
}

/** Date and time in one Intl call so the separator is locale-correct. */
export function formatDateTime(value: DateInput, lang?: string, timeZone?: string): string {
  const d = toDate(value);
  return d ? dtf(lang, { ...DATE_OPTS, ...TIME_OPTS }, timeZone).format(d) : UNAVAILABLE;
}

/**
 * A time or date range through `formatRange`, never `${start}–${end}`.
 * Defaults to a time range ("18:00–20:00"); pass `options` for dates.
 */
export function formatRange(
  start: DateInput,
  end: DateInput,
  lang?: string,
  timeZone?: string,
  options: Intl.DateTimeFormatOptions = TIME_OPTS,
): string {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return UNAVAILABLE;
  return dtf(lang, options, timeZone).formatRange(a, b);
}

/**
 * "today" / "yesterday" / "3 days ago" (numeric: auto); beyond a week, the
 * short date. Used for "Sent {relativeDay}".
 */
export function formatRelativeDay(value: DateInput, lang?: string, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return UNAVAILABLE;
  const dayMs = 86_400_000;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / dayMs);
  if (Math.abs(diffDays) > 7) return formatDate(d, lang);
  return new Intl.RelativeTimeFormat(intlLocale(lang), { numeric: "auto" }).format(diffDays, "day");
}

/** Plain number with locale grouping; digits stay Latin in Arabic. */
export function formatNumber(value: number | null | undefined, lang?: string, options?: Intl.NumberFormatOptions): string {
  if (value == null || Number.isNaN(value)) return UNAVAILABLE;
  return new Intl.NumberFormat(intlLocale(lang), options).format(value);
}

/** Minutes → "12.5 h" / "12.5 س" via the Intl unit style (replaces `analytics.hoursShort`). */
export function formatHours(minutes: number | null | undefined, lang?: string): string {
  if (minutes == null || Number.isNaN(minutes)) return UNAVAILABLE;
  return new Intl.NumberFormat(intlLocale(lang), {
    style: "unit",
    unit: "hour",
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
  }).format(minutes / 60);
}

/** The browser's IANA zone; "UTC" when the runtime cannot say. */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Offset of `timeZone` from UTC in minutes at `at` (DST-aware). Null for an unknown zone. */
export function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((asUtc - at.getTime()) / 60_000);
  } catch {
    return null;
  }
}

/**
 * "Same time zone as you" / "2 h ahead of you" / "3 h behind you" — the
 * mentor's zone relative to the viewer's, via the `format.tz*` plural keys.
 * Unknown zones return the placeholder so nothing is invented.
 */
export function tzOffsetLabel(mentorTz: string | null | undefined, viewerTz: string = viewerTimeZone(), lang?: string): string {
  if (!mentorTz) return UNAVAILABLE;
  const mentor = tzOffsetMinutes(mentorTz);
  const viewer = tzOffsetMinutes(viewerTz);
  if (mentor == null || viewer == null) return UNAVAILABLE;
  const diffHours = (mentor - viewer) / 60;
  const t = lang ? i18n.getFixedT(lang) : i18n.t.bind(i18n);
  if (diffHours === 0) return t("format.tzSame");
  const count = Math.abs(diffHours);
  const shown = formatNumber(count, lang, { maximumFractionDigits: 1 });
  return diffHours > 0
    ? t("format.tzAhead", { count, hours: shown })
    : t("format.tzBehind", { count, hours: shown });
}

/**
 * Wrap a user-supplied or code-like value (name, email, IANA zone, alias) in
 * FIRST STRONG ISOLATE … POP DIRECTIONAL ISOLATE so it keeps its own direction
 * inside a translated sentence (P1-27). Use in aria-labels, titles, toasts and
 * document.title; in JSX prefer `<bdi>`.
 */
export function bidi(value: string | number | null | undefined): string {
  if (value == null) return "";
  return `\u2068${String(value)}\u2069`;
}

// ---------------------------------------------------------------------------
// Lists, language names and relative time (moved here from the profile and
// dashboard passes so every Intl formatter lives in this module).
// ---------------------------------------------------------------------------

/** "English, Arabic" / "الإنجليزية والعربية" — a locale-correct conjunction list. */
export function formatList(items: readonly string[], lang?: string): string {
  const clean = items.filter((s) => s && s.trim());
  if (clean.length === 0) return "";
  try {
    return new Intl.ListFormat(intlLocale(lang), { style: "long", type: "conjunction" }).format(clean);
  } catch {
    return clean.join(", ");
  }
}

// ---------------------------------------------------------------------------
// Stored English names → localized display names (Intl.DisplayNames). One
// code map and one cache per type; reporting.ts re-exports these for the
// analytics chunk so the entry bundle never pulls that module (F-04).
// ---------------------------------------------------------------------------

/** English language names as the forms store them → BCP-47 codes for `Intl.DisplayNames`. */
const LANGUAGE_CODES: Record<string, string> = {
  english: "en", arabic: "ar", french: "fr", spanish: "es", german: "de", italian: "it", portuguese: "pt",
  dutch: "nl", greek: "el", turkish: "tr", russian: "ru", hindi: "hi", urdu: "ur", bengali: "bn", punjabi: "pa",
  tamil: "ta", telugu: "te", malayalam: "ml", kannada: "kn", marathi: "mr", gujarati: "gu", sinhala: "si",
  nepali: "ne", mandarin: "zh", chinese: "zh", cantonese: "yue", japanese: "ja", korean: "ko", persian: "fa",
  farsi: "fa", kurdish: "ku", pashto: "ps", hebrew: "he", swahili: "sw", amharic: "am", somali: "so",
  tagalog: "tl", filipino: "fil", indonesian: "id", malay: "ms", thai: "th", vietnamese: "vi",
  swedish: "sv", polish: "pl",
};

/** Same list the mentor onboarding and mentee forms offer, so reporting countries stay comparable. */
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

/** ISO 3166-1 alpha-2 codes for the stored English country names, for localized display. */
const COUNTRY_CODES: Record<string, string> = {
  "United Arab Emirates": "AE",
  "Saudi Arabia": "SA",
  Egypt: "EG",
  Kuwait: "KW",
  Qatar: "QA",
  Bahrain: "BH",
  Oman: "OM",
  Jordan: "JO",
  Lebanon: "LB",
  Morocco: "MA",
  Tunisia: "TN",
  Algeria: "DZ",
  Iraq: "IQ",
  Syria: "SY",
  Palestine: "PS",
  Turkey: "TR",
  Pakistan: "PK",
  India: "IN",
  Bangladesh: "BD",
  "United Kingdom": "GB",
  "United States": "US",
  Germany: "DE",
  France: "FR",
};

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function displayNames(type: "language" | "region", lang?: string): Intl.DisplayNames | null {
  const key = `${type}:${intlLocale(lang)}`;
  let names = displayNamesCache.get(key);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([intlLocale(lang)], { type });
    } catch {
      names = null;
    }
    displayNamesCache.set(key, names);
  }
  return names;
}

/** The stored language name in the active language ("Arabic" → "العربية"); unknown values pass through. */
export function languageName(stored: string, lang?: string): string {
  const code = LANGUAGE_CODES[stored.trim().toLowerCase()];
  if (!code) return stored;
  try {
    const localized = displayNames("language", lang)?.of(code);
    return localized && localized !== code ? localized : stored;
  } catch {
    return stored;
  }
}

/** Alias of `languageName` kept for the analytics filters. */
export const localizeLanguage = languageName;

/**
 * Localized name for a stored English country value (the stored value is the
 * data key; the UI shows it in the active language). Unknown values and the
 * sentinels fall back to the stored string.
 */
export function localizeCountry(country: string, lang?: string): string {
  const code = COUNTRY_CODES[country];
  if (!code) return country;
  try {
    return displayNames("region", lang)?.of(code) ?? country;
  } catch {
    return country;
  }
}

/** "3 hours ago" / "in 2 days" for feeds and notification rows; bad input shows the placeholder. */
export function formatRelativeTime(iso: string | null | undefined, lang?: string, now: Date = new Date()): string {
  if (!iso) return UNAVAILABLE;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return UNAVAILABLE;
  const diffSeconds = Math.round((then - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(lang), { numeric: "auto" });
  if (abs < 60) return rtf.format(diffSeconds, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(diffSeconds / 86_400), "day");
  return rtf.format(Math.round(diffSeconds / (86_400 * 30)), "month");
}
