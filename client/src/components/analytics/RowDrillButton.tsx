import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Row-header drill toggle inside a chart's exact-value table (F-32/F-34): the
 * keyboard twin of a bar click. A real `<button aria-pressed>` at least 24px
 * tall (WCAG 2.5.8; `min-h-10` on touch), navy text with an always-visible
 * hairline underline that darkens on hover and while pressed — the
 * non-colour cue — and NO focus ring of its own: the global `:focus-visible`
 * navy outline with its 2px offset is the one focus idiom on the page.
 */
export interface RowDrillButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  pressed: boolean;
}

export const RowDrillButton = React.forwardRef<HTMLButtonElement, RowDrillButtonProps>(function RowDrillButton(
  { pressed, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-6 items-center rounded-sm py-0.5 text-start text-secondary underline decoration-border underline-offset-4 transition-colors duration-fast hover:decoration-secondary coarse:min-h-10",
        pressed && "font-medium decoration-secondary",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
