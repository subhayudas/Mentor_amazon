import * as React from "react";
import { useTranslation } from "react-i18next";

import { RequestRail } from "@/components/RequestRail";
import { Button } from "@/components/ui/button";
import { RequestStatusCard } from "@/components/booking/RequestStatusCard";
import { railStopsFor, type RequestState } from "@/components/booking/requestState";
import { AvailabilityBadge } from "@/components/profile/AvailabilityBadge";
import { AvailabilityWindows } from "@/components/profile/AvailabilityWindows";
import { UnavailableBlock } from "@/components/profile/UnavailableBlock";
import { profileCardClass } from "@/components/profile/styles";
import type { AvailabilityRow } from "@/lib/availability";
import type { PublicMentor } from "@/lib/database";
import { bidi } from "@/lib/format";

export interface RequestSlotProps {
  mentor: PublicMentor;
  mentorName: string;
  request: RequestState;
  signedIn: boolean;
  similarHref: string;
  onRequest: () => void;
  /** Opens the mentor's Cal.com embed for an accepted request that carries a link. */
  onChooseTime: () => void;
  /** Callback ref for whichever element a closing dialog should focus. */
  registerReturnFocus: (element: HTMLElement | null) => void;
}

/**
 * Desktop request card (P1-17/P1-18/P1-21/F-09): sticky `top-20`, white,
 * radius 12, p-6. Status badge (the page's only one on desktop — the header
 * hides its copy) → the request rail drawn from `railStopsFor(request)` so
 * it advances with the request → the one primary button, or the anchored
 * status block, or (not accepting) no button at all. The availability strip
 * and windows sit last and only when rows exist. The time zone lives in the
 * header's meta line, not here (F-30).
 */
export function RequestRailCard({
  mentor,
  mentorName,
  request,
  signedIn,
  similarHref,
  onRequest,
  onChooseTime,
  registerReturnFocus,
  windows,
}: RequestSlotProps & { windows: ReadonlyArray<AvailabilityRow> }) {
  const { t } = useTranslation();
  const sent = request.kind === "sent";
  const { stops } = railStopsFor(t, request, { signedIn, name: bidi(mentorName) });
  return (
    <section aria-labelledby="profile-request-card" className={profileCardClass} data-testid="request-card">
      <h2 id="profile-request-card" className="sr-only">
        {t("mentorProfile.requestSession")}
      </h2>

      {!mentor.is_available ? (
        <UnavailableBlock mentorName={mentorName} similarHref={similarHref} testId="mentor-unavailable" />
      ) : (
        <div>
          <AvailabilityBadge available={mentor.is_available} />
        </div>
      )}

      <p className="mt-5 text-caption text-muted-foreground">
        {sent ? t("dashboardV2.rail.title") : t("common.rail.title")}
      </p>
      <RequestRail size="sm" stops={stops} className="mt-3" />

      {request.kind === "cta" && (
        <div data-testid="booking-section" className="mt-5">
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
          onChooseTime={onChooseTime}
          firstLinkRef={registerReturnFocus}
          className="mt-5 border-t border-border pt-5"
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
