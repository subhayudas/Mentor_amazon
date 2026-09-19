import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Button (spec §3). Variants: `primary` (orange fill, navy text — the ONE
 * orange fill per viewport), `secondary` (navy), `outline`, `ghost`, `link`,
 * `destructive`. `default` is an alias of `primary` for existing callers.
 * Sizes: sm h-9, md h-10 (default), lg h-11 (44px, primary mobile actions), icon.
 * Focus: the global `:focus-visible` navy outline; no per-variant rings.
 * Disabled (native, reserved for in-flight `loading`): muted surface, never
 * opacity. Buttons disabled for a user-fixable reason should use `aria-disabled`.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-fast ease-out active:scale-[0.97] motion-reduce:transform-none disabled:pointer-events-none [&:disabled:not([aria-busy=true])]:border-transparent [&:disabled:not([aria-busy=true])]:bg-muted [&:disabled:not([aria-busy=true])]:text-muted-foreground aria-disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-brand-orange-600 active:bg-brand-orange-700",
        default:
          "bg-primary text-primary-foreground hover:bg-brand-orange-600 active:bg-brand-orange-700",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-brand-navy-700 active:bg-brand-navy-700",
        outline:
          "border border-input bg-card text-secondary hover:bg-muted active:bg-muted",
        ghost: "text-foreground hover:bg-muted active:bg-muted",
        link: "text-secondary underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/90",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        default: "h-10 px-4",
        lg: "h-11 px-6 text-base",
        icon: "size-10",
      },
    },
    compoundVariants: [
      { variant: "link", class: "h-auto px-0" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * In-flight state: a spinner replaces the leading icon slot, the label stays
   * (so the width does), the button is `disabled` and `aria-busy`.
   * Ignored with `asChild` (the child owns its content).
   */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      )
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }), loading && "[&>[data-slot=label]>svg:first-child]:hidden")}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {loading ? <span data-slot="label" className="contents">{children}</span> : children}
      </button>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
