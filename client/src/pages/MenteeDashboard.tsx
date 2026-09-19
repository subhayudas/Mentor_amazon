import { Link, Route, Switch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, LayoutDashboard, MessageSquare, UserCircle, UserRoundX, Users } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteTabs, type RouteTab } from "@/components/dashboard/RouteTabs";
import { UnsavedChangesGuard } from "@/components/dashboard/UnsavedChangesGuard";
import { AccessDeniedCard } from "@/components/RouteGuard";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";
import type { Mentee } from "@/lib/database";
import { ROUTES } from "@/lib/routes";
import { menteeService } from "@/lib/services";
import { lastDiscoveryHref } from "@/lib/urlState";
import { BookingListSkeleton, BookingsError } from "@/pages/mentee/shared";

import Overview from "@/pages/mentee/Overview";
import Bookings from "@/pages/mentee/Bookings";
import Mentors from "@/pages/mentee/Mentors";
import Feedback from "@/pages/mentee/Feedback";
import Profile from "@/pages/mentee/Profile";

/** Verification decisions land asynchronously; pick them up without a manual reload. */
const MENTEE_POLL_MS = 60_000;

/**
 * Mentee dashboard shell (P1-23/C11/C12): the global header is the only
 * header; the page is `PageHeader` (role eyebrow + the person's name) and a
 * URL-synced tab row (Overview · Bookings · Mentors · Feedback · Profile)
 * whose panels are ordinary flow content inside App's single `main`.
 * Identity is the signed-in session's email; RLS only ever returns the
 * caller's own mentee row.
 */
export default function MenteeDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const email = user?.email ?? null;

  const menteeQuery = useQuery<Mentee | null>({
    queryKey: ["mentee", "email", email],
    queryFn: () => menteeService.getByEmail(email!),
    enabled: !!email,
    refetchInterval: MENTEE_POLL_MS,
    staleTime: 30_000,
  });

  if (user && user.user_type !== "mentee") {
    return <AccessDeniedCard role="mentee" user={user} />;
  }

  if (!email || menteeQuery.isLoading) {
    return (
      <Container className="pb-16">
        <div role="status" aria-busy="true" className="py-8 md:py-10">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="mb-2 h-4 w-28" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <div className="flex gap-6 border-b border-border">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="mb-3 h-5 w-20" />
          ))}
        </div>
        <div className="mt-6">
          <BookingListSkeleton />
        </div>
      </Container>
    );
  }

  if (menteeQuery.isError) {
    return (
      <Container className="pb-16">
        <PageHeader eyebrow={t("dashboardV2.mentee.eyebrow")} title={t("dashboardV2.mentee.fallbackTitle")} />
        <BookingsError onRetry={() => menteeQuery.refetch()} />
      </Container>
    );
  }

  const mentee = menteeQuery.data;
  if (!mentee) {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="warning"
          icon={UserRoundX}
          title={t("dashboardV2.mentee.noProfileTitle")}
          description={t("dashboardV2.mentee.noProfileBody")}
          data-testid="card-mentee-not-found"
          actions={
            <>
              <Button asChild variant="secondary" data-testid="button-try-again">
                <Link href={ROUTES.menteeRegistration}>{t("dashboardV2.mentee.completeProfile")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={lastDiscoveryHref()}>{t("dashboardV2.empty.action")}</Link>
              </Button>
            </>
          }
        />
      </StatusPage>
    );
  }

  const tabs: RouteTab[] = [
    { value: "overview", href: ROUTES.menteeDashboard, label: t("dashboardV2.tabs.overview"), icon: LayoutDashboard, testId: "tab-mentee-overview" },
    { value: "bookings", href: ROUTES.menteeBookings, label: t("dashboardV2.tabs.bookings"), icon: CalendarDays, testId: "tab-mentee-bookings" },
    { value: "mentors", href: `${ROUTES.menteeDashboard}/mentors`, label: t("dashboardV2.tabs.mentors"), icon: Users, testId: "tab-mentee-mentors" },
    { value: "feedback", href: `${ROUTES.menteeDashboard}/feedback`, label: t("dashboardV2.tabs.feedback"), icon: MessageSquare, testId: "tab-mentee-feedback" },
    { value: "profile", href: `${ROUTES.menteeDashboard}/profile`, label: t("dashboardV2.tabs.profile"), icon: UserCircle, testId: "tab-mentee-profile" },
  ];

  return (
    <Container className="pb-16">
      <PageHeader
        eyebrow={t("dashboardV2.mentee.eyebrow")}
        title={<bdi>{mentee.name}</bdi>}
        description={<bdi dir="ltr">{mentee.email}</bdi>}
        className="pb-6 md:pb-6"
        actions={
          <Button asChild variant="outline" size="sm" data-testid="link-browse-mentors-dashboard">
            <Link href={lastDiscoveryHref()}>{t("dashboardV2.empty.action")}</Link>
          </Button>
        }
      />
      <UnsavedChangesGuard />
      <RouteTabs tabs={tabs} ariaLabel={t("dashboardV2.mentee.tabsLabel")}>
        <Switch>
            <Route path={ROUTES.menteeDashboard}>
              <Overview menteeId={mentee.id} mentee={mentee} />
            </Route>
            <Route path={ROUTES.menteeBookings}>
              <Bookings menteeId={mentee.id} mentee={mentee} />
            </Route>
            <Route path={`${ROUTES.menteeDashboard}/mentors`}>
              <Mentors menteeId={mentee.id} />
            </Route>
            <Route path={`${ROUTES.menteeDashboard}/feedback`}>
              <Feedback menteeId={mentee.id} />
            </Route>
            <Route path={`${ROUTES.menteeDashboard}/profile`}>
              <Profile mentee={mentee} />
            </Route>
            <Route>
              <Overview menteeId={mentee.id} mentee={mentee} />
            </Route>
        </Switch>
      </RouteTabs>
    </Container>
  );
}
