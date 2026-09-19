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
