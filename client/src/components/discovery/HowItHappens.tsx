import * as React from "react";
import { useTranslation } from "react-i18next";

import { railStatesFor } from "@/components/booking/requestState";
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
 *
 * States come from `railStatesFor` (F-09), the one request-state → rail
 * mapping: the landing has no request of its own, so the mapping yields three
 * "next" stops, and the reader is standing at stop 1 (about to send), which
 * the hero marks `current` so the artifact shows its state vocabulary on
 * first paint (F-21). `signedIn` picks the stop-2 wording in `DEFAULT_STOPS`,
 * the same place the profile rail and the dialog decide it (F-29).
 */
export interface HowItHappensProps {
  size?: "md" | "sm";
  /** The viewer has a session: stop 2 says the reply is under Bookings instead of "sign in with the same email". */
  signedIn?: boolean;
  className?: string;
}

export function HowItHappens({ size = "md", signedIn = false, className }: HowItHappensProps) {
  const { t } = useTranslation();
  const titleId = React.useId();
  const md = size === "md";
  const { states } = railStatesFor({ kind: "cta" });
  const stops = DEFAULT_STOPS(t, ["current", states[1], states[2]], { signedIn });
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
      <RequestRail size={size} stops={stops} className={md ? "mt-6" : "mt-4"} />
    </section>
  );
}
