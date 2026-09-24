/**
 * The small, always-loaded half of the auth error handling (design C11):
 * the error type every `lib/auth.ts` call throws, and the reader of Supabase
 * Auth's redirect fragment. The interpretation (codes → what to tell the
 * person) lives in `lib/authErrors.ts`, which only the auth pages load.
 * Pure: no Supabase import.
 */

/** A GoTrue failure normalised to `{ code, status }`. Thrown by every function in `lib/auth.ts`. */
export class AuthFlowError extends Error {
  readonly code: string;
  readonly status: number | null;
  constructor(code: string, status: number | null = null, message?: string) {
    super(message ?? code);
    this.name = "AuthFlowError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Wrap anything supabase-js throws (AuthApiError, AuthRetryableFetchError,
 * TypeError) without interpreting its message; `toAuthFlowError` in
 * lib/authErrors derives a code from the message for older GoTrue servers.
 */
export function asAuthFlowError(err: unknown): AuthFlowError {
  if (err instanceof AuthFlowError) return err;
  const e = (err ?? {}) as { code?: unknown; status?: unknown; message?: unknown; name?: unknown };
  const status = typeof e.status === "number" ? e.status : null;
  const message = typeof e.message === "string" && e.message ? e.message : undefined;
  let code = typeof e.code === "string" && e.code ? e.code : "unknown";
  // supabase-js reports fetch failures as AuthRetryableFetchError with status 0 (or a bare TypeError).
  if (code === "unknown" && (e.name === "AuthRetryableFetchError" || status === 0 || err instanceof TypeError)) code = "network";
  return new AuthFlowError(code, status, message);
}

/**
 * What a Supabase Auth redirect put in the URL (design C11). Only the flow
 * type and error fields are kept — never a token.
 * - `type`: `recovery` (password reset link), `signup` (email confirmation),
 *   `magiclink`, `invite`, `email_change`.
 * - `errorCode` / `errorDescription`: e.g. `otp_expired` for a used or expired link
 *   (GoTrue sends these in the fragment; PKCE-style errors arrive in the query).
 */
export interface InitialAuthHash {
  type: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  /** The fragment carried a session (implicit flow). */
  hasSession: boolean;
}

export function parseAuthRedirect(hash: string, search: string): InitialAuthHash {
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fragmentCode = fragment.get("error_code");
  // The query is consulted only for GoTrue's own error triple, never for the app's `?error=sso_*`.
  const fromQuery = !fragmentCode && !!query.get("error_code");
  const source = fromQuery ? query : fragment;
  return {
    type: fragment.get("type"),
    error: source.get("error"),
    errorCode: fragmentCode ?? query.get("error_code"),
    errorDescription: source.get("error_description"),
    hasSession: fragment.has("access_token"),
  };
}

/**
 * Which session, if any, is a password-recovery session (D13, F11). The
 * recovery link's fragment (read at load) or a `PASSWORD_RECOVERY` event
 * starts it; it belongs to the first session user seen after that and ends
 * when that user signs out or another account signs in. Pure: the caller feeds
 * it every Supabase auth event.
 */
export interface RecoveryState {
  active: boolean;
  /** The recovery session's user; null until the first session after the link is seen. */
  userId: string | null;
}

export function initialRecoveryState(hash: InitialAuthHash): RecoveryState {
  return { active: hash.type === "recovery" && hash.hasSession && !hash.errorCode, userId: null };
}

export function nextRecoveryState(state: RecoveryState, event: string, userId: string | null): RecoveryState {
  if (event === "PASSWORD_RECOVERY") return { active: true, userId };
  if (event === "SIGNED_OUT") return { active: false, userId: null };
  if (!state.active || !userId) return state;
  if (state.userId === null) return { active: true, userId };
  return state.userId === userId ? state : { active: false, userId: null };
}

/** Whether the signed-in `userId` holds the recovery session. */
export function recoveryAppliesTo(state: RecoveryState, userId: string | null | undefined): boolean {
  if (!state.active || !userId) return false;
  return state.userId === null || state.userId === userId;
}

/**
 * An Amazon (SSO) account, judged from the auth session alone, without a
 * database read: the SSO bridge stamps `user_metadata.amazon_alias`, and SSO
 * accounts use the corporate `@amazon.com` address. Such an account never gets a
 * password (D13).
 */
export function isAmazonSessionUser(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!user) return false;
  const alias = user.user_metadata?.amazon_alias;
  if (typeof alias === "string" && alias.trim() !== "") return true;
  return typeof user.email === "string" && /@amazon\.com$/i.test(user.email.trim());
}
