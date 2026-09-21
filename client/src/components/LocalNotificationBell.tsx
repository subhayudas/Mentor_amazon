import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Bell, CalendarClock } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useActivity } from "@/lib/activity";
import { dueReminders } from "@/lib/reminders";
import { useLocalCollection } from "@/lib/localStore";

/**
 * Notification bell for local mode: session reminders (next 24 h, from the
 * signed-in person's own bookings) plus the latest activity they are party
 * to. Against a live project the database-backed `NotificationBell` is used
 * instead; the reminder rows there come from the hourly cron.
 */
export function LocalNotificationBell() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const bookings = useLocalCollection("bookings");
  const { events } = useActivity(user?.profile_id ?? null, { limit: 8 });
  const own = React.useMemo(() => bookings.filter((b) => (user?.user_type === "mentor" ? b.mentor_id === user.profile_id : b.mentee_id === user?.profile_id)), [bookings, user]);
  const reminders = React.useMemo(() => dueReminders(own), [own]);
  const fmt = React.useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: "short", hour: "numeric", minute: "2-digit" }), [i18n.language]);
  const count = reminders.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-10" aria-label={t("showcase.reminders.bell", { count })} data-testid="button-local-bell">
          <Bell className="size-5" aria-hidden="true" />
          {count > 0 && <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[#d5534d] px-1 text-[10px] font-bold text-white">{count}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("showcase.reminders.title")}</DropdownMenuLabel>
        {reminders.length === 0 ? (
          <p className="px-2 pb-2 text-[13px] text-muted-foreground">{t("showcase.reminders.none")}</p>
        ) : (
          reminders.map((r) => (
            <DropdownMenuItem key={r.booking.id} asChild>
              <Link href="/dashboard/bookings" className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-[13px] font-medium">{t(r.kind === "1h" ? "showcase.reminders.inHour" : "showcase.reminders.tomorrow", { when: fmt.format(r.startsAt) })}</span>
                  <span className="block text-[12px] text-muted-foreground">{r.booking.goal ?? t("showcase.bookings.session")}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("showcase.activity.title")}</DropdownMenuLabel>
        {events.slice(0, 5).map((e) => (
          <DropdownMenuItem key={e.id} asChild>
            <Link href="/dashboard/activity" className="text-[13px]">
              {e.summary}
            </Link>
          </DropdownMenuItem>
        ))}
        {events.length === 0 && <p className="px-2 pb-2 text-[13px] text-muted-foreground">{t("showcase.activity.empty")}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
