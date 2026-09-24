import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";

import { AmazonLogo } from "@/components/AmazonSmile";
import { Badge } from "@/components/ui/badge";
import { FEATURED_MENTORS, featuredMentorByAnyId } from "@/data/featuredMentors";
import { localizeCountry } from "@/lib/format";
import { useDashboardData } from "@/pages/dashboard/data";
import { recordedMinutes } from "@/pages/dashboard/dataSource";
import { DashboardError, DashboardLoading } from "@/pages/dashboard/states";

/**
 * Printable impact report `/analytics/report` (admins only, design C3/C10).
 * One branded page (EN or AR, RTL-aware) with the period's KPIs, sessions by
 * month, mentors by sessions and hours, expertise and country distribution.
 * In database mode every figure comes from the programme's real bookings and
 * hours add up recorded durations only (the footnote counts sessions without
 * one); the sample badge exists only in demo mode. "Download PDF" is the
 * browser's print-to-PDF: the page marks itself printable so the content
 * guard lets printing through here only, and the print stylesheet drops the
 * app chrome.
 */
const PERIODS = [30, 90, 365, 0] as const;

export default function AnalyticsReport() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { bookings, mentors, mentees, demo, isLoading, isError, refetch } = useDashboardData({ programme: true });
  const [days, setDays] = React.useState<(typeof PERIODS)[number]>(90);

  React.useEffect(() => {
    document.body.dataset.printable = "true";
    return () => {
      delete document.body.dataset.printable;
    };
  }, []);

  const since = days ? Date.now() - days * 86_400_000 : 0;
  const rows = bookings.filter((b) => new Date(b.created_at).getTime() >= since);
  const completed = rows.filter((b) => b.status === "completed");
  // Only recorded durations count; sessions without one are counted separately, never assumed.
  const recorded = recordedMinutes(completed);
  const minutes = recorded.minutes;
  const nf = new Intl.NumberFormat(lang);
  const mentorName = (id: string) => {
    const m = mentors.find((x) => x.id === id) ?? featuredMentorByAnyId(id) ?? FEATURED_MENTORS.find((x) => x.id === id);
    if (!m) return t("showcase.bookings.mentor");
    return lang === "ar" && m.name_ar ? m.name_ar : m.name;
  };
  const recordedCount = completed.length - recorded.missing;
  const uniqueMentees = new Set(completed.map((b) => b.mentee_id)).size;
  const uniqueMentors = new Set(completed.map((b) => b.mentor_id)).size;
  const avgRating = (() => {
    const rated = completed.filter((b) => typeof b.mentee_rating === "number");
    return rated.length ? rated.reduce((s, b) => s + (b.mentee_rating ?? 0), 0) / rated.length : null;
  })();

  const byMonth = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit" });
    const map = new Map<string, { label: string; requests: number; completed: number; hours: number; key: string }>();
    for (const b of rows) {
      const d = new Date(b.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key) ?? { key, label: fmt.format(d), requests: 0, completed: 0, hours: 0 };
      entry.requests += 1;
      if (b.status === "completed") {
        entry.completed += 1;
        entry.hours += (b.session_duration_minutes ?? 0) / 60;
      }
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [rows, lang]);

  const byMentor = React.useMemo(() => {
    const map = new Map<string, { sessions: number; hours: number }>();
    for (const b of completed) {
      const e = map.get(b.mentor_id) ?? { sessions: 0, hours: 0 };
      e.sessions += 1;
      e.hours += (b.session_duration_minutes ?? 0) / 60;
      map.set(b.mentor_id, e);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: mentorName(id), ...v }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);
  }, [completed, mentors]);

  const byExpertise = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const b of completed) {
      const m = mentors.find((x) => x.id === b.mentor_id) ?? featuredMentorByAnyId(b.mentor_id);
      for (const tag of m?.expertise ?? []) map.set(tag, (map.get(tag) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [completed, mentors]);

  const byCountry = React.useMemo(() => {
    const map = new Map<string, number>();
    const menteeById = new Map(mentees.map((m) => [m.id, m]));
    for (const b of completed) {
      const c = b.country ?? menteeById.get(b.mentee_id)?.country ?? t("showcase.report.unknown");
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [completed, mentees, t]);

  const generated = new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short" }).format(new Date());
  const periodLabel = days ? t("showcase.report.lastDays", { count: days }) : t("showcase.report.allTime");
  const th = "px-3 py-2 text-start text-[12px] font-semibold uppercase tracking-[0.06em] text-[#6c6c84]";
  const td = "px-3 py-2 text-[14px] text-[var(--sc-ink)] tabular-nums";

  return (
    <div className="bg-white">
      {/* Controls (not printed) */}
      <div className="print:hidden border-b border-[var(--sc-hairline)] bg-[#faf9f6]">
        <div className="container-page flex flex-wrap items-center gap-3 py-3">
          <Link href="/analytics" className="inline-flex h-9 items-center gap-2 text-[14px] text-[var(--sc-ink)]">
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            {t("showcase.analytics.nav.analytics")}
          </Link>
          <div role="radiogroup" aria-label={t("showcase.analytics.period")} className="ms-auto inline-flex gap-0.5 rounded-[10px] bg-[#f3f2ee] p-1">
            {PERIODS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={days === p} onClick={() => setDays(p)} className={`h-8 rounded-[8px] px-3 text-[13px] ${days === p ? "bg-white font-semibold text-[var(--sc-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#6c6c84]"}`}>
                {p ? t("showcase.report.daysShort", { count: p }) : t("showcase.report.allTime")}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--sc-ink)] px-4 text-[14px] font-bold text-white hover:bg-black" data-testid="button-download-pdf">
            <Printer className="size-4" aria-hidden="true" />
            {t("showcase.report.download")}
          </button>
        </div>
      </div>

      <article className="print-root container-page max-w-[900px] py-10 print:max-w-none print:py-0" data-guard="off">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[var(--sc-ink)] pb-6">
          <div>
            <p className="inline-flex items-center gap-2 text-[15px] font-bold text-[var(--sc-ink)]">
              <AmazonLogo size="sm" /> MentorConnect
            </p>
            <h1 id="page-title" tabIndex={-1} className="mt-3 text-[30px] font-bold leading-tight text-[var(--sc-ink)]">
              {t("showcase.report.title")}
            </h1>
            <p className="mt-1 text-[14px] text-[#6c6c84]">
              {t("showcase.analytics.programme")} · {periodLabel} · {t("showcase.report.generated", { when: generated })}
            </p>
          </div>
          {demo && (
            <Badge tone="warning" className="shrink-0">
              {t("showcase.report.sampleBadge")}
            </Badge>
          )}
        </header>

        {demo && <p className="mt-4 rounded-[8px] bg-[#fff7e6] px-4 py-3 text-[13px] text-[#7a4b00]">{t("showcase.report.sampleNote")}</p>}

        {!demo && isError && (
          <div className="mt-6 print:hidden">
            <DashboardError message={t("showcase.analytics.loadError")} onRetry={refetch} />
          </div>
        )}
        {!demo && isLoading && <DashboardLoading rows={3} label={t("common.loading")} />}

        <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label={t("showcase.report.kpis")}>
          {[
            { label: t("showcase.report.kpi.completed"), value: nf.format(completed.length) },
            { label: t("showcase.report.kpi.hours"), value: nf.format(Math.round((minutes / 60) * 10) / 10) },
            { label: t("showcase.report.kpi.mentees"), value: nf.format(uniqueMentees) },
            { label: t("showcase.report.kpi.mentors"), value: nf.format(uniqueMentors) },
            { label: t("showcase.report.kpi.requests"), value: nf.format(rows.length) },
            { label: t("showcase.report.kpi.completionRate"), value: rows.length ? `${Math.round((completed.length / rows.length) * 100)}%` : "—" },
            { label: t("showcase.report.kpi.rating"), value: avgRating ? avgRating.toFixed(1) : "—" },
            { label: t("showcase.report.kpi.avgLength"), value: recordedCount > 0 ? t("mentorPortal.durationMinutes", { count: Math.round(minutes / recordedCount) }) : "—" },
          ].map((k) => (
            <div key={k.label} className="rounded-[10px] border border-[var(--sc-hairline)] p-4">
              <p className="text-[12px] text-[#6c6c84]">{k.label}</p>
              <p className="mt-1 text-[26px] font-bold leading-none text-[var(--sc-ink)] tabular-nums">{k.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-10" aria-labelledby="r-month">
          <h2 id="r-month" className="text-[18px] font-bold text-[var(--sc-ink)]">
            {t("showcase.report.byMonth")}
          </h2>
          <table className="mt-3 w-full border-collapse">
            <thead className="border-b border-[var(--sc-hairline)]">
              <tr>
                <th className={th}>{t("showcase.report.col.month")}</th>
                <th className={th}>{t("showcase.report.col.requests")}</th>
                <th className={th}>{t("showcase.report.col.completed")}</th>
                <th className={th}>{t("showcase.report.col.hours")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sc-hairline)]">
              {byMonth.map((m) => (
                <tr key={m.key}>
                  <td className={td}>{m.label}</td>
                  <td className={td}>{nf.format(m.requests)}</td>
                  <td className={td}>{nf.format(m.completed)}</td>
                  <td className={td}>{nf.format(Math.round(m.hours * 10) / 10)}</td>
                </tr>
              ))}
              {byMonth.length === 0 && (
                <tr>
                  <td className={td} colSpan={4}>
                    {t("showcase.analytics.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 print:grid-cols-2">
          <section aria-labelledby="r-mentors">
            <h2 id="r-mentors" className="text-[18px] font-bold text-[var(--sc-ink)]">
              {t("showcase.report.byMentor")}
            </h2>
            <table className="mt-3 w-full border-collapse">
              <thead className="border-b border-[var(--sc-hairline)]">
                <tr>
                  <th className={th}>{t("showcase.report.col.mentor")}</th>
                  <th className={th}>{t("showcase.report.col.sessions")}</th>
                  <th className={th}>{t("showcase.report.col.hours")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-hairline)]">
                {byMentor.map((m) => (
                  <tr key={m.id}>
                    <td className={td}>{m.name}</td>
                    <td className={td}>{nf.format(m.sessions)}</td>
                    <td className={td}>{nf.format(Math.round(m.hours * 10) / 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section aria-labelledby="r-expertise">
            <h2 id="r-expertise" className="text-[18px] font-bold text-[var(--sc-ink)]">
              {t("showcase.report.byExpertise")}
            </h2>
            <table className="mt-3 w-full border-collapse">
              <thead className="border-b border-[var(--sc-hairline)]">
                <tr>
                  <th className={th}>{t("showcase.report.col.area")}</th>
                  <th className={th}>{t("showcase.report.col.sessions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-hairline)]">
                {byExpertise.map(([tag, n]) => (
                  <tr key={tag}>
                    <td className={td}>{tag}</td>
                    <td className={td}>{nf.format(n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h2 className="mt-8 text-[18px] font-bold text-[var(--sc-ink)]">{t("showcase.report.byCountry")}</h2>
            <table className="mt-3 w-full border-collapse">
              <thead className="border-b border-[var(--sc-hairline)]">
                <tr>
                  <th className={th}>{t("showcase.report.col.country")}</th>
                  <th className={th}>{t("showcase.report.col.sessions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-hairline)]">
                {byCountry.map(([c, n]) => (
                  <tr key={c}>
                    <td className={td}>{localizeCountry(c, lang)}</td>
                    <td className={td}>{nf.format(n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        {recorded.missing > 0 && (
          <p className="mt-8 text-[12px] text-[#6c6c84]" data-testid="text-report-missing-durations">
            {t("showcase.report.missingDurations", { count: recorded.missing })}
          </p>
        )}
        <footer className="mt-12 border-t border-[var(--sc-hairline)] pt-4 text-[12px] text-[#6c6c84]">{t("showcase.report.footer")}</footer>
      </article>
    </div>
  );
}
