import * as React from "react";
import { CloudOff, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import { MentorCard, MentorCardSkeleton } from "@/components/MentorCard";
import { Button } from "@/components/ui/button";
import type { PublicMentor } from "@/lib/database";
import { cn } from "@/lib/utils";

/**
 * Results grid (spec §5): `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`.
 * Loading = six skeleton cards with the card's exact geometry, announced
 * once; error = compact EmptyState with "Try again" (refetch); an empty
 * catalogue = "No mentors yet"; zero matches = the `zeroResults` slot. Data
 * mounts without an entrance animation — the grid re-renders on every filter
 * change, so it is a high-frequency surface (P2-5).
 */
export interface MentorGridProps {
  mentors: PublicMentor[];
  /** Unfiltered catalogue size; 0 after a successful fetch means "no mentors yet". */
  total: number;
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  onRetry: () => void;
  zeroResults: React.ReactNode;
  skeletonCount?: number;
  className?: string;
}

export const GRID_CLASS = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

export function MentorGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className={cn(GRID_CLASS, className)}>
      <span className="sr-only">{t("discovery.loading")}</span>
      {Array.from({ length: count }, (_, i) => (
        <MentorCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function MentorGrid({
  mentors,
  total,
  isLoading,
  isError,
  isFetching = false,
  onRetry,
  zeroResults,
  skeletonCount = 6,
  className,
}: MentorGridProps) {
  const { t } = useTranslation();

  if (isLoading) return <MentorGridSkeleton count={skeletonCount} className={className} />;

  if (isError) {
    return (
      <EmptyState
        role="alert"
        icon={CloudOff}
        titleAs="h3"
        title={t("discovery.error.title")}
        description={t("discovery.error.body")}
        action={
          <Button type="button" variant="outline" onClick={onRetry} loading={isFetching}>
            {t("common.tryAgain")}
          </Button>
        }
        data-testid="mentors-error"
      />
    );
  }

  if (total === 0) {
    return (
      <EmptyState
        role="status"
        icon={Users}
        titleAs="h3"
        title={t("discovery.empty.title")}
        description={t("discovery.empty.body")}
        data-testid="mentors-empty"
      />
    );
  }

  if (mentors.length === 0) return <>{zeroResults}</>;

  return (
    <ul className={cn(GRID_CLASS, className)} aria-busy={isFetching || undefined} data-testid="mentor-grid">
      {mentors.map((mentor) => (
        <li key={mentor.id} className="min-w-0">
          <MentorCard mentor={mentor} />
        </li>
      ))}
    </ul>
  );
}
