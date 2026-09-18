import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Users, Building2, CalendarCheck, KeyRound, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireRole } from "@/components/RouteGuard";
import { adminQueryKeys, adminService } from "@/lib/adminService";
import { StatTile } from "@/pages/admin/shared";
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

export default function AdminDashboard() {
  return (
    <RequireRole role="admin">
      <AdminShell />
    </RequireRole>
  );
}

function AdminShell() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const activeTab = tabFromLocation(location);

  const onTabChange = useCallback(
    (value: string) => {
      const next = (TAB_IDS as readonly string[]).includes(value) ? value : "mentors";
      setLocation(next === "mentors" ? "/admin" : `/admin/${next}`);
    },
    [setLocation],
  );

  const tabs: { id: TabId; label: string; icon: typeof Users }[] = [
    { id: "mentors", label: t("admin.tabs.mentors"), icon: Users },
    { id: "mentees", label: t("admin.tabs.mentees"), icon: Building2 },
    { id: "bookings", label: t("admin.tabs.bookings"), icon: CalendarCheck },
    { id: "access", label: t("admin.tabs.access"), icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-12 space-y-6">
        <header className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-[#232F3E] shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-admin-title">{t("admin.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("admin.subtitle")}</p>
          </div>
        </header>

        <OverviewStrip />

        <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl h-auto" aria-label={t("admin.tabsLabel")}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-2 py-2" data-testid={`tab-admin-${id}`}>
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="mentors" className="mt-0">
            {activeTab === "mentors" && <MentorsTab />}
          </TabsContent>
          <TabsContent value="mentees" className="mt-0">
            {activeTab === "mentees" && <MenteesTab />}
          </TabsContent>
          <TabsContent value="bookings" className="mt-0">
            {activeTab === "bookings" && <BookingsTab />}
          </TabsContent>
          <TabsContent value="access" className="mt-0">
            {activeTab === "access" && <AccessTab />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OverviewStrip() {
  const { t } = useTranslation();

  const mentors = useQuery({ queryKey: adminQueryKeys.mentors, queryFn: adminService.getMentors });
  const mentees = useQuery({ queryKey: adminQueryKeys.mentees, queryFn: adminService.getMentees });
  const bookings = useQuery({ queryKey: adminQueryKeys.bookings, queryFn: adminService.getBookings });
  const requests = useQuery({ queryKey: adminQueryKeys.accessRequests, queryFn: adminService.getAccessRequests });

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

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <section aria-label={t("admin.overview")} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatTile
        title={t("admin.stats.activeMentors")}
        value={stats.mentorsActive}
        hint={t("admin.stats.inactiveMentors", { count: stats.mentorsInactive })}
        icon={Users}
        testId="stat-active-mentors"
      />
      <StatTile
        title={t("admin.stats.verifiedOrgs")}
        value={stats.orgsVerified}
        hint={t("admin.stats.orgsBreakdown", { pending: stats.orgsPending, individuals: stats.individuals })}
        icon={Building2}
        testId="stat-verified-orgs"
      />
      <StatTile
        title={t("admin.stats.bookings")}
        value={stats.bookingsTotal}
        hint={t("admin.stats.bookingsBreakdown", {
          pending: stats.bookingsPending,
          confirmed: stats.bookingsConfirmed,
          completed: stats.bookingsCompleted,
        })}
        icon={CalendarCheck}
        testId="stat-bookings"
      />
      <StatTile
        title={t("admin.stats.pendingAccess")}
        value={stats.requestsPending}
        hint={t("admin.stats.requestsTotal", { count: stats.requestsTotal })}
        icon={KeyRound}
        testId="stat-pending-access"
      />
    </section>
  );
}
