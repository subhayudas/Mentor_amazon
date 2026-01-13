import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Calendar, Clock, User, CheckCircle, XCircle, FileText, Plus, Trash2, Star, MessageSquare } from "lucide-react";
import { format, parseISO, isFuture, isPast } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { Booking, BookingNote } from "@shared/schema";
import { cn } from "@/lib/utils";

interface MySessionsProps {
  mentorId: string;
  mentorEmail?: string;
}

export default function MySessions({ mentorId, mentorEmail }: MySessionsProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("upcoming");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<"note" | "task">("note");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackBooking, setFeedbackBooking] = useState<Booking | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState("");

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ['/api/mentor', mentorId, 'bookings'],
    enabled: !!mentorId,
  });

  const { data: notes, isLoading: notesLoading } = useQuery<BookingNote[]>({
    queryKey: ['/api/bookings', selectedBooking?.id, 'notes'],
    enabled: !!selectedBooking?.id && notesDialogOpen,
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

  const addNoteMutation = useMutation({
    mutationFn: async (data: { booking_id: string; author_type: string; author_email: string; note_type: string; content: string; due_date?: string }) => {
      return apiRequest("POST", `/api/bookings/${data.booking_id}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings', selectedBooking?.id, 'notes'] });
      setNoteContent("");
      setNoteType("note");
      setDueDate(undefined);
      toast({
        title: t('mentorPortal.noteAdded'),
        description: t('mentorPortal.noteAddedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.noteAddError'),
        variant: "destructive",
      });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, is_completed }: { noteId: string; is_completed: boolean }) => {
      return apiRequest("PATCH", `/api/bookings/${selectedBooking?.id}/notes/${noteId}`, { is_completed });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings', selectedBooking?.id, 'notes'] });
      toast({
        title: t('common.success'),
        description: variables.is_completed ? t('mentorPortal.taskCompleted') : t('mentorPortal.taskIncomplete'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.taskUpdateError'),
        variant: "destructive",
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/bookings/${selectedBooking?.id}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings', selectedBooking?.id, 'notes'] });
      toast({
        title: t('common.success'),
        description: t('mentorPortal.noteDeleted'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.noteDeleteError'),
        variant: "destructive",
      });
    },
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async ({ bookingId, mentor_rating, mentor_feedback }: { bookingId: string; mentor_rating: number; mentor_feedback: string }) => {
      return apiRequest("POST", `/api/bookings/${bookingId}/mentor-feedback`, { mentor_rating, mentor_feedback });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mentor', mentorId, 'bookings'] });
      setFeedbackDialogOpen(false);
      setFeedbackBooking(null);
      setFeedbackRating(0);
      setFeedbackText("");
      toast({
        title: t('common.success'),
        description: t('mentorPortal.feedbackSubmitted'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.feedbackSubmitError'),
        variant: "destructive",
      });
    },
  });

  const upcomingSessions = bookings?.filter(b =>
    b.status === 'confirmed' && b.scheduled_at && isFuture(parseISO(b.scheduled_at))
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

  const handleOpenNotes = (booking: Booking) => {
    setSelectedBooking(booking);
    setNotesDialogOpen(true);
  };

  const handleAddNote = () => {
    if (!noteContent.trim() || !selectedBooking) return;

    addNoteMutation.mutate({
      booking_id: selectedBooking.id,
      author_type: "mentor",
      author_email: mentorEmail || "",
      note_type: noteType,
      content: noteContent.trim(),
      due_date: dueDate ? dueDate.toISOString() : undefined,
    });
  };

  const handleToggleComplete = (note: BookingNote) => {
    updateNoteMutation.mutate({ noteId: note.id, is_completed: !note.is_completed });
  };

  const handleDeleteNote = (noteId: string) => {
    deleteNoteMutation.mutate(noteId);
  };

  const handleOpenFeedback = (booking: Booking) => {
    setFeedbackBooking(booking);
    setFeedbackRating(booking.mentor_rating || 0);
    setFeedbackText(booking.mentor_feedback || "");
    setFeedbackDialogOpen(true);
  };

  const handleSubmitFeedback = () => {
    if (!feedbackBooking || feedbackRating === 0) {
      toast({
        title: t('common.error'),
        description: t('mentorPortal.selectRating'),
        variant: "destructive",
      });
      return;
    }
    submitFeedbackMutation.mutate({
      bookingId: feedbackBooking.id,
      mentor_rating: feedbackRating,
      mentor_feedback: feedbackText.trim(),
    });
  };

  const renderStars = (rating: number, interactive: boolean = false) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            className={cn(
              "focus:outline-none transition-colors",
              interactive && "cursor-pointer hover:scale-110"
            )}
            onClick={() => interactive && setFeedbackRating(star)}
            data-testid={interactive ? `button-star-${star}` : `star-display-${star}`}
          >
            <Star
              className={cn(
                "w-5 h-5",
                star <= rating
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground"
              )}
            />
          </button>
        ))}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
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

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleOpenNotes(booking)}
            data-testid={`button-notes-${booking.id}`}
          >
            <FileText className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
            {t('mentorPortal.viewNotes')}
          </Button>

          {showActions && booking.status === 'confirmed' && (
            <>
              <Button
                size="sm"
                onClick={() => handleMarkComplete(booking.id)}
                disabled={updateBookingMutation.isPending}
                data-testid={`button-complete-${booking.id}`}
              >
                <CheckCircle className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
                {t('mentorPortal.markComplete')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCancel(booking.id)}
                disabled={updateBookingMutation.isPending}
                data-testid={`button-cancel-${booking.id}`}
              >
                <XCircle className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
                {t('mentorPortal.cancelSession')}
              </Button>
            </>
          )}

          {(booking.status === 'completed' || (booking.scheduled_at && isPast(parseISO(booking.scheduled_at)))) && (
            <Button
              size="sm"
              variant={booking.mentor_rating ? "secondary" : "default"}
              onClick={() => handleOpenFeedback(booking)}
              data-testid={`button-feedback-${booking.id}`}
            >
              <MessageSquare className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
              {booking.mentor_rating ? t('mentorPortal.viewFeedback') : t('mentorPortal.giveFeedback')}
            </Button>
          )}
        </div>
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

      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-notes-dialog-title">{t('mentorPortal.sessionNotes')}</DialogTitle>
            <p className="text-sm text-muted-foreground">{t('mentorPortal.sessionNotesDesc')}</p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <Label data-testid="label-add-note">{t('mentorPortal.addNoteOrTask')}</Label>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={noteType === "note" ? "default" : "outline"}
                  onClick={() => setNoteType("note")}
                  data-testid="button-type-note"
                >
                  {t('mentorPortal.noteType')}
                </Button>
                <Button
                  size="sm"
                  variant={noteType === "task" ? "default" : "outline"}
                  onClick={() => setNoteType("task")}
                  data-testid="button-type-task"
                >
                  {t('mentorPortal.taskType')}
                </Button>
              </div>

              <Textarea
                placeholder={noteType === "note" ? t('mentorPortal.notePlaceholder') : t('mentorPortal.taskPlaceholder')}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-note-content"
              />

              {noteType === "task" && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">{t('mentorPortal.dueDateOptional')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(!dueDate && "text-muted-foreground")}
                        data-testid="button-due-date"
                      >
                        <Calendar className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
                        {dueDate ? format(dueDate, "MMM d, yyyy") : t('mentorPortal.dueDateLabel')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {dueDate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDueDate(undefined)}
                      data-testid="button-clear-due-date"
                    >
                      {t('common.clear')}
                    </Button>
                  )}
                </div>
              )}

              <Button
                onClick={handleAddNote}
                disabled={!noteContent.trim() || addNoteMutation.isPending}
                className="w-full"
                data-testid="button-add-note"
              >
                <Plus className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
                {t('mentorPortal.addNoteBtn')}
              </Button>
            </div>

            <div className="space-y-2">
              <Label data-testid="label-existing-notes">{t('mentorPortal.existingNotes')}</Label>

              {notesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : notes && notes.length > 0 ? (
                <div className="space-y-2">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className={cn(
                        "p-3 rounded-lg border",
                        note.note_type === "task" && note.is_completed && "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
                      )}
                      data-testid={`note-item-${note.id}`}
                    >
                      <div className="flex items-start gap-2">
                        {note.note_type === "task" && (
                          <Checkbox
                            checked={note.is_completed || false}
                            onCheckedChange={() => handleToggleComplete(note)}
                            className="mt-1"
                            data-testid={`checkbox-task-${note.id}`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm",
                            note.note_type === "task" && note.is_completed && "line-through text-muted-foreground"
                          )}>
                            {note.content}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {note.author_type === "mentor" ? t('mentorPortal.fromYou') : t('mentorPortal.fromMentee')}
                            </Badge>
                            <span>{note.created_at ? format(parseISO(note.created_at), 'MMM d, yyyy') : ''}</span>
                            {note.note_type === "task" && note.due_date && (
                              <span className="text-orange-600 dark:text-orange-400">
                                {t('mentorPortal.dueDateLabel')}: {format(parseISO(note.due_date), 'MMM d')}
                              </span>
                            )}
                          </div>
                        </div>
                        {note.author_type === "mentor" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteNote(note.id)}
                            disabled={deleteNoteMutation.isPending}
                            data-testid={`button-delete-note-${note.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-notes">
                  {t('mentorPortal.noNotes')}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-feedback-dialog-title">
              {t('mentorPortal.feedbackDialogTitle')}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t('mentorPortal.feedbackDialogDesc')}
            </p>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-base font-semibold" data-testid="label-your-feedback">
                  {t('mentorPortal.yourFeedback')}
                </Label>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">{t('mentorPortal.ratingLabel')}</Label>
                {feedbackBooking?.mentor_rating ? (
                  <div className="flex items-center gap-2">
                    {renderStars(feedbackBooking.mentor_rating, false)}
                    <span className="text-sm text-muted-foreground">
                      ({feedbackBooking.mentor_rating} {t('mentorPortal.stars')})
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {renderStars(feedbackRating, true)}
                    {feedbackRating > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({feedbackRating} {t('mentorPortal.stars')})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {!feedbackBooking?.mentor_rating ? (
                <>
                  <Textarea
                    placeholder={t('mentorPortal.feedbackPlaceholder')}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="min-h-[100px]"
                    data-testid="input-feedback-text"
                  />

                  <Button
                    onClick={handleSubmitFeedback}
                    disabled={feedbackRating === 0 || submitFeedbackMutation.isPending}
                    className="w-full"
                    data-testid="button-submit-feedback"
                  >
                    {submitFeedbackMutation.isPending ? t('common.loading') : t('mentorPortal.submitFeedback')}
                  </Button>
                </>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm">{t('mentorPortal.feedback')}</Label>
                  <p className="text-sm p-3 bg-background rounded border" data-testid="text-mentor-feedback">
                    {feedbackBooking.mentor_feedback || '-'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4 p-4 rounded-lg border">
              <div>
                <Label className="text-base font-semibold" data-testid="label-mentee-feedback">
                  {t('mentorPortal.menteeFeedback')}
                </Label>
              </div>

              {feedbackBooking?.mentee_rating ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('mentorPortal.ratingLabel')}</Label>
                    <div className="flex items-center gap-2">
                      {renderStars(feedbackBooking.mentee_rating, false)}
                      <span className="text-sm text-muted-foreground">
                        ({feedbackBooking.mentee_rating} {t('mentorPortal.stars')})
                      </span>
                    </div>
                  </div>

                  {feedbackBooking.mentee_feedback && (
                    <div className="space-y-2">
                      <Label className="text-sm">{t('mentorPortal.feedback')}</Label>
                      <p className="text-sm p-3 bg-muted/50 rounded" data-testid="text-mentee-feedback">
                        {feedbackBooking.mentee_feedback}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-2" data-testid="text-no-mentee-feedback">
                  {t('mentorPortal.noMenteeFeedback')}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
