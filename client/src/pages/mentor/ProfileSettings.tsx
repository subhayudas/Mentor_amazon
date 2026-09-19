import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Mentor } from "@/lib/database";
import { useLeaveGuard } from "@/lib/leaveGuard";
import { queryClient } from "@/lib/queryClient";
import { localizeCountry, REPORTING_COUNTRIES } from "@/lib/reporting";
import { mentorService } from "@/lib/services";
import { timeZoneChoices, utcOffsetLabel } from "@/lib/timezones";
import { PanelSection } from "@/pages/mentee/shared";
import { BookingsError } from "@/pages/mentee/shared";

interface ProfileSettingsProps {
  mentorId: string;
  mentorEmail: string;
}

const CAL_PATTERN = /^[a-z0-9._-]+\/[a-z0-9_-]+$/i;
const normalizeCalLink = (value: string) => value.trim().replace(/^https?:\/\/(www\.)?cal\.com\//i, "");
const splitList = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Mentor profile settings (P1-25): everything the public card and the
 * request flow depend on is editable here — the Cal.com link (`#calendar`,
 * required before accepting), "Accept new requests" (is_available, with a
 * visible label), time zone and country as stored keys with localized
 * labels — plus the bilingual profile fields. Zod messages come from `t`;
 * unsaved edits are guarded.
 */
export default function ProfileSettings({ mentorId, mentorEmail }: ProfileSettingsProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const mentorQuery = useQuery<Mentor | null>({
    queryKey: ["mentor", "email", mentorEmail],
    queryFn: () => mentorService.getByEmail(mentorEmail),
    enabled: !!mentorEmail,
  });
  const mentor = mentorQuery.data;

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("dashboardV2.mentorProfile.validation.name")),
        name_ar: z.string().optional(),
        position: z.string().optional(),
        position_ar: z.string().optional(),
        company: z.string().optional(),
        company_ar: z.string().optional(),
        bio: z.string().trim().min(1, t("dashboardV2.mentorProfile.validation.bio")),
        bio_ar: z.string().optional(),
        expertise: z.string().trim().min(1, t("dashboardV2.mentorProfile.validation.expertise")),
        expertise_ar: z.string().optional(),
        industries: z.string().trim().min(1, t("dashboardV2.mentorProfile.validation.industries")),
        industries_ar: z.string().optional(),
        country: z.string().optional(),
        timezone: z.string().min(1, t("dashboardV2.mentorProfile.validation.timezone")),
        cal_link: z
          .string()
          .trim()
          .refine((v) => v === "" || CAL_PATTERN.test(normalizeCalLink(v)), { message: t("dashboardV2.mentorProfile.validation.calLink") }),
        mentorship_preference: z.enum(["ongoing", "rotating", "either"]).optional(),
        why_joined: z.string().optional(),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const defaults = useMemo<Values>(
    () => ({
      name: mentor?.name || "",
      name_ar: mentor?.name_ar || "",
      position: mentor?.position || "",
      position_ar: mentor?.position_ar || "",
      company: mentor?.company || "",
      company_ar: mentor?.company_ar || "",
      bio: mentor?.bio || "",
      bio_ar: mentor?.bio_ar || "",
      expertise: mentor?.expertise?.join(", ") || "",
      expertise_ar: mentor?.expertise_ar?.join(", ") || "",
      industries: mentor?.industries?.join(", ") || "",
      industries_ar: mentor?.industries_ar?.join(", ") || "",
      country: mentor?.country || "",
      timezone: mentor?.timezone || "",
      cal_link: mentor?.cal_link || "",
      mentorship_preference: mentor?.mentorship_preference || undefined,
      why_joined: mentor?.why_joined || "",
    }),
    [mentor],
  );

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  // Hydrate from the server row, but never over unsaved edits: the availability
  // switch and the background refetches return a new row object, and resetting
  // on every one of them would wipe what the mentor is typing.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!mentor) return;
    const rowChanged = hydratedFor.current !== mentor.id;
    if (rowChanged || !form.formState.isDirty) {
      form.reset(defaults);
      hydratedFor.current = mentor.id;
    }
  }, [mentor, defaults, form]);

  const dirty = form.formState.isDirty;
  useLeaveGuard(dirty);

  // Land on the calendar section when linked from the inbox (…/profile#calendar).
  useEffect(() => {
    if (!mentor || window.location.hash !== "#calendar") return;
    const frame = window.requestAnimationFrame(() => {
      const section = document.getElementById("calendar");
      section?.scrollIntoView({ block: "start" });
      document.getElementById("input-calcom")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mentor]);

  const save = useMutation({
    mutationFn: (data: Values) =>
      mentorService.update(mentorId, {
        name: data.name.trim(),
        name_ar: data.name_ar?.trim() || undefined,
        position: data.position?.trim() || undefined,
        position_ar: data.position_ar?.trim() || undefined,
        company: data.company?.trim() || undefined,
        company_ar: data.company_ar?.trim() || undefined,
        bio: data.bio.trim(),
        bio_ar: data.bio_ar?.trim() || undefined,
        expertise: splitList(data.expertise),
        expertise_ar: data.expertise_ar ? splitList(data.expertise_ar) : undefined,
        industries: splitList(data.industries),
        industries_ar: data.industries_ar ? splitList(data.industries_ar) : undefined,
        country: data.country || undefined,
        timezone: data.timezone,
        cal_link: data.cal_link ? normalizeCalLink(data.cal_link) : undefined,
        mentorship_preference: data.mentorship_preference || undefined,
        why_joined: data.why_joined?.trim() || undefined,
      }),
    onSuccess: (_row, data) => {
      queryClient.invalidateQueries({ queryKey: ["mentor", "email", mentorEmail] });
      queryClient.invalidateQueries({ queryKey: ["mentor", "own"] });
      queryClient.invalidateQueries({ queryKey: ["mentors"] });
      form.reset(data);
      toast({ title: t("dashboardV2.mentorProfile.saved") });
    },
    onError: () => toast({ title: t("common.error"), description: t("dashboardV2.mentorProfile.saveError"), variant: "destructive" }),
  });

  const zones = useMemo(() => timeZoneChoices(mentor?.timezone), [mentor?.timezone]);
  const timezone = form.watch("timezone");

  // "Accept new requests" applies immediately (a switch, not a form field):
  // the same behaviour the old /mentor-dashboard toggle had, with the same
  // cache invalidations so the public directory and the portal header agree.
  const toggleAvailability = useMutation({
    mutationFn: (next: boolean) => mentorService.toggleAvailability(mentorId, next),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["mentor", "email", mentorEmail] });
      queryClient.invalidateQueries({ queryKey: ["mentor", "own"] });
      queryClient.invalidateQueries({ queryKey: ["mentors"] });
      toast({ title: row?.is_available ? t("dashboardV2.mentorProfile.acceptingOn") : t("dashboardV2.mentorProfile.acceptingOff") });
    },
    onError: () => toast({ title: t("common.error"), description: t("dashboardV2.mentorProfile.availabilityError"), variant: "destructive" }),
  });
  const accepting = toggleAvailability.isPending && toggleAvailability.variables !== undefined ? toggleAvailability.variables : (mentor?.is_available ?? true);

  if (mentorQuery.isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }
  if (mentorQuery.isError || !mentor) return <BookingsError onRetry={() => mentorQuery.refetch()} />;

  const textField = (name: keyof Values, label: string, opts: { rtl?: boolean; textarea?: boolean; hint?: string; testId: string; autoComplete?: string }) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {opts.textarea ? (
              <Textarea {...field} value={(field.value as string) ?? ""} rows={4} dir={opts.rtl ? "rtl" : "auto"} data-testid={opts.testId} />
            ) : (
              <Input {...field} value={(field.value as string) ?? ""} dir={opts.rtl ? "rtl" : "auto"} autoComplete={opts.autoComplete} data-testid={opts.testId} />
            )}
          </FormControl>
          {opts.hint && <FormDescription>{opts.hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-8" noValidate>
        <PanelSection id="calendar" title={t("dashboardV2.mentorProfile.requests")}>
          <div className="scroll-mt-32 space-y-5 rounded-lg border border-border bg-card p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="switch-availability" className="text-body-sm font-medium text-foreground">
                  {t("dashboardV2.mentorProfile.acceptRequests")}
                </Label>
                <p id="switch-availability-hint" className="text-body-sm text-muted-foreground text-pretty">
                  {accepting ? t("dashboardV2.mentorProfile.acceptingHint") : t("dashboardV2.mentorProfile.notAcceptingHint")}
                </p>
              </div>
              <Switch
                id="switch-availability"
                checked={accepting}
                onCheckedChange={(next) => toggleAvailability.mutate(next)}
                disabled={toggleAvailability.isPending}
                aria-busy={toggleAvailability.isPending || undefined}
                aria-describedby="switch-availability-hint"
                data-testid="switch-availability"
              />
            </div>
            <FormField
              control={form.control}
              name="cal_link"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="input-calcom">{t("dashboardV2.mentorProfile.calLink")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      id="input-calcom"
                      dir="ltr"
                      className="text-start"
                      placeholder="username/30min"
                      autoComplete="off"
                      spellCheck={false}
                      data-testid="input-calcom"
                    />
                  </FormControl>
                  <FormDescription>{t("dashboardV2.mentorProfile.calLinkHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboardV2.mentorProfile.timezone")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-mentor-timezone">
                          <SelectValue placeholder={t("dashboardV2.profile.timezonePlaceholder")} />
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
                    <FormDescription>
                      {timezone ? t("dashboardV2.mentorProfile.timezoneHint", { offset: utcOffsetLabel(timezone) }) : t("dashboardV2.profile.timezoneHintEmpty")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboardV2.profile.country")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-mentor-country">
                          <SelectValue placeholder={t("dashboardV2.profile.countryPlaceholder")} />
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
            </div>
          </div>
        </PanelSection>

        <PanelSection id="profile-identity" title={t("dashboardV2.mentorProfile.identity")}>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2 md:p-6">
            {textField("name", t("profileSettings.name"), { testId: "input-name", autoComplete: "name" })}
            {textField("name_ar", t("profileSettings.nameAr"), { rtl: true, testId: "input-name-ar" })}
            {textField("position", t("profileSettings.position"), { testId: "input-position", autoComplete: "organization-title" })}
            {textField("position_ar", t("profileSettings.positionAr"), { rtl: true, testId: "input-position-ar" })}
            {textField("company", t("profileSettings.company"), { testId: "input-company", autoComplete: "organization" })}
            {textField("company_ar", t("profileSettings.companyAr"), { rtl: true, testId: "input-company-ar" })}
            {textField("bio", t("profileSettings.bio"), { textarea: true, hint: t("profileSettings.bioHint"), testId: "input-bio" })}
            {textField("bio_ar", t("profileSettings.bioAr"), { textarea: true, rtl: true, testId: "input-bio-ar" })}
          </div>
        </PanelSection>

        <PanelSection id="profile-expertise" title={t("profileSettings.expertiseAndIndustries")}>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2 md:p-6">
            {textField("expertise", t("profileSettings.expertise"), { hint: t("profileSettings.commaSeparated"), testId: "input-expertise" })}
            {textField("expertise_ar", t("profileSettings.expertiseAr"), { rtl: true, hint: t("profileSettings.commaSeparated"), testId: "input-expertise-ar" })}
            {textField("industries", t("profileSettings.industries"), { hint: t("profileSettings.commaSeparated"), testId: "input-industries" })}
            {textField("industries_ar", t("profileSettings.industriesAr"), { rtl: true, hint: t("profileSettings.commaSeparated"), testId: "input-industries-ar" })}
          </div>
        </PanelSection>

        <PanelSection id="profile-preferences" title={t("profileSettings.preferences")}>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:p-6">
            <FormField
              control={form.control}
              name="mentorship_preference"
              render={({ field }) => (
                <FormItem className="md:max-w-sm">
                  <FormLabel>{t("profileSettings.mentorshipPreference")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-mentorship-preference">
                        <SelectValue placeholder={t("profileSettings.selectPreference")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ongoing">{t("profileSettings.ongoing")}</SelectItem>
                      <SelectItem value="rotating">{t("profileSettings.rotating")}</SelectItem>
                      <SelectItem value="either">{t("profileSettings.either")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {textField("why_joined", t("profileSettings.whyJoined"), { textarea: true, hint: t("profileSettings.whyJoinedHint"), testId: "input-why-joined" })}
          </div>
        </PanelSection>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" loading={save.isPending} data-testid="button-save-profile">
            {t("common.save")}
          </Button>
          {dirty && !save.isPending && (
            <span className="text-caption text-muted-foreground" role="status">
              {t("dashboardV2.profile.unsaved")}
            </span>
          )}
        </div>
      </form>
    </Form>
  );
}
