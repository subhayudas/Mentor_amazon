import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp } from "lucide-react";

import { StatTile } from "@/components/StatTile";
import { Skeleton } from "@/components/ui/skeleton";
import { UNAVAILABLE, formatNumber } from "@/lib/format";
import { delta, type Period, type PeriodSummary } from "@/lib/reporting";
import { deltaLine, previousPhrase, type Scope } from "./labels";

interface KpiTilesProps {
  scope: Scope;
  current: PeriodSummary;
  /** The previous window's summary when the comparison is on; null hides the delta lines. */
  previous: PeriodSummary | null;
  period: Period;
}

function DeltaText({ diff, children }: { diff: number; children: ReactNode }) {
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : null;
  return (
    <span className="inline-flex items-center gap-1">
      {Icon && <Icon className="size-3" strokeWidth={2} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

/**
 * The four tiles (spec §9, P2-15): requests received, sessions completed,
 * volunteer hours, answer rate. Values are 24px tabular numerals; a missing
 * value is "—" with a reason, a real zero is 0; every tile carries a visible
 * definition footnote. All numbers come from the same `summarize()` call as
 * the summary sentence, so they reconcile.
 */
export function KpiTiles({ scope, current, previous, period }: KpiTilesProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const previousLabel = previousPhrase(period, t);
  const compare = previous !== null && previousLabel !== null;

  const countDelta = (currentValue: number, previousValue: number) => {
    if (!compare) return undefined;
    const d = delta(currentValue, previousValue);
    return <DeltaText diff={d.diff}>{deltaLine(d, previousValue, previousLabel, t, lang)}</DeltaText>;
  };

  const hoursDelta = () => {
    if (!compare) return undefined;
    const d = delta(current.hours.minutes, previous.hours.minutes);
    return <DeltaText diff={d.diff}>{deltaLine(d, previous.hours.minutes, previousLabel, t, lang, "hours")}</DeltaText>;
  };

  const rateDelta = () => {
    if (!compare || current.answer.rate === null || previous.answer.rate === null) return undefined;
    const points = Math.round((current.answer.rate - previous.answer.rate) * 100);
    return <DeltaText diff={points}>{deltaLine({ diff: points, percent: null }, 0, previousLabel, t, lang, "points")}</DeltaText>;
  };

  const withoutDuration = current.hours.withoutDuration;
  // Completed sessions exist but none has a recorded duration: the hours are
  // unknown, not zero — "—" + "Not recorded" (spec §9 real zero vs unavailable).
  const hoursUnavailable = current.completed > 0 && current.hours.withDuration === 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        title={t(`analyticsV2.tiles.requests.title.${scope}`)}
        value={formatNumber(current.requests, lang)}
        delta={countDelta(current.requests, previous?.requests ?? 0)}
        definition={t(`analyticsV2.tiles.requests.definition.${scope}`)}
        testId="metric-requests"
      />
      <StatTile
        title={t("analyticsV2.tiles.completed.title")}
        value={formatNumber(current.completed, lang)}
        delta={countDelta(current.completed, previous?.completed ?? 0)}
        definition={t(`analyticsV2.tiles.completed.definition.${scope}`)}
        testId="metric-completed"
      />
      <StatTile
        title={t(`analyticsV2.tiles.hours.title.${scope}`)}
        value={hoursUnavailable ? UNAVAILABLE : formatNumber(current.hours.hours, lang, { maximumFractionDigits: 1 })}
        unit={hoursUnavailable ? undefined : t("analytics.hoursUnit")}
        delta={hoursUnavailable ? undefined : hoursDelta()}
        caveat={
          hoursUnavailable
            ? t("analyticsV2.tiles.notRecordedCount", { count: withoutDuration })
            : withoutDuration > 0
              ? t("analyticsV2.tiles.withoutDuration", { count: withoutDuration })
              : undefined
        }
        definition={t("analyticsV2.tiles.hours.definition")}
        testId="metric-volunteer-hours"
      />
      <StatTile
        title={t("analyticsV2.tiles.answerRate.title")}
        value={current.answer.rate === null ? UNAVAILABLE : formatNumber(current.answer.rate, lang, { style: "percent", maximumFractionDigits: 0 })}
        delta={rateDelta()}
        caveat={current.answer.rate === null ? t("analyticsV2.tiles.noRequests") : undefined}
        definition={t(`analyticsV2.tiles.answerRate.definition.${scope}`)}
        testId="metric-answer-rate"
      />
    </div>
  );
}

/** Same geometry as the tiles: label, 24px number, delta line, footnote. */
export function KpiTilesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-6 w-16" />
          <Skeleton className="mt-2 h-4 w-36" />
          <div className="mt-3 border-t border-border pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-1 h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
