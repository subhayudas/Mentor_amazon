import * as React from "react"

import { cn } from "@/lib/utils"

/** Textarea: same boundary, focus and mobile text-size rules as Input. Pass `dir="auto"` for free text. */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[5rem] w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground transition-colors duration-fast placeholder:text-muted-foreground read-only:bg-muted/60 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-[invalid=true]:border-destructive md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
