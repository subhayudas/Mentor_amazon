import type { ReactNode } from "react";
import type { TooltipProps } from "recharts";

import { CHART_SERIES } from "@/components/ui/chart";
import type { BookingStatus } from "@/components/StatusBadge";
import type { Direction } from "@/hooks/useDirection";
import { formatNumber } from "@/lib/format";

/**
 * Chart theme (P0-2, dataviz): every colour is a CSS token read through
 * `hsl(var(--chart-n))`, never a JS palette, never the brand orange. Completed sessions
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

type Corners = [number, number, number, number];

/** Rounded data-end, square baseline (dataviz mark spec) — one place for the direction pair. */
export const COLUMN_RADIUS: Corners = [4, 4, 0, 0];
const HORIZONTAL_BAR_RADIUS: Record<Direction, Corners> = { ltr: [0, 4, 4, 0], rtl: [4, 0, 0, 4] };
export function horizontalBarRadius(dir: Direction): Corners {
  return HORIZONTAL_BAR_RADIUS[dir];
}

/**
 * Geometry for a horizontal (`layout="vertical"`) bar chart per direction
 * (P2-17): in Arabic the category axis sits at the inline-start (right) and
 * the value axis grows toward the inline-end (left), so the label margin and
 * the axis side swap. Physical values are fine here — they live inside the
 * `dir="ltr"` chart wrapper.
 */
export const HORIZONTAL_CHART: Record<Direction, { margin: { top: number; right: number; bottom: number; left: number }; categoryAxisSide: "left" | "right"; reversed: boolean }> = {
  ltr: { margin: { top: 0, right: 48, bottom: 0, left: 4 }, categoryAxisSide: "left", reversed: false },
  rtl: { margin: { top: 0, right: 4, bottom: 0, left: 48 }, categoryAxisSide: "right", reversed: true },
};

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
  /** Page direction; a horizontal bar's data end is the left edge in `rtl`. */
  dir?: Direction;
  format: (value: number) => string;
  /**
   * Text drawn in place of the value when the mark is empty because the value
   * is unknown, not zero (e.g. "—" for hours nobody recorded); `end` placement only.
   */
  fallback?: string;
}

const END_LABEL: Record<Direction, { offset: number; anchor: "start" | "end" }> = {
  ltr: { offset: 6, anchor: "start" },
  rtl: { offset: -6, anchor: "end" },
};

/**
 * Selective direct labels for recharts `LabelList content`: nothing for zero
 * values or marks narrower than `minSize`, so a label never overflows its own
 * mark. Inside a coloured segment the label sits on a surface chip so it stays
 * ink-on-white whatever the segment colour.
 */
export function ValueLabel({ value, viewBox, placement, minSize, dir = "ltr", format, fallback }: ValueLabelProps) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!viewBox) return null;
  const unavailable = fallback !== undefined && placement === "end" && !(numeric > 0);
  if (!unavailable && (!Number.isFinite(numeric) || numeric <= 0)) return null;
  // A reversed axis (Arabic horizontal bars) hands recharts a negative width:
  // normalise to a left edge + positive size before measuring anything.
  const rawX = viewBox.x ?? 0;
  const rawY = viewBox.y ?? 0;
  const rawWidth = viewBox.width ?? 0;
  const rawHeight = viewBox.height ?? 0;
  const x = Math.min(rawX, rawX + rawWidth);
  const y = Math.min(rawY, rawY + rawHeight);
  const width = Math.abs(rawWidth);
  const height = Math.abs(rawHeight);
  const text = unavailable ? fallback : format(numeric);
  const size = placement === "end" ? height : width;
  if (!unavailable && size < minSize) return null;

  if (placement === "top") {
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fill={MUTED_INK} fontSize={12} style={TABULAR}>
        {text}
      </text>
    );
  }
  if (placement === "end") {
    const end = END_LABEL[dir];
    const dataEnd = dir === "rtl" ? x : x + width;
    return (
      <text x={dataEnd + end.offset} y={y + height / 2} dy={4} textAnchor={end.anchor} fill={MUTED_INK} fontSize={12} style={TABULAR}>
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
  /** Formats a series value; receives the series dataKey (hours vs counts) and the row's datum (unknown vs zero). */
  valueFormatter?: (value: number, dataKey: string, datum: unknown) => string;
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
              <span className="font-medium tabular-nums">{valueFormatter ? valueFormatter(raw, key, entry.payload) : formatNumber(raw, lang)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
