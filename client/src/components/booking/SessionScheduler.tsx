import * as React from "react";
import { lazy, Suspense } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { CalendarDays, Check, Send } from "lucide-react";

import { loadCalApi } from "@/components/CalEmbed";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeaturedMentor } from "@/data/featuredMentors";
import type { Booking, Mentee } from "@/lib/database";
import { DEFAULT_CAL_LINK } from "@/lib/demo";
import { localStore, newId } from "@/lib/localStore";
import { ROUTES } from "@/lib/routes";

// Same on-demand chunk the scheduling dialog uses; nothing Cal-related ships in the route bundle.
const Cal = lazy(() => import("@calcom/embed-react"));

/**
 * Scheduling card on the session page. Header carries the mentor's own
 * details (photo, name, length, free); below it the mentor's Cal.com
 * calendar is embedded inline in light mode. A mentor without a Cal.com
 * link yet gets a request form instead. Either way the resulting booking
 * is recorded (local store now, database once Supabase is configured) and
 * shows up on the dashboard.
 */
export function SessionScheduler({ mentor, sessionTitle, name }: { mentor: FeaturedMentor; sessionTitle: string; name: string }) {
  const { t, i18n } = useTranslation();
  const firstName = name.split(" ")[0] || name;
  // The mentor's own Cal.com page, else the shared account with the event that matches this
  // session's length (the sample account exposes 15min / 30min); the header stays the mentor's.
  const usingShared = !mentor.cal_link;
  const calLink = mentor.cal_link || `${DEFAULT_CAL_LINK.replace(/\/+$/, "")}${DEFAULT_CAL_LINK.includes("/") ? "" : `/${mentor.session.minutes <= 15 ? "15min" : "30min"}`}`;
  const [done, setDone] = React.useState<{ kind: "confirmed" | "requested"; when?: string } | null>(null);
  const [ready, setReady] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", goal: "" });
  const ids = React.useId();

  /** The person booking, as a mentee row (reused when the same email books again). */
  const menteeFor = React.useCallback((menteeName: string, email: string): string => {
    const existing = localStore.list("mentees").find((m) => m.email.toLowerCase() === email.toLowerCase());
    if (existing) return existing.id;
    return localStore.add("mentees", {
      id: newId("mentee"),
      name: menteeName || email,
      email,
      user_type: "individual",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      created_at: new Date().toISOString(),
    } as Mentee).id;
  }, []);

  const record = React.useCallback(
    (row: Partial<Booking> & Pick<Booking, "status">) => {
      localStore.add("bookings", {
        id: newId("booking"),
        mentor_id: mentor.id,
        mentee_id: row.mentee_id ?? "guest",
        goal: sessionTitle,
        session_duration_minutes: mentor.session.minutes,
        created_at: new Date().toISOString(),
        ...row,
      } as Booking);
    },
    [mentor.id, mentor.session.minutes, sessionTitle],
  );

  // Cal.com reports the confirmed slot; that is the booking.
  React.useEffect(() => {
    if (!calLink || done) return;
    let disposed = false;
    const onBooked = (e: { detail?: { data?: Record<string, unknown> } }) => {
      if (disposed) return;
      const data = (e?.detail?.data ?? {}) as Record<string, unknown>;
      const booking = (data.booking ?? {}) as Record<string, unknown>;
      const startTime = [data.startTime, booking.startTime, data.date].find((v) => typeof v === "string") as string | undefined;
      const responses = (booking.responses ?? {}) as Record<string, unknown>;
      const attendee = (Array.isArray(booking.attendees) ? booking.attendees[0] : {}) as Record<string, unknown>;
      const attendeeName = [responses.name, attendee.name].find((v) => typeof v === "string") as string | undefined;
      const attendeeEmail = [responses.email, attendee.email].find((v) => typeof v === "string") as string | undefined;
      record({
        status: "confirmed",
        scheduled_at: startTime,
        cal_event_uri: typeof booking.uid === "string" ? booking.uid : undefined,
        mentee_id: attendeeEmail ? menteeFor(attendeeName ?? "", attendeeEmail) : "guest",
      });
      setDone({ kind: "confirmed", when: startTime });
    };
    const onReady = () => {
      if (!disposed) setReady(true);
    };
    loadCalApi().then((cal) => {
      if (disposed) return;
      cal("on", { action: "bookingSuccessful", callback: onBooked as never });
      cal("on", { action: "linkReady", callback: onReady as never });
    });
    const fallback = window.setTimeout(onReady, 4000);
    return () => {
      disposed = true;
      window.clearTimeout(fallback);
      loadCalApi()
        .then((cal) => {
          cal("off", { action: "bookingSuccessful", callback: onBooked as never });
          cal("off", { action: "linkReady", callback: onReady as never });
        })
        .catch(() => undefined);
    };
  }, [calLink, done, record, menteeFor]);

  const submitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    record({
      status: "pending",
      clicked_at: new Date().toISOString(),
      goal: form.goal.trim() || sessionTitle,
      mentee_id: menteeFor(form.name.trim(), form.email.trim()),
    });
    try {
      localStorage.setItem("menteeName", form.name.trim());
      localStorage.setItem("menteeEmail", form.email.trim());
    } catch {
      /* storage unavailable */
    }
    setDone({ kind: "requested" });
  };

  const whenLabel = done?.when
    ? new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(done.when))
    : "";

  return (
    <div>
      {/* The mentor's own details, always */}
      <div className="flex items-center gap-4">
        <img src={mentor.photo_url} alt="" className="size-14 rounded-full object-cover" />
        <div className="min-w-0">
          <h2 id="when-title" className="text-[18px] font-bold leading-tight text-[var(--sc-ink)]">
            {t("showcase.scheduler.title", { name: firstName })}
          </h2>
          <p className="mt-1 inline-flex items-center gap-2 text-[13px] text-[#6c6c84]">
            <CalendarDays className="size-4" aria-hidden="true" />
            {t("showcase.rail.minutes", { minutes: mentor.session.minutes })} · {t("showcase.session.free")}
          </p>
        </div>
      </div>

      {!done && calLink && usingShared && (
        <p className="mt-4 rounded-[8px] bg-[var(--sc-sand)] px-3 py-2 text-[12px] leading-[18px] text-[#6c6c84]">{t("showcase.scheduler.sharedCalendar", { name: firstName })}</p>
      )}

      {done ? (
        <div role="status" className="mt-6" data-testid="slot-confirmation">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-[#d8f0a3] text-[var(--sc-ink)]">
            <Check className="size-6" aria-hidden="true" />
          </span>
          <h3 className="mt-4 text-[22px] font-bold text-[var(--sc-ink)]">
            {done.kind === "confirmed" ? t("showcase.scheduler.confirmedTitle", { name: firstName }) : t("showcase.picker.sentTitle", { name: firstName })}
          </h3>
          <p className="mt-2 text-[15px] leading-[24px] text-[var(--sc-ink-soft)]">
            {done.kind === "confirmed" ? t("showcase.scheduler.confirmedBody") : t("showcase.picker.sentBody", { name: firstName })}
          </p>
          <dl className="mt-6 divide-y divide-[var(--sc-hairline)] rounded-[12px] border border-[var(--sc-hairline)] text-[14px]">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-[#6c6c84]">{t("showcase.picker.session")}</dt>
              <dd className="text-end font-semibold text-[var(--sc-ink)]">{sessionTitle}</dd>
            </div>
            {whenLabel && (
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-[#6c6c84]">{t("showcase.picker.slot")}</dt>
                <dd className="text-end font-semibold text-[var(--sc-ink)]">{whenLabel}</dd>
              </div>
            )}
          </dl>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href="/dashboard/bookings" className="inline-flex h-11 flex-1 items-center justify-center rounded-[6px] bg-[var(--sc-ink)] text-[14px] font-bold text-white hover:bg-black">
              {t("showcase.scheduler.viewBookings")}
            </Link>
            <Link href={ROUTES.mentors} className="inline-flex h-11 flex-1 items-center justify-center rounded-[6px] border border-[#e3e8ed] text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]">
              {t("mentorProfile.backToMentors")}
            </Link>
          </div>
        </div>
      ) : calLink ? (
        <div className="chart-container relative mt-5 min-h-[600px] overflow-hidden rounded-[16px] border border-[var(--sc-hairline)] bg-white" data-testid="cal-inline">
          <Suspense fallback={null}>
            <Cal
              calLink={calLink}
              style={{ width: "100%", height: "100%", minHeight: "600px", overflow: "auto" }}
              config={{ theme: "light", layout: "month_view", notes: `${sessionTitle} — ${t("showcase.scheduler.title", { name })}` }}
            />
          </Suspense>
          {!ready && (
            <div className="absolute inset-0 space-y-4 bg-white p-6" role="status" aria-busy="true">
              <span className="sr-only">{t("dashboardV2.cal.loading")}</span>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-[460px] w-full" />
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submitRequest} className="mt-6 space-y-4" noValidate>
          <p className="text-[14px] leading-[22px] text-[var(--sc-ink-soft)]">{t("showcase.scheduler.noCalendar", { name: firstName })}</p>
          <div>
            <label htmlFor={`${ids}-name`} className="text-[14px] font-semibold text-[var(--sc-ink)]">
              {t("bookingRequest.nameLabel")}
            </label>
            <input id={`${ids}-name`} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-11 w-full rounded-[6px] border border-[#d9d9d9] px-3 text-[14px]" autoComplete="name" />
          </div>
          <div>
            <label htmlFor={`${ids}-email`} className="text-[14px] font-semibold text-[var(--sc-ink)]">
              {t("bookingRequest.emailLabel")}
            </label>
            <input id={`${ids}-email`} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-11 w-full rounded-[6px] border border-[#d9d9d9] px-3 text-[14px]" autoComplete="email" dir="ltr" />
          </div>
          <div>
            <label htmlFor={`${ids}-goal`} className="text-[14px] font-semibold text-[var(--sc-ink)]">
              {t("bookingRequest.goalLabel")}
            </label>
            <textarea id={`${ids}-goal`} rows={3} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="mt-1 w-full rounded-[6px] border border-[#d9d9d9] px-3 py-2 text-[14px]" />
          </div>
          <button type="submit" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--sc-ink)] text-[15px] font-bold text-white hover:bg-black" data-testid="button-send-request">
            <Send className="size-4" aria-hidden="true" />
            {t("showcase.scheduler.send")}
          </button>
        </form>
      )}
    </div>
  );
}
