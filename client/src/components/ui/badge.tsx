import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badge (spec §3, P1-6, P2-2): a static pill that always carries text, never
 * icon-only and never focusable — anything clickable is a FilterChip or Button.
 * Tones: neutral, accent, success, warning, danger, info, outline. The legacy
 * shadcn names stay as aliases: default → accent, secondary → neutral,
 * destructive → danger. Every text/tint pair is >= 4.5:1 (see index.css).
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2.5 py-0.5 text-caption [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-foreground",
        accent: "border-brand-orange-100 bg-accent text-accent-foreground",
        success: "bg-success-soft text-success-soft-foreground [&>svg]:text-success",
        warning: "border-warning-border bg-warning text-warning-foreground [&>svg]:text-warning-icon",
        danger: "bg-destructive-soft text-destructive",
        info: "bg-info text-info-foreground",
        outline: "border-input bg-card text-foreground",
        // aliases
        default: "border-brand-orange-100 bg-accent text-accent-foreground",
        secondary: "bg-muted text-foreground",
        destructive: "bg-destructive-soft text-destructive",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Alias of `variant` using the tone vocabulary; wins when both are set. */
  tone?: BadgeTone
}

function Badge({ className, variant, tone, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant: tone ?? variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
