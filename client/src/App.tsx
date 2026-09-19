import { lazy, Suspense, useEffect, useRef } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { DirectionProvider } from "@radix-ui/react-direction";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/sonner";
import { Toaster as LegacyToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Navigation } from "@/components/Navigation";
import { SkipLink } from "@/components/SkipLink";
import { RequireAuth, RequireRole } from "@/components/RouteGuard";
import { useDirection } from "@/hooks/useDirection";
import { pageTitleKey } from "@/lib/routes";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";

// Every page except Home and NotFound is code-split so the entry chunk stays
// small (recharts ships only with Analytics, the Cal.com embed only on demand).
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Mentors = lazy(() => import("@/pages/Mentors"));
const MentorProfile = lazy(() => import("@/pages/MentorProfile"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const MentorOnboarding = lazy(() => import("@/pages/MentorOnboarding"));
const MenteeRegistration = lazy(() => import("@/pages/MenteeRegistration"));
const MenteeProfileView = lazy(() => import("@/pages/MenteeProfileView"));
const MyBookings = lazy(() => import("@/pages/MyBookings"));
const MentorDashboard = lazy(() => import("@/pages/MentorDashboard"));
const MentorPortal = lazy(() => import("@/pages/MentorPortal"));
const MenteeDashboard = lazy(() => import("@/pages/MenteeDashboard"));
const SsoCallback = lazy(() => import("@/pages/SsoCallback"));
const RequestAccess = lazy(() => import("@/pages/RequestAccess"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));

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
        <Route path="/signup" component={Signup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/auth/sso" component={SsoCallback} />
        <Route path="/request-access" component={RequestAccess} />
        <Route path="/mentor/:id" component={MentorProfile} />
        <Route path="/mentors/:id" component={MentorProfile} />
        {/* Legacy public profile URL → the single mentor profile route (id preserved). */}
        <Route path="/profile/mentor/:id">
          {(params) => <Redirect to={`/mentor/${params.id}`} replace />}
        </Route>
        <Route path="/profile/mentee/:id" component={MenteeProfileView} />

        {/* Any signed-in session */}
        {/* Mentee surfaces read the caller's own rows under RLS, so a session is required;
            registration is gated too so the created mentee row matches the session email. */}
        <Route path="/mentee-registration">
          <RequireAuth redirectTo="/signup">
            <MenteeRegistration />
          </RequireAuth>
        </Route>
        <Route path="/my-bookings">
          <RequireAuth>
            <MyBookings />
          </RequireAuth>
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
        <Route path="/analytics">
          <RequireAuth>
            <Analytics />
          </RequireAuth>
        </Route>
        <Route path="/mentor-onboarding">
          {/* The page performs its own approval check on top of the session requirement. */}
          <RequireAuth>
            <MentorOnboarding />
          </RequireAuth>
        </Route>

        {/* Mentors only */}
        <Route path="/mentor-dashboard">
          <RequireRole role="mentor">
            <MentorDashboard />
          </RequireRole>
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

/** Everything that needs the active direction: Radix DirectionProvider, header, main, toasters. */
function Shell() {
  const { dir } = useDirection();
  return (
    <DirectionProvider dir={dir}>
      <SkipLink />
      <RouteEffects />
      <div className="flex min-h-screen flex-col bg-background">
        <Navigation />
        <main id="main" tabIndex={-1} className="flex-1 scroll-mt-14">
          <Router />
        </main>
      </div>
      {/* Two renderers: sonner for pages that import `toast` from "sonner",
          the shadcn reducer-based one for pages using useToast() from @/hooks/use-toast. */}
      <Toaster />
      <LegacyToaster />
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
