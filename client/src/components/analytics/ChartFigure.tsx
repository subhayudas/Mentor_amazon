import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChartFigureProps {
  title: string;
  /** Unit and period line under the title ("Per week · Last 30 days"), already translated. */
  meta?: ReactNode;
  /** One-line definition of what the marks count. */
  definition?: ReactNode;
  /** Visually hidden one-sentence data summary computed from the same array (P0-2). */
  summary: string;
  /** The exact-value `<table>`; always in the DOM, visually toggled (P2-16). */
  table: ReactNode;
  /**
   * `toggle` (default): the table is collapsed behind "View as table".
   * `beneath`: the table is always visible under the chart (spec §9 By-country).
   * `hidden`: no toggle; the table stays in the DOM for assistive tech only
   * (used while the figure shows an empty state).
   */
  tableMode?: "toggle" | "beneath" | "hidden";
  /** Text legend / keyboard twin rendered outside the LTR chart wrapper so it follows the page direction. */
  legend?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  headingLevel?: "h2" | "h3";
  testId?: string;
  className?: string;
}

/**
 * Every chart's frame (spec §9, P0-2): a `<figure role="group">` named by its
 * title and described by a visually hidden computed summary; title, legend,
 * definition and the table sit outside the `dir="ltr"` chart wrapper. The
 * "View as table" toggle only changes visibility — the table is the
 * accessible exact-value path and is never lazily mounted.
 */
export function ChartFigure({
  title,
  meta,
  definition,
  summary,
  table,
  tableMode = "toggle",
  legend,
  footer,
  children,
  headingLevel: Heading = "h2",
  testId,
  className,
}: ChartFigureProps) {
  const { t } = useTranslation();
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const tableId = `${id}-table`;
  const [tableOpen, setTableOpen] = useState(false);
  const showTable = tableMode === "beneath" || tableOpen;

  return (
    <figure
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={cn("flex flex-col rounded-lg border border-border bg-card p-4 md:p-6", className)}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Heading id={titleId} className="text-h3 text-foreground">
            {title}
          </Heading>
          {meta && <p className="mt-0.5 text-caption text-muted-foreground">{meta}</p>}
        </div>
        {tableMode === "toggle" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={tableOpen}
            aria-controls={tableId}
            onClick={() => setTableOpen((open) => !open)}
            className="-me-2 shrink-0 text-muted-foreground"
            data-testid={testId ? `${testId}-table-toggle` : undefined}
          >
            <Table2 aria-hidden="true" strokeWidth={1.5} />
            {tableOpen ? t("analyticsV2.chart.hideTable") : t("analyticsV2.chart.viewTable")}
          </Button>
        )}
      </div>
      <p id={descId} className="sr-only">
        {summary}
      </p>
      <div className="mt-4">{children}</div>
      {legend && <div className="mt-3">{legend}</div>}
      {definition && <figcaption className="mt-3 text-caption text-muted-foreground text-pretty">{definition}</figcaption>}
      <div id={tableId} className={showTable ? "mt-4 border-t border-border pt-3" : "sr-only"} data-testid={testId ? `${testId}-table` : undefined}>
        {table}
      </div>
      {footer}
    </figure>
  );
}
