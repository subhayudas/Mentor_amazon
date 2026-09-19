import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { CalendarClock, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestRail, type RailStopState } from "@/components/RequestRail";
import { StatusBadge } from "@/components/StatusBadge";
import type { Mentee } from "@/lib/database";
import { bidi, formatDate, formatNumber } from "@/lib/format";
import { credentialLine, localizedField } from "@/lib/localized";
import { groupMenteeBookings, isConfirmedPast, type BookingWithMentor } from "@/lib/menteeBookings";
import { ROUTES } from "@/lib/routes";
import { BookingRow, MentorAvatar, useSessionTime } from "@/pages/mentee/BookingRow";
import { OrganizationVerificationStatus } from "@/pages/mentee/OrganizationVerificationStatus";
import { useBookingActions } from "@/pages/mentee/useBookingActions";
import { BookingListSkeleton, BookingsError, NoSessionsYet, PanelSection, useMenteeBookings } from "@/pages/mentee/shared";

const PAST_PREVIEW = 5;

/**
 * Overview (spec §8 as amended by P1-24): next session first, then what
 * needs the mentee's action (accepted → choose a time, drawn on the request
 * rail), then upcoming sessions, then a compact past table. No tiles.
 */
export default function Overview({ menteeId, mentee }: { menteeId: string; mentee: Mentee }) {
  const { t, i18n } = useTranslation();
  const bookingsQuery = useMenteeBookings(menteeId);
  const { actions, dialogs, highlightedId } = useBookingActions(menteeId, mentee);
  const { format, zoneLabel } = useSessionTime();

  const groups = useMemo(() => groupMenteeBookings(bookingsQuery.data), [bookingsQuery.data]);
  const total = bookingsQuery.data?.length ?? 0;

  const railStates = useMemo<[RailStopState, RailStopState, RailStopState]>(() => {
    const withLink = groups.needsAction.find((b) => b.mentor?.cal_link);
    return withLink ? ["done", "done", "current"] : ["done", "current", "next"];
  }, [groups.needsAction]);

  const railName = localizedField(groups.needsAction[0]?.mentor, "name", i18n.language);

  return (
    <div className="space-y-8">
      <OrganizationVerificationStatus mentee={mentee} />

      {bookingsQuery.isLoading ? (
        <BookingListSkeleton />
      ) : bookingsQuery.isError ? (
        <BookingsError onRetry={() => bookingsQuery.refetch()} />
      ) : total === 0 ? (
        <NoSessionsYet />
      ) : (
        <>
          {groups.next && (
            <PanelSection id="next-session" title={t("dashboardV2.overview.nextSession")}>
              <NextSessionCard booking={groups.next} onView={actions.onView} />
            </PanelSection>
          )}

          {groups.needsAction.length > 0 && (
            <PanelSection id="needs-action" title={t("dashboardV2.overview.needsAction")}>
              <div className="rounded-lg border border-border bg-card p-4 md:p-5" data-testid="card-needs-action">
                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    {groups.needsAction.map((booking, index) => (
                      <BookingRow
                        key={booking.id}
                        booking={booking}
                        primary={index === 0}
                        highlighted={highlightedId === booking.id}
                        compact
                        className={index > 0 ? "rounded-none border-0 border-t border-border p-0 pt-4 mt-4" : "rounded-none border-0 p-0"}
                        {...actions}
                      />
                    ))}
                  </div>
                  <div className="rounded-lg bg-muted/40 p-4 md:order-none">
                    <p className="mb-3 text-caption text-muted-foreground">{t("dashboardV2.rail.title")}</p>
                    <RequestRail
                      size="sm"
                      stops={[
                        { label: t("dashboardV2.rail.sent"), state: railStates[0] },
                        {
                          label: railStates[1] === "done"
                            ? t("dashboardV2.rail.accepted", { name: bidi(railName) })
                            : t("dashboardV2.rail.acceptedNoLink", { name: bidi(railName) }),
                          state: railStates[1],
                        },
                        { label: t("dashboardV2.rail.pickTime"), state: railStates[2] },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </PanelSection>
          )}

          {groups.waiting.length > 0 && (
            <PanelSection id="waiting" title={t("dashboardV2.overview.waiting")}>
              <div className="space-y-3">
                {groups.waiting.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} highlighted={highlightedId === booking.id} compact {...actions} />
                ))}
              </div>
            </PanelSection>
          )}

          {groups.upcoming.length > 0 && (
            <PanelSection id="upcoming" title={t("dashboardV2.overview.upcoming")}>
              <div className="space-y-3">
                {groups.upcoming.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} highlighted={highlightedId === booking.id} compact {...actions} />
                ))}
              </div>
            </PanelSection>
          )}

          {groups.past.length > 0 && (
            <PanelSection
              id="past"
              title={t("dashboardV2.overview.past")}
              aside={
                groups.past.length > PAST_PREVIEW ? (
                  <Link href={ROUTES.menteeBookings} className="text-body-sm font-medium text-secondary underline-offset-4 hover:underline">
                    {t("dashboardV2.overview.seeAll", { count: groups.past.length })}
                  </Link>
                ) : undefined
              }
            >
              <PastList
                bookings={groups.past.slice(0, PAST_PREVIEW)}
                highlightedId={highlightedId}
                onView={actions.onView}
                onRate={actions.onRate}
                format={format}
                zoneLabel={zoneLabel}
              />
            </PanelSection>
          )}
        </>
      )}

      {dialogs}
    </div>
  );
}

function NextSessionCard({ booking, onView }: { booking: BookingWithMentor; onView: (b: BookingWithMentor) => void }) {
  const { t, i18n } = useTranslation();
  const { format, zoneLabel } = useSessionTime();
  const name = localizedField(booking.mentor, "name", i18n.language) || t("dashboardV2.row.unknownMentor");
  const credential = credentialLine(booking.mentor, i18n.language);
  return (
    <article
      data-testid={`card-next-session`}
      data-booking-card={booking.id}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 md:flex-row md:items-center md:gap-6 md:p-6"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MentorAvatar mentor={booking.mentor} size="lg" />
        <div className="min-w-0">
          <h3 className="text-h3 text-foreground">
            <bdi>{name}</bdi>
          </h3>
          {credential && <p className="text-body-sm text-muted-foreground">{credential}</p>}
        </div>
      </div>
      <div className="min-w-0 md:text-end">
        <p className="flex items-center gap-2 text-body font-medium text-foreground tabular-nums md:justify-end">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          {format(booking.scheduled_at)}
        </p>
        <p className="text-caption text-muted-foreground">{zoneLabel}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-end">
        <StatusBadge status={booking.status} />
        <Button variant="outline" size="sm" className="max-md:h-11 max-md:px-5" onClick={() => onView(booking)} data-testid={`button-view-request-${booking.id}`}>
          {t("dashboardV2.actions.viewRequest")}
        </Button>
      </div>
    </article>
  );
}

/** Past sessions: a compact table on md+, stacked rows below it (same data, one mounted at a time). */
function PastList({
  bookings,
  highlightedId,
  onView,
  onRate,
  format,
  zoneLabel,
}: {
  bookings: BookingWithMentor[];
  highlightedId: string | null;
  onView: (b: BookingWithMentor) => void;
  onRate: (b: BookingWithMentor) => void;
  format: (iso: string | null | undefined) => string | null;
  zoneLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const when = (b: BookingWithMentor) =>
    b.status === "completed" || b.status === "confirmed"
      ? format(b.completed_at ?? b.scheduled_at) ?? t("dashboardV2.row.timeNotRecorded")
      : formatDate(b.canceled_at ?? b.responded_at ?? b.created_at, i18n.language);
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("dashboardV2.past.mentor")}</TableHead>
              <TableHead className="text-start">{t("dashboardV2.past.when")}</TableHead>
              <TableHead className="text-start">{t("dashboardV2.past.status")}</TableHead>
              <TableHead className="text-end">
                <span className="sr-only">{t("dashboardV2.past.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b) => {
              const name = localizedField(b.mentor, "name", i18n.language) || t("dashboardV2.row.unknownMentor");
              return (
                <TableRow
                  key={b.id}
                  data-booking-card={b.id}
                  className={highlightedId === b.id ? "bg-accent" : undefined}
                  data-testid={`row-past-${b.id}`}
                >
                  <TableCell className="font-medium text-foreground">
                    <bdi>{name}</bdi>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {when(b)}
                    {(b.status === "completed" || b.status === "confirmed") && <span className="text-caption"> · {zoneLabel}</span>}
                    {isConfirmedPast(b) && (
                      <span className="block text-caption">{t("dashboardV2.row.notMarkedComplete")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={b.status} />
                  </TableCell>
                  <TableCell className="text-end">
                    {b.status === "completed" && !b.mentee_rating ? (
                      <Button variant="outline" size="sm" onClick={() => onRate(b)} data-testid={`button-give-feedback-${b.id}`}>
                        {t("dashboardV2.actions.rateSession")}
                      </Button>
                    ) : b.status === "completed" && b.mentee_rating ? (
                      <Button variant="ghost" size="sm" onClick={() => onRate(b)} data-testid={`button-view-feedback-${b.id}`}>
                        <Star className="fill-brand-orange text-brand-orange" aria-hidden="true" />
                        <span dir="ltr" className="tabular-nums">{t("dashboardV2.row.rated", { value: formatNumber(b.mentee_rating, i18n.language) })}</span>
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => onView(b)} data-testid={`button-view-request-${b.id}`}>
                        {t("dashboardV2.actions.viewRequest")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {bookings.map((b) => {
          const name = localizedField(b.mentor, "name", i18n.language) || t("dashboardV2.row.unknownMentor");
          return (
            <li
              key={b.id}
              data-booking-card={b.id}
              className={`flex flex-col gap-2 rounded-lg border border-border bg-card p-4 ${highlightedId === b.id ? "ring-2 ring-brand-orange ring-offset-2 ring-offset-background" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  <bdi>{name}</bdi>
                </span>
                <StatusBadge status={b.status} />
              </div>
              <p className="text-body-sm text-muted-foreground tabular-nums">
                {when(b)}
                {(b.status === "completed" || b.status === "confirmed") && <span> · {zoneLabel}</span>}
              </p>
              {isConfirmedPast(b) && <p className="text-caption text-muted-foreground">{t("dashboardV2.row.notMarkedComplete")}</p>}
              <div className="flex flex-wrap gap-2">
                {b.status === "completed" && !b.mentee_rating ? (
                  <Button variant="outline" size="sm" onClick={() => onRate(b)} data-testid={`button-give-feedback-${b.id}`}>
                    {t("dashboardV2.actions.rateSession")}
                  </Button>
                ) : b.status === "completed" && b.mentee_rating ? (
                  <Button variant="outline" size="sm" onClick={() => onRate(b)} data-testid={`button-view-feedback-${b.id}`}>
                    <Star className="fill-brand-orange text-brand-orange" aria-hidden="true" />
                    <span dir="ltr" className="tabular-nums">{t("dashboardV2.row.rated", { value: formatNumber(b.mentee_rating, i18n.language) })}</span>
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => onView(b)} data-testid={`button-view-request-${b.id}`}>
                    {t("dashboardV2.actions.viewRequest")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
