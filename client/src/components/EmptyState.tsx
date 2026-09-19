import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Empty / error / zero-result state (spec §3): compact, centred, `max-w-sm`,
 * never an illustration. The title is a real heading (level chosen by the
 * caller so the outline stays coherent) and the icon is decorative. Pass
 * `role="status"` from the caller when the state replaces live results.
 */
export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** Heading element for the title. */
  titleAs?: "h2" | "h3" | "p";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  titleAs: TitleTag = "h2",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-sm flex-col items-center gap-3 py-12 text-center", className)}
      {...props}
    >
      {Icon && (
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
      )}
      <TitleTag className="text-h3 text-foreground">{title}</TitleTag>
      {description && <p className="text-body-sm text-muted-foreground text-pretty">{description}</p>}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
