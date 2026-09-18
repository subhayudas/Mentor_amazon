import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import { isRTL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NOT_SPECIFIED, type CountryRow } from "@/lib/reporting";
import {
  ANIMATION_MS,
  AXIS_TICK,
  BAR_RADIUS_HORIZONTAL,
  BAR_RADIUS_HORIZONTAL_RTL,
  BRAND,
  BrandTooltip,
  CURSOR_FILL,
  GRID_PROPS,
  segmentFill,
} from "./ChartTheme";

interface CountryBreakdownProps {
  rows: CountryRow[];
  activeCountry: string | null;
  onSelect: (country: string | null) => void;
  isLoading?: boolean;
  /** Countries charted; the table always lists every row. */
  chartLimit?: number;
}

interface ChartDatum extends CountryRow {
  label: string;
}

/**
 * The "UK cut": completed sessions and volunteer hours per country as two
 * single-axis bar charts (different units never share an axis) plus the full
 * table. Clicking a bar, or a country in the table, drills into its bookings.
 */
export function CountryBreakdown({ rows, activeCountry, onSelect, isLoading, chartLimit = 10 }: CountryBreakdownProps) {
  const { t } = useTranslation();
  const rtl = isRTL();
  const notSpecifiedLabel = t("analytics.notSpecified");
  const displayCountry = (country: string) => (country === NOT_SPECIFIED ? notSpecifiedLabel : country);

  const chartData = useMemo<ChartDatum[]>(
    () => rows.slice(0, chartLimit).map((row) => ({
      ...row,
      label: row.country === NOT_SPECIFIED ? notSpecifiedLabel : row.country,
    })),
    [rows, chartLimit, notSpecifiedLabel],
  );

  const toggle = (country: string) => onSelect(activeCountry === country ? null : country);

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-[320px] w-full" />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">{t("analytics.noCountryData")}</p>
      </Card>
    );
  }

  const chartHeight = Math.max(200, 36 * chartData.length + 40);

  const renderChart = (dataKey: "completed" | "volunteerHours", color: string, name: string, testId: string) => (
    <div className="chart-container" data-testid={testId}>
      <p className="mb-1 text-sm font-semibold text-[#0F1111]">{name}</p>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} orientation={rtl ? "top" : "bottom"} reversed={rtl} allowDecimals={dataKey === "volunteerHours"} />
          <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={120} orientation={rtl ? "right" : "left"} />
          <Tooltip
            cursor={CURSOR_FILL}
            content={<BrandTooltip valueFormatter={(value) => (dataKey === "volunteerHours" ? t("analytics.hoursShort", { count: value }) : value.toLocaleString())} />}
          />
          <Bar
            dataKey={dataKey}
            name={name}
            fill={color}
            radius={rtl ? BAR_RADIUS_HORIZONTAL_RTL : BAR_RADIUS_HORIZONTAL}
            maxBarSize={22}
            cursor="pointer"
            animationDuration={ANIMATION_MS}
            onClick={(entry: { payload?: ChartDatum }) => entry?.payload && toggle(entry.payload.country)}
          >
            {chartData.map((entry) => (
              <Cell key={entry.country} fill={segmentFill(color, entry.country, activeCountry)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {renderChart("completed", BRAND.navy, t("analytics.chartLabels.completedSessions"), "chart-country-completed")}
          {renderChart("volunteerHours", BRAND.orange, t("analytics.chartLabels.volunteerHours"), "chart-country-hours")}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("analytics.drillHint")}</p>
      </Card>

      <Card className="overflow-hidden" data-testid="table-country-breakdown">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("analytics.tableHeaders.country")}</TableHead>
                <TableHead className="text-end">{t("analytics.tableHeaders.bookings")}</TableHead>
                <TableHead className="text-end">{t("analytics.tableHeaders.completed")}</TableHead>
                <TableHead className="text-end">{t("analytics.tableHeaders.volunteerHours")}</TableHead>
                <TableHead className="text-end">{t("analytics.tableHeaders.uniqueMentors")}</TableHead>
                <TableHead className="text-end">{t("analytics.tableHeaders.uniqueMentees")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const active = row.country === activeCountry;
                return (
                  <TableRow
                    key={row.country}
                    className={cn(active && "bg-[#FFF5E6] hover:bg-[#FFF5E6]")}
                    data-state={active ? "selected" : undefined}
                    data-testid={`row-country-${row.country.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <TableCell className="whitespace-nowrap font-medium">
                      <button
                        type="button"
                        onClick={() => toggle(row.country)}
                        aria-pressed={active}
                        className="rounded-sm text-start text-[#0F1111] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {displayCountry(row.country)}
                      </button>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{row.bookings}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.completed}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      <span className="inline-flex items-center justify-end gap-1">
                        {row.volunteerHours.toFixed(1)}
                        {row.withoutDuration > 0 && (
                          <UiTooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-muted-foreground"
                                aria-label={t("analytics.sessionsWithoutDuration", { count: row.withoutDuration })}
                              >
                                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t("analytics.sessionsWithoutDuration", { count: row.withoutDuration })}</TooltipContent>
                          </UiTooltip>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{row.uniqueMentors}</TableCell>
                    <TableCell className="text-end tabular-nums">{row.uniqueMentees}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
