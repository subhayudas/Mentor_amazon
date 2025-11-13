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
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { FavoriteButton } from "@/components/FavoriteButton";
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

  const createSessionMutation = useMutation({
    mutationFn: async (data: { mentorId: string; menteeName: string; menteeEmail: string }) => {
      return await apiRequest("POST", "/api/sessions", data);
    },
    retry: 3, // Automatically retry failed requests up to 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({
        title: "Session Recorded",
        description: "Your mentorship session has been tracked successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Recording Failed",
        description: "We couldn't save your session after multiple attempts. Please contact support.",
        variant: "destructive",
      });
    },
  });

  useCalendlyEventListener({
    onEventScheduled: (e) => {
      // Use mentorRef.current to ensure mentor data is available even during React Query refetches
      // menteeInfo is guaranteed to exist because InlineWidget only renders when menteeInfo is set
      const currentMentor = mentorRef.current;
      if (menteeInfo && currentMentor) {
        const payload = e?.data?.payload;
        console.log("[Calendly Event]", payload); // Log for debugging/analytics
        
        createSessionMutation.mutate({
          mentorId: currentMentor.id,
          menteeName: menteeInfo.name,
          menteeEmail: menteeInfo.email,
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
              <div className="space-y-8">
                <div className="flex flex-col items-center text-center gap-4">
                  <Avatar className="w-32 h-32">
                    <AvatarImage src={mentor.avatarUrl || undefined} alt={mentor.name} />
                    <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold" data-testid="text-mentor-name">
                      {mentor.name}
                    </h1>
                    <p className="text-lg text-muted-foreground font-medium" data-testid="text-mentor-title">
                      {mentor.title}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      About
                    </h3>
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-mentor-bio">
                      {mentor.bio}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Expertise
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {mentor.expertise.map((skill) => (
                        <Badge key={skill} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <FavoriteButton 
                    mentorId={mentor.id} 
                    mentorName={mentor.name}
                    variant="outline"
                    size="default"
                    showLabel
                  />
                  {menteeInfo ? (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground text-center">
                        Sessions are automatically tracked for {menteeInfo.name}
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
                      Enter your details above to enable automatic session tracking
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
                <div className="rounded-lg overflow-hidden" data-testid="calendly-widget">
                  <InlineWidget
                    url={mentor.calendlyUrl}
                    styles={{
                      height: "700px",
                      minWidth: "100%",
                    }}
                  />
                </div>
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
