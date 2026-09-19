import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarClock, CheckCircle2, FileText, MessageSquare, Timer, XCircle } from "lucide-react";

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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ChipRadio, ChipRadioGroup } from "@/components/discovery/FilterChip";
import { EmptyState } from "@/components/EmptyState";
import { StarRating } from "@/components/MenteeFeedbackDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { VerificationBadge } from "@/components/VerificationBadge";
import { BookingNotes } from "@/components/dashboard/BookingNotes";
import { toast } from "sonner";
import type { Booking, Mentee, Mentor } from "@/lib/database";
import { bidi, formatDateTime, formatNumber, tzDisplayLabel, viewerTimeZone } from "@/lib/format";
import { initialsOf } from "@/lib/localized";
import { isFuture } from "@/lib/menteeBookings";
import { queryClient } from "@/lib/queryClient";
import {
  completeSession,
  getMentorCountry,
  localizeCountry,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  REPORTING_COUNTRIES,
  SESSION_MINUTE_PRESETS,
} from "@/lib/reporting";
import { bookingService, mentorService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { ARIA_DISABLED_CLASS, BookingsError } from "@/pages/mentee/shared";

/** Radix Select cannot hold an empty-string value, so "no country" is this sentinel. */
const NO_COUNTRY = "__none";
/** The "Other…" duration chip; it reveals the free number field. */
const OTHER_DURATION = "__other";
const HIGHLIGHT_MS = 2000;

type SessionBooking = Booking & { mentee?: Mentee };

interface MySessionsProps {
  mentorId: string;
  mentorEmail?: string;
  mentor: Mentor;
}

/**
 * Mentor sessions (matrix row 23): Upcoming (accepted requests still waiting
 * for the mentee to pick a time, plus confirmed future sessions) and
 * Completed (completed, plus confirmed sessions whose time passed and still
 * need a duration). Every row shows the mentee (embedded, never a UUID) and
 * a StatusBadge; completing records the real duration for volunteer hours;
 * cancelling confirms first. An accepted request has no time yet, so its
 * primary action is to wait: "Mark complete" is only a quiet link for a
 * session that happened off the calendar link (F-39).
 */
export default function MySessions({ mentorId, mentorEmail, mentor }: MySessionsProps) {
  const { t, i18n } = useTranslation();
  const viewerTz = viewerTimeZone();
  const [activeTab, setActiveTab] = useState<"upcoming" | "completed">("upcoming");
  const [notesFor, setNotesFor] = useState<SessionBooking | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<SessionBooking | null>(null);
  const [completeFor, setCompleteFor] = useState<SessionBooking | null>(null);
  const [cancelFor, setCancelFor] = useState<SessionBooking | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const bookingsQuery = useQuery<SessionBooking[]>({
    queryKey: ["mentor", mentorId, "bookings"],
    queryFn: () => mentorService.getBookings(mentorId),
  });

  useEffect(() => {
    if (!highlightedId) return;
    const card = document.querySelector<HTMLElement>(`[data-testid="session-card-${CSS.escape(highlightedId)}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedId, bookingsQuery.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["mentor", mentorId] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => bookingService.updateStatus(bookingId, "canceled"),
    onSuccess: () => {
      invalidate();
      toast.success(t("dashboardV2.sessions.cancelledToast"));
    },
    onError: () => toast.error(t("dashboardV2.sessions.updateError")),
  });

  const completeMutation = useMutation({
    mutationFn: ({ bookingId, minutes, country }: { bookingId: string; minutes: number; country?: string }) =>
      completeSession(bookingId, { minutes, country }),
    onSuccess: (_row, variables) => {
      invalidate();
      setCompleteFor(null);
      setActiveTab("completed");
      setHighlightedId(variables.bookingId);
      toast.success(t("mentorPortal.sessionCompleted", { minutes: variables.minutes }));
    },
    onError: () => toast.error(t("dashboardV2.sessions.updateError")),
  });

  const { upcoming, completed } = useMemo(() => {
    const rows = bookingsQuery.data ?? [];
    // Upcoming: soonest scheduled first, then accepted requests still waiting for a time.
    const bySoonest = (a: SessionBooking, b: SessionBooking) =>
      (a.scheduled_at ?? "\uffff").localeCompare(b.scheduled_at ?? "\uffff") || (b.created_at ?? "").localeCompare(a.created_at ?? "");
    const byRecent = (a: SessionBooking, b: SessionBooking) =>
      (b.completed_at ?? b.scheduled_at ?? b.created_at ?? "").localeCompare(a.completed_at ?? a.scheduled_at ?? a.created_at ?? "");
    return {
      upcoming: rows.filter((b) => b.status === "accepted" || (b.status === "confirmed" && (!b.scheduled_at || isFuture(b.scheduled_at)))).sort(bySoonest),
      completed: rows.filter((b) => b.status === "completed" || (b.status === "confirmed" && !!b.scheduled_at && !isFuture(b.scheduled_at))).sort(byRecent),
    };
  }, [bookingsQuery.data]);

  const renderCard = (booking: SessionBooking) => {
    const mentee = booking.mentee;
    const name = mentee?.name || t("dashboardV2.inbox.unknownMentee");
    const busy = cancelMutation.isPending && cancelMutation.variables === booking.id;
    const canAct = booking.status === "confirmed" || booking.status === "accepted";
    const awaitingTime = booking.status === "accepted";
    const sessionOver = booking.status === "completed" || (!!booking.scheduled_at && !isFuture(booking.scheduled_at));
    return (
      <li
        key={booking.id}
        className={cn(
          "scroll-mt-32 rounded-lg border border-border bg-card p-4 transition-shadow duration-slow",
          highlightedId === booking.id && "ring-2 ring-brand-orange ring-offset-2 ring-offset-background",
        )}
        data-testid={`session-card-${booking.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Avatar className="size-10">
              {mentee?.photo_url ? <AvatarImage src={mentee.photo_url} alt="" /> : null}
              <AvatarFallback className="text-body-sm font-medium text-foreground">{initialsOf(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-body font-medium text-foreground" data-testid={`text-session-mentee-${booking.id}`}>
                  <bdi>{name}</bdi>
                </h3>
                <VerificationBadge status={mentee?.verification_status} type={mentee?.user_type} size="sm" />
              </div>
              {mentee?.user_type === "organization" && mentee.organization_name && (
                <p className="text-body-sm text-muted-foreground">
                  <bdi>{mentee.organization_name}</bdi>
                </p>
              )}
              {booking.goal && (
                <p dir="auto" className="mt-1 line-clamp-2 w-fit max-w-prose text-body-sm text-foreground text-pretty">
                  {booking.goal}
                </p>
              )}
            </div>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted-foreground tabular-nums">
          {booking.scheduled_at ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {formatDateTime(booking.scheduled_at, i18n.language, viewerTz)} · {t("dashboardV2.time.yourZone", { tz: bidi(tzDisplayLabel(viewerTz, i18n.language)) })}
            </span>
          ) : booking.status === "accepted" ? (
            <span>{t("dashboardV2.sessions.waitingForTime")}</span>
          ) : (
            <span>{t("dashboardV2.row.timeNotRecorded")}</span>
          )}
          {booking.status === "completed" && typeof booking.session_duration_minutes === "number" && (
            <span className="inline-flex items-center gap-1.5" data-testid={`text-duration-${booking.id}`}>
              <Timer className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {t("mentorPortal.durationMinutes", { count: booking.session_duration_minutes })}
            </span>
          )}
          {booking.status === "confirmed" && sessionOver && <span>{t("dashboardV2.sessions.needsDuration")}</span>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canAct && !awaitingTime && (
            <Button variant="secondary" size="sm" onClick={() => openComplete(booking)} data-testid={`button-complete-${booking.id}`}>
              <CheckCircle2 aria-hidden="true" />
              {t("dashboardV2.sessions.markComplete")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setNotesFor(booking)} data-testid={`button-notes-${booking.id}`}>
            <FileText aria-hidden="true" />
            {t("dashboardV2.sessions.notes")}
          </Button>
          {sessionOver && (
            <Button variant="outline" size="sm" onClick={() => setFeedbackFor(booking)} data-testid={`button-feedback-${booking.id}`}>
              <MessageSquare aria-hidden="true" />
              {booking.mentor_rating ? t("dashboardV2.sessions.viewFeedback") : t("dashboardV2.sessions.giveFeedback")}
            </Button>
          )}
          {canAct && (
            <Button variant="ghost" size="sm" loading={busy} onClick={() => setCancelFor(booking)} data-testid={`button-cancel-${booking.id}`}>
              <XCircle aria-hidden="true" />
              {awaitingTime ? t("dashboardV2.sessions.cancelRequest") : t("dashboardV2.sessions.cancel")}
            </Button>
          )}
        </div>
        {awaitingTime && (
          <p className="mt-3 text-caption text-muted-foreground">
            {t("dashboardV2.sessions.metOffPlatform")}{" "}
            <button
              type="button"
              className="inline-flex min-h-6 items-center rounded-sm font-medium text-secondary underline decoration-1 underline-offset-4 transition-colors duration-fast hover:decoration-2"
              onClick={() => openComplete(booking)}
              data-testid={`button-complete-${booking.id}`}
            >
              {t("dashboardV2.sessions.markCompleteAnyway")}
            </button>
          </p>
        )}
      </li>
    );
  };

  // ----- complete dialog state -----
  // One control for the duration (F-42): preset chips, plus an "Other" chip
  // that reveals the free number field instead of showing both at once.
  const [minutesInput, setMinutesInput] = useState("30");
  const [otherDuration, setOtherDuration] = useState(false);
  const [sessionCountry, setSessionCountry] = useState("");
  const minutesRef = useRef<HTMLInputElement | null>(null);
  const parsedMinutes = Number.parseInt(minutesInput, 10);
  const minutesValid = Number.isInteger(parsedMinutes) && parsedMinutes >= MIN_SESSION_MINUTES && parsedMinutes <= MAX_SESSION_MINUTES;
  const ids = useId();
  const durationChoice = !otherDuration && SESSION_MINUTE_PRESETS.some((preset) => preset === parsedMinutes) ? String(parsedMinutes) : OTHER_DURATION;

  useEffect(() => {
    if (!otherDuration) return;
    const frame = window.requestAnimationFrame(() => minutesRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [otherDuration]);

  const openComplete = (booking: SessionBooking) => {
    setMinutesInput("30");
    setOtherDuration(false);
    setSessionCountry(booking.country || getMentorCountry(mentor) || "");
    setCompleteFor(booking);
  };
  const confirmComplete = () => {
    if (!completeFor || !minutesValid) return;
    completeMutation.mutate({ bookingId: completeFor.id, minutes: parsedMinutes, country: sessionCountry || undefined });
  };
  const countryChoices = sessionCountry && !REPORTING_COUNTRIES.includes(sessionCountry) ? [sessionCountry, ...REPORTING_COUNTRIES] : REPORTING_COUNTRIES;

  const renderList = (rows: SessionBooking[], emptyTitle: string, emptyBody: string) =>
    bookingsQuery.isLoading ? (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">{t("common.loading")}</span>
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    ) : bookingsQuery.isError ? (
      <BookingsError onRetry={() => bookingsQuery.refetch()} />
    ) : rows.length === 0 ? (
      <EmptyState icon={CalendarClock} title={emptyTitle} description={emptyBody} />
    ) : (
      <ul className="space-y-3">{rows.map(renderCard)}</ul>
    );

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upcoming" | "completed")}>
        <TabsList variant="pill" className="w-full sm:w-auto">
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            {t("dashboardV2.sessions.upcoming")}
            {upcoming.length > 0 && (
              <>
                {/* Read as "Completed (3)", not "Completed3". */}
                <span className="sr-only"> ({formatNumber(upcoming.length, i18n.language)})</span>
                <Badge tone="neutral" aria-hidden="true">{formatNumber(upcoming.length, i18n.language)}</Badge>
              </>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            {t("dashboardV2.sessions.completed")}
            {completed.length > 0 && (
              <>
                {/* Read as "Completed (3)", not "Completed3". */}
                <span className="sr-only"> ({formatNumber(completed.length, i18n.language)})</span>
                <Badge tone="neutral" aria-hidden="true">{formatNumber(completed.length, i18n.language)}</Badge>
              </>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          {renderList(upcoming, t("dashboardV2.sessions.emptyUpcomingTitle"), t("dashboardV2.sessions.emptyUpcomingBody"))}
        </TabsContent>
        <TabsContent value="completed">
          {renderList(completed, t("dashboardV2.sessions.emptyCompletedTitle"), t("dashboardV2.sessions.emptyCompletedBody"))}
        </TabsContent>
      </Tabs>

      {/* Complete session */}
      <Dialog open={!!completeFor} onOpenChange={(open) => !open && setCompleteFor(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-complete-session">
          <DialogHeader>
            <DialogTitle>{t("mentorPortal.completeSessionTitle")}</DialogTitle>
            <DialogDescription>{t("mentorPortal.completeSessionDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label id={`${ids}-duration-label`}>{t("mentorPortal.sessionDuration")}</Label>
              <ChipRadioGroup
                aria-labelledby={`${ids}-duration-label`}
                value={durationChoice}
                onValueChange={(value) => {
                  if (value === OTHER_DURATION) {
                    setOtherDuration(true);
                    return;
                  }
                  setOtherDuration(false);
                  setMinutesInput(value);
                }}
              >
                {SESSION_MINUTE_PRESETS.map((preset) => (
                  <ChipRadio key={preset} value={String(preset)} data-testid={`button-minutes-${preset}`}>
                    {t("mentorPortal.durationMinutes", { count: preset })}
                  </ChipRadio>
                ))}
                <ChipRadio value={OTHER_DURATION} data-testid="button-minutes-other">
                  {t("mentorPortal.otherDuration")}
                </ChipRadio>
              </ChipRadioGroup>
              {otherDuration && (
                <>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="input-session-minutes" className="sr-only">
                      {t("mentorPortal.sessionDuration")}
                    </Label>
                    <Input
                      ref={minutesRef}
                      id="input-session-minutes"
                      type="number"
                      inputMode="numeric"
                      min={MIN_SESSION_MINUTES}
                      max={MAX_SESSION_MINUTES}
                      value={minutesInput}
                      onChange={(event) => setMinutesInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") confirmComplete();
                      }}
                      aria-invalid={!minutesValid}
                      aria-describedby={`${ids}-minutes-hint`}
                      className="w-28"
                      data-testid="input-session-minutes"
                    />
                    <span className="text-body-sm text-muted-foreground">{t("mentorPortal.minutesLabel")}</span>
                  </div>
                  <p id={`${ids}-minutes-hint`} className={cn("text-caption", minutesValid ? "text-muted-foreground" : "text-destructive")}>
                    {minutesValid
                      ? t("mentorPortal.minutesHint", { min: MIN_SESSION_MINUTES, max: MAX_SESSION_MINUTES })
                      : t("mentorPortal.invalidDuration", { min: MIN_SESSION_MINUTES, max: MAX_SESSION_MINUTES })}
                  </p>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="select-session-country">{t("mentorPortal.sessionCountry")}</Label>
              <Select value={sessionCountry || NO_COUNTRY} onValueChange={(value) => setSessionCountry(value === NO_COUNTRY ? "" : value)}>
                <SelectTrigger id="select-session-country" data-testid="select-session-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COUNTRY}>{t("mentorPortal.sessionCountryNone")}</SelectItem>
                  {countryChoices.map((country) => (
                    <SelectItem key={country} value={country}>
                      {localizeCountry(country, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">{t("mentorPortal.sessionCountryHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompleteFor(null)} disabled={completeMutation.isPending} data-testid="button-cancel-complete">
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              className={ARIA_DISABLED_CLASS}
              onClick={confirmComplete}
              aria-disabled={!minutesValid || undefined}
              aria-describedby={!minutesValid ? `${ids}-minutes-hint` : undefined}
              loading={completeMutation.isPending}
              data-testid="button-confirm-complete"
            >
              <CheckCircle2 aria-hidden="true" />
              {t("mentorPortal.confirmComplete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes */}
      <Dialog open={!!notesFor} onOpenChange={(open) => !open && setNotesFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-notes-dialog-title">{t("dashboardV2.sessions.notesTitle")}</DialogTitle>
            <DialogDescription>
              {t("dashboardV2.sessions.notesDesc", { name: bidi(notesFor?.mentee?.name || t("dashboardV2.inbox.unknownMentee")) })}
            </DialogDescription>
          </DialogHeader>
          {notesFor && <BookingNotes bookingId={notesFor.id} authorType="mentor" authorEmail={mentorEmail || ""} extended />}
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelFor} onOpenChange={(open) => !open && setCancelFor(null)}>
        <AlertDialogContent data-testid="dialog-cancel-session">
          <AlertDialogHeader>
            <AlertDialogTitle>{cancelFor?.status === "accepted" ? t("dashboardV2.sessions.cancelRequestTitle") : t("dashboardV2.sessions.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(cancelFor?.status === "accepted" ? "dashboardV2.sessions.cancelRequestBody" : "dashboardV2.sessions.cancelBody", {
                name: bidi(cancelFor?.mentee?.name || t("dashboardV2.inbox.unknownMentee")),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelFor?.status === "accepted" ? t("dashboardV2.sessions.cancelRequestKeep") : t("dashboardV2.sessions.cancelKeep")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                if (cancelFor) cancelMutation.mutate(cancelFor.id);
                setCancelFor(null);
              }}
              data-testid="button-cancel-session-confirm"
            >
              {cancelFor?.status === "accepted" ? t("dashboardV2.sessions.cancelRequest") : t("dashboardV2.sessions.cancelConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MentorFeedbackDialog
        booking={feedbackFor}
        open={!!feedbackFor}
        onOpenChange={(open) => !open && setFeedbackFor(null)}
        mentorId={mentorId}
      />
    </div>
  );
}

/** Mentor-side feedback: rate the mentee once, read what the mentee wrote. */
function MentorFeedbackDialog({
  booking,
  open,
  onOpenChange,
  mentorId,
}: {
  booking: SessionBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mentorId: string;
}) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [showRatingError, setShowRatingError] = useState(false);
  const ids = useId();

  useEffect(() => {
    if (open && booking) {
      setRating(booking.mentor_rating || 0);
      setText(booking.mentor_feedback || "");
      setShowRatingError(false);
    }
  }, [open, booking]);

  const submit = useMutation({
    mutationFn: ({ bookingId, mentor_rating, mentor_feedback }: { bookingId: string; mentor_rating: number; mentor_feedback: string }) =>
      bookingService.submitMentorFeedback(bookingId, mentor_rating, mentor_feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentor", mentorId, "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onOpenChange(false);
      toast.success(t("dashboardV2.feedback.submitted"));
    },
    onError: () => toast.error(t("dashboardV2.feedback.submitError")),
  });

  const alreadyRated = !!booking?.mentor_rating;
  const menteeName = booking?.mentee?.name || t("dashboardV2.inbox.unknownMentee");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-feedback-dialog-title">{t("dashboardV2.sessions.feedbackTitle")}</DialogTitle>
          <DialogDescription>{t("dashboardV2.sessions.feedbackDesc", { name: bidi(menteeName) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <section aria-labelledby={`${ids}-yours`} className="space-y-3">
            <h3 id={`${ids}-yours`} className="text-body-sm font-medium text-foreground">
              {t("dashboardV2.feedback.yourFeedback")}
            </h3>
            {alreadyRated && booking ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                <StarRating rating={booking.mentor_rating ?? 0} readonly />
                {booking.mentor_feedback && (
                  <p dir="auto" className="text-body-sm text-foreground" data-testid="text-mentor-feedback">
                    {booking.mentor_feedback}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="space-y-2">
                  <p className="text-body-sm text-foreground">{t("dashboardV2.sessions.rateMentee")}</p>
                  <StarRating
                    rating={rating}
                    label={t("dashboardV2.sessions.rateMentee")}
                    onRate={(value) => {
                      setRating(value);
                      setShowRatingError(false);
                    }}
                  />
                  {showRatingError && (
                    <p role="alert" className="text-caption text-destructive">
                      {t("dashboardV2.feedback.ratingRequired")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${ids}-text`}>{t("dashboardV2.feedback.commentLabel")}</Label>
                  <Textarea
                    id={`${ids}-text`}
                    dir="auto"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t("dashboardV2.sessions.feedbackPlaceholder")}
                    className="min-h-24"
                    data-testid="input-feedback-text"
                  />
                </div>
              </div>
            )}
          </section>
          <section aria-labelledby={`${ids}-theirs`} className="space-y-3">
            <h3 id={`${ids}-theirs`} className="text-body-sm font-medium text-foreground">
              {t("dashboardV2.sessions.menteeFeedback")}
            </h3>
            {booking?.mentee_rating ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                <StarRating rating={booking.mentee_rating} readonly />
                {booking.mentee_feedback && (
                  <p dir="auto" className="text-body-sm text-foreground" data-testid="text-mentee-feedback">
                    {booking.mentee_feedback}
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-border p-4 text-body-sm text-muted-foreground" data-testid="text-no-mentee-feedback">
                {t("dashboardV2.sessions.noMenteeFeedback")}
              </p>
            )}
          </section>
        </div>
        {!alreadyRated && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={submit.isPending}
              onClick={() => {
                if (!booking) return;
                if (rating === 0) {
                  setShowRatingError(true);
                  return;
                }
                submit.mutate({ bookingId: booking.id, mentor_rating: rating, mentor_feedback: text.trim() });
              }}
              data-testid="button-submit-feedback"
            >
              {t("dashboardV2.feedback.submit")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
