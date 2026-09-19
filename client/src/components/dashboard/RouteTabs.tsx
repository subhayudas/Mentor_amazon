import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsPhone } from "@/hooks/useMediaQuery";
import { confirmNavigation } from "@/lib/leaveGuard";

/**
 * URL-synced tab row for the app shells (P1-23/C11/C12): the mentee dashboard
 * and the mentor portal drop the sidebar and render `PageHeader` + this row.
 * - Each tab is a sub-route; the active tab is derived from the location and
 *   selecting a tab navigates (manual activation, so arrow keys only move
 *   focus and Enter/Space commit — panels are lazy data views).
 * - Below `md` (F-03) the row never scrolls and never clips: the tabs that fit
 *   share the row and the rest sit behind a "More" menu with the same icons
 *   and labels. The active tab is always in the row (it swaps in for the last
 *   fitted one when it would otherwise be in the menu, shedding neighbours
 *   if it is wider), so a mentor's Profile tab is one tap away and its
 *   existence is visible. Widths are measured from a hidden copy of the
 *   labels, so the cut does not depend on label length in either language,
 *   and triggers keep their natural width in the row (no equal split that
 *   would clip the longest label). The list is full-bleed and `sticky top-14
 *   z-30` under the global header (static below 520px tall, P1-30).
 *   Desktop: static, equal width, every tab in the row.
 * - Exactly one panel is rendered (`TabsContent` for the active value) in the
 *   single document scroll; no nested scroll containers.
 * - A dirty form (lib/leaveGuard) is asked before the tab changes.
 */
export interface RouteTab {
  value: string;
  href: string;
  label: string;
  icon: LucideIcon;
  testId?: string;
  /** Extra pathnames that also select this tab (aliases). */
  aliases?: string[];
}

export interface RouteTabsProps {
  tabs: RouteTab[];
  /** Accessible name for the tab list. */
  ariaLabel: string;
  /** The active tab's panel. */
  children: React.ReactNode;
  className?: string;
}

/** Active tab for a pathname: exact match on href or alias, else the longest href prefix. */
export function activeTabFor(tabs: RouteTab[], pathname: string): RouteTab {
  const path = pathname.replace(/\/+$/, "") || "/";
  const exact = tabs.find((tab) => tab.href === path || tab.aliases?.includes(path));
  if (exact) return exact;
  const byPrefix = [...tabs]
    .filter((tab) => path.startsWith(`${tab.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return byPrefix ?? tabs[0];
}

/**
 * Splits the tabs into the ones that fit the row and the ones that go behind
 * "More": the first `n` whose natural widths fit next to the More button, with
 * the active tab always in the row. When the active tab swaps in for the last
 * fitted one and is wider than it, earlier tabs are dropped into the menu
 * until the row fits again, so the active label is never the one that clips
 * (F-03 at 320px). Pure, so it is testable and re-runs on every resize
 * without touching the DOM.
 */
export function splitTabsForRow<T>(
  items: T[],
  widths: number[],
  available: number,
  moreWidth: number,
  activeIndex: number,
): { row: T[]; overflow: T[] } {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= available + 0.5) return { row: items, overflow: [] };
  const budget = available - moreWidth + 0.5;
  let fitted = 0;
  let used = 0;
  while (fitted < items.length && used + widths[fitted] <= budget) used += widths[fitted++];
  fitted = Math.max(1, fitted);
  const rowIndexes = Array.from({ length: fitted }, (_, i) => i);
  if (activeIndex >= fitted) {
    rowIndexes[fitted - 1] = activeIndex;
    const rowWidth = () => rowIndexes.reduce((sum, i) => sum + widths[i], 0);
    // The active tab may be wider than the one it replaced: shed the tab
    // before it (never the active one) until the row fits the budget.
    while (rowIndexes.length > 1 && rowWidth() > budget) rowIndexes.splice(rowIndexes.length - 2, 1);
  }
  const inRow = new Set(rowIndexes);
  return {
    row: rowIndexes.map((i) => items[i]),
    overflow: items.filter((_, i) => !inRow.has(i)),
  };
}

export function RouteTabs({ tabs, ariaLabel, children, className }: RouteTabsProps) {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const active = activeTabFor(tabs, location);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.value === active.value));
  const isPhone = useIsPhone();

  const rowRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState<{ widths: number[]; more: number; available: number } | null>(null);

  // Natural widths come from a hidden copy of the labels (so tabs behind
  // "More" can be measured too); re-measured on resize, font load and when
  // the labels change (language switch).
  const labelsKey = tabs.map((tab) => tab.label).join("|");
  React.useLayoutEffect(() => {
    if (!isPhone) {
      setFit(null);
      return;
    }
    const row = rowRef.current;
    const probe = measureRef.current;
    if (!row || !probe) return;
    const measure = () => {
      const spans = Array.from(probe.querySelectorAll<HTMLElement>("[data-measure]"));
      const widths = spans.filter((el) => el.dataset.measure === "tab").map((el) => el.getBoundingClientRect().width);
      const more = spans.find((el) => el.dataset.measure === "more")?.getBoundingClientRect().width ?? 0;
      const available = row.clientWidth;
      setFit((prev) =>
        prev && prev.available === available && prev.more === more && prev.widths.length === widths.length && prev.widths.every((w, i) => w === widths[i])
          ? prev
          : { widths, more, available },
      );
    };
    measure();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [isPhone, labelsKey]);

  const { row, overflow } =
    isPhone && fit ? splitTabsForRow(tabs, fit.widths, fit.available, fit.more, activeIndex) : { row: tabs, overflow: [] as RouteTab[] };

  const onValueChange = (value: string) => {
    const next = tabs.find((tab) => tab.value === value);
    if (!next || next.value === active.value) return;
    confirmNavigation().then((ok) => {
      if (ok) setLocation(next.href);
    });
  };

  // Phone: triggers grow from their NATURAL width (`flex-auto`), so a long
  // label next to a short one keeps its text while the spare space is
  // shared; the split above guarantees the natural widths fit. Desktop keeps
  // the spec's equal-width row (`flex-1`).
  const triggerClass = "min-w-0 flex-auto px-2 md:flex-1 md:px-3";

  return (
    <Tabs value={active.value} onValueChange={onValueChange} activationMode="manual" className={className}>
      <div className="sticky top-14 z-30 -mx-4 bg-background px-4 sm:-mx-6 sm:px-6 md:static md:mx-0 md:px-0 [@media(max-height:520px)]:static">
        <div ref={rowRef} className="relative flex items-stretch">
          <TabsList aria-label={ariaLabel} className="min-w-0 flex-1">
            {row.map(({ value, label, icon: Icon, testId }) => (
              <TabsTrigger key={value} value={value} className={triggerClass} data-testid={testId}>
                <Icon aria-hidden="true" strokeWidth={1.75} />
                <span className="truncate">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {overflow.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b border-border px-2 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground data-[state=open]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0"
                data-testid="tabs-more"
              >
                <MoreHorizontal aria-hidden="true" strokeWidth={1.75} />
                <span>{t("common.moreTabs")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" aria-label={ariaLabel}>
                {overflow.map(({ value, label, icon: Icon, testId }) => (
                  <DropdownMenuItem key={value} onSelect={() => onValueChange(value)} data-testid={testId ? `${testId}-menu` : undefined}>
                    <Icon aria-hidden="true" strokeWidth={1.75} />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Measurement copy of every label at its natural width (never shown, never read). */}
          {isPhone && (
            <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 flex h-0 overflow-hidden">
              {tabs.map(({ value, label, icon: Icon }) => (
                <span key={value} data-measure="tab" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-2 text-sm font-medium [&_svg]:size-4">
                  <Icon aria-hidden="true" />
                  {label}
                </span>
              ))}
              <span data-measure="more" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-2 text-sm font-medium [&_svg]:size-4">
                <MoreHorizontal aria-hidden="true" />
                {t("common.moreTabs")}
              </span>
            </div>
          )}
        </div>
      </div>
      {/* Panels always start with focusable content, so the panel itself is not a Tab stop. */}
      <TabsContent value={active.value} tabIndex={-1} className="mt-6 outline-none">
        {children}
      </TabsContent>
    </Tabs>
  );
}
