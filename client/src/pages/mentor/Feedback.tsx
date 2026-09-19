import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { MessageSquare } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { StarRating } from "@/components/MenteeFeedbackDialog";
import type { Booking, Mentee } from "@/lib/database";
import { formatDate, formatNumber } from "@/lib/format";
import { initialsOf } from "@/lib/localized";
import { ROUTES } from "@/lib/routes";
import { mentorService } from "@/lib/services";
import { BookingsError } from "@/pages/mentee/shared";

type FeedbackItem = Booking & { mentee?: Mentee };

/**
 * Feedback received from mentees (read-only; the mentor rates mentees from
 * a session's feedback dialog). One honest summary line instead of tiles,
 * ratings as stars + text, newest first without mutating the cache.
 */
export default function Feedback({ mentorId }: { mentorId: string }) {
  const { t, i18n } = useTranslation();
  const feedbackQuery = useQuery<FeedbackItem[]>({
    queryKey: ["mentor", mentorId, "feedback"],
    queryFn: () => mentorService.getFeedback(mentorId),
  });

  const items = useMemo(
    () => [...(feedbackQuery.data ?? [])].filter((i) => !!i.mentee_rating).sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at)),
    [feedbackQuery.data],
  );
  const average = items.length ? items.reduce((sum, i) => sum + (i.mentee_rating ?? 0), 0) / items.length : 0;

  if (feedbackQuery.isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }
  if (feedbackQuery.isError) return <BookingsError onRetry={() => feedbackQuery.refetch()} />;
  if (items.length === 0) {
    return <EmptyState icon={MessageSquare} title={t("dashboardV2.mentorFeedback.emptyTitle")} description={t("dashboardV2.mentorFeedback.emptyBody")} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-body-sm text-muted-foreground" data-testid="text-feedback-summary">
        {t("dashboardV2.mentorFeedback.summary", {
          count: items.length,
          average: formatNumber(average, i18n.language, { maximumFractionDigits: 1 }),
        })}
      </p>
      <ul className="space-y-3">
        {items.map((item) => {
          const name = item.mentee?.name || t("dashboardV2.inbox.unknownMentee");
          return (
            <li key={item.id} className="rounded-lg border border-border bg-card p-4" data-testid={`feedback-item-${item.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    {item.mentee?.photo_url ? <AvatarImage src={item.mentee.photo_url} alt="" /> : null}
                    <AvatarFallback className="text-body-sm font-medium text-foreground">{initialsOf(name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-body-sm font-medium text-foreground" data-testid={`mentee-name-${item.id}`}>
                      <bdi>{name}</bdi>
                    </p>
                    <p className="text-caption text-muted-foreground">{formatDate(item.completed_at ?? item.created_at, i18n.language)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StarRating rating={item.mentee_rating ?? 0} readonly />
                  <Button asChild variant="ghost" size="sm" data-testid={`view-session-${item.id}`}>
                    <Link href={`${ROUTES.mentorPortal}/sessions`}>{t("dashboardV2.mentorFeedback.viewSessions")}</Link>
                  </Button>
                </div>
              </div>
              {item.mentee_feedback && (
                <p dir="auto" className="mt-3 text-body-sm text-foreground text-pretty" data-testid={`feedback-text-${item.id}`}>
                  {item.mentee_feedback}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
