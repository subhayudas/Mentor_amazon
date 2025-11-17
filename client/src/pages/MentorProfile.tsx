import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState, useRef, useEffect } from "react";
import { InlineWidget, useCalendlyEventListener } from "react-calendly";
import { Mentor } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Clock, Globe, Star, Briefcase, MapPin } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const confirmationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
});

type ConfirmationFormData = z.infer<typeof confirmationSchema>;

export default function MentorProfile() {
  const [, params] = useRoute("/mentor/:id");
  const mentorId = params?.id;
  const { toast } = useToast();
  const [menteeInfo, setMenteeInfo] = useState<{ name: string; email: string } | null>(() => {
    const savedEmail = localStorage.getItem("menteeEmail");
    const savedName = localStorage.getItem("menteeName");
    return savedEmail && savedName ? { name: savedName, email: savedEmail } : null;
  });
  const [showIdentityForm, setShowIdentityForm] = useState(!menteeInfo);
  const [selectedDuration, setSelectedDuration] = useState<15 | 30 | 60>(30);
  
  // Cache mentor data in a ref to ensure it's always available during Calendly events
  // even if React Query refetches and temporarily sets mentor to undefined
  const mentorRef = useRef<Mentor | null>(null);

  const { data: mentor, isLoading } = useQuery<Mentor>({
    queryKey: ["/api/mentors", mentorId],
    enabled: !!mentorId,
  });

  // Update ref whenever mentor data is available
  useEffect(() => {
    if (mentor) {
      mentorRef.current = mentor;
    }
  }, [mentor]);

  const form = useForm<ConfirmationFormData>({
    resolver: zodResolver(confirmationSchema),
    defaultValues: {
      name: "",
      email: localStorage.getItem("menteeEmail") || "",
    },
  });

  const createBookingMutation = useMutation({
    mutationFn: async (data: { mentor_id: string; mentee_name: string; mentee_email: string }) => {
      return await apiRequest("POST", "/api/bookings", data);
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Booking Recorded",
        description: "Your mentorship session has been tracked successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Recording Failed",
        description: "We couldn't save your booking after multiple attempts. Please contact support.",
        variant: "destructive",
      });
    },
  });

  useCalendlyEventListener({
    onEventScheduled: (e) => {
      const currentMentor = mentorRef.current;
      if (menteeInfo && currentMentor) {
        const payload = e?.data?.payload;
        console.log("[Calendly Event]", payload);
        
        createBookingMutation.mutate({
          mentor_id: currentMentor.id,
          mentee_name: menteeInfo.name,
          mentee_email: menteeInfo.email,
        });
      }
    },
  });

  const onSubmitIdentity = (data: ConfirmationFormData) => {
    localStorage.setItem("menteeName", data.name);
    localStorage.setItem("menteeEmail", data.email);
    setMenteeInfo({ name: data.name, email: data.email });
    setShowIdentityForm(false);
    toast({
      title: "Identity Saved",
      description: "You're all set! Your future sessions will be tracked automatically.",
    });
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
              <Skeleton className="h-[700px] w-full rounded-lg" />
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
            <p className="text-muted-foreground">Mentor not found</p>
          </Card>
        </div>
      </div>
    );
  }

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

  const calendlyUrl = mentor ? (mentor[`calendly_${selectedDuration}min` as keyof Mentor] as string || mentor.calendly_link) : "";
  
  // Determine available durations based on unique Calendly URLs
  const availableDurations = mentor ? (() => {
    const urls = {
      15: mentor.calendly_15min || mentor.calendly_link,
      30: mentor.calendly_30min || mentor.calendly_link,
      60: mentor.calendly_60min || mentor.calendly_link,
    };
    
    // If all URLs are the same, only show one option (60 min by default)
    if (urls[15] === urls[30] && urls[30] === urls[60]) {
      return [60];
    }
    
    // Otherwise show all unique durations
    return [15, 30, 60];
  })() : [15, 30, 60];

  // Update selected duration if it's not in available durations
  useEffect(() => {
    if (mentor && !availableDurations.includes(selectedDuration)) {
      setSelectedDuration(availableDurations[0] as 15 | 30 | 60);
    }
  }, [mentor, availableDurations, selectedDuration]);

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <Link href="/" data-testid="link-back">
          <Button variant="ghost" className="mb-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Mentors
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2">
            <Card className="p-8 sticky top-24">
              <div className="space-y-6">
                <div className="flex flex-col items-center text-center gap-4">
                  <Avatar className="w-32 h-32">
                    <AvatarImage src={mentor.photo_url || undefined} alt={mentor.name} />
                    <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-2 w-full">
                    <h1 className="text-3xl font-bold" data-testid="text-mentor-name">
                      {mentor.name}
                    </h1>
                    <p className="text-lg text-muted-foreground font-medium" data-testid="text-mentor-position">
                      {mentor.position}{mentor.company && ` @ ${mentor.company}`}
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
                      About
                    </h3>
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-mentor-bio">
                      {mentor.bio}
                    </p>
                  </div>

                  {mentor.industries && mentor.industries.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Industries
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {mentor.industries.map((industry) => (
                          <Badge key={industry} variant="outline" className="bg-muted">
                            {industry}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Expertise
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {mentor.expertise.map((skill) => (
                        <Badge key={skill} className="bg-primary/10 text-primary border-primary/20">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  {menteeInfo ? (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground text-center">
                        Bookings are automatically tracked for {menteeInfo.name}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowIdentityForm(true)}
                        className="w-full text-xs"
                        data-testid="button-change-identity"
                      >
                        Change Identity
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">
                      Enter your details to enable automatic booking tracking
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card className="p-4">
              <h2 className="text-2xl font-bold mb-4 px-4">Book a Session</h2>
              {!menteeInfo ? (
                <div className="p-12 text-center space-y-4" data-testid="calendly-locked">
                  <p className="text-lg text-muted-foreground">
                    Please enter your details to start booking sessions
                  </p>
                  <Button
                    onClick={() => setShowIdentityForm(true)}
                    size="lg"
                    data-testid="button-enter-details"
                  >
                    Enter Your Details
                  </Button>
                </div>
              ) : isLoading ? (
                <div className="p-12 flex items-center justify-center">
                  <Skeleton className="h-[700px] w-full" />
                </div>
              ) : (
                <>
                  {availableDurations.length > 1 && (
                    <div className="mb-6 p-6 bg-muted rounded-lg mx-4">
                      <p className="text-sm font-semibold mb-3">Select Session Duration</p>
                      <div className="flex gap-3">
                        {availableDurations.map((duration) => (
                          <Button
                            key={duration}
                            onClick={() => setSelectedDuration(duration as 15 | 30 | 60)}
                            variant={selectedDuration === duration ? "default" : "outline"}
                            className="flex-1"
                            data-testid={`button-duration-${duration}`}
                          >
                            {duration} Minutes
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {availableDurations.length === 1 && (
                    <div className="mb-6 p-6 bg-muted rounded-lg mx-4">
                      <p className="text-sm text-muted-foreground text-center">
                        {availableDurations[0]}-minute mentorship session
                      </p>
                    </div>
                  )}
                  <div className="rounded-lg overflow-hidden" data-testid="calendly-widget">
                    <InlineWidget
                      url={calendlyUrl}
                      styles={{
                        height: "700px",
                        minWidth: "100%",
                      }}
                    />
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>

        <Dialog open={showIdentityForm} onOpenChange={setShowIdentityForm}>
          <DialogContent data-testid="dialog-enter-identity">
            <DialogHeader>
              <DialogTitle>Enter Your Details</DialogTitle>
              <DialogDescription>
                To enable automatic session tracking, please provide your name and email. This will be saved and used for all future bookings.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitIdentity)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="John Doe"
                          data-testid="input-identity-name"
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
                      <FormLabel>Your Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="john@example.com"
                          data-testid="input-identity-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowIdentityForm(false)}
                    data-testid="button-cancel-identity"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    data-testid="button-submit-identity"
                  >
                    Save & Continue
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
