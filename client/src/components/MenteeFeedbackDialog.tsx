import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { bookingService } from "@/lib/services";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Booking } from "@/lib/database";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function StarRating({ rating, onRate, readonly = false }: { rating: number; onRate?: (r: number) => void; readonly?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1" role={readonly ? undefined : "radiogroup"} aria-label={readonly ? undefined : t("myBookings.rateSession")}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readonly && onRate?.(star)}
          disabled={readonly}
          role={readonly ? undefined : "radio"}
          aria-checked={readonly ? undefined : star === rating}
          aria-label={`${star}/5`}
          className={`${readonly ? "cursor-default" : "cursor-pointer hover:scale-110"} transition-transform`}
          data-testid={`star-${star}`}
        >
          <Star className={`w-6 h-6 ${star <= rating ? "fill-[#FF9900] text-[#FF9900]" : "text-muted-foreground"}`} />
        </button>
      ))}
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
 * mentor (once) and read what the mentor wrote back. Shared by the mentee
 * dashboard and /my-bookings so there is exactly one implementation.
 */
export function MenteeFeedbackDialog({ booking, open, onOpenChange, invalidateKeys, onSubmitted }: MenteeFeedbackDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");

  useEffect(() => {
    if (open && booking) {
      setRating(booking.mentee_rating || 0);
      setText(booking.mentee_feedback || "");
    }
  }, [open, booking]);

  const submit = useMutation({
    mutationFn: (data: { bookingId: string; rating: number; feedback: string }) =>
      bookingService.submitMenteeFeedback(data.bookingId, data.rating, data.feedback),
    onSuccess: (_result, variables) => {
      invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      onOpenChange(false);
      toast({ title: t("myBookings.feedbackSubmitted"), description: t("myBookings.feedbackSubmittedDesc") });
      onSubmitted?.(variables.bookingId);
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("myBookings.feedbackSubmitError"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-mentee-feedback">
        <DialogHeader>
          <DialogTitle>{booking?.mentee_rating ? t("myBookings.sessionFeedback") : t("myBookings.giveFeedbackTitle")}</DialogTitle>
          <DialogDescription>{booking?.mentee_rating ? t("myBookings.feedbackViewDesc") : t("myBookings.feedbackGiveDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="space-y-4">
            <h4 className="font-medium text-base">{t("myBookings.yourFeedback")}</h4>
            {booking?.mentee_rating ? (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t("myBookings.yourRating")}:</span>
                  <StarRating rating={booking.mentee_rating} readonly />
                </div>
                {booking.mentee_feedback && (
                  <div>
                    <span className="text-sm text-muted-foreground">{t("myBookings.yourComment")}:</span>
                    <p className="mt-1 text-sm">{booking.mentee_feedback}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <Label>{t("myBookings.rateSession")}</Label>
                  <StarRating rating={rating} onRate={setRating} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mentee-feedback-text">{t("myBookings.writeFeedback")}</Label>
                  <Textarea
                    id="mentee-feedback-text"
                    placeholder={t("myBookings.feedbackPlaceholder")}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-24"
                    data-testid="input-feedback-text"
                  />
                </div>
                <Button
                  onClick={() => booking && submit.mutate({ bookingId: booking.id, rating, feedback: text.trim() })}
                  disabled={!booking || rating === 0 || submit.isPending}
                  className="w-full bg-[#FF9900] hover:bg-[#E88B00] text-white"
                  data-testid="button-submit-feedback"
                >
                  {submit.isPending ? t("common.loading") : t("myBookings.submitFeedback")}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-base">{t("myBookings.mentorFeedback")}</h4>
            {booking?.mentor_rating ? (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t("myBookings.mentorRating")}:</span>
                  <StarRating rating={booking.mentor_rating} readonly />
                </div>
                {booking.mentor_feedback && (
                  <div>
                    <span className="text-sm text-muted-foreground">{t("myBookings.mentorComment")}:</span>
                    <p className="mt-1 text-sm">{booking.mentor_feedback}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">{t("myBookings.noMentorFeedback")}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
