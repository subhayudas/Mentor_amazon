import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { bidi } from "@/lib/format";
import type { BookingRow } from "@/lib/reporting";
import { BookingsTable } from "./BookingsTable";

interface DrilldownTableProps {
  /** Human label of the clicked segment, e.g. "Completed" or "United Kingdom". */
  segmentLabel: string;
  rows: BookingRow[];
  onClear: () => void;
  testId?: string;
  limit?: number;
  showMentee?: boolean;
  showMentor?: boolean;
}

/**
 * Details table shown under a chart once a bar, segment or legend item has
 * been selected (TESTING g3: "Showing: <segment>" + Clear). Focus moves to
 * its heading when it opens (D7); the caller returns focus on Clear.
 */
export function DrilldownTable({ segmentLabel, rows, onClear, testId = "drilldown", limit = 50, showMentee = true, showMentor = true }: DrilldownTableProps) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [segmentLabel]);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" data-testid={testId} aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2">
        <h3 ref={headingRef} tabIndex={-1} className="text-body-sm font-medium text-foreground" data-testid={`${testId}-chip`}>
          {t("analyticsV2.drill.showing", { label: bidi(segmentLabel) })}
        </h3>
        <Button type="button" variant="link" size="sm" onClick={onClear} data-testid={`${testId}-clear`}>
          {t("analyticsV2.drill.clear")}
          <X aria-hidden="true" />
        </Button>
        <span className="ms-auto text-caption text-muted-foreground tabular-nums">
          {rows.length > limit
            ? t("analytics.showingRows", { shown: limit, total: rows.length })
            : t("analytics.rowCount", { count: rows.length })}
        </span>
      </div>
      <BookingsTable rows={rows} limit={limit} emptyText={t("analytics.noSegmentRows")} testId={`${testId}-table`} showMentee={showMentee} showMentor={showMentor} />
    </section>
  );
}
