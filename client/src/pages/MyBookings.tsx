import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Booking, Mentor, BookingNote } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export default function MyBookings() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("email") || localStorage.getItem("menteeEmail") || "";
  });
  const [inputEmail, setInputEmail] = useState(email);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<"note" | "task">("note");
  const [feedbackBooking, setFeedbackBooking] = useState<Booking | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);

  const { data: bookings, isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["/api/mentees", email, "bookings"],
    enabled: !!email,
  });

  const mentorIds = bookings?.map(b => b.mentor_id) || [];
  const uniqueMentorIds = Array.from(new Set(mentorIds));

  const mentorQueries = useQuery<Mentor[]>({
    queryKey: ["/api/mentors"],
    enabled: uniqueMentorIds.length > 0,
  });

  const mentors = mentorQueries.data || [];
  const mentorMap = new Map(mentors.map(m => [m.id, m]));

  // Fetch notes for selected booking
  const { data: bookingNotes, isLoading: notesLoading } = useQuery<BookingNote[]>({
    queryKey: ["/api/bookings", selectedBooking?.id, "notes"],
    enabled: !!selectedBooking?.id,
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (data: { booking_id: string; content: string; note_type: "note" | "task"; author_email: string }) => {
      return apiRequest("POST", `/api/bookings/${data.booking_id}/notes`, {
        content: data.content,
        note_type: data.note_type,
        author_type: "mentee",
        author_email: data.author_email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", selectedBooking?.id, "notes"] });
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

  // Submit feedback mutation
  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: { bookingId: string; rating: number; feedback: string }) => {
      return apiRequest("POST", `/api/bookings/${data.bookingId}/mentee-feedback`, {
        rating: data.rating,
        feedback: data.feedback,
        menteeEmail: email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mentees", email, "bookings"] });
      setFeedbackDialogOpen(false);
      setFeedbackBooking(null);
      setFeedbackRating(0);
      setFeedbackText("");
      toast({
        title: t('myBookings.feedbackSubmitted'),
        description: t('myBookings.feedbackSubmittedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('myBookings.feedbackSubmitError'),
        variant: "destructive",
      });
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmail(inputEmail);
    localStorage.setItem("menteeEmail", inputEmail);
    setLocation(`/my-bookings?email=${inputEmail}`);
  };

  const handleAddNote = () => {
    if (!selectedBooking || !newNote.trim()) return;

    addNoteMutation.mutate({
      booking_id: selectedBooking.id,
      content: newNote.trim(),
      note_type: noteType,
      author_email: email,
    });
  };

  const handleSubmitFeedback = () => {
    if (!feedbackBooking || feedbackRating === 0) return;

    submitFeedbackMutation.mutate({
      bookingId: feedbackBooking.id,
      rating: feedbackRating,
      feedback: feedbackText.trim(),
    });
  };

  const openFeedbackDialog = (booking: Booking) => {
    setFeedbackBooking(booking);
    setFeedbackRating(booking.mentee_rating || 0);
    setFeedbackText(booking.mentee_feedback || "");
    setFeedbackDialogOpen(true);
  };

  const StarRating = ({ rating, onRate, readonly = false }: { rating: number; onRate?: (r: number) => void; readonly?: boolean }) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => !readonly && onRate?.(star)}
            disabled={readonly}
            className={`${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
            data-testid={`star-${star}`}
          >
            <Star
              className={`w-6 h-6 ${star <= rating
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground'
                }`}
            />
          </button>
        ))}
      </div>
    );
  };

  if (!email) {
    return (
      <div className="min-h-screen py-12" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-md mx-auto px-4">
          <Card className="p-8">
            <CardHeader>
              <CardTitle>{t('myBookings.viewBookings')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('myBookings.enterEmail')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={inputEmail}
                    onChange={(e) => setInputEmail(e.target.value)}
                    data-testid="input-mentee-email"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" data-testid="button-view-bookings">
                  {t('myBookings.viewMyBookings')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (bookingsLoading || mentorQueries.isLoading) {
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
            onClick={() => {
              localStorage.removeItem("menteeEmail");
              setEmail("");
              setInputEmail("");
              setLocation("/my-bookings");
            }}
            data-testid="button-change-email"
          >
            <User className="w-4 h-4 mr-2" />
            {t('myBookings.changeEmail')}
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
      <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {feedbackBooking?.mentee_rating
                ? t('myBookings.sessionFeedback')
                : t('myBookings.giveFeedbackTitle')}
            </DialogTitle>
            <DialogDescription>
              {feedbackBooking?.mentee_rating
                ? t('myBookings.feedbackViewDesc')
                : t('myBookings.feedbackGiveDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Your Feedback Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-base">{t('myBookings.yourFeedback')}</h4>

              {feedbackBooking?.mentee_rating ? (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('myBookings.yourRating')}:</span>
                    <StarRating rating={feedbackBooking.mentee_rating} readonly />
                  </div>
                  {feedbackBooking.mentee_feedback && (
                    <div>
                      <span className="text-sm text-muted-foreground">{t('myBookings.yourComment')}:</span>
                      <p className="mt-1 text-sm">{feedbackBooking.mentee_feedback}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Label>{t('myBookings.rateSession')}</Label>
                    <StarRating rating={feedbackRating} onRate={setFeedbackRating} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('myBookings.writeFeedback')}</Label>
                    <Textarea
                      placeholder={t('myBookings.feedbackPlaceholder')}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="min-h-24"
                      data-testid="input-feedback-text"
                    />
                  </div>
                  <Button
                    onClick={handleSubmitFeedback}
                    disabled={feedbackRating === 0 || submitFeedbackMutation.isPending}
                    className="w-full"
                    data-testid="button-submit-feedback"
                  >
                    {submitFeedbackMutation.isPending ? t('common.loading') : t('myBookings.submitFeedback')}
                  </Button>
                </div>
              )}
            </div>

            {/* Mentor's Feedback Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-base">{t('myBookings.mentorFeedback')}</h4>

              {feedbackBooking?.mentor_rating ? (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('myBookings.mentorRating')}:</span>
                    <StarRating rating={feedbackBooking.mentor_rating} readonly />
                  </div>
                  {feedbackBooking.mentor_feedback && (
                    <div>
                      <span className="text-sm text-muted-foreground">{t('myBookings.mentorComment')}:</span>
                      <p className="mt-1 text-sm">{feedbackBooking.mentor_feedback}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                  {t('myBookings.noMentorFeedback')}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
