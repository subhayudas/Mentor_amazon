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
import { Check, X, Calendar, Clock, User, Target, Mail } from "lucide-react";
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

  const { data: bookings, isLoading } = useQuery<BookingWithMentee[]>({
    queryKey: ['/api/mentor', mentorId, 'bookings', 'pending'],
    enabled: !!mentorId,
  });

  const acceptMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("PATCH", `/api/bookings/${bookingId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'dashboard'] });
      toast({
        title: t('common.success'),
        description: "Booking accepted! The mentee will receive a Cal.com link to schedule their session.",
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
