import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Filter chip (P1-6, C9): a real `<button aria-pressed>`. Unselected = white,
 * 1px `--input` border, navy text; selected = navy fill + white text + leading
 * Check, so state is never a 1.08:1 tint difference. Radius 6 (bordered
 * controls), `min-h-8`, `min-h-10` on touch. Colour-only transition (120ms) —
 * chips are high-frequency, so no motion. Long Arabic labels wrap; nothing is
 * fixed-width. Single-select groups may pass `role="radio"` inside a
 * `role="radiogroup"`; `aria-pressed` is then omitted automatically.
 */
export interface FilterChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onToggle"> {
  selected: boolean;
  onToggle?: (next: boolean) => void;
  /** Optional trailing count, already formatted. */
  count?: string;
}

export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(function FilterChip(
  { selected, onToggle, count, className, children, role, onClick, ...props },
  ref,
) {
  const isRadio = role === "radio";
  return (
    <button
      ref={ref}
      type="button"
      role={role}
      aria-pressed={isRadio ? undefined : selected}
      aria-checked={isRadio ? selected : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onToggle?.(!selected);
      }}
      className={cn(
        "inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-md border px-3 py-1 text-body-sm font-medium transition-colors duration-fast coarse:min-h-10",
        selected
          ? "border-secondary bg-secondary text-secondary-foreground hover:bg-brand-navy-700"
          : "border-input bg-card text-secondary hover:bg-muted",
        className,
      )}
      {...props}
    >
      {selected && <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
      <span className="min-w-0 text-start">{children}</span>
      {count && <span className={cn("tabular-nums", selected ? "text-secondary-foreground/80" : "text-muted-foreground")}>{count}</span>}
    </button>
  );
});
