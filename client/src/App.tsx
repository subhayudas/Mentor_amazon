import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { DirectionProvider } from "@radix-ui/react-direction";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Navigation } from "@/components/Navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { ContentGuard } from "@/components/ContentGuard";
import { SkipLink } from "@/components/SkipLink";
import { BackendStatusBanner } from "@/components/BackendStatusBanner";
import { RequireAuth, RequireRole } from "@/components/RouteGuard";
import { useDirection } from "@/hooks/useDirection";
import { pageTitleKey } from "@/lib/routes";
import Home from "@/pages/Home";
import { resolveShowcaseMentor } from "@/data/featuredMentors";
import { IS_LOCAL } from "@/lib/demo";
import NotFound from "@/pages/not-found";

// Every page except Home and NotFound is code-split so the entry chunk stays
// small (recharts ships only with Analytics, the Cal.com embed only on demand).
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AuthConfirm = lazy(() => import("@/pages/AuthConfirm"));
const Mentors = lazy(() => import("@/pages/Mentors"));
const MentorProfile = lazy(() => import("@/pages/MentorProfile"));
const FeaturedMentorProfile = lazy(() => import("@/pages/FeaturedMentorProfile"));
const FeaturedMentorSession = lazy(() => import("@/pages/FeaturedMentorSession"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const AnalyticsReports = lazy(() => import("@/pages/AnalyticsReports"));
const DashboardHome = lazy(() => import("@/pages/dashboard/DashboardHome"));
const DashboardBookings = lazy(() => import("@/pages/dashboard/DashboardBookings"));
const DashboardCalendar = lazy(() => import("@/pages/dashboard/DashboardCalendar"));
const DashboardProfile = lazy(() => import("@/pages/dashboard/DashboardProfile"));
const DashboardActivity = lazy(() => import("@/pages/dashboard/DashboardActivity"));
const DashboardAdmin = lazy(() => import("@/pages/dashboard/DashboardAdmin"));
const AnalyticsReport = lazy(() => import("@/pages/AnalyticsReport"));
const MentorOnboarding = lazy(() => import("@/pages/MentorOnboarding"));
const MenteeRegistration = lazy(() => import("@/pages/MenteeRegistration"));
const MentorPortal = lazy(() => import("@/pages/MentorPortal"));
const MenteeDashboard = lazy(() => import("@/pages/MenteeDashboard"));
const SsoCallback = lazy(() => import("@/pages/SsoCallback"));
const RequestAccess = lazy(() => import("@/pages/RequestAccess"));
const Legal = lazy(() => import("@/pages/Legal"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
// Only loaded when this browser still holds preview-period data (see hasPreviewPeriodData).
const LegacyLocalDataNotice = lazy(() => import("@/components/LegacyLocalDataNotice"));

/**
 * Cheap boot-time probe (F19): does this browser still hold data from the
 * preview period, when production ran in local mode? Database mode only; the
 * notice itself (and its parser) is fetched only when the answer is yes.
 */
function hasPreviewPeriodData(): boolean {
  if (IS_LOCAL) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith("mentorconnect.local.")) return true;
    }
  } catch {
    // storage blocked: nothing to show
  }
  return false;
}

/** Shown while a lazy page chunk downloads. Announced once; the bars are decorative. */
function PageSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="container-page py-12" role="status" aria-busy="true">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

/**
 * Route-change housekeeping (P1-29): keeps `document.title` current (also when
 * the language changes) and moves focus to the page's `h1#page-title`, or to
 * `main#main` while a lazy page is still a skeleton. Back/forward navigations
 * keep the browser-restored scroll position; forward navigations scroll the
 * focused heading into view.
 */
function RouteEffects() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation();
  const isFirstRender = useRef(true);
  const cameFromHistory = useRef(false);

  useEffect(() => {
    const onPop = () => {
      cameFromHistory.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = `${t(pageTitleKey(location))} · MentorConnect`;
  }, [location, t, i18n.language]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const preventScroll = cameFromHistory.current;
    cameFromHistory.current = false;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById("page-title") ?? document.getElementById("main");
      target?.focus({ preventScroll });
      if (!preventScroll) window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location]);

  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        {/* Public */}
        <Route path="/" component={Home} />
        <Route path="/mentors" component={Mentors} />
        <Route path="/login" component={Login} />
        {/* Without an auth backend the account step is skipped: sign-up IS the mentee form. */}
        <Route path="/signup">{IS_LOCAL ? <Redirect to="/mentee-registration" replace /> : <Signup />}</Route>
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/auth/sso" component={SsoCallback} />
        {/* Sign-up confirmation links land here (?next=…); the page waits for the session and routes on. */}
        <Route path="/auth/confirm" component={AuthConfirm} />
        <Route path="/request-access" component={RequestAccess} />
        <Route path="/legal" component={Legal} />
        {/* Curated (featured) mentors get the showcase profile + session pages; DB mentors keep the standard profile. */}
        <Route path="/mentor/:id/book" component={FeaturedMentorSession} />
        <Route path="/mentor/:id">{(params) => (resolveShowcaseMentor(params.id) ? <FeaturedMentorProfile /> : <MentorProfile />)}</Route>
        <Route path="/mentors/:id">{(params) => (resolveShowcaseMentor(params.id) ? <FeaturedMentorProfile /> : <MentorProfile />)}</Route>
        {/* Legacy public profile URL → the single mentor profile route (id preserved). */}
        <Route path="/profile/mentor/:id">
          {(params) => <Redirect to={`/mentor/${params.id}`} replace />}
        </Route>
        {/* Mentee rows are readable only by their owner, the booked mentors and admins,
            so the legacy public mentee profile now opens the caller's own profile tab. */}
        <Route path="/profile/mentee/:id">
          <Redirect to="/mentee-dashboard/profile" replace />
        </Route>

        {/* Any signed-in session */}
        {/* Local mode: the legacy portals read the database directly, so they hand over to the dashboard suite. */}
        {IS_LOCAL && (
          <Route path="/my-bookings">
            <Redirect to="/dashboard/bookings" replace />
          </Route>
        )}
        {IS_LOCAL && (
          <Route path="/mentee-dashboard/:rest*">
            <Redirect to="/dashboard" replace />
          </Route>
        )}
        {IS_LOCAL && (
          <Route path="/mentee-dashboard">
            <Redirect to="/dashboard" replace />
          </Route>
        )}
        {IS_LOCAL && (
          <Route path="/mentor-portal/:rest*">
            <Redirect to="/dashboard" replace />
          </Route>
        )}
        {IS_LOCAL && (
          <Route path="/mentor-portal">
            <Redirect to="/dashboard" replace />
          </Route>
        )}
        {IS_LOCAL && (
          <Route path="/mentor-dashboard">
            <Redirect to="/dashboard" replace />
          </Route>
        )}
        {IS_LOCAL && (
          <Route path="/admin/:rest*">
            <Redirect to="/dashboard/admin" replace />
          </Route>
        )}
        {IS_LOCAL && (
          <Route path="/admin">
            <Redirect to="/dashboard/admin" replace />
          </Route>
        )}
        {/* Mentee surfaces read the caller's own rows under RLS, so a session is required;
            registration is gated too so the created mentee row matches the session email. */}
        <Route path="/mentee-registration">
          <RequireAuth redirectTo="/signup">
            <MenteeRegistration />
          </RequireAuth>
        </Route>
        {/* Folded into the mentee dashboard (bookings tab carries the notes dialog too). */}
        <Route path="/my-bookings">
          <Redirect to="/mentee-dashboard/bookings" replace />
        </Route>
        <Route path="/mentee-dashboard">
          <RequireAuth>
            <MenteeDashboard />
          </RequireAuth>
        </Route>
        <Route path="/mentee-dashboard/:rest*">
          <RequireAuth>
            <MenteeDashboard />
          </RequireAuth>
        </Route>
        {/* Showcase dashboard (Figma "Creator Dashboard" suite): home, bookings, calendar; analytics below. */}
        <Route path="/dashboard">
          <RequireAuth>
            <DashboardHome />
          </RequireAuth>
        </Route>
        <Route path="/dashboard/bookings">
          <RequireAuth>
            <DashboardBookings />
          </RequireAuth>
        </Route>
        {/* Office hours belong to a mentor row: mentees see the forbidden card; admins pass and the shell sends them to /admin. */}
        <Route path="/dashboard/calendar">
          {IS_LOCAL ? (
            <RequireAuth>
              <DashboardCalendar />
            </RequireAuth>
          ) : (
            <RequireRole role={["mentor", "admin"]}>
              <DashboardCalendar />
            </RequireRole>
          )}
        </Route>
        <Route path="/dashboard/profile">
          <RequireAuth>
            <DashboardProfile />
          </RequireAuth>
        </Route>
        <Route path="/dashboard/activity">
          <RequireAuth>
            <DashboardActivity />
          </RequireAuth>
        </Route>
        <Route path="/dashboard/admin">
          <RequireAuth>
            <DashboardAdmin />
          </RequireAuth>
        </Route>
        {/* Printable impact report (Download PDF = the browser's print-to-PDF; the content guard allows printing here). Programme-wide, so admins only. */}
        <Route path="/analytics/report">
          <RequireRole role="admin">
            <AnalyticsReport />
          </RequireRole>
        </Route>
        {/* Profile analytics: a mentor's own sessions, or the programme for admins. Mentees have no analytics. */}
        <Route path="/analytics">
          <RequireRole role={["admin", "mentor"]}>
            <Analytics />
          </RequireRole>
        </Route>
        {/* Growth analytics: the full reporting page (filters, drill-downs, CSV export) inside the same shell. */}
        <Route path="/analytics/reports">
          <RequireAuth>
            <AnalyticsReports />
          </RequireAuth>
        </Route>
        <Route path="/mentor-onboarding">
          {/* The page performs its own approval check on top of the session requirement. */}
          <RequireAuth>
            <MentorOnboarding />
          </RequireAuth>
        </Route>

        {/* Mentors only */}
        {/* Legacy duplicate of the portal; its availability toggle lives in the portal's Profile tab. */}
        <Route path="/mentor-dashboard">
          <Redirect to="/mentor-portal/profile" replace />
        </Route>
        <Route path="/mentor-portal">
          <RequireRole role="mentor">
            <MentorPortal />
          </RequireRole>
        </Route>
        <Route path="/mentor-portal/:rest*">
          <RequireRole role="mentor">
            <MentorPortal />
          </RequireRole>
        </Route>

        {/* Admins only (tabs are URL-synced: /admin/mentees, /admin/bookings, /admin/access) */}
        <Route path="/admin">
          <RequireRole role="admin">
            <AdminDashboard />
          </RequireRole>
        </Route>
        <Route path="/admin/:rest*">
          <RequireRole role="admin">
            <AdminDashboard />
          </RequireRole>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

/** Everything that needs the active direction: Radix DirectionProvider, header, main, toaster. */
function Shell() {
  const { dir } = useDirection();
  const [previewData] = useState(hasPreviewPeriodData);
  return (
    <DirectionProvider dir={dir}>
      <SkipLink />
      <RouteEffects />
      <ContentGuard />
      <div className="flex min-h-screen flex-col bg-background">
        <Navigation />
        <BackendStatusBanner />
        {previewData && (
          <Suspense fallback={null}>
            <LegacyLocalDataNotice />
          </Suspense>
        )}
        <main id="main" tabIndex={-1} className="flex-1 scroll-mt-14 lg:scroll-mt-[72px]">
          <Router />
        </main>
        <SiteFooter />
      </div>
      <Toaster />
    </DirectionProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={300} skipDelayDuration={800}>
            <LanguageProvider>
              <Shell />
            </LanguageProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
