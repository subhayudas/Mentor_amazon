import * as React from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_STOPS, RequestRail } from "@/components/RequestRail";
import { cn } from "@/lib/utils";

/**
 * The landing's product artifact (P1-13): a white radius-12 card titled
 * "How a session happens" holding the request rail with the three programme
 * stops. Replaces the old "How it works" section. On `lg+` it is the hero's
 * right column at `size="md"`; on phones the landing renders it after the
 * mentor preview as the same vertical list at `size="sm"` (P0-7 — a
 * separate composition, not the desktop card squeezed). `id="how-it-works"`
 * + `scroll-mt-16` so the hero's anchor lands under the sticky header (P1-29).
 */
export interface HowItHappensProps {
  size?: "md" | "sm";
  className?: string;
}

export function HowItHappens({ size = "md", className }: HowItHappensProps) {
  const { t } = useTranslation();
  const titleId = React.useId();
  const md = size === "md";
  return (
    <section
      id="how-it-works"
      aria-labelledby={titleId}
      className={cn(
        "scroll-mt-16 rounded-xl border border-border bg-card text-card-foreground",
        md ? "p-6 md:p-8" : "p-5",
        className,
      )}
    >
      <h2 id={titleId} className="text-h3 text-foreground">
        {t("common.rail.title")}
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground text-pretty">{t("landing.rail.lede")}</p>
      <RequestRail size={size} stops={DEFAULT_STOPS(t)} className={md ? "mt-6" : "mt-4"} />
    </section>
  );
}
