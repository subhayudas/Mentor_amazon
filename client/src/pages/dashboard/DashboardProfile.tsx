import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";

import { DashboardHeader, DashboardShell, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import type { Mentee, Mentor } from "@/lib/database";
import { getLocalSession, setLocalSession } from "@/lib/localAuth";
import { localStore, useLocalCollection } from "@/lib/localStore";
import { queryClient } from "@/lib/queryClient";
import { ROUTES } from "@/lib/routes";

/**
 * Profile settings `/dashboard/profile`: the signed-in mentor or mentee
 * edits what their public page / registration shows. Saves go to the same
 * row the onboarding form created (local store now, database once Supabase
 * is configured) and are visible on the profile immediately.
 */
const input = "mt-1 h-11 w-full rounded-[6px] border border-[#d9d9d9] bg-white px-3 text-[14px] text-[var(--sc-ink)]";
const area = "mt-1 w-full rounded-[6px] border border-[#d9d9d9] bg-white px-3 py-2 text-[14px] text-[var(--sc-ink)]";
const label = "block text-[14px] font-semibold text-[var(--sc-ink)]";

function Field({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
      </label>
      {children}
      {hint && <p className="mt-1 text-[12px] text-[#6c6c84]">{hint}</p>}
    </div>
  );
}

const list = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export default function DashboardProfile() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { role, signedIn } = useDashboardIdentity();
  const mentors = useLocalCollection("mentors");
  const mentees = useLocalCollection("mentees");
  const mentor = role === "mentor" ? mentors.find((m) => m.id === user?.profile_id) : undefined;
  const mentee = role === "mentee" ? mentees.find((m) => m.id === user?.profile_id) : undefined;
  const ids = React.useId();
  const [saved, setSaved] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMForm((f) => ({ ...f, photo_url: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  };

  const [mForm, setMForm] = React.useState(() => ({
    name: mentor?.name ?? "",
    position: mentor?.position ?? "",
    company: mentor?.company ?? "",
    country: mentor?.country ?? "",
    bio: mentor?.bio ?? "",
    expertise: (mentor?.expertise ?? []).join(", "),
    industries: (mentor?.industries ?? []).join(", "),
    languages: (mentor?.languages_spoken ?? []).join(", "),
    cal_link: mentor?.cal_link ?? "",
    linkedin_url: mentor?.linkedin_url ?? "",
    photo_url: mentor?.photo_url ?? "",
    is_available: mentor?.is_available ?? true,
  }));
  const [eForm, setEForm] = React.useState(() => ({
    name: mentee?.name ?? "",
    organization_name: mentee?.organization_name ?? "",
    country: mentee?.country ?? "",
    bio: mentee?.bio ?? "",
    goals: mentee?.goals ?? "",
    linkedin_url: mentee?.linkedin_url ?? "",
  }));

  const flash = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
    toast.success(t("showcase.profileSettings.saved"));
  };

  const saveMentor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mentor) return;
    const patch: Partial<Mentor> = {
      name: mForm.name.trim() || mentor.name,
      position: mForm.position.trim() || undefined,
      company: mForm.company.trim() || undefined,
      country: mForm.country.trim() || undefined,
      bio: mForm.bio.trim(),
      expertise: list(mForm.expertise),
      industries: list(mForm.industries),
      languages_spoken: list(mForm.languages),
      cal_link: mForm.cal_link.trim() || undefined,
      linkedin_url: mForm.linkedin_url.trim() || undefined,
      photo_url: mForm.photo_url.trim() || undefined,
      is_available: mForm.is_available,
      updated_at: new Date().toISOString(),
    };
    localStore.update("mentors", mentor.id, patch);
    const session = getLocalSession();
    if (session) setLocalSession({ ...session, name: patch.name });
    queryClient.invalidateQueries({ queryKey: ["mentors"] });
    flash();
  };

  const saveMentee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mentee) return;
    const patch: Partial<Mentee> = {
      name: eForm.name.trim() || mentee.name,
      organization_name: eForm.organization_name.trim() || undefined,
      country: eForm.country.trim() || undefined,
      bio: eForm.bio.trim() || undefined,
      goals: eForm.goals.trim() || undefined,
      linkedin_url: eForm.linkedin_url.trim() || undefined,
    };
    localStore.update("mentees", mentee.id, patch);
    const session = getLocalSession();
    if (session) setLocalSession({ ...session, name: patch.name });
    flash();
  };

  const saveButton = (
    <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black" data-testid="button-save-profile">
      {saved && <Check className="size-4" aria-hidden="true" />}
      {saved ? t("showcase.calendar.saved") : t("showcase.calendar.save")}
    </button>
  );

  return (
    <DashboardShell active="profile">
      <DashboardHeader
        title={t("showcase.analytics.nav.profileSettings")}
        trailing={
          mentor ? (
            <Link href={ROUTES.mentor(mentor.id)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9d9d9] px-4 text-[14px] font-semibold text-[var(--sc-ink)] hover:border-[var(--sc-ink)]">
              {t("showcase.profileSettings.viewPublic")}
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      <div className="px-4 py-6 sm:px-8 lg:px-12">
        {!signedIn || (!mentor && !mentee) ? (
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
        ) : mentor ? (
          <form onSubmit={saveMentor} className="grid max-w-[760px] gap-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${ids}-name`} title={t("mentorOnboarding.fullName")}>
                <input id={`${ids}-name`} className={input} value={mForm.name} onChange={(e) => setMForm({ ...mForm, name: e.target.value })} />
              </Field>
              <div>
                <p className={label}>{t("mentorOnboarding.profilePhoto")}</p>
                <div className="mt-1 flex items-center gap-3">
                  {mForm.photo_url ? (
                    <img src={mForm.photo_url} alt="" className="size-14 rounded-full object-cover" />
                  ) : (
                    <span className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--sc-grey)] text-[18px] font-bold text-[var(--sc-ink-soft)]" aria-hidden="true">
                      {mForm.name.slice(0, 1)}
                    </span>
                  )}
                  <input ref={fileRef} id={`${ids}-photo`} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPhoto} />
                  <label htmlFor={`${ids}-photo`} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[6px] border border-[#d9d9d9] px-3 text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]">
                    <Upload className="size-4" aria-hidden="true" />
                    {t("mentorOnboarding.uploadPhoto")}
                  </label>
                </div>
              </div>
              <Field id={`${ids}-position`} title={t("mentorOnboarding.position")}>
                <input id={`${ids}-position`} className={input} value={mForm.position} onChange={(e) => setMForm({ ...mForm, position: e.target.value })} />
              </Field>
              <Field id={`${ids}-company`} title={t("mentorOnboarding.company")}>
                <input id={`${ids}-company`} className={input} value={mForm.company} onChange={(e) => setMForm({ ...mForm, company: e.target.value })} />
              </Field>
            </div>
            <Field id={`${ids}-bio`} title={t("mentorOnboarding.bio")}>
              <textarea id={`${ids}-bio`} rows={5} className={area} value={mForm.bio} onChange={(e) => setMForm({ ...mForm, bio: e.target.value })} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${ids}-expertise`} title={t("mentorOnboarding.expertise")} hint={t("showcase.profileSettings.commaHint")}>
                <input id={`${ids}-expertise`} className={input} value={mForm.expertise} onChange={(e) => setMForm({ ...mForm, expertise: e.target.value })} />
              </Field>
              <Field id={`${ids}-industries`} title={t("mentorOnboarding.industriesExperience")} hint={t("showcase.profileSettings.commaHint")}>
                <input id={`${ids}-industries`} className={input} value={mForm.industries} onChange={(e) => setMForm({ ...mForm, industries: e.target.value })} />
              </Field>
              <Field id={`${ids}-languages`} title={t("mentorOnboarding.languagesSpoken")} hint={t("showcase.profileSettings.commaHint")}>
                <input id={`${ids}-languages`} className={input} value={mForm.languages} onChange={(e) => setMForm({ ...mForm, languages: e.target.value })} />
              </Field>
              <Field id={`${ids}-country`} title={t("mentorOnboarding.country")}>
                <input id={`${ids}-country`} className={input} value={mForm.country} onChange={(e) => setMForm({ ...mForm, country: e.target.value })} />
              </Field>
              <Field id={`${ids}-cal`} title={t("showcase.profileSettings.calLink")} hint={t("showcase.profileSettings.calHint")}>
                <input id={`${ids}-cal`} className={input} value={mForm.cal_link} onChange={(e) => setMForm({ ...mForm, cal_link: e.target.value })} dir="ltr" placeholder="cal.com/yourname/30min" />
              </Field>
              <Field id={`${ids}-linkedin`} title={t("mentorOnboarding.linkedinUrl")}>
                <input id={`${ids}-linkedin`} className={input} value={mForm.linkedin_url} onChange={(e) => setMForm({ ...mForm, linkedin_url: e.target.value })} dir="ltr" />
              </Field>
            </div>
            <label className="inline-flex items-center gap-3 text-[14px] font-semibold text-[var(--sc-ink)]">
              <input type="checkbox" checked={mForm.is_available} onChange={(e) => setMForm({ ...mForm, is_available: e.target.checked })} className="size-4 accent-[var(--sc-ink)]" />
              {t("mentorCard.accepting")}
            </label>
            <div>{saveButton}</div>
          </form>
        ) : (
          <form onSubmit={saveMentee} className="grid max-w-[760px] gap-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${ids}-ename`} title={t("mentorOnboarding.fullName")}>
                <input id={`${ids}-ename`} className={input} value={eForm.name} onChange={(e) => setEForm({ ...eForm, name: e.target.value })} />
              </Field>
              <Field id={`${ids}-org`} title={t("showcase.profileSettings.organisation")}>
                <input id={`${ids}-org`} className={input} value={eForm.organization_name} onChange={(e) => setEForm({ ...eForm, organization_name: e.target.value })} />
              </Field>
              <Field id={`${ids}-ecountry`} title={t("mentorOnboarding.country")}>
                <input id={`${ids}-ecountry`} className={input} value={eForm.country} onChange={(e) => setEForm({ ...eForm, country: e.target.value })} />
              </Field>
              <Field id={`${ids}-elinkedin`} title={t("mentorOnboarding.linkedinUrl")}>
                <input id={`${ids}-elinkedin`} className={input} value={eForm.linkedin_url} onChange={(e) => setEForm({ ...eForm, linkedin_url: e.target.value })} dir="ltr" />
              </Field>
            </div>
            <Field id={`${ids}-ebio`} title={t("mentorOnboarding.bio")}>
              <textarea id={`${ids}-ebio`} rows={4} className={area} value={eForm.bio} onChange={(e) => setEForm({ ...eForm, bio: e.target.value })} />
            </Field>
            <Field id={`${ids}-goals`} title={t("showcase.profileSettings.goals")}>
              <textarea id={`${ids}-goals`} rows={3} className={area} value={eForm.goals} onChange={(e) => setEForm({ ...eForm, goals: e.target.value })} />
            </Field>
            <div>{saveButton}</div>
          </form>
        )}
      </div>
    </DashboardShell>
  );
}
