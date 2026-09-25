/**
 * The programme team's contact address (`VITE_PROGRAMME_CONTACT_EMAIL`, optional). The request
 * forms offer it when their security check cannot run, so a visitor behind a blocker is never
 * stuck; an unset or malformed value means no contact line. Pure: no Supabase import.
 */
/** A plain address only: nothing that would change the mailto link (`?`, `&`, `#`, `%`, spaces, lists). */
const EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function programmeContactEmail(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return EMAIL_RE.test(value) ? value : null;
}

export const PROGRAMME_CONTACT_EMAIL: string | null = programmeContactEmail(import.meta.env.VITE_PROGRAMME_CONTACT_EMAIL);

/** A `mailto:` link to `email` with the subject filled in. */
export function programmeMailto(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
