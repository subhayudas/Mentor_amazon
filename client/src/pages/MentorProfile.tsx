import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";
import { Mentor } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Clock, Globe, Star, Calendar } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const bookingRequestFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  goal: z.string().min(10, "Please describe your goals in at least 10 characters"),
});

type BookingRequestFormData = z.infer<typeof bookingRequestFormSchema>;

export default function MentorProfile() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const [, params] = useRoute("/mentor/:id");
  const mentorId = params?.id;
  const { toast } = useToast();
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  
  const { data: mentor, isLoading } = useQuery<Mentor>({
    queryKey: ["/api/mentors", mentorId],
    enabled: !!mentorId,
  });

  const form = useForm<BookingRequestFormData>({
    resolver: zodResolver(bookingRequestFormSchema),
    defaultValues: {
      name: localStorage.getItem("menteeName") || "",
      email: localStorage.getItem("menteeEmail") || "",
      goal: "",
    },
  });

  const bookingRequestMutation = useMutation({
    mutationFn: async (data: { mentor_id: string; mentee_name: string; mentee_email: string; goal: string }) => {
      return await apiRequest("POST", "/api/bookings/request", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: isArabic ? "تم إرسال طلبك" : "Request Sent",
        description: isArabic 
          ? "تم إرسال طلبك إلى المرشد. سيتم إعلامك بمجرد ردهم."
          : "Your request has been sent to the mentor. You'll be notified once they respond.",
      });
      setShowBookingDialog(false);
      form.reset({
        name: localStorage.getItem("menteeName") || "",
        email: localStorage.getItem("menteeEmail") || "",
        goal: "",
      });
    },
    onError: () => {
      toast({
        title: isArabic ? "فشل الإرسال" : "Request Failed",
        description: isArabic 
          ? "فشل إرسال طلبك. يرجى المحاولة مرة أخرى."
          : "Failed to send your request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmitBookingRequest = (data: BookingRequestFormData) => {
    if (!mentorId) return;
    
    localStorage.setItem("menteeName", data.name);
    localStorage.setItem("menteeEmail", data.email);
    
    bookingRequestMutation.mutate({
      mentor_id: mentorId,
      mentee_name: data.name,
      mentee_email: data.email,
      goal: data.goal,
    });
  };

  const handleOpenBookingDialog = () => {
    form.reset({
      name: localStorage.getItem("menteeName") || "",
      email: localStorage.getItem("menteeEmail") || "",
      goal: "",
    });
    setShowBookingDialog(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <Skeleton className="h-10 w-32 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2">
              <Card className="p-8">
                <div className="space-y-6">
                  <div className="flex flex-col items-center text-center gap-4">
                    <Skeleton className="w-32 h-32 rounded-full" />
                    <div className="space-y-2 w-full">
                      <Skeleton className="h-8 w-3/4 mx-auto" />
                      <Skeleton className="h-5 w-1/2 mx-auto" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Skeleton className="h-24 w-full" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
            <div className="lg:col-span-3">
              <Skeleton className="h-[400px] w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!mentor) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">{t('errors.notFound')}</p>
          </Card>
        </div>
      </div>
    );
  }

  const displayName = isArabic && mentor.name_ar ? mentor.name_ar : mentor.name;
  const displayPosition = isArabic && mentor.position_ar ? mentor.position_ar : mentor.position;
  const displayCompany = isArabic && mentor.company_ar ? mentor.company_ar : mentor.company;
  const displayBio = isArabic && mentor.bio_ar ? mentor.bio_ar : mentor.bio;
  const displayExpertise = isArabic && mentor.expertise_ar ? mentor.expertise_ar : mentor.expertise;
  const displayIndustries = isArabic && mentor.industries_ar ? mentor.industries_ar : mentor.industries;

  const initials = mentor.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const averageRating = mentor.average_rating ? parseFloat(mentor.average_rating.toString()) : 0;
  const totalRatings = mentor.total_ratings || 0;

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }).map((_, index) => (
      <Star
        key={index}
        className={`w-4 h-4 ${
          index < Math.round(rating)
            ? "fill-primary text-primary"
            : "fill-muted text-muted"
        }`}
      />
    ));
  };

  const timezoneToUTC = (ianaTimeZone: string): string => {
    try {
      const date = new Date();
      const toTimeZone = (z: string) => new Date(
        date.toLocaleString('sv', { timeZone: z }).replace(' ', 'T')
      );
      
      const offsetMinutes = (toTimeZone(ianaTimeZone).getTime() - toTimeZone('UTC').getTime()) / 60000;
      
      const sign = offsetMinutes >= 0 ? '+' : '-';
      const absMinutes = Math.abs(offsetMinutes);
      const hours = Math.floor(absMinutes / 60);
      const minutes = absMinutes % 60;
      
      return minutes === 0 
        ? `UTC${sign}${hours}`
        : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
    } catch {
      return ianaTimeZone.split('/').pop() || ianaTimeZone;
    }
  };

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <Link href="/" data-testid="link-back">
          <Button variant="ghost" className="mb-8" data-testid="button-back">
            <ArrowLeft className={`w-4 h-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
            {isArabic ? 'العودة إلى المرشدين' : 'Back to Mentors'}
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2">
            <Card className="p-8 sticky top-24">
              <div className="space-y-6">
                <div className="flex flex-col items-center text-center gap-4">
                  <Avatar className="w-32 h-32">
                    <AvatarImage src={mentor.photo_url || undefined} alt={displayName} />
                    <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-2 w-full">
                    <h1 className="text-3xl font-bold" data-testid="text-mentor-name">
                      {displayName}
                    </h1>
                    <p className="text-lg text-muted-foreground font-medium" data-testid="text-mentor-position">
                      {displayPosition}{displayCompany && ` @ ${displayCompany}`}
                    </p>
                    
                    <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                      {mentor.timezone && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{timezoneToUTC(mentor.timezone)}</span>
                        </div>
                      )}
                      {mentor.languages_spoken && mentor.languages_spoken.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Globe className="w-4 h-4" />
                          <span>{mentor.languages_spoken.join(", ")}</span>
                        </div>
                      )}
                    </div>

                    {totalRatings > 0 && (
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <div className="flex gap-0.5">{renderStars(averageRating)}</div>
                        <span className="text-sm font-medium">
                          {averageRating.toFixed(1)} ({totalRatings} {totalRatings === 1 ? "review" : "reviews"})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      {isArabic ? 'نبذة' : 'About'}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-mentor-bio">
                      {displayBio}
                    </p>
                  </div>

                  {displayIndustries && displayIndustries.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        {t('profile.industries')}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {displayIndustries.map((industry, index) => (
                          <Badge key={index} variant="outline" className="bg-muted">
                            {industry}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      {t('profile.expertise')}
                    </h3>
                    {displayExpertise.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {displayExpertise.map((skill, index) => (
                          <Badge key={index} className="bg-primary/10 text-primary border-primary/20">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic" data-testid="text-skills-tip">
                        {t('profile.skillsTip')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card className="p-8">
              <h2 className="text-2xl font-bold mb-6">{t('session.bookSession')}</h2>
              {!mentor.is_available ? (
                <div className="p-12 text-center space-y-4" data-testid="mentor-unavailable">
                  <Star className="w-12 h-12 mx-auto text-muted-foreground" />
                  <p className="text-lg text-muted-foreground">
                    {t('profile.noSlotsAvailable')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('profile.starForLater')}
                  </p>
                </div>
              ) : (
                <div className="text-center space-y-6" data-testid="booking-section">
                  <div className="space-y-3">
                    <Calendar className="w-16 h-16 mx-auto text-primary" />
                    <p className="text-lg text-muted-foreground">
                      {isArabic 
                        ? `هل أنت مستعد للتواصل مع ${displayName}؟`
                        : `Ready to connect with ${displayName}?`}
                    </p>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      {isArabic
                        ? "اطلب جلسة إرشاد وشارك أهدافك. سيقوم المرشد بمراجعة طلبك والرد عليه."
                        : "Request a mentoring session and share your goals. The mentor will review your request and respond."}
                    </p>
                  </div>
                  <Button 
                    size="lg" 
                    onClick={handleOpenBookingDialog}
                    data-testid="button-request-session"
                  >
                    <Calendar className={`w-5 h-5 ${isArabic ? 'ml-2' : 'mr-2'}`} />
                    {isArabic ? 'طلب جلسة' : 'Request a Session'}
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>

        <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
          <DialogContent data-testid="dialog-booking-request">
            <DialogHeader>
              <DialogTitle>
                {isArabic ? 'طلب جلسة إرشاد' : 'Request a Mentoring Session'}
              </DialogTitle>
              <DialogDescription>
                {isArabic 
                  ? `أرسل طلبًا إلى ${displayName} للتواصل. يرجى مشاركة أهدافك حتى يتمكنوا من الاستعداد لجلستكم.`
                  : `Send a request to ${displayName} to connect. Please share your goals so they can prepare for your session.`}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitBookingRequest)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? 'اسمك' : 'Your Name'}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={isArabic ? 'أدخل اسمك الكامل' : 'Enter your full name'}
                          data-testid="input-booking-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isArabic ? 'بريدك الإلكتروني' : 'Your Email'}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder={isArabic ? 'أدخل بريدك الإلكتروني' : 'Enter your email address'}
                          data-testid="input-booking-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="goal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {isArabic 
                          ? 'ما الذي تأمل تحقيقه من هذه الجلسة؟'
                          : 'What are you hoping to achieve from this session?'}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={isArabic 
                            ? 'صف أهدافك، والتحديات التي تواجهها، أو المواضيع التي ترغب في مناقشتها...'
                            : 'Describe your goals, challenges you\'re facing, or topics you\'d like to discuss...'}
                          className="min-h-[120px] resize-none"
                          data-testid="textarea-booking-goal"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowBookingDialog(false)}
                    data-testid="button-cancel-booking"
                  >
                    {isArabic ? 'إلغاء' : 'Cancel'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={bookingRequestMutation.isPending}
                    data-testid="button-submit-booking"
                  >
                    {bookingRequestMutation.isPending 
                      ? (isArabic ? 'جاري الإرسال...' : 'Sending...') 
                      : (isArabic ? 'إرسال الطلب' : 'Submit Request')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
