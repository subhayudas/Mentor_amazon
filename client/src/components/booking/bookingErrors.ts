import { isBookingRequestError, mapRpcError, type RequestField } from "@/lib/requests";

/**
 * Maps a failed `bookingService.createRequest` onto the copy cases the request
 * forms show (design §3.4 / B3 / B4). Both request paths already throw a
 * `BookingRequestError` (`lib/requests.ts`); anything else (an unexpected
 * throw) goes through the same RPC vocabulary, so a stray PostgREST error
 * still lands on the right message.
 *
 * - `captcha`: the server's bot check failed (403) — reset the widget.
 * - `botCheck`: no Turnstile token yet; set by the forms, never returned here.
 * - `rateLimited`: DB or IP limit (429 / P0001).
 * - `unavailable`: the mentor stopped accepting requests (422 / 42501 mentor_unavailable).
 * - `invalidEmail` / `invalid`: server-side validation (400 / 22023).
 * - `generic`: network, 5xx, anything else — "check your connection and try again".
 */
export type BookingErrorKind = "captcha" | "botCheck" | "rateLimited" | "unavailable" | "invalidEmail" | "invalid" | "generic";

export function classifyBookingError(error: unknown): BookingErrorKind {
  const mapped = isBookingRequestError(error) ? error : mapRpcError(error);
  switch (mapped.kind) {
    case "captcha":
      return "captcha";
    case "rateLimited":
      return "rateLimited";
    case "unavailable":
      return "unavailable";
    case "invalid":
      return mapped.fields.includes("email") ? "invalidEmail" : "invalid";
    case "network":
    case "generic":
    default:
      return "generic";
  }
}

/** The form fields a validation error points at (empty for every other kind). */
export function invalidRequestFields(error: unknown): RequestField[] {
  const mapped = isBookingRequestError(error) ? error : mapRpcError(error);
  return mapped.kind === "invalid" ? mapped.fields : [];
}

/** Whether another send can succeed without the person changing something first. */
export function isSendBlocked(kind: BookingErrorKind | null): boolean {
  return kind === "rateLimited" || kind === "unavailable";
}
