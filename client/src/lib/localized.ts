/**
 * Bilingual field lookup for rows that carry `<field>` and `<field>_ar`
 * (mentors, mentees). Arabic wins when the language is Arabic and the value
 * is present; everything else falls back to the English column. One helper
 * so no page re-implements the ternary.
 */
type Localizable = object | null | undefined;

export function localizedField(row: Localizable, field: string, lang: string): string {
  if (!row) return "";
  const record = row as Record<string, unknown>;
  const isArabic = (lang ?? "en").startsWith("ar");
  const arabic = record[`${field}_ar`];
  if (isArabic && typeof arabic === "string" && arabic.trim()) return arabic;
  const base = record[field];
  return typeof base === "string" ? base : "";
}

/** "Position · Company" credential line, localized, empty parts omitted. */
export function credentialLine(row: Localizable, lang: string): string {
  return [localizedField(row, "position", lang), localizedField(row, "company", lang)].filter(Boolean).join(" · ");
}

/** Initials for an avatar fallback ("Layla Haddad" → "LH"); Arabic names keep their first letters too. */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

import { formatRelativeTime as formatRelativeTimeIntl, languageName } from "./format";

/** Localized name of a spoken language stored as its English name; see lib/format.ts. */
export function localizeLanguageName(name: string, lang: string): string {
  return languageName(name, lang);
}

/** "3 hours ago" / "in 2 days" style relative time for feeds; see lib/format.ts. */
export function formatRelativeTime(iso: string | null | undefined, lang: string, now: Date = new Date()): string {
  return formatRelativeTimeIntl(iso, lang, now);
}
