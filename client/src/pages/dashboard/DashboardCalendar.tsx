import * as React from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarCog, CalendarDays, Check, ChevronDown, Clock3, ExternalLink, Loader2, MapPin, Plus, RefreshCcw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DashboardHeader, DashboardShell, Pill, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/activity";
import { AVAILABILITY_QUERY_KEY } from "@/lib/availability";
import type { MentorAvailability } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { viewerTimeZone } from "@/lib/format";
import { getLocalValue, setLocalValue } from "@/lib/localStore";
import { mentorService } from "@/lib/services";
import { timeZoneChoices, utcOffsetLabel } from "@/lib/timezones";
import { cn } from "@/lib/utils";
import { useOwnProfile } from "@/pages/dashboard/data";
import { DashboardError, DashboardLoading, ProfileNeededCard } from "@/pages/dashboard/states";

/**
 * Calendar `/dashboard/calendar` (Figma "Calendar" page): Settings and the
 * weekly Schedule.
 *
 * Database mode (design C8, F13): office hours are the mentor's
 * `mentor_availability` rows, replaced in one transaction through
 * `mentorService.setAvailability` (Monday..Sunday → 1..6,0) — several
 * windows per day are kept; the time zone is the mentor row's `timezone`.
 * The booking window, notice period and calendar connections live on the
 * mentor's Cal.com event type, so this page links there (and to the Cal.com
 * sync panel in Profile settings) instead of showing controls that save
 * nothing. `calendar_updated` is logged only after a successful save.
 *
 * Local (demo) mode keeps the per-browser settings as before.
 */
type Tab = "settings" | "schedule";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = (typeof DAYS)[number];
/** Database weekday numbers (0 = Sunday) for the Monday-first display order. */
const DAY_INDEX: Record<Day, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
const BOOKING_PERIODS = ["1m", "2m", "3m", "6m"] as const;
/** Cal.com's own availability page (booking window, notice, connected calendars). */
const CAL_AVAILABILITY_URL = "https://app.cal.com/availability";

function Row({ icon: Icon, title, sub, children }: { icon: typeof MapPin; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 border-b border-[var(--sc-hairline)] py-6 md:grid-cols-[minmax(0,1fr)_270px] md:items-center">
      <div className="flex gap-4">
        <Icon className="mt-0.5 size-5 shrink-0 text-[var(--sc-ink)]" strokeWidth={1.5} aria-hidden="true" />
        <div>
          <p className="text-[16px] font-semibold text-[var(--sc-ink)]">{title}</p>
          <p className="mt-1 text-[14px] text-[#6c6c84]">{sub}</p>
        </div>
      </div>
      {children && <div className="md:ps-4">{children}</div>}
    </div>
  );
}

const selectCls = "h-11 w-full appearance-none rounded-[6px] border border-[#d9d9d9] bg-white pe-10 ps-3 text-[14px] text-[var(--sc-ink)]";
const timeCls = "h-11 rounded-[6px] border border-[#d9d9d9] bg-white px-2 text-[var(--sc-ink)] aria-[invalid=true]:border-destructive md:h-10";

function TimezoneSelect({ id, value, onChange }: { id: string; value: string; onChange: (tz: string) => void }) {
  const { t } = useTranslation();
  const zones = React.useMemo(() => timeZoneChoices(value), [value]);
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {t("showcase.calendar.timezone")}
      </label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} data-testid="select-calendar-timezone">
          {zones.map((z) => (
            <option key={z} value={z}>
              ({utcOffsetLabel(z)}) {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[#6c6c84]" aria-hidden="true" />
      </div>
    </>
  );
}

export default function DashboardCalendar() {
  return IS_LOCAL ? <LocalCalendar /> : <DatabaseCalendar />;
}

/* ============================ Database mode ============================ */

interface Window {
  key: string;
  day: number;
  from: string;
  to: string;
}

const hhmm = (value: string | null | undefined) => String(value ?? "").slice(0, 5);

function toWindows(rows: MentorAvailability[]): Window[] {
  return rows
    .filter((r) => r.is_active !== false)
    .map((r) => ({ key: r.id, day: r.day_of_week, from: hhmm(r.start_time), to: hhmm(r.end_time) }));
}

const serializeWindows = (windows: Window[]) =>
  JSON.stringify(
    windows
      .map(({ day, from, to }) => ({ day, from, to }))
      .sort((a, b) => a.day - b.day || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  );

function DatabaseCalendar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { displayName } = useDashboardIdentity();
  const queryClient = useQueryClient();
  const own = useOwnProfile();
  const mentor = own.mentor;
  const mentorId = user?.user_type === "mentor" ? user.profile_id ?? null : null;
  const [tab, setTab] = React.useState<Tab>("settings");
  const ids = React.useId();

  const availabilityQuery = useQuery<MentorAvailability[]>({
    queryKey: ["dashboard", "availability", mentorId],
    enabled: Boolean(mentorId),
    queryFn: () => mentorService.getAvailability(mentorId!),
  });

  const [tz, setTz] = React.useState<string | null>(null);
  const [windows, setWindows] = React.useState<Window[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Hydrate once from the database; later refetches do not overwrite edits in progress.
  React.useEffect(() => {
    if (mentor && tz === null) setTz(mentor.timezone || viewerTimeZone());
  }, [mentor, tz]);
  React.useEffect(() => {
    if (availabilityQuery.data && windows === null) setWindows(toWindows(availabilityQuery.data));
  }, [availabilityQuery.data, windows]);

  if (user?.user_type === "mentor" && !mentorId) {
    return (
      <DashboardShell active="calendar">
        <DashboardHeader title={t("showcase.analytics.nav.calendar")} />
        <div className="px-4 py-6 sm:px-8 lg:px-12">
          <ProfileNeededCard role="mentor" />
        </div>
      </DashboardShell>
    );
  }

  const loading = own.isLoading || availabilityQuery.isLoading || tz === null || windows === null;
  // A profile id whose mentors row does not come back (deleted, or unreadable) would
  // otherwise leave the timezone unset and the skeleton up forever: show the error with Retry.
  const mentorMissing = Boolean(mentorId) && !own.isLoading && !own.isError && !mentor;
  const failed = own.isError || availabilityQuery.isError || mentorMissing;
  const serverWindows = availabilityQuery.data ? toWindows(availabilityQuery.data) : [];
  const inactiveRows = (availabilityQuery.data ?? []).filter((r) => r.is_active === false);
  const tzChanged = Boolean(mentor && tz && tz !== (mentor.timezone || viewerTimeZone()));
  const windowsChanged = windows !== null && serializeWindows(windows) !== serializeWindows(serverWindows);
  const invalid = new Set((windows ?? []).filter((w) => !w.from || !w.to || w.to <= w.from).map((w) => w.key));
  const dirty = tzChanged || windowsChanged;

  const save = async () => {
    if (!mentorId || !mentor || windows === null || tz === null) return;
    setSaveError(null);
    if (invalid.size > 0) {
      setSaveError(t("showcase.calendar.fixTimes"));
      setTab("schedule");
      return;
    }
    if (!dirty) return;
    setSaving(true);
    try {
      if (tzChanged) {
        const row = await mentorService.update(mentorId, { timezone: tz });
        if (!row) throw new Error("timezone_not_saved");
      }
      if (windowsChanged) {
        await mentorService.setAvailability(mentorId, [
          ...windows.map((w) => ({ day_of_week: w.day, start_time: w.from, end_time: w.to, is_active: true })),
          // Windows paused in the mentor portal are kept as they are.
          ...inactiveRows.map((r) => ({ day_of_week: r.day_of_week, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time), is_active: false })),
        ]);
      }
      await Promise.all(
        [["dashboard"], AVAILABILITY_QUERY_KEY, ["mentor"], ["mentors"]].map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })),
      );
      const fresh = await availabilityQuery.refetch();
      if (fresh.data) setWindows(toWindows(fresh.data));
      logActivity({ actor_type: "mentor", actor_id: mentorId, actor_name: mentor.name || displayName, type: "calendar_updated", subject_type: "settings", subject_id: mentorId, summary: t("showcase.activity.summaries.calendarUpdated") });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
      toast.success(t("showcase.calendar.savedToast"));
    } catch {
      setSaveError(t("showcase.calendar.saveError"));
      toast.error(t("showcase.calendar.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const addWindow = (day: number) =>
    setWindows((current) => [...(current ?? []), { key: `new-${Date.now()}-${(current ?? []).length}`, day, from: "09:00", to: "17:00" }]);
  const updateWindow = (key: string, patch: Partial<Window>) => setWindows((current) => (current ?? []).map((w) => (w.key === key ? { ...w, ...patch } : w)));
  const removeWindow = (key: string) => setWindows((current) => (current ?? []).filter((w) => w.key !== key));

  const zone = (tz ?? viewerTimeZone()).replace(/_/g, " ");

  return (
    <DashboardShell active="calendar">
      <DashboardHeader
        title={t("showcase.analytics.nav.calendar")}
        pills={(["settings", "schedule"] as Tab[]).map((k) => (
          <Pill key={k} active={tab === k} onClick={() => setTab(k)}>
            {t(`showcase.calendar.${k}`)}
          </Pill>
        ))}
      />
      <div className="px-4 py-2 sm:px-8 lg:px-12">
        {failed ? (
          <div className="py-6">
            <DashboardError
              message={t("showcase.calendar.loadError")}
              onRetry={() => {
                own.refetch();
                void availabilityQuery.refetch();
              }}
            />
          </div>
        ) : loading ? (
          <DashboardLoading rows={4} />
        ) : tab === "settings" ? (
          <>
            <Row icon={MapPin} title={t("showcase.calendar.timezone")} sub={t("showcase.calendar.timezoneSubLive")}>
              <TimezoneSelect id={`${ids}-tz`} value={tz!} onChange={setTz} />
            </Row>
            <Row icon={CalendarCog} title={t("showcase.calendar.calcomTitle")} sub={t("showcase.calendar.calcomSub")}>
              <a
                href={CAL_AVAILABILITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[6px] border border-[#d9d9d9] px-4 text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]"
                data-testid="link-cal-availability"
              >
                {t("showcase.calendar.calcomCta")}
                <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </a>
            </Row>
            <Row icon={RefreshCcw} title={t("showcase.calendar.syncTitle")} sub={t("showcase.calendar.syncSub")}>
              <Link
                href="/dashboard/profile#cal-sync"
                className="inline-flex h-11 w-full items-center justify-center rounded-[6px] bg-[var(--sc-ink)] px-4 text-[14px] font-semibold text-white hover:bg-black"
                data-testid="link-cal-sync"
              >
                {t("showcase.calendar.syncCta")}
              </Link>
            </Row>
          </>
        ) : (
          <div className="py-4">
            <p className="text-[14px] text-[#6c6c84]">{t("showcase.calendar.scheduleSubLive", { zone })}</p>
            <ul className="mt-4 divide-y divide-[var(--sc-hairline)] rounded-[12px] border border-[var(--sc-hairline)]" data-testid="list-office-hours">
              {DAYS.map((d) => {
                const day = DAY_INDEX[d];
                const dayWindows = (windows ?? []).filter((w) => w.day === day).sort((a, b) => a.from.localeCompare(b.from));
                return (
                  <li key={d} className="grid grid-cols-1 items-start gap-3 px-4 py-3 sm:grid-cols-[120px_1fr_auto]" data-testid={`office-day-${d}`}>
                    <p className="pt-2 text-[15px] font-semibold text-[var(--sc-ink)]">{t(`showcase.calendar.days.${d}`)}</p>
                    <div className="space-y-2">
                      {dayWindows.length === 0 && <p className="pt-2 text-[13px] text-[#6c6c84]">{t("showcase.calendar.unavailable")}</p>}
                      {dayWindows.map((w) => {
                        const bad = invalid.has(w.key);
                        return (
                          <div key={w.key} className="flex flex-wrap items-center gap-2 text-[14px]">
                            <input
                              type="time"
                              value={w.from}
                              onChange={(e) => updateWindow(w.key, { from: e.target.value })}
                              className={timeCls}
                              aria-label={t("showcase.calendar.fromDay", { day: t(`showcase.calendar.days.${d}`) })}
                              aria-invalid={bad || undefined}
                              data-testid={`input-from-${d}`}
                            />
                            <span className="text-[#6c6c84]" aria-hidden="true">
                              –
                            </span>
                            <input
                              type="time"
                              value={w.to}
                              onChange={(e) => updateWindow(w.key, { to: e.target.value })}
                              className={timeCls}
                              aria-label={t("showcase.calendar.toDay", { day: t(`showcase.calendar.days.${d}`) })}
                              aria-invalid={bad || undefined}
                              data-testid={`input-to-${d}`}
                            />
                            <button
                              type="button"
                              onClick={() => removeWindow(w.key)}
                              className="inline-flex size-11 items-center justify-center rounded-[6px] text-[#6c6c84] hover:bg-[var(--sc-sand)] hover:text-[var(--sc-ink)] md:size-10"
                              aria-label={t("showcase.calendar.removeWindow", { day: t(`showcase.calendar.days.${d}`) })}
                              data-testid={`button-remove-${d}`}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                            {bad && (
                              <span className="text-[12px] font-medium text-destructive" role="alert">
                                {t("showcase.calendar.endAfterStart")}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => addWindow(day)}
                      className="inline-flex h-11 items-center gap-1.5 justify-self-start rounded-[6px] px-3 text-[13px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)] md:h-10"
                      aria-label={t("showcase.calendar.addWindowDay", { day: t(`showcase.calendar.days.${d}`) })}
                      data-testid={`button-add-${d}`}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      {t("showcase.calendar.addWindow")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {!failed && !loading && (
          <div className="flex flex-wrap items-center gap-3 py-6">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              aria-busy={saving || undefined}
              className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black disabled:opacity-70"
              data-testid="button-save-calendar"
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : saved ? <Check className="size-4" aria-hidden="true" /> : null}
              {saved ? t("showcase.calendar.saved") : t("showcase.calendar.save")}
            </button>
            <p className={cn("text-[13px]", saveError ? "font-medium text-destructive" : "text-[#6c6c84]")} role={saveError ? "alert" : undefined} data-testid="text-calendar-status">
              {saveError ?? (dirty ? t("showcase.calendar.unsaved") : t("showcase.calendar.saveHintLive"))}
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

/* ============================ Local (demo) mode ============================ */

type DayRow = { on: boolean; from: string; to: string };
interface CalendarSettings {
  tz: string;
  period: (typeof BOOKING_PERIODS)[number];
  notice: number;
  noticeUnit: "minutes" | "hours";
  policy: "free" | "24h" | "none";
  days: Record<Day, DayRow>;
}
const DEFAULT_DAYS: CalendarSettings["days"] = {
  mon: { on: true, from: "10:00", to: "17:00" },
  tue: { on: true, from: "10:00", to: "17:00" },
  wed: { on: true, from: "10:00", to: "17:00" },
  thu: { on: true, from: "10:00", to: "17:00" },
  fri: { on: true, from: "10:00", to: "14:00" },
  sat: { on: false, from: "10:00", to: "12:00" },
  sun: { on: false, from: "10:00", to: "12:00" },
};

function LocalCalendar() {
  const { t } = useTranslation();
  const { email, displayName } = useDashboardIdentity();
  const { user } = useAuth();
  // Saved per account in this browser (demo mode has no database).
  const storageKey = `calendar:${email || "showcase"}`;
  const stored = React.useMemo(() => getLocalValue<CalendarSettings>(storageKey), [storageKey]);
  const [tab, setTab] = React.useState<Tab>("settings");
  const [tz, setTz] = React.useState(() => stored?.tz ?? viewerTimeZone());
  const [period, setPeriod] = React.useState<(typeof BOOKING_PERIODS)[number]>(stored?.period ?? "2m");
  const [notice, setNotice] = React.useState(stored?.notice ?? 240);
  const [noticeUnit, setNoticeUnit] = React.useState<"minutes" | "hours">(stored?.noticeUnit ?? "minutes");
  const [policy, setPolicy] = React.useState<"free" | "24h" | "none">(stored?.policy ?? "24h");
  const [days, setDays] = React.useState<CalendarSettings["days"]>(stored?.days ?? DEFAULT_DAYS);
  const [saved, setSaved] = React.useState(false);
  const ids = { tz: React.useId(), period: React.useId(), notice: React.useId(), unit: React.useId(), policy: React.useId() };

  const save = () => {
    setLocalValue<CalendarSettings>(storageKey, { tz, period, notice, noticeUnit, policy, days });
    if (user?.profile_id) {
      logActivity({ actor_type: "mentor", actor_id: user.profile_id, actor_name: displayName, type: "calendar_updated", subject_type: "settings", subject_id: user.profile_id, summary: t("showcase.activity.summaries.calendarUpdated") });
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <DashboardShell active="calendar">
      <DashboardHeader
        title={t("showcase.analytics.nav.calendar")}
        pills={(["settings", "schedule"] as Tab[]).map((k) => (
          <Pill key={k} active={tab === k} onClick={() => setTab(k)}>
            {t(`showcase.calendar.${k}`)}
          </Pill>
        ))}
      />
      <div className="px-4 py-2 sm:px-8 lg:px-12">
        {tab === "settings" ? (
          <>
            <Row icon={MapPin} title={t("showcase.calendar.timezone")} sub={t("showcase.calendar.timezoneSub")}>
              <TimezoneSelect id={ids.tz} value={tz} onChange={setTz} />
            </Row>
            <Row icon={CalendarCog} title={t("showcase.calendar.policy")} sub={t("showcase.calendar.policySub")}>
              <label htmlFor={ids.policy} className="sr-only">
                {t("showcase.calendar.policy")}
              </label>
              <div className="relative">
                <select id={ids.policy} value={policy} onChange={(e) => setPolicy(e.target.value as typeof policy)} className={selectCls}>
                  {(["free", "24h", "none"] as const).map((p) => (
                    <option key={p} value={p}>
                      {t(`showcase.calendar.policies.${p}`)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[#6c6c84]" aria-hidden="true" />
              </div>
            </Row>
            <Row icon={CalendarDays} title={t("showcase.calendar.bookingPeriod")} sub={t("showcase.calendar.bookingPeriodSub")}>
              <label htmlFor={ids.period} className="sr-only">
                {t("showcase.calendar.bookingPeriod")}
              </label>
              <div className="relative">
                <select id={ids.period} value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className={selectCls}>
                  {BOOKING_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {t(`showcase.calendar.periods.${p}`)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[#6c6c84]" aria-hidden="true" />
              </div>
            </Row>
            <Row icon={Clock3} title={t("showcase.calendar.notice")} sub={t("showcase.calendar.noticeSub")}>
              <div className="flex">
                <label htmlFor={ids.notice} className="sr-only">
                  {t("showcase.calendar.notice")}
                </label>
                <input id={ids.notice} type="number" min={0} value={notice} onChange={(e) => setNotice(Number(e.target.value))} className="h-11 w-full rounded-s-[6px] border border-[#d9d9d9] bg-white px-3 text-[14px] text-[var(--sc-ink)]" />
                <label htmlFor={ids.unit} className="sr-only">
                  {t("showcase.calendar.unit")}
                </label>
                <div className="relative">
                  <select id={ids.unit} value={noticeUnit} onChange={(e) => setNoticeUnit(e.target.value as typeof noticeUnit)} className="h-11 appearance-none rounded-e-[6px] border border-s-0 border-[#d9d9d9] bg-white pe-9 ps-3 text-[14px] text-[var(--sc-ink)]">
                    <option value="minutes">{t("showcase.calendar.minutes")}</option>
                    <option value="hours">{t("showcase.calendar.hours")}</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[#6c6c84]" aria-hidden="true" />
                </div>
              </div>
            </Row>
            <Row icon={Settings2} title={t("showcase.calendar.integrationTitle")} sub={t("showcase.calendar.integrationSub")}>
              <button type="button" onClick={save} className="inline-flex h-11 w-full items-center justify-center rounded-[6px] bg-[#0e7a5b] px-4 text-[14px] font-semibold text-white hover:bg-[#0b6449]">
                {t("showcase.calendar.integrationCta")}
              </button>
            </Row>
          </>
        ) : (
          <div className="py-4">
            <p className="text-[14px] text-[#6c6c84]">{t("showcase.calendar.scheduleSub", { zone: tz.replace(/_/g, " ") })}</p>
            <ul className="mt-4 divide-y divide-[var(--sc-hairline)] rounded-[12px] border border-[var(--sc-hairline)]">
              {DAYS.map((d) => {
                const row = days[d];
                return (
                  <li key={d} className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[120px_1fr]">
                    <label className="inline-flex items-center gap-3 text-[15px] font-semibold text-[var(--sc-ink)]">
                      <input type="checkbox" checked={row.on} onChange={(e) => setDays({ ...days, [d]: { ...row, on: e.target.checked } })} className="size-4 accent-[var(--sc-ink)]" />
                      {t(`showcase.calendar.days.${d}`)}
                    </label>
                    <div className={cn("flex items-center gap-2 text-[14px]", !row.on && "opacity-40")}>
                      <input type="time" value={row.from} disabled={!row.on} onChange={(e) => setDays({ ...days, [d]: { ...row, from: e.target.value } })} className="h-10 rounded-[6px] border border-[#d9d9d9] bg-white px-2 text-[var(--sc-ink)]" aria-label={t("showcase.calendar.from")} />
                      <span className="text-[#6c6c84]">–</span>
                      <input type="time" value={row.to} disabled={!row.on} onChange={(e) => setDays({ ...days, [d]: { ...row, to: e.target.value } })} className="h-10 rounded-[6px] border border-[#d9d9d9] bg-white px-2 text-[var(--sc-ink)]" aria-label={t("showcase.calendar.to")} />
                      {!row.on && <span className="ms-2 text-[13px] text-[#6c6c84]">{t("showcase.calendar.unavailable")}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="flex items-center gap-3 py-6">
          <button type="button" onClick={save} className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black">
            {saved ? <Check className="size-4" aria-hidden="true" /> : null}
            {saved ? t("showcase.calendar.saved") : t("showcase.calendar.save")}
          </button>
          <p className="text-[13px] text-[#6c6c84]">{t("showcase.calendar.saveHint")}</p>
        </div>
      </div>
    </DashboardShell>
  );
}
