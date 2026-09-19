import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsPhone } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

export interface ChartFigureProps {
  title: string;
  /** Unit and period line under the title ("Per week · Last 30 days"), already translated. */
  meta?: ReactNode;
  /** One-line definition of what the marks count. */
  definition?: ReactNode;
  /** `above` (default) sits between the chart and the table; `below` makes it the caption under an always-visible table (phones, N-06). */
  definitionPlacement?: "above" | "below";
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
  children?: ReactNode;
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
  definitionPlacement = "above",
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
  // Phones (F-11): the toggle is a named 44px icon button so it shares the
  // title row instead of wrapping under a long title onto a row of its own.
  const isPhone = useIsPhone();
  const toggleLabel = tableOpen ? t("analyticsV2.chart.hideTable") : t("analyticsV2.chart.viewTable");
  const toggle =
    tableMode === "toggle" ? (
      <Button
        type="button"
        variant="ghost"
        size={isPhone ? "icon" : "sm"}
        aria-expanded={tableOpen}
        aria-controls={tableId}
        aria-label={isPhone ? toggleLabel : undefined}
        onClick={() => setTableOpen((open) => !open)}
        className={cn("shrink-0 text-muted-foreground", isPhone ? "-me-2 -mt-2 size-11" : "-me-2")}
        data-testid={testId ? `${testId}-table-toggle` : undefined}
      >
        <Table2 aria-hidden="true" strokeWidth={1.75} />
        {!isPhone && toggleLabel}
      </Button>
    ) : null;

  return (
    <figure
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={cn("flex flex-col rounded-lg border border-border bg-card p-4 md:p-6", className)}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-x-3 max-md:flex-nowrap md:flex-wrap md:gap-x-4 md:gap-y-2">
        <div className="min-w-0">
          <Heading id={titleId} className="text-h3 text-foreground">
            {title}
          </Heading>
          {meta && <p className="mt-0.5 text-caption text-muted-foreground">{meta}</p>}
        </div>
        {toggle}
      </div>
      <p id={descId} className="sr-only">
        {summary}
      </p>
      {/* A figure that is only its table on phones (F-11 by-country) passes no chart. */}
      {children != null && children !== false && <div className="mt-4">{children}</div>}
      {legend && <div className="mt-3">{legend}</div>}
      {/* A <p>, not <figcaption>: figcaption must be the first or last child of the figure and the table follows it. */}
      {definition && definitionPlacement === "above" && <p className="mt-3 text-caption text-muted-foreground text-pretty">{definition}</p>}
      <div id={tableId} className={showTable ? cn("border-t border-border pt-3", children != null && children !== false ? "mt-4" : "mt-3") : "sr-only"} data-testid={testId ? `${testId}-table` : undefined}>
        {table}
      </div>
      {definition && definitionPlacement === "below" && <p className="mt-2 text-caption text-muted-foreground text-pretty">{definition}</p>}
      {footer}
    </figure>
  );
}
