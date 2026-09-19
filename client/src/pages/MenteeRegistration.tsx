import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { menteeService, uploadService } from "@/lib/services";
import { queryClient } from "@/lib/queryClient";
import type { Mentee } from "@/lib/database";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
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
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, BookOpen, Users, Target, Sparkles, Check, Upload, Loader2, Clock, ShieldCheck, ArrowRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/VerificationBadge";

// How long the anchored "verification in review" card stays before we move on to the dashboard.

const TIMEZONES = [
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Europe/Istanbul",
  "UTC",
];

const LANGUAGE_OPTIONS = [
  "English",
  "Arabic",
  "French",
  "German",
  "Spanish",
  "Turkish",
];

const AREAS_EXPLORING_OPTIONS = [
  "Career Development",
  "Product Management",
  "Engineering",
  "Design",
  "Marketing",
  "Sales",
  "Operations",
  "Data Science",
  "Leadership",
  "E-commerce",
  "Cloud Computing",
  "UX Design",
  "Digital Marketing",
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

const SECTOR_OPTIONS = [
  "technology",
  "healthcare",
  "education",
  "finance",
  "nonprofit",
  "government",
  "retail",
  "manufacturing",
  "media",
  "consulting",
  "other",
];

const ORG_SIZE_OPTIONS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
];

const EXPERIENCE_AREA_OPTIONS = [
  "leadership",
  "careerGrowth",
  "technicalSkills",
  "communication",
  "networking",
  "workLifeBalance",
  "projectManagement",
  "teamBuilding",
  "innovation",
  "strategicThinking",
  "conflictResolution",
  "mentoring",
  "other",
] as const;

const menteeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  user_type: z.enum(["individual", "organization"]),
  organization_name: z.string().optional(),
  organization_website: z.string().optional(),
  organization_sector: z.string().optional(),
  organization_size: z.string().optional(),
  organization_mission: z.string().optional(),
  organization_needs: z.string().optional(),
  verification_reference: z.string().max(120).optional(),
  country: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  photo_url: z.string().optional(),
  bio: z.string().optional(),
  linkedin_url: z.string().optional(),
  languages_spoken: z.array(z.string()).min(1, "At least one language is required"),
  areas_exploring: z.array(z.string()).min(1, "At least one area is required"),
  goals: z.string().optional(),
});

type MenteeFormData = z.infer<typeof menteeSchema>;

export default function MenteeRegistration() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  // RLS only lets a signed-in user insert a mentees row whose email equals the session email,
  // so when a session exists the field is prefilled from it and locked.
  const sessionEmail = user?.email ?? "";
  const [isUploading, setIsUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Set only after an organisation registers: drives the anchored "verification in review" state.
  const [registeredOrg, setRegisteredOrg] = useState<Mentee | null>(null);
  const successCardRef = useRef<HTMLDivElement>(null);

  const goToDashboard = () => setLocation("/mentee-dashboard");

  useEffect(() => {
    if (!registeredOrg) return;
    // Anchored confirmation stays until the person chooses to continue — an
    // auto-redirect would tear the card away before it can be read.
    successCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    successCardRef.current?.focus({ preventScroll: true });
  }, [registeredOrg]);

  const form = useForm<MenteeFormData>({
    resolver: zodResolver(menteeSchema.refine(
      (data) => {
        if (data.user_type === "organization") {
          const trimmed = data.organization_name?.trim() || "";
          return trimmed.length > 0;
        }
        return true;
      },
      {
        message: "Organization name is required for organization accounts",
        path: ["organization_name"],
      }
    )),
    defaultValues: {
      name: "",
      email: "",
      user_type: "individual",
      organization_name: "",
      organization_website: "",
      organization_sector: "",
      organization_size: "",
      organization_mission: "",
      organization_needs: "",
      verification_reference: "",
      country: "",
      timezone: "Asia/Dubai",
      photo_url: "",
      bio: "",
      linkedin_url: "",
      languages_spoken: [],
      areas_exploring: [],
    },
  });

  useEffect(() => {
    if (sessionEmail) form.setValue("email", sessionEmail, { shouldValidate: false });
  }, [sessionEmail, form]);

  const userType = form.watch("user_type");

  const handleUserTypeChange = (value: "individual" | "organization") => {
    form.setValue("user_type", value);
    if (value === "individual") {
      form.setValue("organization_name", "");
      form.setValue("organization_website", "");
      form.setValue("organization_sector", "");
      form.setValue("organization_size", "");
      form.setValue("organization_mission", "");
      form.setValue("organization_needs", "");
      form.setValue("verification_reference", "");
      form.clearErrors("organization_name");
    }
  };

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
      const url = await uploadService.uploadFile(file, 'mentees');
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

  const createMenteeMutation = useMutation<Mentee, Error, MenteeFormData>({
    mutationFn: async (data: MenteeFormData) => {
      const isOrganization = data.user_type === "organization";
      return menteeService.create({
        ...data,
        email: sessionEmail || data.email,
        organization_name: data.organization_name?.trim() || undefined,
        // Organisations queue for a programme-team review; individuals are never verified.
        // No third-party check runs yet — an IDfy-style provider can later flip this server-side.
        verification_status: isOrganization ? "pending" : "unverified",
        verification_reference: isOrganization ? data.verification_reference?.trim() || undefined : undefined,
      });
    },
    onSuccess: (newMentee: Mentee) => {
      queryClient.invalidateQueries({ queryKey: ['mentees'] });
      toast({
        title: t('menteeRegistration.successTitle'),
        description: newMentee?.user_type === "organization"
          ? t('verification.inReviewToast')
          : t('menteeRegistration.successMessage'),
      });
      if (newMentee?.id) {
        localStorage.setItem("menteeId", newMentee.id);
        localStorage.setItem("menteeEmail", newMentee.email);
        localStorage.setItem("menteeName", newMentee.name);
        window.dispatchEvent(new Event("userRegistered"));
        if (newMentee.user_type === "organization") {
          // Anchored feedback first; the effect above scrolls to the card and redirects.
          setRegisteredOrg(newMentee);
        } else {
          goToDashboard();
        }
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

  const onSubmit = (data: MenteeFormData) => {
    createMenteeMutation.mutate(data);
  };

  if (registeredOrg) {
    return (
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-8">
          <Card
            ref={successCardRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className="scroll-mt-24 border-amber-400 bg-amber-50/60 ring-4 ring-amber-300/60 outline-none transition-shadow"
            data-testid="card-verification-in-review"
          >
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Clock className="w-6 h-6 text-amber-700" aria-hidden="true" />
                {t('verification.inReviewTitle')}
              </CardTitle>
              <CardDescription className="text-base text-foreground/80">
                {t('verification.inReviewDescription', { name: registeredOrg.organization_name || registeredOrg.name })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{registeredOrg.organization_name || registeredOrg.name}</span>
                <VerificationBadge status={registeredOrg.verification_status ?? "pending"} type="organization" size="sm" />
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                  {t('verification.inReviewStep1')}
                </li>
                <li className="flex items-start gap-2">
                  <Users className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                  {t('verification.inReviewStep2')}
                </li>
              </ul>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button onClick={goToDashboard} data-testid="button-go-to-dashboard">
                  {t('verification.goToDashboard')}
                  <ArrowRight className="w-4 h-4 ms-2 rtl:rotate-180" aria-hidden="true" />
                </Button>
                <span className="text-xs text-muted-foreground">{t('verification.redirectingShortly')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              {t('menteeRegistration.contextTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {t('menteeRegistration.contextDescription')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Users className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('menteeRegistration.benefit1Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('menteeRegistration.benefit1Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Target className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('menteeRegistration.benefit2Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('menteeRegistration.benefit2Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <BookOpen className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">{t('menteeRegistration.benefit3Title')}</h4>
                  <p className="text-xs text-muted-foreground">{t('menteeRegistration.benefit3Desc')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{t('menteeRegistration.title')}</CardTitle>
            <CardDescription>
              {t('menteeRegistration.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="user_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteeRegistration.accountType')} *</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => handleUserTypeChange(value as "individual" | "organization")}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="individual" data-testid="radio-individual" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('menteeRegistration.individual')} ({t('menteeRegistration.individualDesc')})
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="organization" data-testid="radio-organization" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('menteeRegistration.organization')} ({t('menteeRegistration.organizationDesc')})
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteeRegistration.fullName')} *</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Smith" {...field} data-testid="input-name" />
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
                      <FormLabel>{t('menteeRegistration.email')} *</FormLabel>
                      <FormControl>
                        {sessionEmail ? (
                          <Input
                            type="email"
                            value={sessionEmail}
                            name={field.name}
                            ref={field.ref}
                            readOnly
                            aria-readonly="true"
                            className="bg-muted text-muted-foreground"
                            data-testid="input-email"
                          />
                        ) : (
                          <Input type="email" placeholder="jane@example.com" {...field} data-testid="input-email" />
                        )}
                      </FormControl>
                      {sessionEmail && <FormDescription>{t('menteeRegistration.emailFromSession')}</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {userType === "organization" && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h3 className="font-medium">{t('menteeRegistration.organizationInfo')}</h3>
                    
                    <FormField
                      control={form.control}
                      name="organization_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('menteeRegistration.organizationName')} *</FormLabel>
                          <FormControl>
                            <Input placeholder="Acme Corp" {...field} value={field.value || ""} data-testid="input-organization" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="organization_website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('menteeRegistration.organizationWebsite')}</FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com" {...field} value={field.value || ""} data-testid="input-org-website" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="organization_sector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('menteeRegistration.organizationSector')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-sector">
                                  <SelectValue placeholder={t('menteeRegistration.selectSector')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {SECTOR_OPTIONS.map((sector) => (
                                  <SelectItem key={sector} value={sector}>
                                    {t(`sectors.${sector}`)}
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
                        name="organization_size"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('menteeRegistration.organizationSize')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-size">
                                  <SelectValue placeholder={t('menteeRegistration.selectSize')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {ORG_SIZE_OPTIONS.map((size) => (
                                  <SelectItem key={size} value={size}>
                                    {t(`orgSizes.${size}`)}
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
                      name="organization_mission"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('menteeRegistration.organizationMission')}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t('menteeRegistration.missionPlaceholder')}
                              className="min-h-20"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-org-mission"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="organization_needs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('menteeRegistration.organizationNeeds')}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t('menteeRegistration.needsPlaceholder')}
                              className="min-h-20"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-org-needs"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4 border-t pt-4" data-testid="section-verification">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        <h3 className="font-medium">{t('verification.sectionTitle')}</h3>
                      </div>

                      <FormField
                        control={form.control}
                        name="verification_reference"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('verification.referenceLabel')}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t('verification.referencePlaceholder')}
                                autoComplete="off"
                                maxLength={120}
                                {...field}
                                value={field.value || ""}
                                data-testid="input-verification-reference"
                              />
                            </FormControl>
                            <FormDescription>{t('verification.referenceHelp')}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div
                        className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
                        data-testid="note-verification-pending"
                      >
                        <Clock className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                        <div className="space-y-1">
                          <p className="font-medium text-amber-900">{t('verification.registrationNoteTitle')}</p>
                          <p className="text-amber-900/80">{t('verification.registrationNote')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('menteeRegistration.timezone')} *</FormLabel>
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
                      <FormLabel>{t('menteeRegistration.bio')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('menteeRegistration.bioPlaceholder')}
                          className="min-h-24"
                          {...field}
                          value={field.value || ""}
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
                        <FormLabel>{t('menteeRegistration.linkedinUrl')}</FormLabel>
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
                  name="languages_spoken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('menteeRegistration.languagesSpoken')} *</FormLabel>
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
                            <SelectValue placeholder={t('menteeRegistration.addLanguages')} />
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
                  name="areas_exploring"
                  render={({ field }) => {
                    const selectedAreas = field.value || [];
                    const toggleArea = (area: string) => {
                      if (selectedAreas.includes(area)) {
                        field.onChange(selectedAreas.filter((a: string) => a !== area));
                      } else {
                        field.onChange([...selectedAreas, area]);
                      }
                    };
                    const hasOtherSelected = selectedAreas.includes("other");
                    
                    return (
                      <FormItem>
                        <FormLabel>{t('experienceAreas.title')} *</FormLabel>
                        <div className="flex flex-wrap gap-2" data-testid="experience-areas-container">
                          {EXPERIENCE_AREA_OPTIONS.map((area) => {
                            const isSelected = selectedAreas.includes(area);
                            return (
                              <Badge
                                key={area}
                                variant={isSelected ? "default" : "outline"}
                                className={`cursor-pointer transition-colors ${
                                  isSelected 
                                    ? "bg-primary text-primary-foreground" 
                                    : "hover:bg-primary/10"
                                }`}
                                onClick={() => toggleArea(area)}
                                data-testid={`badge-experience-${area}`}
                              >
                                {isSelected && <Check className="w-3 h-3 mr-1" />}
                                {t(`experienceAreas.options.${area}`)}
                              </Badge>
                            );
                          })}
                        </div>
                        <FormDescription>
                          {t('experienceAreas.help')}
                        </FormDescription>
                        <FormMessage />
                        
                        {hasOtherSelected && (
                          <FormField
                            control={form.control}
                            name="goals"
                            render={({ field: goalsField }) => (
                              <FormItem className="mt-4">
                                <FormLabel>{t('menteeRegistration.goals')}</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder={t('menteeRegistration.goalsPlaceholder')}
                                    className="min-h-24"
                                    {...goalsField}
                                    value={goalsField.value || ""}
                                    data-testid="input-goals"
                                  />
                                </FormControl>
                                <FormDescription>
                                  {t('menteeRegistration.goalsHelp')}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </FormItem>
                    );
                  }}
                />

                <div className="p-4 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
                  <p className="mb-2">{t('legal.termsAgreement')}</p>
                  <p>{t('legal.privacyNotice')}</p>
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
                    disabled={createMenteeMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMenteeMutation.isPending ? t('menteeRegistration.creating') : t('menteeRegistration.createProfile')}
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
