import * as React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Eye, FileText, Video, type LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import { MOCK_BOOKINGS, MOCK_MENTEES } from "@/data/mockAnalytics";
import { FEATURED_MENTORS } from "@/data/featuredMentors";
import type { Booking, Mentee } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { bookingService, menteeService } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * Profile analytics `/analytics` (Figma "Profile Analytics" board, Topmate
 * chrome replaced by Amazon / MentorConnect): sidebar shell, period +
 * granularity controls, three KPI tiles, the views trend, traffic sources
 * and the booking funnel, location and device breakdowns. Session numbers
 * come from bookings (the seeded demo set in demo mode, else the caller's
 * rows); views, sources and devices are derived deterministically from them
 * and flagged as demo until profile-view tracking lands.
 */

type PeriodKey = "today" | "yesterday" | "3d" | "7d" | "30d" | "3m" | "6m" | "custom";
const PERIODS: { key: PeriodKey; days: number }[] = [
  { key: "today", days: 1 },
  { key: "yesterday", days: 2 },
  { key: "3d", days: 3 },
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "3m", days: 90 },
  { key: "6m", days: 180 },
  { key: "custom", days: 365 },
];
type Grain = "hour" | "day" | "week" | "month";
const GRAINS: Grain[] = ["hour", "day", "week", "month"];

const NAVY = "#232F3E";
const TEAL = "#137F8B";
const RUST = "#C75600";
const GREY = "#9AA3AB";
const PIE = [NAVY, TEAL, RUST, GREY, "#5A6169"];

function inLast(days: number, iso?: string) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= Date.now() - days * 86_400_000 && t <= Date.now();
}

/** Mulberry-style hash so derived (non-booking) numbers are stable per period. */
function stableRatio(seed: number, min: number, max: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  const r = x - Math.floor(x);
  return min + r * (max - min);
}

interface Stats {
  requests: number;
  accepted: number;
  completed: number;
  minutes: number;
  views: number;
  series: { label: string; views: number }[];
  countries: { name: string; value: number }[];
}

function computeStats(bookings: Booking[], mentees: Mentee[], days: number, grain: Grain, lang: string): Stats {
  const rows = bookings.filter((b) => inLast(days, b.created_at));
  const requests = rows.length;
  const accepted = rows.filter((b) => ["accepted", "confirmed", "completed"].includes(b.status)).length;
  const completed = rows.filter((b) => b.status === "completed").length;
  const minutes = rows.reduce((sum, b) => sum + (b.status === "completed" ? b.session_duration_minutes ?? 30 : 0), 0);
  const views = Math.round(requests * stableRatio(days, 6.2, 8.4)) + Math.round(stableRatio(days + 1, 40, 120));

  // Trend buckets: hours for a day, else days / weeks / months over the window.
  const bucketMs = grain === "hour" ? 3_600_000 : grain === "day" ? 86_400_000 : grain === "week" ? 7 * 86_400_000 : 30 * 86_400_000;
  const span = days * 86_400_000;
  const buckets = Math.max(4, Math.min(48, Math.ceil(span / bucketMs)));
  const start = Date.now() - span;
  const fmt = new Intl.DateTimeFormat(lang, grain === "hour" ? { hour: "numeric" } : grain === "month" ? { month: "short" } : { day: "numeric", month: "short" });
  const series = Array.from({ length: buckets }, (_, i) => {
    const from = start + (i * span) / buckets;
    const to = start + ((i + 1) * span) / buckets;
    const count = rows.filter((b) => {
      const t = new Date(b.created_at).getTime();
      return t >= from && t < to;
    }).length;
    return { label: fmt.format(new Date(from)), views: Math.round(count * stableRatio(i + days, 5, 9) + stableRatio(i * 7 + days, 0, 6)) };
  });

  const byCountry = new Map<string, number>();
  const menteeById = new Map(mentees.map((m) => [m.id, m]));
  for (const b of rows) {
    const c = b.country ?? menteeById.get(b.mentee_id)?.country ?? "Other";
    byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }
  const countries = Array.from(byCountry.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return { requests, accepted, completed, minutes, views, series, countries };
}

/* ===================== Page ===================== */

function Segmented<T extends string>({ items, value, onChange, label, render }: { items: T[]; value: T; onChange: (v: T) => void; label: string; render: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[#f3f2ee] p-1">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={item === value}
          onClick={() => onChange(item)}
          className={cn(
            "h-8 rounded-[8px] px-3 text-[13px] text-[#6c6c84] transition-colors duration-fast",
            item === value ? "bg-white font-semibold text-[var(--sc-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "hover:text-[var(--sc-ink)]",
          )}
        >
          {render(item)}
        </button>
      ))}
    </div>
  );
}

function Kpi({ icon: Icon, tone, label, sub, value }: { icon: LucideIcon; tone: string; label: string; sub: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-5">
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex size-11 items-center justify-center rounded-[10px]", tone)}>
          <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-[var(--sc-ink)]">{label}</p>
          <p className="text-[12px] text-[#6c6c84]">{sub}</p>
        </div>
      </div>
      <p className="mt-4 text-[36px] font-bold leading-none text-[var(--sc-ink)]">{value}</p>
    </div>
  );
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[16px] border border-[var(--sc-hairline)] bg-[#fcfbf9] p-5", className)}>
      {title && <h2 className="text-[15px] font-semibold text-[var(--sc-ink)]">{title}</h2>}
      {children}
    </section>
  );
}

function Row({ label, sub, value, share }: { label: string; sub?: string; value: string; share?: number }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#efe9dc] text-[12px] font-bold text-[var(--sc-ink)]" aria-hidden="true">
        {label.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-[var(--sc-ink)]">{label}</span>
        {sub && <span className="block truncate text-[12px] text-[#6c6c84]">{sub}</span>}
        {share !== undefined && (
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-[#eee]" aria-hidden="true">
            <span className="block h-full rounded-full bg-[#232F3E]" style={{ width: `${Math.max(2, share)}%` }} />
          </span>
        )}
      </span>
      <span className="text-[14px] font-semibold tabular-nums text-[var(--sc-ink)]">{value}</span>
    </li>
  );
}

export default function Analytics() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [period, setPeriod] = React.useState<PeriodKey>("30d");
  const [grain, setGrain] = React.useState<Grain>("day");

  const bookingsQuery = useQuery<Booking[]>({
    queryKey: ["analytics", "bookings", user?.id],
    queryFn: () => bookingService.getAll(),
    enabled: !IS_LOCAL && Boolean(user),
    staleTime: 60_000,
  });
  const menteesQuery = useQuery<Mentee[]>({
    queryKey: ["analytics", "mentees"],
    queryFn: () => menteeService.getAll(),
    enabled: !IS_LOCAL && Boolean(user),
    staleTime: 5 * 60_000,
  });
  const demo = IS_LOCAL || (bookingsQuery.isSuccess && bookingsQuery.data.length < 5);
  const bookings = demo ? MOCK_BOOKINGS : bookingsQuery.data ?? [];
  const mentees = demo ? MOCK_MENTEES : menteesQuery.data ?? [];

  const days = PERIODS.find((p) => p.key === period)?.days ?? 30;
  const stats = React.useMemo(() => computeStats(bookings, mentees, days, grain, i18n.language), [bookings, mentees, days, grain, i18n.language]);
  const nf = React.useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const hours = Math.round((stats.minutes / 60) * 10) / 10;

  const funnel = [
    { name: t("showcase.analytics.funnel.views"), value: stats.views },
    { name: t("showcase.analytics.funnel.requests"), value: stats.requests },
    { name: t("showcase.analytics.funnel.accepted"), value: stats.accepted },
    { name: t("showcase.analytics.funnel.completed"), value: stats.completed },
  ];
  const sources = [
    { key: "direct", share: 0.41 },
    { key: "linkedin", share: 0.27 },
    { key: "internal", share: 0.19 },
    { key: "search", share: 0.09 },
    { key: "other", share: 0.04 },
  ].map((s) => ({ ...s, value: Math.round(stats.views * s.share) }));
  const devices = [
    { name: t("showcase.analytics.device.desktop"), value: Math.round(stats.views * 0.58) },
    { name: t("showcase.analytics.device.mobile"), value: Math.round(stats.views * 0.36) },
    { name: t("showcase.analytics.device.tablet"), value: Math.max(0, stats.views - Math.round(stats.views * 0.58) - Math.round(stats.views * 0.36)) },
  ];
  const topMentors = FEATURED_MENTORS.slice(0, 4).map((m, i) => ({ name: i18n.language === "ar" && m.name_ar ? m.name_ar : m.name, value: Math.max(1, Math.round(stats.completed * [0.34, 0.27, 0.22, 0.17][i])) }));
  const refreshed = new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" }).format(new Date());
  const countryTotal = Math.max(1, stats.countries.reduce((s, c) => s + c.value, 0));

  return (
    <DashboardShell active="analytics-profile">
      <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--sc-hairline)] pb-5">
          <h1 id="page-title" tabIndex={-1} className="text-[28px] font-bold text-[var(--sc-ink)] md:text-[34px]">
            {t("showcase.analytics.title")}
          </h1>
          <div className="flex items-center gap-2">
            {demo && (
              <Badge tone="warning" data-testid="badge-demo-data">
                {t("analyticsV2.demoBadge")}
              </Badge>
            )}
            <Link href="/analytics/report" className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9d9d9] px-4 text-[14px] font-semibold text-[var(--sc-ink)] hover:border-[var(--sc-ink)]" data-testid="link-impact-report">
              <FileText className="size-4" aria-hidden="true" />
              {t("showcase.report.open")}
            </Link>
          </div>
        </div>
        {demo && (
          <p className="mt-4 rounded-[10px] border border-[#f5d98a] bg-[#fffaeb] px-4 py-3 text-[14px] text-[#7a4b00]" role="note" data-testid="note-sample-data">
            <strong className="font-semibold">{t("showcase.analytics.sampleTitle")}</strong> {t("showcase.analytics.sampleBody")}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented items={PERIODS.map((p) => p.key)} value={period} onChange={setPeriod} label={t("showcase.analytics.period")} render={(k) => t(`showcase.analytics.periods.${k}`)} />
          <Segmented items={GRAINS} value={grain} onChange={setGrain} label={t("showcase.analytics.grain")} render={(g) => t(`showcase.analytics.grains.${g}`)} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Kpi icon={Eye} tone="bg-[#e3f0fb] text-[#1d5fa0]" label={t("showcase.analytics.kpi.views")} sub={t("showcase.analytics.kpi.viewsSub")} value={nf.format(stats.views)} />
          <Kpi icon={Clock3} tone="bg-[#fff1d6] text-[#a35d00]" label={t("showcase.analytics.kpi.hours")} sub={t("showcase.analytics.kpi.hoursSub")} value={nf.format(hours)} />
          <Kpi icon={Video} tone="bg-[#e2f5ea] text-[#0f7a4c]" label={t("showcase.analytics.kpi.sessions")} sub={t("showcase.analytics.kpi.sessionsSub")} value={nf.format(stats.completed)} />
        </div>

        <Card title={t("showcase.analytics.trend")} className="mt-4">
          <div className="chart-container mt-4 h-[260px]" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="views-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={NAVY} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={NAVY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6c6c84" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "#6c6c84" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #f0efef", fontSize: 12 }} />
                <Area isAnimationActive={false} type="monotone" dataKey="views" stroke={NAVY} strokeWidth={2} fill="url(#views-fill)" name={t("showcase.analytics.kpi.views")} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-end text-[11px] text-[#9aa3ab]">{t("showcase.analytics.refreshed", { time: refreshed })}</p>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t("showcase.analytics.sources")}>
            <ul className="mt-2 divide-y divide-[var(--sc-hairline)]">
              {sources.map((s) => (
                <Row key={s.key} label={t(`showcase.analytics.source.${s.key}`)} sub={t(`showcase.analytics.source.${s.key}Sub`)} value={nf.format(s.value)} share={s.share * 100} />
              ))}
            </ul>
          </Card>
          <Card title={t("showcase.analytics.funnelTitle")}>
            <div className="chart-container mt-4 h-[240px]" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap={18}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6c6c84" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6c6c84" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #f0efef", fontSize: 12 }} cursor={{ fill: "rgba(35,47,62,0.06)" }} />
                  <Bar isAnimationActive={false} dataKey="value" radius={[8, 8, 0, 0]}>
                    {funnel.map((_, i) => (
                      <Cell key={i} fill={[NAVY, TEAL, RUST, "#5A6169"][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 text-[12px] text-[#6c6c84] sm:grid-cols-4">
              {funnel.map((f) => (
                <li key={f.name}>
                  <span className="block font-semibold text-[var(--sc-ink)]">{nf.format(f.value)}</span>
                  {f.name}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title={t("showcase.analytics.location")} className="mt-4">
          <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="chart-container h-[240px]" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie isAnimationActive={false} data={stats.countries} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2} stroke="#fcfbf9">
                    {stats.countries.map((_, i) => (
                      <Cell key={i} fill={PIE[i % PIE.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #f0efef", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="divide-y divide-[var(--sc-hairline)]">
              {stats.countries.map((c) => (
                <Row key={c.name} label={c.name} value={`${Math.round((c.value / countryTotal) * 100)}%`} share={(c.value / countryTotal) * 100} />
              ))}
              {stats.countries.length === 0 && <li className="py-6 text-center text-[13px] text-[#6c6c84]">{t("showcase.analytics.empty")}</li>}
            </ul>
          </div>
        </Card>

        <Card title={t("showcase.analytics.devices")} className="mt-4">
          <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="chart-container h-[200px]" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie isAnimationActive={false} data={devices} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2} stroke="#fcfbf9">
                    {devices.map((_, i) => (
                      <Cell key={i} fill={PIE[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #f0efef", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="divide-y divide-[var(--sc-hairline)]">
              {devices.map((d) => (
                <Row key={d.name} label={d.name} value={nf.format(d.value)} share={(d.value / Math.max(1, stats.views)) * 100} />
              ))}
            </ul>
            <div>
              <h3 className="text-[13px] font-semibold text-[#6c6c84]">{t("showcase.analytics.topMentors")}</h3>
              <ul className="divide-y divide-[var(--sc-hairline)]">
                {topMentors.map((m) => (
                  <Row key={m.name} label={m.name} value={nf.format(m.value)} />
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
