import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { FilterGroups, type FilterFacets, type FilterValue } from "@/components/discovery/FilterGroups";
import { cn } from "@/lib/utils";

/**
 * Desktop filter rail (spec §5, P1-30): a labelled `aside`, `w-64`, sticky
 * under the header with its own scroll on `lg+` only (it is not mounted
 * below `lg`; the drawer takes over). Every change writes the URL
 * synchronously through `onChange` (one `push` per click). "Clear all"
 * carries the legacy `button-clear-filters` id.
 */
export interface FilterRailProps {
  facets: FilterFacets;
  value: FilterValue;
  activeCount: number;
  onChange: (patch: Partial<FilterValue>) => void;
  onClearAll: () => void;
  className?: string;
}

export function FilterRail({ facets, value, activeCount, onChange, onClearAll, className }: FilterRailProps) {
  const { t } = useTranslation();
  const titleId = React.useId();
  return (
    <aside
      aria-labelledby={titleId}
      className={cn(
        "w-64 shrink-0 self-start lg:sticky lg:top-16 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:overscroll-contain",
        // Keep 2px focus rings inside the scroll box.
        "-mx-1 px-1 pb-4",
        className,
      )}
    >
      <div className="mb-4 flex min-h-9 items-center justify-between gap-2">
        <h2 id={titleId} className="text-h3 text-foreground">
          {t("discovery.filters.title")}
        </h2>
        {activeCount > 0 && (
          <Button type="button" variant="link" size="sm" onClick={onClearAll} data-testid="button-clear-filters">
            {t("discovery.filters.clearAll")}
          </Button>
        )}
      </div>
      <FilterGroups facets={facets} value={value} onChange={onChange} idPrefix="rail" />
    </aside>
  );
}
