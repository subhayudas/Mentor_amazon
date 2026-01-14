import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, X, Calendar, Clock, User, Target, Mail, RefreshCw, Inbox } from "lucide-react";
import { format, parseISO } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { Booking, Mentee } from "@shared/schema";

type BookingWithMentee = Booking & { mentee?: Mentee };

interface BookingRequestsProps {
  mentorId: string;
}

export default function BookingRequests({ mentorId }: BookingRequestsProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();

  const { data: bookings, isLoading, refetch, isFetching } = useQuery<BookingWithMentee[]>({
    queryKey: ['/api/mentor', mentorId, 'bookings', 'pending'],
    enabled: !!mentorId,
    refetchInterval: 10000, // Poll every 10 seconds for new requests
    staleTime: 5000, // Consider data stale after 5 seconds
  });

  const acceptMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}/accept`);
    },
    onSuccess: () => {
      // Invalidate all relevant queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'bookings', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({
        title: t('common.success'),
        description: isRTL 
          ? "تم قبول الطلب! سيتلقى المتدرب رابط Cal.com لجدولة جلسته."
          : "Request accepted! The mentee will receive your Cal.com link to schedule their session.",
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.bookingUpdateError'),
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}/decline`);
    },
    onSuccess: () => {
      // Invalidate all relevant queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'bookings', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({
        title: t('common.success'),
        description: isRTL 
          ? "تم رفض الطلب"
          : "Request declined. The mentee has been notified.",
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.bookingUpdateError'),
        variant: "destructive",
      });
    },
  });

  const handleAccept = (bookingId: string) => {
    acceptMutation.mutate(bookingId);
  };

  const handleDecline = (bookingId: string) => {
    declineMutation.mutate(bookingId);
  };

  // The API already returns only pending bookings, but filter to be safe
  const pendingBookings = bookings?.filter(b => b.status === 'pending') ?? [];
  const isMutating = acceptMutation.isPending || declineMutation.isPending;

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-booking-requests-title">
            {t('mentorPortal.bookingRequests')}
          </h1>
          <p className="text-muted-foreground">
            {t('mentorPortal.bookingRequestsSubtitle')}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-requests"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          {isRTL ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="w-5 h-5" />
            {t('mentorPortal.pendingRequests')}
            {pendingBookings.length > 0 && (
              <Badge variant="default" className="bg-orange-500">{pendingBookings.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isRTL 
              ? "راجع طلبات الجلسات من المتدربين واقبلها أو ارفضها"
              : "Review session requests from mentees and accept or decline them"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : pendingBookings.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('mentorPortal.mentee')}</TableHead>
                    <TableHead>{t('mentorPortal.goal') || 'Goal'}</TableHead>
                    <TableHead>{t('mentorPortal.requestedAt')}</TableHead>
                    <TableHead className="text-right">{t('mentorPortal.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingBookings.map((booking) => (
                    <TableRow key={booking.id} data-testid={`booking-row-${booking.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={booking.mentee?.photo_url || undefined} />
                            <AvatarFallback>
                              <User className="w-4 h-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium" data-testid={`text-mentee-name-${booking.id}`}>
                              {booking.mentee?.name || 'Unknown Mentee'}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-mentee-email-${booking.id}`}>
                              <Mail className="w-3 h-3" />
                              {booking.mentee?.email || 'No email'}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1 text-sm max-w-xs">
                          <Target className="w-3 h-3 mt-1 flex-shrink-0 text-muted-foreground" />
                          <span className="line-clamp-2" data-testid={`text-goal-${booking.id}`}>
                            {booking.goal || t('mentorPortal.noGoalSpecified') || 'No goal specified'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {booking.created_at ? format(parseISO(booking.created_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAccept(booking.id)}
                            disabled={isMutating}
                            data-testid={`button-accept-${booking.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            {t('mentorPortal.accept')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDecline(booking.id)}
                            disabled={isMutating}
                            data-testid={`button-decline-${booking.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />
                            {t('mentorPortal.decline')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                <Inbox className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-lg">
                  {isRTL ? 'لا توجد طلبات معلقة' : 'No Pending Requests'}
                </p>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {isRTL 
                    ? "عندما يطلب المتدربون جلسة معك، ستظهر طلباتهم هنا للمراجعة."
                    : "When mentees request a session with you, their requests will appear here for you to review."}
                </p>
              </div>
              <div className="pt-4 border-t max-w-lg mx-auto">
                <h4 className="font-medium mb-2">{isRTL ? 'كيف يعمل النظام:' : 'How it works:'}</h4>
                <ol className="text-sm text-muted-foreground text-left space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-primary">1.</span>
                    {isRTL 
                      ? "يطلب المتدرب جلسة من صفحة ملفك الشخصي"
                      : "A mentee requests a session from your profile page"}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-primary">2.</span>
                    {isRTL 
                      ? "تقوم بمراجعة الطلب وقبوله أو رفضه"
                      : "You review the request and accept or decline it"}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-primary">3.</span>
                    {isRTL 
                      ? "إذا قبلت، يتلقى المتدرب رابط Cal.com الخاص بك لحجز موعد"
                      : "If accepted, the mentee receives your Cal.com link to book a time"}
                  </li>
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
