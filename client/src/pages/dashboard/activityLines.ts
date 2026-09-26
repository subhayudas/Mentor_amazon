/**
 * Localised lines for the activity events the CLIENT writes (R1-46, R1-74): registrations,
 * profile and calendar saves, favourites. Booking events come from the database trigger and
 * are localised from their `meta` by `lib/activitySummary.ts`; these were rendered from the
 * stored `summary`, which is a sentence frozen in the writer's language, so an Arabic reader
 * saw English lines (and an English reader would see Arabic ones).
 *
 * They are rendered by `type` in the reader's language instead, with the names taken from
 * `meta` (new rows) or the row's `actor_name` (every row, old ones included). The stored
 * `summary` is only the last resort. Pure: no i18n, no Supabase, so node vitest proves it.
 */
import type { ActivityEvent } from "@/lib/database";

export interface ClientSummary {
  /** Suffix under `showcase.activity.summaries.` */
  key: string;
  params: Record<string, string>;
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

/** What older favourite rows stored (English, written by lib/favorites.ts before R1-46). */
const OLD_FAVOURITE = /^(?:Saved (.+) as a favourite|Removed (.+) from favourites)$/;
const UNNAMED = "a mentor";

/** The summary key and params for a client-written event, or `null` (render `event.summary`). */
export function clientSummary(event: Pick<ActivityEvent, "type" | "actor_name" | "summary" | "meta">): ClientSummary | null {
  const meta = event.meta && typeof event.meta === "object" ? (event.meta as Record<string, unknown>) : {};
  const name = text(meta.name) ?? text(event.actor_name);
  switch (event.type) {
    case "mentor_registered":
      return name ? { key: "mentorRegistered", params: { name } } : null;
    case "mentee_registered":
      return name ? { key: "menteeRegistered", params: { name } } : null;
    case "profile_updated":
      return name ? { key: "profileUpdated", params: { name } } : null;
    case "calendar_updated":
      return { key: "calendarUpdated", params: {} };
    case "favorite_added":
    case "favorite_removed": {
      const added = event.type === "favorite_added";
      const old = OLD_FAVOURITE.exec(text(event.summary) ?? "");
      const mentor = text(meta.mentor_name) ?? (old ? text(old[1] ?? old[2]) : undefined);
      if (mentor && mentor !== UNNAMED) return { key: added ? "favoriteAdded" : "favoriteRemoved", params: { mentor } };
      // No name on record: still say what happened, in the reader's language.
      return { key: added ? "favoriteAddedUnnamed" : "favoriteRemovedUnnamed", params: {} };
    }
    default:
      return null;
  }
}

/** Every key `clientSummary` can return (the locale test checks each exists in EN and AR). */
export const CLIENT_SUMMARY_KEYS: readonly string[] = [
  "mentorRegistered",
  "menteeRegistered",
  "profileUpdated",
  "calendarUpdated",
  "favoriteAdded",
  "favoriteRemoved",
  "favoriteAddedUnnamed",
  "favoriteRemovedUnnamed",
];
