import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Filter chip (P1-6, C9): a real `<button aria-pressed>`. Unselected = white,
 * 1px `--input` border, navy text; selected = navy fill + white text + leading
 * Check, so state is never a 1.08:1 tint difference. Radius 6 (bordered
 * controls), `min-h-8`, `min-h-10` on touch. Colour-only transition (120ms) —
 * chips are high-frequency, so no motion. Long Arabic labels wrap; nothing is
 * fixed-width.
 *
 * Single-select groups use `ChipRadioGroup` + `ChipRadio` below (F-17): the
 * same chip styling on Radix RadioGroup items, so the group is one Tab stop
 * with direction-aware arrow keys and real `radio` semantics — never a row of
 * buttons that merely claim `role="radio"`.
 */
export function filterChipClass(selected: boolean, className?: string) {
  return cn(
    "inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-md border px-3 py-1 text-body-sm font-medium transition-colors duration-fast coarse:min-h-10",
    selected
      ? "border-secondary bg-secondary text-secondary-foreground hover:bg-brand-navy-700"
      : "border-input bg-card text-secondary hover:bg-muted",
    className,
  );
}

function ChipContent({ selected, count, children }: { selected: boolean; count?: string; children: React.ReactNode }) {
  return (
    <>
      {selected && <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
      <span className="min-w-0 text-start">{children}</span>
      {count && <span className={cn("tabular-nums", selected ? "text-secondary-foreground/80" : "text-muted-foreground")}>{count}</span>}
    </>
  );
}

export interface FilterChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onToggle" | "role"> {
  selected: boolean;
  onToggle?: (next: boolean) => void;
  /** Optional trailing count, already formatted. */
  count?: string;
}

export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(function FilterChip(
  { selected, onToggle, count, className, children, onClick, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onToggle?.(!selected);
      }}
      className={filterChipClass(selected, className)}
      {...props}
    >
      <ChipContent selected={selected} count={count}>
        {children}
      </ChipContent>
    </button>
  );
});

/**
 * Single-select chip group: Radix RadioGroup (roving tabindex, arrow keys that
 * follow the DirectionProvider, `role="radiogroup"` / `role="radio"` with
 * `aria-checked`). Pass `aria-label` or `aria-labelledby`; `value` /
 * `onValueChange` as on a Select.
 */
export const ChipRadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function ChipRadioGroup({ className, orientation = "horizontal", ...props }, ref) {
  return <RadioGroupPrimitive.Root ref={ref} orientation={orientation} loop className={cn("flex flex-wrap gap-2", className)} {...props} />;
});

export interface ChipRadioProps extends Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, "asChild"> {
  /** Optional trailing count, already formatted. */
  count?: string;
}

/** One chip in a `ChipRadioGroup`; reads its checked state from the group. */
export const ChipRadio = React.forwardRef<React.ElementRef<typeof RadioGroupPrimitive.Item>, ChipRadioProps>(function ChipRadio(
  { className, count, children, ...props },
  ref,
) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(filterChipClass(false, className), "group data-[state=checked]:border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground data-[state=checked]:hover:bg-brand-navy-700")}
      {...props}
    >
      <RadioGroupPrimitive.Indicator asChild>
        <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      </RadioGroupPrimitive.Indicator>
      <span className="min-w-0 text-start">{children}</span>
      {count && <span className="tabular-nums text-muted-foreground group-data-[state=checked]:text-secondary-foreground/80">{count}</span>}
    </RadioGroupPrimitive.Item>
  );
});
