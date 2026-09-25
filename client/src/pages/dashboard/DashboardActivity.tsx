import * as React from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck, CalendarX, CheckCircle2, Heart, HeartOff, MessageSquare, Send, Settings2, UserPlus, UserRound, Bell, type LucideIcon } from "lucide-react";

import { DashboardHeader, DashboardShell, Pill, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import { useActivity } from "@/lib/activity";
import { triggerSummary } from "@/lib/activitySummary";
import type { ActivityEvent, ActivityType } from "@/lib/database";
import { cn } from "@/lib/utils";
import { clientSummary } from "@/pages/dashboard/activityLines";
import { DashboardError, DashboardLoading } from "@/pages/dashboard/states";

/**
 * Activity `/dashboard/activity`: the append-only audit feed, chronological,
 * filtered by kind. A mentor or mentee sees every event they are party to;
 * an admin (or the showcase account) sees everything. Booking events come
 * from the database trigger and are rendered from their `meta` in the
 * reader's language (design C9, F22); the client's own events (registrations,
 * profile and calendar saves, favourites) are rendered by type in the reader's
 * language too (R1-46, R1-74). The stored line is only the last resort.
 */
const ICONS: Record<ActivityType, LucideIcon> = {
  mentor_registered: UserPlus,
  mentee_registered: UserPlus,
  profile_updated: UserRound,
  calendar_updated: Settings2,
  request_sent: Send,
  request_accepted: CheckCircle2,
  request_declined: CalendarX,
  booking_confirmed: CalendarCheck,
  booking_rescheduled: CalendarCheck,
  booking_canceled: CalendarX,
  session_completed: CheckCircle2,
  feedback_left: MessageSquare,
  favorite_added: Heart,
  favorite_removed: HeartOff,
  reminder_sent: Bell,
  mentor_listed: CheckCircle2,
  mentor_unlisted: CalendarX,
  mentee_verified: CheckCircle2,
  mentee_rejected: CalendarX,
  booking_time_requested: CalendarCheck,
  booking_time_declined: CalendarX,
};

type Group = "all" | "bookings" | "accounts" | "favorites" | "settings";
const GROUPS: Record<Exclude<Group, "all">, ActivityType[]> = {
  bookings: [
    "request_sent",
    "request_accepted",
    "request_declined",
    "booking_confirmed",
    "booking_rescheduled",
    "booking_canceled",
    "session_completed",
    "feedback_left",
    "reminder_sent",
    "booking_time_requested",
    "booking_time_declined",
  ],
  accounts: ["mentor_registered", "mentee_registered", "mentor_listed", "mentor_unlisted", "mentee_verified", "mentee_rejected"],
  favorites: ["favorite_added", "favorite_removed"],
  settings: ["profile_updated", "calendar_updated"],
};

export function ActivityList({ events, lang, compact }: { events: ActivityEvent[]; lang: string; compact?: boolean }) {
  const { t } = useTranslation();
  const fmt = React.useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), [lang]);
  const whenFmt = React.useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), [lang]);
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-[14px] text-[#6c6c84]" data-testid="activity-empty">
        {t("showcase.activity.empty")}
      </p>
    );
  }
  const fallbacks = { mentor: t("showcase.bookings.mentor"), mentee: t("showcase.bookings.mentee") };
  const line = (e: ActivityEvent) => {
    const localized = triggerSummary(e, { formatWhen: (iso) => whenFmt.format(new Date(iso)), fallbacks }) ?? clientSummary(e);
    return localized ? t(`showcase.activity.summaries.${localized.key}`, localized.params) : e.summary;
  };
  return (
    <ol className={cn("divide-y divide-[var(--sc-hairline)]", compact && "text-[13px]")} data-testid="activity-list">
      {events.map((e) => {
        const Icon = ICONS[e.type] ?? Bell;
        return (
          <li key={e.id} className={cn("flex items-start gap-3", compact ? "py-2.5" : "py-4")} data-testid="activity-item" data-type={e.type}>
            <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--sc-sand)] text-[var(--sc-ink)]", compact ? "size-8" : "size-10")} aria-hidden="true">
              <Icon className={compact ? "size-4" : "size-5"} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[var(--sc-ink)]", compact ? "text-[13px]" : "text-[15px]")} dir="auto">
                {line(e)}
              </p>
              <p className="mt-0.5 text-[12px] text-[#6c6c84]">
                {e.actor_name ? `${e.actor_name} · ` : ""}
                {t(`showcase.activity.types.${e.type}`)} · <time dateTime={e.created_at}>{fmt.format(new Date(e.created_at))}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function DashboardActivity() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { signedIn } = useDashboardIdentity();
  const [group, setGroup] = React.useState<Group>("all");
  const { events, isLoading, isError, refetch } = useActivity(user?.profile_id ?? null, { all: !signedIn || user?.user_type === "admin" });
  const shown = group === "all" ? events : events.filter((e) => GROUPS[group].includes(e.type));

  return (
    <DashboardShell active="activity">
      <DashboardHeader
        title={t("showcase.activity.title")}
        pills={(["all", "bookings", "accounts", "favorites", "settings"] as Group[]).map((g) => (
          <Pill key={g} active={group === g} onClick={() => setGroup(g)}>
            {t(`showcase.activity.groups.${g}`)}
          </Pill>
        ))}
      />
      <div className="px-4 py-4 sm:px-8 lg:px-12">
        <p className="text-[13px] text-[#6c6c84]">{t("showcase.activity.lede")}</p>
        {isError ? (
          <div className="py-6">
            <DashboardError message={t("showcase.activity.loadError")} onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <DashboardLoading rows={4} />
        ) : (
          <ActivityList events={shown} lang={i18n.language} />
        )}
      </div>
    </DashboardShell>
  );
}
