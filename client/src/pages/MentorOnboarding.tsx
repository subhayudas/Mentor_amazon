import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { KeyRound, ShieldAlert, Upload, X } from "lucide-react";

import { mentorService, uploadService } from "@/lib/services";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useRequireRole } from "@/components/RouteGuard";
import type { Mentor } from "@/lib/database";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OnboardingShell, onboardingSectionClass } from "@/components/onboarding/OnboardingShell";
import { IS_LOCAL } from "@/lib/demo";
import { localStore, slugFor } from "@/lib/localStore";
import { sessionFromMentor, setLocalSession } from "@/lib/localAuth";
import { RequestRail } from "@/components/RequestRail";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { bidi } from "@/lib/format";
import { localizeLanguageName } from "@/lib/localized";
import { localizeCountry, REPORTING_COUNTRIES } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { timeZoneChoices, utcOffsetLabel } from "@/lib/timezones";

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
 * Explains why instead of redirecting silently; the heading takes focus (D7).
 */
function OnboardingGateCard({ title, body, requestAccessHref }: { title: string; body: string; requestAccessHref?: string }) {
  const { t } = useTranslation();
  return (
    <StatusPage>
      <StatusCard
        titleAs="h1"
        tone="danger"
        icon={ShieldAlert}
        title={title}
        description={body}
        focusKey={title}
        data-testid="card-onboarding-gate"
        actions={
          <>
            <Button asChild variant="outline" data-testid="link-gate-home">
              <Link href={ROUTES.home}>{t("mentorOnboarding.gate.backHome")}</Link>
            </Button>
            {requestAccessHref && (
              <Button asChild variant="secondary" data-testid="link-gate-request-access">
                <Link href={requestAccessHref}>
                  <KeyRound aria-hidden="true" />
                  {t("mentorOnboarding.gate.requestAccess")}
                </Link>
              </Button>
            )}
          </>
        }
      />
    </StatusPage>
  );
}

function OnboardingSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    </div>
  );
}

/** Stored as English strings (the discovery filters and mentor rows use them); group labels are translated. */
const EXPERTISE_OPTIONS: Record<"technical" | "business" | "leadership", string[]> = {
  technical: [
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
  business: [
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
  leadership: [
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

const CAL_PATTERN = /^[a-z0-9._-]+\/[a-z0-9_-]+$/i;
const normalizeCalLink = (value: string) => value.trim().replace(/^https?:\/\/(www\.)?cal\.com\//i, "");
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function MentorOnboarding() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const ids = useId();
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
    enabled: isMentorSession && !IS_LOCAL,
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
      setLocation(ROUTES.mentorPortal, { replace: true });
    }
  }, [approvalQuery.data?.existingMentorId, setLocation]);

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, t("mentorOnboarding.validation.name")),
          email: z.string().trim().email(t("mentorOnboarding.validation.email")),
          company: z.string().optional(),
          position: z.string().optional(),
          timezone: z.string().min(1, t("mentorOnboarding.validation.timezone")),
          country: z.string().optional(),
          photo_url: z.string().optional(),
          bio: z.string().trim().min(1, t("mentorOnboarding.validation.bio")),
          linkedin_url: z.string().optional(),
          cal_link: z
            .string()
            .trim()
            .min(1, t("mentorOnboarding.validation.calLink"))
            .refine((value) => CAL_PATTERN.test(normalizeCalLink(value)), { message: t("mentorOnboarding.validation.calLink") }),
          expertise: z.array(z.string()).min(1, t("mentorOnboarding.validation.expertise")),
          industries: z.array(z.string()).min(1, t("mentorOnboarding.validation.industries")),
          languages_spoken: z.array(z.string()).min(1, t("mentorOnboarding.validation.languages")),
          comms_owner: z.enum(["exec", "assistant"]),
          assistant_email: z.string().optional(),
          mentorship_preference: z.enum(["ongoing", "rotating", "either"]).optional(),
          why_joined: z.string().optional(),
        })
        .refine((data) => data.comms_owner !== "assistant" || z.string().email().safeParse(data.assistant_email ?? "").success, {
          message: t("mentorOnboarding.validation.assistantEmail"),
          path: ["assistant_email"],
        }),
    [t],
  );
  type MentorFormData = z.infer<typeof schema>;

  const form = useForm<MentorFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: sessionEmail,
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
      assistant_email: "",
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
    mutationFn: (data) =>
      IS_LOCAL
        ? // No Supabase project yet: the profile is saved in this browser and is live in the directory at once.
          Promise.resolve(
            localStore.add("mentors", {
              ...data,
              id: slugFor(data.name),
              name: data.name.trim(),
              email: sessionEmail || data.email,
              cal_link: normalizeCalLink(data.cal_link),
              company: data.company?.trim() || undefined,
              position: data.position?.trim() || undefined,
              country: data.country || undefined,
              photo_url: data.photo_url || photoPreview || undefined,
              linkedin_url: data.linkedin_url || undefined,
              why_joined: data.why_joined?.trim() || undefined,
              is_available: true,
              created_at: new Date().toISOString(),
            } as Mentor),
          )
        : mentorService.create({
        ...data,
        name: data.name.trim(),
        // Always the session email, whatever the form state says.
        email: sessionEmail || data.email,
        cal_link: normalizeCalLink(data.cal_link),
        assistant_email: data.comms_owner === "assistant" ? data.assistant_email?.trim() || undefined : undefined,
        company: data.company?.trim() || undefined,
        position: data.position?.trim() || undefined,
        country: data.country || undefined,
        photo_url: data.photo_url || undefined,
        linkedin_url: data.linkedin_url || undefined,
        why_joined: data.why_joined?.trim() || undefined,
        is_available: true,
      }),
    onSuccess: (newMentor) => {
      queryClient.invalidateQueries({ queryKey: ["mentors"] });
      if (!newMentor?.id) {
        toast.error(t("mentorOnboarding.saveError"));
        return;
      }
      toast.success(t("mentorOnboarding.successTitle"), { description: t("mentorOnboarding.successMessage") });
      localStorage.setItem("mentorId", newMentor.id);
      localStorage.setItem("mentorEmail", newMentor.email ?? "");
      localStorage.setItem("mentorName", newMentor.name);
      window.dispatchEvent(new Event("userRegistered"));
      if (IS_LOCAL) {
        // The new profile is the signed-in account from here on; the dashboard opens in the mentor view.
        setLocalSession(sessionFromMentor(newMentor));
        setLocation("/dashboard");
        return;
      }
      setLocation(ROUTES.mentorPortal);
    },
    onError: () => {
      toast.error(t("mentorOnboarding.saveError"));
    },
  });

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("mentorOnboarding.invalidImageType"));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error(t("mentorOnboarding.imageTooLarge"));
      return;
    }
    setIsUploading(true);
    try {
      const url = await uploadService.uploadFile(file, "mentors");
      form.setValue("photo_url", url, { shouldDirty: true });
      setPhotoPreview(url);
      toast.success(t("mentorOnboarding.photoUploaded"), { description: t("mentorOnboarding.photoUploadSuccess") });
    } catch {
      toast.error(t("mentorOnboarding.photoUploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  const commsOwner = form.watch("comms_owner");
  const zones = useMemo(() => timeZoneChoices(), []);

  // ---- Gate: only approved Amazon mentors without a profile see the form ----
  if (authStatus !== "ok" || (!user && !IS_LOCAL)) {
    return <OnboardingSkeleton />;
  }

  if (user && user.user_type !== "mentor") {
    // No alias here on purpose: a mentee/admin email is not an Amazon alias,
    // and the request itself is recorded by the SSO callback, not by this link.
    return (
      <OnboardingGateCard
        title={t("mentorOnboarding.gate.mentorsOnlyTitle")}
        body={t("mentorOnboarding.gate.mentorsOnlyBody", { email: bidi(user.email) })}
        requestAccessHref={ROUTES.requestAccess}
      />
    );
  }

  if (!IS_LOCAL && (approvalQuery.isLoading || approvalQuery.data?.existingMentorId)) {
    return <OnboardingSkeleton />;
  }

  if (!IS_LOCAL && approvalQuery.isError) {
    return <OnboardingGateCard title={t("mentorOnboarding.gate.checkFailedTitle")} body={t("mentorOnboarding.gate.checkFailedBody")} />;
  }

  if (!IS_LOCAL && !approvalQuery.data?.approved) {
    const alias = user?.amazon_alias || user?.email || "";
    return (
      <OnboardingGateCard
        title={t("mentorOnboarding.gate.notApprovedTitle")}
        body={t("mentorOnboarding.gate.notApprovedBody", { alias: bidi(alias) })}
        requestAccessHref={`${ROUTES.requestAccess}?alias=${encodeURIComponent(alias)}`}
      />
    );
  }

  const sectionClass = onboardingSectionClass;
  const heading = (id: string, label: string) => (
    <h2 id={id} className="text-h2-sm text-foreground">
      {label}
    </h2>
  );

  /** Multi-select list stored as strings: a Select that appends plus removable chips. */
  const listField = (
    name: "expertise" | "industries" | "languages_spoken",
    label: string,
    placeholder: string,
    testId: string,
    render: (field: { value: string[]; onChange: (next: string[]) => void }) => ReactNode,
    display: (value: string) => string = (v) => v,
    chipPrefix = "badge",
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const value = (field.value || []) as string[];
        const remove = (item: string) => field.onChange(value.filter((x) => x !== item));
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select value="" onValueChange={(next) => next && !value.includes(next) && field.onChange([...value, next])}>
              <FormControl>
                <SelectTrigger className="md:max-w-sm" data-testid={testId}>
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>{render({ value, onChange: field.onChange })}</SelectContent>
            </Select>
            {value.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-2" aria-label={label}>
                {value.map((item) => (
                  <li key={item}>
                    <Badge tone="neutral" className="gap-1.5 pe-1" data-testid={`${chipPrefix}-${item}`}>
                      {display(item)}
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors duration-fast hover:bg-border hover:text-foreground"
                        aria-label={t("mentorOnboarding.removeItem", { name: display(item) })}
                        data-testid={`button-remove-${chipPrefix.replace(/^badge-/, "")}-${item}`}
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
        );
      }}
    />
  );

  const steps = [
    { id: `${ids}-about`, label: t("mentorOnboarding.personalInfo") },
    { id: `${ids}-work`, label: t("showcase.onboarding.mentorWork") },
    { id: `${ids}-scheduling`, label: t("showcase.onboarding.mentorScheduling") },
  ];

  return (
    <OnboardingShell
      eyebrow={t("mentorOnboarding.eyebrow")}
      title={t("mentorOnboarding.title")}
      description={t("mentorOnboarding.description")}
      steps={steps}
      aside={
        <>
          <h2 id={`${ids}-how`} className="text-[18px] font-bold text-[var(--sc-ink)]">
            {t("mentorOnboarding.contextTitle")}
          </h2>
          <p className="mt-2 text-body-sm text-[var(--sc-ink-soft)] text-pretty">{t("mentorOnboarding.contextDescription")}</p>
          <RequestRail
            size="sm"
            className="mt-5"
            stops={[
              { label: t("dashboardV2.inbox.how1"), state: "next" },
              { label: t("dashboardV2.inbox.how2"), state: "next" },
              { label: t("dashboardV2.inbox.how3"), state: "next" },
            ]}
          />
          <ul className="mt-5 space-y-3 border-t border-[var(--sc-hairline)] pt-5">
            {(["benefit1", "benefit2", "benefit3"] as const).map((key) => (
              <li key={key}>
                <p className="text-body-sm font-semibold text-[var(--sc-ink)]">{t(`mentorOnboarding.${key}Title`)}</p>
                <p className="text-caption text-[var(--sc-ink-soft)] text-pretty">{t(`mentorOnboarding.${key}Desc`)}</p>
              </li>
            ))}
          </ul>
        </>
      }
    >
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMentorMutation.mutate(data))} className="space-y-8" noValidate>
            <section aria-labelledby={`${ids}-about`} className="space-y-3">
              {heading(`${ids}-about`, t("mentorOnboarding.personalInfo"))}
              <div className={`${sectionClass} md:grid-cols-2`}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("mentorOnboarding.fullName")}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="auto" autoComplete="name" placeholder={t("mentorOnboarding.namePlaceholder")} data-testid="input-name" />
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
                      <FormLabel>{t("mentorOnboarding.email")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={sessionEmail || field.value}
                          type="email"
                          readOnly
                          dir="ltr"
                          className="text-start"
                          aria-describedby={`${ids}-email-hint`}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormDescription id={`${ids}-email-hint`}>{t("mentorOnboarding.emailFromSession")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("mentorOnboarding.timezone")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-timezone">
                            <SelectValue placeholder={t("mentorOnboarding.selectTimezone")} />
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
                      <FormLabel>{t("mentorOnboarding.country")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-country">
                            <SelectValue placeholder={t("mentorOnboarding.selectCountry")} />
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
                  name="photo_url"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
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

            <section aria-labelledby={`${ids}-work`} className="space-y-3">
              {heading(`${ids}-work`, t("mentorOnboarding.professionalInfo"))}
              <div className={`${sectionClass} md:grid-cols-2`}>
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("mentorOnboarding.company")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} dir="auto" autoComplete="organization" placeholder={t("mentorOnboarding.companyPlaceholder")} data-testid="input-company" />
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
                      <FormLabel>{t("mentorOnboarding.position")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} dir="auto" autoComplete="organization-title" placeholder={t("mentorOnboarding.positionPlaceholder")} data-testid="input-position" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("mentorOnboarding.bio")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} dir="auto" placeholder={t("mentorOnboarding.bioPlaceholder")} className="min-h-32" data-testid="input-bio" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="linkedin_url"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("mentorOnboarding.linkedinUrl")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} type="url" inputMode="url" dir="ltr" className="text-start md:max-w-sm" placeholder={t("mentorOnboarding.urlPlaceholder")} data-testid="input-linkedin" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="md:col-span-2">
                  {listField(
                    "expertise",
                    t("mentorOnboarding.expertise"),
                    t("mentorOnboarding.addExpertise"),
                    "select-expertise",
                    ({ value }) =>
                      (Object.keys(EXPERTISE_OPTIONS) as Array<keyof typeof EXPERTISE_OPTIONS>).map((group) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{t(`mentorOnboarding.expertiseGroup.${group}`)}</SelectLabel>
                          {EXPERTISE_OPTIONS[group]
                            .filter((skill) => !value.includes(skill))
                            .map((skill) => (
                              <SelectItem key={skill} value={skill}>
                                {skill}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      )),
                    (v) => v,
                    "badge-expertise",
                  )}
                  {form.watch("expertise").length === 0 && (
                    <p className="mt-2 text-caption text-muted-foreground" data-testid="text-skills-tip">
                      {t("mentorOnboarding.skillsTip")}
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  {listField(
                    "industries",
                    t("mentorOnboarding.industriesExperience"),
                    t("mentorOnboarding.addIndustries"),
                    "select-industries",
                    ({ value }) =>
                      INDUSTRY_OPTIONS.filter((opt) => !value.includes(opt)).map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      )),
                    (v) => v,
                    "badge-industry",
                  )}
                </div>
                <div className="md:col-span-2">
                  {listField(
                    "languages_spoken",
                    t("mentorOnboarding.languagesSpoken"),
                    t("mentorOnboarding.addLanguages"),
                    "select-languages",
                    ({ value }) =>
                      LANGUAGE_OPTIONS.filter((opt) => !value.includes(opt)).map((lang) => (
                        <SelectItem key={lang} value={lang}>
                          {localizeLanguageName(lang, i18n.language)}
                        </SelectItem>
                      )),
                    (v) => localizeLanguageName(v, i18n.language),
                    "badge-language",
                  )}
                </div>
              </div>
            </section>

            <section aria-labelledby={`${ids}-scheduling`} className="space-y-3">
              {heading(`${ids}-scheduling`, t("mentorOnboarding.availability"))}
              <div className={sectionClass}>
                <FormField
                  control={form.control}
                  name="cal_link"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="input-calcom">{t("mentorOnboarding.calLink")}</FormLabel>
                      <FormControl>
                        <Input {...field} id="input-calcom" dir="ltr" className="text-start md:max-w-sm" autoComplete="off" spellCheck={false} placeholder={t("mentorOnboarding.calPlaceholder")} data-testid="input-calcom" />
                      </FormControl>
                      <FormDescription className="space-y-1">
                        <span className="block">{t("mentorOnboarding.calHelp")}</span>
                        <a href="https://cal.com/signup" target="_blank" rel="noopener noreferrer" className="block font-medium text-secondary underline-offset-4 hover:underline" data-testid="link-setup-cal">
                          {t("mentorOnboarding.calSetupLink")}
                        </a>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="comms_owner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("mentorOnboarding.commsOwner")}</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col gap-2">
                          {(["exec", "assistant"] as const).map((value) => (
                            <FormItem key={value} className="flex items-center gap-3 space-y-0">
                              <FormControl>
                                <RadioGroupItem value={value} data-testid={`radio-${value}`} />
                              </FormControl>
                              <FormLabel className="cursor-pointer font-normal">{value === "exec" ? t("mentorOnboarding.commsExec") : t("mentorOnboarding.commsAssistant")}</FormLabel>
                            </FormItem>
                          ))}
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
                        <FormLabel>{t("mentorOnboarding.assistantEmail")}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} type="email" inputMode="email" autoComplete="off" dir="ltr" className="text-start md:max-w-sm" placeholder={t("mentorOnboarding.assistantEmailPlaceholder")} data-testid="input-assistant-email" />
                        </FormControl>
                        <FormDescription>{t("mentorOnboarding.assistantEmailHelp")}</FormDescription>
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
                      <FormLabel>{t("mentorOnboarding.mentorshipPreference")}</FormLabel>
                      <FormDescription>{t("mentorOnboarding.mentorshipPreferenceHelp")}</FormDescription>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value || "rotating"} className="flex flex-col gap-3 pt-1">
                          {(
                            [
                              ["ongoing", "ongoingMentorship"],
                              ["rotating", "rotatingMentees"],
                              ["either", "eitherMentorship"],
                            ] as const
                          ).map(([value, key]) => (
                            <FormItem key={value} className="flex items-start gap-3 space-y-0">
                              <FormControl>
                                <RadioGroupItem value={value} className="mt-0.5" data-testid={`radio-${value}`} />
                              </FormControl>
                              <FormLabel className="cursor-pointer font-normal">
                                <span className="block font-medium text-foreground">{t(`mentorOnboarding.${key}`)}</span>
                                <span className="block text-caption text-muted-foreground">{t(`mentorOnboarding.${key}Desc`)}</span>
                              </FormLabel>
                            </FormItem>
                          ))}
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
                      <FormLabel>
                        {t("mentorOnboarding.whyJoined")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                      </FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ""} dir="auto" placeholder={t("mentorOnboarding.whyJoinedPlaceholder")} className="min-h-24" data-testid="textarea-why-joined" />
                      </FormControl>
                      <FormDescription>{t("mentorOnboarding.whyJoinedHelp")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <div className="rounded-lg border border-border bg-muted/40 p-4 text-body-sm text-muted-foreground">
              <p className="mb-2">{t("legal.termsAgreement")}</p>
              <p>{t("legal.disclaimer")}</p>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" size="lg" onClick={() => setLocation(ROUTES.home)} data-testid="button-cancel">
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="primary" size="lg" loading={createMentorMutation.isPending} data-testid="button-submit">
                {createMentorMutation.isPending ? t("mentorOnboarding.creating") : t("mentorOnboarding.createProfile")}
              </Button>
            </div>
          </form>
        </Form>

    </OnboardingShell>
  );
}
