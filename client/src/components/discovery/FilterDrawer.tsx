import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { FilterGroups, EMPTY_FILTERS, type FilterFacets, type FilterValue } from "@/components/discovery/FilterGroups";

/**
 * Mobile filters (spec §5, P0-3, P0-8): a 44px "Filters (n)" button opening a
 * vaul bottom drawer (`shouldScaleBackground={false}`, focus moves inside).
 * Edits live in a DRAFT; the footer button "Show {n} mentors" applies them as
 * ONE history push and closes; "Clear" empties the draft. Closing by swipe,
 * overlay or Escape discards the draft, so the URL never changes without an
 * explicit apply. The body is the only scrolling region (`data-vaul-no-drag`
 * keeps the drag gesture off the list).
 */
export interface FilterDrawerProps {
  facets: FilterFacets;
  value: FilterValue;
  activeCount: number;
  /** Result count for a candidate filter set, so the apply button can say "Show 5 mentors". */
  countFor: (draft: FilterValue) => number;
  onApply: (next: FilterValue) => void;
  className?: string;
}

export function FilterDrawer({ facets, value, activeCount, countFor, onApply, className }: FilterDrawerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<FilterValue>(value);

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value); // start from what the URL says, every time
    setOpen(next);
  };

  const count = countFor(draft);

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} shouldScaleBackground={false}>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" size="lg" className={className} data-testid="button-open-filters">
          <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} />
          {activeCount > 0 ? t("discovery.filters.openCount", { count: activeCount }) : t("discovery.filters.open")}
        </Button>
      </DrawerTrigger>
      <DrawerContent data-testid="drawer-filters">
        <DrawerHeader className="pb-2">
          <DrawerTitle>{t("discovery.filters.title")}</DrawerTitle>
          <DrawerDescription>{t("discovery.filters.drawerDescription")}</DrawerDescription>
        </DrawerHeader>
        <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <FilterGroups
            facets={facets}
            value={draft}
            onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            idPrefix="drawer"
          />
        </div>
        <DrawerFooter className="border-t border-border">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
            data-testid="button-apply-filters"
          >
            {t("discovery.filters.apply", { count })}
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full" onClick={() => setDraft(EMPTY_FILTERS)}>
            {t("discovery.filters.clear")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
