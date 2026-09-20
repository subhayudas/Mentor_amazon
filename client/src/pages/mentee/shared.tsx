import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { CalendarX2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { lastDiscoveryHref } from "@/lib/urlState";
import type { BookingWithMentor } from "@/lib/menteeBookings";
import { menteeService } from "@/lib/services";

/**
 * Classes for a button that is disabled for a reason the person can fix
 * (P1-18): it stays focusable with `aria-disabled` + a visible reason, and
 * takes the muted disabled surface instead of an opacity drop.
 */
export const ARIA_DISABLED_CLASS =
  "aria-disabled:border-transparent aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:hover:bg-muted aria-disabled:active:scale-100";

/** Bookings poll: one shared query for every panel; 15 s matches the old stats cadence it replaces. */
export const BOOKINGS_POLL_MS = 15_000;

export function useMenteeBookings(menteeId: string) {
  return useQuery<BookingWithMentor[]>({
    queryKey: ["mentee", menteeId, "bookings"],
    queryFn: () => menteeService.getBookings(menteeId) as Promise<BookingWithMentor[]>,
    refetchInterval: BOOKINGS_POLL_MS,
    staleTime: 5_000,
  });
}

/** Skeleton with the geometry of a booking row list (avatar row + actions). */
export function BookingListSkeleton({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">{t("common.loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BookingsError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      role="alert"
      icon={CalendarX2}
      title={t("dashboardV2.error.title")}
      description={t("dashboardV2.error.body")}
      action={
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          {t("common.tryAgain")}
        </Button>
      }
    />
  );
}

export function NoSessionsYet() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={CalendarX2}
      title={t("dashboardV2.empty.title")}
      description={t("dashboardV2.empty.body")}
      action={
        <Button asChild variant="secondary">
          <Link href={lastDiscoveryHref()}>{t("dashboardV2.empty.action")}</Link>
        </Button>
      }
    />
  );
}

/** Section heading used inside panels: h2 role, optional trailing count/link. */
export function PanelSection({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-h2-sm text-foreground">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
