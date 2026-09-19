import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { Globe } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer } from "@/components/ui/chart";
import { useDirection } from "@/hooks/useDirection";
import { formatHours, formatNumber } from "@/lib/format";
import { NOT_SPECIFIED, localizeCountry, type CountryBreakdownRow, type Period } from "@/lib/reporting";
import { AXIS_TICK, BrandTooltip, CURSOR_FILL, HORIZONTAL_CHART, SERIES, SURFACE, ValueLabel, horizontalBarRadius, markOpacity } from "./ChartTheme";
import { ChartFigure } from "./ChartFigure";

interface CountryBreakdownProps {
  rows: CountryBreakdownRow[];
  period: Period;
  activeCountry: string | null;
  onSelect: (country: string | null) => void;
  /** Switches the page to the Countries tab (the exact-value table for every country). */
  onSeeAll: () => void;
  /** Countries charted (by completed sessions); the Countries tab lists every row. */
  chartLimit?: number;
}

interface ChartDatum {
  country: string;
  label: string;
  completed: number;
  volunteerHours: number;
}

/**
 * Sessions and hours by country (spec §9 breakdowns): two single-axis
 * horizontal bar charts — different units never share an axis — for the
 * countries with the most completed sessions. In Arabic the value axis grows
 * toward the inline-end (`XAxis reversed`, `YAxis orientation="right"`), the
 * f8 "mirrored bars" contract (P2-17). Clicking a bar drills into its bookings.
 */
export function CountryBreakdown({ rows, period, activeCountry, onSelect, onSeeAll, chartLimit = 10 }: CountryBreakdownProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { dir } = useDirection();
  const geometry = HORIZONTAL_CHART[dir];
  const displayCountry = (country: string) => (country === NOT_SPECIFIED ? t("analytics.notSpecified") : localizeCountry(country, lang));

  const data = useMemo<ChartDatum[]>(
    () =>
      rows
        .filter((row) => row.completed > 0)
        .slice(0, chartLimit)
        .map((row) => ({ country: row.country, label: displayCountry(row.country), completed: row.completed, volunteerHours: row.volunteerHours })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, chartLimit, lang, t],
  );

  const top = data[0];
  const summary = top
    ? t("analyticsV2.country.summary", {
        countries: t("analyticsV2.counts.countries", { count: data.length }),
        top: top.label,
        sessions: t("analyticsV2.counts.completed", { count: top.completed }),
        hours: formatHours(top.volunteerHours * 60, lang),
      })
    : t("analyticsV2.country.empty");

  const toggle = (country: string) => onSelect(activeCountry === country ? null : country);
  const chartHeight = Math.max(96, 28 * data.length + 24);

  const renderChart = (dataKey: "completed" | "volunteerHours", color: string, name: string, testId: string) => (
    <div data-testid={testId}>
      <p className="mb-1 text-caption text-muted-foreground">{name}</p>
      <ChartContainer config={{ [dataKey]: { label: name } }} className="aspect-auto w-full" style={{ height: chartHeight }}>
        <BarChart data={data} layout="vertical" accessibilityLayer title={name} desc={summary} margin={geometry.margin} barCategoryGap={6}>
          <XAxis type="number" hide reversed={geometry.reversed} allowDecimals={dataKey === "volunteerHours"} />
          <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} width={120} orientation={geometry.categoryAxisSide} />
          <Tooltip
            cursor={CURSOR_FILL}
            content={
              <BrandTooltip
                dir={dir}
                lang={lang}
                valueFormatter={(value, key) => (key === "volunteerHours" ? formatHours(value * 60, lang) : formatNumber(value, lang))}
              />
            }
          />
          <Bar
            dataKey={dataKey}
            name={name}
            fill={color}
            stroke={SURFACE}
            strokeWidth={2}
            radius={horizontalBarRadius(dir)}
            maxBarSize={20}
            cursor="pointer"
            isAnimationActive={false}
            onClick={(entry: { payload?: ChartDatum }) => entry?.payload && toggle(entry.payload.country)}
          >
            {data.map((entry) => (
              <Cell key={entry.country} fillOpacity={markOpacity(entry.country, activeCountry)} />
            ))}
            <LabelList
              dataKey={dataKey}
              content={
                <ValueLabel
                  placement="end"
                  minSize={8}
                  dir={dir}
                  format={(value) => (dataKey === "volunteerHours" ? formatHours(value * 60, lang) : formatNumber(value, lang))}
                />
              }
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );

  const table = (
    <table className="w-full text-body-sm">
      <caption className="sr-only">{t("analyticsV2.chart.tableCaption")}</caption>
      <thead>
        <tr className="text-caption text-muted-foreground">
          <th scope="col" className="py-1 text-start font-medium">{t("analyticsV2.country.table.country")}</th>
          <th scope="col" className="py-1 text-end font-medium">{t("analyticsV2.country.table.sessions")}</th>
          <th scope="col" className="py-1 text-end font-medium">{t("analyticsV2.country.table.hours")}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.country} className="border-t border-border">
            <th scope="row" className="py-1 text-start font-normal">{row.label}</th>
            <td className="py-1 text-end tabular-nums">{formatNumber(row.completed, lang)}</td>
            <td className="py-1 text-end tabular-nums">{formatHours(row.volunteerHours * 60, lang)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFigure
      title={t("analyticsV2.country.title")}
      meta={t("analyticsV2.chart.meta", { unit: t("analyticsV2.country.unit"), period: t(`analyticsV2.period.${period}`) })}
      definition={t("analyticsV2.country.definition")}
      summary={summary}
      table={table}
      tableMode={data.length === 0 ? "hidden" : "beneath"}
      footer={
        <div className="mt-2">
          <Button type="button" variant="link" size="sm" onClick={onSeeAll}>
            {t("analyticsV2.country.seeAll")}
          </Button>
        </div>
      }
      testId="chart-country-breakdown"
    >
      {data.length === 0 ? (
        <EmptyState icon={Globe} title={t("analyticsV2.country.empty")} titleAs="p" className="py-8" />
      ) : (
        <div className="flex flex-col gap-4">
          {renderChart("completed", SERIES.completed, t("analyticsV2.country.sessions"), "chart-country-completed")}
          {renderChart("volunteerHours", SERIES.teal, t("analyticsV2.country.hours"), "chart-country-hours")}
        </div>
      )}
    </ChartFigure>
  );
}

export function CountryBreakdownSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mt-4 space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}
