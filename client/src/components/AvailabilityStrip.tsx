import * as React from "react";
import { useTranslation } from "react-i18next";

import {
  type AvailabilityRow,
  summarizeAvailability,
  weekdayLabels,
} from "@/lib/availability";
import { cn } from "@/lib/utils";

/**
 * Weekly availability strip (P0-4, P1-9 ENG). Seven cells, Monday first
 * (fixed order for both locales, never `getWeekInfo`), labelled with the
 * locale's narrow weekday letters. A filled cell = navy background + white
 * letter, empty = muted (a 12:1 luminance difference, so state is not hue
 * alone). The whole strip is `role="img"` named by the summary sentence
 * ("Usually available Monday and Wednesday (mentor's time, Asia/Dubai)");
 * cells are `aria-hidden`. Renders nothing without rows — no fake
 * availability. The honesty caption is passed by the caller (profile only).
 */
export interface AvailabilityStripProps {
  rows: ReadonlyArray<Pick<AvailabilityRow, "day_of_week">> | undefined;
  /** IANA zone the windows are stated in (mentors_public.timezone). */
  mentorTz?: string | null;
  /** Translated caption shown under the cells (e.g. "Typical availability, self-reported — …"). */
  caption?: React.ReactNode;
  className?: string;
}

export function AvailabilityStrip({ rows, mentorTz, caption, className }: AvailabilityStripProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const summary = React.useMemo(() => summarizeAvailability(rows, mentorTz, lang), [rows, mentorTz, lang]);
  const letters = React.useMemo(() => weekdayLabels(lang, "narrow"), [lang]);

  if (!rows || rows.length === 0 || summary.dayNames.length === 0) return null;

  return (
    <figure className={cn("m-0", className)}>
      <div role="img" aria-label={summary.summaryText} className="flex gap-0.5">
        {summary.days.map((on, i) => (
          <span
            key={i}
            aria-hidden="true"
            data-on={on || undefined}
            className={cn(
              "grid size-5 place-items-center rounded-sm text-caption leading-none",
              on ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {letters[i]}
          </span>
        ))}
      </div>
      {caption && <figcaption className="mt-2 text-caption text-muted-foreground text-pretty">{caption}</figcaption>}
    </figure>
  );
}
