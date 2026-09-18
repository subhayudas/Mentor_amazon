import type { TooltipProps } from "recharts";
import type { StatusGroup } from "@/lib/reporting";

/**
 * Brand chart palette. Validated with the dataviz palette checker: adjacent
 * pairs clear the colour-vision-deficiency and normal-vision separation floors.
 * Orange and grey sit under 3:1 on white, so every chart that uses them also
 * ships a legend with labels and a table view (never colour alone).
 */
export const BRAND = {
  navy: "#232F3E",
  orange: "#FF9900",
  teal: "#0F766E",
  grey: "#A3ACB8",
  amber: "#B45309",
  red: "#C40000",
  ink: "#0F1111",
  secondary: "#565959",
  border: "#D5D9D9",
  surface: "#FFFFFF",
} as const;

/** Fixed categorical order. A sixth series folds into "Other" rather than a new hue. */
export const CATEGORICAL: readonly string[] = [BRAND.navy, BRAND.orange, BRAND.teal, BRAND.grey, BRAND.amber];

export const STATUS_COLORS: Record<StatusGroup, string> = {
  clicked: BRAND.grey,
  scheduled: BRAND.navy,
  completed: BRAND.orange,
  canceled: BRAND.red,
};

export const AXIS_TICK = { fill: BRAND.secondary, fontSize: 12 } as const;
/** Short enough that a drill-down or tab switch feels immediate, long enough to read as motion. */
export const ANIMATION_MS = 400;
export const LEGEND_STYLE = { fontSize: 12, color: BRAND.secondary } as const;

/** Legend text wears the text colour, not the series colour; the swatch carries identity. */
export function legendText(value: string) {
  return <span style={{ color: BRAND.ink }}>{value}</span>;
}
export const GRID_PROPS = { stroke: BRAND.border, strokeDasharray: "3 3", vertical: false } as const;
export const CURSOR_FILL = { fill: "rgba(35, 47, 62, 0.06)" } as const;
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export const BAR_RADIUS_HORIZONTAL: [number, number, number, number] = [0, 4, 4, 0];
export const BAR_RADIUS_HORIZONTAL_RTL: [number, number, number, number] = [4, 0, 0, 4];

export function categoricalColor(index: number): string {
  return CATEGORICAL[Math.min(index, CATEGORICAL.length - 1)];
}

/** While a segment is drilled into, every other segment fades to ~35% so the selection is visible on the chart itself. */
export function segmentFill(color: string, key: string, activeKey: string | null): string {
  return activeKey && activeKey !== key ? `${color}59` : color;
}

interface BrandTooltipProps extends TooltipProps<number, string> {
  /** Formats a series value; receives the series dataKey/name so hours and counts can differ. */
  valueFormatter?: (value: number, name: string) => string;
}

/** One tooltip for every chart: white card, brand border, swatch + name + value rows. */
export function BrandTooltip({ active, payload, label, valueFormatter }: BrandTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className="rounded-md border bg-card px-3 py-2 text-xs shadow-md"
      style={{ borderColor: BRAND.border, color: BRAND.ink, minWidth: 140 }}
      role="status"
    >
      {label !== undefined && label !== "" && (
        <div className="mb-1 font-semibold" style={{ color: BRAND.ink }}>
          {String(label)}
        </div>
      )}
      <ul className="space-y-1">
        {payload.map((entry, index) => {
          const name = String(entry.name ?? entry.dataKey ?? "");
          const raw = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
          const swatch = (entry.payload && (entry.payload as { fill?: string }).fill) || entry.color || BRAND.navy;
          return (
            <li key={`${name}-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />
                <span style={{ color: BRAND.secondary }}>{name}</span>
              </span>
              <span className="font-semibold tabular-nums">
                {valueFormatter ? valueFormatter(raw, name) : raw.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
