/**
 * Client-side bilingual search (P1-10). One normaliser for discovery, the
 * landing need rows and example chips so every count agrees. Never send the
 * query to PostgREST.
 */

// Built with the constructor so the `u`-flag property escape compiles under the
// repo's tsc target; semantics are identical to /\p{M}+/gu.
const COMBINING_MARKS = new RegExp("\\p{M}+", "gu");

/**
 * Case-, diacritic- and Arabic-letter-form-insensitive key: NFKD, strip
 * combining marks (harakat included), drop tatweel, fold أ/إ/آ → ا, ة → ه,
 * ى → ي, then lower-case.
 */
export function normalizeForSearch(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[ـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLocaleLowerCase();
}

/** Split a query into normalised, non-empty tokens. */
export function queryTokens(q: string | null | undefined): string[] {
  return normalizeForSearch(q).split(/\s+/).filter(Boolean);
}

/**
 * Every whitespace-separated token of `q` must appear in at least one field.
 * An empty query matches everything.
 */
export function matchesQuery(fields: ReadonlyArray<string | null | undefined>, q: string | null | undefined): boolean {
  const tokens = queryTokens(q);
  if (tokens.length === 0) return true;
  const haystack = fields.map((f) => normalizeForSearch(f)).filter(Boolean);
  return tokens.every((token) => haystack.some((field) => field.includes(token)));
}
