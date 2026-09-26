/**
 * Stored timestamps (design F45, open risk R14). Base-table columns such as
 * `bookings.scheduled_at`, `bookings.created_at` and `notifications.created_at`
 * are `timestamp without time zone` holding UTC wall-clock time, and PostgREST
 * returns them with no offset ("2026-09-24T10:00:00.123456"). `new Date()` reads
 * an offset-less date-time as the viewer's LOCAL time, which moves every time,
 * relative day and past/future check by the viewer's UTC offset: a session at
 * 12:00 UTC showed as 12:00 in Dubai instead of 16:00, and a request sent a
 * minute before local midnight read "sent yesterday".
 *
 * Parse stored values through here. A value that already carries `Z` or an
 * offset (browser-mode rows, `timestamptz` columns, Cal.com payloads) and a
 * date-only value pass through unchanged.
 */

const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** `2026-09-24T10:00:00` (UTC wall-clock) → `2026-09-24T10:00:00Z`; offsets, dates and other text pass through. */
export function asUtcIso(value: string | null | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  const trimmed = value.trim();
  const match = ISO_DATE_TIME.exec(trimmed);
  if (!match) return trimmed;
  return `${match[1]}T${match[2]}${match[3] ?? "Z"}`;
}

export type TimestampInput = string | number | Date | null | undefined;

/** A stored timestamp as a Date; null when missing or unparsable. */
export function parseTimestamp(value: TimestampInput): Date | null {
  if (value == null || value === "") return null;
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === "number") d = new Date(value);
  else {
    const iso = asUtcIso(value) ?? "";
    // Postgres keeps microseconds; the ECMAScript date-time format has milliseconds.
    d = new Date(ISO_DATE_TIME.test(iso) ? iso.replace(/(\.\d{3})\d+/, "$1") : iso);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Epoch milliseconds of a stored timestamp; NaN when missing or unparsable. */
export function timestampMs(value: TimestampInput): number {
  return parseTimestamp(value)?.getTime() ?? Number.NaN;
}
