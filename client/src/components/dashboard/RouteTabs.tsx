import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { useLocation } from "wouter";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmNavigation } from "@/lib/leaveGuard";
import { cn } from "@/lib/utils";

/**
 * URL-synced tab row for the app shells (P1-23/C11/C12): the mentee dashboard
 * and the mentor portal drop the sidebar and render `PageHeader` + this row.
 * - Each tab is a sub-route; the active tab is derived from the location and
 *   selecting a tab navigates (manual activation, so arrow keys only move
 *   focus and Enter/Space commit — panels are lazy data views).
 * - Mobile: the list is full-bleed and `sticky top-14 z-30` under the global
 *   header (static below 520px tall, P1-30); it scrolls horizontally when the
 *   labels do not fit. When it does, the triggers are given one uniform width
 *   so that exactly n whole tabs plus a 24px peek of the next fit the scroller
 *   (measured, so the cue does not depend on label length in either
 *   language — the scrollbar is hidden). Desktop: static, equal width.
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

export function RouteTabs({ tabs, ariaLabel, children, className }: RouteTabsProps) {
  const [location, setLocation] = useLocation();
  const active = activeTabFor(tabs, location);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Mobile peek (P1-30 / brief): when the row scrolls, stretch the tabs that
  // fit so the next one starts exactly 24px before the edge — with `px-2`
  // that is its whole icon, cut at the label. Measured from the natural
  // widths, so a long Arabic label or a short English one cannot land a tab
  // edge on the gutter with nothing to signal that the row scrolls.
  React.useLayoutEffect(() => {
    const scroller = listRef.current;
    if (!scroller) return;
    const PEEK = 24;
    const measure = () => {
      const triggers = Array.from(scroller.querySelectorAll<HTMLElement>('[role="tab"]'));
      triggers.forEach((el) => el.style.removeProperty("width"));
      if (getComputedStyle(scroller).overflowX !== "auto") return; // desktop: equal-width flex
      const widths = triggers.map((el) => el.getBoundingClientRect().width);
      const available = scroller.clientWidth;
      const total = widths.reduce((sum, w) => sum + w, 0);
      if (total <= available + 0.5) return; // everything fits: flex shares the row
      let fitted = 0;
      let used = 0;
      while (fitted < widths.length && used + widths[fitted] <= available - PEEK) used += widths[fitted++];
      if (fitted === 0) return; // one tab is wider than the row: nothing sensible to do
      const extra = (available - PEEK - used) / fitted;
      triggers.slice(0, fitted).forEach((el, i) => el.style.setProperty("width", `${widths[i] + extra}px`));
    };
    measure();
    let cancelled = false;
    // Web fonts can land after the first paint and change the natural widths.
    document.fonts?.ready.then(() => { if (!cancelled) measure(); });
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // Re-measure when the labels change (language switch), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map((tab) => tab.label).join("\u0000")]);

  // Keep the active tab visible when the list scrolls horizontally (mobile).
  React.useEffect(() => {
    const trigger = listRef.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    trigger?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active.value]);

  const onValueChange = (value: string) => {
    const next = tabs.find((tab) => tab.value === value);
    if (!next || next.value === active.value) return;
    confirmNavigation().then((ok) => {
      if (ok) setLocation(next.href);
    });
  };

  return (
    <Tabs value={active.value} onValueChange={onValueChange} activationMode="manual" className={className}>
      <div className="sticky top-14 z-30 -mx-4 bg-background px-4 sm:-mx-6 sm:px-6 md:static md:mx-0 md:px-0 [@media(max-height:520px)]:static">
        <div
          ref={listRef}
          className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:overflow-visible"
        >
          <TabsList aria-label={ariaLabel} className="w-max min-w-full md:w-full">
            {tabs.map(({ value, label, icon: Icon, testId }) => (
              <TabsTrigger
                key={value}
                value={value}
                // Mobile: natural width (the effect above stretches the tabs
                // that fit so the next one peeks 24px); desktop: equal width.
                // Inset focus ring so the scroller never clips it on mobile.
                className="flex-auto shrink-0 px-2 focus-visible:-outline-offset-2 md:flex-1 md:shrink md:!w-auto md:px-3"
                data-testid={testId}
              >
                <Icon aria-hidden="true" strokeWidth={1.75} />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
      {/* Panels always start with focusable content, so the panel itself is not a Tab stop. */}
      <TabsContent value={active.value} tabIndex={-1} className="mt-6 outline-none">
        {children}
      </TabsContent>
    </Tabs>
  );
}
