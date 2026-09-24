import * as React from "react";
import { Link, Redirect } from "wouter";
import { useTranslation } from "react-i18next";
import { Activity, BarChart3, CalendarClock, CalendarDays, ChevronRight, Home as HomeIcon, LogOut, Plus, Search, Settings, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";

import { AmazonLogo } from "@/components/AmazonSmile";
import { useAuth } from "@/context/AuthContext";
import { IS_LOCAL } from "@/lib/demo";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useOwnProfile } from "@/pages/dashboard/data";
import { displayNameFor, firstNameOf } from "@/pages/dashboard/dataSource";

/** Which sidebar entry is lit. */
export type DashboardSection = "home" | "bookings" | "calendar" | "profile" | "activity" | "mentors" | "admin" | "analytics-growth" | "analytics-profile" | "settings";

export const DASHBOARD_ROUTES = {
  home: "/dashboard",
  bookings: "/dashboard/bookings",
  calendar: "/dashboard/calendar",
  profile: "/dashboard/profile",
  activity: "/dashboard/activity",
  admin: "/dashboard/admin",
  analyticsProfile: ROUTES.analytics,
  analyticsGrowth: "/analytics/reports",
} as const;

function SideLink({ icon: Icon, label, href, active, chevron, sub }: { icon?: LucideIcon; label: string; href: string; active?: boolean; chevron?: boolean; sub?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-10 items-center gap-3 rounded-[8px] px-3 text-[15px] text-[var(--sc-ink)] transition-colors duration-fast hover:bg-black/5",
        active && "bg-[#efe9dc] font-semibold",
        sub && "ms-6 h-9 text-[14px]",
      )}
      aria-current={active ? "page" : undefined}
    >
      {Icon && !sub && <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />}
      <span className="flex-1">{label}</span>
      {chevron && <ChevronRight className="size-4 text-[#6c6c84] rtl:-scale-x-100" aria-hidden="true" />}
    </Link>
  );
}

/** Neutral identity for the local showcase (no account): never a real person's name or address. */
export const DEMO_IDENTITY_EMAIL = "demo@mentorconnect.local";

/**
 * The signed-in identity the shell shows (F41, F43): the profile row's name,
 * else the account's name, else the local part of its email. With no account
 * (local showcase only) a neutral "Demo mentor".
 */
export function useDashboardIdentity() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const own = useOwnProfile();
  const rowName = user?.user_type === "mentor" ? own.mentor?.name : user?.user_type === "mentee" ? own.mentee?.name : undefined;
  const displayName = user ? displayNameFor(rowName || user.name, user.email) : IS_LOCAL ? t("showcase.dashboard.demoName") : "";
  const email = user?.email ?? (IS_LOCAL ? DEMO_IDENTITY_EMAIL : "");
  const firstName = firstNameOf(displayName) || displayName;
  const role: "mentor" | "mentee" | "admin" = user?.user_type === "mentee" ? "mentee" : user?.user_type === "admin" ? "admin" : "mentor";
  return { displayName, email, firstName, initial: (displayName || "M").slice(0, 1).toUpperCase(), role, signedIn: Boolean(user) };
}

/**
 * Database mode: admins work in the database-backed /admin dashboard (design
 * D8, C3), so the dashboard sections that only make sense for a mentor or a
 * mentee send them there. Activity and analytics stay open to admins.
 */
const ADMIN_REDIRECTS: Partial<Record<DashboardSection, string>> = {
  home: ROUTES.admin,
  admin: ROUTES.admin,
  calendar: ROUTES.admin,
  profile: ROUTES.admin,
  settings: ROUTES.admin,
  bookings: `${ROUTES.admin}/bookings`,
};

/** Where an admin on this section should go instead (database mode), or null to stay. */
export function adminRedirectFor(section: DashboardSection, role: "mentor" | "mentee" | "admin", isLocal: boolean = IS_LOCAL): string | null {
  if (isLocal || role !== "admin") return null;
  return ADMIN_REDIRECTS[section] ?? null;
}

/**
 * Dashboard chrome (Figma "Creator Dashboard" sidebar, Topmate → Amazon /
 * MentorConnect): brand block, programme pill, "New session" action, the
 * section nav with the Analytics sub-items, guide link and the account row.
 * Every dashboard page renders inside it; the sidebar collapses below `lg`
 * into a horizontal tab strip.
 */
export function DashboardShell({ children, active }: { children: React.ReactNode; active: DashboardSection }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { displayName, email, initial, role, signedIn } = useDashboardIdentity();
  const analyticsOpen = active === "analytics-growth" || active === "analytics-profile";
  const isMentee = role === "mentee";
  const isAdmin = role === "admin";
  const redirect = signedIn ? adminRedirectFor(active, role) : null;
  if (redirect) return <Redirect to={redirect} replace />;

  // Database mode: the admin entries open the database-backed /admin dashboard.
  const adminHome = IS_LOCAL ? DASHBOARD_ROUTES.admin : ROUTES.admin;
  const adminBookings = IS_LOCAL ? DASHBOARD_ROUTES.bookings : `${ROUTES.admin}/bookings`;

  // Mentees get a shorter map: their sessions, the directory and their profile. Admins get the programme view.
  const items: { key: DashboardSection; icon: LucideIcon; label: string; href: string; chevron?: boolean }[] = isAdmin
    ? [
        ...(IS_LOCAL ? [{ key: "home" as const, icon: HomeIcon, label: t("showcase.analytics.nav.home"), href: DASHBOARD_ROUTES.home }] : []),
        { key: "admin", icon: ShieldCheck, label: t("showcase.admin.title"), href: adminHome },
        { key: "bookings", icon: CalendarClock, label: t("showcase.analytics.nav.bookings"), href: adminBookings },
        { key: "activity", icon: Activity, label: t("showcase.activity.title"), href: DASHBOARD_ROUTES.activity },
        { key: "mentors", icon: Users, label: t("showcase.analytics.nav.mentors"), href: ROUTES.mentors },
      ]
    : isMentee
    ? [
        { key: "home", icon: HomeIcon, label: t("showcase.analytics.nav.home"), href: DASHBOARD_ROUTES.home },
        { key: "bookings", icon: CalendarClock, label: t("showcase.analytics.nav.mySessions"), href: DASHBOARD_ROUTES.bookings },
        { key: "mentors", icon: Search, label: t("discovery.title"), href: ROUTES.mentors },
        { key: "activity", icon: Activity, label: t("showcase.activity.title"), href: DASHBOARD_ROUTES.activity },
        { key: "profile", icon: UserRound, label: t("showcase.analytics.nav.profileSettings"), href: DASHBOARD_ROUTES.profile },
      ]
    : [
        { key: "home", icon: HomeIcon, label: t("showcase.analytics.nav.home"), href: DASHBOARD_ROUTES.home },
        { key: "bookings", icon: CalendarClock, label: t("showcase.analytics.nav.bookings"), href: DASHBOARD_ROUTES.bookings, chevron: true },
        { key: "calendar", icon: CalendarDays, label: t("showcase.analytics.nav.calendar"), href: DASHBOARD_ROUTES.calendar },
        { key: "profile", icon: UserRound, label: t("showcase.analytics.nav.profileSettings"), href: DASHBOARD_ROUTES.profile },
        { key: "activity", icon: Activity, label: t("showcase.activity.title"), href: DASHBOARD_ROUTES.activity },
        { key: "mentors", icon: Users, label: t("showcase.analytics.nav.mentors"), href: ROUTES.mentors },
      ];

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] bg-white lg:min-h-[calc(100dvh-72px)]">
      <aside className="hidden w-[240px] shrink-0 flex-col border-e border-[var(--sc-hairline)] bg-[#faf9f6] px-3 py-4 lg:flex" aria-label={t("showcase.analytics.sidebar")}>
        <div className="flex items-center gap-3 px-2">
          <AmazonLogo size="md" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-[var(--sc-ink)]">{t(isAdmin ? "showcase.analytics.brandAdmin" : isMentee ? "showcase.analytics.brandMentee" : "showcase.analytics.brand")}</p>
            <p className="truncate text-[12px] text-[#6c6c84]">{t("showcase.analytics.programme")}</p>
          </div>
        </div>
        <Link href={isAdmin ? adminHome : isMentee ? ROUTES.mentors : DASHBOARD_ROUTES.profile} className="mt-4 inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--sc-ink)] px-3 text-[14px] font-semibold text-white hover:bg-black">
          {isAdmin ? <ShieldCheck className="size-4" aria-hidden="true" /> : isMentee ? <Plus className="size-4" aria-hidden="true" /> : <UserRound className="size-4" aria-hidden="true" />}
          {t(isAdmin ? "showcase.admin.queue" : isMentee ? "showcase.analytics.book" : "showcase.analytics.editProfile")}
        </Link>

        <nav className="mt-4 flex flex-col gap-0.5" aria-label={t("showcase.analytics.sidebar")}>
          {items.map((item) => (
            <SideLink key={item.key} icon={item.icon} label={item.label} href={item.href} active={active === item.key} chevron={item.chevron} />
          ))}
          {!isMentee && (
            <>
              <SideLink icon={BarChart3} label={t("showcase.analytics.nav.analytics")} href={DASHBOARD_ROUTES.analyticsProfile} active={analyticsOpen} />
              {analyticsOpen && (
                <>
                  <SideLink label={t("showcase.analytics.nav.growth")} href={DASHBOARD_ROUTES.analyticsGrowth} active={active === "analytics-growth"} sub />
                  <SideLink label={t("showcase.analytics.nav.profile")} href={DASHBOARD_ROUTES.analyticsProfile} active={active === "analytics-profile"} sub />
                </>
              )}
              {!isAdmin && <SideLink icon={Settings} label={t("showcase.analytics.nav.settings")} href={DASHBOARD_ROUTES.calendar} active={active === "settings"} chevron />}
            </>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <Link href={`${ROUTES.home}#bento-title`} className="inline-flex h-10 items-center justify-between rounded-[8px] bg-[var(--sc-ink)] px-3 text-[14px] font-semibold text-white hover:bg-black">
            {t("showcase.footer.howItWorks")}
            <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
          <div className="flex items-center gap-3 px-1">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[14px] font-bold text-[var(--sc-ink)]" aria-hidden="true">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-[var(--sc-ink)]" dir="auto">{displayName || t("showcase.analytics.brand")}</p>
              <p className="truncate text-[12px] text-[#6c6c84]" dir={signedIn ? "ltr" : undefined}>{signedIn ? email : t("showcase.analytics.showcaseAccount")}</p>
            </div>
            {signedIn && (
              <button type="button" onClick={() => void logout()} className="inline-flex size-8 items-center justify-center rounded-[6px] text-[#6c6c84] hover:bg-black/5 hover:text-[var(--sc-ink)]" aria-label={t("auth.logout")}>
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phones / tablets: the sections as a scrollable tab strip. */}
        <nav className="sc-rail flex gap-1 overflow-x-auto border-b border-[var(--sc-hairline)] px-3 py-2 lg:hidden" aria-label={t("showcase.analytics.sidebar")}>
          {[...items, ...(isMentee ? [] : [{ key: "analytics-profile" as const, icon: BarChart3, label: t("showcase.analytics.nav.analytics"), href: DASHBOARD_ROUTES.analyticsProfile }])].map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn("inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-medium", active === item.key || (item.key === "analytics-profile" && analyticsOpen) ? "bg-[var(--sc-ink)] text-white" : "text-[var(--sc-ink)] hover:bg-[var(--sc-grey)]")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}

/** Page header shared by the dashboard pages: title, optional segmented pills, optional trailing actions. */
export function DashboardHeader({ title, pills, trailing }: { title: string; pills?: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--sc-hairline)] px-4 pb-5 pt-6 sm:px-8 lg:px-12 lg:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="page-title" tabIndex={-1} className="text-[28px] font-bold text-[var(--sc-ink)] md:text-[34px]">
          {title}
        </h1>
        {trailing}
      </div>
      {pills && <div className="mt-5 flex flex-wrap gap-2">{pills}</div>}
    </div>
  );
}

/** Outlined pill (Figma "1:1 Calls / Settings / Schedule"), active = ink border + bold. */
export function Pill({ active, children, onClick, href }: { active?: boolean; children: React.ReactNode; onClick?: () => void; href?: string }) {
  const cls = cn(
    "inline-flex h-10 items-center rounded-full border px-4 text-[14px] transition-colors duration-fast",
    active ? "border-[var(--sc-ink)] font-bold text-[var(--sc-ink)]" : "border-[#d9d9d9] text-[var(--sc-ink)] hover:border-[var(--sc-ink)]",
  );
  if (href) {
    return (
      <Link href={href} className={cls} aria-current={active ? "page" : undefined}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}
