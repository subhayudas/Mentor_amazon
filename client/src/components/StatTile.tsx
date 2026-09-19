import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * KPI tile (spec §9, P2-15): label, 24px tabular value, optional unit,
 * optional delta slot, caveat line and a definition footnote slot that is
 * always visible (a tooltip alone is not enough). Numbers are never larger
 * than `text-2xl`; a missing value is rendered by the caller as "—", a real
 * zero as 0. Test ids: `${testId}` on the value, `${testId}-secondary` on the
 * caveat. Icons are decorative.
 */
export interface StatTileProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  /** Small caveat under the number (e.g. "3 sessions without a recorded duration"). */
  secondary?: string;
  /** Alias of `secondary`. */
  caveat?: string;
  /** Unit rendered after the value, e.g. "h". */
  unit?: string;
  /** Change vs the previous period, already formatted ("+2 vs previous 30 days"). */
  delta?: React.ReactNode;
  /** Visible definition footnote (what the number counts). */
  definition?: React.ReactNode;
  testId?: string;
  className?: string;
}

export function StatTile({
  title,
  value,
  icon: Icon,
  secondary,
  caveat,
  unit,
  delta,
  definition,
  testId,
  className,
}: StatTileProps) {
  const note = caveat ?? secondary;
  return (
    <div className={cn("flex flex-col rounded-lg border border-border bg-card p-4 text-card-foreground", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-caption text-muted-foreground">{title}</p>
        {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />}
      </div>
      <p className="mt-2 text-2xl font-semibold leading-none tabular-nums text-foreground" data-testid={testId}>
        {value}
        {unit && <span className="ms-1 text-caption font-medium text-muted-foreground">{unit}</span>}
      </p>
      {delta && <div className="mt-1 text-caption text-muted-foreground tabular-nums">{delta}</div>}
      {note && (
        <p className="mt-1 text-caption text-muted-foreground" data-testid={testId ? `${testId}-secondary` : undefined}>
          {note}
        </p>
      )}
      {definition && (
        <p className="mt-3 border-t border-border pt-2 text-caption text-muted-foreground text-pretty">{definition}</p>
      )}
    </div>
  );
}
