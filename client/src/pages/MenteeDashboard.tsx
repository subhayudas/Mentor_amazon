import { useState, useEffect } from "react";
import { Route, Switch, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  LayoutDashboard,
  Calendar,
  Heart,
  MessageSquare,
  User,
  Settings,
  LogOut,
  Users,
  CheckCircle,
  Clock,
  Star,
  Save,
  Globe,
  Building2,
  X,
  CalendarPlus,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CalEmbed } from "@/components/CalEmbed";
import type { Mentee, Booking, Mentor } from "@shared/schema";

interface MenteeStats {
  totalSessions: number;
  completedSessions: number;
  upcomingSessions: number;
  uniqueMentors: number;
}

interface BookingWithMentor extends Booking {
  mentor?: Mentor;
}

interface FeedbackBooking extends Booking {
  mentor?: Mentor;
}

function MenteeDashboardHome({ menteeId }: { menteeId: string }) {
  const { t } = useTranslation();
  const [selectedBooking, setSelectedBooking] = useState<BookingWithMentor | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [autoOpenedBookingId, setAutoOpenedBookingId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<MenteeStats>({
    queryKey: ['/api/mentee', menteeId, 'stats'],
  });

  const { data: bookings } = useQuery<BookingWithMentor[]>({
    queryKey: ['/api/mentee', menteeId, 'bookings'],
    refetchInterval: 30000, // Poll every 30 seconds for real-time updates
  });

  const upcomingBookings = bookings?.filter(b => b.status === 'confirmed').slice(0, 3) || [];
  const pendingBookings = bookings?.filter(b => b.status === 'pending' || b.status === 'accepted').slice(0, 3) || [];

  useEffect(() => {
    if (!bookings) return;

    const acceptedBooking = bookings.find(
      b => b.status === 'accepted' &&
        b.mentor?.cal_link &&
        !b.scheduled_at &&
        b.id !== autoOpenedBookingId
    );

    if (acceptedBooking) {
      setSelectedBooking(acceptedBooking);
      setShowCalendar(true);
      setAutoOpenedBookingId(acceptedBooking.id);
    }
  }, [bookings, autoOpenedBookingId]);

  const handleScheduleClick = (booking: BookingWithMentor) => {
    setSelectedBooking(booking);
    setShowCalendar(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-mentee-dashboard-title">{t('menteePortal.dashboardTitle')}</h1>
        <p className="text-muted-foreground">{t('menteePortal.dashboardSubtitle')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('menteePortal.totalSessions')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-sessions">{stats?.totalSessions || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('menteePortal.upcomingSessions')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-upcoming-sessions">{stats?.upcomingSessions || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('menteePortal.completedSessions')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-completed-sessions">{stats?.completedSessions || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('menteePortal.uniqueMentors')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-unique-mentors">{stats?.uniqueMentors || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t('menteePortal.awaitingMentorApproval') || 'Awaiting Mentor Approval'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingBookings.length === 0 ? (
            <p className="text-muted-foreground">{t('menteePortal.noPendingRequests') || 'No pending requests'}</p>
          ) : (
            <div className="space-y-4">
              {pendingBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-4 p-4 border rounded-lg" data-testid={`booking-pending-${booking.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={booking.mentor?.photo_url || undefined} />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{booking.mentor?.name || 'Mentor'}</p>
                      {booking.goal && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{booking.goal}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {booking.status === 'pending'
                          ? (t('menteePortal.awaitingMentorResponse') || 'Awaiting mentor response')
                          : (t('menteePortal.acceptedBookNow') || 'Mentor accepted - Book your time slot')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {booking.status === 'pending' ? (
                      <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{t('menteePortal.pending') || 'Pending'}</Badge>
                    ) : (
                      <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />{t('menteePortal.accepted') || 'Accepted'}</Badge>
                    )}
                    {booking.status === 'accepted' && booking.mentor?.cal_link && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleScheduleClick(booking)}
                        data-testid={`button-schedule-${booking.id}`}
                      >
                        <CalendarPlus className="w-3 h-3 mr-1" />
                        {t('menteePortal.scheduleNow') || 'Schedule Now'}
                      </Button>
                    )}
                    {booking.status === 'accepted' && !booking.mentor?.cal_link && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        {t('menteePortal.calendarNotAvailable') || 'Calendar not configured - Contact mentor'}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t('menteePortal.upcomingSessions')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingBookings.length === 0 ? (
            <p className="text-muted-foreground">{t('menteePortal.noUpcomingSessions')}</p>
          ) : (
            <div className="space-y-4">
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-4 p-4 border rounded-lg" data-testid={`booking-confirmed-${booking.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={booking.mentor?.photo_url || undefined} />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{booking.mentor?.name || 'Mentor'}</p>
                      {booking.goal && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{booking.goal}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {booking.scheduled_at ? format(new Date(booking.scheduled_at), 'PPp') : t('menteePortal.confirmed') || 'Confirmed'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary"><Calendar className="w-3 h-3 mr-1" />{t('menteePortal.confirmed') || 'Confirmed'}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedBooking && selectedBooking.mentor?.cal_link && (
        <CalEmbed
          calLink={selectedBooking.mentor.cal_link}
          mentorName={selectedBooking.mentor.name || "Mentor"}
          bookingId={selectedBooking.id}
          open={showCalendar}
          onOpenChange={setShowCalendar}
        />
      )}
    </div>
  );
}

function MenteeBookings({ menteeId }: { menteeId: string }) {
  const { t } = useTranslation();
  const [selectedBooking, setSelectedBooking] = useState<BookingWithMentor | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [autoOpenedBookingId, setAutoOpenedBookingId] = useState<string | null>(null);

  const { data: bookings, isLoading } = useQuery<BookingWithMentor[]>({
    queryKey: ['/api/mentee', menteeId, 'bookings'],
    refetchInterval: 30000, // Poll every 30 seconds for real-time updates
  });

  const pendingBookings = bookings?.filter(b => b.status === 'pending' || b.status === 'accepted') || [];
  const upcomingBookings = bookings?.filter(b => b.status === 'confirmed') || [];
  const completedBookings = bookings?.filter(b => b.status === 'completed') || [];
  const canceledBookings = bookings?.filter(b => b.status === 'canceled' || b.status === 'rejected') || [];

  useEffect(() => {
    if (!bookings) return;

    const acceptedBooking = bookings.find(
      b => b.status === 'accepted' &&
        b.mentor?.cal_link &&
        !b.scheduled_at &&
        b.id !== autoOpenedBookingId
    );

    if (acceptedBooking) {
      setSelectedBooking(acceptedBooking);
      setShowCalendar(true);
      setAutoOpenedBookingId(acceptedBooking.id);
    }
  }, [bookings, autoOpenedBookingId]);

  const handleScheduleClick = (booking: BookingWithMentor) => {
    setSelectedBooking(booking);
    setShowCalendar(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{t('menteePortal.awaitingResponse') || 'Awaiting Response'}</Badge>;
      case 'accepted':
        return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />{t('menteePortal.acceptedScheduleNow') || 'Accepted - Schedule Now'}</Badge>;
      case 'confirmed':
        return <Badge variant="secondary"><Calendar className="w-3 h-3 mr-1" />{t('menteePortal.confirmed') || 'Confirmed'}</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />{t('menteePortal.declined') || 'Declined'}</Badge>;
      case 'completed':
        return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />{t('menteePortal.completed')}</Badge>;
      case 'canceled':
        return <Badge variant="destructive">{t('menteePortal.canceled')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-bookings-title">{t('menteePortal.myBookings')}</h1>
        <p className="text-muted-foreground">{t('menteePortal.myBookingsSubtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t('menteePortal.awaitingMentorApproval') || 'Awaiting Mentor Approval'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingBookings.length === 0 ? (
            <p className="text-muted-foreground">{t('menteePortal.noPendingRequests') || 'No pending requests. Your booking requests will appear here while waiting for mentor response.'}</p>
          ) : (
            <div className="space-y-4">
              {pendingBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-4 p-4 border rounded-lg" data-testid={`booking-pending-${booking.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={booking.mentor?.photo_url || undefined} />
                      <AvatarFallback>
                        <User className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{booking.mentor?.name || 'Mentor'}</p>
                      <p className="text-sm text-muted-foreground">{booking.mentor?.position}</p>
                      {booking.goal && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{booking.goal}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {booking.status === 'pending'
                          ? (t('menteePortal.awaitingMentorResponse') || 'Awaiting mentor response')
                          : (t('menteePortal.acceptedBookNow') || 'Mentor accepted - Book your time slot')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(booking.status)}
                    {booking.status === 'accepted' && booking.mentor?.cal_link && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleScheduleClick(booking)}
                        data-testid={`button-schedule-booking-${booking.id}`}
                      >
                        <CalendarPlus className="w-3 h-3 mr-1" />
                        {t('menteePortal.scheduleNow') || 'Schedule Now'}
                      </Button>
                    )}
                    {booking.status === 'accepted' && !booking.mentor?.cal_link && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        {t('menteePortal.calendarNotAvailable') || 'Calendar not configured - Contact mentor'}
                      </Badge>
                    )}
                    {booking.mentor && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/mentors/${booking.mentor.id}`}>{t('menteePortal.viewMentorProfile')}</Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t('menteePortal.upcoming')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingBookings.length === 0 ? (
            <p className="text-muted-foreground">{t('menteePortal.noUpcomingSessions')}</p>
          ) : (
            <div className="space-y-4">
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-4 p-4 border rounded-lg" data-testid={`booking-upcoming-${booking.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={booking.mentor?.photo_url || undefined} />
                      <AvatarFallback>
                        <User className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{booking.mentor?.name || 'Mentor'}</p>
                      <p className="text-sm text-muted-foreground">{booking.mentor?.position}</p>
                      {booking.goal && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{booking.goal}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {booking.scheduled_at ? format(new Date(booking.scheduled_at), 'PPp') : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(booking.status)}
                    {booking.mentor && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/mentors/${booking.mentor.id}`}>{t('menteePortal.viewMentorProfile')}</Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {t('menteePortal.completed')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {completedBookings.length === 0 ? (
            <p className="text-muted-foreground">{t('menteePortal.noCompletedSessions')}</p>
          ) : (
            <div className="space-y-4">
              {completedBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-4 p-4 border rounded-lg" data-testid={`booking-completed-${booking.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={booking.mentor?.photo_url || undefined} />
                      <AvatarFallback>
                        <User className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{booking.mentor?.name || 'Mentor'}</p>
                      <p className="text-sm text-muted-foreground">{booking.mentor?.position}</p>
                      {booking.goal && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{booking.goal}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {booking.completed_at ? format(new Date(booking.completed_at), 'PPp') :
                          booking.scheduled_at ? format(new Date(booking.scheduled_at), 'PPp') : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(booking.status)}
                    {booking.mentee_rating ? (
                      <Badge variant="outline">
                        <Star className="w-3 h-3 mr-1 fill-yellow-400 text-yellow-400" />
                        {booking.mentee_rating}/5
                      </Badge>
                    ) : (
                      <Button variant="outline" size="sm">{t('menteePortal.giveFeedback')}</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedBooking && selectedBooking.mentor?.cal_link && (
        <CalEmbed
          calLink={selectedBooking.mentor.cal_link}
          mentorName={selectedBooking.mentor.name || "Mentor"}
          bookingId={selectedBooking.id}
          open={showCalendar}
          onOpenChange={setShowCalendar}
        />
      )}
    </div>
  );
}

function MenteeMentors({ menteeId }: { menteeId: string }) {
  const { t } = useTranslation();

  const { data: bookings, isLoading } = useQuery<BookingWithMentor[]>({
    queryKey: ['/api/mentee', menteeId, 'bookings'],
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
  });

  const uniqueMentors = bookings
    ?.filter(b => b.mentor)
    .reduce((acc, booking) => {
      if (booking.mentor && !acc.find(m => m.id === booking.mentor!.id)) {
        acc.push(booking.mentor);
      }
      return acc;
    }, [] as Mentor[]) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-mentors-title">{t('menteePortal.myMentors')}</h1>
        <p className="text-muted-foreground">{t('menteePortal.myMentorsSubtitle')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t('menteePortal.myMentors')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {uniqueMentors.length === 0 ? (
            <p className="text-muted-foreground">{t('menteePortal.noFavoriteMentors')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uniqueMentors.map((mentor) => (
                <div key={mentor.id} className="flex items-center gap-4 p-4 border rounded-lg" data-testid={`mentor-card-${mentor.id}`}>
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={mentor.photo_url || undefined} />
                    <AvatarFallback>
                      <User className="h-7 w-7" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{mentor.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{mentor.position}</p>
                    <p className="text-sm text-muted-foreground truncate">{mentor.company}</p>
                    {mentor.average_rating && parseFloat(mentor.average_rating) > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm">{parseFloat(mentor.average_rating).toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/mentors/${mentor.id}`}>{t('menteePortal.viewMentorProfile')}</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MenteeFeedback({ menteeId }: { menteeId: string }) {
  const { t } = useTranslation();

  const { data: feedback, isLoading } = useQuery<FeedbackBooking[]>({
    queryKey: ['/api/mentee', menteeId, 'feedback'],
  });

  const feedbackGiven = feedback?.filter(f => f.mentee_rating) || [];
  const feedbackReceived = feedback?.filter(f => f.mentor_rating) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-feedback-title">{t('menteePortal.feedback')}</h1>
        <p className="text-muted-foreground">{t('menteePortal.feedbackSubtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            {t('menteePortal.feedbackGiven')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {feedbackGiven.length === 0 ? (
            <p className="text-muted-foreground">{t('menteePortal.noFeedbackGiven')}</p>
          ) : (
            <div className="space-y-4">
              {feedbackGiven.map((item) => (
                <div key={item.id} className="p-4 border rounded-lg" data-testid={`feedback-given-${item.id}`}>
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={item.mentor?.photo_url || undefined} />
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{item.mentor?.name || 'Mentor'}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.completed_at ? format(new Date(item.completed_at), 'PP') : '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < (item.mentee_rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                  </div>
                  {item.mentee_feedback && (
                    <p className="text-sm text-muted-foreground mt-2">"{item.mentee_feedback}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            {t('menteePortal.feedbackReceived')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {feedbackReceived.length === 0 ? (
            <p className="text-muted-foreground">{t('menteePortal.noFeedbackReceived')}</p>
          ) : (
            <div className="space-y-4">
              {feedbackReceived.map((item) => (
                <div key={item.id} className="p-4 border rounded-lg" data-testid={`feedback-received-${item.id}`}>
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={item.mentor?.photo_url || undefined} />
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{item.mentor?.name || 'Mentor'}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.completed_at ? format(new Date(item.completed_at), 'PP') : '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < (item.mentor_rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                  </div>
                  {item.mentor_feedback && (
                    <p className="text-sm text-muted-foreground mt-2">"{item.mentor_feedback}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const profileFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  country: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  user_type: z.enum(["individual", "organization"]),
  organization_name: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

function MenteeProfileSettings({ mentee }: { mentee: Mentee }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: mentee.name || "",
      country: mentee.country || "",
      timezone: mentee.timezone || "",
      user_type: mentee.user_type || "individual",
      organization_name: mentee.organization_name || "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      return apiRequest("PATCH", `/api/mentees/${mentee.id}`, {
        name: data.name,
        country: data.country || null,
        timezone: data.timezone,
        user_type: data.user_type,
        organization_name: data.user_type === 'organization' ? data.organization_name : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mentees/email'] });
      toast({
        title: t('common.success'),
        description: t('menteePortal.profileSettings.saveSuccess'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('menteePortal.profileSettings.saveError'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    saveMutation.mutate(data);
  };

  const userType = form.watch("user_type");

  const timezones = [
    "UTC",
    "Africa/Cairo",
    "Asia/Dubai",
    "Asia/Riyadh",
    "Asia/Kuwait",
    "Asia/Bahrain",
    "Asia/Qatar",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Asia/Singapore",
  ];

  const countries = [
    "United Arab Emirates",
    "Saudi Arabia",
    "Egypt",
    "Kuwait",
    "Bahrain",
    "Qatar",
    "Oman",
    "Jordan",
    "Lebanon",
    "United States",
    "United Kingdom",
    "Germany",
    "France",
    "Japan",
    "Singapore",
  ];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-profile-settings-title">
          {t('menteePortal.profileSettings.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('menteePortal.profileSettings.subtitle')}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {t('menteePortal.profileSettings.personalInfo')}
              </CardTitle>
              <CardDescription>
                {t('menteePortal.profileSettings.personalInfoDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('menteePortal.profileSettings.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-mentee-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Label>{t('menteePortal.profileSettings.email')}</Label>
                <Input
                  value={mentee.email}
                  disabled
                  className="bg-muted"
                  data-testid="input-mentee-email-readonly"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {t('menteePortal.profileSettings.emailHint')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteePortal.profileSettings.country')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mentee-country">
                            <SelectValue placeholder={t('menteePortal.profileSettings.countryPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteePortal.profileSettings.timezone')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mentee-timezone">
                            <SelectValue placeholder={t('menteePortal.profileSettings.timezonePlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {timezones.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {t('menteePortal.profileSettings.accountInfo')}
              </CardTitle>
              <CardDescription>
                {t('menteePortal.profileSettings.accountInfoDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="user_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('menteePortal.profileSettings.userType')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-mentee-user-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="individual">{t('menteePortal.profileSettings.individual')}</SelectItem>
                        <SelectItem value="organization">{t('menteePortal.profileSettings.organization')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {userType === 'organization' && (
                <FormField
                  control={form.control}
                  name="organization_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteePortal.profileSettings.organizationName')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t('menteePortal.profileSettings.organizationNamePlaceholder')}
                          data-testid="input-mentee-organization"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save-mentee-profile"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </Form>
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
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/mentee-dashboard/profile"}
                      data-testid="sidebar-mentee-profile"
                    >
                      <Link href="/mentee-dashboard/profile">
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
              <Route path="/mentee-dashboard/profile">
                <MenteeProfileSettings mentee={mentee} />
              </Route>
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
