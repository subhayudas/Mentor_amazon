import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Building2, CalendarCheck, KeyRound, RefreshCw, TriangleAlert, Users } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { RouteTabs, type RouteTab } from "@/components/dashboard/RouteTabs";
import { EmptyState } from "@/components/EmptyState";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminQueryKeys, adminService } from "@/lib/adminService";
import { formatNumber, UNAVAILABLE } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import MentorsTab from "@/pages/admin/MentorsTab";
import MenteesTab from "@/pages/admin/MenteesTab";
import BookingsTab from "@/pages/admin/BookingsTab";
import AccessTab from "@/pages/admin/AccessTab";

const TAB_IDS = ["mentors", "mentees", "bookings", "access"] as const;
type TabId = (typeof TAB_IDS)[number];

function tabFromLocation(location: string): TabId {
  const match = location.match(/^\/admin\/?([^/?#]*)/);
  const candidate = match?.[1] as TabId | undefined;
  return candidate && TAB_IDS.includes(candidate) ? candidate : "mentors";
}

/**
 * Admin shell (App.tsx already wraps the route in `RequireRole role="admin"`,
 * so the guard is not repeated here): `PageHeader` + the overview strip + a
 * URL-synced tab row (/admin, /admin/mentees, /admin/bookings, /admin/access)
 * rendered in the single document scroll — the same shell the mentee
 * dashboard and mentor portal use.
 */
export default function AdminDashboard() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const activeTab = tabFromLocation(location);
  const overview = useAdminOverview();
  const refreshing = overview.queries.some((q) => q.isFetching);

  const tabs: RouteTab[] = [
    { value: "mentors", href: ROUTES.admin, label: t("admin.tabs.mentors"), icon: Users, testId: "tab-admin-mentors" },
    { value: "mentees", href: `${ROUTES.admin}/mentees`, label: t("admin.tabs.mentees"), icon: Building2, testId: "tab-admin-mentees" },
    { value: "bookings", href: `${ROUTES.admin}/bookings`, label: t("admin.tabs.bookings"), icon: CalendarCheck, testId: "tab-admin-bookings" },
    { value: "access", href: `${ROUTES.admin}/access`, label: t("admin.tabs.access"), icon: KeyRound, testId: "tab-admin-access" },
  ];

  return (
    <Container className="pb-16">
      <PageHeader
        eyebrow={t("admin.eyebrow")}
        title={<span data-testid="text-admin-title">{t("admin.title")}</span>}
        description={t("admin.subtitle")}
        className="pb-6 md:pb-6"
        actions={
          <Button variant="outline" size="sm" onClick={() => overview.queries.forEach((q) => q.refetch())} loading={refreshing} data-testid="button-refresh-admin">
            <RefreshCw aria-hidden="true" />
            {t("common.refresh")}
          </Button>
        }
      />
      <OverviewStrip {...overview} />
      <div className="mt-8">
        <RouteTabs tabs={tabs} ariaLabel={t("admin.tabsLabel")}>
          {activeTab === "mentors" && <MentorsTab />}
          {activeTab === "mentees" && <MenteesTab />}
          {activeTab === "bookings" && <BookingsTab />}
          {activeTab === "access" && <AccessTab />}
        </RouteTabs>
      </div>
    </Container>
  );
}

/** The four queue queries behind the overview strip (shared with the header's Refresh). */
function useAdminOverview() {
  const mentors = useQuery({ queryKey: adminQueryKeys.mentors, queryFn: adminService.getMentors });
  const mentees = useQuery({ queryKey: adminQueryKeys.mentees, queryFn: adminService.getMentees });
  const bookings = useQuery({ queryKey: adminQueryKeys.bookings, queryFn: adminService.getBookings });
  const requests = useQuery({ queryKey: adminQueryKeys.accessRequests, queryFn: adminService.getAccessRequests });
  return { mentors, mentees, bookings, requests, queries: [mentors, mentees, bookings, requests] };
}

/** Four honest counts; a failed query shows "—" (never a zero) and an error state with retry (P2-18). */
function OverviewStrip({ mentors, mentees, bookings, requests }: ReturnType<typeof useAdminOverview>) {
  const { t, i18n } = useTranslation();

  const stats = useMemo(() => {
    const m = mentors.data ?? [];
    const me = mentees.data ?? [];
    const b = bookings.data ?? [];
    const r = requests.data ?? [];
    const orgs = me.filter((x) => x.user_type === "organization");
    const byStatus = (status: string) => b.filter((x) => x.status === status).length;
    return {
      mentorsActive: m.filter((x) => x.is_available).length,
      mentorsInactive: m.filter((x) => !x.is_available).length,
      orgsVerified: orgs.filter((x) => x.verification_status === "verified").length,
      orgsPending: orgs.filter((x) => x.verification_status === "pending").length,
      individuals: me.length - orgs.length,
      bookingsTotal: b.length,
      bookingsPending: byStatus("pending"),
      bookingsConfirmed: byStatus("confirmed"),
      bookingsCompleted: byStatus("completed"),
      requestsPending: r.filter((x) => x.status === "pending").length,
      requestsTotal: r.length,
    };
  }, [mentors.data, mentees.data, bookings.data, requests.data]);

  const loading = mentors.isLoading || mentees.isLoading || bookings.isLoading || requests.isLoading;
  const failed = [mentors, mentees, bookings, requests].filter((q) => q.isError);
  const n = (value: number) => formatNumber(value, i18n.language);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="status" aria-busy="true">
        <span className="sr-only">{t("common.loading")}</span>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-label={t("admin.overview")} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          title={t("admin.stats.activeMentors")}
          value={mentors.isError ? UNAVAILABLE : n(stats.mentorsActive)}
          caveat={mentors.isError ? t("admin.stats.unavailable") : t("admin.stats.inactiveMentors", { count: stats.mentorsInactive })}
          icon={Users}
          testId="stat-active-mentors"
        />
        <StatTile
          title={t("admin.stats.verifiedOrgs")}
          value={mentees.isError ? UNAVAILABLE : n(stats.orgsVerified)}
          caveat={mentees.isError ? t("admin.stats.unavailable") : t("admin.stats.orgsBreakdown", { pending: n(stats.orgsPending), individuals: n(stats.individuals) })}
          icon={Building2}
          testId="stat-verified-orgs"
        />
        <StatTile
          title={t("admin.stats.bookings")}
          value={bookings.isError ? UNAVAILABLE : n(stats.bookingsTotal)}
          caveat={
            bookings.isError
              ? t("admin.stats.unavailable")
              : t("admin.stats.bookingsBreakdown", { pending: n(stats.bookingsPending), confirmed: n(stats.bookingsConfirmed), completed: n(stats.bookingsCompleted) })
          }
          icon={CalendarCheck}
          testId="stat-bookings"
        />
        <StatTile
          title={t("admin.stats.pendingAccess")}
          value={requests.isError ? UNAVAILABLE : n(stats.requestsPending)}
          caveat={requests.isError ? t("admin.stats.unavailable") : t("admin.stats.requestsTotal", { count: stats.requestsTotal })}
          icon={KeyRound}
          testId="stat-pending-access"
        />
      </section>
      {failed.length > 0 && (
        <EmptyState
          role="alert"
          icon={TriangleAlert}
          title={t("admin.loadError", { queue: t("admin.queues.overview") })}
          description={t("admin.loadErrorBody")}
          className="py-6"
          data-testid="overview-error"
          action={
            <Button variant="secondary" onClick={() => failed.forEach((q) => q.refetch())}>
              <RefreshCw aria-hidden="true" />
              {t("common.tryAgain")}
            </Button>
          }
        />
      )}
    </div>
  );
}
