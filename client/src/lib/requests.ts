/**
 * Session-request client (design §3.4, B4, F03/F31). Pure: no Supabase import,
 * and `fetch` is injectable, so node vitest covers every mapping.
 *
 * - Anonymous visitors POST `/api/requests`, which verifies Turnstile when it
 *   is configured and calls the service-role RPC `create_booking_request`.
 *   A success is `{ ok: true }` and deliberately does not say whether a new
 *   row was created (no oracle), so the client reports `sent`.
 * - Signed-in users call `create_my_booking_request` (their JWT email, never a
 *   typed one); its errors map through `mapRpcError`.
 *
 * Both paths end in one `BookingRequestError` vocabulary the forms render.
 */

/**
 * `service`: the server answered but cannot take requests right now (5xx,
 * including 503 `unavailable` / `captcha_unavailable`, or the RPC missing):
 * not the visitor's connection, so it is not reported as one.
 */
export type BookingRequestErrorKind = "invalid" | "captcha" | "unavailable" | "rateLimited" | "network" | "service" | "generic";

/** Form fields a server-side validation error can point at. */
export type RequestField = "name" | "email" | "goal" | "mentor" | "captcha";

export class BookingRequestError extends Error {
  readonly kind: BookingRequestErrorKind;
  readonly fields: RequestField[];
  readonly retryAfterSeconds?: number;
  readonly status?: number;
  readonly code?: string;

  constructor(
    kind: BookingRequestErrorKind,
    options: { fields?: RequestField[]; retryAfterSeconds?: number; status?: number; code?: string; message?: string } = {},
  ) {
    super(options.message ?? `booking_request_${kind}`);
    this.name = "BookingRequestError";
    this.kind = kind;
    this.fields = options.fields ?? [];
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.status = options.status;
    this.code = options.code;
  }
}

export function isBookingRequestError(value: unknown): value is BookingRequestError {
  return value instanceof BookingRequestError || (value as { name?: unknown } | null)?.name === "BookingRequestError";
}

export interface AnonymousRequestInput {
  mentorId: string;
  name: string;
  email: string;
  goal: string;
  turnstileToken?: string | null;
}

export const REQUESTS_ENDPOINT = "/api/requests";

/** Maps a server field name or RPC message fragment onto the form field it concerns. */
export function toRequestField(raw: unknown): RequestField | null {
  const value = String(raw ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("email")) return "email";
  if (value.includes("goal")) return "goal";
  if (value.includes("name")) return "name";
  if (value.includes("turnstile") || value.includes("captcha")) return "captcha";
  if (value.includes("mentor")) return "mentor";
  return null;
}

function uniqueFields(values: unknown[]): RequestField[] {
  const out: RequestField[] = [];
  for (const value of values) {
    const field = toRequestField(value);
    if (field && !out.includes(field)) out.push(field);
  }
  return out;
}

/** `Retry-After` in seconds (delta form only; an HTTP date is ignored). */
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

/**
 * Non-2xx `/api/requests` response → error (design §3.4 "Responses"):
 * 400 invalid_request (+fields), 403 captcha_failed, 422 mentor_unavailable,
 * 429 rate_limited (DB or IP limiter), 5xx (503 unavailable /
 * captcha_unavailable, 500) service, anything else generic. The body is never
 * trusted to carry more than that.
 */
export function mapRequestsResponse(status: number, body: unknown, retryAfter?: string | null): BookingRequestError {
  const payload = (body && typeof body === "object" ? body : {}) as { error?: unknown; fields?: unknown; retry_after_seconds?: unknown };
  const code = typeof payload.error === "string" ? payload.error : undefined;
  const base = { status, code };
  if (status === 400 && code === "invalid_request") {
    const fields = Array.isArray(payload.fields) ? uniqueFields(payload.fields) : [];
    return new BookingRequestError("invalid", { ...base, fields });
  }
  if (code === "captcha_failed") return new BookingRequestError("captcha", { ...base, fields: ["captcha"] });
  if (code === "mentor_unavailable" || status === 422) return new BookingRequestError("unavailable", base);
  if (code === "rate_limited" || status === 429) {
    const fromBody = typeof payload.retry_after_seconds === "number" ? String(payload.retry_after_seconds) : null;
    return new BookingRequestError("rateLimited", { ...base, retryAfterSeconds: parseRetryAfter(retryAfter ?? fromBody) });
  }
  // 503 (service or bot check temporarily unavailable), 500, 502, 504: the
  // server's side, retryable later.
  if (status >= 500) return new BookingRequestError("service", base);
  // 405/413/415 (client bugs), a 403 that is not ours (e.g. deployment
  // protection), a 200 that is not `{ ok: true }`: retryable.
  return new BookingRequestError("generic", base);
}

/**
 * Supabase RPC error → error (design §3.2 "Error vocabulary"): 22023 carries
 * `invalid_email|invalid_name|invalid_goal` in the message, 42501
 * `mentor_unavailable` (other 42501s are generic), P0001 `rate_limited`,
 * PGRST202 = the function is missing (migration not applied: `service`). A fetch failure
 * inside supabase-js arrives without a code and with a network message.
 */
export function mapRpcError(error: unknown): BookingRequestError {
  if (isBookingRequestError(error)) return error;
  const source = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof source.code === "string" ? source.code.toUpperCase() : "";
  const text = [source.message, source.details, source.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const base = { code: code || undefined };

  if (code === "22023" || /invalid_(email|name|goal)/.test(text)) {
    const fields = uniqueFields(text.match(/invalid_(email|name|goal)/g) ?? []);
    return new BookingRequestError("invalid", { ...base, fields });
  }
  if (text.includes("mentor_unavailable")) return new BookingRequestError("unavailable", base);
  if (code === "P0001" || text.includes("rate_limited") || text.includes("rate limit")) {
    return new BookingRequestError("rateLimited", base);
  }
  if (code === "PGRST202") return new BookingRequestError("service", base);
  if (!code && (error instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed/.test(text))) {
    return new BookingRequestError("network", base);
  }
  return new BookingRequestError("generic", base);
}

/**
 * POST `/api/requests`. Resolves `{ outcome: 'sent' }` on 2xx; throws a
 * `BookingRequestError` otherwise (a thrown fetch = `network`).
 */
export async function submitAnonymousRequest(
  input: AnonymousRequestInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ outcome: "sent" }> {
  const body: Record<string, string> = {
    mentorId: input.mentorId,
    name: input.name.trim(),
    email: input.email.trim(),
    goal: input.goal.trim(),
  };
  if (input.turnstileToken) body.turnstileToken = input.turnstileToken;

  let response: Response;
  try {
    response = await fetchImpl(REQUESTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch (cause) {
    throw new BookingRequestError("network", { message: cause instanceof Error ? cause.message : "network" });
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  // Success is exactly `{ ok: true }`: a 200 from anything else (an SPA
  // fallback page, a proxy) must never read as "request sent".
  if (response.ok && (payload as { ok?: unknown } | null)?.ok === true) return { outcome: "sent" };
  throw mapRequestsResponse(response.status, payload, response.headers.get("Retry-After"));
}
