import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { StarRating } from "@/components/MenteeFeedbackDialog";
import type { Booking, Mentor } from "@/lib/database";
import { formatDate } from "@/lib/format";
import { localizedField } from "@/lib/localized";
import { menteeService } from "@/lib/services";
import { MentorAvatar } from "@/pages/mentee/BookingRow";
import { BookingsError, PanelSection, useMenteeBookings } from "@/pages/mentee/shared";

type FeedbackBooking = Booking & { mentor?: Mentor };

/**
 * Feedback: what the mentee gave (every booking they rated, from the shared
 * bookings query — the old page only listed sessions the mentor had also
 * rated) and what mentors wrote back (`getMenteeFeedback`). Read-only; the
 * rating is text + stars, never stars alone.
 */
export default function Feedback({ menteeId }: { menteeId: string }) {
  const { t, i18n } = useTranslation();
  const bookingsQuery = useMenteeBookings(menteeId);
  const receivedQuery = useQuery<FeedbackBooking[]>({
    queryKey: ["mentee", menteeId, "feedback"],
    queryFn: () => menteeService.getFeedback(menteeId) as Promise<FeedbackBooking[]>,
  });

  const given = useMemo(() => (bookingsQuery.data ?? []).filter((b) => !!b.mentee_rating), [bookingsQuery.data]);
  const received = useMemo(() => (receivedQuery.data ?? []).filter((b) => !!b.mentor_rating), [receivedQuery.data]);

  const isLoading = bookingsQuery.isLoading || receivedQuery.isLoading;
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (bookingsQuery.isError || receivedQuery.isError) {
    return (
      <BookingsError
        onRetry={() => {
          bookingsQuery.refetch();
          receivedQuery.refetch();
        }}
      />
    );
  }

  if (given.length === 0 && received.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={t("dashboardV2.feedbackPanel.emptyTitle")}
        description={t("dashboardV2.feedbackPanel.emptyBody")}
      />
    );
  }

  const renderItem = (item: FeedbackBooking, kind: "given" | "received") => {
    const name = localizedField(item.mentor, "name", i18n.language) || t("dashboardV2.row.unknownMentor");
    const rating = kind === "given" ? item.mentee_rating ?? 0 : item.mentor_rating ?? 0;
    const text = kind === "given" ? item.mentee_feedback : item.mentor_feedback;
    return (
      <li key={item.id} className="rounded-lg border border-border bg-card p-4" data-testid={`feedback-${kind}-${item.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MentorAvatar mentor={item.mentor} size="sm" />
            <div>
              <p className="text-body-sm font-medium text-foreground">
                <bdi>{name}</bdi>
              </p>
              <p className="text-caption text-muted-foreground">{formatDate(item.completed_at ?? item.scheduled_at, i18n.language)}</p>
            </div>
          </div>
          <StarRating rating={rating} readonly />
        </div>
        {text && (
          <p dir="auto" className="mt-3 text-body-sm text-foreground text-pretty">
            {text}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-8">
      <PanelSection id="feedback-received" title={t("dashboardV2.feedbackPanel.received")}>
        {received.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{t("dashboardV2.feedbackPanel.noneReceived")}</p>
        ) : (
          <ul className="space-y-3">{received.map((item) => renderItem(item, "received"))}</ul>
        )}
      </PanelSection>
      <PanelSection id="feedback-given" title={t("dashboardV2.feedbackPanel.given")}>
        {given.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{t("dashboardV2.feedbackPanel.noneGiven")}</p>
        ) : (
          <ul className="space-y-3">{given.map((item) => renderItem(item, "given"))}</ul>
        )}
      </PanelSection>
    </div>
  );
}
