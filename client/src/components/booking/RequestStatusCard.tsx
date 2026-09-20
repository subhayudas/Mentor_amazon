import * as React from "react";
import { Link } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { textLinkClass } from "@/components/profile/styles";
import { railStatesFor, type RequestState } from "@/components/booking/requestState";
import { formatRelativeDay } from "@/lib/format";
import { ROUTES, loginHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type SentRequestState = Extract<RequestState, { kind: "sent" }>;

export interface RequestStatusCardProps {
  request: SentRequestState;
  mentorName: string;
  signedIn: boolean;
  /** Opens the mentor's Cal.com embed; rendered as the primary action once the request is accepted with a link. */
  onChooseTime?: () => void;
  /** `block` = the anchored status (rail / under the header); `compact` = the mobile bar. */
  variant?: "block" | "compact";
  /** Receives the block's first focusable so a closing dialog can return focus to it (P1-21). */
  firstLinkRef?: (element: HTMLElement | null) => void;
  className?: string;
}

/**
 * The anchored request state that replaces the primary button once a
 * request exists (P1-21, F-09). A real booking row shows its live
 * `StatusBadge` ("Awaiting mentor", "Accepted", "Scheduled"); the
 * localStorage memory shows "Request sent". The actions follow
 * `railStatesFor`: accepted with a calendar link → the one action the mentee
 * owes, "Choose a time" (the page's orange fill, since the request button is
 * gone); otherwise anonymous requesters are told to sign in with the same
 * email and signed-in users get "View in bookings". "Send another request"
 * is never offered here: this block only renders while a request is open, and
 * once it closes the primary button returns.
 */
export function RequestStatusCard({
  request,
  mentorName,
  signedIn,
  onChooseTime,
  variant = "block",
  firstLinkRef,
  className,
}: RequestStatusCardProps) {
  const { t, i18n } = useTranslation();
  const when = formatRelativeDay(request.sentAt, i18n.language);
  const progress = railStatesFor(request);
  const chooseTime = progress.canChooseTime && Boolean(onChooseTime);
  // The wrapper carries the caption role: `cn()` inside Badge drops `text-caption` next to the tone colour.
  const badge = (
    <span className="inline-flex text-caption">
      {request.status ? (
        <StatusBadge status={request.status} />
      ) : (
        <Badge tone="warning">
          <Clock aria-hidden="true" strokeWidth={2} />
          {t("bookingRequest.status.sent")}
        </Badge>
      )}
    </span>
  );
  const followLink = signedIn ? (
    <Link
      ref={chooseTime ? undefined : firstLinkRef}
      href={ROUTES.menteeBookings}
      className={textLinkClass}
      data-testid="link-view-bookings"
    >
      {t("bookingRequest.status.viewInBookings")}
    </Link>
  ) : (
    <Link
      ref={firstLinkRef}
      href={loginHref(ROUTES.menteeBookings)}
      className={textLinkClass}
      data-testid="link-sign-in-to-follow"
    >
      {t("bookingRequest.status.signIn")}
    </Link>
  );

  if (variant === "compact") {
    // The block under the header owns `booking-section` and the badge; the
    // bar carries only the action so the status is said once per page (N-03).
    return (
      <div data-state="sent" className={cn("flex min-h-11 items-center justify-end gap-3", className)}>
        {chooseTime ? (
          <Button type="button" size="lg" className="w-full" onClick={onChooseTime} data-testid="button-choose-time">
            {t("dashboardV2.actions.chooseTime")}
          </Button>
        ) : (
          followLink
        )}
      </div>
    );
  }

  return (
    <div data-testid="booking-section" data-state="sent" className={cn("flex flex-col gap-2", className)}>
      <div>{badge}</div>
      <p className="text-body-sm text-foreground">
        <Trans
          i18nKey="bookingRequest.status.sentFrom"
          values={{ when, email: request.email }}
          components={{ email: <bdi dir="ltr" /> }}
        />
      </p>
      {!signedIn && (
        <p className="text-body-sm text-muted-foreground text-pretty">
          <Trans i18nKey="bookingRequest.status.anonHint" values={{ name: mentorName }} components={{ name: <bdi /> }} />
        </p>
      )}
      {chooseTime && (
        <Button
          ref={firstLinkRef}
          type="button"
          size="lg"
          className="mt-1 w-full"
          onClick={onChooseTime}
          data-testid="button-choose-time"
        >
          {t("dashboardV2.actions.chooseTime")}
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">{followLink}</div>
    </div>
  );
}
