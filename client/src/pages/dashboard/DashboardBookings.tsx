import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { CalendarDays, Check, Share2, Video, X } from "lucide-react";

import { DashboardHeader, DashboardShell, Pill } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { FEATURED_MENTORS } from "@/data/featuredMentors";
import type { Booking } from "@/lib/database";
import { localStore } from "@/lib/localStore";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { UPCOMING_STATUSES, useDashboardData } from "@/pages/dashboard/data";

/**
 * Bookings `/dashboard/bookings` (Figma "Bookings" page): kind pills, the
 * Upcoming / Completed tabs and the session rows — mentee, goal, when,
 * status. The empty state keeps the design's "Share your page" prompt.
 */
type Tab = "requests" | "upcoming" | "completed";
const KINDS = ["calls", "office", "programmes"] as const;

export default function DashboardBookings() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { bookings, mentees, mentors, demo, role } = useDashboardData();
  const isMentee = role === "mentee";
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const [tab, setTab] = React.useState<Tab>(() => (pendingCount > 0 ? "requests" : "upcoming"));
  const [kind, setKind] = React.useState<(typeof KINDS)[number]>("calls");

  const menteeById = React.useMemo(() => new Map(mentees.map((m) => [m.id, m])), [mentees]);
  const mentorById = React.useMemo(() => new Map(mentors.map((m) => [m.id, m])), [mentors]);
  const featuredById = React.useMemo(() => new Map(FEATURED_MENTORS.map((m) => [m.id, { name: m.name }])), []);
  const now = Date.now();
  const rows = React.useMemo(() => {
    // Requests: awaiting the mentor. Upcoming: accepted (with or without a time yet) or scheduled ahead.
    const list =
      tab === "requests"
        ? bookings.filter((b) => b.status === "pending")
        : tab === "upcoming"
          ? bookings.filter((b) => UPCOMING_STATUSES.includes(b.status) && (!b.scheduled_at || new Date(b.scheduled_at).getTime() > now))
          : bookings.filter((b) => b.status === "completed");
    return list
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.scheduled_at ?? a.completed_at ?? a.created_at).getTime();
        const tb = new Date(b.scheduled_at ?? b.completed_at ?? b.created_at).getTime();
        return tab === "upcoming" ? ta - tb : tb - ta;
      })
      .slice(0, 12);
  }, [bookings, tab, now]);
  const when = React.useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), [lang]);

  const tabCls = (active: boolean) => cn("relative h-11 px-1 text-[16px] transition-colors duration-fast", active ? "font-bold text-[var(--sc-ink)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--sc-ink)]" : "text-[#6c6c84] hover:text-[var(--sc-ink)]");

  return (
    <DashboardShell active="bookings">
      <DashboardHeader
        title={t(isMentee ? "showcase.analytics.nav.mySessions" : "showcase.analytics.nav.bookings")}
        pills={KINDS.map((k) => (
          <Pill key={k} active={kind === k} onClick={() => setKind(k)}>
            {t(`showcase.bookings.kind.${k}`)}
          </Pill>
        ))}
        trailing={demo ? <Badge tone="warning">{t("analyticsV2.demoBadge")}</Badge> : undefined}
      />
      <div className="px-4 py-6 sm:px-8 lg:px-12">
        <div role="tablist" className="flex gap-8 border-b border-[var(--sc-hairline)]">
          {(["requests", "upcoming", "completed"] as Tab[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tabCls(tab === k)} onClick={() => setTab(k)}>
              {t(`showcase.bookings.${k}`)}
              {k === "requests" && pendingCount > 0 && (
                <span className="ms-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--sc-ink)] px-1.5 text-[11px] font-bold text-white">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {kind !== "calls" || rows.length === 0 ? (
          <div className="mx-auto max-w-[420px] py-16 text-center">
            <div className="mx-auto grid size-[140px] place-items-center rounded-full bg-[#ffd23f]/60" aria-hidden="true">
              <Share2 className="size-14 text-[var(--sc-ink)]" strokeWidth={1.25} />
            </div>
            <h2 className="mt-8 text-[24px] font-bold text-[var(--sc-ink)]">{t(isMentee ? "showcase.dashboard.menteeEmptyTitle" : "showcase.bookings.emptyTitle")}</h2>
            <p className="mt-2 text-[15px] text-[#6c6c84]">{t(isMentee ? "showcase.dashboard.menteeEmptyBody" : "showcase.bookings.emptyBody")}</p>
            <Link href={isMentee ? ROUTES.mentors : "/dashboard/profile"} className="mt-6 inline-flex h-11 items-center rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black">
              {t(isMentee ? "showcase.hero.cta" : "showcase.bookings.sharePage")}
            </Link>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--sc-hairline)]">
            {rows.map((b: Booking) => {
              const mentee = menteeById.get(b.mentee_id);
              const mentor = mentorById.get(b.mentor_id) ?? featuredById.get(b.mentor_id);
              const at = b.scheduled_at ?? b.completed_at ?? b.created_at;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-4 py-4">
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[15px] font-bold text-[var(--sc-ink)]" aria-hidden="true">
                    {(mentee?.name ?? "?").slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-[var(--sc-ink)]">
                      {isMentee ? t("showcase.bookings.with", { name: mentor?.name ?? t("showcase.bookings.mentor") }) : mentee?.name ?? t("showcase.bookings.mentee")}
                    </p>
                    <p className="truncate text-[13px] text-[#6c6c84]">
                      {b.goal ?? t("showcase.bookings.session")}
                      {!isMentee && mentor?.name ? ` · ${t("showcase.bookings.with", { name: mentor.name })}` : ""}
                    </p>
                  </div>
                  <p className="inline-flex items-center gap-2 text-[14px] text-[var(--sc-ink)]">
                    <CalendarDays className="size-4 text-[#6c6c84]" aria-hidden="true" />
                    {b.scheduled_at || b.status === "completed" ? when.format(new Date(at)) : t("showcase.bookings.timeTbc")}
                  </p>
                  <p className="inline-flex items-center gap-2 text-[13px] text-[#6c6c84]">
                    <Video className="size-4" aria-hidden="true" />
                    {t("showcase.rail.minutes", { minutes: b.session_duration_minutes ?? 30 })}
                  </p>
                  <StatusBadge status={b.status} />
                  {!isMentee && b.status === "pending" && (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => localStore.update("bookings", b.id, { status: "accepted", responded_at: new Date().toISOString() })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-[var(--sc-ink)] px-3 text-[13px] font-bold text-white hover:bg-black"
                        data-testid={`button-accept-${b.id}`}
                      >
                        <Check className="size-4" aria-hidden="true" />
                        {t("showcase.bookings.accept")}
                      </button>
                      <button
                        type="button"
                        onClick={() => localStore.update("bookings", b.id, { status: "rejected", responded_at: new Date().toISOString() })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] px-3 text-[13px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]"
                        data-testid={`button-decline-${b.id}`}
                      >
                        <X className="size-4" aria-hidden="true" />
                        {t("showcase.bookings.decline")}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
