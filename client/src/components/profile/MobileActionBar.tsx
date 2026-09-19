import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { RequestStatusCard } from "@/components/booking/RequestStatusCard";
import type { RequestState } from "@/components/booking/requestState";
import { textLinkClass } from "@/components/profile/styles";

/**
 * Mobile bottom bar (P1-17, P1-18, P1-30, F-09): fixed to the bottom edge
 * with safe-area padding and a hairline, carrying the single 44px button —
 * or the "Not accepting requests" text + "Find similar mentors" link, or the
 * compact request status, whose one action follows `railStatesFor`
 * ("Choose a time" once accepted with a link). Under `max-height: 520px` it
 * sits in the flow so at most two sticky bars ever share a short viewport
 * (the page adds `pb-24`). Rendered only below `lg`, where the request card
 * is not.
 */
export function MobileActionBar({
  mentorName,
  request,
  signedIn,
  similarHref,
  onRequest,
  onChooseTime,
  registerReturnFocus,
}: {
  mentorName: string;
  request: RequestState;
  signedIn: boolean;
  similarHref: string;
  onRequest: () => void;
  onChooseTime: () => void;
  registerReturnFocus: (element: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="mobile-action-bar"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 [@media(max-height:520px)]:static [@media(max-height:520px)]:mt-8 [@media(max-height:520px)]:rounded-lg [@media(max-height:520px)]:border"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        {request.kind === "cta" && (
          <div data-testid="booking-section">
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
        {request.kind === "unavailable" && (
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="text-body-sm font-medium text-foreground">{t("mentorProfile.notAcceptingShort")}</span>
            <Link href={similarHref} className={textLinkClass}>
              {t("mentorProfile.findSimilar")}
            </Link>
          </div>
        )}
        {request.kind === "sent" && (
          <RequestStatusCard
            variant="compact"
            request={request}
            mentorName={mentorName}
            signedIn={signedIn}
            onChooseTime={onChooseTime}
          />
        )}
      </div>
    </div>
  );
}
