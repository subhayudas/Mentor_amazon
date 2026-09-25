import * as React from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { CalSyncPanel } from "@/components/cal/CalSyncPanel";
import { DashboardHeader, DashboardShell, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/activity";
import { isValidCalLink, normalizeCalLink } from "@/lib/calLink";
import type { Mentee, Mentor } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { getLocalSession, setLocalSession } from "@/lib/localAuth";
import { localStore } from "@/lib/localStore";
import { ROUTES } from "@/lib/routes";
import { menteeService, mentorService, uploadService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { useOwnProfile } from "@/pages/dashboard/data";
import { DashboardError, DashboardLoading, ProfileNeededCard } from "@/pages/dashboard/states";

/**
 * Profile settings `/dashboard/profile` (design C7, F12).
 *
 * Database mode: loads the signed-in mentor's `mentors` row (or the mentee's
 * `mentees` row) with loading and error states and saves through
 * `mentorService.update` / `menteeService.update` — the patch never touches
 * ratings or verification. The Cal.com link is validated and normalised
 * (`''` clears it); a photo is checked (5 MB, JPEG/PNG/WebP/GIF) and uploaded
 * to storage before the row is saved. Mentors get the Cal.com sync panel
 * below the form. Without a profile row: "Finish your profile" (mentor) or
 * "Complete your registration" (mentee). Admins are sent to /admin (shell).
 *
 * Local (demo) mode edits this browser's rows as before.
 */
const input = "mt-1 h-11 w-full rounded-[6px] border border-[#d9d9d9] bg-white px-3 text-[14px] text-[var(--sc-ink)] aria-[invalid=true]:border-destructive";
const area = "mt-1 w-full rounded-[6px] border border-[#d9d9d9] bg-white px-3 py-2 text-[14px] text-[var(--sc-ink)] aria-[invalid=true]:border-destructive";
const label = "block text-[14px] font-semibold text-[var(--sc-ink)]";

/** Upload limits of the `uploads` bucket (migration 0002 §12). */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

function Field({ id, title, hint, error, children }: { id: string; title: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[12px] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-[12px] text-[#6c6c84]">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const list = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

interface MentorForm {
  name: string;
  position: string;
  company: string;
  country: string;
  bio: string;
  expertise: string;
  industries: string;
  languages: string;
  cal_link: string;
  linkedin_url: string;
  photo_url: string;
  is_available: boolean;
}

interface MenteeForm {
  name: string;
  organization_name: string;
  country: string;
  bio: string;
  goals: string;
  linkedin_url: string;
}

function mentorForm(m: Partial<Mentor> | null | undefined): MentorForm {
  return {
    name: m?.name ?? "",
    position: m?.position ?? "",
    company: m?.company ?? "",
    country: m?.country ?? "",
    bio: m?.bio ?? "",
    expertise: (m?.expertise ?? []).join(", "),
    industries: (m?.industries ?? []).join(", "),
    languages: (m?.languages_spoken ?? []).join(", "),
    cal_link: m?.cal_link ?? "",
    linkedin_url: m?.linkedin_url ?? "",
    photo_url: m?.photo_url ?? "",
    is_available: m?.is_available ?? true,
  };
}

function menteeForm(m: Partial<Mentee> | null | undefined): MenteeForm {
  return {
    name: m?.name ?? "",
    organization_name: m?.organization_name ?? "",
    country: m?.country ?? "",
    bio: m?.bio ?? "",
    goals: m?.goals ?? "",
    linkedin_url: m?.linkedin_url ?? "",
  };
}

export default function DashboardProfile() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { role, signedIn } = useDashboardIdentity();
  const own = useOwnProfile();
  const mentor = role === "mentor" ? own.mentor : null;
  const mentee = role === "mentee" ? own.mentee : null;

  const body = () => {
    if (!signedIn) return <NoAccountCard />;
    if (!IS_LOCAL) {
      if (own.isError) return <DashboardError message={t("showcase.profileSettings.loadError")} onRetry={own.refetch} />;
      if (own.isLoading) return <DashboardLoading rows={4} />;
    }
    if (role === "mentor") return mentor ? <MentorProfileForm key={mentor.id} mentor={mentor} userId={user?.id ?? ""} /> : IS_LOCAL ? <NoAccountCard /> : <ProfileNeededCard role="mentor" />;
    if (role === "mentee") return mentee ? <MenteeProfileForm key={mentee.id} mentee={mentee} /> : IS_LOCAL ? <NoAccountCard /> : <ProfileNeededCard role="mentee" />;
    return <NoAccountCard />;
  };

  return (
    <DashboardShell active="profile">
      <DashboardHeader
        title={t("showcase.analytics.nav.profileSettings")}
        trailing={
          mentor ? (
            <Link href={ROUTES.mentor(mentor.id)} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d9d9d9] px-4 text-[14px] font-semibold text-[var(--sc-ink)] hover:border-[var(--sc-ink)] md:h-10" data-testid="link-view-public">
              {t("showcase.profileSettings.viewPublic")}
              <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      <div className="px-4 py-6 sm:px-8 lg:px-12">{body()}</div>
    </DashboardShell>
  );
}

/** Local showcase without an account (or a local account without a row): how to get one. */
function NoAccountCard() {
  const { t } = useTranslation();
  return (
    <div className="max-w-[560px] rounded-[12px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-6">
      <p className="text-[16px] font-semibold text-[var(--sc-ink)]">{t("showcase.profileSettings.noAccountTitle")}</p>
      <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.profileSettings.noAccountBody")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={ROUTES.mentorOnboarding} className="inline-flex h-10 items-center rounded-[8px] bg-[var(--sc-ink)] px-4 text-[14px] font-semibold text-white hover:bg-black">
          {t("nav.becomeMentor")}
        </Link>
        <Link href={ROUTES.menteeRegistration} className="inline-flex h-10 items-center rounded-[8px] border border-[#d9d9d9] px-4 text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]">
          {t("showcase.footer.joinAsMentee")}
        </Link>
        <Link href={ROUTES.login} className="inline-flex h-10 items-center rounded-[8px] px-4 text-[14px] font-semibold text-[var(--sc-ink)] underline underline-offset-4">
          {t("nav.signIn")}
        </Link>
      </div>
    </div>
  );
}

function useSavedFlash() {
  const { t } = useTranslation();
  const [saved, setSaved] = React.useState(false);
  const flash = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
    toast.success(t("showcase.profileSettings.saved"));
  };
  return { saved, flash };
}

function SaveButton({ saved, pending }: { saved: boolean; pending: boolean }) {
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black disabled:opacity-70"
      data-testid="button-save-profile"
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : saved ? <Check className="size-4" aria-hidden="true" /> : null}
      {saved ? t("showcase.calendar.saved") : t("showcase.calendar.save")}
    </button>
  );
}

function useInvalidateProfile() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([["dashboard"], ["mentors"], ["mentor"], ["mentee", "email"], ["activity"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

function MentorProfileForm({ mentor, userId }: { mentor: Mentor; userId: string }) {
  const { t, i18n } = useTranslation();
  const ids = React.useId();
  const { saved, flash } = useSavedFlash();
  const invalidate = useInvalidateProfile();
  const [form, setForm] = React.useState<MentorForm>(() => mentorForm(mentor));
  const [errors, setErrors] = React.useState<Partial<Record<keyof MentorForm, string>>>({});
  const [uploading, setUploading] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  // An uploaded photo lives only in the form until Save writes the profile row: say so.
  const [photoPending, setPhotoPending] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // The form as it was submitted: a finished save only adopts the saved row (e.g. the
  // normalised Cal link) when nothing was edited meanwhile, so no typing is lost.
  const submitted = React.useRef<MentorForm | null>(null);

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setPhotoError(t("showcase.profileSettings.photoType"));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(t("mentorOnboarding.imageTooLarge"));
      return;
    }
    if (IS_LOCAL) {
      // Local demo: keep the image in this browser only.
      const reader = new FileReader();
      reader.onload = () => {
        setForm((f) => ({ ...f, photo_url: String(reader.result ?? "") }));
        setPhotoPending(true);
      };
      reader.readAsDataURL(file);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadService.uploadProfileImage(file, userId);
      setForm((f) => ({ ...f, photo_url: url }));
      setPhotoPending(true);
    } catch {
      setPhotoError(t("mentorOnboarding.photoUploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const validate = (): Partial<Mentor> | null => {
    const next: Partial<Record<keyof MentorForm, string>> = {};
    if (!form.name.trim()) next.name = t("mentorOnboarding.validation.name");
    if (!form.bio.trim()) next.bio = t("mentorOnboarding.validation.bio");
    const cal = normalizeCalLink(form.cal_link);
    if (cal !== "" && !isValidCalLink(cal)) next.cal_link = t("mentorOnboarding.validation.calLink");
    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    // Only the columns this page owns: never ratings, never verification, never availability rows.
    return {
      name: form.name.trim(),
      position: form.position.trim(),
      company: form.company.trim(),
      country: form.country.trim(),
      bio: form.bio.trim(),
      expertise: list(form.expertise),
      industries: list(form.industries),
      languages_spoken: list(form.languages),
      cal_link: cal,
      linkedin_url: form.linkedin_url.trim(),
      photo_url: form.photo_url.trim(),
      is_available: form.is_available,
    };
  };

  const save = useMutation({
    mutationFn: async (patch: Partial<Mentor>) => {
      if (IS_LOCAL) {
        const row = localStore.update("mentors", mentor.id, { ...patch, updated_at: new Date().toISOString() });
        if (!row) throw new Error("profile_not_updated");
        const session = getLocalSession();
        if (session) setLocalSession({ ...session, name: patch.name });
        return row as Mentor;
      }
      const row = await mentorService.update(mentor.id, patch);
      if (!row) throw new Error("profile_not_updated");
      return row;
    },
    onSuccess: async (row) => {
      setSaveError(null);
      if (row.photo_url === submitted.current?.photo_url) setPhotoPending(false);
      setForm((current) => (current === submitted.current ? mentorForm(row) : current));
      await invalidate();
      // Rendered by type in the reader's language; `summary` is only the English fallback (R1-74).
      logActivity({ actor_type: "mentor", actor_id: mentor.id, actor_name: row.name, type: "profile_updated", subject_type: "mentor", subject_id: mentor.id, summary: i18n.getFixedT("en")("showcase.activity.summaries.profileUpdated", { name: row.name }), meta: { source: "client", name: row.name } });
      flash();
    },
    onError: () => setSaveError(t("showcase.profileSettings.saveError")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const patch = validate();
    if (!patch) return;
    submitted.current = form;
    save.mutate(patch);
  };

  const invalid = (key: keyof MentorForm) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `${ids}-${key}-error` } : {});

  return (
    <div className="grid max-w-[760px] grid-cols-1 gap-10">
      <form onSubmit={submit} className="grid grid-cols-1 gap-5" noValidate data-testid="form-mentor-profile">
        {saveError && (
          <p role="alert" className="rounded-[8px] border border-destructive/30 bg-destructive-soft px-4 py-3 text-[14px] font-medium text-destructive" data-testid="profile-save-error">
            {saveError}
          </p>
        )}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id={`${ids}-name`} title={t("mentorOnboarding.fullName")} error={errors.name}>
            <input id={`${ids}-name`} className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="auto" autoComplete="name" {...invalid("name")} data-testid="input-profile-name" />
          </Field>
          <div>
            <p className={label} id={`${ids}-photo-label`}>
              {t("mentorOnboarding.profilePhoto")}
            </p>
            <div className="mt-1 flex items-center gap-3">
              {form.photo_url ? (
                <img src={form.photo_url} alt="" className="size-14 rounded-full object-cover" data-testid="img-profile-photo" />
              ) : (
                <span className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--sc-grey)] text-[18px] font-bold text-[var(--sc-ink-soft)]" aria-hidden="true">
                  {form.name.slice(0, 1)}
                </span>
              )}
              <input id={`${ids}-photo`} type="file" accept={PHOTO_TYPES.join(",")} className="sr-only" onChange={(e) => void onPhoto(e)} aria-labelledby={`${ids}-photo-label`} data-testid="input-profile-photo" />
              <label
                htmlFor={`${ids}-photo`}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-[6px] border border-[#d9d9d9] px-3 text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)] md:h-10",
                  uploading && "pointer-events-none opacity-70",
                )}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
                {uploading ? t("mentorOnboarding.uploading") : t("mentorOnboarding.uploadPhoto")}
              </label>
            </div>
            <p className={cn("mt-1 text-[12px]", photoError ? "font-medium text-destructive" : "text-[#6c6c84]")} role={photoError ? "alert" : undefined} aria-live="polite" data-testid="text-photo-status">
              {photoError ?? (photoPending ? t("showcase.profileSettings.photoPending") : t("showcase.profileSettings.photoHintLive"))}
            </p>
          </div>
          <Field id={`${ids}-position`} title={t("mentorOnboarding.position")}>
            <input id={`${ids}-position`} className={input} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} dir="auto" />
          </Field>
          <Field id={`${ids}-company`} title={t("mentorOnboarding.company")}>
            <input id={`${ids}-company`} className={input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} dir="auto" />
          </Field>
        </div>
        <Field id={`${ids}-bio`} title={t("mentorOnboarding.bio")} error={errors.bio}>
          <textarea id={`${ids}-bio`} rows={5} className={area} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} dir="auto" {...invalid("bio")} data-testid="input-profile-bio" />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id={`${ids}-expertise`} title={t("mentorOnboarding.expertise")} hint={t("showcase.profileSettings.commaHint")}>
            <input id={`${ids}-expertise`} className={input} value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} dir="auto" aria-describedby={`${ids}-expertise-hint`} />
          </Field>
          <Field id={`${ids}-industries`} title={t("mentorOnboarding.industriesExperience")} hint={t("showcase.profileSettings.commaHint")}>
            <input id={`${ids}-industries`} className={input} value={form.industries} onChange={(e) => setForm({ ...form, industries: e.target.value })} dir="auto" aria-describedby={`${ids}-industries-hint`} />
          </Field>
          <Field id={`${ids}-languages`} title={t("mentorOnboarding.languagesSpoken")} hint={t("showcase.profileSettings.commaHint")}>
            <input id={`${ids}-languages`} className={input} value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} dir="auto" aria-describedby={`${ids}-languages-hint`} />
          </Field>
          <Field id={`${ids}-country`} title={t("mentorOnboarding.country")}>
            <input id={`${ids}-country`} className={input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} dir="auto" />
          </Field>
          <Field id={`${ids}-cal_link`} title={t("showcase.profileSettings.calLink")} hint={t("showcase.profileSettings.calHintLive")} error={errors.cal_link}>
            <input
              id={`${ids}-cal_link`}
              className={cn(input, "text-start")}
              value={form.cal_link}
              onChange={(e) => setForm({ ...form, cal_link: e.target.value })}
              dir="ltr"
              spellCheck={false}
              autoComplete="off"
              placeholder="cal.com/yourname/30min"
              {...(errors.cal_link ? invalid("cal_link") : { "aria-describedby": `${ids}-cal_link-hint` })}
              data-testid="input-profile-cal"
            />
          </Field>
          <Field id={`${ids}-linkedin`} title={t("mentorOnboarding.linkedinUrl")}>
            <input id={`${ids}-linkedin`} className={cn(input, "text-start")} value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} dir="ltr" inputMode="url" />
          </Field>
        </div>
        <label className="inline-flex min-h-11 items-center gap-3 text-[14px] font-semibold text-[var(--sc-ink)]">
          <input type="checkbox" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} className="size-4 accent-[var(--sc-ink)]" data-testid="checkbox-profile-available" />
          {t("mentorCard.accepting")}
        </label>
        <div>
          <SaveButton saved={saved} pending={save.isPending || uploading} />
        </div>
      </form>
      {/* The panel is its own labelled region with id="cal-sync" (the calendar page links to it);
          a wrapper here duplicated both the id and the landmark. Its title follows the page's h1. */}
      {!IS_LOCAL && <CalSyncPanel mentorId={mentor.id} calLink={mentor.cal_link ?? ""} headingLevel="h2" />}
    </div>
  );
}

function MenteeProfileForm({ mentee }: { mentee: Mentee }) {
  const { t, i18n } = useTranslation();
  const ids = React.useId();
  const { saved, flash } = useSavedFlash();
  const invalidate = useInvalidateProfile();
  const [form, setForm] = React.useState<MenteeForm>(() => menteeForm(mentee));
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const submitted = React.useRef<MenteeForm | null>(null);

  const save = useMutation({
    mutationFn: async (patch: Partial<Mentee>) => {
      if (IS_LOCAL) {
        const row = localStore.update("mentees", mentee.id, patch);
        if (!row) throw new Error("profile_not_updated");
        const session = getLocalSession();
        if (session) setLocalSession({ ...session, name: patch.name });
        return row as Mentee;
      }
      const row = await menteeService.update(mentee.id, patch);
      if (!row) throw new Error("profile_not_updated");
      return row;
    },
    onSuccess: async (row) => {
      setSaveError(null);
      setForm((current) => (current === submitted.current ? menteeForm(row) : current));
      await invalidate();
      // Rendered by type in the reader's language; `summary` is only the English fallback (R1-74).
      logActivity({ actor_type: "mentee", actor_id: mentee.id, actor_name: row.name, type: "profile_updated", subject_type: "mentee", subject_id: mentee.id, summary: i18n.getFixedT("en")("showcase.activity.summaries.profileUpdated", { name: row.name }), meta: { source: "client", name: row.name } });
      flash();
    },
    onError: () => setSaveError(t("showcase.profileSettings.saveError")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (!form.name.trim()) {
      setNameError(t("mentorOnboarding.validation.name"));
      return;
    }
    setNameError(null);
    submitted.current = form;
    // Never verification_status, never user_type: those belong to the registration and the programme team.
    save.mutate({
      name: form.name.trim(),
      organization_name: form.organization_name.trim(),
      country: form.country.trim(),
      bio: form.bio.trim(),
      goals: form.goals.trim(),
      linkedin_url: form.linkedin_url.trim(),
    });
  };

  return (
    <form onSubmit={submit} className="grid max-w-[760px] grid-cols-1 gap-5" noValidate data-testid="form-mentee-profile">
      {saveError && (
        <p role="alert" className="rounded-[8px] border border-destructive/30 bg-destructive-soft px-4 py-3 text-[14px] font-medium text-destructive" data-testid="profile-save-error">
          {saveError}
        </p>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id={`${ids}-ename`} title={t("mentorOnboarding.fullName")} error={nameError}>
          <input
            id={`${ids}-ename`}
            className={input}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            dir="auto"
            autoComplete="name"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${ids}-ename-error` : undefined}
            data-testid="input-profile-name"
          />
        </Field>
        {mentee.user_type === "organization" && (
          <Field id={`${ids}-org`} title={t("showcase.profileSettings.organisation")}>
            <input id={`${ids}-org`} className={input} value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} dir="auto" />
          </Field>
        )}
        <Field id={`${ids}-ecountry`} title={t("mentorOnboarding.country")}>
          <input id={`${ids}-ecountry`} className={input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} dir="auto" />
        </Field>
        <Field id={`${ids}-elinkedin`} title={t("mentorOnboarding.linkedinUrl")}>
          <input id={`${ids}-elinkedin`} className={cn(input, "text-start")} value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} dir="ltr" inputMode="url" />
        </Field>
      </div>
      <Field id={`${ids}-ebio`} title={t("mentorOnboarding.bio")}>
        <textarea id={`${ids}-ebio`} rows={4} className={area} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} dir="auto" />
      </Field>
      <Field id={`${ids}-goals`} title={t("showcase.profileSettings.goals")}>
        <textarea id={`${ids}-goals`} rows={3} className={area} value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} dir="auto" data-testid="input-profile-goals" />
      </Field>
      <div>
        <SaveButton saved={saved} pending={save.isPending} />
      </div>
    </form>
  );
}
