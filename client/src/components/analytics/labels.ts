import type { TFunction } from "i18next";

import { bidi, formatNumber } from "@/lib/format";
import { type Delta, type Period } from "@/lib/reporting";

export type Scope = "admin" | "mentor" | "mentee";

/** "the previous 30 days" for the tile deltas and the summary sentence (`short`: "prev. 30 days" for phone tiles); null for all time. */
export function previousPhrase(period: Period, t: TFunction, short = false): string | null {
  return period === "all" ? null : t(`analyticsV2.period.${short ? "previousShort" : "previous"}.${period}`);
}

/** "In the last 30 days" / "Over all time". */
export function periodPhrase(period: Period, t: TFunction): string {
  return t(`analyticsV2.period.phrase.${period}`);
}

/** "+2" / "−1" with the locale's sign; "0" never reaches here (callers say "No change"). */
export function signedNumber(value: number, lang: string, options?: Intl.NumberFormatOptions): string {
  return formatNumber(value, lang, { signDisplay: "exceptZero", maximumFractionDigits: 1, ...options });
}

/**
 * Tile delta line (P2-15): the absolute difference in the unit, a percentage
 * only when the previous value is >= 10, "No change" when nothing moved.
 * `unit` formats the difference itself (hours use the Intl unit style).
 */
export function deltaLine(
  d: Delta,
  previousValue: number,
  previous: string,
  t: TFunction,
  lang: string,
  unit?: "hours" | "points",
): string {
  if (d.diff === 0) return t("analyticsV2.tiles.noChange", { previous });
  // Signed numbers are bidi-isolated so "-11" keeps its sign in front inside Arabic text (P1-27).
  const delta = bidi(
    unit === "hours"
      ? signedNumber(d.diff / 60, lang, { style: "unit", unit: "hour", unitDisplay: "narrow" })
      : signedNumber(d.diff, lang),
  );
  if (unit === "points") return t("analyticsV2.tiles.deltaPoints", { delta, previous });
  if (d.percent !== null && previousValue >= 10) {
    const percent = bidi(formatNumber(d.percent, lang, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 0 }));
    return t("analyticsV2.tiles.deltaPercent", { delta, percent, previous });
  }
  return t("analyticsV2.tiles.delta", { delta, previous });
}
