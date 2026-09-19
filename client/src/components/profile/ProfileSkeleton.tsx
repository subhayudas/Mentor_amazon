import { useTranslation } from "react-i18next";

import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state with the profile's final geometry: back link, 80px avatar +
 * header block, the two-column grid (sections on the start side, the request
 * card at 336px on `lg+`). Announced once; the bars are decorative and the
 * pulse stops under reduced motion.
 */
export function ProfileSkeleton() {
  const { t } = useTranslation();
  return (
    <Container className="pb-24 lg:pb-16" role="status" aria-busy="true" data-testid="profile-skeleton">
      <span className="sr-only">{t("mentorProfile.loading")}</span>
      <Skeleton className="mt-6 h-5 w-32" />
      <div className="mt-8 flex items-start gap-4 sm:gap-6">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-64 max-w-full" />
          <Skeleton className="mt-3 h-5 w-80 max-w-full" />
          <Skeleton className="mt-4 h-4 w-72 max-w-full" />
          <Skeleton className="mt-3 h-6 w-36 rounded-full" />
        </div>
      </div>
      {/* Mobile only: the time-zone note that sits under the header below lg. */}
      <Skeleton className="mt-5 h-4 w-72 max-w-full lg:hidden" />
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-12">
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
          <div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-3 h-4 w-48" />
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-6 w-36 rounded-full" />
            <Skeleton className="mt-5 h-3 w-32" />
            <div className="mt-3 flex flex-col gap-5">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-11/12" />
              <Skeleton className="h-5 w-4/5" />
            </div>
            <Skeleton className="mt-5 h-3 w-4/5" />
            <Skeleton className="mt-4 h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </Container>
  );
}
