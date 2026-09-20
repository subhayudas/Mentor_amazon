/**
 * Bilingual display helpers for rows that carry `<field>` and `<field>_ar`
 * (mentors, mentees, bookings' joined rows). Arabic wins when the language is
 * Arabic and the value is present; everything else falls back to the English
 * column. The one copy of each helper (F-05): cards, profile, dashboard, portal,
 * admin and analytics all read from here, and the Intl-backed display names
 * (`languageName`, `localizeCountry`) are re-exported from lib/format.ts so no
 * page reaches into lib/reporting.ts for them.
 */
type Localizable = object | null | undefined;

export const isArabic = (lang: string | undefined): boolean => (lang ?? "en").startsWith("ar");

export function localizedField(row: Localizable, field: string, lang: string): string {
  if (!row) return "";
  const record = row as Record<string, unknown>;
  const arabic = record[`${field}_ar`];
  if (isArabic(lang) && typeof arabic === "string" && arabic.trim()) return arabic;
  const base = record[field];
  return typeof base === "string" ? base : "";
}

/** The `<field>_ar` list when the UI is Arabic and it has entries, else the English list. */
export function localizedList(row: Localizable, field: string, lang: string): string[] {
  if (!row) return [];
  const record = row as Record<string, unknown>;
  const arabic = record[`${field}_ar`];
  if (isArabic(lang) && Array.isArray(arabic) && arabic.length > 0) return arabic as string[];
  const base = record[field];
  return Array.isArray(base) ? (base as string[]) : [];
}

/** "Position · Company" credential line, localized, empty parts omitted. */
export function credentialLine(row: Localizable, lang: string): string {
  return [localizedField(row, "position", lang), localizedField(row, "company", lang)].filter(Boolean).join(" · ");
}

/**
 * Initials for an avatar fallback ("Layla Haddad" → "LH", "ليلى حداد" → "لح").
 * Pass the *displayed* (localized) name so Arabic cards show Arabic initials.
 */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

export { formatList, formatRelativeTime, languageName, localizeCountry } from "./format";
import { languageName } from "./format";

/** Localized name of a spoken language stored as its English name; alias of `languageName`. */
export function localizeLanguageName(name: string, lang: string): string {
  return languageName(name, lang);
}
