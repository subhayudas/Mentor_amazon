import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Ban, CalendarCheck, Check, Clock, MailCheck, XCircle, type LucideIcon } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { Booking } from "@/lib/database";
import { cn } from "@/lib/utils";

/**
 * Booking status badge (spec §3, P2-8): text + colour + icon, never colour
 * alone, never an instruction inside the badge (the row's action carries
 * "Choose a time"). One status → tone map, shared with the RequestRail states.
 */
export type BookingStatus = Booking["status"];

export const bookingStatusTone: Record<BookingStatus, BadgeTone> = {
  pending: "warning",
  accepted: "info",
  confirmed: "success",
  completed: "neutral",
  canceled: "neutral",
  rejected: "danger",
};

const STATUS_ICON: Record<BookingStatus, LucideIcon> = {
  pending: Clock,
  accepted: MailCheck,
  confirmed: CalendarCheck,
  completed: Check,
  canceled: XCircle,
  rejected: Ban,
};

/** Translated label for tables and plain text ("Awaiting mentor", "Scheduled", …). */
export function bookingStatusLabel(status: BookingStatus, t: TFunction): string {
  return t(`status.${status}`);
}

export interface StatusBadgeProps {
  status: BookingStatus;
  className?: string;
  /** Hide the leading icon (dense tables). */
  hideIcon?: boolean;
}

export function StatusBadge({ status, className, hideIcon = false }: StatusBadgeProps) {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={bookingStatusTone[status]} className={cn(className)} data-status={status}>
      {!hideIcon && <Icon aria-hidden="true" strokeWidth={2} />}
      {bookingStatusLabel(status, t)}
    </Badge>
  );
}
