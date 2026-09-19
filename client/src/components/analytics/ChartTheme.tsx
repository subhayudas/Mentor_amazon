import type { ReactNode } from "react";
import type { TooltipProps } from "recharts";

import { CHART_SERIES } from "@/components/ui/chart";
import type { BookingStatus } from "@/components/StatusBadge";
import type { Direction } from "@/hooks/useDirection";
import { formatNumber } from "@/lib/format";

/**
 * Chart theme (P0-2, dataviz): every colour is a CSS token read through
 * `hsl(var(--chart-n))`, never a JS palette, never #FF9900. Completed sessions
 * are navy, requests burnt orange (4.4:1 on white, 3:1 against navy); the
 * six outcome segments reuse the series tokens plus the destructive token and
 * rely on the 2px surface stroke, direct labels and the text legend rather
 * than six pairwise-distinct hues.
 */
export const SERIES = {
  completed: CHART_SERIES[1],
  requests: CHART_SERIES[2],
  teal: CHART_SERIES[3],
  gray: CHART_SERIES[4],
  brown: CHART_SERIES[5],
  danger: "hsl(var(--destructive))",
} as const;

/** Surface colour for the 2px gap between touching marks and for label chips. */
export const SURFACE = "hsl(var(--card))";
export const GRID_STROKE = "hsl(var(--border))";
export const CURSOR_FILL = { fill: "hsl(var(--muted))" } as const;
export const INK = "hsl(var(--foreground))";
export const MUTED_INK = "hsl(var(--muted-foreground))";

export const OUTCOME_FILL: Record<BookingStatus, string> = {
  pending: SERIES.gray,
  accepted: SERIES.teal,
  confirmed: SERIES.requests,
  completed: SERIES.completed,
  rejected: SERIES.danger,
  canceled: SERIES.brown,
};

export const AXIS_TICK = { fontSize: 12 } as const;
const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;

/** Rounded data-end, square baseline (dataviz mark spec) — one place for the RTL pair. */
export const COLUMN_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export function horizontalBarRadius(isRTL: boolean): [number, number, number, number] {
  return isRTL ? [4, 0, 0, 4] : [0, 4, 4, 0];
}

/** Marks outside an active drill fade to ~35% so the selection reads on the chart itself. */
export function markOpacity(key: string, activeKey: string | null): number {
  return activeKey && activeKey !== key ? 0.35 : 1;
}

interface LabelViewBox {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface ValueLabelProps {
  value?: number | string;
  viewBox?: LabelViewBox;
  /** `top` = above a column; `end` = after a horizontal bar's data end; `inside` = ink-on-surface chip inside a segment. */
  placement: "top" | "end" | "inside";
  /** Minimum mark size (px) before a label is drawn; smaller marks stay unlabelled (the table carries the value). */
  minSize: number;
  isRTL?: boolean;
  format: (value: number) => string;
}

/**
 * Selective direct labels for recharts `LabelList content`: nothing for zero
 * values or marks narrower than `minSize`, so a label never overflows its own
 * mark. Inside a coloured segment the label sits on a surface chip so it stays
 * ink-on-white whatever the segment colour.
 */
export function ValueLabel({ value, viewBox, placement, minSize, isRTL = false, format }: ValueLabelProps) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!viewBox || !Number.isFinite(numeric) || numeric <= 0) return null;
  const { x = 0, y = 0, width = 0, height = 0 } = viewBox;
  const text = format(numeric);
  const size = placement === "top" ? width : placement === "end" ? height : width;
  if (size < minSize) return null;

  if (placement === "top") {
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fill={MUTED_INK} fontSize={12} style={TABULAR}>
        {text}
      </text>
    );
  }
  if (placement === "end") {
    const anchorX = isRTL ? x - 6 : x + width + 6;
    return (
      <text x={anchorX} y={y + height / 2} dy={4} textAnchor={isRTL ? "end" : "start"} fill={MUTED_INK} fontSize={12} style={TABULAR}>
        {text}
      </text>
    );
  }
  const chipWidth = text.length * 7 + 10;
  if (chipWidth + 8 > width) return null;
  const chipX = x + width / 2 - chipWidth / 2;
  const chipY = y + height / 2 - 9;
  return (
    <g>
      <rect x={chipX} y={chipY} width={chipWidth} height={18} rx={4} fill={SURFACE} />
      <text x={x + width / 2} y={y + height / 2} dy={4} textAnchor="middle" fill={INK} fontSize={12} fontWeight={500} style={TABULAR}>
        {text}
      </text>
    </g>
  );
}

interface AxisUnitLabelProps {
  viewBox?: LabelViewBox;
  /** Translated unit, e.g. "Count" or "Completed sessions". */
  text: string;
}

/**
 * Unit label for a value axis (spec §9 "axes with unit"): start-anchored text
 * above the axis column, never rotated, so Arabic and Latin read the same way.
 */
export function AxisUnitLabel({ viewBox, text }: AxisUnitLabelProps) {
  if (!viewBox) return null;
  const { x = 0, y = 0 } = viewBox;
  return (
    <text x={x} y={y - 10} textAnchor="start" fill={MUTED_INK} fontSize={12}>
      {text}
    </text>
  );
}

interface BrandTooltipProps extends TooltipProps<number, string> {
  dir: Direction;
  lang: string;
  /** Formats a series value; receives the series dataKey so hours and counts can differ. */
  valueFormatter?: (value: number, dataKey: string) => string;
  labelFormatter?: (label: string) => ReactNode;
  hideLabel?: boolean;
}

/**
 * One tooltip for every chart: white card, hairline border, swatch + name +
 * value rows. Its root carries the page direction so Arabic text and Latin
 * digits align correctly inside the LTR chart wrapper (P2-17).
 */
export function BrandTooltip({ active, payload, label, dir, lang, valueFormatter, labelFormatter, hideLabel }: BrandTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const heading = label !== undefined && label !== "" && !hideLabel ? (labelFormatter ? labelFormatter(String(label)) : String(label)) : null;
  return (
    <div
      dir={dir}
      className="min-w-[8rem] rounded-md border border-border bg-card px-3 py-2 text-caption text-foreground shadow-elevated"
    >
      {heading && <div className="mb-1 font-medium">{heading}</div>}
      <ul className="space-y-1">
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? entry.name ?? index);
          const raw = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
          const swatch = (entry.payload && (entry.payload as { fill?: string }).fill) || entry.color || SERIES.completed;
          return (
            <li key={`${key}-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: swatch }} />
                {String(entry.name ?? key)}
              </span>
              <span className="font-medium tabular-nums">{valueFormatter ? valueFormatter(raw, key) : formatNumber(raw, lang)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
