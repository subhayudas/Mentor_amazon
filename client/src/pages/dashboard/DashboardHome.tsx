import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowUpRight, Bell, CalendarClock, Check, ChevronDown, ChevronRight, ChevronUp, Clock3, Copy, Heart, Mail, Share2 } from "lucide-react";

import { DASHBOARD_ROUTES, DashboardShell, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import { useMentors } from "@/components/discovery/useMentors";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { FEATURED_MENTORS, featuredMentorByAnyId } from "@/data/featuredMentors";
import { useActivity } from "@/lib/activity";
import { usePublicAvailability } from "@/lib/availability";
import { isValidCalLink } from "@/lib/calLink";
import type { Mentor, VerificationStatus } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { useFavorites } from "@/lib/favorites";
import { localizedField } from "@/lib/localized";
import { getLocalValue, setLocalValue } from "@/lib/localStore";
import { dueReminders } from "@/lib/reminders";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { UPCOMING_STATUSES, useDashboardData, useOwnProfile, type DashboardBooking } from "@/pages/dashboard/data";
import { CHECKLIST_KEYS, checklistDone, firstNameOf, otherMentors, recordedMinutes, referralInvite, upcomingWithin, type ChecklistKey } from "@/pages/dashboard/dataSource";
import { formatHours, formatRelativeDay, formatTime } from "@/lib/format";
import { ActivityList } from "@/pages/dashboard/DashboardActivity";
import { DashboardError, DashboardLoading, ProfileNeededCard } from "@/pages/dashboard/states";

/**
 * Dashboard home `/dashboard` (Figma "Dashboard Home", Topmate → Amazon /
 * MentorConnect): greeting card with the public link and the hours summary,
 * the "Make the page yours" checklist, other mentors, the referral banner and
 * the period stats strip.
 *
 * Database mode (design C6; F17, F18, F40, F41): every number comes from the
 * signed-in person's own rows; reminders and "upcoming" count confirmed
 * sessions only; hours add up recorded durations only (and say how many
 * sessions have none); the checklist is computed from the mentor row,
 * published availability and bookings (only "share" is a per-browser tick);
 * "Your page" is the mentor's own profile — without one, "Finish your profile".
 * "Meet other mentors" lists real directory rows with no claim about their
 * sessions (R1-43; the demo keeps the curated "Get inspired" picture), and
 * "Refer now" shares a real invitation to sign in (R1-44).
 * Mentees see their verification state, favourites and sessions, or
 * "Complete your registration" when they have no mentees row yet.
 */
const PERIODS = ["today", "yesterday", "3d", "7d", "30d", "3m", "6m"] as const;
const PERIOD_DAYS: Record<(typeof PERIODS)[number], number> = { today: 1, yesterday: 2, "3d": 3, "7d": 7, "30d": 30, "3m": 90, "6m": 180 };
/** How far ahead the "upcoming" strip looks (its caption says so). */
const UPCOMING_DAYS = 14;

/** "Role, Company": Arabic lists take the Arabic comma. */
const listSeparator = (lang: string) => (lang.startsWith("ar") ? "، " : ", ");

/** Reminders only ever describe confirmed sessions (design C6). */
function confirmedReminders(bookings: DashboardBooking[]) {
  return dueReminders(bookings.filter((b) => b.status === "confirmed"));
}

export default function DashboardHome() {
  const { role, signedIn } = useDashboardIdentity();
  if (signedIn && role === "mentee") return <MenteeHome />;
  return <MentorHome />;
}

function MentorHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const identity = useDashboardIdentity();
  const { signedIn } = identity;
  const data = useDashboardData();
  const { bookings, demo, profileId, needsProfile, isLoading, isError, refetch } = data;
  const own = useOwnProfile();
  const availability = usePublicAvailability();
  const { events } = useActivity(signedIn ? profileId : null, { all: !signedIn, limit: 6 });
  const reminders = React.useMemo(() => (signedIn ? confirmedReminders(bookings) : []), [bookings, signedIn]);
  const directory = useMentors();
  const others = React.useMemo(() => (IS_LOCAL ? [] : otherMentors(directory.data, profileId)), [directory.data, profileId]);

  // Greeting: the mentor row's name, else the account's, else the email's local part (F41).
  const displayName = identity.displayName;
  const firstName = firstNameOf(displayName) || displayName;

  // "Share your link" is the one step only this browser can know about.
  const shareKey = `checklist:${identity.email || "showcase"}`;
  const [manualDone, setManualDone] = React.useState<Set<string>>(() => new Set(getLocalValue<string[]>(shareKey) ?? []));
  const markDone = (key: ChecklistKey) => {
    const next = new Set(manualDone).add(key);
    setManualDone(next);
    setLocalValue(shareKey, Array.from(next));
  };
  const windows = (availability.data ?? []).filter((w) => w.mentor_id === profileId).length;
  const done: Set<string> = IS_LOCAL
    ? manualDone
    : checklistDone({ mentor: own.mentor, availabilityWindows: windows, bookings: bookings.length, shared: manualDone.has("share") });

  const [open, setOpen] = React.useState<ChecklistKey | null>("availability");
  const [period, setPeriod] = React.useState<(typeof PERIODS)[number]>("30d");
  const [copied, setCopied] = React.useState(false);

  // "Your page": the signed-in mentor's own profile. Only the local showcase (no account) borrows a curated one.
  const ownMentorId = profileId ?? (IS_LOCAL && !signedIn ? FEATURED_MENTORS[0].id : null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicPath = ownMentorId ? ROUTES.mentor(ownMentorId) : null;
  const publicLink = publicPath ? `${origin}${publicPath}` : "";
  const shortLink = publicLink.replace(/^https?:\/\//, "");
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "showcase.dashboard.morning" : hour < 18 ? "showcase.dashboard.afternoon" : "showcase.dashboard.evening", { name: firstName });
  const dateLabel = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const now = Date.now();
  const since = now - PERIOD_DAYS[period] * 86_400_000;
  const inPeriod = bookings.filter((b) => new Date(b.created_at).getTime() >= since);
  const completed = inPeriod.filter((b) => b.status === "completed");
  const upcoming = upcomingWithin(bookings, now, UPCOMING_DAYS);
  const recorded = recordedMinutes(completed);
  const hoursLabel = formatHours(recorded.minutes, lang);
  const nf = new Intl.NumberFormat(lang);
  const pending = bookings.filter((b) => b.status === "pending").length;
  const calendarLinked = IS_LOCAL ? null : isValidCalLink(own.mentor?.cal_link);

  const copy = async () => {
    if (!publicLink) return;
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the link stays visible for manual copy */
    }
  };

  // "Refer now" (R1-44): a colleague starts at sign-in (Sign in with Amazon, then onboarding).
  const invite = referralInvite({ url: `${origin}${ROUTES.login}`, subject: t("showcase.dashboard.referSubject"), message: t("showcase.dashboard.referMessage") });
  const refer = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(invite.share);
        return;
      } catch (error) {
        // Closing the share sheet is a choice, not a failure; anything else falls back to the clipboard.
        if ((error as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(invite.clipboard);
      toast.success(t("showcase.dashboard.referCopied"));
    } catch {
      toast.error(t("showcase.dashboard.referCopyFailed"));
    }
  };

  const card = "rounded-[12px] border border-[var(--sc-hairline)] bg-white";
  const stat = "rounded-[12px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-5";

  const heading = (
    <h1 id="page-title" tabIndex={-1} className="text-[28px] font-bold text-[var(--sc-ink)] md:text-[34px]">
      {t("showcase.dashboard.hi", { name: firstName })}
    </h1>
  );

  if (!IS_LOCAL && (needsProfile || isError || isLoading)) {
    return (
      <DashboardShell active="home">
        <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
          {heading}
          <div className="mt-6">
            {needsProfile ? <ProfileNeededCard role="mentor" /> : isError ? <DashboardError message={t("showcase.dashboard.loadError")} onRetry={refetch} /> : <DashboardLoading />}
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="home">
      <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {heading}
          {publicPath && (
            <div className="flex min-w-0 items-center gap-2">
              <Link href={publicPath} className="inline-flex h-11 min-w-0 items-center gap-2 rounded-[10px] border border-[var(--sc-hairline)] bg-[#fcfbf9] px-3 text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]" data-testid="link-your-page">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[12px]" aria-hidden="true">
                  {displayName.slice(0, 1)}
                </span>
                <span className="truncate" dir="ltr">
                  {shortLink}
                </span>
                <ArrowUpRight className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
              <button type="button" onClick={copy} className="inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-[var(--sc-hairline)] bg-[#fcfbf9] text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]" aria-label={t("showcase.dashboard.copy")}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
              <span className="sr-only" aria-live="polite">
                {copied ? t("showcase.dashboard.copied") : ""}
              </span>
            </div>
          )}
        </div>

        <RemindersBanner reminders={reminders} lang={lang} />

        {/* Greeting card */}
        <section className={cn(card, "mt-6 p-6")} aria-labelledby="greeting">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="greeting" className="text-[22px] font-bold text-[var(--sc-ink)]">
              {greeting}
            </h2>
            <p className="text-[13px] text-[#6c6c84]">{dateLabel}</p>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c6c84]">{t("showcase.dashboard.yourPage")}</p>
              <div className="mt-3 rounded-[10px] bg-[#f7f6f2] p-5">
                {publicPath ? (
                  <>
                    <p className="text-[13px] text-[#6c6c84]">{t("showcase.dashboard.yourLinkIs")}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <p className="min-w-0 break-all text-[15px] font-bold text-[var(--sc-ink)]" dir="ltr">
                        {shortLink}
                      </p>
                      <button type="button" onClick={copy} className="inline-flex h-11 items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 text-[12px] font-semibold text-[var(--sc-ink)] md:h-8">
                        <Copy className="size-3.5" aria-hidden="true" />
                        {copied ? t("showcase.dashboard.copied") : t("showcase.dashboard.copy")}
                      </button>
                    </div>
                    <p className="mt-2 text-[12px] text-[#6c6c84]">{t("showcase.dashboard.shareHint")}</p>
                  </>
                ) : (
                  <p className="text-[13px] text-[#6c6c84]">{t("showcase.dashboard.noPageYet")}</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c6c84]">{t("showcase.dashboard.hoursThisMonth")}</p>
              <p className="mt-2 text-[24px] font-bold text-[var(--sc-ink)]" data-testid="text-hours">
                {hoursLabel}
              </p>
              {recorded.missing > 0 && (
                <p className="text-[12px] text-[#6c6c84]" data-testid="text-hours-missing">
                  {t("showcase.dashboard.hoursMissing", { count: recorded.missing })}
                </p>
              )}
              <div className="mt-3 border-b border-[var(--sc-hairline)]" />
              <Link href={DASHBOARD_ROUTES.bookings} className="flex min-h-11 items-center justify-between border-b border-[var(--sc-hairline)] py-3 text-[14px] text-[var(--sc-ink)]">
                <span className="font-semibold">{t("showcase.dashboard.pendingRequests")}</span>
                <span className="inline-flex items-center gap-1 text-[#6c6c84]" data-testid="text-pending-count">
                  {t("showcase.dashboard.pendingCount", { count: pending })}
                  <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                </span>
              </Link>
              <Link href={calendarLinked === null ? DASHBOARD_ROUTES.calendar : DASHBOARD_ROUTES.profile} className="flex min-h-11 items-center justify-between py-3 text-[14px] text-[var(--sc-ink)]">
                <span className="font-semibold">{t("showcase.dashboard.calendar")}</span>
                <span className="inline-flex items-center gap-1 text-[#6c6c84]">
                  {calendarLinked === null ? t("showcase.dashboard.calendarStatus") : calendarLinked ? t("showcase.dashboard.calendarLinked") : t("showcase.dashboard.calendarMissing")}
                  <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-[var(--sc-hairline)] pt-5 sm:grid-cols-3">
            {[
              // Session types live on the mentor's Cal.com event type; this page sets office hours (R1-45).
              { icon: CalendarClock, label: t("showcase.dashboard.setOfficeHours"), href: DASHBOARD_ROUTES.calendar },
              ...(publicPath ? [{ icon: Share2, label: t("showcase.dashboard.shareProfile"), href: publicPath }] : []),
              { icon: Clock3, label: t("showcase.dashboard.logHours"), href: DASHBOARD_ROUTES.bookings },
            ].map((a) => (
              <Link key={a.label} href={a.href} className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#d9d9d9] text-[14px] font-medium text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]">
                <a.icon className="size-4" aria-hidden="true" />
                {a.label}
              </Link>
            ))}
          </div>
        </section>

        <div className={cn("mt-6 grid grid-cols-1 gap-6", (IS_LOCAL || others.length > 0) && "lg:grid-cols-[1.7fr_1fr]")}>
          {/* Checklist: computed from the database in database mode; the share step is this browser's tick. */}
          <section className={cn(card, "overflow-hidden")} aria-labelledby="checklist-title" data-testid="checklist">
            <div className="flex items-start justify-between gap-4 p-6">
              <div>
                <h2 id="checklist-title" className="text-[20px] font-bold text-[var(--sc-ink)]">
                  {t("showcase.dashboard.makeYours")}
                </h2>
                <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.makeYoursSub")}</p>
              </div>
              <span className="text-[13px] font-semibold text-[#6c6c84]" data-testid="text-checklist-progress">
                {done.size}/{CHECKLIST_KEYS.length}
              </span>
            </div>
            <div className="flex gap-1.5 px-6" aria-hidden="true">
              {CHECKLIST_KEYS.map((k) => (
                <span key={k} className={cn("h-1.5 flex-1 rounded-full", done.has(k) ? "bg-[var(--sc-ink)]" : "bg-[#e6e4de]")} />
              ))}
            </div>
            <ul className="mt-4 divide-y divide-[var(--sc-hairline)] border-t border-[var(--sc-hairline)]">
              {CHECKLIST_KEYS.map((k) => {
                const isOpen = open === k;
                const isDone = done.has(k);
                const target =
                  k === "share"
                    ? publicPath ?? DASHBOARD_ROUTES.profile
                    : k === "sessions"
                      ? DASHBOARD_ROUTES.bookings
                      : k === "profile" || k === "calendar"
                        ? DASHBOARD_ROUTES.profile
                        : DASHBOARD_ROUTES.calendar;
                const manual = IS_LOCAL || k === "share";
                return (
                  <li key={k} data-testid={`checklist-${k}`} data-done={isDone || undefined}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : k)} className="flex min-h-11 w-full items-center gap-4 px-6 py-4 text-start" aria-expanded={isOpen}>
                      <span className={cn("inline-flex size-5 items-center justify-center rounded-full border", isDone ? "border-[var(--sc-ink)] bg-[var(--sc-ink)] text-white" : "border-[#c9c9c9]")} aria-hidden="true">
                        {isDone && <Check className="size-3" />}
                      </span>
                      <span className={cn("flex-1 text-[15px] font-semibold text-[var(--sc-ink)]", isDone && "text-[#6c6c84] line-through")}>
                        {t(`showcase.dashboard.steps.${k}`)}
                        {isDone && <span className="sr-only"> ({t("showcase.dashboard.stepDone")})</span>}
                      </span>
                      {isOpen ? <ChevronUp className="size-4 text-[#6c6c84]" aria-hidden="true" /> : <ChevronDown className="size-4 text-[#6c6c84]" aria-hidden="true" />}
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 ps-[60px]">
                        <p className="text-[14px] text-[#6c6c84]">{t(IS_LOCAL ? `showcase.dashboard.steps.${k}Sub` : `showcase.dashboard.stepsLive.${k}`)}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <Link href={target} className="inline-flex h-11 items-center rounded-[8px] bg-[var(--sc-ink)] px-4 text-[14px] font-semibold text-white hover:bg-black md:h-10">
                            {t(`showcase.dashboard.steps.${k}`)}
                          </Link>
                          {manual && !isDone && (
                            <button type="button" onClick={() => markDone(k)} className="inline-flex size-11 items-center justify-center rounded-[8px] border border-[#d9d9d9] text-[var(--sc-ink)] hover:bg-[var(--sc-sand)] md:size-10" aria-label={t("showcase.dashboard.markDone")}>
                              <Check className="size-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {IS_LOCAL ? (
            /* Demo: the curated showcase picture. */
            <section className="rounded-[12px] bg-[#f7f6f2] p-6" aria-labelledby="inspired-title">
              <h2 id="inspired-title" className="text-[20px] font-bold text-[var(--sc-ink)]">
                {t("showcase.dashboard.inspired")}
              </h2>
              <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.inspiredSub")}</p>
              <ul className="mt-5 space-y-4">
                {FEATURED_MENTORS.slice(1, 4).map((m) => (
                  <li key={m.id}>
                    <Link href={ROUTES.mentor(m.id)} className="flex items-center gap-3 rounded-[8px] hover:bg-white/70">
                      <img src={m.photo_url} alt="" className="size-12 rounded-full object-cover" />
                      <span className="min-w-0">
                        <span className="block truncate text-[16px] font-semibold text-[var(--sc-ink)]">{lang === "ar" && m.name_ar ? m.name_ar : m.name}</span>
                        <span className="block truncate text-[13px] text-[#6c6c84]">{lang === "ar" ? m.headline_ar : m.headline}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : others.length > 0 ? (
            /* Database: other real mentors in the directory, with no claim about their sessions (R1-43). */
            <section className="rounded-[12px] bg-[#f7f6f2] p-6" aria-labelledby="other-mentors-title" data-testid="section-other-mentors">
              <h2 id="other-mentors-title" className="text-[20px] font-bold text-[var(--sc-ink)]">
                {t("showcase.dashboard.otherMentors")}
              </h2>
              <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.otherMentorsSub")}</p>
              <ul className="mt-5 space-y-4">
                {others.map((m) => {
                  const name = localizedField(m, "name", lang) || m.name;
                  const role = [localizedField(m, "position", lang), localizedField(m, "company", lang)].filter(Boolean).join(listSeparator(lang));
                  return (
                    <li key={m.id}>
                      <Link href={ROUTES.mentor(m.slug ?? m.id)} className="flex items-center gap-3 rounded-[8px] hover:bg-white/70" data-testid={`link-other-mentor-${m.id}`}>
                        {m.photo_url ? (
                          <img src={m.photo_url} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-[16px] font-bold text-[var(--sc-ink)]" aria-hidden="true">
                            {name.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[16px] font-semibold text-[var(--sc-ink)]">
                            <bdi>{name}</bdi>
                          </span>
                          {role && <span className="block truncate text-[13px] text-[#6c6c84]">{role}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        {signedIn && (
          <section className={cn(card, "mt-6 p-6")} aria-labelledby="recent-activity">
            <div className="flex items-center justify-between gap-4">
              <h2 id="recent-activity" className="text-[20px] font-bold text-[var(--sc-ink)]">
                {t("showcase.activity.recent")}
              </h2>
              <Link href={DASHBOARD_ROUTES.activity} className="text-[14px] font-semibold text-[var(--sc-ink)] underline underline-offset-4">
                {t("showcase.activity.viewAll")}
              </Link>
            </div>
            <ActivityList events={events} lang={lang} compact />
          </section>
        )}

        {/* Upcoming strip: confirmed sessions in the next 14 days */}
        <Link href={DASHBOARD_ROUTES.bookings} className={cn(card, "mt-6 flex flex-wrap items-center gap-4 p-4 hover:bg-[#fcfbf9]")} data-testid="link-upcoming">
          <span className="inline-flex size-12 items-center justify-center rounded-[8px] bg-[var(--sc-sand)] text-[var(--sc-ink)]" aria-hidden="true">
            <Clock3 className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-[var(--sc-ink)]">{t("showcase.dashboard.upcomingCount", { count: upcoming.length })}</span>
            <span className="block text-[13px] text-[#6c6c84]">{t("showcase.dashboard.upcomingSub")}</span>
          </span>
          <span className="inline-flex h-10 items-center rounded-[8px] border border-[#d9d9d9] px-4 text-[14px] font-semibold text-[var(--sc-ink)]">{t("showcase.dashboard.seeDetails")}</span>
        </Link>

        {/* Referral banner */}
        <section className="relative mt-6 overflow-hidden rounded-[12px] bg-[var(--sc-orange)] p-8 text-white" aria-labelledby="refer-title">
          <div className="pointer-events-none absolute -end-10 -top-16 size-64 rounded-full bg-white/10" aria-hidden="true" />
          <span className="inline-flex rounded-[6px] bg-[#d8f0a3] px-2 py-0.5 text-[14px] font-black text-[var(--sc-ink)]">{t("showcase.dashboard.newBadge")}</span>
          <h2 id="refer-title" className="mt-2 max-w-[560px] text-[30px] font-bold leading-[1.15] md:text-[40px]">
            {t("showcase.dashboard.referTitle")}
          </h2>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={refer}
              className="inline-flex h-12 items-center gap-2 rounded-[8px] bg-white px-5 text-[15px] font-bold text-[var(--sc-ink)] hover:bg-[var(--sc-peach)]"
              data-testid="button-refer-share"
            >
              <Share2 className="size-4" aria-hidden="true" />
              {t("showcase.dashboard.referNow")}
            </button>
            <a
              href={invite.mailto}
              className="inline-flex h-12 items-center gap-2 rounded-[8px] border border-white/70 px-5 text-[15px] font-semibold text-white hover:bg-white/10"
              data-testid="link-refer-email"
            >
              <Mail className="size-4" aria-hidden="true" />
              {t("showcase.dashboard.referEmail")}
            </a>
          </div>
        </section>

        {/* Period stats */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label={t("showcase.analytics.period")} className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[#f3f2ee] p-1">
            {PERIODS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} className={cn("h-8 rounded-[8px] px-3 text-[13px]", period === p ? "bg-white font-semibold text-[var(--sc-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#6c6c84] hover:text-[var(--sc-ink)]")}>
                {t(`showcase.analytics.periods.${p}`)}
              </button>
            ))}
          </div>
          {demo && <Badge tone="warning">{t("analyticsV2.demoBadge")}</Badge>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="period-stats">
          {[
            { label: t("showcase.dashboard.stat.requests"), value: nf.format(inPeriod.length) },
            { label: t("showcase.dashboard.stat.hours"), value: hoursLabel },
            { label: t("showcase.dashboard.stat.completed"), value: nf.format(completed.length) },
          ].map((s) => (
            <div key={s.label} className={stat}>
              <p className="text-[14px] text-[var(--sc-ink)]">{s.label}</p>
              <p className="mt-2 text-[32px] font-bold leading-none text-[var(--sc-ink)]">{s.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-end text-[12px] text-[#9aa3ab]">
          <Link href={DASHBOARD_ROUTES.analyticsProfile} className="underline underline-offset-4">
            {t("showcase.dashboard.fullAnalytics")}
          </Link>
        </p>
      </div>
    </DashboardShell>
  );
}

/** Mentee view of the dashboard home: their sessions, then where to find the next mentor. */
function MenteeHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const identity = useDashboardIdentity();
  const { user } = useAuth();
  const { bookings, mentors, profileId, needsProfile, isLoading, isError, refetch } = useDashboardData();
  const own = useOwnProfile();
  const me = own.mentee;
  const { favorites } = useFavorites(profileId, me?.name ?? user?.name);
  const { events } = useActivity(profileId, { limit: 6 });
  const reminders = React.useMemo(() => confirmedReminders(bookings), [bookings]);

  const displayName = identity.displayName;
  const firstName = firstNameOf(displayName) || displayName;
  // Organisations are reviewed before they book; individuals need no verification (F17).
  const verification: VerificationStatus | null = me?.user_type === "organization" ? me.verification_status ?? "pending" : null;
  const mentorById = new Map<string, Pick<Mentor, "id" | "name" | "name_ar" | "photo_url" | "position" | "company">>(mentors.map((m) => [m.id, m]));
  const mentorFor = (id: string) => mentorById.get(id) ?? featuredMentorByAnyId(id);
  const favoriteMentors = favorites.map((f) => mentorFor(f.mentor_id)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const nameOf = (id: string) => {
    const m = mentorFor(id);
    if (!m) return t("showcase.bookings.mentor");
    return lang === "ar" && m.name_ar ? m.name_ar : m.name;
  };
  const when = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const active = bookings
    .filter((b) => b.status === "pending" || UPCOMING_STATUSES.includes(b.status))
    .sort((a, b) => new Date(a.scheduled_at ?? a.created_at).getTime() - new Date(b.scheduled_at ?? b.created_at).getTime());
  const upcomingCount = upcomingWithin(bookings, Date.now(), 3650).length;
  const card = "rounded-[12px] border border-[var(--sc-hairline)] bg-white";

  const heading = (
    <h1 id="page-title" tabIndex={-1} className="text-[28px] font-bold text-[var(--sc-ink)] md:text-[34px]">
      {t("showcase.dashboard.hi", { name: firstName })}
    </h1>
  );

  if (!IS_LOCAL && (needsProfile || isError || isLoading)) {
    return (
      <DashboardShell active="home">
        <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
          {heading}
          <div className="mt-6">
            {needsProfile ? <ProfileNeededCard role="mentee" /> : isError ? <DashboardError message={t("showcase.dashboard.loadError")} onRetry={refetch} /> : <DashboardLoading />}
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="home">
      <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
        {heading}
        <RemindersBanner reminders={reminders} lang={lang} />
        {verification && (
          <section
            className={cn(
              "mt-6 rounded-[12px] border p-4",
              verification === "verified"
                ? "border-[#bfe3d3] bg-[#e6f4f1] text-[#055f4b]"
                : verification === "rejected"
                  ? "border-[#f5c2c2] bg-[#fdecec] text-[#8a1f1f]"
                  : "border-[#f5d98a] bg-[#fffaeb] text-[#7a4b00]",
            )}
            aria-labelledby="verification-title"
            data-testid="verification-banner"
            data-status={verification}
          >
            <h2 id="verification-title" className="text-[15px] font-bold">
              {t(`showcase.verification.${verification === "unverified" ? "pending" : verification}.title`, { name: me?.organization_name ?? me?.name })}
            </h2>
            <p className="mt-1 text-[14px]">{t(`showcase.verification.${verification === "unverified" ? "pending" : verification}.body`)}</p>
          </section>
        )}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr]">
          <section className={cn(card, "p-6")} aria-labelledby="my-sessions">
            <div className="flex items-center justify-between gap-4">
              <h2 id="my-sessions" className="text-[20px] font-bold text-[var(--sc-ink)]">
                {t("showcase.analytics.nav.mySessions")}
              </h2>
              <Link href={DASHBOARD_ROUTES.bookings} className="text-[14px] font-semibold text-[var(--sc-ink)] underline underline-offset-4">
                {t("showcase.bookings.manage")}
              </Link>
            </div>
            {active.length === 0 ? (
              <div className="mt-6 rounded-[10px] bg-[#f7f6f2] p-6 text-center" data-testid="mentee-empty">
                <p className="text-[15px] font-semibold text-[var(--sc-ink)]">{t("showcase.dashboard.menteeEmptyTitle")}</p>
                <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.menteeEmptyBody")}</p>
                <Link href={ROUTES.mentors} className="mt-4 inline-flex h-11 items-center rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black">
                  {t("showcase.hero.cta")}
                </Link>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--sc-hairline)]" data-testid="mentee-sessions">
                {active.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4" data-testid={`mentee-session-${b.id}`}>
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <p className="truncate text-[15px] font-semibold text-[var(--sc-ink)]">{t("showcase.bookings.with", { name: nameOf(b.mentor_id) })}</p>
                      <p className="truncate text-[13px] text-[#6c6c84]" dir="auto">
                        {b.goal || t("showcase.bookings.session")}
                      </p>
                    </div>
                    <p className="inline-flex items-center gap-2 text-[14px] text-[var(--sc-ink)]">
                      <Clock3 className="size-4 text-[#6c6c84]" aria-hidden="true" />
                      {b.scheduled_at ? when.format(new Date(b.scheduled_at)) : b.status === "pending" ? t("showcase.dashboard.awaitingMentor") : t("showcase.bookings.timeTbc")}
                    </p>
                    <Badge tone={b.status === "pending" ? "warning" : b.status === "confirmed" ? "success" : "info"}>{t(`status.${b.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-[12px] bg-[#f7f6f2] p-6" aria-labelledby="suggested-title">
            {favoriteMentors.length > 0 && (
              <>
                <h2 className="inline-flex items-center gap-2 text-[20px] font-bold text-[var(--sc-ink)]">
                  <Heart className="size-5 fill-[#d5534d] text-[#d5534d]" aria-hidden="true" />
                  {t("showcase.favorites.title")}
                </h2>
                <ul className="mt-4 space-y-3" data-testid="list-favorites">
                  {favoriteMentors.map((m) => (
                    <li key={m.id}>
                      <Link href={ROUTES.mentor(m.id)} className="flex items-center gap-3 rounded-[8px] hover:bg-white/70">
                        {m.photo_url ? (
                          <img src={m.photo_url} alt="" className="size-10 rounded-full object-cover" />
                        ) : (
                          <span className="inline-flex size-10 items-center justify-center rounded-full bg-white text-[14px] font-bold" aria-hidden="true">
                            {m.name.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-[var(--sc-ink)]">{lang === "ar" && m.name_ar ? m.name_ar : m.name}</span>
                          <span className="block truncate text-[13px] text-[#6c6c84]">{[m.position, m.company].filter(Boolean).join(listSeparator(lang))}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="my-5 border-t border-[var(--sc-hairline)]" />
              </>
            )}
            <h2 id="suggested-title" className="text-[20px] font-bold text-[var(--sc-ink)]">
              {t("showcase.dashboard.suggested")}
            </h2>
            <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.suggestedSub")}</p>
            <ul className="mt-5 space-y-4">
              {FEATURED_MENTORS.slice(0, 4).map((m) => (
                <li key={m.id}>
                  <Link href={ROUTES.mentor(m.id)} className="flex items-center gap-3 rounded-[8px] hover:bg-white/70">
                    <img src={m.photo_url} alt="" className="size-12 rounded-full object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-semibold text-[var(--sc-ink)]">{lang === "ar" && m.name_ar ? m.name_ar : m.name}</span>
                      <span className="block truncate text-[13px] text-[#6c6c84]">{lang === "ar" ? m.headline_ar : m.headline}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className={cn(card, "mt-6 p-6")} aria-labelledby="mentee-activity">
          <div className="flex items-center justify-between gap-4">
            <h2 id="mentee-activity" className="text-[20px] font-bold text-[var(--sc-ink)]">
              {t("showcase.activity.recent")}
            </h2>
            <Link href={DASHBOARD_ROUTES.activity} className="text-[14px] font-semibold text-[var(--sc-ink)] underline underline-offset-4">
              {t("showcase.activity.viewAll")}
            </Link>
          </div>
          <ActivityList events={events} lang={lang} compact />
        </section>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="mentee-stats">
          {[
            { label: t("showcase.dashboard.stat.requests"), value: bookings.length },
            { label: t("showcase.dashboard.stat.upcoming"), value: upcomingCount },
            { label: t("showcase.dashboard.stat.completed"), value: bookings.filter((b) => b.status === "completed").length },
          ].map((s) => (
            <div key={s.label} className="rounded-[12px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-5">
              <p className="text-[14px] text-[var(--sc-ink)]">{s.label}</p>
              <p className="mt-2 text-[32px] font-bold leading-none text-[var(--sc-ink)]">{new Intl.NumberFormat(lang).format(s.value)}</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

/** Confirmed sessions starting within 24 hours, for the signed-in person (times in the viewer's zone). */
function RemindersBanner({ reminders, lang }: { reminders: ReturnType<typeof dueReminders>; lang: string }) {
  const { t } = useTranslation();
  const fmt = React.useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "long", hour: "numeric", minute: "2-digit" }), [lang]);
  if (reminders.length === 0) return null;
  const line = (r: ReturnType<typeof dueReminders>[number]) =>
    r.kind === "1h"
      ? t("showcase.reminders.inHour", { when: fmt.format(r.startsAt) })
      : t("showcase.reminders.within24h", { day: formatRelativeDay(r.startsAt, lang), time: formatTime(r.startsAt, lang) });
  return (
    <section className="mt-6 rounded-[12px] border border-[#f5d98a] bg-[#fffaeb] p-4" aria-labelledby="reminders-title" data-testid="reminders-banner">
      <h2 id="reminders-title" className="inline-flex items-center gap-2 text-[15px] font-bold text-[#7a4b00]">
        <Bell className="size-4" aria-hidden="true" />
        {t("showcase.reminders.title")}
      </h2>
      <ul className="mt-2 space-y-1 text-[14px] text-[#7a4b00]">
        {reminders.map((r) => (
          <li key={r.booking.id} data-testid={`reminder-${r.booking.id}`}>
            {line(r)} — <span dir="auto">{r.booking.goal || t("showcase.bookings.session")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
