/**
 * Discovery (`/mentors`) URL state — the pure half (P0-5).
 *
 * Shape: `?q&expertise=a|b&industry=a|b&language=a|b&available=1&near=1&sort=`.
 * Multi-values travel as ONE param joined with `|` (URLSearchParams encodes it
 * as %7C), so a value containing a literal `|` cannot round-trip — expertise
 * and industry tags never do. `parseDiscovery` and `serializeDiscovery` are
 * inverse for every state; the Pass-1 Node test round-trips an Arabic `q`
 * and a tag containing `&`.
 *
 * This file must stay free of React/DOM/alias imports so it runs under
 * `node --experimental-strip-types`.
 */

export const DISCOVERY_SORTS = ["relevance", "reviewed", "newest"] as const;
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];

export interface DiscoveryState {
  /** Free-text query, trimmed. */
  q: string;
  /** Expertise tags (EN keys), multi-select. */
  expertise: string[];
  /** Industry tags (EN keys), multi-select. */
  industry: string[];
  /** Spoken languages as stored on the mentor, multi-select. */
  language: string[];
  /** Only mentors accepting requests. */
  available: boolean;
  /** Only mentors within 3 hours of the viewer's time zone. */
  near: boolean;
  sort: DiscoverySort;
}

export const EMPTY_DISCOVERY: DiscoveryState = {
  q: "",
  expertise: [],
  industry: [],
  language: [],
  available: false,
  near: false,
  sort: "relevance",
};

const MULTI_SEPARATOR = "|";

function parseList(value: string | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(MULTI_SEPARATOR)) {
    const item = part.trim();
    if (item && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function parseFlag(value: string | null): boolean {
  return value === "1" || value === "true";
}

/** Read discovery state from a parsed query string. Unknown params are ignored. */
export function parseDiscovery(params: URLSearchParams): DiscoveryState {
  const sortRaw = params.get("sort");
  const sort = (DISCOVERY_SORTS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as DiscoverySort)
    : "relevance";
  return {
    q: (params.get("q") ?? "").trim(),
    expertise: parseList(params.get("expertise")),
    industry: parseList(params.get("industry")),
    language: parseList(params.get("language")),
    available: parseFlag(params.get("available")),
    near: parseFlag(params.get("near")),
    sort,
  };
}

/** Write discovery state; defaults are omitted so the URL stays short and stable. */
export function serializeDiscovery(state: Partial<DiscoveryState>): URLSearchParams {
  const params = new URLSearchParams();
  const q = (state.q ?? "").trim();
  if (q) params.set("q", q);
  if (state.expertise?.length) params.set("expertise", state.expertise.join(MULTI_SEPARATOR));
  if (state.industry?.length) params.set("industry", state.industry.join(MULTI_SEPARATOR));
  if (state.language?.length) params.set("language", state.language.join(MULTI_SEPARATOR));
  if (state.available) params.set("available", "1");
  if (state.near) params.set("near", "1");
  if (state.sort && state.sort !== "relevance") params.set("sort", state.sort);
  return params;
}

/** True when nothing narrows the list (used by "Clear all" visibility). */
export function isEmptyDiscovery(state: DiscoveryState): boolean {
  return (
    !state.q &&
    state.expertise.length === 0 &&
    state.industry.length === 0 &&
    state.language.length === 0 &&
    !state.available &&
    !state.near
  );
}

/** Count of active filters, excluding the text query and sort (for "Filters (n)"). */
export function activeFilterCount(state: DiscoveryState): number {
  return (
    state.expertise.length +
    state.industry.length +
    state.language.length +
    (state.available ? 1 : 0) +
    (state.near ? 1 : 0)
  );
}
