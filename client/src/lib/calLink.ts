/**
 * Cal.com link helpers, shared by onboarding, profile settings, the booking
 * flows and the Cal sync panel. Pure: no Supabase, no DOM, so node vitest can
 * test it. A stored `cal_link` is always the normalised `username/event` form.
 */

/** `username/event` (or `team/<slug>`), after normalising. */
export const CAL_PATTERN = /^[a-z0-9._-]+\/[a-z0-9_-]+$/i;

/**
 * `https://cal.com/user/30min?x=1#y`, `app.cal.com/user/30min`, `cal.com/user/30min`
 * or `/user/30min/` → `user/30min`. Query, hash and edge slashes are dropped.
 */
export function normalizeCalLink(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?(app\.)?cal\.com\//i, "")
    .replace(/^(www\.)?(app\.)?cal\.com\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "");
}

/** True when the value normalises to `username/event`. Callers treat "" as "cleared". */
export function isValidCalLink(value: string | null | undefined): boolean {
  return CAL_PATTERN.test(normalizeCalLink(value));
}

/**
 * The Cal.com username (lower-cased, as the webhook organizer check compares it)
 * of a personal link; null for `team/...` links and anything invalid.
 */
export function calUsername(link: string | null | undefined): string | null {
  const normalized = normalizeCalLink(link);
  if (!CAL_PATTERN.test(normalized)) return null;
  const username = normalized.split("/")[0].toLowerCase();
  return username === "team" ? null : username;
}

/** Cal link that opens the reschedule flow for an existing Cal booking. */
export function calRescheduleLink(uid: string): string {
  return "reschedule/" + uid;
}

/** Cal.com's own page for cancelling a booking. */
export function calCancelUrl(uid: string): string {
  return "https://app.cal.com/booking/" + encodeURIComponent(uid) + "?cancel=true";
}

/** Public booking page for a normalised link. */
export function calPublicUrl(link: string): string {
  return "https://cal.com/" + link;
}
