import * as React from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useDirection } from "@/hooks/useDirection";
import { cn } from "@/lib/utils";

/**
 * Outcome-led search box (spec §3/§5, P2-6, P2-7): a `role="search"` form with
 * a labelled input, leading Search icon, inset clear button (32px, radius 4 —
 * concentric with the radius-8 input) and an optional visible submit button.
 * `primaryAction` makes that submit the page's single orange fill (landing hero
 * only); everywhere else it is navy. Enter submits (implicit submission).
 * The input is `dir="auto"` once it has text so Arabic and English queries align; while empty it
 * inherits the page direction so the placeholder is never clipped at its start in RTL.
 * Callers own the behaviour: on `/` Enter navigates to `/mentors?q=`, on
 * `/mentors` filtering is live and Enter moves focus to the results heading.
 */
export interface SearchIntentProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClear?: () => void;
  /** Translated visible-hidden label and placeholder. */
  label: string;
  placeholder: string;
  /** Translated submit label; when omitted there is no visible submit button. */
  submitLabel?: string;
  /**
   * Render the submit as a 44px icon-only ghost button inset at the field's
   * end, named by `submitLabel` (phone hero: a visible way to search that is
   * not a second fill and does not steal the input's width).
   */
  iconOnlySubmit?: boolean;
  /** The submit is the page's orange primary (landing hero only). */
  primaryAction?: boolean;
  size?: "md" | "lg";
  /** Example chips rendered under the input (one reserved row; a snap scroller below `md`). */
  chips?: React.ReactNode;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id" | "type">;
}

export const SearchIntent = React.forwardRef<HTMLInputElement, SearchIntentProps>(function SearchIntent(
  {
    value,
    onChange,
    onSubmit,
    onClear,
    label,
    placeholder,
    submitLabel,
    iconOnlySubmit = false,
    primaryAction = false,
    size = "md",
    chips,
    className,
    id,
    autoFocus,
    inputProps,
  },
  ref,
) {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const generatedId = React.useId();
  const inputId = id ?? `search-intent-${generatedId}`;
  const innerRef = React.useRef<HTMLInputElement | null>(null);
  const setRefs = (node: HTMLInputElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
  };
  const hasSubmit = Boolean(submitLabel);
  const iconSubmit = hasSubmit && iconOnlySubmit;
  const lg = size === "lg";
  // The input is `dir="auto"`, so its own logical paddings would follow the
  // typed text's direction, not the page's. The icon and inset controls are
  // positioned by the PAGE direction, so the two paddings are resolved here
  // from it (the one deliberate physical value in this component).
  const padStart = lg ? 48 : 44;
  const padEnd = iconSubmit ? (value ? 92 : 56) : hasSubmit ? (value ? 152 : 112) : value ? 48 : 16;
  const padding = isRTL
    ? { paddingLeft: padEnd, paddingRight: padStart }
    : { paddingLeft: padStart, paddingRight: padEnd };

  const handleClear = () => {
    onChange("");
    onClear?.();
    innerRef.current?.focus();
  };

  return (
    <form
      role="search"
      className={cn("w-full", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="relative flex items-center">
        <Search
          className={cn("pointer-events-none absolute start-4 text-muted-foreground", lg ? "size-5" : "size-4")}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <input
          {...inputProps}
          ref={setRefs}
          id={inputId}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={autoFocus}
          dir={value ? "auto" : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          style={padding}
          className={cn(
            "w-full rounded-lg border border-input bg-card text-base text-foreground transition-colors duration-fast placeholder:text-muted-foreground",
            lg ? "h-12 md:h-14" : "h-11",
          )}
        />
        <div className={cn("absolute flex items-center gap-1", iconSubmit ? "end-0.5" : "end-2")}>
          {value && (
            <button
              type="button"
              onClick={handleClear}
              aria-label={t("common.clearSearch")}
              className="grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground coarse:after:absolute coarse:after:-inset-1.5 coarse:after:content-[''] relative"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
          {iconSubmit ? (
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={submitLabel}
              className="size-11 rounded-md text-secondary"
              data-testid="button-search-submit"
            >
              <ArrowRight className="rtl:-scale-x-100" strokeWidth={2} aria-hidden="true" />
            </Button>
          ) : (
            hasSubmit && (
              <Button type="submit" variant={primaryAction ? "primary" : "secondary"} size="md" className="rounded-sm" data-testid="button-search-submit">
                {submitLabel}
              </Button>
            )
          )}
        </div>
      </div>
      {chips && (
        // One reserved row (F-06): `min-h-8` (40 on touch) so the skeleton and
        // the loaded chips occupy the same height. Below `md` it is a snap
        // scroller that bleeds into the page gutter (`-mx-4 px-4`, the mentor
        // scroller's pattern) so an overflowing chip peeks at the viewport
        // edge instead of clipping flush with the column (F-24).
        <div className="-mx-4 mt-3 flex min-h-8 snap-x gap-2 overflow-x-auto px-4 pb-1 [scroll-padding-inline:1rem] [scrollbar-width:none] coarse:min-h-10 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
          {chips}
        </div>
      )}
    </form>
  );
});
