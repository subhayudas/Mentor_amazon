import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { TriangleAlert, UserRoundPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/routes";

/**
 * Shared loading, error and "no profile yet" states for the `/dashboard/*`
 * pages in database mode (design C4/C6/C7): announced once, never a blank
 * page, never sample rows standing in for real ones.
 */
export function DashboardLoading({ rows = 3, label }: { rows?: number; label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-3 py-4" data-testid="dashboard-loading">
      <span className="sr-only">{label ?? t("common.loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-[12px]" aria-hidden="true" />
      ))}
    </div>
  );
}

export function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[12px] border border-destructive/30 bg-destructive-soft p-4 text-destructive" data-testid="dashboard-error">
      <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[14px] font-medium">{message}</p>
      <Button type="button" variant="outline" size="sm" className="h-11 md:h-9" onClick={onRetry} data-testid="button-dashboard-retry">
        {t("common.tryAgain")}
      </Button>
    </div>
  );
}

/**
 * A signed-in mentor without a mentors row (approved, not onboarded) or a
 * mentee without a mentees row: what to do next, instead of an empty page or
 * someone else's data (F18).
 */
export function ProfileNeededCard({ role }: { role: "mentor" | "mentee" }) {
  const { t } = useTranslation();
  const mentor = role === "mentor";
  return (
    <section
      className="max-w-[620px] rounded-[12px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-6"
      aria-labelledby="profile-needed-title"
      data-testid={mentor ? "card-finish-profile" : "card-complete-registration"}
    >
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[var(--sc-ink)]" aria-hidden="true">
        <UserRoundPlus className="size-5" />
      </span>
      <h2 id="profile-needed-title" className="mt-4 text-[20px] font-bold text-[var(--sc-ink)]">
        {t(mentor ? "showcase.dashboard.finishProfileTitle" : "showcase.dashboard.completeRegistrationTitle")}
      </h2>
      <p className="mt-1 text-[14px] text-[#6c6c84] text-pretty">{t(mentor ? "showcase.dashboard.finishProfileBody" : "showcase.dashboard.completeRegistrationBody")}</p>
      <Link
        href={mentor ? ROUTES.mentorOnboarding : ROUTES.menteeRegistration}
        className="mt-5 inline-flex h-11 items-center rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black"
        data-testid={mentor ? "link-finish-profile" : "link-complete-registration"}
      >
        {t(mentor ? "showcase.dashboard.finishProfileCta" : "showcase.dashboard.completeRegistrationCta")}
      </Link>
    </section>
  );
}
