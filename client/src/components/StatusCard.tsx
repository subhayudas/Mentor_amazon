import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Status card (findings D7/(h)): the one shape shared by the SSO callback,
 * request-access, access-denied, onboarding-gate and error pages — icon chip,
 * heading, body, actions. The heading is `tabIndex={-1}` and receives focus on
 * mount (or when `focusKey` changes) so keyboard and screen-reader users land
 * on the explanation instead of an empty page. When the card is the page,
 * pass `titleAs="h1"`: the heading then carries `id="page-title"` so the
 * route-change effect targets it too.
 */
export type StatusTone = "neutral" | "danger" | "warning" | "success" | "busy";

export interface StatusCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: StatusTone;
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  titleAs?: "h1" | "h2";
  /** Move focus to the heading on mount and whenever this value changes. */
  focusKey?: string | number | boolean;
  autoFocus?: boolean;
  children?: React.ReactNode;
}

const CHIP: Record<StatusTone, string> = {
  neutral: "bg-muted text-secondary",
  danger: "bg-destructive-soft text-destructive",
  warning: "bg-warning text-warning-icon",
  success: "bg-success-soft text-success",
  busy: "bg-muted text-secondary",
};

export function StatusCard({
  tone = "neutral",
  icon: Icon,
  title,
  description,
  actions,
  titleAs: TitleTag = "h2",
  focusKey,
  autoFocus = true,
  children,
  className,
  ...props
}: StatusCardProps) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: false }));
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, focusKey]);

  return (
    <div
      className={cn("w-full max-w-lg rounded-lg border border-border bg-card p-6 text-card-foreground", className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        {tone === "busy" ? (
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", CHIP[tone])}>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          </span>
        ) : (
          Icon && (
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", CHIP[tone])}>
              <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
          )
        )}
        <div className="min-w-0 flex-1">
          <TitleTag
            ref={headingRef}
            id={TitleTag === "h1" ? "page-title" : undefined}
            tabIndex={-1}
            className="text-h2-sm text-foreground [&:focus:not(:focus-visible)]:outline-none"
          >
            {title}
          </TitleTag>
          {description && <div className="mt-2 text-body-sm text-muted-foreground text-pretty">{description}</div>}
        </div>
      </div>
      {children && <div className="mt-5">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** Centred wrapper for a card that is the whole page (auth, gates, errors). */
export function StatusPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("container-page flex min-h-[calc(100dvh-3.5rem)] items-center justify-center py-12", className)}>
      {children}
    </div>
  );
}
