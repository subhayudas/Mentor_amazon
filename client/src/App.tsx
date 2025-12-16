import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { Navigation } from "@/components/Navigation";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import MentorProfile from "@/pages/MentorProfile";
import Analytics from "@/pages/Analytics";
import MentorOnboarding from "@/pages/MentorOnboarding";
import MenteeRegistration from "@/pages/MenteeRegistration";
import MentorProfileView from "@/pages/MentorProfileView";
import MenteeProfileView from "@/pages/MenteeProfileView";
import MyBookings from "@/pages/MyBookings";
import MentorDashboard from "@/pages/MentorDashboard";
import MentorPortal from "@/pages/MentorPortal";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/mentor/:id" component={MentorProfile} />
      <Route path="/mentors/:id" component={MentorProfile} />
      <Route path="/profile/mentor/:id" component={MentorProfileView} />
      <Route path="/profile/mentee/:id" component={MenteeProfileView} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/mentor-onboarding" component={MentorOnboarding} />
      <Route path="/mentee-registration" component={MenteeRegistration} />
      <Route path="/my-bookings" component={MyBookings} />
      <Route path="/mentor-dashboard" component={MentorDashboard} />
      <Route path="/mentor-portal/:rest*" component={MentorPortal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <LanguageProvider>
            <div className="min-h-screen bg-background">
              <Navigation />
              <Router />
            </div>
            <Toaster />
          </LanguageProvider>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
