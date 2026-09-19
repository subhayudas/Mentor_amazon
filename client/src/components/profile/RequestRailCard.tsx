import * as React from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_STOPS, RequestRail } from "@/components/RequestRail";
import { Button } from "@/components/ui/button";
import { RequestStatusCard } from "@/components/booking/RequestStatusCard";
import type { RequestState } from "@/components/booking/requestState";
import { AvailabilityBadge } from "@/components/profile/AvailabilityBadge";
import { AvailabilityWindows } from "@/components/profile/AvailabilityWindows";
import { TimeZoneNote } from "@/components/profile/TimeZoneNote";
import { UnavailableBlock } from "@/components/profile/UnavailableBlock";
import type { AvailabilityRow } from "@/lib/availability";
import type { PublicMentor } from "@/lib/database";

export interface RequestSlotProps {
  mentor: PublicMentor;
  mentorName: string;
  request: RequestState;
  signedIn: boolean;
  similarHref: string;
  onRequest: () => void;
  onSendAnother: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Callback ref for whichever element a closing dialog should focus. */
  registerReturnFocus: (element: HTMLElement | null) => void;
}

/**
 * Desktop request card (P1-17/P1-18/P1-21): sticky `top-20`, white, radius
 * 12, p-6. Status line → request rail (three `next` stops) → time-zone note →
 * the one primary button, or the anchored status block, or (not accepting)
 * no button at all. The availability strip and windows sit last and only
 * when rows exist. The primary button is the page's single orange fill.
 */
export function RequestRailCard({
  mentor,
  mentorName,
  request,
  signedIn,
  similarHref,
  onRequest,
  onSendAnother,
  registerReturnFocus,
  windows,
}: RequestSlotProps & { windows: ReadonlyArray<AvailabilityRow> }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="profile-request-card"
      className="rounded-xl border border-border bg-card p-6"
      data-testid="request-card"
    >
      <h2 id="profile-request-card" className="sr-only">
        {t("mentorProfile.requestSession")}
      </h2>

      {request.kind === "unavailable" ? (
        <UnavailableBlock mentorName={mentorName} similarHref={similarHref} testId="mentor-unavailable" />
      ) : (
        <div>
          <AvailabilityBadge available={mentor.is_available} />
        </div>
      )}

      <p className="mt-5 text-caption text-muted-foreground">{t("common.rail.title")}</p>
      <RequestRail size="sm" stops={DEFAULT_STOPS(t)} className="mt-3" />

      {request.kind !== "unavailable" && (
        <TimeZoneNote mentorName={mentorName} mentorTz={mentor.timezone} className="mt-5" />
      )}

      {request.kind === "cta" && (
        <div data-testid="booking-section" className="mt-4">
          <Button
            ref={registerReturnFocus}
            type="button"
            size="lg"
            className="w-full"
            onClick={onRequest}
            data-testid="button-request-session"
          >
            {t("mentorProfile.requestSession")}
          </Button>
        </div>
      )}
      {request.kind === "sent" && (
        <RequestStatusCard
          request={request}
          mentorName={mentorName}
          signedIn={signedIn}
          canSendAnother={mentor.is_available}
          onSendAnother={onSendAnother}
          firstLinkRef={registerReturnFocus}
          className="mt-4"
        />
      )}

      {windows.length > 0 && (
        <AvailabilityWindows
          windows={windows}
          mentorTz={mentor.timezone}
          headingLevel="h3"
          className="mt-6 border-t border-border pt-5"
        />
      )}
    </section>
  );
}
