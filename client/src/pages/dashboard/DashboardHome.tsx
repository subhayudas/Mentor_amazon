import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, ChevronUp, Copy, Plus, Share2, Clock3, HelpCircle } from "lucide-react";

import { DASHBOARD_ROUTES, DashboardShell, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import { getLocalValue, setLocalValue } from "@/lib/localStore";
import { Badge } from "@/components/ui/badge";
import { FEATURED_MENTORS } from "@/data/featuredMentors";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { UPCOMING_STATUSES, useDashboardData } from "@/pages/dashboard/data";

/**
 * Dashboard home `/dashboard` (Figma "Dashboard Home", Topmate → Amazon /
 * MentorConnect): greeting card with the public link and the hours summary,
 * the "Make the page yours" checklist, "Get inspired" mentors, the referral
 * banner and the period stats strip.
 */
const CHECKLIST = ["availability", "profile", "sessions", "calendar", "share"] as const;
const PERIODS = ["today", "yesterday", "3d", "7d", "30d", "3m", "6m"] as const;
const PERIOD_DAYS: Record<(typeof PERIODS)[number], number> = { today: 1, yesterday: 2, "3d": 3, "7d": 7, "30d": 30, "3m": 90, "6m": 180 };

export default function DashboardHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { displayName, firstName, email, role, signedIn } = useDashboardIdentity();
  const { bookings, mentors, demo, profileId } = useDashboardData();
  const checklistKey = `checklist:${email || "showcase"}`;
  const [open, setOpen] = React.useState<(typeof CHECKLIST)[number] | null>("availability");
  const [done, setDoneState] = React.useState<Set<string>>(() => new Set(getLocalValue<string[]>(checklistKey) ?? []));
  const setDone = (next: Set<string>) => {
    setDoneState(next);
    setLocalValue(checklistKey, Array.from(next));
  };
  const [period, setPeriod] = React.useState<(typeof PERIODS)[number]>("30d");
  const [copied, setCopied] = React.useState(false);

  // A signed-in mentor's own page; the showcase account points at the first curated mentor.
  const ownMentorId = role === "mentor" && profileId ? profileId : FEATURED_MENTORS[0].id;
  const publicLink = `${typeof window !== "undefined" ? window.location.origin : ""}/mentor/${ownMentorId}`;
  const shortLink = publicLink.replace(/^https?:\/\//, "");
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "showcase.dashboard.morning" : hour < 18 ? "showcase.dashboard.afternoon" : "showcase.dashboard.evening", { name: firstName });
  const dateLabel = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const since = Date.now() - PERIOD_DAYS[period] * 86_400_000;
  const inPeriod = bookings.filter((b) => new Date(b.created_at).getTime() >= since);
  const completed = inPeriod.filter((b) => b.status === "completed");
  const upcoming = bookings.filter((b) => UPCOMING_STATUSES.includes(b.status) && b.scheduled_at && new Date(b.scheduled_at).getTime() > Date.now());
  const hours = Math.round((completed.reduce((s, b) => s + (b.session_duration_minutes ?? 30), 0) / 60) * 10) / 10;
  const nf = new Intl.NumberFormat(lang);
  const pending = bookings.filter((b) => b.status === "pending").length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the link stays visible for manual copy */
    }
  };

  const card = "rounded-[12px] border border-[var(--sc-hairline)] bg-white";
  const stat = "rounded-[12px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-5";

  if (signedIn && role === "mentee") {
    return <MenteeHome firstName={firstName} bookings={bookings} mentors={mentors} lang={lang} />;
  }

  return (
    <DashboardShell active="home">
      <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 id="page-title" tabIndex={-1} className="text-[28px] font-bold text-[var(--sc-ink)] md:text-[34px]">
            {t("showcase.dashboard.hi", { name: firstName })}
          </h1>
          <div className="flex items-center gap-2">
            <Link href={publicLink.replace(window.location.origin, "")} className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[var(--sc-hairline)] bg-[#fcfbf9] px-3 text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[12px]" aria-hidden="true">
                {displayName.slice(0, 1)}
              </span>
              <span className="truncate" dir="ltr">
                {shortLink}
              </span>
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <button type="button" onClick={copy} className="inline-flex size-11 items-center justify-center rounded-[10px] border border-[var(--sc-hairline)] bg-[#fcfbf9] text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]" aria-label={t("showcase.dashboard.copy")}>
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Greeting card */}
        <section className={cn(card, "mt-6 p-6")} aria-labelledby="greeting">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="greeting" className="text-[22px] font-bold text-[var(--sc-ink)]">
              {greeting}
            </h2>
            <p className="text-[13px] text-[#6c6c84]">{dateLabel}</p>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c6c84]">{t("showcase.dashboard.yourPage")}</p>
              <div className="mt-3 rounded-[10px] bg-[#f7f6f2] p-5">
                <p className="text-[13px] text-[#6c6c84]">{t("showcase.dashboard.yourLinkIs")}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <p className="text-[15px] font-bold text-[var(--sc-ink)]" dir="ltr">
                    {shortLink}
                  </p>
                  <button type="button" onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] bg-white px-2.5 text-[12px] font-semibold text-[var(--sc-ink)]">
                    <Copy className="size-3.5" aria-hidden="true" />
                    {copied ? t("showcase.dashboard.copied") : t("showcase.dashboard.copy")}
                  </button>
                </div>
                <p className="mt-2 text-[12px] text-[#6c6c84]">{t("showcase.dashboard.shareHint")}</p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c6c84]">{t("showcase.dashboard.hoursThisMonth")}</p>
              <p className="mt-2 border-b border-[var(--sc-hairline)] pb-3 text-[24px] font-bold text-[var(--sc-ink)]">{nf.format(hours)} h</p>
              <Link href={DASHBOARD_ROUTES.bookings} className="flex items-center justify-between border-b border-[var(--sc-hairline)] py-3 text-[14px] text-[var(--sc-ink)]">
                <span className="font-semibold">{t("showcase.dashboard.pendingRequests")}</span>
                <span className="inline-flex items-center gap-1 text-[#6c6c84]">
                  {t("showcase.dashboard.pendingCount", { count: pending })}
                  <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                </span>
              </Link>
              <Link href={DASHBOARD_ROUTES.calendar} className="flex items-center justify-between py-3 text-[14px] text-[var(--sc-ink)]">
                <span className="font-semibold">{t("showcase.dashboard.calendar")}</span>
                <span className="inline-flex items-center gap-1 text-[#6c6c84]">
                  {t("showcase.dashboard.calendarStatus")}
                  <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t border-[var(--sc-hairline)] pt-5 sm:grid-cols-3">
            {[
              { icon: Plus, label: t("showcase.dashboard.addSession"), href: DASHBOARD_ROUTES.calendar },
              { icon: Share2, label: t("showcase.dashboard.shareProfile"), href: publicLink.replace(window.location.origin, "") },
              { icon: Clock3, label: t("showcase.dashboard.logHours"), href: DASHBOARD_ROUTES.analyticsGrowth },
            ].map((a) => (
              <Link key={a.label} href={a.href} className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#d9d9d9] text-[14px] font-medium text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]">
                <a.icon className="size-4" aria-hidden="true" />
                {a.label}
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          {/* Checklist */}
          <section className={cn(card, "overflow-hidden")} aria-labelledby="checklist-title">
            <div className="flex items-start justify-between gap-4 p-6">
              <div>
                <h2 id="checklist-title" className="text-[20px] font-bold text-[var(--sc-ink)]">
                  {t("showcase.dashboard.makeYours")}
                </h2>
                <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.makeYoursSub")}</p>
              </div>
              <span className="text-[13px] font-semibold text-[#6c6c84]">{done.size}/{CHECKLIST.length}</span>
            </div>
            <div className="flex gap-1.5 px-6" aria-hidden="true">
              {CHECKLIST.map((k) => (
                <span key={k} className={cn("h-1.5 flex-1 rounded-full", done.has(k) ? "bg-[var(--sc-ink)]" : "bg-[#e6e4de]")} />
              ))}
            </div>
            <ul className="mt-4 divide-y divide-[var(--sc-hairline)] border-t border-[var(--sc-hairline)]">
              {CHECKLIST.map((k) => {
                const isOpen = open === k;
                const isDone = done.has(k);
                return (
                  <li key={k}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : k)} className="flex w-full items-center gap-4 px-6 py-4 text-start" aria-expanded={isOpen}>
                      <span className={cn("inline-flex size-5 items-center justify-center rounded-full border", isDone ? "border-[var(--sc-ink)] bg-[var(--sc-ink)] text-white" : "border-[#c9c9c9]")} aria-hidden="true">
                        {isDone && <Check className="size-3" />}
                      </span>
                      <span className={cn("flex-1 text-[15px] font-semibold text-[var(--sc-ink)]", isDone && "line-through text-[#6c6c84]")}>{t(`showcase.dashboard.steps.${k}`)}</span>
                      {isOpen ? <ChevronUp className="size-4 text-[#6c6c84]" aria-hidden="true" /> : <ChevronDown className="size-4 text-[#6c6c84]" aria-hidden="true" />}
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 ps-[60px]">
                        <p className="text-[14px] text-[#6c6c84]">{t(`showcase.dashboard.steps.${k}Sub`)}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <Link href={k === "share" ? publicLink.replace(window.location.origin, "") : k === "sessions" ? ROUTES.mentors : DASHBOARD_ROUTES.calendar} className="inline-flex h-10 items-center rounded-[8px] bg-[var(--sc-ink)] px-4 text-[14px] font-semibold text-white hover:bg-black">
                            {t(`showcase.dashboard.steps.${k}`)}
                          </Link>
                          <button type="button" onClick={() => setDone(new Set(done).add(k))} className="inline-flex size-10 items-center justify-center rounded-[8px] border border-[#d9d9d9] text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]" aria-label={t("showcase.dashboard.markDone")}>
                            <Check className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Get inspired */}
          <section className="rounded-[12px] bg-[#f7f6f2] p-6" aria-labelledby="inspired-title">
            <h2 id="inspired-title" className="text-[20px] font-bold text-[var(--sc-ink)]">
              {t("showcase.dashboard.inspired")}
            </h2>
            <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.inspiredSub")}</p>
            <ul className="mt-5 space-y-4">
              {FEATURED_MENTORS.slice(1, 4).map((m) => (
                <li key={m.id}>
                  <Link href={`/mentor/${m.id}`} className="flex items-center gap-3 rounded-[8px] hover:bg-white/70">
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

        {/* Upcoming strip */}
        <Link href={DASHBOARD_ROUTES.bookings} className={cn(card, "mt-6 flex items-center gap-4 p-4 hover:bg-[#fcfbf9]")}>
          <span className="inline-flex size-12 items-center justify-center rounded-[8px] bg-[var(--sc-sand)] text-[var(--sc-ink)]" aria-hidden="true">
            <Clock3 className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-[var(--sc-ink)]">{t("showcase.dashboard.upcomingTitle", { count: upcoming.length })}</span>
            <span className="block text-[13px] text-[#6c6c84]">{t("showcase.dashboard.upcomingSub")}</span>
          </span>
          <span className="inline-flex h-10 items-center rounded-[8px] border border-[#d9d9d9] px-4 text-[14px] font-semibold text-[var(--sc-ink)]">{t("showcase.dashboard.seeDetails")}</span>
        </Link>

        {/* Referral banner */}
        <section className="relative mt-6 overflow-hidden rounded-[12px] bg-[var(--sc-orange)] p-8 text-white" aria-labelledby="refer-title">
          <div className="pointer-events-none absolute -end-10 -top-16 size-64 rounded-full bg-white/10" aria-hidden="true" />
          <span className="inline-flex rounded-[6px] bg-[#d8f0a3] px-2 py-0.5 text-[14px] font-black text-[var(--sc-ink)]">NEW</span>
          <h2 id="refer-title" className="mt-2 max-w-[560px] text-[30px] font-bold leading-[1.15] md:text-[40px]">
            {t("showcase.dashboard.referTitle")}
          </h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={ROUTES.mentorOnboarding} className="inline-flex h-12 items-center rounded-[8px] bg-white px-5 text-[15px] font-bold text-[var(--sc-ink)] hover:bg-[var(--sc-peach)]">
              {t("showcase.dashboard.referNow")}
            </Link>
            <Link href={ROUTES.home} className="inline-flex h-12 items-center rounded-[8px] border border-white/70 px-5 text-[15px] font-medium text-white hover:bg-white/10">
              {t("showcase.dashboard.referPerks")}
            </Link>
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
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { label: t("showcase.dashboard.stat.requests"), value: nf.format(inPeriod.length) },
            { label: t("showcase.dashboard.stat.hours"), value: `${nf.format(hours)} h` },
            { label: t("showcase.dashboard.stat.completed"), value: nf.format(completed.length) },
          ].map((s) => (
            <div key={s.label} className={stat}>
              <p className="flex items-center justify-between text-[14px] text-[var(--sc-ink)]">
                {s.label}
                <HelpCircle className="size-4 text-[#b0b0b0]" aria-hidden="true" />
              </p>
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
function MenteeHome({ firstName, bookings, mentors, lang }: { firstName: string; bookings: ReturnType<typeof useDashboardData>["bookings"]; mentors: ReturnType<typeof useDashboardData>["mentors"]; lang: string }) {
  const { t } = useTranslation();
  const mentorById = new Map(mentors.map((m) => [m.id, m]));
  const featuredById = new Map(FEATURED_MENTORS.map((m) => [m.id, m]));
  const nameOf = (id: string) => mentorById.get(id)?.name ?? featuredById.get(id)?.name ?? t("showcase.bookings.mentor");
  const when = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const upcoming = bookings
    .filter((b) => b.status !== "canceled" && b.status !== "completed" && b.status !== "rejected")
    .sort((a, b) => new Date(a.scheduled_at ?? a.created_at).getTime() - new Date(b.scheduled_at ?? b.created_at).getTime());
  const card = "rounded-[12px] border border-[var(--sc-hairline)] bg-white";
  return (
    <DashboardShell active="home">
      <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
        <h1 id="page-title" tabIndex={-1} className="text-[28px] font-bold text-[var(--sc-ink)] md:text-[34px]">
          {t("showcase.dashboard.hi", { name: firstName })}
        </h1>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <section className={cn(card, "p-6")} aria-labelledby="my-sessions">
            <h2 id="my-sessions" className="text-[20px] font-bold text-[var(--sc-ink)]">
              {t("showcase.analytics.nav.mySessions")}
            </h2>
            {upcoming.length === 0 ? (
              <div className="mt-6 rounded-[10px] bg-[#f7f6f2] p-6 text-center">
                <p className="text-[15px] font-semibold text-[var(--sc-ink)]">{t("showcase.dashboard.menteeEmptyTitle")}</p>
                <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.menteeEmptyBody")}</p>
                <Link href={ROUTES.mentors} className="mt-4 inline-flex h-11 items-center rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black">
                  {t("showcase.hero.cta")}
                </Link>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--sc-hairline)]">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-[var(--sc-ink)]">{t("showcase.bookings.with", { name: nameOf(b.mentor_id) })}</p>
                      <p className="truncate text-[13px] text-[#6c6c84]">{b.goal ?? t("showcase.bookings.session")}</p>
                    </div>
                    <p className="inline-flex items-center gap-2 text-[14px] text-[var(--sc-ink)]">
                      <Clock3 className="size-4 text-[#6c6c84]" aria-hidden="true" />
                      {b.scheduled_at ? when.format(new Date(b.scheduled_at)) : b.status === "pending" ? t("showcase.dashboard.awaitingMentor") : t("showcase.bookings.timeTbc")}
                    </p>
                    <Badge tone={b.status === "pending" ? "warning" : "success"}>{t(`status.${b.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-[12px] bg-[#f7f6f2] p-6" aria-labelledby="suggested-title">
            <h2 id="suggested-title" className="text-[20px] font-bold text-[var(--sc-ink)]">
              {t("showcase.dashboard.suggested")}
            </h2>
            <p className="mt-1 text-[14px] text-[#6c6c84]">{t("showcase.dashboard.suggestedSub")}</p>
            <ul className="mt-5 space-y-4">
              {FEATURED_MENTORS.slice(0, 4).map((m) => (
                <li key={m.id}>
                  <Link href={`/mentor/${m.id}`} className="flex items-center gap-3 rounded-[8px] hover:bg-white/70">
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
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: t("showcase.dashboard.stat.requests"), value: String(bookings.length) },
            { label: t("showcase.dashboard.stat.upcoming"), value: String(upcoming.length) },
            { label: t("showcase.dashboard.stat.completed"), value: String(bookings.filter((b) => b.status === "completed").length) },
          ].map((s) => (
            <div key={s.label} className="rounded-[12px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-5">
              <p className="text-[14px] text-[var(--sc-ink)]">{s.label}</p>
              <p className="mt-2 text-[32px] font-bold leading-none text-[var(--sc-ink)]">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
