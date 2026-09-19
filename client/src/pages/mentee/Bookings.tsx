import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Mentee } from "@/lib/database";
import { groupMenteeBookings, type BookingWithMentor } from "@/lib/menteeBookings";
import { BookingRow } from "@/pages/mentee/BookingRow";
import { useBookingActions } from "@/pages/mentee/useBookingActions";
import { BookingListSkeleton, BookingsError, NoSessionsYet, PanelSection, useMenteeBookings } from "@/pages/mentee/shared";

/**
 * Bookings (P1-24): every request the mentee has made, grouped by what it
 * needs — action (accepted), a reply (pending), upcoming, past (including
 * declined and cancelled, which used to be invisible). One `BookingRow`.
 */
export default function Bookings({ menteeId, mentee }: { menteeId: string; mentee: Mentee }) {
  const { t } = useTranslation();
  const bookingsQuery = useMenteeBookings(menteeId);
  const { actions, dialogs, highlightedId } = useBookingActions(menteeId, mentee);
  const groups = useMemo(() => groupMenteeBookings(bookingsQuery.data), [bookingsQuery.data]);
  const total = bookingsQuery.data?.length ?? 0;
  const refreshing = bookingsQuery.isFetching && !bookingsQuery.isLoading;

  const renderList = (rows: BookingWithMentor[], primaryFirst = false) => (
    <div className="space-y-3">
      {rows.map((booking, index) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          primary={primaryFirst && index === 0}
          highlighted={highlightedId === booking.id}
          {...actions}
        />
      ))}
    </div>
  );

  const upcoming = groups.next ? [groups.next, ...groups.upcoming] : groups.upcoming;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-muted-foreground" role="status">
          {bookingsQuery.isLoading ? t("common.loading") : bookingsQuery.isError ? "" : t("dashboardV2.bookings.count", { count: total })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => bookingsQuery.refetch()}
            loading={refreshing}
            data-testid="button-refresh-bookings"
          >
            <RefreshCw aria-hidden="true" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {bookingsQuery.isLoading ? (
        <BookingListSkeleton rows={4} />
      ) : bookingsQuery.isError ? (
        <BookingsError onRetry={() => bookingsQuery.refetch()} />
      ) : total === 0 ? (
        <NoSessionsYet />
      ) : (
        <>
          {groups.needsAction.length > 0 && (
            <PanelSection id="bookings-needs-action" title={t("dashboardV2.overview.needsAction")}>
              {renderList(groups.needsAction, true)}
            </PanelSection>
          )}
          {groups.waiting.length > 0 && (
            <PanelSection id="bookings-waiting" title={t("dashboardV2.overview.waiting")}>
              {renderList(groups.waiting)}
            </PanelSection>
          )}
          {upcoming.length > 0 && (
            <PanelSection id="bookings-upcoming" title={t("dashboardV2.overview.upcoming")}>
              {renderList(upcoming)}
            </PanelSection>
          )}
          {groups.past.length > 0 && (
            <PanelSection id="bookings-past" title={t("dashboardV2.overview.past")}>
              {renderList(groups.past)}
            </PanelSection>
          )}
        </>
      )}

      {dialogs}
    </div>
  );
}
