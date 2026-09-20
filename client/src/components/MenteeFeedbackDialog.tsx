import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";

import { bookingService } from "@/lib/services";
import { queryClient } from "@/lib/queryClient";
import { toast } from "sonner";
import type { Booking } from "@/lib/database";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Star rating (D6): an ARIA radio group with roving focus — one Tab stop,
 * arrow keys move the value, each star is named "n of 5". The read-only
 * variant is plain text ("4 of 5") with decorative stars, not disabled buttons.
 */
export function StarRating({
  rating,
  onRate,
  readonly = false,
  label,
  className,
  id,
  invalid,
  describedBy,
}: {
  rating: number;
  onRate?: (r: number) => void;
  readonly?: boolean;
  label?: string;
  className?: string;
  /** Element id for the interactive group (so callers can move focus to it). */
  id?: string;
  /** Marks the group invalid and links its error message. */
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t, i18n } = useTranslation();
  const name = label ?? t("dashboardV2.feedback.rateLabel");
  const stars = [1, 2, 3, 4, 5];
  const a11yValue = t("dashboardV2.feedback.starsOf", { count: rating, value: formatNumber(rating, i18n.language) });

  if (readonly) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)} data-testid="rating-readonly">
        <span className="inline-flex gap-0.5" aria-hidden="true">
          {stars.map((star) => (
            <Star
              key={star}
              className={cn("size-4", star <= rating ? "fill-brand-orange text-brand-orange" : "text-border")}
              strokeWidth={1.75}
            />
          ))}
        </span>
        <span className="text-body-sm text-foreground tabular-nums">{a11yValue}</span>
      </span>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const dir = document.documentElement.dir === "rtl" && (event.key === "ArrowRight" || event.key === "ArrowLeft") ? -delta : delta;
    const next = Math.min(5, Math.max(1, (rating || 0) + dir));
    onRate?.(next);
    (event.currentTarget.querySelector<HTMLButtonElement>(`[data-star="${next}"]`))?.focus();
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={name}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      className={cn("flex gap-1", className)}
    >
      {stars.map((star) => {
        const checked = star === rating;
        const filled = star <= rating;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={t("dashboardV2.feedback.starLabel", { count: star })}
            tabIndex={checked || (!rating && star === 1) ? 0 : -1}
            data-star={star}
            onClick={() => onRate?.(star)}
            className="grid size-9 place-items-center rounded-md transition-colors duration-fast hover:bg-muted"
            data-testid={`star-${star}`}
          >
            <Star className={cn("size-6", filled ? "fill-brand-orange text-brand-orange" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

interface MenteeFeedbackDialogProps {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** react-query keys to invalidate after a successful submission. */
  invalidateKeys: unknown[][];
  /** Called with the booking id after a successful submission (for anchored feedback). */
  onSubmitted?: (bookingId: string) => void;
}

/**
 * Two-way feedback for a completed session, from the mentee's side: rate the
 * mentor (once) and read what the mentor wrote back. After a submission the
 * dialog closes and the rated row on the page shows the rating and rings
 * (anchored feedback), so the toast is only secondary confirmation.
 */
export function MenteeFeedbackDialog({ booking, open, onOpenChange, invalidateKeys, onSubmitted }: MenteeFeedbackDialogProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [showRatingError, setShowRatingError] = useState(false);
  const ids = useId();

  useEffect(() => {
    if (open && booking) {
      setRating(booking.mentee_rating || 0);
      setText(booking.mentee_feedback || "");
      setShowRatingError(false);
    }
  }, [open, booking]);

  const submit = useMutation({
    mutationFn: (data: { bookingId: string; rating: number; feedback: string }) =>
      bookingService.submitMenteeFeedback(data.bookingId, data.rating, data.feedback),
    onSuccess: (_result, variables) => {
      invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      onOpenChange(false);
      toast.success(t("dashboardV2.feedback.submitted"), { description: t("dashboardV2.feedback.submittedDesc") });
      onSubmitted?.(variables.bookingId);
    },
    onError: () => {
      toast.error(t("dashboardV2.feedback.submitError"));
    },
  });

  const alreadyRated = !!booking?.mentee_rating;

  const handleSubmit = () => {
    if (!booking) return;
    if (rating === 0) {
      setShowRatingError(true);
      // Announce next to the group and move focus to its Tab stop.
      document.getElementById(`${ids}-stars`)?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
      return;
    }
    submit.mutate({ bookingId: booking.id, rating, feedback: text.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-mentee-feedback">
        <DialogHeader>
          <DialogTitle>{alreadyRated ? t("dashboardV2.feedback.viewTitle") : t("dashboardV2.feedback.giveTitle")}</DialogTitle>
          <DialogDescription>{alreadyRated ? t("dashboardV2.feedback.viewDesc") : t("dashboardV2.feedback.giveDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section aria-labelledby={`${ids}-yours`} className="space-y-3">
            <h3 id={`${ids}-yours`} className="text-body-sm font-medium text-foreground">
              {t("dashboardV2.feedback.yourFeedback")}
            </h3>
            {alreadyRated && booking ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                <StarRating rating={booking.mentee_rating ?? 0} readonly />
                {booking.mentee_feedback && (
                  <p dir="auto" className="text-body-sm text-foreground">{booking.mentee_feedback}</p>
                )}
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="space-y-2">
                  <p className="text-body-sm text-foreground" id={`${ids}-rate`}>{t("dashboardV2.feedback.rateLabel")}</p>
                  <StarRating
                    id={`${ids}-stars`}
                    rating={rating}
                    invalid={showRatingError}
                    describedBy={showRatingError ? `${ids}-rating-error` : undefined}
                    onRate={(value) => {
                      setRating(value);
                      setShowRatingError(false);
                    }}
                  />
                  {showRatingError && (
                    <p id={`${ids}-rating-error`} role="alert" className="text-caption text-destructive">
                      {t("dashboardV2.feedback.ratingRequired")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${ids}-text`}>{t("dashboardV2.feedback.commentLabel")}</Label>
                  <Textarea
                    id={`${ids}-text`}
                    dir="auto"
                    placeholder={t("dashboardV2.feedback.commentPlaceholder")}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-24"
                    data-testid="input-feedback-text"
                  />
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby={`${ids}-mentor`} className="space-y-3">
            <h3 id={`${ids}-mentor`} className="text-body-sm font-medium text-foreground">
              {t("dashboardV2.feedback.mentorFeedback")}
            </h3>
            {booking?.mentor_rating ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                <StarRating rating={booking.mentor_rating} readonly />
                {booking.mentor_feedback && (
                  <p dir="auto" className="text-body-sm text-foreground">{booking.mentor_feedback}</p>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-border p-4 text-body-sm text-muted-foreground">
                {t("dashboardV2.feedback.noMentorFeedback")}
              </p>
            )}
          </section>
        </div>

        {!alreadyRated && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={handleSubmit} loading={submit.isPending} data-testid="button-submit-feedback">
              {t("dashboardV2.feedback.submit")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
