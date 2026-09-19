import { useEffect } from "react";
import { Route, Switch, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  Calendar,
  Users,
  ListTodo,
  Clock,
  MessageSquare,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import DashboardHome from "@/pages/mentor/DashboardHome";
import BookingRequests from "@/pages/mentor/BookingRequests";
import MySessions from "@/pages/mentor/MySessions";
import TaskManager from "@/pages/mentor/TaskManager";
import Availability from "@/pages/mentor/Availability";
import Feedback from "@/pages/mentor/Feedback";
import ProfileSettings from "@/pages/mentor/ProfileSettings";
import { mentorService } from "@/lib/services";
import { syncRoleStorage } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import type { Mentor } from "@/lib/database";

export default function MentorPortal() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [location, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // Identity comes from the authenticated session only. `profile_id` is the
  // mentor row this account provably owns (users.profile_id, or the mentors row
  // whose email matches the session email). localStorage is never consulted:
  // mentor ids are world-readable, so a stored id proves nothing.
  const isMentorSession = !!user && user.user_type === 'mentor';
  const mentorId = isMentorSession ? user.profile_id : undefined;

  // Own full row, read by the session email or the admin-created profile link
  // — the same predicates RLS uses for mentor ownership, so a spoofed id can
  // never resolve to another mentor.
  const { data: mentor, isLoading: mentorLoading } = useQuery<Mentor | null>({
    queryKey: ['mentor', 'own', user?.email, mentorId],
    queryFn: () => mentorService.getOwn({ email: user!.email, profileId: mentorId }),
    enabled: !!mentorId,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLocation('/login');
      return;
    }
    if (user.user_type !== 'mentor') {
      // Signed in, but not as a mentor: nothing here belongs to this account.
      setLocation(user.user_type === 'mentee' ? '/mentee-dashboard' : '/');
      return;
    }
    if (!user.profile_id) {
      // Approved mentor account without a profile row yet.
      setLocation('/mentor-onboarding');
    }
  }, [authLoading, user, setLocation]);

  // Keep the legacy role mirror consistent with the verified identity
  // (and clear any stale opposite-role ids left by a previous session).
  useEffect(() => {
    if (!authLoading && isMentorSession && mentor) {
      syncRoleStorage(user);
    }
  }, [authLoading, isMentorSession, mentor, user]);

  // Profile id present but the row is gone (deactivated/deleted): drop to login.
  useEffect(() => {
    if (mentorId && !mentorLoading && mentor === null) {
      setLocation('/login');
    }
  }, [mentorId, mentorLoading, mentor, setLocation]);

  if (authLoading || mentorLoading || !mentor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md p-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      key: "dashboard",
      title: t('mentorPortal.sidebarDashboard'),
      url: "/mentor-portal",
      icon: LayoutDashboard,
    },
    {
      key: "bookings",
      title: t('mentorPortal.sidebarBookings'),
      url: "/mentor-portal/bookings",
      icon: Calendar,
    },
    {
      key: "sessions",
      title: t('mentorPortal.sidebarSessions'),
      url: "/mentor-portal/sessions",
      icon: Users,
    },
    {
      key: "tasks",
      title: t('mentorPortal.sidebarTasks'),
      url: "/mentor-portal/tasks",
      icon: ListTodo,
    },
    {
      key: "availability",
      title: t('mentorPortal.sidebarAvailability'),
      url: "/mentor-portal/availability",
      icon: Clock,
    },
    {
      key: "feedback",
      title: t('mentorPortal.sidebarFeedback'),
      url: "/mentor-portal/feedback",
      icon: MessageSquare,
    },
  ];

  const isActive = (url: string) => {
    if (url === "/mentor-portal") {
      return location === "/mentor-portal";
    }
    return location.startsWith(url);
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const mentorName = isRTL && mentor.name_ar ? mentor.name_ar : mentor.name;
  const mentorPosition = isRTL && mentor.position_ar ? mentor.position_ar : mentor.position;

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full" dir={isRTL ? 'rtl' : 'ltr'}>
        <Sidebar side={isRTL ? 'right' : 'left'}>
          <SidebarHeader className="border-b p-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={mentor.photo_url || undefined} alt={mentorName} />
                <AvatarFallback>
                  <User className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{mentorName}</p>
                <p className="text-xs text-muted-foreground truncate">{mentorPosition}</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{t('mentorPortal.sidebarMenu')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton 
                        asChild
                        isActive={isActive(item.url)}
                        data-testid={`sidebar-${item.key}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>{t('mentorPortal.sidebarSettings')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={location.startsWith('/mentor-portal/profile')}
                      data-testid="sidebar-profile"
                    >
                      <Link href="/mentor-portal/profile">
                        <Settings className="w-4 h-4" />
                        <span>{t('mentorPortal.sidebarProfile')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t p-4 space-y-2">
            <Button
              variant="ghost" 
              className="w-full justify-start" 
              onClick={() => setLocation('/')}
              data-testid="button-exit-portal"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('mentorPortal.exitPortal') || 'Exit Portal'}
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-4 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          
          <main className="flex-1 overflow-auto p-6">
            <Switch>
              <Route path="/mentor-portal">
                <DashboardHome mentorId={mentor.id} />
              </Route>
              <Route path="/mentor-portal/bookings">
                <BookingRequests mentorId={mentor.id} />
              </Route>
              <Route path="/mentor-portal/sessions">
                <MySessions mentorId={mentor.id} mentorEmail={mentor.email || undefined} />
              </Route>
              <Route path="/mentor-portal/tasks">
                <TaskManager mentorId={mentor.id} />
              </Route>
              <Route path="/mentor-portal/availability">
                <Availability mentorId={mentor.id} />
              </Route>
              <Route path="/mentor-portal/feedback">
                <Feedback mentorId={mentor.id} />
              </Route>
              <Route path="/mentor-portal/profile">
                <ProfileSettings mentorId={mentor.id} mentorEmail={mentor.email || ""} />
              </Route>
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
