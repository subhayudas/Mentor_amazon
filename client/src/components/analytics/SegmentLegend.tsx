import { useTranslation } from "react-i18next";

import { FilterChip } from "@/components/discovery/FilterChip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowDrillButton } from "./RowDrillButton";

export interface SegmentLegendItem {
  key: string;
  label: string;
  /** Already formatted for display; omit when the chip should carry the label only. */
  value?: string;
  /** CSS colour of the mark this item stands for (a token string such as `hsl(var(--chart-1))`); omitted when every item shares one colour. */
  color?: string;
}

interface SegmentLegendProps {
  items: SegmentLegendItem[];
  activeKey: string | null;
  onSelect: (key: string | null) => void;
  /** Accessible name for the group, e.g. "Request outcomes". */
  label: string;
  testId?: string;
  /** Past this many items the chips collapse into a Select (weekly buckets, long lists). */
  maxButtons?: number;
  /**
   * `chips` (default): one FilterChip per segment. `list`: a compact two-column
   * list of drill toggles (swatch · label · value) for phones, where a row of
   * bordered chips wraps to three lines (N-06). Same keys, same drill.
   */
  variant?: "chips" | "list";
}

/**
 * Text legend and keyboard twin of the chart marks in one element: a
 * `FilterChip` per segment carrying the swatch, label and value. Toggling a
 * chip applies the same drill the chart click does, so nothing on the page
 * is mouse-only or colour-only (D3).
 */
export function SegmentLegend({ items, activeKey, onSelect, label, testId, maxButtons = 12, variant = "chips" }: SegmentLegendProps) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  if (items.length > maxButtons) {
    const selectId = testId ? `${testId}-select` : undefined;
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
        <span className="text-caption text-muted-foreground">{label}</span>
        <Select value={activeKey ?? "__none"} onValueChange={(value) => onSelect(value === "__none" ? null : value)}>
          <SelectTrigger className="h-9 w-64 max-w-full text-sm" aria-label={label} data-testid={selectId}>
            <SelectValue placeholder={t("analytics.selectSegment")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">{t("analytics.allSegments")}</SelectItem>
            {items.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.value ? t("analyticsV2.filters.chip", { filter: item.label, value: item.value }) : item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-caption" aria-label={label} data-testid={testId}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <li key={item.key} className="min-w-0">
              <RowDrillButton
                pressed={active}
                onClick={() => onSelect(active ? null : item.key)}
                className="max-w-full gap-1.5 no-underline"
                data-testid={testId ? `${testId}-${item.key}` : undefined}
              >
                {item.color && <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />}
                <span className="truncate underline decoration-border underline-offset-4">{item.label}</span>
                {item.value && <span className="shrink-0 tabular-nums text-muted-foreground">{item.value}</span>}
              </RowDrillButton>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2" aria-label={label} data-testid={testId}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <li key={item.key} className="min-w-0">
            <FilterChip
              selected={active}
              onToggle={(next) => onSelect(next ? item.key : null)}
              count={item.value}
              data-testid={testId ? `${testId}-${item.key}` : undefined}
            >
              {item.color && <span aria-hidden="true" className="me-1.5 inline-block size-2.5 rounded-sm align-middle" style={{ background: item.color }} />}
              {item.label}
            </FilterChip>
          </li>
        );
      })}
    </ul>
  );
}
