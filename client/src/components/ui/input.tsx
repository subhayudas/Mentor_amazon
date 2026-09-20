import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input (spec §1/§3): h-10 to match the md button, `--input` boundary (>= 3:1),
 * 16px text below `md` so iOS Safari does not zoom, global navy focus outline,
 * muted (never faded) disabled state, destructive border when `aria-invalid`.
 * Free-text inputs should pass `dir="auto"`; emails `dir="ltr"`.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground transition-colors duration-fast file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground read-only:bg-muted/60 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-[invalid=true]:border-destructive md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
