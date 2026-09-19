import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { bookingStatusLabel, type BookingStatus } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer } from "@/components/ui/chart";
import { useDirection } from "@/hooks/useDirection";
import { useIsPhone } from "@/hooks/useMediaQuery";
import { formatNumber } from "@/lib/format";
import { OUTCOME_ORDER, formatList, type Period } from "@/lib/reporting";
import { BrandTooltip, HORIZONTAL_CHART, OUTCOME_FILL, SURFACE, ValueLabel, markOpacity } from "./ChartTheme";
import { ChartFigure } from "./ChartFigure";
import { SegmentLegend, type SegmentLegendItem } from "./SegmentLegend";

interface OutcomesBarProps {
  counts: Record<BookingStatus, number>;
  period: Period;
  activeKey: string | null;
  onSelect: (key: string | null) => void;
}

/**
 * Request outcomes (spec §9, replaces the status donut): one horizontal
 * stacked bar — awaiting mentor → accepted → scheduled → completed, then
 * declined and cancelled — with a 2px surface stroke between segments,
 * ink-on-surface labels on segments at least 40px wide, and the text legend
 * (also the keyboard twin) listing every segment with its count. The total
 * is the "Requests received" tile, so the two always agree.
 */
export function OutcomesBar({ counts, period, activeKey, onSelect }: OutcomesBarProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { dir } = useDirection();
  // Phones (N-06): the legend is a compact two-column list and in-bar counts
  // survive on narrower segments (a one-request segment is ~36px at 390px).
  const isPhone = useIsPhone();

  const total = OUTCOME_ORDER.reduce((sum, status) => sum + counts[status], 0);
  const labels = useMemo(() => Object.fromEntries(OUTCOME_ORDER.map((status) => [status, bookingStatusLabel(status, t)])) as Record<BookingStatus, string>, [t]);

  const summary =
    total === 0
      ? t("analyticsV2.outcomes.empty")
      : t("analyticsV2.outcomes.summary", {
          total: t("analyticsV2.counts.requests", { count: total }),
          list: formatList(
            OUTCOME_ORDER.filter((status) => counts[status] > 0).map((status) =>
              t("analyticsV2.outcomes.item", { value: formatNumber(counts[status], lang), label: labels[status] }),
            ),
            lang,
          ),
        });

  const legendItems: SegmentLegendItem[] = OUTCOME_ORDER.filter((status) => counts[status] > 0).map((status) => ({
    key: status,
    label: labels[status],
    value: formatNumber(counts[status], lang),
    color: OUTCOME_FILL[status],
  }));

  const share = (value: number) => (total > 0 ? formatNumber(value / total, lang, { style: "percent", maximumFractionDigits: 0 }) : formatNumber(0, lang, { style: "percent" }));

  const table = (
    <table className="w-full text-body-sm">
      <caption className="sr-only">{t("analyticsV2.chart.tableCaption")}</caption>
      <thead>
        <tr className="text-caption text-muted-foreground">
          <th scope="col" className="py-1 text-start font-medium">{t("analyticsV2.outcomes.table.status")}</th>
          <th scope="col" className="py-1 text-end font-medium">{t("analyticsV2.outcomes.table.requests")}</th>
          <th scope="col" className="py-1 text-end font-medium">{t("analyticsV2.outcomes.table.share")}</th>
        </tr>
      </thead>
      <tbody>
        {OUTCOME_ORDER.map((status) => (
          <tr key={status} className="border-t border-border">
            <th scope="row" className="py-1 text-start font-normal">{labels[status]}</th>
            <td className="py-1 text-end tabular-nums">{formatNumber(counts[status], lang)}</td>
            <td className="py-1 text-end tabular-nums">{share(counts[status])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const data = [{ name: "all", ...counts }];

  return (
    <ChartFigure
      title={t("analyticsV2.outcomes.title")}
      meta={t("analyticsV2.chart.meta", { unit: t("analyticsV2.outcomes.unit"), period: t(`analyticsV2.period.${period}`) })}
      definition={t("analyticsV2.outcomes.definition")}
      summary={summary}
      table={table}
      legend={
        total > 0 ? (
          <SegmentLegend items={legendItems} activeKey={activeKey} onSelect={onSelect} label={t("analyticsV2.outcomes.title")} testId="legend-status" variant={isPhone ? "list" : "chips"} />
        ) : undefined
      }
      testId="chart-status-breakdown"
    >
      {total === 0 ? (
        <EmptyState icon={Inbox} title={t("analyticsV2.outcomes.empty")} titleAs="p" className="py-8" />
      ) : (
        <ChartContainer config={Object.fromEntries(OUTCOME_ORDER.map((status) => [status, { label: labels[status] }]))} className="aspect-auto h-10 w-full">
          <BarChart
            data={data}
            layout="vertical"
            accessibilityLayer
            title={t("analyticsV2.outcomes.title")}
            desc={summary}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            barCategoryGap={0}
            barSize={32}
          >
            <XAxis type="number" hide domain={[0, total]} reversed={HORIZONTAL_CHART[dir].reversed} />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip cursor={false} isAnimationActive={false} content={<BrandTooltip dir={dir} lang={lang} hideLabel />} />
            {OUTCOME_ORDER.map((status) => (
              <Bar
                key={status}
                dataKey={status}
                name={labels[status]}
                stackId="outcomes"
                fill={OUTCOME_FILL[status]}
                fillOpacity={markOpacity(status, activeKey)}
                stroke={SURFACE}
                strokeWidth={2}
                isAnimationActive={false}
                cursor="pointer"
                onClick={() => onSelect(activeKey === status ? null : status)}
              >
                <LabelList dataKey={status} content={<ValueLabel placement="inside" minSize={isPhone ? 28 : 40} format={(value) => formatNumber(value, lang)} />} />
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </ChartFigure>
  );
}

export function OutcomesBarSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="mt-4 h-10 w-full" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  );
}
