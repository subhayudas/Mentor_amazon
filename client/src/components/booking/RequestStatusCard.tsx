import * as React from "react";
import { Link } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { textLinkClass } from "@/components/profile/styles";
import type { RequestState } from "@/components/booking/requestState";
import { formatRelativeDay } from "@/lib/format";
import { ROUTES, loginHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type SentRequestState = Extract<RequestState, { kind: "sent" }>;

export interface RequestStatusCardProps {
  request: SentRequestState;
  mentorName: string;
  signedIn: boolean;
  /** The mentor still accepts requests, so "Send another request" is offered. */
  canSendAnother: boolean;
  onSendAnother: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** `block` = the anchored status (rail / under the header); `compact` = the mobile bar. */
  variant?: "block" | "compact";
  /** Receives the block's first link so a closing dialog can return focus to it (P1-21). */
  firstLinkRef?: (element: HTMLAnchorElement | null) => void;
  className?: string;
}

/**
 * The anchored "Request sent" state that replaces the primary button once a
 * request exists (P1-21). A real booking row shows its live `StatusBadge`
 * ("Awaiting mentor", "Accepted", "Scheduled"); the localStorage memory
 * shows "Request sent". Anonymous requesters are told to sign in with the
 * same email, signed-in users get "View in bookings"; both may send another
 * request while the mentor is accepting (the database rate limit still applies).
 */
export function RequestStatusCard({
  request,
  mentorName,
  signedIn,
  canSendAnother,
  onSendAnother,
  variant = "block",
  firstLinkRef,
  className,
}: RequestStatusCardProps) {
  const { t, i18n } = useTranslation();
  const when = formatRelativeDay(request.sentAt, i18n.language);
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
  const primaryLink = signedIn ? (
    <Link ref={firstLinkRef} href={ROUTES.menteeBookings} className={textLinkClass} data-testid="link-view-bookings">
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
    // The block under the header owns `booking-section`; the bar only mirrors it.
    return (
      <div data-state="sent" className={cn("flex min-h-11 items-center justify-between gap-3", className)}>
        {badge}
        {primaryLink}
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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {primaryLink}
        {canSendAnother && (
          <button type="button" onClick={onSendAnother} className={textLinkClass} data-testid="button-send-another">
            {t("bookingRequest.status.sendAnother")}
          </button>
        )}
      </div>
    </div>
  );
}
