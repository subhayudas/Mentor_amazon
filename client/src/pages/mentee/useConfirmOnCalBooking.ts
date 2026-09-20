import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { CalBookingSuccess } from "@/components/CalEmbed";
import { toast } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { bookingService } from "@/lib/services";

/**
 * When Cal.com reports a successful booking inside the embed, move the
 * accepted request to confirmed (with the slot time) so both dashboards and
 * the analytics see a scheduled session — no server-side webhook needed.
 * Failure is reported (the row stays "Accepted" so the person can retry).
 */
export function useConfirmOnCalBooking(menteeId: string) {
  const { t } = useTranslation();
  const confirmMutation = useMutation({
    mutationFn: ({ bookingId, detail }: { bookingId: string; detail: CalBookingSuccess }) =>
      bookingService.confirm(bookingId, { scheduledAt: detail.startTime, calEventUri: detail.uid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentee", menteeId, "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["mentee", menteeId, "stats"] });
      toast.success(t("menteePortal.sessionConfirmedToast"), { description: t("menteePortal.sessionScheduledDesc") });
    },
    onError: () => {
      toast.error(t("dashboardV2.cal.confirmError"));
    },
  });
  return useCallback(
    (bookingId: string) => (detail: CalBookingSuccess) => confirmMutation.mutate({ bookingId, detail }),
    [confirmMutation],
  );
}
