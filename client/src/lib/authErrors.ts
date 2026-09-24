/**
 * Supabase Auth failures mapped to what the person should do next (design
 * C11, fixes F33/F31). Pure: no Supabase import, so node vitest proves the
 * table. `lib/auth.ts` throws `AuthFlowError` (lib/authFlow, always loaded)
 * with GoTrue's machine `code` and HTTP `status`; the auth pages load this
 * module, derive a code from the message for servers that send none
 * (`toAuthFlowError`), then render `authErrorKey(mapAuthError(...))`.
 */
import { AuthFlowError, asAuthFlowError } from "@/lib/authFlow";

export { AuthFlowError } from "@/lib/authFlow";

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "email_in_use"
  | "email_rate_limited"
  | "request_rate_limited"
  | "send_failed"
  | "weak_password"
  | "same_password"
  | "captcha_failed"
  | "invalid_email"
  | "link_expired"
  | "network"
  | "unknown";

/** Which auth call failed; a 5xx on a call that sends an email is almost always the mailer. */
export type AuthFlow = "signup" | "login" | "recover" | "resend" | "update" | "verify";

const EMAIL_FLOWS: ReadonlySet<AuthFlow> = new Set<AuthFlow>(["signup", "recover", "resend"]);

/**
 * GoTrue before v2.1xx sent some errors without `code`; derive it from the
 * message so both server generations map the same way.
 */
export function codeFromMessage(message: string | null | undefined): string | null {
  const m = String(message ?? "").toLowerCase();
  if (!m) return null;
  if (m.includes("invalid login credentials")) return "invalid_credentials";
  if (m.includes("email not confirmed")) return "email_not_confirmed";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("already exists")) return "user_already_exists";
  if (m.includes("captcha")) return "captcha_failed";
  if (m.includes("email rate limit") || m.includes("you can only request this after") || m.includes("for security purposes")) return "over_email_send_rate_limit";
  if (m.includes("rate limit") || m.includes("too many requests")) return "over_request_rate_limit";
  if (m.includes("error sending") || m.includes("smtp")) return "email_send_failed";
  if (m.includes("not authorized") && m.includes("email")) return "email_address_not_authorized";
  // "New password should be different…" also contains "password should": test it first.
  if (m.includes("different from the old password")) return "same_password";
  if (m.includes("password should") || m.includes("weak password")) return "weak_password";
  if (m.includes("expired") || m.includes("invalid or has expired")) return "otp_expired";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) return "network";
  return null;
}

/**
 * Normalise anything thrown by supabase-js (or already wrapped by lib/auth)
 * into an AuthFlowError whose code is known whenever GoTrue said enough:
 * servers that send no `code` get one derived from the message.
 */
export function toAuthFlowError(err: unknown): AuthFlowError {
  const base = asAuthFlowError(err);
  if (base.code !== "unknown") return base;
  const derived = codeFromMessage(base.message === "unknown" ? "" : base.message);
  return derived ? new AuthFlowError(derived, base.status, base.message) : base;
}

/**
 * The decision table (tests/auth-errors.test.ts). Unknown codes fall back on
 * the HTTP status: 429 is a rate limit; a 5xx on a call that sends an email is
 * a mailer failure; status 0 is the network.
 */
export function mapAuthError(code: string | null | undefined, status?: number | null, flow?: AuthFlow): AuthErrorKind {
  switch (code) {
    case "invalid_credentials":
    case "invalid_grant":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "user_already_exists":
    case "email_exists":
    case "identity_already_exists":
      return "email_in_use";
    case "over_email_send_rate_limit":
      return "email_rate_limited";
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return "request_rate_limited";
    case "email_address_not_authorized":
    case "email_send_failed":
    case "email_provider_disabled":
      return "send_failed";
    case "weak_password":
      return "weak_password";
    case "same_password":
      return "same_password";
    case "captcha_failed":
      return "captcha_failed";
    case "validation_failed":
    case "email_address_invalid":
      return "invalid_email";
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return "link_expired";
    case "network":
      return "network";
    default:
      break;
  }
  if (status === 429) return "request_rate_limited";
  if (status === 0) return "network";
  if (typeof status === "number" && status >= 500 && flow && EMAIL_FLOWS.has(flow)) return "send_failed";
  return "unknown";
}

/** i18n key for a kind (`auth.errors.*`); `null` for `unknown`, where each page keeps its own generic copy. */
export function authErrorKey(kind: AuthErrorKind): string | null {
  if (kind === "unknown") return null;
  if (kind === "invalid_credentials") return "auth.invalidCredentials";
  if (kind === "email_in_use") return "auth.emailInUse";
  if (kind === "invalid_email") return "auth.validation.emailInvalid";
  return `auth.errors.${kind}`;
}

/** Seconds before "Resend" may be pressed again after a send. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Remaining whole seconds of a cooldown that started at `sentAt` (ms epoch). */
export function cooldownRemaining(sentAt: number | null, now: number, seconds: number = RESEND_COOLDOWN_SECONDS): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil((sentAt + seconds * 1000 - now) / 1000));
}
