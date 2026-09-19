import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { menteeService, mentorService, bookingService } from "@/lib/services";
import type { Booking, Mentor, BookingNote } from "@/lib/database";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  User,
  StickyNote,
  CheckSquare,
  Plus,
  CalendarPlus,
  Star,
  MessageSquare
} from "lucide-react";
import { format, parseISO, isFuture } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MenteeFeedbackDialog, StarRating } from "@/components/MenteeFeedbackDialog";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";

export default function MyBookings() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // Identity is the signed-in session's email (route is behind RequireAuth);
  // RLS only ever returns the caller's own bookings.
  const { user } = useAuth();
  const email = user?.email ?? "";
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<"note" | "task">("note");
  const [feedbackBooking, setFeedbackBooking] = useState<Booking | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);

  const { data: mentee } = useQuery({
    queryKey: ['mentee', 'email', email],
    queryFn: () => menteeService.getByEmail(email),
    enabled: !!email,
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery<(Booking & { mentor?: Mentor })[]>({
    queryKey: ['mentee', mentee?.id, 'bookings'],
    queryFn: () => menteeService.getBookings(mentee!.id),
    enabled: !!mentee?.id,
  });

  const mentors = bookings?.map(b => b.mentor).filter(Boolean) as Mentor[] || [];
  const mentorMap = new Map(mentors.map(m => [m.id, m]));

  // Fetch notes for selected booking
  const { data: bookingNotes, isLoading: notesLoading } = useQuery<BookingNote[]>({
    queryKey: ['bookings', selectedBooking?.id, 'notes'],
    queryFn: () => bookingService.getNotes(selectedBooking!.id),
    enabled: !!selectedBooking?.id,
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (data: { booking_id: string; content: string; note_type: "note" | "task"; author_email: string }) => {
      return bookingService.addNote({
        booking_id: data.booking_id,
        content: data.content,
        note_type: data.note_type,
        author_type: 'mentee',
        author_email: data.author_email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', selectedBooking?.id, 'notes'] });
      setNewNote("");
      toast({
        title: t('myBookings.noteAdded'),
        description: t('myBookings.noteAddedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('myBookings.noteAddError'),
        variant: "destructive",
      });
    },
  });

  const handleAddNote = () => {
    if (!selectedBooking || !newNote.trim()) return;

    addNoteMutation.mutate({
      booking_id: selectedBooking.id,
      content: newNote.trim(),
      note_type: noteType,
      author_email: email,
    });
  };

  const openFeedbackDialog = (booking: Booking) => {
    setFeedbackBooking(booking);
    setFeedbackDialogOpen(true);
  };


  if (!email) {
    return (
      <div className="min-h-screen py-12" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-md mx-auto px-4">
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (bookingsLoading) {
    return (
      <div className="min-h-screen py-12" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-8">
            <div>
              <Skeleton className="h-8 w-32 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const upcomingBookings = bookings?.filter(b =>
    b.scheduled_at && isFuture(parseISO(b.scheduled_at))
  ) || [];
  const pastBookings = bookings?.filter(b =>
    !b.scheduled_at || !isFuture(parseISO(b.scheduled_at))
  ) || [];

  const BookingCard = ({ booking }: { booking: Booking }) => {
    const mentor = mentorMap.get(booking.mentor_id);
    if (!mentor) return null;

    const displayName = isRTL && mentor.name_ar ? mentor.name_ar : mentor.name;
    const displayPosition = isRTL && mentor.position_ar ? mentor.position_ar : mentor.position;

    const initials = mentor.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();

    const displayDate = booking.scheduled_at || booking.clicked_at;

    return (
      <Card className="p-6 hover-elevate transition-transform duration-200" data-testid={`card-booking-${booking.id}`}>
        <div className="flex items-start gap-4">
          <Avatar className="w-14 h-14">
            <AvatarImage src={mentor.photo_url || undefined} alt={displayName} />
            <AvatarFallback className="text-base font-semibold bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold">{displayName}</h3>
                {displayPosition && (
                  <p className="text-sm text-muted-foreground">{displayPosition}</p>
                )}
              </div>
              <Badge variant={booking.status === "completed" ? "default" : booking.status === "canceled" ? "destructive" : "secondary"}>
                {t(`myBookings.status.${booking.status}`)}
              </Badge>
            </div>

            <div className="flex flex-col gap-1 mt-2">
              {displayDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{format(parseISO(displayDate), "MMMM d, yyyy")}</span>
                </div>
              )}
              {booking.scheduled_at && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{format(parseISO(booking.scheduled_at), "h:mm a")}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3 flex-wrap">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedBooking(booking)}
                    data-testid={`button-notes-${booking.id}`}
                  >
                    <StickyNote className="w-4 h-4 mr-2" />
                    {t('myBookings.viewNotes')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('myBookings.sessionNotes')}</DialogTitle>
                    <DialogDescription>
                      {t('myBookings.sessionNotesDesc', { mentor: displayName })}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 mt-4">
                    {/* Add New Note Section */}
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <h4 className="font-medium mb-3">{t('myBookings.addNote')}</h4>
                      <div className="space-y-3">
                        <Tabs value={noteType} onValueChange={(v) => setNoteType(v as "note" | "task")}>
                          <TabsList>
                            <TabsTrigger value="note" data-testid="tab-note">
                              <StickyNote className="w-4 h-4 mr-1" />
                              {t('myBookings.noteType')}
                            </TabsTrigger>
                            <TabsTrigger value="task" data-testid="tab-task">
                              <CheckSquare className="w-4 h-4 mr-1" />
                              {t('myBookings.taskType')}
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                        <Textarea
                          placeholder={noteType === "note" ? t('myBookings.notePlaceholder') : t('myBookings.taskPlaceholder')}
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          className="min-h-20"
                          data-testid="input-new-note"
                        />
                        <Button
                          onClick={handleAddNote}
                          disabled={!newNote.trim() || addNoteMutation.isPending}
                          data-testid="button-add-note"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          {addNoteMutation.isPending ? t('common.loading') : t('myBookings.addNoteBtn')}
                        </Button>
                      </div>
                    </div>

                    {/* Existing Notes */}
                    <div className="space-y-3">
                      <h4 className="font-medium">{t('myBookings.existingNotes')}</h4>
                      {notesLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-16" />
                          <Skeleton className="h-16" />
                        </div>
                      ) : bookingNotes && bookingNotes.length > 0 ? (
                        bookingNotes.map((note) => (
                          <div
                            key={note.id}
                            className="p-3 border rounded-lg"
                            data-testid={`note-${note.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {note.note_type === "task" ? (
                                  <CheckSquare className="w-4 h-4 text-primary" />
                                ) : (
                                  <StickyNote className="w-4 h-4 text-muted-foreground" />
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {note.author_type === "mentor" ? t('myBookings.fromMentor') : t('myBookings.fromYou')}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(note.created_at), "MMM d, yyyy")}
                              </span>
                            </div>
                            <p className="mt-2 text-sm">{note.content}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          {t('myBookings.noNotes')}
                        </p>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Feedback Button - Show for past bookings */}
              {(!booking.scheduled_at || !isFuture(parseISO(booking.scheduled_at))) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openFeedbackDialog(booking)}
                  data-testid={`button-feedback-${booking.id}`}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  {booking.mentee_rating || booking.mentor_rating
                    ? t('myBookings.viewFeedback')
                    : t('myBookings.giveFeedback')}
                </Button>
              )}

              {/* Schedule Additional Session Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation(`/mentors/${booking.mentor_id}`)}
                data-testid={`button-schedule-more-${booking.id}`}
              >
                <CalendarPlus className="w-4 h-4 mr-2" />
                {t('myBookings.scheduleAnother')}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen py-12" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <h1 className="text-3xl font-bold">{t('myBookings.title')}</h1>
          <Button
            variant="outline"
            onClick={() => setLocation("/mentee-dashboard")}
            data-testid="button-open-dashboard"
          >
            <User className="w-4 h-4 me-2" />
            {t('nav.menteeDashboard')}
          </Button>
        </div>

        <div className="space-y-12">
          <div data-testid="section-upcoming">
            <h2 className="text-2xl font-bold mb-4">{t('myBookings.upcomingSessions')}</h2>
            {upcomingBookings.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">{t('myBookings.noUpcoming')}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </div>

          <div data-testid="section-past">
            <h2 className="text-2xl font-bold mb-4">{t('myBookings.pastSessions')}</h2>
            {pastBookings.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">{t('myBookings.noPast')}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pastBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feedback Dialog */}
      <MenteeFeedbackDialog
        booking={feedbackBooking}
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        invalidateKeys={[['mentee', mentee?.id, 'bookings']]}
      />
    </div>
  );
}
