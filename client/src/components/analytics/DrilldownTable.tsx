import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { BookingRow } from "@/lib/reporting";
import { BookingsTable } from "./BookingsTable";

interface DrilldownTableProps {
  /** Human label of the clicked segment, e.g. "Completed" or "United Kingdom". */
  segmentLabel: string;
  rows: BookingRow[];
  onClear: () => void;
  testId?: string;
  limit?: number;
}

/** Details table shown under a chart once a bar / slice / point has been clicked. */
export function DrilldownTable({ segmentLabel, rows, onClear, testId = "drilldown", limit = 50 }: DrilldownTableProps) {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden" data-testid={testId} aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <span
          className="inline-flex items-center gap-1 rounded-full border border-[#232F3E] bg-[#232F3E] px-2.5 py-0.5 text-xs font-medium text-white"
          data-testid={`${testId}-chip`}
        >
          {t("analytics.showing")}: {segmentLabel}
          <span aria-hidden="true" className="px-1 text-white/60">·</span>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-0.5 rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            data-testid={`${testId}-clear`}
          >
            {t("analytics.clearDrill")}
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {rows.length > limit
            ? t("analytics.showingRows", { shown: limit, total: rows.length })
            : t("analytics.rowCount", { count: rows.length })}
        </span>
      </div>
      <BookingsTable rows={rows} limit={limit} emptyText={t("analytics.noSegmentRows")} testId={`${testId}-table`} />
    </Card>
  );
}
