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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  Calendar,
  Heart,
  MessageSquare,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import type { Mentee } from "@shared/schema";

function MenteeDashboardHome({ menteeId }: { menteeId: string }) {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('menteePortal.dashboardTitle')}</h1>
        <p className="text-muted-foreground">{t('menteePortal.dashboardSubtitle')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('menteePortal.totalSessions')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('menteePortal.upcomingSessions')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('menteePortal.favoriteMentors')}</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('menteePortal.feedbackGiven')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('menteePortal.recentActivity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('menteePortal.noActivity')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MenteeBookings({ menteeId }: { menteeId: string }) {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('menteePortal.myBookings')}</h1>
        <p className="text-muted-foreground">{t('menteePortal.myBookingsSubtitle')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('menteePortal.upcoming')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('menteePortal.noUpcomingSessions')}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('menteePortal.completed')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('menteePortal.noCompletedSessions')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MenteeMentors({ menteeId }: { menteeId: string }) {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('menteePortal.myMentors')}</h1>
        <p className="text-muted-foreground">{t('menteePortal.myMentorsSubtitle')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('menteePortal.favoriteMentors')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('menteePortal.noFavoriteMentors')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MenteeFeedback({ menteeId }: { menteeId: string }) {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('menteePortal.feedback')}</h1>
        <p className="text-muted-foreground">{t('menteePortal.feedbackSubtitle')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('menteePortal.feedbackGiven')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('menteePortal.noFeedbackGiven')}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('menteePortal.feedbackReceived')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('menteePortal.noFeedbackReceived')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MenteeDashboard() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [location] = useLocation();
  const [menteeEmail, setMenteeEmail] = useState("");
  const [storedEmail, setStoredEmail] = useState<string | null>(null);

  useEffect(() => {
    const email = localStorage.getItem("menteeEmail");
    if (email) {
      setStoredEmail(email);
    }
  }, []);

  const { data: mentee, isLoading: menteeLoading, error } = useQuery<Mentee>({
    queryKey: ['/api/mentees/email', storedEmail],
    enabled: !!storedEmail,
  });

  const handleAccessDashboard = (e: React.FormEvent) => {
    e.preventDefault();
    if (menteeEmail.trim()) {
      localStorage.setItem("menteeEmail", menteeEmail.trim());
      setStoredEmail(menteeEmail.trim());
    }
  };

  const handleChangeEmail = () => {
    localStorage.removeItem("menteeEmail");
    setStoredEmail(null);
    setMenteeEmail("");
  };

  if (!storedEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">
              {t('menteePortal.accessPortal')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAccessDashboard} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('menteePortal.enterEmail')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={menteeEmail}
                  onChange={(e) => setMenteeEmail(e.target.value)}
                  placeholder={t('menteePortal.emailPlaceholder')}
                  data-testid="input-mentee-email"
                  required
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-access-mentee-portal">
                {t('menteePortal.accessBtn')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (menteeLoading) {
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

  if (error || !mentee) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">
              {t('menteePortal.notFound')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              {t('menteePortal.notFoundDesc')}
            </p>
            <Button onClick={handleChangeEmail} data-testid="button-try-again">
              {t('menteePortal.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const menuItems = [
    {
      key: "dashboard",
      title: t('menteePortal.sidebarDashboard'),
      url: "/mentee-dashboard",
      icon: LayoutDashboard,
    },
    {
      key: "bookings",
      title: t('menteePortal.sidebarBookings'),
      url: "/mentee-dashboard/bookings",
      icon: Calendar,
    },
    {
      key: "mentors",
      title: t('menteePortal.sidebarMentors'),
      url: "/mentee-dashboard/mentors",
      icon: Heart,
    },
    {
      key: "feedback",
      title: t('menteePortal.sidebarFeedback'),
      url: "/mentee-dashboard/feedback",
      icon: MessageSquare,
    },
  ];

  const isActive = (url: string) => {
    if (url === "/mentee-dashboard") {
      return location === "/mentee-dashboard";
    }
    return location.startsWith(url);
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const menteeName = mentee.name;

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full" dir={isRTL ? 'rtl' : 'ltr'}>
        <Sidebar side={isRTL ? 'right' : 'left'}>
          <SidebarHeader className="border-b p-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={mentee.photo_url || undefined} alt={menteeName} />
                <AvatarFallback>
                  <User className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{menteeName}</p>
                <p className="text-xs text-muted-foreground truncate">{mentee.email}</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{t('menteePortal.sidebarMenu')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton 
                        asChild
                        isActive={isActive(item.url)}
                        data-testid={`sidebar-mentee-${item.key}`}
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
              <SidebarGroupLabel>{t('menteePortal.sidebarSettings')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-testid="sidebar-mentee-profile">
                      <Link href={`/profile/mentee/${mentee.id}`}>
                        <Settings className="w-4 h-4" />
                        <span>{t('menteePortal.sidebarProfile')}</span>
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
              onClick={handleChangeEmail}
              data-testid="button-mentee-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('menteePortal.changeAccount')}
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-4 border-b bg-background">
            <SidebarTrigger data-testid="button-mentee-sidebar-toggle" />
          </header>
          
          <main className="flex-1 overflow-auto p-6">
            <Switch>
              <Route path="/mentee-dashboard">
                <MenteeDashboardHome menteeId={mentee.id} />
              </Route>
              <Route path="/mentee-dashboard/bookings">
                <MenteeBookings menteeId={mentee.id} />
              </Route>
              <Route path="/mentee-dashboard/mentors">
                <MenteeMentors menteeId={mentee.id} />
              </Route>
              <Route path="/mentee-dashboard/feedback">
                <MenteeFeedback menteeId={mentee.id} />
              </Route>
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
