import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { CalendarPlus, Star } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatDateTime, formatNumber, formatRelativeDay, viewerTimeZone } from "@/lib/format";
import { credentialLine, initialsOf, localizedField } from "@/lib/localized";
import { isConfirmedPast, isConfirmedWithoutTime, type BookingWithMentor } from "@/lib/menteeBookings";
import { cn } from "@/lib/utils";

/**
 * One booking row for the mentee (P1-24): status as text + colour through
 * `StatusBadge`, the mentor's identity, the time in the viewer's zone with a
 * zone label, and exactly the actions the DB allows for that status.
 * The "Choose a time" fill is orange only when `primary` (one per viewport);
 * further accepted rows get the navy secondary fill.
 */
export interface BookingRowActions {
  onChooseTime: (booking: BookingWithMentor) => void;
  onWithdraw: (booking: BookingWithMentor) => void;
  onCancelRequest: (booking: BookingWithMentor) => void;
  onCancelSession: (booking: BookingWithMentor) => void;
  onView: (booking: BookingWithMentor) => void;
  onRate: (booking: BookingWithMentor) => void;
  /** Row id currently mid-mutation (buttons show a spinner). */
  busyId?: string | null;
}

export interface BookingRowProps extends BookingRowActions {
  booking: BookingWithMentor;
  /** Orange fill for "Choose a time" (the page's one primary action). */
  primary?: boolean;
  highlighted?: boolean;
  /** Hide the goal line (Overview lists). */
  compact?: boolean;
  className?: string;
}

export function MentorAvatar({ mentor, size = "md" }: { mentor?: BookingWithMentor["mentor"]; size?: "sm" | "md" | "lg" }) {
  const { i18n } = useTranslation();
  const name = localizedField(mentor, "name", i18n.language) || mentor?.name || "";
  return (
    <Avatar className={cn(size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10")}>
      {mentor?.photo_url ? <AvatarImage src={mentor.photo_url} alt="" /> : null}
      <AvatarFallback className={cn("font-medium text-foreground", size === "sm" ? "text-caption" : "text-body-sm")}>
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** "3 Oct 2026, 18:00 · Your time (Asia/Dubai)" or the honest fallback for a missing time. */
export function useSessionTime() {
  const { t, i18n } = useTranslation();
  const tz = viewerTimeZone();
  return {
    tz,
    format: (iso: string | null | undefined) => (iso ? formatDateTime(iso, i18n.language, tz) : null),
    zoneLabel: t("dashboardV2.time.yourZone", { tz }),
  };
}

export function BookingRow({
  booking,
  primary = false,
  highlighted = false,
  compact = false,
  className,
  onChooseTime,
  onWithdraw,
  onCancelRequest,
  onCancelSession,
  onView,
  onRate,
  busyId,
}: BookingRowProps) {
  const { t, i18n } = useTranslation();
  const { format, zoneLabel } = useSessionTime();
  const mentor = booking.mentor;
  const name = localizedField(mentor, "name", i18n.language) || t("dashboardV2.row.unknownMentor");
  const credential = credentialLine(mentor, i18n.language);
  const busy = busyId === booking.id;
  const hasLink = !!mentor?.cal_link;
  const scheduled = format(booking.scheduled_at);
  const completed = format(booking.completed_at);

  // Meta line by status: what the person needs to know before acting. Every
  // clock time carries the viewer's zone label; day-level facts stay dates.
  const withZone = (value: string | null, emphasise = false) =>
    value ? (
      <>
        <span className={emphasise ? "text-foreground" : undefined}>{value}</span>
        <span className="text-muted-foreground"> · {zoneLabel}</span>
      </>
    ) : null;
  let meta: ReactNode = null;
  let note: ReactNode = null;
  switch (booking.status) {
    case "pending":
      meta = t("dashboardV2.row.sent", { when: formatRelativeDay(booking.created_at, i18n.language) });
      break;
    case "accepted":
      meta = hasLink
        ? t("dashboardV2.row.acceptedChoose")
        : t("dashboardV2.row.acceptedNoLink", { name });
      break;
    case "confirmed":
      if (isConfirmedWithoutTime(booking)) {
        meta = t("dashboardV2.row.timeNotRecorded");
      } else {
        meta = withZone(scheduled, true);
        if (isConfirmedPast(booking)) note = t("dashboardV2.row.notMarkedComplete");
      }
      break;
    case "completed":
      meta = withZone(completed ?? scheduled) ?? t("dashboardV2.row.timeNotRecorded");
      break;
    case "canceled":
    case "rejected":
      meta = formatDate(booking.canceled_at ?? booking.responded_at ?? booking.created_at, i18n.language);
      break;
  }

  return (
    <article
      data-testid={`card-booking-${booking.id}`}
      data-booking-card={booking.id}
      data-status={booking.status}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-shadow duration-slow scroll-mt-32",
        highlighted && "ring-2 ring-brand-orange ring-offset-2 ring-offset-background",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <MentorAvatar mentor={mentor} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-body font-medium text-foreground">
              <bdi>{name}</bdi>
            </h3>
            <StatusBadge status={booking.status} />
          </div>
          {credential && <p className="text-body-sm text-muted-foreground">{credential}</p>}
          {meta && <p className="mt-1 text-body-sm text-muted-foreground tabular-nums">{meta}</p>}
          {note && <p className="text-caption text-muted-foreground">{note}</p>}
          {!compact && booking.goal && (
            <p dir="auto" className="mt-2 line-clamp-2 text-body-sm text-foreground text-pretty">
              {booking.goal}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {booking.status === "pending" && (
          <>
            <Button variant="outline" size="sm" onClick={() => onView(booking)} data-testid={`button-view-request-${booking.id}`}>
              {t("dashboardV2.actions.viewRequest")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={busy}
              onClick={() => onWithdraw(booking)}
              data-testid={`button-withdraw-${booking.id}`}
            >
              {t("dashboardV2.actions.withdraw")}
            </Button>
          </>
        )}
        {booking.status === "accepted" && (
          <>
            {hasLink && (
              <Button
                variant={primary ? "primary" : "secondary"}
                size="sm"
                className="max-md:h-11 max-md:px-5"
                onClick={() => onChooseTime(booking)}
                data-testid={`button-schedule-booking-${booking.id}`}
              >
                <CalendarPlus aria-hidden="true" />
                {t("dashboardV2.actions.chooseTime")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onView(booking)} data-testid={`button-view-request-${booking.id}`}>
              {t("dashboardV2.actions.viewRequest")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={busy}
              onClick={() => onCancelRequest(booking)}
              data-testid={`button-cancel-request-${booking.id}`}
            >
              {t("dashboardV2.actions.cancelRequest")}
            </Button>
          </>
        )}
        {booking.status === "confirmed" && (
          <>
            <Button variant="outline" size="sm" onClick={() => onView(booking)} data-testid={`button-view-request-${booking.id}`}>
              {t("dashboardV2.actions.viewRequest")}
            </Button>
            {!isConfirmedPast(booking) && (
              <Button
                variant="ghost"
                size="sm"
                loading={busy}
                onClick={() => onCancelSession(booking)}
                data-testid={`button-cancel-session-${booking.id}`}
              >
                {t("dashboardV2.actions.cancelSession")}
              </Button>
            )}
          </>
        )}
        {booking.status === "completed" && (
          <>
            {booking.mentee_rating ? (
              <Button variant="outline" size="sm" onClick={() => onRate(booking)} data-testid={`button-view-feedback-${booking.id}`}>
                <Star className="fill-brand-orange text-brand-orange" aria-hidden="true" />
                <span dir="ltr" className="tabular-nums">
                  {t("dashboardV2.row.rated", { value: formatNumber(booking.mentee_rating, i18n.language) })}
                </span>
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onRate(booking)} data-testid={`button-give-feedback-${booking.id}`}>
                {t("dashboardV2.actions.rateSession")}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onView(booking)} data-testid={`button-view-request-${booking.id}`}>
              {t("dashboardV2.actions.viewRequest")}
            </Button>
          </>
        )}
        {(booking.status === "canceled" || booking.status === "rejected") && mentor && (
          <Button asChild variant="outline" size="sm" data-testid={`button-request-again-${booking.id}`}>
            <Link href={`/mentor/${encodeURIComponent(mentor.id)}`}>{t("dashboardV2.actions.requestAgain")}</Link>
          </Button>
        )}
      </div>
    </article>
  );
}
