import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer } from "@/components/ui/chart";
import { useDirection } from "@/hooks/useDirection";
import { formatNumber } from "@/lib/format";
import { formatBucketLabel, formatBucketTick, type Bucket, type Period, type SeriesPoint } from "@/lib/reporting";
import { AXIS_TICK, AxisUnitLabel, BrandTooltip, COLUMN_RADIUS, CURSOR_FILL, GRID_STROKE, SERIES, SURFACE, ValueLabel, markOpacity } from "./ChartTheme";
import { ChartFigure } from "./ChartFigure";
import { SegmentLegend, type SegmentLegendItem } from "./SegmentLegend";
import { periodPhrase } from "./labels";

/** A bucket selection: the stable key plus its human label for the drill heading. */
export interface BucketSelection {
  key: string;
  label: string;
}

interface TrendChartProps {
  series: SeriesPoint[];
  bucket: Bucket;
  period: Period;
  /** Bookings the drill for each bucket would list (requested or completed in it). */
  drillCounts: Map<string, number>;
  activeKey: string | null;
  onSelect: (selection: BucketSelection | null) => void;
}

interface Datum {
  key: string;
  label: string;
  tick: string;
  requests: number;
  completed: number;
}

/**
 * The main chart (spec §9): grouped columns per week (or month) — requests
 * sent and sessions completed, one unit, one axis, linear, no smoothing.
 * Navy = completed, burnt orange = requests, separated by a 2px surface
 * stroke and labelled directly when a column is at least 24px wide. The
 * SegmentLegend twin and the always-present table are the keyboard and
 * screen-reader paths; the recharts surface adds `accessibilityLayer`.
 */
export function TrendChart({ series, bucket, period, drillCounts, activeKey, onSelect }: TrendChartProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { dir } = useDirection();

  const data = useMemo<Datum[]>(
    () =>
      series.map((point, index) => {
        const dateLabel = formatBucketLabel(point.start, bucket, lang);
        return {
          key: point.key,
          label: bucket === "week" ? t("analyticsV2.trend.weekOf", { date: dateLabel }) : dateLabel,
          tick: formatBucketTick(point.start, bucket, lang, index === 0),
          requests: point.requests,
          completed: point.completed,
        };
      }),
    [series, bucket, lang, t],
  );
  // Looked up by key, never by tick index: recharts passes the index within
  // the *rendered* ticks, which differs from the data index once ticks are thinned.
  const byKey = useMemo(() => new Map(data.map((point) => [point.key, point])), [data]);

  const totals = useMemo(
    () => data.reduce((acc, point) => ({ requests: acc.requests + point.requests, completed: acc.completed + point.completed }), { requests: 0, completed: 0 }),
    [data],
  );
  const latest = data[data.length - 1];
  const summary = t(`analyticsV2.trend.summary.${bucket}`, {
    period: periodPhrase(period, t),
    requests: t("analyticsV2.counts.requests", { count: totals.requests }),
    completed: t("analyticsV2.counts.completed", { count: totals.completed }),
    latestRequests: t("analyticsV2.counts.requests", { count: latest?.requests ?? 0 }),
    latestCompleted: t("analyticsV2.counts.completed", { count: latest?.completed ?? 0 }),
  });

  // Label only: a per-bucket count would match neither bar (a drill lists
  // rows requested OR completed in the bucket), so it would not reconcile.
  const legendItems: SegmentLegendItem[] = data
    .filter((point) => (drillCounts.get(point.key) ?? 0) > 0)
    .map((point) => ({ key: point.key, label: point.label }));

  const seriesNames = { requests: t("analyticsV2.trend.requests"), completed: t("analyticsV2.trend.completed") };
  const isEmpty = totals.requests === 0 && totals.completed === 0;

  const select = (key: string | null) => {
    if (!key) return onSelect(null);
    const point = byKey.get(key);
    onSelect(point ? { key, label: point.label } : null);
  };

  const handleClick = (state: { activeLabel?: string | number }) => {
    if (state?.activeLabel !== undefined) {
      const key = String(state.activeLabel);
      select(activeKey === key ? null : key);
    }
  };

  const table = (
    <table className="w-full text-body-sm">
      <caption className="sr-only">{t("analyticsV2.chart.tableCaption")}</caption>
      <thead>
        <tr className="text-caption text-muted-foreground">
          <th scope="col" className="py-1 text-start font-medium">{t(`analyticsV2.trend.table.${bucket}`)}</th>
          <th scope="col" className="w-32 py-1 text-end font-medium">{t("analyticsV2.trend.table.requests")}</th>
          <th scope="col" className="w-40 py-1 text-end font-medium">{t("analyticsV2.trend.table.completed")}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((point) => (
          <tr key={point.key} className="border-t border-border">
            <th scope="row" className="py-1 text-start font-normal">{point.label}</th>
            <td className="py-1 text-end tabular-nums">{formatNumber(point.requests, lang)}</td>
            <td className="py-1 text-end tabular-nums">{formatNumber(point.completed, lang)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const legend = (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground" aria-label={t("analyticsV2.chart.series")}>
        {(["requests", "completed"] as const).map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: SERIES[key] }} />
            {seriesNames[key]}
          </li>
        ))}
      </ul>
      <SegmentLegend
        items={legendItems}
        activeKey={activeKey}
        onSelect={select}
        label={t("analyticsV2.trend.drillLabel")}
        testId="legend-time-series"
        maxButtons={8}
      />
    </div>
  );

  return (
    <ChartFigure
      title={t("analyticsV2.trend.title")}
      meta={t("analyticsV2.chart.meta", { unit: t(`analyticsV2.trend.unit.${bucket}`), period: t(`analyticsV2.period.${period}`) })}
      definition={t(`analyticsV2.trend.definition.${bucket}`)}
      summary={summary}
      table={table}
      legend={isEmpty ? undefined : legend}
      testId="chart-bookings-over-time"
    >
      {isEmpty ? (
        <EmptyState icon={BarChart3} title={t("analyticsV2.trend.empty")} titleAs="p" className="py-8" />
      ) : (
        <ChartContainer config={{ requests: { label: seriesNames.requests }, completed: { label: seriesNames.completed } }} className="aspect-auto h-72 w-full">
          <BarChart
            data={data}
            accessibilityLayer
            title={t("analyticsV2.trend.title")}
            desc={summary}
            margin={{ top: 28, right: 8, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="24%"
            onClick={handleClick}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="key"
              tickFormatter={(value: string) => byKey.get(value)?.tick ?? ""}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={40}
              label={<AxisUnitLabel text={t("analyticsV2.trend.axis.count")} />}
            />
            <Tooltip
              cursor={CURSOR_FILL}
              isAnimationActive={false}
              content={<BrandTooltip dir={dir} lang={lang} labelFormatter={(key) => byKey.get(key)?.label ?? key} />}
            />
            <Bar dataKey="requests" name={seriesNames.requests} fill={SERIES.requests} stroke={SURFACE} strokeWidth={2} radius={COLUMN_RADIUS} maxBarSize={24} isAnimationActive={false}>
              {data.map((point) => (
                <Cell key={point.key} fillOpacity={markOpacity(point.key, activeKey)} />
              ))}
              <LabelList dataKey="requests" content={<ValueLabel placement="top" minSize={24} format={(value) => formatNumber(value, lang)} />} />
            </Bar>
            <Bar dataKey="completed" name={seriesNames.completed} fill={SERIES.completed} stroke={SURFACE} strokeWidth={2} radius={COLUMN_RADIUS} maxBarSize={24} isAnimationActive={false}>
              {data.map((point) => (
                <Cell key={point.key} fillOpacity={markOpacity(point.key, activeKey)} />
              ))}
              <LabelList dataKey="completed" content={<ValueLabel placement="top" minSize={24} format={(value) => formatNumber(value, lang)} />} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartFigure>
  );
}

/** Title line, 288px plot box and a legend row — the figure's final geometry. */
export function TrendChartSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="mt-4 h-72 w-full" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  );
}
