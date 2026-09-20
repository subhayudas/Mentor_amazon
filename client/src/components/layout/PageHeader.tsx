import * as React from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Page header (spec §3/§11, P1-29): the ONE `h1` per page, rendered with
 * `id="page-title"` and `tabIndex={-1}` so the route-change effect can move
 * focus to it; index.css hides the outline for programmatic (non-keyboard)
 * focus via `#page-title:focus:not(:focus-visible)`. Eyebrow is caption role in
 * sentence case; description uses `text-pretty` and a prose measure; `actions`
 * sit at the inline-end on md+. All copy arrives translated from the caller.
 */
export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Renders a back link above the eyebrow; `backLabel` is its translated text. */
  backHref?: string;
  backLabel?: string;
  /** Extra content under the header row (e.g. a live results count). */
  children?: React.ReactNode;
  className?: string;
  /** Visual size of the title; the element is always an h1. */
  size?: "h1" | "display";
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel,
  children,
  className,
  size = "h1",
}: PageHeaderProps) {
  return (
    <div className={cn("py-8 md:py-10", className)}>
      {backHref && backLabel && (
        <Link
          href={backHref}
          className="mb-4 inline-flex min-h-8 items-center gap-1 text-body-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="mb-2 text-caption text-muted-foreground">{eyebrow}</p>}
          <h1
            id="page-title"
            tabIndex={-1}
            className={cn(
              "text-foreground",
              size === "display" ? "text-display-sm md:text-display" : "text-h1-sm md:text-h1",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-prose text-body text-muted-foreground text-pretty">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
