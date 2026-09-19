import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * Tabs (spec §8): equal-width triggers (`flex-1`), sentence-case labels with
 * an optional icon. Default `underline` variant = 2px navy underline on the
 * active tab over a hairline; `pill` keeps the muted segmented look. The
 * list can be made sticky by the caller (`sticky top-14 z-30 bg-background`).
 * Arrow keys follow the DirectionProvider; no animation (high-frequency).
 */
type TabsVariant = "underline" | "pill"

const TabsVariantContext = React.createContext<TabsVariant>("underline")

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "underline", ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        variant === "underline"
          ? "flex w-full items-stretch border-b border-border text-muted-foreground"
          : "inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  </TabsVariantContext.Provider>
))
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
