/**
 * Curated IANA zones for the profile time-zone selects (mentee + mentor).
 * Stored values stay IANA ids (the only thing `Intl` and the database
 * understand); the visible label adds the current UTC offset computed by
 * `lib/format.ts` so the list is readable without a separate name table.
 */
import { tzOffsetMinutes } from "@/lib/format";

export const TIMEZONE_OPTIONS: readonly string[] = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Qatar",
  "Asia/Muscat",
  "Asia/Amman",
  "Asia/Beirut",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Tunis",
  "Africa/Algiers",
  "Asia/Baghdad",
  "Asia/Damascus",
  "Europe/Istanbul",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
];

/** "UTC+4" / "UTC−5:30" / "UTC" from the zone's current offset; empty for an unknown zone. */
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const minutes = tzOffsetMinutes(timeZone, at);
  if (minutes == null) return "";
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/** Options for a Select: the stored zone plus the curated list (deduplicated, stored value first). */
export function timeZoneChoices(current?: string | null): string[] {
  const list = [...TIMEZONE_OPTIONS];
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}
