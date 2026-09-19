/**
 * Pure discovery logic (P1-2, P1-10, P2-10): filtering, search ranking,
 * sorting, facet counts and the bilingual label maps over the once-loaded
 * `mentors_public` list. No React, no DOM, no network — `/` and `/mentors`
 * both call `applyDiscovery` inside one `useMemo`.
 *
 * Availability rows are deliberately NOT an input: C13 removed the "has
 * typical availability" filter and the card strip, so nothing here reads
 * `mentor_availability`.
 *
 * Search (P1-10) goes through `lib/search.ts` over BOTH the English and the
 * Arabic fields, so `?q=المنتجات` finds `expertise_ar` "إدارة المنتجات" in
 * either UI language, and the landing need rows count with the same function.
 */
import type { PublicMentor } from "@/lib/database";
import type { DiscoverySort, DiscoveryState } from "@/lib/discoveryState";
import { tzOffsetMinutes } from "@/lib/format";
import { matchesQuery, normalizeForSearch } from "@/lib/search";

export interface DiscoveryContext {
  /** Active UI language ("en" | "ar"). */
  lang: string;
  /** The viewer's IANA zone for the "within N hours" filter. */
  viewerTz: string;
}

/** "Within 3 hours of my time zone" (spec §5). */
export const NEAR_HOURS = 3;
/** The sort control renders only when the unfiltered list is larger than this (P2-10). */
export const SORT_THRESHOLD = 12;
/** Expertise chips shown on a card before the "+n" overflow (P1-15). */
export const CARD_CHIP_LIMIT = 3;
/** Example chips under the search box (spec §5). */
export const EXAMPLE_CHIP_LIMIT = 5;
/** Cards on the landing preview (spec §5.2) and on the mobile scroller (P0-7). */
export const PREVIEW_LIMIT = 6;
export const PREVIEW_LIMIT_MOBILE = 4;

export const isArabic = (lang: string): boolean => lang.startsWith("ar");

type TextField = "name" | "position" | "company" | "bio";
type ListField = "expertise" | "industries";

/** The mentor's text field in the active language, falling back to English. */
export function localized(mentor: PublicMentor, field: TextField, lang: string): string {
  if (isArabic(lang)) {
    const ar = mentor[`${field}_ar` as const];
    if (ar && ar.trim()) return ar;
  }
  return mentor[field] ?? "";
}

export interface LocalizedTag {
  /** The English value — the filter key and URL value. */
  key: string;
  /** What the UI shows: the `_ar` value at the same index in Arabic, else the key. */
  label: string;
}

/** Expertise / industry tags as (EN key, localized label) pairs (spec §10). */
export function localizedTags(mentor: PublicMentor, field: ListField, lang: string): LocalizedTag[] {
  const keys = mentor[field] ?? [];
  const ar = isArabic(lang) ? mentor[`${field}_ar` as const] : undefined;
  return keys.map((key, i) => ({ key, label: (ar && ar[i]?.trim()) || key }));
}

/**
 * EN → AR label map built from every mentor's index pairs, so filter options
 * (which are EN keys) can be displayed in Arabic when any mentor supplies a
 * translation. Filtering always compares EN keys.
 */
export function buildLabelMap(mentors: ReadonlyArray<PublicMentor>, field: ListField): Map<string, string> {
  const map = new Map<string, string>();
  for (const mentor of mentors) {
    const keys = mentor[field] ?? [];
    const ar = mentor[`${field}_ar` as const];
    if (!ar) continue;
    keys.forEach((key, i) => {
      const label = ar[i]?.trim();
      if (label && !map.has(key)) map.set(key, label);
    });
  }
  return map;
}

export function tagLabel(map: Map<string, string> | undefined, key: string, lang: string): string {
  return (isArabic(lang) && map?.get(key)) || key;
}

/** First sentence of a bio for the card's helps-with line (spec §5). */
export function firstSentence(text: string | null | undefined): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^.*?[.!?؟。](?=\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

/** Every searchable field, English and Arabic, grouped in ranking order (P2-10). */
function searchGroups(mentor: PublicMentor): Array<Array<string | undefined>> {
  return [
    [mentor.name, mentor.name_ar],
    [...(mentor.expertise ?? []), ...(mentor.expertise_ar ?? [])],
    [mentor.position, mentor.position_ar, mentor.company, mentor.company_ar],
    [...(mentor.industries ?? []), ...(mentor.industries_ar ?? [])],
    [mentor.bio, mentor.bio_ar],
  ];
}

/**
 * Where the query matches: 0 name, 1 expertise, 2 position/company,
 * 3 industries, 4 bio (every token inside that group), 5 when the tokens are
 * spread across groups; `null` when the mentor does not match at all.
 */
export function matchRank(mentor: PublicMentor, q: string): number | null {
  const groups = searchGroups(mentor);
  const all = groups.flat();
  if (!matchesQuery(all, q)) return null;
  const index = groups.findIndex((fields) => matchesQuery(fields, q));
  return index === -1 ? groups.length : index;
}

export function matchesMentor(mentor: PublicMentor, q: string): boolean {
  if (!q.trim()) return true;
  return matchesQuery(searchGroups(mentor).flat(), q);
}

/** Absolute offset between the mentor's zone and the viewer's, in hours; null for an unknown zone. */
export function hoursApart(mentorTz: string | null | undefined, viewerTz: string, at: Date = new Date()): number | null {
  if (!mentorTz) return null;
  const a = tzOffsetMinutes(mentorTz, at);
  const b = tzOffsetMinutes(viewerTz, at);
  if (a == null || b == null) return null;
  return Math.abs(a - b) / 60;
}

export function isWithinHours(mentorTz: string | null | undefined, viewerTz: string, hours: number = NEAR_HOURS): boolean {
  const diff = hoursApart(mentorTz, viewerTz);
  return diff != null && diff <= hours;
}

const ratingCount = (m: PublicMentor): number => m.total_ratings ?? 0;
const ratingValue = (m: PublicMentor): number => {
  const n = Number.parseFloat(String(m.average_rating ?? ""));
  return Number.isFinite(n) ? n : 0;
};

function compareName(a: PublicMentor, b: PublicMentor, lang: string): number {
  return localized(a, "name", lang).localeCompare(localized(b, "name", lang), isArabic(lang) ? "ar" : "en");
}

/**
 * Sort a filtered list. Relevance = accepting first, then rating count, then
 * name; with a query, the match location comes first (P2-10). "Most reviewed"
 * and "Newest" are explicit choices and ignore the query rank.
 */
export function sortMentors(
  mentors: ReadonlyArray<PublicMentor>,
  sort: DiscoverySort,
  q: string,
  lang: string,
): PublicMentor[] {
  const list = [...mentors];
  const query = q.trim();
  const ranks = new Map<string, number>();
  if (sort === "relevance" && query) {
    for (const m of list) ranks.set(m.id, matchRank(m, query) ?? Number.MAX_SAFE_INTEGER);
  }
  list.sort((a, b) => {
    if (sort === "newest") {
      const byDate = Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "");
      if (byDate) return byDate;
      return compareName(a, b, lang);
    }
    if (sort === "reviewed") {
      const byCount = ratingCount(b) - ratingCount(a);
      if (byCount) return byCount;
      const byValue = ratingValue(b) - ratingValue(a);
      if (byValue) return byValue;
    } else if (query) {
      const byRank = (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0);
      if (byRank) return byRank;
    }
    const byAccepting = Number(Boolean(b.is_available)) - Number(Boolean(a.is_available));
    if (byAccepting) return byAccepting;
    const byCount = ratingCount(b) - ratingCount(a);
    if (byCount) return byCount;
    return compareName(a, b, lang);
  });
  return list;
}

/**
 * Filter + search + sort in one pure pass. Multi-select groups match ANY of
 * their values (a mentor with either tag qualifies); groups combine with AND,
 * which is what the zero-result copy "match all of these" describes.
 */
export function applyDiscovery(
  mentors: ReadonlyArray<PublicMentor>,
  state: DiscoveryState,
  ctx: DiscoveryContext,
): PublicMentor[] {
  const q = state.q.trim();
  const filtered = mentors.filter((m) => {
    if (state.available && !m.is_available) return false;
    if (state.expertise.length && !state.expertise.some((tag) => (m.expertise ?? []).includes(tag))) return false;
    if (state.industry.length && !state.industry.some((tag) => (m.industries ?? []).includes(tag))) return false;
    if (state.language.length && !state.language.some((l) => (m.languages_spoken ?? []).includes(l))) return false;
    if (state.near && !isWithinHours(m.timezone, ctx.viewerTz)) return false;
    if (q && !matchesMentor(m, q)) return false;
    return true;
  });
  return sortMentors(filtered, state.sort, q, ctx.lang);
}

/** The landing preview: accepting first, then rating count, then name. */
export function previewMentors(mentors: ReadonlyArray<PublicMentor>, limit: number, lang: string): PublicMentor[] {
  return sortMentors(mentors, "relevance", "", lang).slice(0, limit);
}

export interface FacetOption {
  /** Stored value (EN key or stored language name) — what the URL carries. */
  value: string;
  /** Localized display label. */
  label: string;
  /** Mentors carrying this value in the unfiltered list. */
  count: number;
}

type FacetField = ListField | "languages_spoken";

/** Distinct values with counts, most common first, then by label (client-side facets, spec §5). */
export function facetCounts(mentors: ReadonlyArray<PublicMentor>, field: FacetField, lang: string): FacetOption[] {
  const counts = new Map<string, number>();
  for (const m of mentors) {
    Array.from(new Set(m[field] ?? [])).forEach((value) => {
      const key = value.trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  }
  const labelMap = field === "languages_spoken" ? undefined : buildLabelMap(mentors, field);
  const collator = new Intl.Collator(isArabic(lang) ? "ar" : "en");
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      count,
      label: field === "languages_spoken" ? languageLabel(value, lang) : tagLabel(labelMap, value, lang),
    }))
    .sort((a, b) => b.count - a.count || collator.compare(a.label, b.label));
}

/** The n most frequent tags of a field (example chips, spec §5). */
export function topTags(mentors: ReadonlyArray<PublicMentor>, field: ListField, n: number, lang: string): FacetOption[] {
  return facetCounts(mentors, field, lang).slice(0, n);
}

/** Trust line numbers computed from data only (spec §5.1): distinct languages and countries. */
export function trustStats(mentors: ReadonlyArray<PublicMentor>): { mentors: number; languages: number; countries: number } {
  const languages = new Set<string>();
  const countries = new Set<string>();
  for (const m of mentors) {
    for (const l of m.languages_spoken ?? []) if (l.trim()) languages.add(normalizeForSearch(l));
    if (m.country?.trim()) countries.add(normalizeForSearch(m.country));
  }
  return { mentors: mentors.length, languages: languages.size, countries: countries.size };
}

/** How many mentors a need row's search term finds — the same function `/mentors?q=` uses. */
export function countMatching(mentors: ReadonlyArray<PublicMentor>, term: string): number {
  return mentors.reduce((n, m) => n + (matchesMentor(m, term) ? 1 : 0), 0);
}

/**
 * Stored language names → BCP-47 codes for `Intl.DisplayNames`. The onboarding
 * form offers six; the extra entries cover values already in the data. Unknown
 * values are displayed as stored (spec §10).
 */
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
  tamil: "ta",
  bengali: "bn",
  mandarin: "zh",
  chinese: "zh",
  portuguese: "pt",
  italian: "it",
  russian: "ru",
  tagalog: "tl",
  filipino: "fil",
  persian: "fa",
  farsi: "fa",
  japanese: "ja",
  korean: "ko",
  dutch: "nl",
  greek: "el",
  hebrew: "he",
  swahili: "sw",
  amharic: "am",
  somali: "so",
  punjabi: "pa",
  gujarati: "gu",
  marathi: "mr",
  telugu: "te",
  kannada: "kn",
  sinhala: "si",
  nepali: "ne",
  indonesian: "id",
  malay: "ms",
  thai: "th",
  vietnamese: "vi",
  polish: "pl",
  ukrainian: "uk",
  romanian: "ro",
  czech: "cs",
  swedish: "sv",
  norwegian: "no",
  danish: "da",
  finnish: "fi",
  hungarian: "hu",
};

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

/** "English" → "الإنجليزية" in Arabic, the stored string when the name is unknown. */
export function languageLabel(stored: string, lang: string): string {
  const code = LANGUAGE_CODES[stored.trim().toLowerCase()];
  if (!code) return stored;
  const locale = isArabic(lang) ? "ar" : "en";
  let names = displayNamesCache.get(locale);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      names = null;
    }
    displayNamesCache.set(locale, names);
  }
  try {
    return names?.of(code) ?? stored;
  } catch {
    return stored;
  }
}

/** Localized, de-duplicated language names for a card's meta line. */
export function languageLabels(mentor: PublicMentor, lang: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const stored of mentor.languages_spoken ?? []) {
    const label = languageLabel(stored, lang);
    const key = normalizeForSearch(label);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

/** Initials for the avatar fallback: first letters of the first two words. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}
