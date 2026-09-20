/**
 * Local-persistence mode. On when no Supabase project is configured — the
 * env is absent (a deployment without the variables) or the placeholder URL
 * from `client/.env` — or `VITE_LOCAL=1`. Everything people submit — mentor
 * profiles, mentee registrations, session requests — is kept in this
 * browser's storage (`lib/localStore.ts`) and shows up across the app
 * immediately; the moment a real `VITE_SUPABASE_URL` / anon key are supplied
 * the same forms write to the database instead, with no code change.
 */
const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const configuredKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
export const IS_LOCAL: boolean =
  import.meta.env.VITE_LOCAL === "1" ||
  import.meta.env.VITE_DEMO === "1" ||
  !configuredUrl ||
  !configuredKey ||
  configuredUrl.includes("example.supabase.co");

/** Cal.com link (username or username/event) used for mentors that have not added their own yet. */
/**
 * Cal.com page used for mentors who have not added their own link yet, so the
 * booking calendar is always live. Default: Cal.com's public sample account
 * (cal.com/cal, "Cal Courtney"); set `VITE_DEFAULT_CAL_LINK` to the
 * programme's own account (username, or username/event). Empty disables the
 * shared calendar and shows the request form instead.
 */
export const DEFAULT_CAL_LINK: string = (import.meta.env.VITE_DEFAULT_CAL_LINK ?? "cal").trim();
