import { useEffect } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock, ExternalLink, Inbox as InboxIcon, ListTodo, MessageSquare, UserCircle } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteTabs, type RouteTab } from "@/components/dashboard/RouteTabs";
import { UnsavedChangesGuard } from "@/components/dashboard/UnsavedChangesGuard";
import { useAuth } from "@/context/AuthContext";
import { syncRoleStorage } from "@/lib/auth";
import type { Mentor } from "@/lib/database";
import { credentialLine, localizedField } from "@/lib/localized";
import { ROUTES } from "@/lib/routes";
import { mentorService } from "@/lib/services";
import { BookingListSkeleton, BookingsError } from "@/pages/mentee/shared";
import Inbox from "@/pages/mentor/Inbox";
import MySessions from "@/pages/mentor/MySessions";
import TaskManager from "@/pages/mentor/TaskManager";
import Availability from "@/pages/mentor/Availability";
import Feedback from "@/pages/mentor/Feedback";
import ProfileSettings from "@/pages/mentor/ProfileSettings";

const P = ROUTES.mentorPortal;

/**
 * Mentor portal shell (P1-23/P1-25): global header only, `PageHeader` with the
 * mentor's name and an honest "accepting requests" badge, then a URL-synced
 * tab row — Inbox · Sessions · Availability · Tasks · Feedback · Profile —
 * with the panels in the single document scroll. Identity comes from the
 * authenticated session only; `profile_id` is the mentor row this account
 * provably owns, and `mentorService.getOwn` reads it by the same predicates
 * RLS uses, so a stored id can never resolve to another mentor.
 */
export default function MentorPortal() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const isMentorSession = !!user && user.user_type === "mentor";
  const mentorId = isMentorSession ? user.profile_id : undefined;

  const mentorQuery = useQuery<Mentor | null>({
    queryKey: ["mentor", "own", user?.email, mentorId],
    queryFn: () => mentorService.getOwn({ email: user!.email, profileId: mentorId }),
    enabled: !!mentorId,
  });
  const mentor = mentorQuery.data;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLocation(ROUTES.login);
      return;
    }
    if (user.user_type !== "mentor") {
      setLocation(user.user_type === "mentee" ? ROUTES.menteeDashboard : ROUTES.home);
      return;
    }
    if (!user.profile_id) setLocation(ROUTES.mentorOnboarding);
  }, [authLoading, user, setLocation]);

  // Keep the legacy role mirror consistent with the verified identity.
  useEffect(() => {
    if (!authLoading && isMentorSession && mentor) syncRoleStorage(user);
  }, [authLoading, isMentorSession, mentor, user]);

  // Profile id present but the row is gone (deactivated/deleted): drop to login.
  useEffect(() => {
    if (mentorId && !mentorQuery.isLoading && mentorQuery.data === null) setLocation(ROUTES.login);
  }, [mentorId, mentorQuery.isLoading, mentorQuery.data, setLocation]);

  if (mentorQuery.isError) {
    return (
      <Container className="pb-16">
        <PageHeader eyebrow={t("dashboardV2.mentor.eyebrow")} title={t("dashboardV2.mentor.fallbackTitle")} />
        <BookingsError onRetry={() => mentorQuery.refetch()} />
      </Container>
    );
  }

  if (authLoading || mentorQuery.isLoading || !mentor) {
    return (
      <Container className="pb-16">
        <div role="status" aria-busy="true" className="py-8 md:py-10">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="mb-2 h-4 w-28" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="flex gap-6 border-b border-border">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="mb-3 h-5 w-20" />
          ))}
        </div>
        <div className="mt-6">
          <BookingListSkeleton />
        </div>
      </Container>
    );
  }

  const name = localizedField(mentor, "name", i18n.language);
  const credential = credentialLine(mentor, i18n.language);

  const tabs: RouteTab[] = [
    { value: "inbox", href: P, aliases: [`${P}/bookings`, `${P}/requests`], label: t("dashboardV2.tabs.inbox"), icon: InboxIcon, testId: "tab-mentor-inbox" },
    { value: "sessions", href: `${P}/sessions`, label: t("dashboardV2.tabs.sessions"), icon: CalendarDays, testId: "tab-mentor-sessions" },
    { value: "availability", href: `${P}/availability`, label: t("dashboardV2.tabs.availability"), icon: Clock, testId: "tab-mentor-availability" },
    { value: "tasks", href: `${P}/tasks`, label: t("dashboardV2.tabs.tasks"), icon: ListTodo, testId: "tab-mentor-tasks" },
    { value: "feedback", href: `${P}/feedback`, label: t("dashboardV2.tabs.feedback"), icon: MessageSquare, testId: "tab-mentor-feedback" },
    { value: "profile", href: `${P}/profile`, label: t("dashboardV2.tabs.profile"), icon: UserCircle, testId: "tab-mentor-profile" },
  ];

  return (
    <Container className="pb-16">
      <PageHeader
        eyebrow={t("dashboardV2.mentor.eyebrow")}
        title={<bdi>{name}</bdi>}
        description={
          <>
            {credential && <span>{credential}</span>}
            {credential && " · "}
            <Badge tone={mentor.is_available ? "success" : "neutral"} className="align-middle" data-testid="badge-mentor-availability">
              {mentor.is_available ? t("dashboardV2.mentor.accepting") : t("dashboardV2.mentor.notAccepting")}
            </Badge>
          </>
        }
        className="pb-6 md:pb-6"
        actions={
          <Button asChild variant="outline" size="sm" data-testid="link-public-profile">
            <Link href={ROUTES.mentor(mentor.id)}>
              <ExternalLink className="rtl:-scale-x-100" aria-hidden="true" />
              {t("dashboardV2.mentor.viewPublicProfile")}
            </Link>
          </Button>
        }
      />
      <UnsavedChangesGuard />
      <RouteTabs tabs={tabs} ariaLabel={t("dashboardV2.mentor.tabsLabel")}>
        <Switch>
          <Route path={`${P}/sessions`}>
            <MySessions mentorId={mentor.id} mentorEmail={mentor.email || undefined} mentor={mentor} />
          </Route>
          <Route path={`${P}/tasks`}>
            <TaskManager mentorId={mentor.id} />
          </Route>
          <Route path={`${P}/availability`}>
            <Availability mentorId={mentor.id} mentorTimeZone={mentor.timezone} />
          </Route>
          <Route path={`${P}/feedback`}>
            <Feedback mentorId={mentor.id} />
          </Route>
          <Route path={`${P}/profile`}>
            <ProfileSettings mentorId={mentor.id} mentorEmail={mentor.email || ""} />
          </Route>
          <Route>
            <Inbox mentorId={mentor.id} mentor={mentor} />
          </Route>
        </Switch>
      </RouteTabs>
    </Container>
  );
}
