import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { mentorService, uploadService } from "@/lib/services";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useRequireRole } from "@/components/RouteGuard";
import type { Mentor } from "@/lib/database";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Users, Clock, Award, Globe, Upload, Loader2, ShieldAlert, KeyRound } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

/** PostgREST `or()` values must be double-quoted when they contain reserved characters (`@`, `.`, `,`). */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

interface OnboardingApproval {
  /** An active approved_users row exists for this alias or email. */
  approved: boolean;
  /** A mentors row already belongs to this email; onboarding must not create a second one. */
  existingMentorId: string | null;
}

/**
 * Gate card shown instead of the form when the session cannot onboard.
 * Explains why instead of redirecting silently, so mentors know what to do next.
 */
function OnboardingGateCard({
  title,
  body,
  requestAccessHref,
}: {
  title: string;
  body: string;
  requestAccessHref?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 pb-12">
      <Card className="w-full max-w-lg border-[#D5D9D9]" data-testid="card-onboarding-gate">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#FDECEC]">
              <ShieldAlert className="w-5 h-5 text-[#C40000]" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl">{title}</CardTitle>
          </div>
          <CardDescription className="pt-2">{body}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline" data-testid="link-gate-home">
            <Link href="/">{t("mentorOnboarding.gate.backHome")}</Link>
          </Button>
          {requestAccessHref && (
            <Button asChild data-testid="link-gate-request-access">
              <Link href={requestAccessHref}>
                <KeyRound className="w-4 h-4 me-2" />
                {t("mentorOnboarding.gate.requestAccess")}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OnboardingSkeleton() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4" role="status" aria-live="polite">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    </div>
  );
}

const TIMEZONES = [
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Europe/Istanbul",
  "UTC",
];

const EXPERTISE_OPTIONS = {
  "Technical & Product": [
    "AI/ML Model Deployment",
    "API Design",
    "Cloud Architecture (AWS, Azure, GCP)",
    "Cybersecurity",
    "Data Analysis",
    "Data Engineering",
    "Data Visualization",
    "DevOps",
    "Distributed Systems",
    "Machine Learning",
    "Mobile Development",
    "Product Management",
    "Product Strategy",
    "Python Programming",
    "Quality Assurance & Testing",
    "Software Development",
    "SQL",
    "Technical Program Management",
    "User Research",
    "UX/UI Design",
  ],
  "Operations & Business": [
    "Business Analysis",
    "Business Strategy",
    "Change Management",
    "Customer Experience Management",
    "Financial Analysis",
    "Forecasting & Demand Planning",
    "Human Resources & People Experience",
    "Inventory Management",
    "Lean / Six Sigma",
    "Marketing",
    "Marketplace Optimization",
    "Negotiation",
    "Operations Management",
    "Process Improvement",
    "Procurement",
    "Program Management",
    "Project Management",
    "Public Policy",
    "Supply Chain Management",
    "Vendor Management",
  ],
  "Leadership & Core Skills": [
    "Adaptability",
    "Analytical Thinking",
    "Coaching & Mentoring",
    "Communication",
    "Conflict Resolution",
    "Cross-functional Collaboration",
    "Customer Obsession",
    "Decision-Making",
    "Innovation & Creativity",
    "Problem Solving",
    "Stakeholder Management",
    "Strategic Thinking",
    "Team Leadership",
    "Time Management",
  ],
};

const INDUSTRY_OPTIONS = [
  "AI, Data Science & Machine Learning",
  "Automotive, EV & Aerospace",
  "Cloud Computing & IT Services",
  "Consumer Goods",
  "Cybersecurity",
  "E-commerce & Retail",
  "Education & EdTech",
  "Energy & Utilities",
  "Finance & FinTech",
  "Government & Public Sector",
  "Healthcare & Life Sciences",
  "Hospitality & Tourism",
  "Logistics, Transportation & Supply Chain",
  "Manufacturing & Industrial",
  "Media, Advertising & Entertainment",
  "Non-profit & Social Impact",
  "Professional Services",
  "Real Estate & Construction",
  "Technology & Software",
  "Telecommunications",
];

const LANGUAGE_OPTIONS = [
  "English",
  "Arabic",
  "French",
  "German",
  "Spanish",
  "Turkish",
];

const COUNTRY_OPTIONS = [
  "United Arab Emirates",
  "Saudi Arabia",
  "Egypt",
  "Kuwait",
  "Qatar",
  "Bahrain",
  "Oman",
  "Jordan",
  "Lebanon",
  "Morocco",
  "Tunisia",
  "Algeria",
  "Iraq",
  "Syria",
  "Palestine",
  "Turkey",
  "Pakistan",
  "India",
  "Bangladesh",
  "United Kingdom",
  "United States",
  "Germany",
  "France",
  "Other",
];

const mentorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  company: z.string().optional(),
  position: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  country: z.string().optional(),
  photo_url: z.string().optional(),
  bio: z.string().min(1, "Bio is required"),
  linkedin_url: z.string().optional(),
  cal_link: z.string().min(1, "Cal.com link is required"),
  expertise: z.array(z.string()).min(1, "At least one expertise is required"),
  industries: z.array(z.string()).min(1, "At least one industry is required"),
  languages_spoken: z.array(z.string()).min(1, "At least one language is required"),
  comms_owner: z.enum(["exec", "assistant"]),
  assistant_email: z.string().optional(),
  mentorship_preference: z.enum(["ongoing", "rotating", "either"]).optional(),
  why_joined: z.string().optional(),
});

type MentorFormData = z.infer<typeof mentorSchema>;

export default function MentorOnboarding() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // Anonymous visitors are sent to /login?next=/mentor-onboarding by the guard hook.
  const { status: authStatus, user } = useRequireRole();
  const [isUploading, setIsUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Onboarding is for approved Amazon mentors only. Identity comes from the
  // session; the approval check reads the caller's own approved_users row
  // (alias or email) and looks for a mentors row that already belongs to
  // this email, in which case the portal is the right destination.
  const isMentorSession = authStatus === "ok" && !!user && user.user_type === "mentor";
  const sessionEmail = user?.email ?? "";
  const sessionAlias = user?.amazon_alias ?? "";

  const approvalQuery = useQuery<OnboardingApproval>({
    queryKey: ["mentor-onboarding", "approval", sessionEmail, sessionAlias],
    enabled: isMentorSession,
    // Always re-check on entry: the answer changes the moment a profile is created or an alias is approved.
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      // ilike (no wildcards) = case-insensitive equality; admins may have typed the email in any case.
      const filters = [`email.ilike.${quoteFilterValue(sessionEmail)}`];
      if (sessionAlias) filters.push(`amazon_alias.eq.${quoteFilterValue(sessionAlias.toLowerCase())}`);
      const { data: approvedRows, error } = await supabase
        .from("approved_users")
        .select("id, role, is_active, mentor_id")
        .or(filters.join(","));
      if (error) throw error;
      const approved = (approvedRows ?? []).some((row: { is_active: boolean }) => row.is_active);
      const existing = await mentorService.getByEmail(sessionEmail);
      return { approved: approved || !!existing, existingMentorId: existing?.id ?? null };
    },
  });

  useEffect(() => {
    if (approvalQuery.data?.existingMentorId) {
      setLocation("/mentor-portal", { replace: true });
    }
  }, [approvalQuery.data?.existingMentorId, setLocation]);

  const form = useForm<MentorFormData>({
    resolver: zodResolver(mentorSchema.refine(
      (data) => {
        if (!data.cal_link || data.cal_link.trim() === "") {
          return false;
        }
        let calLink = data.cal_link.trim();
        calLink = calLink.replace(/^https?:\/\/(www\.)?cal\.com\//i, "");
        const simplePattern = /^[a-z0-9._-]+\/[a-z0-9_-]+$/i;
        return simplePattern.test(calLink);
      },
      {
        message: "Please enter a valid Cal.com link (e.g., username/30min or https://cal.com/username/30min)",
        path: ["cal_link"],
      }
    )),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      position: "",
      timezone: "Asia/Dubai",
      country: "",
      photo_url: "",
      bio: "",
      linkedin_url: "",
      cal_link: "",
      expertise: [],
      industries: [],
      languages_spoken: [],
      comms_owner: "exec",
      mentorship_preference: "rotating",
      why_joined: "",
    },
  });

  // The email is owned by the session, not the form: RLS ties the mentors
  // row to auth.jwt()->>'email', so the field is pre-filled and read-only.
  useEffect(() => {
    if (sessionEmail) form.setValue("email", sessionEmail, { shouldValidate: false });
  }, [sessionEmail, form]);

  const createMentorMutation = useMutation<Mentor, Error, MentorFormData>({
    mutationFn: async (data: MentorFormData) => {
      let calLink = data.cal_link?.trim() || "";
      calLink = calLink.replace(/^https?:\/\/(www\.)?cal\.com\//i, "");

      return mentorService.create({
        ...data,
        // Always the session email, whatever the form state says.
        email: sessionEmail || data.email,
        cal_link: calLink,
        is_available: true,
      });
    },
    onSuccess: (newMentor: Mentor) => {
      queryClient.invalidateQueries({ queryKey: ['mentors'] });
      toast({
        title: t('mentorOnboarding.successTitle'),
        description: t('mentorOnboarding.successMessage'),
      });
      if (newMentor?.id) {
        localStorage.setItem("mentorId", newMentor.id);
        localStorage.setItem("mentorEmail", newMentor.email ?? "");
        localStorage.setItem("mentorName", newMentor.name);
        window.dispatchEvent(new Event("userRegistered"));
        setLocation("/mentor-portal");
      } else {
        toast({
          title: t('common.error'),
          description: t('errors.somethingWentWrong'),
          variant: "destructive",
        });
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message || t('errors.somethingWentWrong'),
        variant: "destructive",
      });
    },
  });

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: t('common.error'),
        description: t('mentorOnboarding.invalidImageType'),
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('common.error'),
        description: t('mentorOnboarding.imageTooLarge'),
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const url = await uploadService.uploadFile(file, 'mentors');
      form.setValue("photo_url", url);
      setPhotoPreview(url);
      toast({
        title: t('mentorOnboarding.photoUploaded'),
        description: t('mentorOnboarding.photoUploadSuccess'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('mentorOnboarding.photoUploadFailed'),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const commsOwner = form.watch("comms_owner");

  const onSubmit = (data: MentorFormData) => {
    createMentorMutation.mutate(data);
  };

  // ---- Gate: only approved Amazon mentors without a profile see the form ----
  if (authStatus !== "ok" || !user) {
    return <OnboardingSkeleton />;
  }

  if (user.user_type !== "mentor") {
    // No alias here on purpose: a mentee/admin email is not an Amazon alias,
    // and the request itself is recorded by the SSO callback, not by this link.
    return (
      <OnboardingGateCard
        title={t("mentorOnboarding.gate.mentorsOnlyTitle")}
        body={t("mentorOnboarding.gate.mentorsOnlyBody", { email: user.email })}
        requestAccessHref="/request-access"
      />
    );
  }

  if (approvalQuery.isLoading || approvalQuery.data?.existingMentorId) {
    return <OnboardingSkeleton />;
  }

  if (approvalQuery.isError) {
    return (
      <OnboardingGateCard
        title={t("mentorOnboarding.gate.checkFailedTitle")}
        body={t("mentorOnboarding.gate.checkFailedBody")}
      />
    );
  }

  if (!approvalQuery.data?.approved) {
    return (
      <OnboardingGateCard
        title={t("mentorOnboarding.gate.notApprovedTitle")}
        body={t("mentorOnboarding.gate.notApprovedBody", { alias: user.amazon_alias || user.email })}
        requestAccessHref={`/request-access?alias=${encodeURIComponent(user.amazon_alias || user.email)}`}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Award className="w-6 h-6 text-primary" />
              {t('mentorOnboarding.contextTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {t('mentorOnboarding.contextDescription')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Users className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('mentorOnboarding.benefit1Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('mentorOnboarding.benefit1Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Clock className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('mentorOnboarding.benefit2Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('mentorOnboarding.benefit2Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Globe className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('mentorOnboarding.benefit3Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('mentorOnboarding.benefit3Desc')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{t('mentorOnboarding.title')}</CardTitle>
            <CardDescription>
              {t('mentorOnboarding.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.fullName')} *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} data-testid="input-name" />
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
                      <FormLabel>{t('mentorOnboarding.email')} *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          value={sessionEmail || field.value}
                          name={field.name}
                          ref={field.ref}
                          readOnly
                          disabled
                          aria-readonly="true"
                          data-testid="input-email"
                        />
                      </FormControl>
                      {/* Disabled inputs are skipped by native submit; the value lives in form state and the session. */}
                      <input type="hidden" name="email" value={sessionEmail || field.value} readOnly />
                      <FormDescription>{t('mentorOnboarding.emailFromSession')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.company')}</FormLabel>
                        <FormControl>
                          <Input placeholder="Amazon" {...field} value={field.value || ""} data-testid="input-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.position')}</FormLabel>
                        <FormControl>
                          <Input placeholder="Senior Product Manager" {...field} value={field.value || ""} data-testid="input-position" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.timezone')} *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-timezone">
                              <SelectValue placeholder="Select your timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIMEZONES.map((tz) => (
                              <SelectItem key={tz} value={tz}>
                                {tz}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('menteeRegistration.country')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-country">
                              <SelectValue placeholder={t('menteeRegistration.selectCountry')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COUNTRY_OPTIONS.map((country) => (
                              <SelectItem key={country} value={country}>
                                {country}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.bio')} *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('mentorOnboarding.bioPlaceholder')}
                          className="min-h-32"
                          {...field}
                          data-testid="input-bio"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="linkedin_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.linkedinUrl')}</FormLabel>
                        <FormControl>
                          <Input placeholder="https://linkedin.com/in/..." {...field} value={field.value || ""} data-testid="input-linkedin" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="photo_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.profilePhoto')}</FormLabel>
                        <div className="flex items-center gap-4">
                          <Avatar className="h-16 w-16">
                            {photoPreview || field.value ? (
                              <AvatarImage src={photoPreview || field.value || ""} alt="Profile" />
                            ) : null}
                            <AvatarFallback>
                              <Upload className="h-6 w-6 text-muted-foreground" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <input
                              type="file"
                              accept="image/*"
                              ref={fileInputRef}
                              onChange={handlePhotoUpload}
                              className="hidden"
                              data-testid="input-photo-file"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading}
                              data-testid="button-upload-photo"
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t('mentorOnboarding.uploading')}
                                </>
                              ) : (
                                <>
                                  <Upload className="mr-2 h-4 w-4" />
                                  {t('mentorOnboarding.uploadPhoto')}
                                </>
                              )}
                            </Button>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('mentorOnboarding.photoHint')}
                            </p>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="cal_link"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.calLink')} *</FormLabel>
                      <FormControl>
                        <Input placeholder="username/30min" {...field} data-testid="input-calcom" />
                      </FormControl>
                      <FormDescription className="space-y-1">
                        <span>{t('mentorOnboarding.calHelp')}</span>
                        <a
                          href="https://cal.com/signup"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-primary hover:underline"
                          data-testid="link-setup-cal"
                        >
                          {t('mentorOnboarding.calSetupLink')}
                        </a>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expertise"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.expertise')} *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const currentValue = field.value || [];
                          if (value && !currentValue.includes(value)) {
                            field.onChange([...currentValue, value]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-expertise">
                            <SelectValue placeholder={t('mentorOnboarding.addExpertise')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-80">
                          {Object.entries(EXPERTISE_OPTIONS).map(([category, skills]) => (
                            <SelectGroup key={category}>
                              <SelectLabel className="text-primary font-semibold">{category}</SelectLabel>
                              {skills.filter(skill => !(field.value || []).includes(skill)).map((skill) => (
                                <SelectItem key={skill} value={skill}>
                                  {skill}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(field.value || []).map((exp) => (
                          <Badge key={exp} variant="secondary" data-testid={`badge-expertise-${exp}`}>
                            {exp}
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange((field.value || []).filter(item => item !== exp));
                              }}
                              className="ml-1"
                              data-testid={`button-remove-expertise-${exp}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      {(!field.value || field.value.length === 0) && (
                        <FormDescription className="text-amber-600 dark:text-amber-400" data-testid="text-skills-tip">
                          {t('profile.skillsTip')}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="industries"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.industriesExperience')} *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const currentValue = field.value || [];
                          if (value && !currentValue.includes(value)) {
                            field.onChange([...currentValue, value]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-industries">
                            <SelectValue placeholder={t('mentorOnboarding.addIndustries')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INDUSTRY_OPTIONS.filter(opt => !(field.value || []).includes(opt)).map((ind) => (
                            <SelectItem key={ind} value={ind}>
                              {ind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(field.value || []).map((ind) => (
                          <Badge key={ind} variant="secondary" data-testid={`badge-industry-${ind}`}>
                            {ind}
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange((field.value || []).filter(item => item !== ind));
                              }}
                              className="ml-1"
                              data-testid={`button-remove-industry-${ind}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="languages_spoken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.languagesSpoken')} *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const currentValue = field.value || [];
                          if (value && !currentValue.includes(value)) {
                            field.onChange([...currentValue, value]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-languages">
                            <SelectValue placeholder={t('mentorOnboarding.addLanguages')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LANGUAGE_OPTIONS.filter(opt => !(field.value || []).includes(opt)).map((lang) => (
                            <SelectItem key={lang} value={lang}>
                              {lang}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(field.value || []).map((lang) => (
                          <Badge key={lang} variant="secondary" data-testid={`badge-language-${lang}`}>
                            {lang}
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange((field.value || []).filter(item => item !== lang));
                              }}
                              className="ml-1"
                              data-testid={`button-remove-language-${lang}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="comms_owner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.commsOwner')} *</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="exec" data-testid="radio-exec" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('mentorOnboarding.commsExec')}
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="assistant" data-testid="radio-assistant" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('mentorOnboarding.commsAssistant')}
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {commsOwner === "assistant" && (
                  <FormField
                    control={form.control}
                    name="assistant_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('mentorOnboarding.assistantEmail')} *</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="assistant@example.com"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-assistant-email"
                          />
                        </FormControl>
                        <FormDescription>
                          {t('mentorOnboarding.assistantEmailHelp')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="mentorship_preference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.mentorshipPreference')}</FormLabel>
                      <FormDescription>{t('mentorOnboarding.mentorshipPreferenceHelp')}</FormDescription>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value || "rotating"}
                          className="flex flex-col space-y-3 mt-2"
                        >
                          <FormItem className="flex items-start space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="ongoing" data-testid="radio-ongoing" />
                            </FormControl>
                            <div className="flex flex-col">
                              <FormLabel className="font-medium">
                                {t('mentorOnboarding.ongoingMentorship')}
                              </FormLabel>
                              <p className="text-sm text-muted-foreground">
                                {t('mentorOnboarding.ongoingMentorshipDesc')}
                              </p>
                            </div>
                          </FormItem>
                          <FormItem className="flex items-start space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="rotating" data-testid="radio-rotating" />
                            </FormControl>
                            <div className="flex flex-col">
                              <FormLabel className="font-medium">
                                {t('mentorOnboarding.rotatingMentees')}
                              </FormLabel>
                              <p className="text-sm text-muted-foreground">
                                {t('mentorOnboarding.rotatingMenteesDesc')}
                              </p>
                            </div>
                          </FormItem>
                          <FormItem className="flex items-start space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="either" data-testid="radio-either" />
                            </FormControl>
                            <div className="flex flex-col">
                              <FormLabel className="font-medium">
                                {t('mentorOnboarding.eitherMentorship')}
                              </FormLabel>
                              <p className="text-sm text-muted-foreground">
                                {t('mentorOnboarding.eitherMentorshipDesc')}
                              </p>
                            </div>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="why_joined"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('mentorOnboarding.whyJoined')} <span className="text-muted-foreground text-sm font-normal">({t('common.optional')})</span></FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('mentorOnboarding.whyJoinedPlaceholder')}
                          className="min-h-[100px]"
                          {...field}
                          value={field.value || ""}
                          data-testid="textarea-why-joined"
                        />
                      </FormControl>
                      <FormDescription>
                        {t('mentorOnboarding.whyJoinedHelp')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="p-4 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
                  <p className="mb-2">{t('legal.termsAgreement')}</p>
                  <p>{t('legal.disclaimer')}</p>
                </div>

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/")}
                    data-testid="button-cancel"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={createMentorMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMentorMutation.isPending ? t('mentorOnboarding.creating') : t('mentorOnboarding.createProfile')}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
