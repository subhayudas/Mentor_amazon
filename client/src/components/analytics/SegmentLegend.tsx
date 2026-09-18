import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SegmentLegendItem {
  key: string;
  label: string;
  value: number | string;
  color: string;
}

interface SegmentLegendProps {
  items: SegmentLegendItem[];
  activeKey: string | null;
  onSelect: (key: string | null) => void;
  /** Accessible name for the group, e.g. "Booking status segments". */
  label: string;
  testId?: string;
  /** Past this many items the buttons collapse into a select (daily buckets, long lists). */
  maxButtons?: number;
}

/**
 * Keyboard-reachable twin of the chart marks: one button per segment with the
 * swatch, label and value. Clicking toggles the same drill filter the chart
 * click does, so nothing on the page is mouse-only or colour-only.
 */
export function SegmentLegend({ items, activeKey, onSelect, label, testId, maxButtons = 12 }: SegmentLegendProps) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  if (items.length > maxButtons) {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
        <span className="text-xs text-muted-foreground">{label}</span>
        <Select value={activeKey ?? "__none"} onValueChange={(value) => onSelect(value === "__none" ? null : value)}>
          <SelectTrigger className="h-8 w-56 text-xs" aria-label={label} data-testid={testId ? `${testId}-select` : undefined}>
            <SelectValue placeholder={t("analytics.selectSegment")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">{t("analytics.allSegments")}</SelectItem>
            {items.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label} · {item.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label} data-testid={testId}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <li key={item.key}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : item.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                active
                  ? "border-[#232F3E] bg-[#232F3E] text-white"
                  : "border-[#D5D9D9] bg-background text-[#0F1111] hover:bg-muted",
              )}
              data-testid={testId ? `${testId}-${item.key}` : undefined}
            >
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
              <span className="font-medium">{item.label}</span>
              <span className={cn("tabular-nums", active ? "text-white/80" : "text-muted-foreground")}>{item.value}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
