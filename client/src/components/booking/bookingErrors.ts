import * as React from "react";

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
 * - `service`: the server is down or not ready (5xx) — "can't be sent right now, try again in a few minutes".
 * - `generic`: network and anything else — "check your connection and try again".
 */
export type BookingErrorKind = "captcha" | "botCheck" | "rateLimited" | "unavailable" | "invalidEmail" | "invalid" | "service" | "generic";

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
    case "service":
      return "service";
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

/** Rate-limit copy threshold: at or under this the alert says "in a few minutes", above it "in an hour". */
export const SHORT_RETRY_SECONDS = 15 * 60;

/**
 * How long Send stays blocked after a 429: the server's `Retry-After` when it
 * sent one (at least 5 s), otherwise the hour the DB limit counts over.
 * Capped at an hour.
 */
export function rateLimitCooldownMs(retryAfterSeconds: number | undefined): number {
  const seconds = retryAfterSeconds === undefined || !Number.isFinite(retryAfterSeconds) ? 3600 : Math.max(5, retryAfterSeconds);
  return Math.min(seconds, 3600) * 1000;
}

/**
 * `isSendBlocked` for a live form: a rate limit only blocks Send until its
 * cooldown ends (the copy says when to try again, so the button must let the
 * person do it without reloading); "stopped accepting" blocks until reopened.
 */
export function useSendBlocked(kind: BookingErrorKind | null, retryAfterSeconds: number | undefined): boolean {
  const [cooledDown, setCooledDown] = React.useState(false);
  React.useEffect(() => {
    setCooledDown(false);
    if (kind !== "rateLimited") return;
    const timer = window.setTimeout(() => setCooledDown(true), rateLimitCooldownMs(retryAfterSeconds));
    return () => window.clearTimeout(timer);
  }, [kind, retryAfterSeconds]);
  return isSendBlocked(kind) && !(kind === "rateLimited" && cooledDown);
}
