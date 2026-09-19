import { useTranslation } from "react-i18next";

import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui/skeleton";
import { backLinkRowClass, headerRowClass, profileCardClass, profileGridClass } from "@/components/profile/styles";
import { cn } from "@/lib/utils";

/**
 * Loading state with the profile's final geometry (F-31): the same layout
 * classes as MentorProfile / ProfileHeader / RequestRailCard (`styles.ts`) —
 * the 32px back-link row, the 80px avatar + header block (eyebrow, h1,
 * credential, meta line, time-zone line, rating caption), the two-column
 * grid, and a request card with the badge, rail caption, three stops and
 * the 44px button. The availability section is reserved (`min-h-[9rem]`)
 * until the rows say the mentor has none. Announced once; the bars are
 * decorative and the pulse stops under reduced motion.
 */
export function ProfileSkeleton({ reserveAvailability = true }: { reserveAvailability?: boolean }) {
  const { t } = useTranslation();
  return (
    <Container className="pb-24 lg:pb-16" role="status" aria-busy="true" data-testid="profile-skeleton">
      <span className="sr-only">{t("mentorProfile.loading")}</span>
      <div className={cn(backLinkRowClass, "flex")}>
        <Skeleton className="h-4 w-32" />
      </div>
      <div className={headerRowClass}>
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="mt-0.5 h-3.5 w-24" />
          <Skeleton className="mt-3 h-8 w-64 max-w-full" />
          <Skeleton className="mt-3 h-5 w-80 max-w-full" />
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-4 w-96 max-w-full" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Skeleton className="h-6 w-36 rounded-full lg:hidden" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
          </div>
        </div>
      </div>
      <div className={profileGridClass}>
        <div className="flex flex-col gap-10">
          <div>
            <Skeleton className="h-7 w-52" />
            <div className="mt-4 flex flex-wrap gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-4 w-56" />
          </div>
          <div>
            <Skeleton className="h-7 w-24" />
            <div className="mt-4 flex max-w-prose flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          {/* Mobile only: the rail section after About. */}
          <div className="lg:hidden">
            <Skeleton className="h-7 w-56" />
            <div className="mt-4 flex flex-col gap-5">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-11/12" />
              <Skeleton className="h-5 w-4/5" />
            </div>
          </div>
        </div>
        <div className="hidden lg:block">
          <div className={profileCardClass}>
            <Skeleton className="h-6 w-36 rounded-full" />
            <Skeleton className="mt-5 h-3.5 w-32" />
            <div className="mt-3 flex flex-col gap-5">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-10 w-11/12" />
              <Skeleton className="h-5 w-4/5" />
            </div>
            <Skeleton className="mt-5 h-11 w-full rounded-lg" />
            {reserveAvailability && (
              <div className="mt-6 min-h-[9rem] border-t border-border pt-5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="mt-3 h-6 w-40 rounded-sm" />
                <div className="mt-3 flex flex-col gap-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="mt-3 flex flex-col gap-1">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
