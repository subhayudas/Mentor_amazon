import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * ResponsiveDialog (ENG P0-3 + A11Y handlers): a thin wrapper over Radix
 * Dialog ONLY — one focus trap, one state tree and one testid across
 * breakpoints. With `fullscreenOnMobile`, below `md` the content fills the
 * viewport (`inset-0 h-[100dvh]`, no radius) with a scrolling body and a
 * footer pinned above the home indicator; on `md+` it is the centred dialog.
 *
 * A11y contract:
 * - Title and Description are always rendered (Description may be sr-only via
 *   `hideDescription`) so the dialog is named and described.
 * - `initialFocusRef` receives focus on open; `returnFocusRef` on close (use it
 *   for programmatic opens that have no trigger).
 * - When `dirty`, Escape, outside pointer-down and the close button do NOT
 *   close: `onDiscard` fires instead and the caller opens its AlertDialog
 *   ("Discard this request?"); the caller then calls `onOpenChange(false)`.
 * - The body region scrolls (`overflow-y-auto overscroll-contain`), never the
 *   page behind it. While more content sits below the fold the footer draws a
 *   scroll-edge shadow (`data-scroll-edge`), so a line cut by the footer never
 *   appears without a cue (F-07).
 */
export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  /** Keep the description for assistive tech only. */
  hideDescription?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
  fullscreenOnMobile?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
  /** Unsaved input present: dismiss attempts call `onDiscard` instead of closing. */
  dirty?: boolean;
  onDiscard?: () => void;
  /** `data-testid` for the dialog content (e.g. `dialog-booking-request`). */
  testId?: string;
  /** Extra classes for the content surface (e.g. `md:top-[10vh] md:translate-y-0`). */
  className?: string;
  bodyClassName?: string;
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  hideDescription = false,
  children,
  footer,
  size = "md",
  fullscreenOnMobile = false,
  initialFocusRef,
  returnFocusRef,
  dirty = false,
  onDiscard,
  testId,
  className,
  bodyClassName,
}: ResponsiveDialogProps) {
  const askDiscard = React.useCallback(() => {
    onDiscard?.();
  }, [onDiscard]);

  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = React.useState(false);
  React.useEffect(() => {
    const el = bodyRef.current;
    if (!open || !el) return;
    const update = () => setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    Array.from(el.children).forEach((child) => observer?.observe(child));
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [open, children]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && dirty) {
        askDiscard();
        return;
      }
      onOpenChange(next);
    },
    [dirty, askDiscard, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid={testId}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          size === "lg" ? "max-w-2xl" : "max-w-lg",
          fullscreenOnMobile &&
            "max-md:inset-0 max-md:h-[100dvh] max-md:max-h-none max-md:w-full max-md:max-w-none max-sm:max-w-none max-md:rounded-none max-md:border-0",
          className,
        )}
        onOpenAutoFocus={(event) => {
          if (initialFocusRef?.current) {
            event.preventDefault();
            initialFocusRef.current.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (dirty) {
            event.preventDefault();
            askDiscard();
          }
        }}
        onPointerDownOutside={(event) => {
          if (dirty) {
            event.preventDefault();
            askDiscard();
          }
        }}
      >
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={cn(hideDescription && "sr-only")}>{description}</DialogDescription>
        </DialogHeader>
        <div ref={bodyRef} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1", bodyClassName)}>
          {children}
        </div>
        {footer && (
          <div
            data-scroll-edge={moreBelow || undefined}
            className={cn(
              "shrink-0 border-t border-border px-6 pt-4 pb-6 transition-shadow duration-fast max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
              moreBelow && "shadow-[0_-8px_16px_-12px_rgba(15,17,17,0.18)]",
            )}
          >
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
