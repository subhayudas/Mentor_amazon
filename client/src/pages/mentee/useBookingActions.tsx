import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

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
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalEmbed } from "@/components/CalEmbed";
import { MenteeFeedbackDialog } from "@/components/MenteeFeedbackDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingNotes } from "@/components/dashboard/BookingNotes";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { textLinkClass } from "@/components/profile/styles";
import { calCancelUrl } from "@/lib/calLink";
import { isCalUid } from "@/lib/calEvents";
import type { Mentee } from "@/lib/database";
import { bidi } from "@/lib/format";
import { credentialLine, localizedField } from "@/lib/localized";
import type { BookingWithMentor } from "@/lib/menteeBookings";
import { queryClient } from "@/lib/queryClient";
import { bookingService } from "@/lib/services";
import { useConfirmOnCalBooking } from "@/pages/mentee/useConfirmOnCalBooking";
import { MentorAvatar, useSessionTime } from "@/pages/mentee/BookingRow";
import type { BookingRowActions } from "@/pages/mentee/BookingRow";

type ConfirmKind = "withdraw" | "cancelRequest" | "cancelSession";
type Confirm = { kind: ConfirmKind; booking: BookingWithMentor };
/** The Cal.com dialog: a first booking for an accepted request, or moving a confirmed one. */
type Scheduling = { booking: BookingWithMentor; rescheduleUid?: string };

const HIGHLIGHT_MS = 2500;

/**
 * Every mentee-side booking action and the dialogs behind them, shared by the
 * Overview and Bookings panels so the two never drift:
 * - withdraw / cancel → AlertDialog (opens on the safe choice) → updateStatus('canceled');
 *   cancelling a session booked on Cal.com also links to Cal.com's own cancel page
 * - choose a time → the Cal.com embed in a stock dialog, only ever on click,
 *   tagged with the booking id; the result is recorded by `useConfirmOnCalBooking`
 * - reschedule → the same dialog on Cal.com's reschedule page for the booking's uid
 * - view request → goal + notes/tasks dialog (moved here from /my-bookings)
 * - rate → MenteeFeedbackDialog; afterwards the rated row scrolls into view
 *   and rings for 2.5 s (anchored feedback, TESTING e8)
 */
export function useBookingActions(menteeId: string, mentee: Mentee) {
  const { t, i18n } = useTranslation();
  const onCalBooked = useConfirmOnCalBooking(menteeId);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [viewing, setViewing] = useState<BookingWithMentor | null>(null);
  const [scheduling, setScheduling] = useState<Scheduling | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [rating, setRating] = useState<BookingWithMentor | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // Every row with a PATCH in flight, not just the latest one (F-37): a second
  // withdraw while the first is pending must not drop the first row's spinner.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const highlightTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["mentee", menteeId, "bookings"] });
    queryClient.invalidateQueries({ queryKey: ["mentee", menteeId, "stats"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const cancelMutation = useMutation({
    mutationFn: ({ booking }: Confirm) => bookingService.updateStatus(booking.id, "canceled"),
    onMutate: ({ booking }) => {
      setPendingIds((ids) => new Set(ids).add(booking.id));
    },
    onSuccess: (_row, { kind, booking }) => {
      invalidate();
      // The kind travels with the mutation: `confirm` is already cleared by now.
      toast.success(kind === "cancelSession" ? t("dashboardV2.confirm.sessionCancelled") : t("dashboardV2.confirm.requestWithdrawn"));
      highlight(booking.id);
    },
    onError: () => {
      toast.error(t("dashboardV2.confirm.error"));
    },
    onSettled: (_row, _error, { booking }) => {
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(booking.id);
        return next;
      });
    },
  });

  const highlight = useCallback((bookingId: string) => {
    setHighlightedId(bookingId);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightedId((current) => (current === bookingId ? null : current)), HIGHLIGHT_MS);
    window.setTimeout(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(`[data-booking-card="${CSS.escape(bookingId)}"]`));
      const visible = cards.find((el) => el.offsetParent !== null) ?? cards[0];
      visible?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }, []);

  const actions: BookingRowActions = {
    onChooseTime: (booking) => {
      setScheduling({ booking });
      setCalOpen(true);
    },
    onReschedule: (booking) => {
      if (!isCalUid(booking.cal_event_uri)) return;
      setScheduling({ booking, rescheduleUid: booking.cal_event_uri });
      setCalOpen(true);
    },
    onWithdraw: (booking) => setConfirm({ kind: "withdraw", booking }),
    onCancelRequest: (booking) => setConfirm({ kind: "cancelRequest", booking }),
    onCancelSession: (booking) => setConfirm({ kind: "cancelSession", booking }),
    onView: (booking) => setViewing(booking),
    onRate: (booking) => {
      setRating(booking);
      setFeedbackOpen(true);
    },
    pendingIds,
  };

  const mentorName = (booking: BookingWithMentor | null) =>
    localizedField(booking?.mentor, "name", i18n.language) || t("dashboardV2.row.unknownMentor");

  const { format, zoneLabel } = useSessionTime();

  const copy = confirm
    ? {
        withdraw: {
          title: t("dashboardV2.confirm.withdrawTitle"),
          body: t("dashboardV2.confirm.withdrawBody", { name: bidi(mentorName(confirm.booking)) }),
          action: t("dashboardV2.confirm.withdrawAction"),
          keep: t("dashboardV2.confirm.withdrawKeep"),
        },
        cancelRequest: {
          title: t("dashboardV2.confirm.cancelRequestTitle"),
          body: t("dashboardV2.confirm.cancelRequestBody", { name: bidi(mentorName(confirm.booking)) }),
          action: t("dashboardV2.confirm.cancelRequestAction"),
          keep: t("dashboardV2.confirm.withdrawKeep"),
        },
        cancelSession: {
          title: t("dashboardV2.confirm.cancelSessionTitle"),
          body: isCalUid(confirm.booking.cal_event_uri)
            ? t("dashboardV2.confirm.cancelSessionCalBody")
            : t("dashboardV2.confirm.cancelSessionBody"),
          action: t("dashboardV2.confirm.cancelSessionAction"),
          keep: t("dashboardV2.confirm.cancelSessionKeep"),
        },
      }[confirm.kind]
    : null;
  const calCancelUid = confirm?.kind === "cancelSession" && isCalUid(confirm.booking.cal_event_uri) ? confirm.booking.cal_event_uri : null;

  const dialogs = (
    <>
      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent data-testid="dialog-confirm-booking">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy?.body}</AlertDialogDescription>
            {calCancelUid && (
              <a
                href={calCancelUrl(calCancelUid)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${textLinkClass} inline-flex items-center gap-1.5 self-start`}
                data-testid="link-cancel-in-cal"
              >
                {t("dashboardV2.confirm.cancelInCal")}
                <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </a>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-keep">{copy?.keep}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                if (confirm) cancelMutation.mutate(confirm);
                setConfirm(null);
              }}
              data-testid="button-confirm-cancel"
            >
              {copy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-2xl" data-testid="dialog-view-request">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{t("dashboardV2.view.title", { name: bidi(mentorName(viewing)) })}</DialogTitle>
                <DialogDescription>{credentialLine(viewing.mentor, i18n.language) || t("dashboardV2.view.description")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <MentorAvatar mentor={viewing.mentor} size="sm" />
                  <StatusBadge status={viewing.status} />
                  {viewing.scheduled_at && (
                    <span className="text-body-sm text-muted-foreground tabular-nums">
                      {format(viewing.scheduled_at)} · {zoneLabel}
                    </span>
                  )}
                </div>
                <section className="space-y-1.5">
                  <h3 className="text-body-sm font-medium text-foreground">{t("dashboardV2.view.goal")}</h3>
                  <p dir="auto" className="whitespace-pre-line text-body-sm text-foreground text-pretty" data-testid="text-request-goal">
                    {viewing.goal || t("dashboardV2.view.noGoal")}
                  </p>
                </section>
                <BookingNotes bookingId={viewing.id} authorType="mentee" authorEmail={mentee.email} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {scheduling && (scheduling.rescheduleUid || scheduling.booking.mentor?.cal_link) && (
        <CalEmbed
          calLink={scheduling.booking.mentor?.cal_link ?? ""}
          mentorName={mentorName(scheduling.booking)}
          menteeName={mentee.name}
          menteeEmail={mentee.email}
          bookingId={scheduling.booking.id}
          rescheduleUid={scheduling.rescheduleUid}
          open={calOpen}
          onOpenChange={setCalOpen}
          onBookingSuccessful={onCalBooked(scheduling.booking.id, mentorName(scheduling.booking))}
        />
      )}

      <MenteeFeedbackDialog
        booking={rating}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        invalidateKeys={[["mentee", menteeId, "bookings"], ["mentee", menteeId, "feedback"], ["mentee", menteeId, "stats"]]}
        onSubmitted={highlight}
      />
    </>
  );

  return { actions, dialogs, highlightedId };
}
