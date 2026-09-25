/**
 * Sent-request memory (P1-21): remembers, per mentor, that this browser sent a
 * request, so the profile rail and cards can show "Request sent" without a
 * readable booking row (anonymous requesters cannot read bookings back).
 * localStorage `mc.sentRequests` = { [mentorId]: { email, sentAt, anonymous? } },
 * 7-day TTL pruned on read, every access wrapped in try/catch.
 */
const KEY = "mc.sentRequests";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SentRequest {
  email: string;
  /** ISO timestamp of the successful send. */
  sentAt: string;
  /**
   * Sent while signed out (R2-01). The server answers the same whether or not the address has an
   * account, and for one that has, nothing was created. So this memory only ever speaks to a
   * signed-out viewer ("Request submitted"); once someone is signed in, their own rows decide.
   */
  anonymous?: boolean;
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
      const { email, sentAt, anonymous } = entry as Partial<SentRequest>;
      if (typeof email !== "string" || typeof sentAt !== "string") continue;
      const at = new Date(sentAt).getTime();
      if (Number.isNaN(at) || now - at > TTL_MS) continue;
      out[mentorId] = anonymous === true ? { email, sentAt, anonymous: true } : { email, sentAt };
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

/** Record a successful send; `anonymous` when it went out while signed out (see SentRequest). */
export function markSent(mentorId: string, email: string, options: { anonymous?: boolean; sentAt?: Date } = {}): void {
  const store = read();
  const sentAt = (options.sentAt ?? new Date()).toISOString();
  store[mentorId] = options.anonymous ? { email, sentAt, anonymous: true } : { email, sentAt };
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
