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
