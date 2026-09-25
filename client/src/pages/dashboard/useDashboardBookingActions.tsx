import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { isBookingNotPendingError, isBookingStateChangedError, type Booking } from "@/lib/database";
import { bookingService } from "@/lib/services";
import type { DashboardBooking } from "@/pages/dashboard/dataSource";

/**
 * Database-mode booking actions for `/dashboard/bookings` (design C5, F02).
 * Every action is a mutation against Supabase through the booking services;
 * the success toast appears only after the write succeeded (a write that
 * changed no row — RLS or the status guard said no — counts as a failure),
 * and every outcome refetches the dashboard, analytics, notifications and the
 * legacy portals' caches. Booking lifecycle events are written by the
 * database trigger, never logged from here (D9). A write that lost a race
 * (the booking was answered, cancelled or completed elsewhere in the
 * meantime, R1-16) changes nothing and says so instead of the generic error.
 */
export type BookingAction = "accept" | "decline" | "cancel" | "withdraw" | "complete";

/** A write that matched no row (RLS or the transition guard refused) must not look like success. */
function ensureWritten<T>(row: T | null | undefined): T {
  if (!row) throw new Error("booking_not_updated");
  return row;
}

export function useDashboardBookingActions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const refresh = () =>
    Promise.all(
      [["dashboard"], ["analytics"], ["notifications"], ["activity"], ["mentor"], ["mentee"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  const options = (successKey: string) => ({
    onSuccess: async () => {
      await refresh();
      toast.success(t(successKey));
    },
    onError: async (error: Error) => {
      // Show the database's truth again (the row may have changed underneath us).
      await refresh();
      const stale = isBookingStateChangedError(error) || isBookingNotPendingError(error);
      toast.error(t(stale ? "showcase.bookings.toast.stale" : "showcase.bookings.toast.error"));
    },
  });

  const accept = useMutation({
    mutationFn: async (b: Pick<Booking, "id">) => ensureWritten(await bookingService.accept(b.id)),
    ...options("showcase.bookings.toast.accepted"),
  });
  const decline = useMutation({
    mutationFn: async (b: Pick<Booking, "id">) => ensureWritten(await bookingService.decline(b.id)),
    ...options("showcase.bookings.toast.declined"),
  });
  const cancel = useMutation({
    mutationFn: async (b: Pick<Booking, "id">) => ensureWritten(await bookingService.updateStatus(b.id, "canceled")),
    ...options("showcase.bookings.toast.canceled"),
  });
  const withdraw = useMutation({
    mutationFn: async (b: Pick<Booking, "id">) => ensureWritten(await bookingService.updateStatus(b.id, "canceled")),
    ...options("showcase.bookings.toast.withdrawn"),
  });
  const complete = useMutation({
    mutationFn: async ({ booking, minutes, country }: { booking: Pick<Booking, "id">; minutes: number; country?: string }) =>
      ensureWritten(await bookingService.complete(booking.id, { sessionDurationMinutes: minutes, country })),
    ...options("showcase.bookings.toast.completed"),
  });

  const mutations = { accept, decline, cancel, withdraw, complete };

  /** Which action (if any) is in flight for a row, so only that row shows a spinner. */
  const pendingFor = (b: Pick<DashboardBooking, "id">): BookingAction | null => {
    if (accept.isPending && accept.variables?.id === b.id) return "accept";
    if (decline.isPending && decline.variables?.id === b.id) return "decline";
    if (cancel.isPending && cancel.variables?.id === b.id) return "cancel";
    if (withdraw.isPending && withdraw.variables?.id === b.id) return "withdraw";
    if (complete.isPending && complete.variables?.booking.id === b.id) return "complete";
    return null;
  };

  return { ...mutations, pendingFor };
}
