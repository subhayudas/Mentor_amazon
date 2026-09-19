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
 *   labels do not fit, with the next tab peeking. Desktop: static, equal width.
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
        <div ref={listRef} className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:overflow-visible">
          <TabsList aria-label={ariaLabel} className="w-max min-w-full md:w-full">
            {tabs.map(({ value, label, icon: Icon, testId }) => (
              <TabsTrigger
                key={value}
                value={value}
                // Inset focus ring so the scroller never clips it on mobile.
                className="flex-none px-4 focus-visible:-outline-offset-2 md:flex-1 md:px-3"
                data-testid={testId}
              >
                <Icon aria-hidden="true" strokeWidth={1.75} />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
      <TabsContent value={active.value} className="mt-6 outline-none">
        {children}
      </TabsContent>
    </Tabs>
  );
}
