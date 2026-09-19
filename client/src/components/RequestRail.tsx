import * as React from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The request rail (P1-13, "Memorable idea"): MentorConnect's one visual
 * motif — a vertical three-stop ledger drawing the request-first flow
 * (send a request → the mentor replies → pick a time on their calendar link).
 *
 * Geometry: 2px navy line, stops filled `--brand-orange` for done/current
 * with a 2px navy ring, white for next; 12px stops on both sizes; md = 32px
 * gaps, sm = 20px gaps. No animation, no directional icons.
 *
 * A11y: an `<ol>` with `aria-current="step"` on the current stop, a Check
 * icon inside done stops and the state word in visually-hidden text, so the
 * orange fill (2.14:1 on white) never carries state alone. Labels come from
 * callers already translated; `DEFAULT_STOPS(t)` supplies the programme copy.
 */
export type RailStopState = "done" | "current" | "next";

export interface RailStop {
  label: React.ReactNode;
  description?: React.ReactNode;
  state: RailStopState;
}

export interface RequestRailProps {
  stops: RailStop[];
  size?: "md" | "sm";
  /** Accessible name for the list; defaults to `a11y.railLabel`. */
  ariaLabel?: string;
  className?: string;
}

const STATE_KEY: Record<RailStopState, string> = {
  done: "a11y.stepDone",
  current: "a11y.stepCurrent",
  next: "a11y.stepNext",
};

/** The three programme stops in UX copy (C18/P2-8); pass states to mark progress. */
export function DEFAULT_STOPS(
  t: TFunction,
  states: [RailStopState, RailStopState, RailStopState] = ["next", "next", "next"],
): RailStop[] {
  return [
    { label: t("common.rail.step1"), state: states[0] },
    { label: t("common.rail.step2"), state: states[1] },
    { label: t("common.rail.step3"), state: states[2] },
  ];
}

export function RequestRail({ stops, size = "md", ariaLabel, className }: RequestRailProps) {
  const { t } = useTranslation();
  const md = size === "md";
  return (
    <ol aria-label={ariaLabel ?? t("a11y.railLabel")} className={cn("flex flex-col", className)}>
      {stops.map((stop, index) => {
        const isLast = index === stops.length - 1;
        const filled = stop.state !== "next";
        return (
          <li
            key={index}
            aria-current={stop.state === "current" ? "step" : undefined}
            className={cn(
              "relative flex",
              md ? "gap-4 pb-8" : "gap-3 pb-5",
              isLast && "pb-0",
              // the rail line: from this stop down to the next one
              !isLast && "before:absolute before:top-3 before:bottom-0 before:w-0.5 before:bg-secondary",
              !isLast && "before:start-[5px]",
            )}
          >
            <span
              aria-hidden="true"
              data-state={stop.state}
              className={cn(
                "relative z-[1] grid shrink-0 place-items-center rounded-full ring-2 ring-secondary",
                "mt-1.5 size-3",
                filled ? "bg-brand-orange text-secondary" : "bg-card",
              )}
            >
              {stop.state === "done" && (
                <Check className="size-2" strokeWidth={3.5} />
              )}
            </span>
            <div className="min-w-0">
              <p className={cn("text-foreground", md ? "text-h3" : "text-body-sm font-medium")}>
                <span className="sr-only">{t(STATE_KEY[stop.state])}: </span>
                {stop.label}
              </p>
              {stop.description && (
                <p className={cn("mt-1 text-muted-foreground text-pretty", md ? "text-body-sm" : "text-caption")}>
                  {stop.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
