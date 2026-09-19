import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  dialogCloseClassName,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { bidi } from "@/lib/format";

// The Cal.com embed (and the embed.js snippet it injects from app.cal.com) is only
// needed once a mentee opens a scheduling dialog, so it is loaded on demand and
// never ships in a route chunk.
const Cal = lazy(() => import("@calcom/embed-react"));

/** Resolves Cal.com's global API (e.g. to listen for `bookingSuccessful`), loading the embed on first call. */
export function loadCalApi(options?: { embedJsUrl?: string; namespace?: string }) {
  return import("@calcom/embed-react").then((m) => m.getCalApi(options));
}

/** What Cal.com hands back when a slot is booked through the embed. */
export interface CalBookingSuccess {
  /** ISO start time of the scheduled slot, when Cal.com provides it. */
  startTime?: string;
  /** Cal.com booking uid, when provided. */
  uid?: string;
}

interface CalEmbedProps {
  calLink: string;
  mentorName: string;
  /** Prefills the Cal.com form so the mentor sees who booked. */
  menteeName?: string;
  menteeEmail?: string;
  bookingId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once when Cal.com reports `bookingSuccessful` while this dialog is open. */
  onBookingSuccessful?: (detail: CalBookingSuccess) => void;
}

/** Longest we wait for Cal's `linkReady` before assuming the iframe is showing. */
const READY_FALLBACK_MS = 4000;

function CalDialogSkeleton({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 space-y-4 bg-card p-6" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

/**
 * Cal.com scheduling dialog (C16/B8): a stock `DialogContent` (no custom
 * positioning, no hidden Radix close), opened only from an explicit "Choose a
 * time" action — never on data arrival. The mentee confirms the slot inside
 * Cal.com; the `bookingSuccessful` event moves the booking to confirmed.
 */
export function CalEmbed({
  calLink,
  mentorName,
  menteeName,
  menteeEmail,
  bookingId,
  open,
  onOpenChange,
  onBookingSuccessful,
}: CalEmbedProps) {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const calUsername = extractCalUsername(calLink);

  // Listen for the embed's bookingSuccessful event so the app can move the
  // booking from accepted to confirmed without a server-side webhook.
  useEffect(() => {
    if (!open || !onBookingSuccessful) return;
    let disposed = false;
    let fired = false;
    const handler = (e: { detail?: { data?: Record<string, unknown> } }) => {
      if (disposed || fired) return;
      fired = true;
      const data = (e?.detail?.data ?? {}) as Record<string, unknown>;
      const booking = (data.booking ?? {}) as Record<string, unknown>;
      const startTime = [data.startTime, booking.startTime, data.date].find((v) => typeof v === "string") as string | undefined;
      const uid = [booking.uid, data.uid, data.bookingId].find((v) => typeof v === "string") as string | undefined;
      onBookingSuccessful({ startTime, uid });
    };
    loadCalApi().then((cal) => {
      if (disposed) return;
      cal("on", { action: "bookingSuccessful", callback: handler as never });
    });
    return () => {
      disposed = true;
      loadCalApi().then((cal) => cal("off", { action: "bookingSuccessful", callback: handler as never })).catch(() => undefined);
    };
  }, [open, onBookingSuccessful, bookingId]);

  // The skeleton lifts when Cal reports the link ready, or after a grace period.
  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    let disposed = false;
    const onReady = () => {
      if (!disposed) setReady(true);
    };
    loadCalApi().then((cal) => {
      if (disposed) return;
      cal("on", { action: "linkReady", callback: onReady as never });
    });
    const fallback = window.setTimeout(onReady, READY_FALLBACK_MS);
    return () => {
      disposed = true;
      window.clearTimeout(fallback);
      loadCalApi().then((cal) => cal("off", { action: "linkReady", callback: onReady as never })).catch(() => undefined);
    };
  }, [open]);

  const title = t("dashboardV2.cal.title", { name: bidi(mentorName) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[min(90dvh,860px)] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        data-testid="dialog-cal-embed"
      >
        <DialogClose className={dialogCloseClassName} data-testid="cal-embed-close-button">
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">{t("common.close")}</span>
        </DialogClose>
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {calUsername ? t("dashboardV2.cal.description") : t("dashboardV2.cal.unavailableBody")}
          </DialogDescription>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {calUsername ? (
            <>
              <Suspense fallback={null}>
                <Cal
                  calLink={calUsername}
                  style={{ width: "100%", height: "100%", minHeight: "600px", overflow: "auto" }}
                  config={{
                    ...(menteeName ? { name: menteeName } : {}),
                    ...(menteeEmail ? { email: menteeEmail } : {}),
                  }}
                />
              </Suspense>
              {!ready && <CalDialogSkeleton label={t("dashboardV2.cal.loading")} />}
            </>
          ) : (
            <p className="p-6 text-body-sm text-muted-foreground" role="status">
              {t("dashboardV2.cal.unavailableTitle")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function extractCalUsername(calLink: string): string | null {
  if (!calLink) return null;
  try {
    if (calLink.startsWith("http")) {
      const url = new URL(calLink);
      const pathname = url.pathname.replace(/^\//, "");
      return pathname || null;
    }
    return calLink;
  } catch {
    return calLink.replace(/^\//, "") || null;
  }
}
