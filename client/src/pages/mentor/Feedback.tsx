import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Star, MessageSquare, Calendar, User, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

interface FeedbackProps {
  mentorId: string;
}

interface FeedbackItem {
  id: string;
  mentee_id: string;
  mentee_name: string;
  mentee_email: string;
  mentee_photo?: string;
  rating: number;
  feedback: string;
  scheduled_at: string;
}

function StarRating({ rating, size = "default" }: { rating: number; size?: "default" | "large" }) {
  const starSize = size === "large" ? "w-5 h-5" : "w-4 h-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${starSize} ${
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted-foreground"
          }`}
        />
      ))}
    </div>
  );
}

export default function Feedback({ mentorId }: FeedbackProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const { data: feedbackItems, isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ['/api/mentors', mentorId, 'feedback'],
    enabled: !!mentorId,
  });

  const sortedFeedback = feedbackItems?.sort((a, b) => 
    new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  ) || [];

  const totalReviews = sortedFeedback.length;
  const averageRating = totalReviews > 0 
    ? sortedFeedback.reduce((sum, item) => sum + item.rating, 0) / totalReviews 
    : 0;
  const sessionsWithFeedback = sortedFeedback.filter(item => item.feedback).length;

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-feedback-title">
          {t('mentorPortal.feedback')}
        </h1>
        <p className="text-muted-foreground">
          {t('mentorPortal.feedbackSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardDescription className="text-sm font-medium">
                  {t('mentorPortal.averageRating')}
                </CardDescription>
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/20">
                  <Star className="w-4 h-4 text-amber-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold" data-testid="text-average-rating">
                    {averageRating.toFixed(1)}
                  </span>
                  <StarRating rating={Math.round(averageRating)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardDescription className="text-sm font-medium">
                  {t('mentorPortal.totalReviews')}
                </CardDescription>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-reviews">
                  {totalReviews}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardDescription className="text-sm font-medium">
                  {t('mentorPortal.sessionsWithFeedback')}
                </CardDescription>
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                  <Calendar className="w-4 h-4 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-sessions-with-feedback">
                  {sessionsWithFeedback}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            {t('mentorPortal.allFeedback')}
          </CardTitle>
          <CardDescription>
            {t('mentorPortal.feedbackHistory')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : sortedFeedback.length > 0 ? (
            <div className="space-y-4">
              {sortedFeedback.map((item) => (
                <div 
                  key={item.id} 
                  className="p-4 border rounded-lg space-y-3"
                  data-testid={`feedback-item-${item.id}`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={item.mentee_photo} alt={item.mentee_name} />
                        <AvatarFallback>
                          <User className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium" data-testid={`mentee-name-${item.id}`}>
                          {item.mentee_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(item.scheduled_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StarRating rating={item.rating} size="large" />
                      <Link href={`/my-bookings?session=${item.id}`}>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          data-testid={`view-session-${item.id}`}
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          {t('mentorPortal.viewSession')}
                        </Button>
                      </Link>
                    </div>
                  </div>
                  {item.feedback && (
                    <p className="text-sm text-muted-foreground pl-13" data-testid={`feedback-text-${item.id}`}>
                      "{item.feedback}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {t('mentorPortal.noFeedback')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
