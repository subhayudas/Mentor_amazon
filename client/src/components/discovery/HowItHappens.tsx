import * as React from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_STOPS, RequestRail } from "@/components/RequestRail";
import { cn } from "@/lib/utils";

/**
 * The landing's product artifact (P1-13): a white radius-12 card titled
 * "How a session happens" holding the request rail at `size="md"` with the
 * three programme stops. Replaces the old "How it works" section; on phones
 * it renders after the mentor preview as the same vertical list (P0-7).
 * `id="how-it-works"` + `scroll-mt-16` so the hero's anchor lands under the
 * sticky header (P1-29).
 */
export function HowItHappens({ className }: { className?: string }) {
  const { t } = useTranslation();
  const titleId = React.useId();
  return (
    <section
      id="how-it-works"
      aria-labelledby={titleId}
      className={cn("scroll-mt-16 rounded-xl border border-border bg-card p-6 text-card-foreground md:p-8", className)}
    >
      <h2 id={titleId} className="text-h3 text-foreground">
        {t("common.rail.title")}
      </h2>
      <p className="mt-1 text-body-sm text-muted-foreground text-pretty">{t("landing.rail.lede")}</p>
      <RequestRail size="md" stops={DEFAULT_STOPS(t)} className="mt-6" />
    </section>
  );
}
