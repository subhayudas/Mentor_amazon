import { useTranslation } from "react-i18next";

import { FilterChip } from "@/components/discovery/FilterChip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface SegmentLegendItem {
  key: string;
  label: string;
  /** Already formatted for display. */
  value: string;
  /** CSS colour of the mark this item stands for (a token string such as `hsl(var(--chart-1))`). */
  color: string;
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
}

/**
 * Text legend and keyboard twin of the chart marks in one element: a
 * `FilterChip` per segment carrying the swatch, label and value. Toggling a
 * chip applies the same drill the chart click does, so nothing on the page
 * is mouse-only or colour-only (D3).
 */
export function SegmentLegend({ items, activeKey, onSelect, label, testId, maxButtons = 12 }: SegmentLegendProps) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  if (items.length > maxButtons) {
    const selectId = testId ? `${testId}-select` : undefined;
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
        <span className="text-caption text-muted-foreground">{label}</span>
        <Select value={activeKey ?? "__none"} onValueChange={(value) => onSelect(value === "__none" ? null : value)}>
          <SelectTrigger className="h-9 w-64 text-sm" aria-label={label} data-testid={selectId}>
            <SelectValue placeholder={t("analytics.selectSegment")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">{t("analytics.allSegments")}</SelectItem>
            {items.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {t("analyticsV2.filters.chip", { filter: item.label, value: item.value })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
              <span aria-hidden="true" className="me-1.5 inline-block size-2.5 rounded-sm align-middle" style={{ background: item.color }} />
              {item.label}
            </FilterChip>
          </li>
        );
      })}
    </ul>
  );
}
