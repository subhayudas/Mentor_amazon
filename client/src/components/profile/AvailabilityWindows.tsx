import * as React from "react";
import { useTranslation } from "react-i18next";

import { AvailabilityStrip } from "@/components/AvailabilityStrip";
import { weekdayName, windowRange } from "@/components/profile/localized";
import type { AvailabilityRow } from "@/lib/availability";
import { cx } from "@/components/profile/styles";
import { cn } from "@/lib/utils";

/**
 * Typical availability (P0-4): the strip plus the mentor's windows listed in
 * the mentor's own zone — never converted, because the rows carry no zone —
 * under one honesty caption that also says whose time the windows are in.
 * The zone itself and its offset are stated once, in the header (F-30).
 * Renders nothing without rows.
 */
export function AvailabilityWindows({
  windows,
  mentorTz,
  headingLevel = "h3",
  className,
}: {
  windows: ReadonlyArray<AvailabilityRow>;
  mentorTz: string | null | undefined;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const Heading = headingLevel;

  if (windows.length === 0) return null;

  return (
    <section aria-labelledby="profile-availability" className={cn("flex flex-col gap-3", className)}>
      <Heading
        id="profile-availability"
        className={cx(
          headingLevel === "h2" ? "text-h2-sm text-foreground md:text-h2" : "text-caption text-muted-foreground",
        )}
      >
        {t("mentorProfile.availabilityTitle")}
      </Heading>
      <AvailabilityStrip rows={windows} mentorTz={mentorTz} caption={t("mentorProfile.availabilityCaption")} />
      <ul className="flex flex-col gap-1 text-body-sm text-foreground">
        {windows.map((window) => (
          <li key={`${window.day_of_week}-${window.start_time}`} className="flex items-baseline justify-between gap-4">
            <span>{weekdayName(window.day_of_week, lang)}</span>
            <span dir="ltr" className="inline-block tabular-nums">
              {windowRange(window.start_time, window.end_time, lang)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
