import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface StatTileProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Small caveat under the number (e.g. how many sessions are excluded). */
  secondary?: string;
  /** Unit rendered after the value, e.g. "h". */
  unit?: string;
  testId?: string;
}

/** Compact KPI tile: label, number, optional caveat. Numbers are tabular so tiles line up. */
export function StatTile({ title, value, icon: Icon, secondary, unit, testId }: StatTileProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tabular-nums leading-none" data-testid={testId}>
            {value}
            {unit && <span className="ms-1 text-base font-medium text-muted-foreground">{unit}</span>}
          </p>
          {secondary && (
            <p className="text-xs text-muted-foreground" data-testid={testId ? `${testId}-secondary` : undefined}>
              {secondary}
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-lg bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}
