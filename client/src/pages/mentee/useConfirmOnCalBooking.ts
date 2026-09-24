import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { embedOutcomeToastKey, isRecordable, type CalBookingSuccess } from "@/lib/calEvents";
import { bidi } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { bookingService } from "@/lib/services";

/**
 * When the Cal.com embed reports a booking (or a reschedule), record it with
 * `record_cal_booking_from_embed` (design B7, F28/F45) and tell the mentee
 * what happened, by outcome:
 * - `confirmed` → "Session confirmed";
 * - `requested` → the mentor's event type requires confirmation: "Waiting for
 *   {mentor} to confirm the time on Cal.com" (the row stays accepted);
 * - `rescheduled` / `reschedule_requested` → moved / waiting;
 * - `already_recorded` (the webhook got there first) → a silent refetch.
 * An error leaves the row as it was, with an error toast. The webhook is the
 * second path, so a failed save here is usually repaired within seconds.
 *
 * Signature unchanged: `(bookingId, mentorName?) => (detail) => void`.
 */
export function useConfirmOnCalBooking(menteeId: string) {
  const { t } = useTranslation();
  const recordMutation = useMutation({
    mutationFn: ({ bookingId, detail }: { bookingId: string; detail: CalBookingSuccess; mentorName?: string }) =>
      bookingService.recordCalBooking(bookingId, detail),
    onSuccess: (outcome, { mentorName }) => {
      const key = embedOutcomeToastKey(outcome);
      if (!key) return;
      const name = bidi(mentorName || t("dashboardV2.row.unknownMentor"));
      if (outcome === "confirmed") toast.success(t(key), { description: t("dashboardV2.cal.toastConfirmedBody") });
      else if (outcome === "rescheduled") toast.success(t(key));
      else toast.info(t(key, { name }));
    },
    onError: (_error, { detail }) => {
      toast.error(isRecordable(detail) ? t("dashboardV2.cal.confirmError") : t("dashboardV2.cal.recordIncomplete"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["mentee", menteeId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const { mutate } = recordMutation;
  return useCallback(
    (bookingId: string, mentorName?: string) => (detail: CalBookingSuccess) => mutate({ bookingId, detail, mentorName }),
    [mutate],
  );
}
