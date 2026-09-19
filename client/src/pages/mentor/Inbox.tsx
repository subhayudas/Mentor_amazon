import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Ban, CalendarPlus, Check, Inbox as InboxIcon, RefreshCw, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { RequestRail } from "@/components/RequestRail";
import { StatTile } from "@/components/StatTile";
import { VerificationBadge } from "@/components/VerificationBadge";
import { toast } from "sonner";
import type { Booking, Mentee, Mentor, MentorDashboardStats } from "@/lib/database";
import { bidi, formatHours, formatNumber, formatRelativeDay, UNAVAILABLE } from "@/lib/format";
import { initialsOf } from "@/lib/localized";
import { queryClient } from "@/lib/queryClient";
import { ROUTES } from "@/lib/routes";
import { bookingService, mentorService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { BookingsError } from "@/pages/mentee/shared";

type BookingWithMentee = Booking & { mentee?: Mentee };
type Decision = "accepted" | "declined";

/** How long a decided row stays highlighted before it leaves the inbox. */
const DECISION_LINGER_MS = 2500;
/** New requests matter most: the inbox keeps its 10 s poll (C22 keeps a slow poll here only). */
const INBOX_POLL_MS = 10_000;

/**
 * Mentor inbox (P1-25 + P1-23 tiles): two honest tiles, then every pending
 * request with the full goal text, the mentee's identity and verification,
 * and Accept / Decline per row (Decline confirms; Accept is replaced by a
 * link to add a Cal.com link when the mentor has none, because accepting
 * without one strands the mentee). Decisions stay anchored to the row for
 * 2.5 s before it leaves the list.
 */
export default function Inbox({ mentorId, mentor }: { mentorId: string; mentor: Mentor }) {
  const { t, i18n } = useTranslation();

  const [inFlightId, setInFlightId] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, { booking: BookingWithMentee; outcome: Decision }>>({});
  const [declining, setDeclining] = useState<BookingWithMentee | null>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const pendingQuery = useQuery<BookingWithMentee[]>({
    queryKey: ["mentor", mentorId, "bookings", "pending"],
    queryFn: () => mentorService.getPendingBookings(mentorId) as Promise<BookingWithMentee[]>,
    refetchInterval: INBOX_POLL_MS,
    staleTime: 5_000,
  });
  const statsQuery = useQuery<MentorDashboardStats>({
    queryKey: ["mentor", mentorId, "dashboard"],
    queryFn: () => mentorService.getDashboardStats(mentorId),
    staleTime: 10_000,
  });
  const bookingsQuery = useQuery<BookingWithMentee[]>({
    queryKey: ["mentor", mentorId, "bookings"],
    queryFn: () => mentorService.getBookings(mentorId),
    staleTime: 10_000,
  });

  const sessionsThisMonth = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    return (bookingsQuery.data ?? []).filter((b) => b.status === "completed" && (b.completed_at ?? "").slice(0, 7) === month).length;
  }, [bookingsQuery.data]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["mentor", mentorId, "bookings"] });
    queryClient.invalidateQueries({ queryKey: ["mentor", mentorId, "dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const scrollToRow = (id: string) => rowRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const markDecided = (id: string, outcome: Decision) => {
    const booking = pendingQuery.data?.find((b) => b.id === id);
    setInFlightId(null);
    if (booking) setDecided((prev) => ({ ...prev, [id]: { booking, outcome } }));
    scrollToRow(id);
    timers.current.push(
      window.setTimeout(() => {
        setDecided((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, DECISION_LINGER_MS),
    );
  };

  const decide = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: Decision }) =>
      outcome === "accepted" ? bookingService.accept(id) : bookingService.decline(id),
    onMutate: ({ id }) => {
      setInFlightId(id);
      scrollToRow(id);
    },
    onSuccess: (_row, { id, outcome }) => {
      markDecided(id, outcome);
      invalidateAll();
      toast.success(outcome === "accepted" ? t("dashboardV2.inbox.acceptedToast") : t("dashboardV2.inbox.declinedToast"), {
        description: outcome === "accepted" ? t("dashboardV2.inbox.acceptedToastBody") : t("dashboardV2.inbox.declinedToastBody"),
      });
    },
    onError: () => {
      setInFlightId(null);
      toast.error(t("dashboardV2.inbox.decisionError"));
    },
  });

  const pending = (pendingQuery.data ?? []).filter((b) => b.status === "pending");
  const pendingIds = new Set(pending.map((b) => b.id));
  const lingering = Object.values(decided).filter(({ booking }) => !pendingIds.has(booking.id)).map(({ booking }) => booking);
  const visible = [...pending, ...lingering].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const hasCalLink = !!mentor.cal_link;
  const refreshing = pendingQuery.isFetching && !pendingQuery.isLoading;

  const verificationNote = (mentee?: Mentee) => {
    if (mentee?.user_type !== "organization") return null;
    const status = mentee.verification_status ?? "unverified";
    if (status === "verified") return null;
    return (
      <p className="text-caption text-muted-foreground" data-testid={`text-verification-note-${status}`}>
        {status === "rejected" ? t("verification.mentorNoteRejected") : t("verification.mentorNoteUnverified")}
      </p>
    );
  };

  const stats = statsQuery.data;
  const waiting = pendingQuery.isError ? UNAVAILABLE : formatNumber(pending.length, i18n.language);

  return (
    <div className="space-y-8">
      {pendingQuery.isLoading || bookingsQuery.isLoading || statsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2" role="status" aria-busy="true">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      ) : (
      <section aria-label={t("dashboardV2.inbox.tilesLabel")} className="grid gap-4 sm:grid-cols-2">
        <StatTile
          title={t("dashboardV2.inbox.tileWaiting")}
          value={waiting}
          definition={t("dashboardV2.inbox.tileWaitingDef")}
          testId="stat-requests-waiting"
        />
        <StatTile
          title={t("dashboardV2.inbox.tileSessionsMonth")}
          value={bookingsQuery.isError ? UNAVAILABLE : formatNumber(sessionsThisMonth, i18n.language)}
          delta={
            statsQuery.isError ? (
              t("dashboardV2.inbox.tileHoursUnavailable")
            ) : (
              <>
                <span data-testid="stat-volunteer-hours-month">
                  {t("dashboardV2.inbox.tileHoursMonth", { hours: formatHours(stats?.monthlyVolunteerMinutes, i18n.language) })}
                </span>
                <span aria-hidden="true"> · </span>
                <span data-testid="stat-volunteer-hours">
                  {t("dashboardV2.inbox.tileHoursTotal", { hours: formatHours(stats?.volunteerMinutes, i18n.language) })}
                </span>
              </>
            )
          }
          definition={t("dashboardV2.inbox.tileSessionsMonthDef")}
          testId="stat-sessions-month"
        />
      </section>
      )}

      <section aria-labelledby="inbox-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="inbox-heading" className="text-h2-sm text-foreground">
            {t("dashboardV2.inbox.heading")}
          </h2>
          <Button variant="outline" size="sm" onClick={() => pendingQuery.refetch()} loading={refreshing} data-testid="button-refresh-requests">
            <RefreshCw aria-hidden="true" />
            {t("common.refresh")}
          </Button>
        </div>

        {!hasCalLink && !pendingQuery.isLoading && visible.length > 0 && (
          <p className="rounded-lg border border-warning-border bg-warning p-3 text-body-sm text-warning-foreground" role="status" data-testid="note-no-cal-link">
            {t("dashboardV2.inbox.noCalLinkNote")}{" "}
            <Link href={`${ROUTES.mentorPortal}/profile#calendar`} className="font-medium underline underline-offset-2">
              {t("dashboardV2.inbox.addCalLink")}
            </Link>
          </p>
        )}

        {pendingQuery.isLoading ? (
          <div role="status" aria-busy="true" className="space-y-3">
            <span className="sr-only">{t("common.loading")}</span>
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-16 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : pendingQuery.isError ? (
          <BookingsError onRetry={() => pendingQuery.refetch()} />
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:gap-8">
            <EmptyState
              icon={InboxIcon}
              title={t("dashboardV2.inbox.emptyTitle")}
              description={t("dashboardV2.inbox.emptyBody")}
              className="py-6 md:items-start md:text-start"
            />
            <div className="mt-4 md:mt-0">
              <p className="mb-3 text-caption text-muted-foreground">{t("dashboardV2.inbox.howTitle")}</p>
              <RequestRail
                size="sm"
                stops={[
                  { label: t("dashboardV2.inbox.how1"), state: "next" },
                  { label: t("dashboardV2.inbox.how2"), state: "next" },
                  { label: t("dashboardV2.inbox.how3"), state: "next" },
                ]}
              />
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map((booking) => {
              const outcome = decided[booking.id]?.outcome;
              const busy = inFlightId === booking.id;
              const mentee = booking.mentee;
              const name = mentee?.name || t("dashboardV2.inbox.unknownMentee");
              return (
                <li
                  key={booking.id}
                  ref={(el) => {
                    rowRefs.current[booking.id] = el;
                  }}
                  className={cn(
                    "scroll-mt-32 rounded-lg border border-border bg-card p-4 transition-colors duration-slow md:p-5",
                    busy && "ring-2 ring-secondary/40",
                    outcome === "accepted" && "bg-success-soft ring-2 ring-success/40",
                    outcome === "declined" && "bg-muted/60 ring-2 ring-destructive/30",
                  )}
                  data-testid={`booking-row-${booking.id}`}
                  data-decision={outcome}
                >
                  <article aria-labelledby={`request-${booking.id}`} className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar className="size-10">
                          {mentee?.photo_url ? <AvatarImage src={mentee.photo_url} alt="" /> : null}
                          <AvatarFallback className="text-body-sm font-medium text-foreground">{initialsOf(name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 id={`request-${booking.id}`} className="text-body font-medium text-foreground" data-testid={`text-mentee-name-${booking.id}`}>
                              <bdi>{name}</bdi>
                            </h3>
                            <VerificationBadge status={mentee?.verification_status} type={mentee?.user_type} size="sm" data-testid={`badge-verification-${booking.id}`} />
                          </div>
                          {mentee?.user_type === "organization" && mentee.organization_name && (
                            <p className="text-body-sm text-muted-foreground" data-testid={`text-mentee-org-${booking.id}`}>
                              <bdi>{mentee.organization_name}</bdi>
                            </p>
                          )}
                          {mentee?.email && (
                            <p className="text-caption text-muted-foreground" data-testid={`text-mentee-email-${booking.id}`}>
                              <bdi dir="ltr">{mentee.email}</bdi>
                            </p>
                          )}
                          {verificationNote(mentee)}
                        </div>
                      </div>
                      <p className="text-caption text-muted-foreground tabular-nums">
                        {t("dashboardV2.inbox.requestedAt", { when: formatRelativeDay(booking.created_at, i18n.language) })}
                      </p>
                    </div>

                    <div>
                      <p className="text-caption text-muted-foreground">{t("dashboardV2.inbox.goalLabel")}</p>
                      <p dir="auto" className="mt-1 whitespace-pre-line text-body-sm text-foreground text-pretty" data-testid={`text-goal-${booking.id}`}>
                        {booking.goal || t("dashboardV2.inbox.noGoal")}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {outcome ? (
                        <Badge tone={outcome === "accepted" ? "success" : "danger"} role="status" data-testid={`badge-decision-${booking.id}`}>
                          {outcome === "accepted" ? <Check aria-hidden="true" /> : <Ban aria-hidden="true" />}
                          {outcome === "accepted" ? t("dashboardV2.inbox.acceptedBadge") : t("dashboardV2.inbox.declinedBadge")}
                        </Badge>
                      ) : (
                        <>
                          {hasCalLink ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={busy && decide.variables?.outcome === "accepted"}
                              disabled={busy}
                              onClick={() => decide.mutate({ id: booking.id, outcome: "accepted" })}
                              data-testid={`button-accept-${booking.id}`}
                            >
                              <Check aria-hidden="true" />
                              {t("dashboardV2.inbox.accept")}
                            </Button>
                          ) : (
                            <Button asChild variant="secondary" size="sm" data-testid={`button-add-cal-link-${booking.id}`}>
                              <Link href={`${ROUTES.mentorPortal}/profile#calendar`}>
                                <CalendarPlus aria-hidden="true" />
                                {t("dashboardV2.inbox.addCalLinkToAccept")}
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            loading={busy && decide.variables?.outcome === "declined"}
                            disabled={busy}
                            onClick={() => setDeclining(booking)}
                            data-testid={`button-decline-${booking.id}`}
                          >
                            <X aria-hidden="true" />
                            {t("dashboardV2.inbox.decline")}
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AlertDialog open={!!declining} onOpenChange={(open) => !open && setDeclining(null)}>
        <AlertDialogContent data-testid="dialog-decline-request">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dashboardV2.inbox.declineTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dashboardV2.inbox.declineBody", { name: bidi(declining?.mentee?.name || t("dashboardV2.inbox.unknownMentee")) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-decline-keep">{t("dashboardV2.inbox.declineKeep")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                if (declining) decide.mutate({ id: declining.id, outcome: "declined" });
                setDeclining(null);
              }}
              data-testid="button-decline-confirm"
            >
              {t("dashboardV2.inbox.declineConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
