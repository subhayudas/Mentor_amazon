import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * Tabs (spec §8): equal-width triggers (`flex-1`), sentence-case labels with
 * an optional icon. Default `underline` variant = 2px navy underline on the
 * active tab over a hairline; `pill` keeps the muted segmented look. The
 * list can be made sticky by the caller (`sticky top-14 z-30 bg-background`).
 * Arrow keys follow the DirectionProvider; no animation (high-frequency).
 *
 * `scrollable` (F-03/F-10): when a list has more tabs than the row can hold,
 * the list scrolls horizontally inside a wrapper (`overscroll-x-contain`, a
 * thin visible scrollbar, triggers at their natural width with a 24px peek
 * of the next one) and the active trigger is kept in view whenever it
 * changes, so it is never clipped. Use it for local state tabs (analytics);
 * the app-shell RouteTabs use a "More" menu instead.
 */
type TabsVariant = "underline" | "pill"

const TabsVariantContext = React.createContext<TabsVariant>("underline")

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant; scrollable?: boolean; wrapperClassName?: string }
>(({ className, variant = "underline", scrollable = false, wrapperClassName, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement | null>(null)
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [ref]
  )
  // Keep the active trigger visible inside the scroller (runs after every
  // render of the list; the query is one selector on a handful of nodes).
  React.useEffect(() => {
    if (!scrollable) return
    innerRef.current
      ?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  })
  const list = (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        ref={setRefs}
        className={cn(
          variant === "underline"
            ? "flex w-full items-stretch border-b border-border text-muted-foreground"
            : "inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
          scrollable && "w-max min-w-full pe-6 [&>[role=tab]]:shrink-0 [&>[role=tab]]:focus-visible:-outline-offset-2",
          className
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
  if (!scrollable) return list
  return (
    <div
      className={cn(
        "overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]",
        wrapperClassName
      )}
    >
      {list}
    </div>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors duration-fast disabled:pointer-events-none disabled:text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        variant === "underline"
          ? "-mb-px min-h-11 border-b-2 border-transparent py-2 hover:text-foreground data-[state=active]:border-secondary data-[state=active]:text-secondary"
          : "min-h-8 rounded-md py-1.5 hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4", className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
