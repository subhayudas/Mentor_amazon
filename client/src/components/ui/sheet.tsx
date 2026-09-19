"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { useDirection } from "@/hooks/useDirection"
import { dialogCloseClassName } from "@/components/ui/dialog"

/**
 * Sheet (spec §2, P1-8, P1-28): a Radix Dialog anchored to an edge. `side`
 * accepts the logical `"start" | "end"` (resolved through `useDirection()`)
 * as well as the four physical values, which are mapped to the logical edge
 * for the current direction. Travel comes from the `sheet-in/out` keyframes
 * driven by `--sheet-x/--sheet-y`, so no physical slide utility is used.
 * Enter 240ms / exit 200ms on the drawer curve.
 */
const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-base data-[state=closed]:duration-fast ease-out",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-4 bg-card p-6 text-card-foreground shadow-elevated data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b [--sheet-y:-100%]",
        bottom: "inset-x-0 bottom-0 border-t [--sheet-y:100%]",
        start:
          "inset-y-0 start-0 h-full w-3/4 border-e sm:max-w-sm [--sheet-x:-100%] rtl:[--sheet-x:100%]",
        end:
          "inset-y-0 end-0 h-full w-3/4 border-s sm:max-w-sm [--sheet-x:100%] rtl:[--sheet-x:-100%]",
      },
    },
    defaultVariants: {
      side: "end",
    },
  }
)

export type SheetSide = "top" | "bottom" | "start" | "end" | "left" | "right"

/** Physical sides are mapped to the logical edge for the active direction. */
function resolveSide(side: SheetSide, isRTL: boolean): "top" | "bottom" | "start" | "end" {
  switch (side) {
    case "left":
      return isRTL ? "end" : "start"
    case "right":
      return isRTL ? "start" : "end"
    default:
      return side
  }
}

interface SheetContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>, "side">,
    Omit<VariantProps<typeof sheetVariants>, "side"> {
  side?: SheetSide
  /** Extra classes for the built-in close button (e.g. to align it with a custom header row). */
  closeClassName?: string
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "end", className, closeClassName, children, ...props }, ref) => {
  const { t } = useTranslation()
  const { isRTL } = useDirection()
  const logicalSide = resolveSide(side, isRTL)
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        data-side={logicalSide}
        className={cn(sheetVariants({ side: logicalSide }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className={cn(dialogCloseClassName, closeClassName)}>
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">{t("common.close")}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-2 pe-8 text-start", className)}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-h3 font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-body-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
