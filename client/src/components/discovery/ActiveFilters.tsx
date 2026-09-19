import * as React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Active filter row (P1-6 A11Y): each chip is ONE `<button>` whose accessible
 * name is "Remove filter: {label}" with a 32px X hit area; after removal focus
 * moves to the next chip, else "Clear all", else `focusFallbackRef` (the
 * results heading), else the page title — never to body. Renders nothing when
 * there are no filters.
 */
export interface ActiveFilter {
  key: string;
  label: string;
}

export interface ActiveFiltersProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  /** Where focus lands when the last chip and Clear all are gone. */
  focusFallbackRef?: React.RefObject<HTMLElement>;
  className?: string;
}

export function ActiveFilters({ filters, onRemove, onClearAll, focusFallbackRef, className }: ActiveFiltersProps) {
  const { t } = useTranslation();
  const chipRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const clearRef = React.useRef<HTMLButtonElement | null>(null);
  const pendingFocus = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (pendingFocus.current == null) return;
    const index = Math.min(pendingFocus.current, filters.length - 1);
    pendingFocus.current = null;
    const target = index >= 0 ? chipRefs.current[index] : null;
    const fallback = focusFallbackRef?.current ?? document.getElementById("page-title");
    (target ?? clearRef.current ?? fallback)?.focus();
  }, [filters, focusFallbackRef]);

  if (filters.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ul aria-label={t("a11y.activeFilters")} className="contents">
        {filters.map((filter, index) => (
          <li key={filter.key} className="contents">
            <button
              ref={(node) => {
                chipRefs.current[index] = node;
              }}
              type="button"
              aria-label={t("a11y.removeFilter", { label: filter.label })}
              onClick={() => {
                pendingFocus.current = index;
                onRemove(filter.key);
              }}
              className={cn(
                badgeVariants({ variant: "outline" }),
                "min-h-8 gap-1 pe-1 ps-2.5 text-body-sm font-medium text-secondary transition-colors duration-fast hover:border-secondary hover:bg-muted",
              )}
            >
              <span className="min-w-0 truncate">{filter.label}</span>
              <span className="grid size-6 place-items-center rounded-full">
                <X className="size-3.5" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button
        ref={clearRef}
        type="button"
        variant="link"
        size="sm"
        onClick={() => {
          pendingFocus.current = -1;
          onClearAll();
        }}
      >
        {t("common.clearAll")}
      </Button>
    </div>
  );
}
