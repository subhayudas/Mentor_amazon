import { useTranslation } from "react-i18next";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/mentors` discovery page — Pass-1 stub so the route exists and typechecks.
 * Agent A replaces this file with the full discovery composition (spec §5).
 * Until then it renders the real page header and the results grid's skeleton
 * geometry (6 cards), announced as loading.
 */
export default function Mentors() {
  const { t } = useTranslation();
  return (
    <Container className="pb-16">
      <PageHeader title={t("nav.titles.mentors")} />
      <div role="status" aria-busy="true" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <span className="sr-only">{t("common.loading")}</span>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex h-14 items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <Skeleton className="h-5 w-1/2" />
            </div>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-10 w-full" />
            <div className="flex min-h-[3.75rem] flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="mt-auto h-9 w-28" />
          </div>
        ))}
      </div>
    </Container>
  );
}
