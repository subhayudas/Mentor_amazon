import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";

import { StatTile } from "@/components/StatTile";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsPhone } from "@/hooks/useMediaQuery";
import { UNAVAILABLE, formatNumber } from "@/lib/format";
import { delta, type Period, type PeriodSummary } from "@/lib/reporting";
import { deltaLine, previousPhrase } from "./labels";

interface KpiTilesProps {
  current: PeriodSummary;
  /** The previous window's summary when the comparison is on; null hides the delta lines. */
  previous: PeriodSummary | null;
  period: Period;
}

/** The arrow is inline with the first word, so a wrapped delta line flows under it instead of leaving an arrow gutter (N-06). */
function DeltaText({ diff, children }: { diff: number; children: ReactNode }) {
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : null;
  return (
    <span className="text-pretty">
      {Icon && <Icon className="me-1 inline-block size-3 align-[-0.125em]" strokeWidth={2} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * The four admin tiles (spec §9, P2-15, P1-26): requests received, sessions
 * completed, volunteer hours, answer rate. Values are 24px tabular numerals; a missing
 * value is "—" with a reason, a real zero is 0; every tile carries a visible
 * definition footnote. All numbers come from the same `summarize()` call as
 * the summary sentence, so they reconcile.
 *
 * Phones (F-11): the tiles sit two-up and the four definitions leave the
 * tiles for ONE shared footnote under the grid — a native `<details>` that is
 * collapsed by default, always in the DOM and one tap from any tile — so the
 * grid is four numbers, not four paragraphs.
 */
export function KpiTiles({ current, previous, period }: KpiTilesProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isPhone = useIsPhone();
  // Phones (N-06): "prev. 30 days" keeps the delta line to one or two lines in a 2-up tile.
  const previousLabel = previousPhrase(period, t, isPhone);
  const compare = previous !== null && previousLabel !== null;
  const tileDefinition = (key: "requests" | "completed" | "hours" | "answerRate") => (isPhone ? undefined : t(`analyticsV2.tiles.${key}.definition`));

  const countDelta = (currentValue: number, previousValue: number) => {
    if (!compare) return undefined;
    const d = delta(currentValue, previousValue);
    return <DeltaText diff={d.diff}>{deltaLine(d, previousValue, previousLabel, t, lang)}</DeltaText>;
  };

  const hoursDelta = () => {
    if (!compare) return undefined;
    // The difference is kept in minutes (formatted as hours); the P2-15
    // threshold for showing a percentage is the previous value in HOURS.
    const diff = current.hours.minutes - previous.hours.minutes;
    const previousHours = previous.hours.hours;
    const d = { diff, percent: previousHours >= 10 && previous.hours.minutes > 0 ? diff / previous.hours.minutes : null };
    return <DeltaText diff={d.diff}>{deltaLine(d, previousHours, previousLabel, t, lang, "hours")}</DeltaText>;
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
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatTile
        title={t("analyticsV2.tiles.requests.title")}
        value={formatNumber(current.requests, lang)}
        delta={countDelta(current.requests, previous?.requests ?? 0)}
        definition={tileDefinition("requests")}
        testId="metric-requests"
      />
      <StatTile
        title={t("analyticsV2.tiles.completed.title")}
        value={formatNumber(current.completed, lang)}
        delta={countDelta(current.completed, previous?.completed ?? 0)}
        definition={tileDefinition("completed")}
        testId="metric-completed"
      />
      <StatTile
        title={t("analyticsV2.tiles.hours.title")}
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
        definition={tileDefinition("hours")}
        testId="metric-volunteer-hours"
      />
      <StatTile
        title={t("analyticsV2.tiles.answerRate.title")}
        value={current.answer.rate === null ? UNAVAILABLE : formatNumber(current.answer.rate, lang, { style: "percent", maximumFractionDigits: 0 })}
        delta={rateDelta()}
        caveat={current.answer.rate === null ? t("analyticsV2.tiles.noRequests") : undefined}
        definition={tileDefinition("answerRate")}
        testId="metric-answer-rate"
      />
      </div>
      {isPhone && (
        <details className="group mt-2 text-caption text-muted-foreground" data-testid="tiles-definitions">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-sm text-secondary [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 -rotate-90 group-open:rotate-0 rtl:rotate-90 rtl:group-open:rotate-0" strokeWidth={2} aria-hidden="true" />
            {t("analyticsV2.tiles.definitionsSummary")}
          </summary>
          <dl className="mt-1 space-y-1.5 border-t border-border pt-2">
            {(["requests", "completed", "hours", "answerRate"] as const).map((key) => (
              <div key={key}>
                <dt className="font-medium text-foreground">{t(`analyticsV2.tiles.${key}.title`)}</dt>
                <dd className="text-pretty">{t(`analyticsV2.tiles.${key}.definition`)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

/** Same geometry as the tiles: label, 24px number, secondary line, footnote. */
export function KpiTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-4 w-28 max-w-full" />
          <Skeleton className="mt-2 h-6 w-16" />
          <Skeleton className="mt-1 h-5 w-36 max-w-full" />
          <div className="mt-3 hidden border-t border-border pt-2 md:block">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-1 h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
