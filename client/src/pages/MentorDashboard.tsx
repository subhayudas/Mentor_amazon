import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Mentor, Booking } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  Clock,
  User,
  Mail,
  PauseCircle,
  PlayCircle,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { format, parseISO, isFuture } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export default function MentorDashboard() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("email") || localStorage.getItem("mentorEmail") || "";
  });
  const [inputEmail, setInputEmail] = useState(email);

  const { data: mentor, isLoading: mentorLoading } = useQuery<Mentor>({
    queryKey: ["/api/mentors/email", email],
    enabled: !!email,
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["/api/mentors", mentor?.id, "bookings"],
    enabled: !!mentor?.id,
  });

  // Toggle availability mutation
  const toggleAvailabilityMutation = useMutation({
    mutationFn: async (isAvailable: boolean) => {
      return apiRequest("PATCH", `/api/mentors/${mentor?.id}/availability`, {
        is_available: isAvailable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mentors/email", email] });
      queryClient.invalidateQueries({ queryKey: ["/api/mentors"] });
      toast({
        title: t('mentorDashboard.availabilityUpdated'),
        description: mentor?.is_available
          ? t('mentorDashboard.profilePaused')
          : t('mentorDashboard.profileActive'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorDashboard.availabilityError'),
        variant: "destructive",
      });
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmail(inputEmail);
    localStorage.setItem("mentorEmail", inputEmail);
    setLocation(`/mentor-dashboard?email=${inputEmail}`);
  };

  const handleToggleAvailability = () => {
    if (!mentor) return;
    toggleAvailabilityMutation.mutate(!mentor.is_available);
  };

  if (!email) {
    return (
      <div className="min-h-screen py-12" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-md mx-auto px-4">
          <Card className="p-8">
            <CardHeader>
              <CardTitle>{t('mentorDashboard.accessDashboard')}</CardTitle>
              <CardDescription>
                {t('mentorDashboard.enterEmailDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('mentorDashboard.enterEmail')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="mentor@example.com"
                    value={inputEmail}
                    onChange={(e) => setInputEmail(e.target.value)}
                    data-testid="input-mentor-email"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" data-testid="button-access-dashboard">
                  {t('mentorDashboard.accessBtn')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (mentorLoading) {
    return (
      <div className="min-h-screen py-12" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!mentor) {
    return (
      <div className="min-h-screen py-12" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-md mx-auto px-4">
          <Card className="p-8 text-center">
            <CardHeader>
              <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <CardTitle>{t('mentorDashboard.notFound')}</CardTitle>
              <CardDescription>
                {t('mentorDashboard.notFoundDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.removeItem("mentorEmail");
                  setEmail("");
                  setInputEmail("");
                  setLocation("/mentor-dashboard");
                }}
                data-testid="button-try-again"
              >
                {t('mentorDashboard.tryAgain')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const displayName = isRTL && mentor.name_ar ? mentor.name_ar : mentor.name;
  const displayPosition = isRTL && mentor.position_ar ? mentor.position_ar : mentor.position;
  const displayCompany = isRTL && mentor.company_ar ? mentor.company_ar : mentor.company;

  const initials = mentor.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const upcomingBookings = bookings?.filter(b =>
    b.scheduled_at && isFuture(parseISO(b.scheduled_at))
  ) || [];
  const totalBookings = bookings?.length || 0;
  const completedBookings = bookings?.filter(b => b.status === "completed").length || 0;

  return (
    <div className="min-h-screen py-12" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <h1 className="text-3xl font-bold">{t('mentorDashboard.title')}</h1>
          <Button
            variant="outline"
            onClick={() => {
              localStorage.removeItem("mentorEmail");
              setEmail("");
              setInputEmail("");
              setLocation("/mentor-dashboard");
            }}
            data-testid="button-change-email"
          >
            <User className="w-4 h-4 mr-2" />
            {t('mentorDashboard.changeEmail')}
          </Button>
        </div>

        <div className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={mentor.photo_url || undefined} alt={displayName} />
                    <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-xl" data-testid="text-mentor-name">{displayName}</CardTitle>
                    {displayPosition && displayCompany && (
                      <CardDescription>{displayPosition} @ {displayCompany}</CardDescription>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      <span>{mentor.email}</span>
                    </div>
                  </div>
                </div>
                <Badge
                  variant={mentor.is_available ? "default" : "secondary"}
                  className={mentor.is_available ? "bg-green-600" : ""}
                  data-testid="badge-availability"
                >
                  {mentor.is_available
                    ? t('mentorDashboard.available', 'Available')
                    : t('mentorDashboard.unavailable', 'Unavailable')
                  }
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Availability Toggle Card */}
          <Card className={!mentor.is_available ? "border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/20" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {mentor.is_available ? (
                  <PlayCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <PauseCircle className="w-5 h-5 text-orange-600" />
                )}
                {t('mentorDashboard.profileStatus')}
              </CardTitle>
              <CardDescription>
                {mentor.is_available
                  ? t('mentorDashboard.profileActiveDesc')
                  : t('mentorDashboard.profilePausedDesc')
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4 p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  {mentor.is_available ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                  )}
                  <div>
                    <p className="font-medium">
                      {mentor.is_available
                        ? t('mentorDashboard.acceptingBookings')
                        : t('mentorDashboard.notAcceptingBookings')
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {mentor.is_available
                        ? t('mentorDashboard.toggleToHide')
                        : t('mentorDashboard.toggleToShow')
                      }
                    </p>
                  </div>
                </div>
                <Switch
                  checked={mentor.is_available}
                  onCheckedChange={handleToggleAvailability}
                  disabled={toggleAvailabilityMutation.isPending}
                  data-testid="switch-availability"
                />
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('mentorDashboard.totalBookings')}</CardDescription>
                <CardTitle className="text-3xl">{totalBookings}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('mentorDashboard.completed')}</CardDescription>
                <CardTitle className="text-3xl">{completedBookings}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('mentorDashboard.upcoming')}</CardDescription>
                <CardTitle className="text-3xl">{upcomingBookings.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Upcoming Sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {t('mentorDashboard.upcomingSessions')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bookingsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : upcomingBookings.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {t('mentorDashboard.noUpcoming')}
                </p>
              ) : (
                <div className="space-y-3">
                  {upcomingBookings.slice(0, 5).map((booking) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`booking-${booking.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {booking.scheduled_at && format(parseISO(booking.scheduled_at), "MMMM d, yyyy")}
                          </p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {booking.scheduled_at && format(parseISO(booking.scheduled_at), "h:mm a")}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{t(`myBookings.status.${booking.status}`)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
