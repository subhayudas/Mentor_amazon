import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { Mentor } from "@shared/schema";

export default function MentorPortal() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [location] = useLocation();
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);
  const [storedMentorId, setStoredMentorId] = useState<string | null>(null);

  useEffect(() => {
    const mentorId = localStorage.getItem("mentorId");
    if (mentorId) {
      setStoredMentorId(mentorId);
    }
  }, []);

  const { data: allMentors, isLoading: mentorsLoading } = useQuery<Mentor[]>({
    queryKey: ['/api/mentors'],
  });

  const { data: mentor, isLoading: mentorLoading, error } = useQuery<Mentor>({
    queryKey: ['/api/mentors', storedMentorId],
    enabled: !!storedMentorId,
  });

  const handleAccessDashboard = () => {
    if (selectedMentorId) {
      localStorage.setItem("mentorId", selectedMentorId);
      setStoredMentorId(selectedMentorId);
    }
  };

  const handleChangeMentor = () => {
    localStorage.removeItem("mentorId");
    setStoredMentorId(null);
    setSelectedMentorId(null);
  };

  if (!storedMentorId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">
              {t('mentorPortal.accessPortal') || 'Mentor Portal'}
            </CardTitle>
            <CardDescription className="text-center">
              {t('mentorPortal.selectMentor') || 'Select your profile to access your dashboard'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mentorsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t('mentorPortal.chooseMentor') || 'Choose your profile'}</Label>
                  <Select value={selectedMentorId || ""} onValueChange={setSelectedMentorId}>
                    <SelectTrigger data-testid="select-mentor">
                      <SelectValue placeholder={t('mentorPortal.selectPlaceholder') || 'Select a mentor profile'} />
                    </SelectTrigger>
                    <SelectContent>
                      {allMentors?.map((m) => (
                        <SelectItem key={m.id} value={m.id} data-testid={`mentor-option-${m.id}`}>
                          <div className="flex items-center gap-2">
                            <span>{m.name}</span>
                            <span className="text-muted-foreground text-xs">({m.email})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleAccessDashboard} 
                  className="w-full" 
                  disabled={!selectedMentorId}
                  data-testid="button-access-portal"
                >
                  {t('mentorPortal.accessBtn') || 'Access Dashboard'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mentorLoading) {
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

  if (error || !mentor) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">
              {t('mentorDashboard.notFound') || 'Mentor Not Found'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              {t('mentorDashboard.notFoundDesc') || 'The selected mentor profile could not be found.'}
            </p>
            <Button onClick={handleChangeMentor} data-testid="button-try-again">
              {t('mentorDashboard.tryAgain') || 'Select Another Mentor'}
            </Button>
          </CardContent>
        </Card>
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

          <SidebarFooter className="border-t p-4">
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={handleChangeMentor}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('mentorPortal.changeAccount')}
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
