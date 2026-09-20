/**
 * Local-persistence mode. On when no Supabase project is configured (the
 * placeholder URL in `client/.env`) or `VITE_LOCAL=1`. Everything people
 * submit — mentor profiles, mentee registrations, session requests — is kept
 * in this browser's storage (`lib/localStore.ts`) and shows up across the app
 * immediately; the moment a real `VITE_SUPABASE_URL` / anon key are supplied
 * the same forms write to the database instead, with no code change.
 */
export const IS_LOCAL: boolean =
  import.meta.env.VITE_LOCAL === "1" ||
  import.meta.env.VITE_DEMO === "1" ||
  String(import.meta.env.VITE_SUPABASE_URL ?? "").includes("example.supabase.co");

/** Cal.com link (username or username/event) used for mentors that have not added their own yet. */
export const DEFAULT_CAL_LINK: string = import.meta.env.VITE_DEFAULT_CAL_LINK || "";
