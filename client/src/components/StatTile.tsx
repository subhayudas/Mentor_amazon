import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * KPI tile (spec §9, P2-15, F-14): ONE silhouette for admin, mentor and
 * analytics — label, 24px tabular value with an optional unit, a reserved
 * secondary line (delta and/or caveat; `min-h-5` so tiles with and without
 * one share geometry) and a bottom-aligned definition footnote over a
 * hairline, so paired tiles in a grid row keep their dividers on one line.
 * No decorative icon. Numbers are never larger than `text-2xl`; a missing
 * value is rendered by the caller as "—", a real zero as 0. Test ids:
 * `${testId}` on the value, `${testId}-secondary` on the caveat.
 */
export interface StatTileProps {
  title: string;
  value: string | number;
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

export function StatTile({ title, value, secondary, caveat, unit, delta, definition, testId, className }: StatTileProps) {
  const note = caveat ?? secondary;
  return (
    <div className={cn("flex h-full flex-col rounded-lg border border-border bg-card p-4 text-card-foreground", className)}>
      <p className="min-w-0 text-caption text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold leading-none tabular-nums text-foreground" data-testid={testId}>
        {value}
        {unit && <span className="ms-1 text-caption font-medium text-muted-foreground">{unit}</span>}
      </p>
      <div className="mt-1 min-h-5 text-caption text-muted-foreground">
        {delta && <div className="tabular-nums">{delta}</div>}
        {note && (
          <p className="text-pretty" data-testid={testId ? `${testId}-secondary` : undefined}>
            {note}
          </p>
        )}
      </div>
      {definition && (
        <div className="mt-auto pt-3">
          <p className="border-t border-border pt-2 text-caption text-muted-foreground text-pretty">{definition}</p>
        </div>
      )}
    </div>
  );
}
