/**
 * The public mentor directory (design D2, B1, F06/F15/F24). Pure: node vitest
 * covers every mode.
 *
 * Against the database `/mentors` is the DB rows plus any curated entry whose
 * `dbId` is not in the DB yet, deduped by `dbId`, with the DB winning on
 * overlap, so the directory is never emptier than the landing's five:
 * - a DB row that is a curated mentor is overlaid (`overlayFeatured`) and keeps
 *   its public slug as the link;
 * - a curated mentor with no row yet (migration 0004 not run) is shown from
 *   the static file as "opening soon": not bookable, no heart, no ratings;
 * - when the DB query fails the five static entries are shown the same way,
 *   flagged `availabilityUnknown` so the grid also shows the error notice.
 * In local (demo) mode the browser's own mentors come first, then the five.
 */
import type { PublicMentor } from "@/lib/database";
import { isFeaturedDbId, overlayFeatured, type FeaturedMentor } from "@/data/featuredMentors";

export type DirectorySource = "db" | "featured" | "local";

export type DirectoryMentor = PublicMentor & {
  /** Public URL slug when the mentor is curated (`/mentor/<slug>`). */
  slug?: string;
  source: DirectorySource;
  /** A request (and a favourite) can be sent right now. */
  bookable: boolean;
  /** Shown from the static file because the database could not be read. */
  availabilityUnknown?: boolean;
};

export interface MergeDirectoryInput {
  isLocal: boolean;
  /** `mentors_public` rows (DB mode); undefined when the query has not succeeded. */
  dbRows?: ReadonlyArray<PublicMentor> | null;
  featured: ReadonlyArray<FeaturedMentor>;
  /** Mentors saved in this browser (local mode only). */
  localRows?: ReadonlyArray<PublicMentor>;
  /** The DB query failed: show the curated five, not bookable. */
  dbFailed?: boolean;
}

/** Only the `PublicMentor` columns of a curated entry: the showcase extras never reach a card. */
function publicColumns(m: FeaturedMentor): PublicMentor {
  return {
    id: m.id,
    name: m.name,
    name_ar: m.name_ar,
    company: m.company,
    company_ar: m.company_ar,
    position: m.position,
    position_ar: m.position_ar,
    timezone: m.timezone,
    country: m.country,
    photo_url: m.photo_url,
    bio: m.bio,
    bio_ar: m.bio_ar,
    expertise: m.expertise,
    expertise_ar: m.expertise_ar,
    industries: m.industries,
    industries_ar: m.industries_ar,
    languages_spoken: m.languages_spoken,
    mentorship_preference: m.mentorship_preference,
    is_available: m.is_available,
    average_rating: m.average_rating,
    total_ratings: m.total_ratings,
    created_at: m.created_at,
  };
}

/**
 * A curated entry that has no database row (or whose row could not be read):
 * linked by slug, never bookable, and with the demo ratings removed so no
 * fabricated social proof reaches a DB-mode card (D14). `is_available` is
 * false so the "Accepting requests" filter and sort treat it honestly.
 */
export function staticFeaturedEntry(m: FeaturedMentor, availabilityUnknown = false): DirectoryMentor {
  return {
    ...publicColumns(m),
    id: m.id,
    slug: m.id,
    source: "featured",
    bookable: false,
    is_available: false,
    average_rating: "0",
    total_ratings: 0,
    ...(availabilityUnknown ? { availabilityUnknown: true } : {}),
  };
}

export function mergeDirectory({ isLocal, dbRows, featured, localRows = [], dbFailed = false }: MergeDirectoryInput): DirectoryMentor[] {
  if (isLocal) {
    // Demo mode: the showcase as designed (ratings and all), deduped by id, first wins.
    const byId = new Map<string, DirectoryMentor>();
    for (const row of localRows) {
      if (!byId.has(row.id)) byId.set(row.id, { ...row, source: "local", bookable: row.is_available });
    }
    for (const m of featured) {
      if (!byId.has(m.id)) byId.set(m.id, { ...publicColumns(m), slug: m.id, source: "featured", bookable: m.is_available });
    }
    return Array.from(byId.values());
  }

  if (dbFailed && !dbRows) return featured.map((m) => staticFeaturedEntry(m, true));

  const featuredByDbId = new Map(featured.map((m) => [m.dbId, m]));
  const seen = new Set<string>();
  const out: DirectoryMentor[] = [];
  for (const row of dbRows ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const curated = isFeaturedDbId(row.id) ? featuredByDbId.get(row.id) : undefined;
    if (curated) {
      const overlaid = overlayFeatured(row, withoutShowcaseProof(curated));
      out.push({ ...publicColumns(overlaid), id: row.id, created_at: row.created_at ?? overlaid.created_at, slug: curated.id, source: "db", bookable: row.is_available });
    } else {
      out.push({ ...row, source: "db", bookable: row.is_available });
    }
  }
  for (const m of featured) {
    if (!seen.has(m.dbId)) out.push(staticFeaturedEntry(m));
  }
  return out;
}

/** Directory fields of any mentor-shaped value (plain `PublicMentor`s count as DB rows). */
export function directoryFields(m: PublicMentor & Partial<Pick<DirectoryMentor, "slug" | "source" | "bookable" | "availabilityUnknown">>): {
  href: string;
  slug?: string;
  source: DirectorySource;
  bookable: boolean;
  availabilityUnknown: boolean;
} {
  const slug = m.slug;
  return {
    href: slug ?? m.id,
    slug,
    source: m.source ?? "db",
    bookable: m.bookable ?? Boolean(m.is_available),
    availabilityUnknown: Boolean(m.availabilityUnknown),
  };
}

// ---------------------------------------------------------------------------
// Featured profile / session page state (design B2, D2)
// ---------------------------------------------------------------------------

export type FeaturedPageKind = "local" | "loading" | "db" | "static" | "error";

export interface FeaturedPageState {
  kind: FeaturedPageKind;
  /** What the page renders: the curated entry, overlaid with the DB row in `db`. */
  mentor: FeaturedMentor;
  /** The id requests and favourites use: the DB id against the database, the entry id in demo mode. */
  requestId: string;
  /** The request form / "Book" may be shown. */
  bookable: boolean;
  /** The heart may be shown (it needs a real, requestable row). */
  canFavorite: boolean;
  /** Demo-only showcase proof (testimonials, sample ratings, "1.8k sessions"). */
  showShowcaseProof: boolean;
  /** Whether the mentor accepts requests: null while unknown (loading, error, not seeded). */
  accepting: boolean | null;
  /**
   * The programme team answers requests (a curated mentor whose row has not
   * been handed to the real person). Drives the honest "who replies" copy.
   */
  programmeManaged: boolean;
}

/**
 * A curated entry with the demo social proof removed (sample rating, rating
 * count, "1.8k sessions", testimonials). What a DB-mode page renders while no
 * database row backs the entry (loading, not seeded, read failed), so no
 * surface can show invented numbers against the database (D14).
 */
export function withoutShowcaseProof(m: FeaturedMentor): FeaturedMentor {
  return { ...m, average_rating: "0", total_ratings: 0, rating: "", ratings: 0, bookings: "", testimonials: [] };
}

export interface FeaturedPageQuery {
  status: "pending" | "success" | "error";
  data?: PublicMentor | null;
}

export function featuredPageState(input: { isLocal: boolean; featured: FeaturedMentor; query: FeaturedPageQuery }): FeaturedPageState {
  const { isLocal, featured, query } = input;
  const curated = isFeaturedDbId(featured.dbId);
  if (isLocal) {
    return {
      kind: "local",
      mentor: featured,
      requestId: featured.id,
      bookable: featured.is_available,
      canFavorite: true,
      showShowcaseProof: true,
      accepting: featured.is_available,
      programmeManaged: curated,
    };
  }
  const closed = { requestId: featured.dbId, bookable: false, canFavorite: false, showShowcaseProof: false, programmeManaged: curated };
  // Without a row there are no real ratings: the page never sees the demo numbers (D14).
  const bare = withoutShowcaseProof(featured);
  if (query.status === "pending") return { ...closed, kind: "loading", mentor: bare, accepting: null };
  if (query.status === "error") return { ...closed, kind: "error", mentor: bare, accepting: null };
  if (!query.data) return { ...closed, kind: "static", mentor: bare, accepting: null };
  const row = query.data;
  // `mentors_public` may not expose the flag; a curated row counts as programme-managed unless it says otherwise.
  const managed = (row as PublicMentor & { managed_by_programme?: boolean | null }).managed_by_programme;
  return {
    kind: "db",
    mentor: overlayFeatured(row, withoutShowcaseProof(featured)),
    requestId: row.id,
    bookable: row.is_available,
    canFavorite: row.is_available,
    showShowcaseProof: false,
    accepting: row.is_available,
    programmeManaged: curated && managed !== false,
  };
}
