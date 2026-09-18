import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { Toaster as LegacyToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Navigation } from "@/components/Navigation";
import { RequireAuth, RequireRole } from "@/components/RouteGuard";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";

// Every page except Home and NotFound is code-split so the entry chunk stays
// small (recharts ships only with Analytics, the Cal.com embed only on demand).
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const MentorProfile = lazy(() => import("@/pages/MentorProfile"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const MentorOnboarding = lazy(() => import("@/pages/MentorOnboarding"));
const MenteeRegistration = lazy(() => import("@/pages/MenteeRegistration"));
const MentorProfileView = lazy(() => import("@/pages/MentorProfileView"));
const MenteeProfileView = lazy(() => import("@/pages/MenteeProfileView"));
const MyBookings = lazy(() => import("@/pages/MyBookings"));
const MentorDashboard = lazy(() => import("@/pages/MentorDashboard"));
const MentorPortal = lazy(() => import("@/pages/MentorPortal"));
const MenteeDashboard = lazy(() => import("@/pages/MenteeDashboard"));
const SsoCallback = lazy(() => import("@/pages/SsoCallback"));
const RequestAccess = lazy(() => import("@/pages/RequestAccess"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));

/** Shown while a lazy page chunk downloads. */
function PageSkeleton() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 pt-24 pb-12" role="status" aria-busy="true">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        {/* Public */}
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/auth/sso" component={SsoCallback} />
        <Route path="/request-access" component={RequestAccess} />
        <Route path="/mentor/:id" component={MentorProfile} />
        <Route path="/mentors/:id" component={MentorProfile} />
        <Route path="/profile/mentor/:id" component={MentorProfileView} />
        <Route path="/profile/mentee/:id" component={MenteeProfileView} />
        <Route path="/mentee-registration" component={MenteeRegistration} />
        <Route path="/my-bookings" component={MyBookings} />
        <Route path="/mentee-dashboard" component={MenteeDashboard} />
        <Route path="/mentee-dashboard/:rest*" component={MenteeDashboard} />

        {/* Any signed-in session */}
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

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <LanguageProvider>
              <div className="min-h-screen bg-background">
                <Navigation />
                <main className="animate-fade-in">
                  <Router />
                </main>
              </div>
              {/* Two renderers: sonner for pages that import `toast` from "sonner",
                  the shadcn reducer-based one for pages using useToast() from @/hooks/use-toast. */}
              <Toaster />
              <LegacyToaster />
            </LanguageProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
