import { useEffect, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Mentee } from "@/lib/database";
import { useLeaveGuard } from "@/lib/leaveGuard";
import { queryClient } from "@/lib/queryClient";
import { localizeCountry, REPORTING_COUNTRIES } from "@/lib/format";
import { menteeService } from "@/lib/services";
import { timeZoneChoices, utcOffsetLabel } from "@/lib/timezones";
import { PanelSection } from "@/pages/mentee/shared";

/**
 * Mentee profile settings: zod messages built with `t`, IANA zones and the
 * reporting country list as stored keys with localized labels, an
 * unsaved-changes guard, and the verification rule the raw update skipped —
 * switching to an organisation queues the row for review, switching back
 * clears it.
 */
export default function Profile({ mentee }: { mentee: Mentee }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("dashboardV2.profile.validation.name")),
        country: z.string().optional(),
        timezone: z.string().min(1, t("dashboardV2.profile.validation.timezone")),
        user_type: z.enum(["individual", "organization"]),
        organization_name: z.string().optional(),
      }).refine((data) => data.user_type !== "organization" || !!data.organization_name?.trim(), {
        message: t("dashboardV2.profile.validation.organizationName"),
        path: ["organization_name"],
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const defaults = useMemo<Values>(
    () => ({
      name: mentee.name || "",
      country: mentee.country || "",
      timezone: mentee.timezone || "",
      user_type: mentee.user_type || "individual",
      organization_name: mentee.organization_name || "",
    }),
    [mentee],
  );

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  // Hydrate from the server row, but never over unsaved edits: the 60 s
  // mentee poll returns a new row object and resetting on each one would
  // wipe what the mentee is typing.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    const rowChanged = hydratedFor.current !== mentee.id;
    if (rowChanged || !form.formState.isDirty) {
      form.reset(defaults);
      hydratedFor.current = mentee.id;
    }
  }, [mentee.id, defaults, form]);

  const dirty = form.formState.isDirty;
  useLeaveGuard(dirty);

  const save = useMutation({
    mutationFn: async (data: Values) => {
      const becameOrganization = data.user_type === "organization" && mentee.user_type !== "organization";
      const becameIndividual = data.user_type === "individual" && mentee.user_type !== "individual";
      return menteeService.update(mentee.id, {
        name: data.name.trim(),
        country: data.country || undefined,
        timezone: data.timezone,
        user_type: data.user_type,
        organization_name: data.user_type === "organization" ? data.organization_name?.trim() : undefined,
        ...(becameOrganization ? { verification_status: "pending" as const } : {}),
        ...(becameIndividual ? { verification_status: "unverified" as const } : {}),
      });
    },
    onSuccess: (row, data) => {
      queryClient.invalidateQueries({ queryKey: ["mentee", "email"] });
      form.reset(data);
      toast({ title: t("dashboardV2.profile.saved") });
      if (row?.name) localStorage.setItem("menteeName", row.name);
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("dashboardV2.profile.saveError"), variant: "destructive" });
    },
  });

  const userType = form.watch("user_type");
  const timezone = form.watch("timezone");
  const zones = useMemo(() => timeZoneChoices(mentee.timezone), [mentee.timezone]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-8" noValidate>
        <PanelSection id="profile-personal" title={t("dashboardV2.profile.personal")}>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2 md:p-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dashboardV2.profile.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} dir="auto" autoComplete="name" data-testid="input-mentee-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <Label htmlFor="mentee-email">{t("dashboardV2.profile.email")}</Label>
              <Input
                id="mentee-email"
                value={mentee.email}
                readOnly
                dir="ltr"
                className="text-start"
                aria-describedby="mentee-email-hint"
                data-testid="input-mentee-email-readonly"
              />
              <p id="mentee-email-hint" className="text-caption text-muted-foreground">
                {t("dashboardV2.profile.emailHint")}
              </p>
            </div>
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dashboardV2.profile.timezone")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-mentee-timezone">
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
                    {timezone ? t("dashboardV2.profile.timezoneHint", { offset: utcOffsetLabel(timezone) }) : t("dashboardV2.profile.timezoneHintEmpty")}
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
                      <SelectTrigger data-testid="select-mentee-country">
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
        </PanelSection>

        <PanelSection id="profile-account" title={t("dashboardV2.profile.account")}>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2 md:p-6">
            <FormField
              control={form.control}
              name="user_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dashboardV2.profile.accountType")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-mentee-user-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="individual">{t("dashboardV2.profile.individual")}</SelectItem>
                      <SelectItem value="organization">{t("dashboardV2.profile.organization")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>{t("dashboardV2.profile.accountTypeHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {userType === "organization" && (
              <FormField
                control={form.control}
                name="organization_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboardV2.profile.organizationName")}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} dir="auto" autoComplete="organization" data-testid="input-mentee-organization" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        </PanelSection>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" loading={save.isPending} data-testid="button-save-mentee-profile">
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
