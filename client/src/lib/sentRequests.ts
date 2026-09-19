/**
 * Sent-request memory (P1-21): remembers, per mentor, that this browser sent a
 * request, so the profile rail and cards can show "Request sent" without a
 * readable booking row (anonymous requesters cannot read bookings back).
 * localStorage `mc.sentRequests` = { [mentorId]: { email, sentAt } }, 7-day
 * TTL pruned on read, every access wrapped in try/catch.
 */
const KEY = "mc.sentRequests";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SentRequest {
  email: string;
  /** ISO timestamp of the successful send. */
  sentAt: string;
}

type Store = Record<string, SentRequest>;

function read(now = Date.now()): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Store = {};
    for (const [mentorId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const { email, sentAt } = entry as Partial<SentRequest>;
      if (typeof email !== "string" || typeof sentAt !== "string") continue;
      const at = new Date(sentAt).getTime();
      if (Number.isNaN(at) || now - at > TTL_MS) continue;
      out[mentorId] = { email, sentAt };
    }
    return out;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    if (Object.keys(store).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable (private mode, quota): the UI simply forgets */
  }
}

/** The remembered request for a mentor, or null when none within the TTL. */
export function getSentRequest(mentorId: string): SentRequest | null {
  return read()[mentorId] ?? null;
}

/** Record a successful send. */
export function markSent(mentorId: string, email: string, sentAt: Date = new Date()): void {
  const store = read();
  store[mentorId] = { email, sentAt: sentAt.toISOString() };
  write(store);
}

/** Forget a mentor's remembered request (e.g. after "Send another request"). */
export function clear(mentorId: string): void {
  const store = read();
  if (mentorId in store) {
    delete store[mentorId];
    write(store);
  }
}

export { clear as clearSentRequest };
