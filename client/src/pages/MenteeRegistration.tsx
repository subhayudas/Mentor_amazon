import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ArrowRight, Clock, ShieldCheck, Upload, Users, X } from "lucide-react";

import { menteeService, uploadService } from "@/lib/services";
import { queryClient } from "@/lib/queryClient";
import type { Mentee } from "@/lib/database";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterChip } from "@/components/discovery/FilterChip";
import { RequestRail, DEFAULT_STOPS } from "@/components/RequestRail";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { VerificationBadge } from "@/components/VerificationBadge";
import { bidi } from "@/lib/format";
import { localizeLanguageName } from "@/lib/localized";
import { localizeCountry, REPORTING_COUNTRIES } from "@/lib/reporting";
import { ROUTES } from "@/lib/routes";
import { timeZoneChoices, utcOffsetLabel } from "@/lib/timezones";
import { BookingsError } from "@/pages/mentee/shared";

/** Stored as English names (what the directory and mentor rows use); displayed through Intl.DisplayNames. */
const LANGUAGE_OPTIONS = ["English", "Arabic", "French", "German", "Spanish", "Turkish"];

const SECTOR_OPTIONS = ["technology", "healthcare", "education", "finance", "nonprofit", "government", "retail", "manufacturing", "media", "consulting", "other"];

const ORG_SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

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

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Mentee registration. Two modes (P0-1): a fresh sign-up creates the mentees
 * row; an account whose row already exists (created by `get_or_create_mentee`
 * during an anonymous request, with `name` = email prefix and timezone 'UTC')
 * completes it instead — the update only ever touches the caller's own row,
 * which RLS ties to the session email.
 */
export default function MenteeRegistration() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const ids = useId();
  // RLS only lets a signed-in user insert a mentees row whose email equals the session email,
  // so the field is prefilled from the session and read-only.
  const sessionEmail = user?.email ?? "";
  const [isUploading, setIsUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Set only after an organisation registers: drives the anchored "verification in review" state.
  const [registeredOrg, setRegisteredOrg] = useState<Mentee | null>(null);

  const existingQuery = useQuery<Mentee | null>({
    queryKey: ["mentee", "email", sessionEmail],
    queryFn: () => menteeService.getByEmail(sessionEmail),
    enabled: !!sessionEmail,
    staleTime: 0,
  });
  const existing = existingQuery.data ?? null;
  const completing = !!existing;

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, t("menteeRegistration.validation.name")),
          email: z.string().trim().email(t("menteeRegistration.validation.email")),
          user_type: z.enum(["individual", "organization"]),
          organization_name: z.string().optional(),
          organization_website: z.string().optional(),
          organization_sector: z.string().optional(),
          organization_size: z.string().optional(),
          organization_mission: z.string().optional(),
          organization_needs: z.string().optional(),
          verification_reference: z.string().max(120).optional(),
          country: z.string().optional(),
          timezone: z.string().min(1, t("menteeRegistration.validation.timezone")),
          photo_url: z.string().optional(),
          bio: z.string().optional(),
          linkedin_url: z.string().optional(),
          languages_spoken: z.array(z.string()).min(1, t("menteeRegistration.validation.languages")),
          areas_exploring: z.array(z.string()).min(1, t("menteeRegistration.validation.areas")),
          goals: z.string().optional(),
        })
        .refine((data) => data.user_type !== "organization" || !!data.organization_name?.trim(), {
          message: t("menteeRegistration.validation.organizationName"),
          path: ["organization_name"],
        }),
    [t],
  );
  type MenteeFormData = z.infer<typeof schema>;

  const form = useForm<MenteeFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: sessionEmail,
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
      goals: "",
    },
  });

  useEffect(() => {
    if (sessionEmail) form.setValue("email", sessionEmail, { shouldValidate: false });
  }, [sessionEmail, form]);

  // Auto-created rows carry defaults (name = email prefix, timezone UTC) that
  // the person should correct: prefill what exists and flag the guesses.
  const autoName = !!existing && existing.name === existing.email.split("@")[0];
  const autoTimezone = !!existing && existing.timezone === "UTC";
  useEffect(() => {
    if (!existing) return;
    form.reset({
      name: autoName ? "" : existing.name,
      email: existing.email,
      user_type: existing.user_type || "individual",
      organization_name: existing.organization_name || "",
      organization_website: existing.organization_website || "",
      organization_sector: existing.organization_sector || "",
      organization_size: existing.organization_size || "",
      organization_mission: existing.organization_mission || "",
      organization_needs: existing.organization_needs || "",
      verification_reference: existing.verification_reference || "",
      country: existing.country || "",
      timezone: autoTimezone ? "Asia/Dubai" : existing.timezone || "Asia/Dubai",
      photo_url: existing.photo_url || "",
      bio: existing.bio || "",
      linkedin_url: existing.linkedin_url || "",
      languages_spoken: existing.languages_spoken || [],
      areas_exploring: existing.areas_exploring || [],
      goals: existing.goals || "",
    });
    if (existing.photo_url) setPhotoPreview(existing.photo_url);
  }, [existing, autoName, autoTimezone, form]);

  const userType = form.watch("user_type");
  const zones = useMemo(() => timeZoneChoices(existing?.timezone), [existing?.timezone]);

  const handleUserTypeChange = (value: "individual" | "organization") => {
    form.setValue("user_type", value, { shouldDirty: true });
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

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: t("common.error"), description: t("mentorOnboarding.invalidImageType"), variant: "destructive" });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast({ title: t("common.error"), description: t("mentorOnboarding.imageTooLarge"), variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const url = await uploadService.uploadFile(file, "mentees");
      form.setValue("photo_url", url, { shouldDirty: true });
      setPhotoPreview(url);
      toast({ title: t("mentorOnboarding.photoUploaded"), description: t("mentorOnboarding.photoUploadSuccess") });
    } catch {
      toast({ title: t("common.error"), description: t("mentorOnboarding.photoUploadFailed"), variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const save = useMutation<Mentee | null, Error, MenteeFormData>({
    mutationFn: async (data) => {
      const isOrganization = data.user_type === "organization";
      const payload = {
        ...data,
        name: data.name.trim(),
        email: sessionEmail || data.email,
        organization_name: isOrganization ? data.organization_name?.trim() || undefined : undefined,
        organization_website: isOrganization ? data.organization_website || undefined : undefined,
        organization_sector: isOrganization ? data.organization_sector || undefined : undefined,
        organization_size: isOrganization ? data.organization_size || undefined : undefined,
        organization_mission: isOrganization ? data.organization_mission || undefined : undefined,
        organization_needs: isOrganization ? data.organization_needs || undefined : undefined,
        // Organisations queue for a programme-team review; individuals are never verified.
        verification_status: isOrganization ? ("pending" as const) : ("unverified" as const),
        verification_reference: isOrganization ? data.verification_reference?.trim() || undefined : undefined,
        country: data.country || undefined,
        photo_url: data.photo_url || undefined,
        bio: data.bio || undefined,
        linkedin_url: data.linkedin_url || undefined,
        goals: data.goals || undefined,
      };
      if (existing) {
        // Keep an already-decided verification status; only a new organisation starts the review.
        const keepStatus = existing.user_type === "organization" && isOrganization && existing.verification_status;
        return menteeService.completeProfile(existing.id, {
          ...payload,
          verification_status: keepStatus ? existing.verification_status : payload.verification_status,
        });
      }
      return menteeService.create(payload);
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["mentees"] });
      queryClient.invalidateQueries({ queryKey: ["mentee", "email"] });
      if (!row?.id) {
        toast({ title: t("common.error"), description: t("menteeRegistration.saveError"), variant: "destructive" });
        return;
      }
      localStorage.setItem("menteeId", row.id);
      localStorage.setItem("menteeEmail", row.email);
      localStorage.setItem("menteeName", row.name);
      window.dispatchEvent(new Event("userRegistered"));
      const newOrgReview = row.user_type === "organization" && row.verification_status === "pending" && !(existing?.user_type === "organization");
      toast({
        title: completing ? t("menteeRegistration.updatedMessage") : t("menteeRegistration.successTitle"),
        description: newOrgReview ? t("verification.inReviewToast") : completing ? undefined : t("menteeRegistration.successMessage"),
      });
      if (newOrgReview) {
        // Anchored confirmation first; the person chooses when to continue.
        setRegisteredOrg(row);
      } else {
        setLocation(ROUTES.menteeDashboard);
      }
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("menteeRegistration.saveError"), variant: "destructive" });
    },
  });

  if (registeredOrg) {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="warning"
          icon={Clock}
          title={t("verification.inReviewTitle")}
          description={t("verification.inReviewDescription", { name: bidi(registeredOrg.organization_name || registeredOrg.name) })}
          role="status"
          data-testid="card-verification-in-review"
          actions={
            <Button asChild variant="secondary" data-testid="button-go-to-dashboard">
              <Link href={ROUTES.menteeDashboard}>
                {t("verification.goToDashboard")}
                <ArrowRight className="rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">
                <bdi>{registeredOrg.organization_name || registeredOrg.name}</bdi>
              </span>
              <VerificationBadge status={registeredOrg.verification_status ?? "pending"} type="organization" size="sm" />
            </div>
            <ul className="space-y-2 text-body-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warning-icon" strokeWidth={1.75} aria-hidden="true" />
                {t("verification.inReviewStep1")}
              </li>
              <li className="flex items-start gap-2">
                <Users className="mt-0.5 size-4 shrink-0 text-warning-icon" strokeWidth={1.75} aria-hidden="true" />
                {t("verification.inReviewStep2")}
              </li>
            </ul>
          </div>
        </StatusCard>
      </StatusPage>
    );
  }

  if (sessionEmail && existingQuery.isLoading) {
    return (
      <Container className="pb-16">
        <div role="status" aria-busy="true" className="py-8 md:py-10">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="mb-2 h-4 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </Container>
    );
  }

  if (existingQuery.isError) {
    return (
      <Container className="pb-16">
        <PageHeader eyebrow={t("menteeRegistration.eyebrow")} title={t("menteeRegistration.title")} />
        <BookingsError onRetry={() => existingQuery.refetch()} />
      </Container>
    );
  }

  const sectionClass = "grid gap-4 rounded-lg border border-border bg-card p-4 md:p-6";
  const heading = (id: string, label: string) => (
    <h2 id={id} className="text-h2-sm text-foreground">
      {label}
    </h2>
  );

  return (
    <Container className="pb-16">
      <PageHeader
        eyebrow={t("menteeRegistration.eyebrow")}
        title={completing ? t("menteeRegistration.completeTitle") : t("menteeRegistration.title")}
        description={completing ? t("menteeRegistration.completeDescription", { email: bidi(sessionEmail) }) : t("menteeRegistration.description")}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-8" noValidate>
            {completing && (autoName || autoTimezone) && (
              <Alert variant="warning" role="status" data-testid="note-auto-created">
                <Clock aria-hidden="true" />
                <AlertTitle className="leading-snug">{t("menteeRegistration.completeTitle")}</AlertTitle>
                <AlertDescription>{t("menteeRegistration.completeNote")}</AlertDescription>
              </Alert>
            )}

            <section aria-labelledby={`${ids}-type`} className="space-y-3">
              {heading(`${ids}-type`, t("menteeRegistration.accountType"))}
              <div className={sectionClass}>
                <FormField
                  control={form.control}
                  name="user_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">{t("menteeRegistration.accountType")}</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => handleUserTypeChange(value as "individual" | "organization")}
                          value={field.value}
                          className="grid gap-3 sm:grid-cols-2"
                        >
                          {(["individual", "organization"] as const).map((value) => (
                            <FormItem key={value} className="flex items-start gap-3 space-y-0 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-secondary">
                              <FormControl>
                                <RadioGroupItem value={value} className="mt-0.5" data-testid={`radio-${value}`} />
                              </FormControl>
                              <FormLabel className="cursor-pointer font-normal">
                                <span className="block font-medium text-foreground">{t(`menteeRegistration.${value}`)}</span>
                                <span className="block text-caption text-muted-foreground">{t(`menteeRegistration.${value}Desc`)}</span>
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section aria-labelledby={`${ids}-about`} className="space-y-3">
              {heading(`${ids}-about`, t("menteeRegistration.personalInfo"))}
              <div className={`${sectionClass} md:grid-cols-2`}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("menteeRegistration.fullName")}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="auto" autoComplete="name" placeholder={t("menteeRegistration.namePlaceholder")} data-testid="input-name" />
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
                      <FormLabel>{t("menteeRegistration.email")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          dir="ltr"
                          className="text-start"
                          readOnly={!!sessionEmail}
                          aria-describedby={sessionEmail ? `${ids}-email-hint` : undefined}
                          placeholder={t("menteeRegistration.emailPlaceholder")}
                          data-testid="input-email"
                        />
                      </FormControl>
                      {sessionEmail && <FormDescription id={`${ids}-email-hint`}>{t("menteeRegistration.emailFromSession")}</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("menteeRegistration.timezone")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-timezone">
                            <SelectValue placeholder={t("menteeRegistration.selectTimezone")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {zones.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              <span dir="ltr">
                                {tz} · {utcOffsetLabel(tz)}
                              </span>
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
                      <FormLabel>{t("menteeRegistration.country")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-country">
                            <SelectValue placeholder={t("menteeRegistration.selectCountry")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REPORTING_COUNTRIES.map((country) => (
                            <SelectItem key={country} value={country}>
                              {localizeCountry(country, i18n.language)}
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
                  name="bio"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("menteeRegistration.bio")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ""} dir="auto" placeholder={t("menteeRegistration.bioPlaceholder")} className="min-h-24" data-testid="input-bio" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="linkedin_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("menteeRegistration.linkedinUrl")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} type="url" inputMode="url" dir="ltr" className="text-start" placeholder={t("menteeRegistration.urlPlaceholder")} data-testid="input-linkedin" />
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
                      <FormLabel htmlFor={`${ids}-photo`}>{t("mentorOnboarding.profilePhoto")}</FormLabel>
                      <div className="flex items-center gap-4">
                        <Avatar className="size-16">
                          {photoPreview || field.value ? <AvatarImage src={photoPreview || field.value || ""} alt="" /> : null}
                          <AvatarFallback>
                            <Upload className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <input id={`${ids}-photo`} type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoUpload} className="sr-only" data-testid="input-photo-file" />
                          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} loading={isUploading} data-testid="button-upload-photo">
                            <Upload aria-hidden="true" />
                            {isUploading ? t("mentorOnboarding.uploading") : t("mentorOnboarding.uploadPhoto")}
                          </Button>
                          <p className="mt-1 text-caption text-muted-foreground">{t("mentorOnboarding.photoHint")}</p>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            {userType === "organization" && (
              <section aria-labelledby={`${ids}-org`} className="space-y-3">
                {heading(`${ids}-org`, t("menteeRegistration.organizationInfo"))}
                <div className={`${sectionClass} md:grid-cols-2`}>
                  <FormField
                    control={form.control}
                    name="organization_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("menteeRegistration.organizationName")}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} dir="auto" autoComplete="organization" placeholder={t("menteeRegistration.organizationNamePlaceholder")} data-testid="input-organization" />
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
                        <FormLabel>{t("menteeRegistration.organizationWebsite")}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} type="url" inputMode="url" dir="ltr" className="text-start" placeholder={t("menteeRegistration.urlPlaceholder")} data-testid="input-org-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="organization_sector"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("menteeRegistration.organizationSector")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sector">
                              <SelectValue placeholder={t("menteeRegistration.selectSector")} />
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
                        <FormLabel>{t("menteeRegistration.organizationSize")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-size">
                              <SelectValue placeholder={t("menteeRegistration.selectSize")} />
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
                  <FormField
                    control={form.control}
                    name="organization_mission"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>{t("menteeRegistration.organizationMission")}</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value || ""} dir="auto" placeholder={t("menteeRegistration.missionPlaceholder")} className="min-h-20" data-testid="input-org-mission" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="organization_needs"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>{t("menteeRegistration.organizationNeeds")}</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value || ""} dir="auto" placeholder={t("menteeRegistration.needsPlaceholder")} className="min-h-20" data-testid="input-org-needs" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4 border-t border-border pt-4 md:col-span-2" data-testid="section-verification">
                    <h3 className="flex items-center gap-2 text-h3 text-foreground">
                      <ShieldCheck className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
                      {t("verification.sectionTitle")}
                    </h3>
                    <FormField
                      control={form.control}
                      name="verification_reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("verification.referenceLabel")}</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} dir="auto" autoComplete="off" maxLength={120} placeholder={t("verification.referencePlaceholder")} data-testid="input-verification-reference" />
                          </FormControl>
                          <FormDescription>{t("verification.referenceHelp")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Alert variant="warning" role="status" data-testid="note-verification-pending">
                      <Clock aria-hidden="true" />
                      <AlertTitle className="leading-snug">{t("verification.registrationNoteTitle")}</AlertTitle>
                      <AlertDescription>{t("verification.registrationNote")}</AlertDescription>
                    </Alert>
                  </div>
                </div>
              </section>
            )}

            <section aria-labelledby={`${ids}-interests`} className="space-y-3">
              {heading(`${ids}-interests`, t("menteeRegistration.interestsSection"))}
              <div className={sectionClass}>
                <FormField
                  control={form.control}
                  name="languages_spoken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("menteeRegistration.languagesSpoken")}</FormLabel>
                      <Select
                        value=""
                        onValueChange={(value) => {
                          const current = field.value || [];
                          if (value && !current.includes(value)) field.onChange([...current, value]);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="md:max-w-sm" data-testid="select-languages">
                            <SelectValue placeholder={t("menteeRegistration.addLanguages")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LANGUAGE_OPTIONS.filter((opt) => !(field.value || []).includes(opt)).map((lang) => (
                            <SelectItem key={lang} value={lang}>
                              {localizeLanguageName(lang, i18n.language)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(field.value || []).length > 0 && (
                        <ul className="flex flex-wrap gap-2 pt-2" aria-label={t("menteeRegistration.languagesSpoken")}>
                          {(field.value || []).map((lang) => (
                            <li key={lang}>
                              <Badge tone="neutral" className="gap-1.5 pe-1" data-testid={`badge-language-${lang}`}>
                                {localizeLanguageName(lang, i18n.language)}
                                <button
                                  type="button"
                                  onClick={() => field.onChange((field.value || []).filter((item) => item !== lang))}
                                  className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors duration-fast hover:bg-border hover:text-foreground"
                                  aria-label={t("menteeRegistration.removeLanguage", { name: localizeLanguageName(lang, i18n.language) })}
                                  data-testid={`button-remove-language-${lang}`}
                                >
                                  <X className="size-3.5" aria-hidden="true" />
                                </button>
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="areas_exploring"
                  render={({ field }) => {
                    const selected = field.value || [];
                    const toggle = (area: string) =>
                      field.onChange(selected.includes(area) ? selected.filter((a) => a !== area) : [...selected, area]);
                    return (
                      <FormItem>
                        <FormLabel id={`${ids}-areas-label`}>{t("experienceAreas.title")}</FormLabel>
                        <FormDescription id={`${ids}-areas-help`}>{t("experienceAreas.help")}</FormDescription>
                        <div role="group" aria-labelledby={`${ids}-areas-label`} aria-describedby={`${ids}-areas-help`} className="flex flex-wrap gap-2 pt-1" data-testid="experience-areas-container">
                          {EXPERIENCE_AREA_OPTIONS.map((area) => (
                            <FilterChip key={area} selected={selected.includes(area)} onToggle={() => toggle(area)} data-testid={`badge-experience-${area}`}>
                              {t(`experienceAreas.options.${area}`)}
                            </FilterChip>
                          ))}
                        </div>
                        <FormMessage />
                        {selected.includes("other") && (
                          <FormField
                            control={form.control}
                            name="goals"
                            render={({ field: goalsField }) => (
                              <FormItem className="pt-4">
                                <FormLabel>{t("menteeRegistration.goals")}</FormLabel>
                                <FormControl>
                                  <Textarea {...goalsField} value={goalsField.value || ""} dir="auto" placeholder={t("menteeRegistration.goalsPlaceholder")} className="min-h-24" data-testid="input-goals" />
                                </FormControl>
                                <FormDescription>{t("menteeRegistration.goalsHelp")}</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </FormItem>
                    );
                  }}
                />
              </div>
            </section>

            <div className="rounded-lg border border-border bg-muted/40 p-4 text-body-sm text-muted-foreground">
              <p className="mb-2">{t("legal.termsAgreement")}</p>
              <p>{t("legal.privacyNotice")}</p>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" size="lg" onClick={() => setLocation(completing ? ROUTES.menteeDashboard : ROUTES.home)} data-testid="button-cancel">
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="primary" size="lg" loading={save.isPending} data-testid="button-submit">
                {completing
                  ? save.isPending
                    ? t("menteeRegistration.saving")
                    : t("menteeRegistration.saveProfile")
                  : save.isPending
                    ? t("menteeRegistration.creating")
                    : t("menteeRegistration.createProfile")}
              </Button>
            </div>
          </form>
        </Form>

        <aside className="rounded-lg border border-border bg-card p-6 lg:sticky lg:top-20" aria-labelledby={`${ids}-how`}>
          <h2 id={`${ids}-how`} className="text-h3 text-foreground">
            {t("menteeRegistration.contextTitle")}
          </h2>
          <p className="mt-2 text-body-sm text-muted-foreground text-pretty">{t("menteeRegistration.contextDescription")}</p>
          <RequestRail size="sm" className="mt-5" stops={DEFAULT_STOPS(t)} />
          <ul className="mt-5 space-y-3 border-t border-border pt-5">
            {(["benefit1", "benefit2", "benefit3"] as const).map((key) => (
              <li key={key}>
                <p className="text-body-sm font-medium text-foreground">{t(`menteeRegistration.${key}Title`)}</p>
                <p className="text-caption text-muted-foreground text-pretty">{t(`menteeRegistration.${key}Desc`)}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Container>
  );
}
