import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Clock, User, CheckCircle, XCircle } from "lucide-react";
import { format, parseISO, isFuture, isPast } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { Booking } from "@shared/schema";

interface MySessionsProps {
  mentorId: string;
}

export default function MySessions({ mentorId }: MySessionsProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("upcoming");

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ['/api/mentor', mentorId, 'bookings'],
    enabled: !!mentorId,
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: string }) => {
      return apiRequest("PATCH", `/api/mentor/${mentorId}/bookings/${bookingId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'dashboard'] });
      toast({
        title: t('common.success'),
        description: t('mentorPortal.sessionUpdated'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.sessionUpdateError'),
        variant: "destructive",
      });
    },
  });

  const upcomingSessions = bookings?.filter(b => 
    b.status === 'scheduled' && b.scheduled_at && isFuture(parseISO(b.scheduled_at))
  ) ?? [];

  const completedSessions = bookings?.filter(b => 
    b.status === 'completed' || (b.scheduled_at && isPast(parseISO(b.scheduled_at)))
  ) ?? [];

  const handleMarkComplete = (bookingId: string) => {
    updateBookingMutation.mutate({ bookingId, status: 'completed' });
  };

  const handleCancel = (bookingId: string) => {
    updateBookingMutation.mutate({ bookingId, status: 'canceled' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="default">{t('mentorPortal.statusScheduled')}</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">{t('mentorPortal.statusCompleted')}</Badge>;
      case 'canceled':
        return <Badge variant="destructive">{t('mentorPortal.statusCanceled')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const SessionCard = ({ booking, showActions = false }: { booking: Booking; showActions?: boolean }) => (
    <Card data-testid={`session-card-${booking.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback>
                <User className="w-5 h-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">Mentee</p>
              <p className="text-sm text-muted-foreground">{booking.mentee_id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(booking.status)}
          </div>
        </div>
        
        <div className="mt-4 flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
          {booking.scheduled_at && (
            <>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {format(parseISO(booking.scheduled_at), 'MMM d, yyyy')}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {format(parseISO(booking.scheduled_at), 'h:mm a')}
              </div>
            </>
          )}
        </div>

        {showActions && booking.status === 'scheduled' && (
          <div className="mt-4 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleMarkComplete(booking.id)}
              disabled={updateBookingMutation.isPending}
              data-testid={`button-complete-${booking.id}`}
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              {t('mentorPortal.markComplete')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCancel(booking.id)}
              disabled={updateBookingMutation.isPending}
              data-testid={`button-cancel-${booking.id}`}
            >
              <XCircle className="w-4 h-4 mr-1" />
              {t('mentorPortal.cancelSession')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-my-sessions-title">
          {t('mentorPortal.mySessions')}
        </h1>
        <p className="text-muted-foreground">
          {t('mentorPortal.mySessionsSubtitle')}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            {t('mentorPortal.upcoming')}
            {upcomingSessions.length > 0 && (
              <Badge variant="secondary" className="ml-2">{upcomingSessions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            {t('mentorPortal.completed')}
            {completedSessions.length > 0 && (
              <Badge variant="secondary" className="ml-2">{completedSessions.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          {isLoading ? (
            <div className="grid gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : upcomingSessions.length > 0 ? (
            <div className="grid gap-4">
              {upcomingSessions.map((session) => (
                <SessionCard key={session.id} booking={session} showActions />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {t('mentorPortal.noUpcomingSessions')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          {isLoading ? (
            <div className="grid gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : completedSessions.length > 0 ? (
            <div className="grid gap-4">
              {completedSessions.map((session) => (
                <SessionCard key={session.id} booking={session} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {t('mentorPortal.noCompletedSessions')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
