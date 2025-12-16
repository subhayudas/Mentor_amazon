import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Check, X, Calendar, Clock, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { Booking } from "@shared/schema";

interface BookingRequestsProps {
  mentorId: string;
}

export default function BookingRequests({ mentorId }: BookingRequestsProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ['/api/mentor', mentorId, 'bookings', { status: 'clicked' }],
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
        description: t('mentorPortal.bookingUpdated'),
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
    updateBookingMutation.mutate({ bookingId, status: 'scheduled' });
  };

  const handleDecline = (bookingId: string) => {
    updateBookingMutation.mutate({ bookingId, status: 'canceled' });
  };

  const pendingBookings = bookings?.filter(b => b.status === 'clicked') ?? [];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-booking-requests-title">
          {t('mentorPortal.bookingRequests')}
        </h1>
        <p className="text-muted-foreground">
          {t('mentorPortal.bookingRequestsSubtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t('mentorPortal.pendingRequests')}
            {pendingBookings.length > 0 && (
              <Badge variant="secondary">{pendingBookings.length}</Badge>
            )}
          </CardTitle>
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
                    <TableHead>{t('mentorPortal.requestedAt')}</TableHead>
                    <TableHead>{t('mentorPortal.scheduledFor')}</TableHead>
                    <TableHead className="text-right">{t('mentorPortal.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingBookings.map((booking) => (
                    <TableRow key={booking.id} data-testid={`booking-row-${booking.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback>
                              <User className="w-4 h-4" />
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{booking.mentee_id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {format(parseISO(booking.clicked_at), 'MMM d, yyyy h:mm a')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {booking.scheduled_at ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="w-3 h-3" />
                            {format(parseISO(booking.scheduled_at), 'MMM d, yyyy h:mm a')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            {t('mentorPortal.notScheduled')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAccept(booking.id)}
                            disabled={updateBookingMutation.isPending}
                            data-testid={`button-accept-${booking.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            {t('mentorPortal.accept')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDecline(booking.id)}
                            disabled={updateBookingMutation.isPending}
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
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {t('mentorPortal.noPendingBookings')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
