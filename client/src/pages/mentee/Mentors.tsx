import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Star, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import type { Mentor } from "@/lib/database";
import { formatNumber } from "@/lib/format";
import { credentialLine, localizedField } from "@/lib/localized";
import { lastDiscoveryHref } from "@/lib/urlState";
import { MentorAvatar } from "@/pages/mentee/BookingRow";
import { BookingsError, useMenteeBookings } from "@/pages/mentee/shared";

/**
 * "Mentors you have met": the distinct mentors behind this mentee's bookings
 * (there is no favourites table, so nothing pretends to be one). Names are
 * localized; ratings only when the mentor has any.
 */
export default function Mentors({ menteeId }: { menteeId: string }) {
  const { t, i18n } = useTranslation();
  const bookingsQuery = useMenteeBookings(menteeId);

  const mentors = useMemo(() => {
    const seen = new Map<string, Mentor>();
    for (const b of bookingsQuery.data ?? []) {
      if (b.mentor && !seen.has(b.mentor.id)) seen.set(b.mentor.id, b.mentor);
    }
    return Array.from(seen.values());
  }, [bookingsQuery.data]);

  if (bookingsQuery.isLoading) {
    return (
      <div role="status" aria-busy="true" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <span className="sr-only">{t("common.loading")}</span>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>
    );
  }
  if (bookingsQuery.isError) return <BookingsError onRetry={() => bookingsQuery.refetch()} />;

  if (mentors.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t("dashboardV2.mentors.emptyTitle")}
        description={t("dashboardV2.mentors.emptyBody")}
        action={
          <Button asChild variant="secondary">
            <Link href={lastDiscoveryHref()}>{t("dashboardV2.empty.action")}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-body-sm text-muted-foreground">{t("dashboardV2.mentors.intro", { count: mentors.length })}</p>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {mentors.map((mentor) => {
          const name = localizedField(mentor, "name", i18n.language);
          const credential = credentialLine(mentor, i18n.language);
          const rating = Number(mentor.average_rating ?? 0);
          return (
            <li key={mentor.id} className="flex min-w-0 items-center gap-4 rounded-lg border border-border bg-card p-4" data-testid={`mentor-card-${mentor.id}`}>
              <MentorAvatar mentor={mentor} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-foreground">
                  <bdi>{name}</bdi>
                </p>
                {credential && <p className="truncate text-body-sm text-muted-foreground">{credential}</p>}
                {!!mentor.total_ratings && rating > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 text-caption text-muted-foreground" dir="ltr">
                    <Star className="size-3.5 fill-brand-orange text-brand-orange" aria-hidden="true" />
                    <span className="sr-only">{t("dashboardV2.mentors.ratingA11y", { rating: formatNumber(rating, i18n.language, { maximumFractionDigits: 1 }), count: mentor.total_ratings })}</span>
                    <span aria-hidden="true" className="tabular-nums">
                      {formatNumber(rating, i18n.language, { maximumFractionDigits: 1 })} ({formatNumber(mentor.total_ratings, i18n.language)})
                    </span>
                  </p>
                )}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/mentor/${encodeURIComponent(mentor.id)}`}>{t("dashboardV2.mentors.viewProfile")}</Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
