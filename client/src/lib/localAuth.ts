import type { AuthUser } from "@/lib/auth";
import type { Mentee, Mentor } from "@/lib/database";
import { getLocalValue, localStore, setLocalValue } from "@/lib/localStore";

/**
 * Local-mode sign-in (`IS_LOCAL`): the session is the mentor or mentee row
 * the person created in this browser, stored under one key and read by
 * `AuthContext` exactly like a Supabase session would be. Amazon SSO and
 * passwords need the deployed API + database, so here an account is simply
 * the email that registered.
 */
export const LOCAL_SESSION_KEY = "session";

/** The programme-admin account available in local mode (shown on the sign-in page). */
export const LOCAL_ADMIN_EMAIL = "admin@mentorconnect.local";
export const LOCAL_ADMIN: AuthUser = { id: "local-admin", email: LOCAL_ADMIN_EMAIL, name: "Programme admin", user_type: "admin", profile_id: "admin" };

export function sessionFromMentor(m: Mentor): AuthUser {
  return { id: `local-${m.id}`, email: m.email ?? "", name: m.name, user_type: "mentor", profile_id: m.id };
}

export function sessionFromMentee(m: Mentee): AuthUser {
  return { id: `local-${m.id}`, email: m.email, name: m.name, user_type: "mentee", profile_id: m.id };
}

export function getLocalSession(): AuthUser | null {
  return getLocalValue<AuthUser>(LOCAL_SESSION_KEY);
}

export function setLocalSession(user: AuthUser | null) {
  setLocalValue(LOCAL_SESSION_KEY, user);
}

/** The account registered with this email, mentors first (a person may be both). */
export function findLocalAccount(email: string): AuthUser | null {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  if (needle === LOCAL_ADMIN_EMAIL) return LOCAL_ADMIN;
  const mentor = localStore.list("mentors").find((m) => (m.email ?? "").toLowerCase() === needle);
  if (mentor) return sessionFromMentor(mentor);
  const mentee = localStore.list("mentees").find((m) => m.email.toLowerCase() === needle);
  return mentee ? sessionFromMentee(mentee) : null;
}
