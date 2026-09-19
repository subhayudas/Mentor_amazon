import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { bidi, formatNumber } from "@/lib/format";
import type { Period, PeriodSummary } from "@/lib/reporting";
import { periodPhrase, previousPhrase, signedNumber, type Scope } from "./labels";

interface SummarySentenceProps {
  scope: Scope;
  period: Period;
  current: PeriodSummary;
  previous: PeriodSummary | null;
}

/**
 * The plain-language answer to the page's question, computed from the same
 * summary as the tiles: "In the last 30 days, 12 sessions were completed
 * (+2 compared with the previous 30 days) for 9.5 hours of volunteer time
 * across 4 countries." Second person for mentors and mentees (P1-26).
 */
export function SummarySentence({ scope, period, current, previous }: SummarySentenceProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const previousLabel = previousPhrase(period, t);

  let deltaClause = "";
  if (previous && previousLabel) {
    const diff = current.completed - previous.completed;
    deltaClause =
      diff === 0
        ? t("analyticsV2.summary.deltaNoChange", { previous: previousLabel })
        : t("analyticsV2.summary.delta", { delta: bidi(signedNumber(diff, lang)), previous: previousLabel });
  }

  const own = scope !== "admin";
  let sentence: string;
  if (current.completed === 0) {
    sentence = t(own ? "analyticsV2.summary.ownNone" : "analyticsV2.summary.adminNone", { period: periodPhrase(period, t), delta: deltaClause });
  } else {
    // The hours clause is dropped when no completed session has a recorded
    // duration: "for 0 hours" would misreport an unknown as a zero.
    const hours =
      current.hours.withDuration > 0
        ? t(scope === "mentee" ? "analyticsV2.summary.hoursOwn" : "analyticsV2.summary.hoursAdmin", {
            hours: formatNumber(current.hours.minutes / 60, lang, { style: "unit", unit: "hour", unitDisplay: "long", maximumFractionDigits: 1 }),
          })
        : "";
    const countries = !own && current.countries > 0 ? t("analyticsV2.summary.countries", { count: current.countries }) : "";
    sentence = t(own ? "analyticsV2.summary.own" : "analyticsV2.summary.admin", {
      count: current.completed,
      period: periodPhrase(period, t),
      delta: deltaClause,
      hours,
      countries,
    });
  }

  return (
    <p className="max-w-prose text-body text-foreground text-pretty" data-testid="analytics-summary">
      {sentence}
    </p>
  );
}

export function SummarySentenceSkeleton() {
  return (
    <div className="max-w-prose space-y-2">
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-2/3" />
    </div>
  );
}
