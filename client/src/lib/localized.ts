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

/** Stored language names (English, as the forms save them) → BCP-47 codes for `Intl.DisplayNames`. */
const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  arabic: "ar",
  french: "fr",
  german: "de",
  spanish: "es",
  turkish: "tr",
  hindi: "hi",
  urdu: "ur",
  malayalam: "ml",
  mandarin: "zh",
  chinese: "zh",
  portuguese: "pt",
  italian: "it",
  russian: "ru",
};

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

/**
 * Localized name of a spoken language stored as its English name ("Arabic" →
 * "العربية" in Arabic UI); unknown values come back unchanged.
 */
export function localizeLanguageName(name: string, lang: string): string {
  const code = LANGUAGE_CODES[name.trim().toLowerCase()];
  if (!code) return name;
  let names = displayNamesCache.get(lang);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([lang], { type: "language" });
    } catch {
      names = null;
    }
    displayNamesCache.set(lang, names);
  }
  try {
    return names?.of(code) ?? name;
  } catch {
    return name;
  }
}

/** "3 hours ago" / "in 2 days" style relative time for feeds; falls back to the placeholder for bad input. */
export function formatRelativeTime(iso: string | null | undefined, lang: string, now: Date = new Date()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSeconds = Math.round((then - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const locale = lang.startsWith("ar") ? "ar-AE-u-nu-latn" : "en-GB";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diffSeconds), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(diffSeconds / 86_400), "day");
  return rtf.format(Math.round(diffSeconds / (86_400 * 30)), "month");
}
