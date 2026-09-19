/**
 * Maps a failed `bookingService.createRequest` into the four copy cases of
 * P1-22. The database raises `rate_limited` (P0001) from the bookings trigger,
 * RLS rejects the insert with 42501 once `is_available` is false, and
 * `get_or_create_mentee` raises `invalid_email` (22023). The code is read from
 * `error.code`; the message/details text is a fallback in case a proxy strips
 * the code. Everything else is a generic "check your connection" error.
 */
export type BookingErrorKind = "rateLimited" | "unavailable" | "invalidEmail" | "generic";

export function classifyBookingError(error: unknown): BookingErrorKind {
  const source = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof source.code === "string" ? source.code.toUpperCase() : "";
  const text = [source.message, source.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (code === "P0001" || text.includes("rate_limited") || text.includes("rate limit")) return "rateLimited";
  if (code === "42501" || text.includes("row-level security")) return "unavailable";
  if (code === "22023" || text.includes("invalid_email")) return "invalidEmail";
  return "generic";
}
