/**
 * Browser data left over from the preview period (design C2, fix F19).
 *
 * While production ran in local mode, anything visitors submitted (session
 * requests, mentee registrations, mentor profiles, favourites) was kept only
 * in their own browser under `mentorconnect.local.*` and never reached the
 * database (open risk R15). In database mode the app never reads those keys;
 * this module only detects them, so a one-time notice can tell the person to
 * send them again, and clears them on request.
 *
 * Pure over a Storage-like object (node vitest passes a fake). Every storage
 * access is guarded: a blocked or throwing storage reads as "nothing found".
 */

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

const LOCAL_PREFIX = "mentorconnect.local.";
const VALUE_PREFIX = "mentorconnect.value.";

/** Prefixes removed by `clearLegacyLocalData` (collections and single values of the local store). */
export const LEGACY_PREFIXES: readonly string[] = [LOCAL_PREFIX, VALUE_PREFIX];

/**
 * Legacy role-mirror keys removed on clear. `menteeName` / `menteeEmail` stay
 * (they only prefill forms), as do the language keys, `mc.sentRequests`, the
 * `user` mirror and the Supabase session (`sb-*`).
 */
export const LEGACY_ROLE_KEYS: readonly string[] = ["menteeId", "mentorId", "mentorEmail", "mentorName"];

export type LegacyItem =
  | { kind: "request"; id: string; mentorId: string; mentorName?: string; goal?: string; email?: string; createdAt?: string }
  | { kind: "registration"; id: string; name?: string; email?: string; organization?: string; createdAt?: string }
  | { kind: "mentorProfile"; id: string; name?: string; email?: string; createdAt?: string }
  | { kind: "favorite"; id: string; mentorId: string; mentorName?: string; createdAt?: string };

export interface LegacyLocalData {
  /** Number of items the person may want to send again (0 = show nothing). */
  total: number;
  counts: { requests: number; registrations: number; mentorProfiles: number; favorites: number };
  /** Newest first. */
  items: LegacyItem[];
}

const EMPTY: LegacyLocalData = { total: 0, counts: { requests: 0, registrations: 0, mentorProfiles: 0, favorites: 0 }, items: [] };

type Row = Record<string, unknown>;

function readRows(storage: StorageLike, collection: string): Row[] {
  try {
    const raw = storage.getItem(LOCAL_PREFIX + collection);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is Row => !!row && typeof row === "object" && !Array.isArray(row));
  } catch {
    return [];
  }
}

const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);

/** What this browser still holds from local mode, with one summary per item. */
export function detectLegacyLocalData(storage: StorageLike | null | undefined): LegacyLocalData {
  if (!storage) return EMPTY;
  const bookings = readRows(storage, "bookings");
  const mentees = readRows(storage, "mentees");
  const mentors = readRows(storage, "mentors");
  const favorites = readRows(storage, "favorites");
  if (bookings.length + mentees.length + mentors.length + favorites.length === 0) return EMPTY;

  const mentorName = new Map<string, string>();
  for (const m of mentors) {
    const id = str(m.id);
    const name = str(m.name);
    if (id && name) mentorName.set(id, name);
  }
  const menteeEmail = new Map<string, string>();
  for (const m of mentees) {
    const id = str(m.id);
    const email = str(m.email);
    if (id && email) menteeEmail.set(id, email);
  }

  const items: LegacyItem[] = [
    ...bookings.map((b, i): LegacyItem => {
      const mentorId = str(b.mentor_id) ?? "";
      const menteeId = str(b.mentee_id);
      return {
        kind: "request",
        id: str(b.id) ?? `request-${i}`,
        mentorId,
        mentorName: mentorName.get(mentorId),
        goal: str(b.goal),
        email: menteeId ? menteeEmail.get(menteeId) : undefined,
        createdAt: str(b.created_at),
      };
    }),
    ...mentees.map((m, i): LegacyItem => ({
      kind: "registration",
      id: str(m.id) ?? `registration-${i}`,
      name: str(m.name),
      email: str(m.email),
      organization: str(m.organization_name),
      createdAt: str(m.created_at),
    })),
    ...mentors.map((m, i): LegacyItem => ({
      kind: "mentorProfile",
      id: str(m.id) ?? `mentor-${i}`,
      name: str(m.name),
      email: str(m.email),
      createdAt: str(m.created_at),
    })),
    ...favorites.map((f, i): LegacyItem => {
      const mentorId = str(f.mentor_id) ?? "";
      return { kind: "favorite", id: str(f.id) ?? `favorite-${i}`, mentorId, mentorName: mentorName.get(mentorId), createdAt: str(f.created_at) };
    }),
  ];
  items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return {
    total: items.length,
    counts: { requests: bookings.length, registrations: mentees.length, mentorProfiles: mentors.length, favorites: favorites.length },
    items,
  };
}

/** Every key `clearLegacyLocalData` would remove, in storage order. */
export function legacyKeys(storage: StorageLike | null | undefined): string[] {
  if (!storage) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === null) continue;
      if (LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix)) || LEGACY_ROLE_KEYS.includes(key)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

/** Remove the preview-period data and legacy role mirrors; returns the keys that were removed. */
export function clearLegacyLocalData(storage: StorageLike | null | undefined): string[] {
  const keys = legacyKeys(storage);
  const removed: string[] = [];
  for (const key of keys) {
    try {
      storage!.removeItem(key);
      removed.push(key);
    } catch {
      // a key that cannot be removed simply stays; the notice will offer to clear it again
    }
  }
  return removed;
}
