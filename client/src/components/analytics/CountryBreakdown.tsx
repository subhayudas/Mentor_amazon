import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis, type LabelProps } from "recharts";
import type { CartesianViewBox } from "recharts/types/util/types";
import { Globe } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer } from "@/components/ui/chart";
import { useDirection } from "@/hooks/useDirection";
import { useIsPhone } from "@/hooks/useMediaQuery";
import { UNAVAILABLE, formatHours, formatNumber } from "@/lib/format";
import { NOT_SPECIFIED, localizeCountry, type CountryBreakdownRow, type Period } from "@/lib/reporting";
import { AXIS_TICK, BrandTooltip, CURSOR_FILL, HORIZONTAL_CHART, MUTED_INK, SERIES, SURFACE, ValueLabel, horizontalBarRadius, markOpacity } from "./ChartTheme";
import { ChartFigure } from "./ChartFigure";
import { RowDrillButton } from "./RowDrillButton";

interface CountryBreakdownProps {
  rows: CountryBreakdownRow[];
  period: Period;
  activeCountry: string | null;
  onSelect: (country: string | null) => void;
  /** Switches the page to the Countries tab (the exact-value table for every country). */
  onSeeAll: () => void;
  /** Countries charted (by completed sessions); the Countries tab lists every row. Six keeps the card level with "Request outcomes" beside it (F-33). */
  chartLimit?: number;
}

interface ChartDatum {
  country: string;
  label: string;
  completed: number;
  volunteerMinutes: number;
  /** Charted hours; 0 draws no bar, and `hoursUnknown` tells 0 h apart from "nobody recorded a duration". */
  volunteerHours: number;
  /** Completed sessions in this country with no recorded duration. */
  withoutDuration: number;
  /** Completed sessions exist but none carries a duration: hours are unknown, not zero (spec §9 real zero vs "—"). */
  hoursUnknown: boolean;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
/** Width of an axis label in the tick font (12px page font); a character estimate when canvas is unavailable. */
function measureLabel(label: string): number {
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement("canvas").getContext("2d");
      if (measureContext) measureContext.font = `${AXIS_TICK.fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    } catch {
      measureContext = null;
    }
  }
  return measureContext ? measureContext.measureText(label).width : label.length * 7;
}

/**
 * One-line category tick: recharts' default tick wraps a label onto a second
 * 12px line whenever its cached text measurement (taken before the web font
 * loaded) exceeds the axis width, which is how "United Arab / Emirates" sat
 * beside a 20px bar (N-05). The axis is sized to the longest label, so the
 * label always fits on one line.
 */
function SingleLineTick({ x, y, payload, textAnchor }: { x?: number; y?: number; payload?: { value?: string }; textAnchor?: string }) {
  return (
    <text x={x} y={y} dy={4} textAnchor={textAnchor} fill={MUTED_INK} fontSize={AXIS_TICK.fontSize}>
      {payload?.value}
    </text>
  );
}

/**
 * Sessions and hours by country (spec §9 breakdowns, F-33): ONE horizontal
 * bar list — completed sessions per country, the volunteer hours as the
 * trailing value label ("4 · 3.5 h") — for the countries with the most
 * completed sessions, with the exact-value table behind the same "View as
 * table" toggle the other charts use, so the card is the height of its
 * neighbour. On phones (F-11) the bars are dropped and the table is the
 * whole figure. In Arabic the value axis grows toward the inline-end
 * (`XAxis reversed`, `YAxis orientation="right"`), the f8 "mirrored bars"
 * contract (P2-17). Clicking a bar or a country name drills into its bookings.
 */
export function CountryBreakdown({ rows, period, activeCountry, onSelect, onSeeAll, chartLimit = 6 }: CountryBreakdownProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { dir } = useDirection();
  const isPhone = useIsPhone();
  const geometry = HORIZONTAL_CHART[dir];
  const displayCountry = (country: string) => (country === NOT_SPECIFIED ? t("analytics.notSpecified") : localizeCountry(country, lang));

  const data = useMemo<ChartDatum[]>(
    () =>
      rows
        .filter((row) => row.completed > 0)
        .slice(0, chartLimit)
        .map((row) => ({
          country: row.country,
          label: displayCountry(row.country),
          completed: row.completed,
          volunteerMinutes: row.volunteerMinutes,
          volunteerHours: row.volunteerHours,
          withoutDuration: row.withoutDuration,
          hoursUnknown: row.completed > 0 && row.volunteerMinutes === 0,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, chartLimit, lang, t],
  );
  const byLabel = useMemo(() => new Map(data.map((row) => [row.label, row])), [data]);

  const top = data[0];
  const summary = top
    ? top.hoursUnknown
      ? t("analyticsV2.country.summaryNoHours", {
          countries: t("analyticsV2.counts.countries", { count: data.length }),
          top: top.label,
          sessions: t("analyticsV2.counts.completed", { count: top.completed }),
        })
      : t("analyticsV2.country.summary", {
          countries: t("analyticsV2.counts.countries", { count: data.length }),
          top: top.label,
          sessions: t("analyticsV2.counts.completed", { count: top.completed }),
          hours: formatHours(top.volunteerMinutes, lang),
        })
    : t("analyticsV2.country.empty");
  // Same caveat as the hours tile, summed over the charted rows: the hours
  // labels and the table are partial sums until every session has a duration.
  const withoutDuration = data.reduce((sum, row) => sum + row.withoutDuration, 0);

  const toggle = (country: string) => onSelect(activeCountry === country ? null : country);
  // 20px bars with a 6px category gap; a single-row chart is one bar tall, not a 96px box.
  const chartHeight = Math.max(40, 28 * data.length + 12);
  const hoursText = (datum: ChartDatum) => (datum.hoursUnknown ? UNAVAILABLE : formatHours(datum.volunteerMinutes, lang));
  // "4 · 3.5 h" after the bar: sessions are the mark, hours ride along as text (F-33).
  const barLabel = (datum: ChartDatum) => t("analyticsV2.country.barLabel", { sessions: formatNumber(datum.completed, lang), hours: hoursText(datum) });
  // Room for the combined label on the value side (the shared geometry reserves 48px for a bare number).
  const margin = { ...geometry.margin, [dir === "rtl" ? "left" : "right"]: 104 };
  const seriesName = t("analyticsV2.country.sessions");
  // The category axis is sized to the longest country name so no label wraps
  // to two 12px lines beside a 20px bar ("United Arab / Emirates", N-05).
  const axisWidth = useMemo(() => Math.min(184, Math.max(96, Math.ceil(Math.max(0, ...data.map((row) => measureLabel(row.label)))) + 12)), [data]);

  const chart = (
    <div data-testid="chart-country-completed">
      <ChartContainer config={{ completed: { label: seriesName } }} className="aspect-auto w-full" style={{ height: chartHeight }}>
        <BarChart data={data} layout="vertical" accessibilityLayer title={seriesName} desc={summary} margin={margin} barCategoryGap={6}>
          <XAxis type="number" hide reversed={geometry.reversed} />
          <YAxis type="category" dataKey="label" tick={<SingleLineTick />} tickLine={false} axisLine={false} width={axisWidth} orientation={geometry.categoryAxisSide} />
          <Tooltip
            cursor={CURSOR_FILL}
            isAnimationActive={false}
            content={
              <BrandTooltip
                dir={dir}
                lang={lang}
                valueFormatter={(value, _key, datum) => (datum ? barLabel(datum as ChartDatum) : formatNumber(value, lang))}
              />
            }
          />
          <Bar
            dataKey="completed"
            name={seriesName}
            fill={SERIES.completed}
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
              dataKey="label"
              content={(props: LabelProps) => {
                const datum = typeof props.value === "string" ? byLabel.get(props.value) : undefined;
                return datum ? (
                  <ValueLabel value={datum.completed} viewBox={props.viewBox as CartesianViewBox | undefined} placement="end" minSize={8} dir={dir} format={() => barLabel(datum)} />
                ) : null;
              }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      {withoutDuration > 0 && (
        <p className="mt-1 text-caption text-muted-foreground" data-testid="chart-country-hours-caveat">
          {t("analyticsV2.tiles.withoutDuration", { count: withoutDuration })}
        </p>
      )}
    </div>
  );

  const table = (
    <table className="w-full text-body-sm">
      <caption className="sr-only">{t("analyticsV2.chart.tableCaption")}</caption>
      <thead>
        <tr className="text-caption text-muted-foreground">
          <th scope="col" className="py-1 text-start font-medium">{t("analyticsV2.country.table.country")}</th>
          <th scope="col" className="py-1 ps-3 text-end font-medium">{t("analyticsV2.country.table.sessions")}</th>
          <th scope="col" className="py-1 ps-3 text-end font-medium">{t("analyticsV2.country.table.hours")}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.country} className="border-t border-border">
            <th scope="row" className="py-1 text-start font-normal">
              {/* Keyboard twin of the bar click: the same drill, toggled from the table row (F-34 geometry and focus). */}
              <RowDrillButton pressed={activeCountry === row.country} onClick={() => toggle(row.country)}>
                {row.label}
              </RowDrillButton>
            </th>
            <td className="py-1 ps-3 text-end tabular-nums">{formatNumber(row.completed, lang)}</td>
            <td className="py-1 ps-3 text-end tabular-nums">
              {row.hoursUnknown ? (
                <>
                  {UNAVAILABLE}
                  <span className="sr-only">{t("analyticsV2.tiles.notRecordedCount", { count: row.withoutDuration })}</span>
                </>
              ) : (
                formatHours(row.volunteerMinutes, lang)
              )}
            </td>
          </tr>
        ))}
      </tbody>
      {isPhone && withoutDuration > 0 && (
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-2 text-caption font-normal text-muted-foreground" data-testid="chart-country-hours-caveat">
              {t("analyticsV2.tiles.withoutDuration", { count: withoutDuration })}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );

  const isEmpty = data.length === 0;

  return (
    <ChartFigure
      title={t("analyticsV2.country.title")}
      meta={t("analyticsV2.chart.meta", { unit: t("analyticsV2.country.unit"), period: t(`analyticsV2.period.${period}`) })}
      definition={t("analyticsV2.country.definition")}
      // Phones: the table IS the figure, so the definition is its caption underneath, not a paragraph above a one-row table (N-06).
      definitionPlacement={isPhone && !isEmpty ? "below" : "above"}
      summary={summary}
      table={table}
      tableMode={isEmpty ? "hidden" : isPhone ? "beneath" : "toggle"}
      footer={
        <div className="mt-2">
          <Button type="button" variant="link" size="sm" className="min-h-6" onClick={onSeeAll}>
            {t("analyticsV2.country.seeAll")}
          </Button>
        </div>
      }
      testId="chart-country-breakdown"
    >
      {isEmpty ? <EmptyState icon={Globe} title={t("analyticsV2.country.empty")} titleAs="p" className="py-8" /> : isPhone ? null : chart}
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
      <Skeleton className="mt-4 h-28 w-full" />
    </div>
  );
}
