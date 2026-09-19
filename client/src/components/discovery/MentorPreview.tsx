import * as React from "react";
import { Link } from "wouter";
import { CloudOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import {
  MentorCard,
  MentorCardCompact,
  MentorCardCompactSkeleton,
  MentorCardSkeleton,
} from "@/components/MentorCard";
import { GRID_CLASS } from "@/components/discovery/MentorGrid";
import { Button } from "@/components/ui/button";
import type { PublicMentor } from "@/lib/database";
import { PREVIEW_LIMIT, PREVIEW_LIMIT_MOBILE, previewMentors } from "@/lib/discovery";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Landing section 2, "Mentors you can talk to" (spec §5.2, P0-7, P1-16):
 * six real cards (accepting first) on `md+`; on phones a horizontal snap
 * scroller of four compact cards with a peek of the next one. Skeletons hold
 * the geometry; a failed query shows a compact inline error with retry —
 * never an empty section. The "See all {n}" button's slot is reserved before
 * data arrives and the count is rendered only once the query resolves.
 */
export interface MentorPreviewProps {
  mentors: PublicMentor[] | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  isPhone: boolean;
  className?: string;
}

export function MentorPreview({ mentors, isLoading, isError, isFetching, onRetry, isPhone, className }: MentorPreviewProps) {
  const { t, i18n } = useTranslation();
  const titleId = React.useId();
  const limit = isPhone ? PREVIEW_LIMIT_MOBILE : PREVIEW_LIMIT;
  const preview = React.useMemo(
    () => (mentors ? previewMentors(mentors, limit, i18n.language) : []),
    [mentors, limit, i18n.language],
  );
  const total = mentors?.length ?? 0;

  let body: React.ReactNode;
  if (isLoading) {
    body = isPhone ? (
      <div role="status" aria-busy="true" className="-mx-4 flex gap-3 overflow-x-hidden px-4">
        <span className="sr-only">{t("discovery.loading")}</span>
        {Array.from({ length: PREVIEW_LIMIT_MOBILE }, (_, i) => (
          <MentorCardCompactSkeleton key={i} />
        ))}
      </div>
    ) : (
      <div role="status" aria-busy="true" className={GRID_CLASS}>
        <span className="sr-only">{t("discovery.loading")}</span>
        {Array.from({ length: PREVIEW_LIMIT }, (_, i) => (
          <MentorCardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (isError) {
    body = (
      <EmptyState
        role="alert"
        icon={CloudOff}
        titleAs="h3"
        title={t("landing.preview.errorTitle")}
        description={t("landing.preview.errorBody")}
        className="py-8"
        action={
          <Button type="button" variant="outline" onClick={onRetry} loading={isFetching}>
            {t("common.tryAgain")}
          </Button>
        }
        data-testid="preview-error"
      />
    );
  } else if (total === 0) {
    body = (
      <EmptyState
        role="status"
        titleAs="h3"
        title={t("landing.preview.emptyTitle")}
        description={t("landing.preview.emptyBody")}
        className="py-8"
      />
    );
  } else if (isPhone) {
    body = (
      <ul
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scroll-padding-inline:1rem] [scrollbar-width:none]"
        data-testid="mentor-scroller"
      >
        {preview.map((mentor) => (
          <li key={mentor.id} className="w-[80vw] max-w-[320px] shrink-0 snap-start">
            <MentorCardCompact mentor={mentor} className="h-full w-full max-w-none" />
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <ul className={GRID_CLASS} data-testid="mentor-preview">
        {preview.map((mentor) => (
          <li key={mentor.id} className="min-w-0">
            <MentorCard mentor={mentor} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby={titleId} className={className}>
      <h2 id={titleId} className="text-h2-sm text-foreground md:text-h2">
        {t("landing.preview.title")}
      </h2>
      <p className="mt-2 hidden max-w-prose text-body text-muted-foreground text-pretty md:block">{t("landing.preview.description")}</p>
      <div className="mt-6">{body}</div>
      <div className={cn("min-h-11", isPhone ? "mt-4 flex" : "mt-6 flex justify-start")}>
        {!isLoading && !isError && total > 0 && (
          <Button asChild variant={isPhone ? "outline" : "secondary"} size="lg" className={cn(isPhone && "w-full")}>
            <Link href={ROUTES.mentors} data-testid="link-see-all-mentors">
              {t("landing.preview.seeAll", { count: total })}
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
