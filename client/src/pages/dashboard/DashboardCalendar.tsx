import * as React from "react";
import { useTranslation } from "react-i18next";
import { CalendarCog, CalendarDays, ChevronDown, Clock3, MapPin, Play, Settings2, Check } from "lucide-react";

import { DashboardHeader, DashboardShell, Pill, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import { getLocalValue, setLocalValue } from "@/lib/localStore";
import { viewerTimeZone } from "@/lib/format";
import { timeZoneChoices, utcOffsetLabel } from "@/lib/timezones";
import { cn } from "@/lib/utils";

/**
 * Calendar `/dashboard/calendar` (Figma "Calendar" page): Settings rows —
 * timezone, reschedule policy, booking period, notice period, calendar
 * integration — and the Schedule tab with the weekly office hours. State is
 * local (a `mentor_availability` write lands here once the DB is back).
 */
type Tab = "settings" | "schedule";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const BOOKING_PERIODS = ["1m", "2m", "3m", "6m"] as const;

function Row({ icon: Icon, title, sub, children }: { icon: typeof MapPin; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-[var(--sc-hairline)] py-6 md:grid-cols-[minmax(0,1fr)_270px] md:items-center">
      <div className="flex gap-4">
        <Icon className="mt-0.5 size-5 shrink-0 text-[var(--sc-ink)]" strokeWidth={1.5} aria-hidden="true" />
        <div>
          <p className="text-[16px] font-semibold text-[var(--sc-ink)]">{title}</p>
          <p className="mt-1 text-[14px] text-[#6c6c84]">{sub}</p>
        </div>
      </div>
      <div className="md:ps-4">{children}</div>
    </div>
  );
}

const selectCls = "h-11 w-full appearance-none rounded-[6px] border border-[#d9d9d9] bg-white pe-10 ps-3 text-[14px] text-[var(--sc-ink)]";

type DayRow = { on: boolean; from: string; to: string };
interface CalendarSettings {
  tz: string;
  period: (typeof BOOKING_PERIODS)[number];
  notice: number;
  noticeUnit: "minutes" | "hours";
  policy: "free" | "24h" | "none";
  days: Record<(typeof DAYS)[number], DayRow>;
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

export default function DashboardCalendar() {
  const { t } = useTranslation();
  const { email } = useDashboardIdentity();
  // Saved per account (local store now, the mentor's availability row once the DB is back).
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
  const zones = React.useMemo(() => timeZoneChoices(tz), [tz]);
  const ids = { tz: React.useId(), period: React.useId(), notice: React.useId(), unit: React.useId(), policy: React.useId() };

  const save = () => {
    setLocalValue<CalendarSettings>(storageKey, { tz, period, notice, noticeUnit, policy, days });
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
        trailing={
          <a href="#how-it-works" className="inline-flex h-10 items-center gap-2 rounded-full border border-[#c9c2f5] bg-[#ece8ff] px-4 text-[14px] font-semibold text-[#4b3fb8]">
            {t("showcase.calendar.howItWorks")}
            <Play className="size-3.5 fill-current" aria-hidden="true" />
          </a>
        }
      />
      <div className="px-4 py-2 sm:px-8 lg:px-12">
        {tab === "settings" ? (
          <>
            <Row icon={MapPin} title={t("showcase.calendar.timezone")} sub={t("showcase.calendar.timezoneSub")}>
              <label htmlFor={ids.tz} className="sr-only">
                {t("showcase.calendar.timezone")}
              </label>
              <div className="relative">
                <select id={ids.tz} value={tz} onChange={(e) => setTz(e.target.value)} className={selectCls}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      ({utcOffsetLabel(z)}) {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[#6c6c84]" aria-hidden="true" />
              </div>
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
                  <li key={d} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[120px_1fr]">
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
          <p className="text-[13px] text-[#6c6c84]" id="how-it-works">
            {t("showcase.calendar.saveHint")}
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
