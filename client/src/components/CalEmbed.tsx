import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import {
  calEmbedConfig,
  calEmbedLink,
  calSuccessEvent,
  parseBookingSuccessV2,
  parseRescheduleSuccessV2,
  type CalBookingSuccess,
} from "@/lib/calEvents";
import { bidi } from "@/lib/format";

// The Cal.com embed (and the embed.js snippet it injects from app.cal.com) is only
// needed once a mentee opens a scheduling dialog, so it is loaded on demand and
// never ships in a route chunk.
const Cal = lazy(() => import("@calcom/embed-react"));

/**
 * The one Cal.com embed namespace the app uses. The inline embed and the event API must
 * share it: `getCalApi()` without a namespace registers a second, empty-named instance next
 * to the embed's global one, which then receives the iframe's `__iframeReady` without owning
 * an iframe and throws ("createIframe must be called before doInIframe").
 */
export const CAL_NAMESPACE = "mentorconnect";

/** Resolves the Cal.com API of `CAL_NAMESPACE` (e.g. to listen for `bookingSuccessfulV2`), loading the embed on first call. */
export function loadCalApi(options?: { embedJsUrl?: string }) {
  return import("@calcom/embed-react").then((m) => m.getCalApi({ ...options, namespace: CAL_NAMESPACE }));
}

/** What Cal.com hands back when a slot is booked (or moved) through the embed; see `lib/calEvents.ts`. */
export type { CalBookingSuccess };

interface CalEmbedProps {
  calLink: string;
  mentorName: string;
  /** Prefills the Cal.com form so the mentor sees who booked. */
  menteeName?: string;
  menteeEmail?: string;
  /** Our booking id: sent to Cal.com as `metadata[mc_booking]` so the webhook can match exactly. */
  bookingId?: string;
  /** Reschedule an existing Cal.com booking (its uid) instead of booking a new one. */
  rescheduleUid?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once per opening when Cal.com reports the booking (or the reschedule). */
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
 * Cal.com scheduling dialog (C16/B8, design B6): a stock `DialogContent`,
 * opened only from an explicit "Choose a time" / "Reschedule" action — never
 * on data arrival. The booking form is prefilled with the mentee's name and
 * email and carries `metadata[mc_booking]`; the webhook cross-checks that hint
 * against the mentor and an attendee email before trusting it. With
 * `rescheduleUid` the dialog opens Cal.com's reschedule page for that booking
 * and listens for `rescheduleBookingSuccessfulV2`; otherwise it listens for
 * `bookingSuccessfulV2` (the V1 events are deprecated).
 */
export function CalEmbed({
  calLink,
  mentorName,
  menteeName,
  menteeEmail,
  bookingId,
  rescheduleUid,
  open,
  onOpenChange,
  onBookingSuccessful,
}: CalEmbedProps) {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const link = calEmbedLink(calLink, rescheduleUid);
  const config = useMemo(() => calEmbedConfig({ menteeName, menteeEmail, bookingId }), [menteeName, menteeEmail, bookingId]);
  // Latest callback without re-subscribing when the parent re-renders.
  const onSuccessRef = useRef(onBookingSuccessful);
  onSuccessRef.current = onBookingSuccessful;
  const hasListener = Boolean(onBookingSuccessful);

  useEffect(() => {
    if (!open || !hasListener) return;
    let disposed = false;
    let fired = false;
    const action = calSuccessEvent(rescheduleUid);
    const handler = (event: unknown) => {
      if (disposed || fired) return;
      fired = true;
      const detail = rescheduleUid ? parseRescheduleSuccessV2(event, rescheduleUid) : parseBookingSuccessV2(event);
      onSuccessRef.current?.(detail);
    };
    loadCalApi()
      .then((cal) => {
        if (!disposed) cal("on", { action, callback: handler as never });
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      loadCalApi()
        .then((cal) => cal("off", { action, callback: handler as never }))
        .catch(() => undefined);
    };
  }, [open, hasListener, bookingId, rescheduleUid]);

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
    loadCalApi()
      .then((cal) => {
        if (!disposed) cal("on", { action: "linkReady", callback: onReady as never });
      })
      .catch(() => undefined);
    const fallback = window.setTimeout(onReady, READY_FALLBACK_MS);
    return () => {
      disposed = true;
      window.clearTimeout(fallback);
      loadCalApi()
        .then((cal) => cal("off", { action: "linkReady", callback: onReady as never }))
        .catch(() => undefined);
    };
  }, [open]);

  const name = bidi(mentorName);
  const title = rescheduleUid ? t("dashboardV2.cal.rescheduleTitle", { name }) : t("dashboardV2.cal.title", { name });
  const description = !link
    ? t("dashboardV2.cal.unavailableBody")
    : rescheduleUid
      ? t("dashboardV2.cal.rescheduleDescription")
      : t("dashboardV2.cal.description");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[min(90dvh,860px)] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        data-testid="dialog-cal-embed"
        data-mode={rescheduleUid ? "reschedule" : "book"}
      >
        <DialogClose className={dialogCloseClassName} data-testid="cal-embed-close-button">
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">{t("common.close")}</span>
        </DialogClose>
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {link ? (
            <>
              <Suspense fallback={null}>
                <Cal
                  namespace={CAL_NAMESPACE}
                  calLink={link}
                  style={{ width: "100%", height: "100%", minHeight: "600px", overflow: "auto" }}
                  config={config}
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
