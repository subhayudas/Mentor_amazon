import { cn } from "@/lib/utils"

/**
 * Skeleton: draws the final geometry of the content it stands in for and is
 * hidden from assistive tech (the surrounding `role="status"` carries the
 * loading text). The pulse stops under reduced motion.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
