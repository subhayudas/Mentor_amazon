import * as React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { CalendarClock, CalendarDays, Check, CheckCircle2, ExternalLink, Share2, Timer, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { CalEmbed } from "@/components/CalEmbed";
import { CompleteSessionDialog } from "@/components/dashboard/CompleteSessionDialog";
import { DashboardHeader, DashboardShell, useDashboardIdentity } from "@/components/dashboard/DashboardShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { FEATURED_MENTORS, featuredMentorByAnyId, isFeaturedDbId } from "@/data/featuredMentors";
import { logActivity } from "@/lib/activity";
import { calCancelUrl, isValidCalLink, normalizeCalLink } from "@/lib/calLink";
import type { Booking } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { bidi } from "@/lib/format";
import { localStore } from "@/lib/localStore";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { UPCOMING_STATUSES, useDashboardData, useOwnProfile, type DashboardBooking } from "@/pages/dashboard/data";
import { bookingsTabFor, rowActionsFor, type BookingsTab, type RowAction, type RowNote } from "@/pages/dashboard/dataSource";
import { DashboardError, DashboardLoading, ProfileNeededCard } from "@/pages/dashboard/states";
import { useDashboardBookingActions } from "@/pages/dashboard/useDashboardBookingActions";
import { useConfirmOnCalBooking } from "@/pages/mentee/useConfirmOnCalBooking";

/**
 * Bookings `/dashboard/bookings` (Figma "Bookings" page): Requests /
 * Upcoming / Completed / Cancelled.
 *
 * Database mode (design C5, F01/F02): the signed-in mentor's or mentee's own
 * rows from Supabase, with loading, error, empty and "finish your profile"
 * states. Every action writes to the database first and toasts only after it
 * succeeded: mentors accept or decline requests (decline confirms), mark
 * sessions completed with the real duration, and cancel (confirms, and points
 * at Cal.com when the session is booked there); mentees withdraw a request,
 * choose (or re-choose) a time on the mentor's Cal.com link once accepted,
 * reschedule a Cal.com booking and cancel. Booking events reach the activity
 * feed through the database trigger; nothing is logged from here.
 *
 * Local (demo) mode keeps the browser-store behaviour on this browser's rows.
 */
const TABS: BookingsTab[] = ["requests", "upcoming", "completed", "canceled"];

/** A Cal.com booking page link shown as the dialog's calendar, or null. */
function schedulingLink(b: DashboardBooking): string | null {
  const link = normalizeCalLink(b.mentor?.cal_link);
  return isValidCalLink(link) ? link : null;
}

type Confirmation = { kind: "decline" | "cancel" | "withdraw"; booking: DashboardBooking };
type Scheduling = { booking: DashboardBooking; reschedule: boolean };

/** CalEmbed gains `rescheduleUid` in Track B (design §3.6); typed here so this page compiles on either side of the merge. */
const CalEmbedWithReschedule = CalEmbed as React.ComponentType<React.ComponentProps<typeof CalEmbed> & { rescheduleUid?: string }>;

export default function DashboardBookings() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const data = useDashboardData();
  const { bookings, mentees, mentors, demo, role, profileId, isLoading, isError, needsProfile, refetch } = data;
  const { displayName, signedIn } = useDashboardIdentity();
  const { user } = useAuth();
  const isMentee = role === "mentee";
  const isMentor = role === "mentor";
  const isAdmin = role === "admin";
  const now = Date.now();
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const [chosenTab, setChosenTab] = React.useState<BookingsTab | null>(null);
  const tab: BookingsTab = chosenTab ?? (pendingCount > 0 ? "requests" : "upcoming");
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);
  const [completing, setCompleting] = React.useState<DashboardBooking | null>(null);
  const [scheduling, setScheduling] = React.useState<Scheduling | null>(null);
  const [localReschedule, setLocalReschedule] = React.useState<Booking | null>(null);
  const tabIds = React.useId();

  const actions = useDashboardBookingActions();
  const own = useOwnProfile();
  const onCalBooked = useConfirmOnCalBooking(profileId ?? "");

  const when = React.useMemo(
    () => new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
    [lang],
  );
  const menteeById = React.useMemo(() => new Map(mentees.map((m) => [m.id, m])), [mentees]);
  const mentorById = React.useMemo(() => new Map(mentors.map((m) => [m.id, m])), [mentors]);

  const mentorNameOf = (b: DashboardBooking): string => {
    const row = b.mentor ?? mentorById.get(b.mentor_id) ?? featuredMentorByAnyId(b.mentor_id) ?? FEATURED_MENTORS.find((m) => m.id === b.mentor_id);
    if (!row) return t("showcase.bookings.mentor");
    return lang === "ar" && row.name_ar ? row.name_ar : row.name;
  };
  const menteeNameOf = (b: DashboardBooking): string => {
    const row = b.mentee ?? menteeById.get(b.mentee_id);
    return row?.organization_name && row.user_type === "organization" ? `${row.name} · ${row.organization_name}` : row?.name ?? t("showcase.bookings.mentee");
  };
  const counterpart = (b: DashboardBooking) => (isMentee ? mentorNameOf(b) : menteeNameOf(b));

  const rows = React.useMemo(
    () =>
      bookings
        .filter((b) => bookingsTabFor(b, now) === tab)
        .slice()
        .sort((a, b) => {
          const ta = new Date(a.scheduled_at ?? a.completed_at ?? a.created_at).getTime();
          const tb = new Date(b.scheduled_at ?? b.completed_at ?? b.created_at).getTime();
          return tab === "upcoming" || tab === "requests" ? ta - tb : tb - ta;
        }),
    // `now` is read at render time; regrouping when the rows or the tab change is enough.
    [bookings, tab],
  );

  // ---- local (demo) mode: the browser-store behaviour, on this browser's rows only ----
  const localActor = () => ({ actor_type: (isAdmin ? "admin" : isMentee ? "mentee" : "mentor") as "admin" | "mentee" | "mentor", actor_id: profileId ?? undefined, actor_name: displayName });
  const localDecide = (b: Booking, status: "accepted" | "rejected") => {
    localStore.update("bookings", b.id, { status, responded_at: new Date().toISOString() });
    logActivity({ ...localActor(), type: status === "accepted" ? "request_accepted" : "request_declined", subject_type: "booking", subject_id: b.id, visible_to: [b.mentor_id, b.mentee_id], summary: t(status === "accepted" ? "showcase.activity.summaries.requestAccepted" : "showcase.activity.summaries.requestDeclined", { mentee: menteeNameOf(b) }) });
    toast.success(t(status === "accepted" ? "showcase.bookings.toast.accepted" : "showcase.bookings.toast.declined"));
  };
  const localCancel = (b: Booking) => {
    localStore.update("bookings", b.id, { status: "canceled", canceled_at: new Date().toISOString() });
    logActivity({ ...localActor(), type: "booking_canceled", subject_type: "booking", subject_id: b.id, visible_to: [b.mentor_id, b.mentee_id], summary: t("showcase.activity.summaries.canceled", { mentor: mentorNameOf(b), mentee: menteeNameOf(b) }) });
    toast.success(t("showcase.bookings.toast.canceled"));
    setChosenTab("canceled");
  };
  const localComplete = (b: Booking) => {
    localStore.update("bookings", b.id, { status: "completed", completed_at: new Date().toISOString(), session_duration_minutes: b.session_duration_minutes ?? 30 });
    logActivity({ ...localActor(), type: "session_completed", subject_type: "booking", subject_id: b.id, visible_to: [b.mentor_id, b.mentee_id], summary: t("showcase.activity.summaries.completed", { mentee: menteeNameOf(b) }) });
    toast.success(t("showcase.bookings.toast.completed"));
    setChosenTab("completed");
  };
  const localRescheduled = (b: Booking) => (detail: { startTime?: string; uid?: string }) => {
    localStore.update("bookings", b.id, { status: "confirmed", scheduled_at: detail.startTime ?? b.scheduled_at, cal_event_uri: detail.uid ?? b.cal_event_uri });
    logActivity({ ...localActor(), type: "booking_rescheduled", subject_type: "booking", subject_id: b.id, visible_to: [b.mentor_id, b.mentee_id], summary: t("showcase.activity.summaries.rescheduled", { mentor: mentorNameOf(b) }) });
    toast.success(t("showcase.bookings.toast.rescheduled"));
    setLocalReschedule(null);
  };
  /** Local mode: only a mentor's own Cal.com link, never a shared sample calendar (D4). */
  const localCalLink = (b: Booking) => normalizeCalLink(mentorById.get(b.mentor_id)?.cal_link);

  // ---- rendering helpers ----
  const tabCls = (active: boolean) =>
    cn(
      "relative h-11 px-1 text-[16px] transition-colors duration-fast",
      active ? "font-bold text-[var(--sc-ink)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--sc-ink)]" : "text-[#6c6c84] hover:text-[var(--sc-ink)]",
    );
  const btnPrimary = "inline-flex h-11 items-center gap-1.5 rounded-[6px] bg-[var(--sc-ink)] px-3 text-[13px] font-bold text-white hover:bg-black disabled:opacity-60 md:h-9";
  const btnOutline = "inline-flex h-11 items-center gap-1.5 rounded-[6px] border border-[#d9d9d9] px-3 text-[13px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)] disabled:opacity-60 md:h-9";

  const emptyTitle =
    tab === "requests"
      ? t("showcase.bookings.empty.requests")
      : tab === "completed"
        ? t("showcase.bookings.empty.completed")
        : tab === "canceled"
          ? t("showcase.bookings.empty.canceled")
          : isMentee
            ? t("showcase.dashboard.menteeEmptyTitle")
            : t("showcase.bookings.emptyTitle");
  const emptyBody = tab === "upcoming" ? (isMentee ? t("showcase.dashboard.menteeEmptyBody") : t("showcase.bookings.emptyBody")) : t("showcase.bookings.empty.body");

  const noteText = (note: RowNote, b: DashboardBooking): string | null => {
    const name = bidi(counterpart(b));
    const requestedAt = b.cal_requested_start ? when.format(new Date(b.cal_requested_start)) : null;
    switch (note) {
      case "waitingForTime":
        return t("showcase.bookings.note.waitingForTime", { name });
      case "timeRequested":
        return requestedAt ? t("showcase.bookings.note.timeRequested", { name, time: requestedAt }) : t("showcase.bookings.note.timeRequestedUntimed", { name });
      case "timeRequestedMentor":
        return requestedAt ? t("showcase.bookings.note.timeRequestedMentor", { name, time: requestedAt }) : t("showcase.bookings.note.timeRequestedMentorUntimed", { name });
      case "timeDeclined":
        return t("showcase.bookings.note.timeDeclined", { name });
      case "programmeArranges":
        return t("showcase.bookings.note.programmeArranges");
      case "mentorWillShare":
        return t("showcase.bookings.note.mentorWillShare", { name });
      case "awaitingCompletion":
        return t("showcase.bookings.note.awaitingCompletion");
      case "sessionPassed":
        return t("showcase.bookings.note.sessionPassed", { name });
      default:
        return null;
    }
  };

  const actionButton = (action: RowAction, b: DashboardBooking) => {
    const busy = actions.pendingFor(b);
    const disabled = busy !== null;
    switch (action) {
      case "accept":
        return (
          <button key={action} type="button" onClick={() => actions.accept.mutate(b)} className={btnPrimary} disabled={disabled} aria-busy={busy === "accept" || undefined} data-testid={`button-accept-${b.id}`}>
            <Check className="size-4" aria-hidden="true" />
            {t("showcase.bookings.accept")}
          </button>
        );
      case "decline":
        return (
          <button key={action} type="button" onClick={() => setConfirmation({ kind: "decline", booking: b })} className={btnOutline} disabled={disabled} data-testid={`button-decline-${b.id}`}>
            <X className="size-4" aria-hidden="true" />
            {t("showcase.bookings.decline")}
          </button>
        );
      case "complete":
        return (
          <button key={action} type="button" onClick={() => setCompleting(b)} className={b.status === "confirmed" ? btnPrimary : btnOutline} disabled={disabled} data-testid={`button-complete-${b.id}`}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t("showcase.bookings.markCompleted")}
          </button>
        );
      case "cancel":
        return (
          <button key={action} type="button" onClick={() => setConfirmation({ kind: "cancel", booking: b })} className={btnOutline} disabled={disabled} data-testid={`button-cancel-${b.id}`}>
            <X className="size-4" aria-hidden="true" />
            {t("showcase.bookings.cancel")}
          </button>
        );
      case "withdraw":
        return (
          <button key={action} type="button" onClick={() => setConfirmation({ kind: "withdraw", booking: b })} className={btnOutline} disabled={disabled} data-testid={`button-withdraw-${b.id}`}>
            <Undo2 className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            {t("showcase.bookings.withdraw")}
          </button>
        );
      case "chooseTime":
      case "chooseAnotherTime":
        return (
          <button key={action} type="button" onClick={() => setScheduling({ booking: b, reschedule: false })} className={btnPrimary} disabled={disabled} data-testid={`button-choose-time-${b.id}`}>
            <CalendarClock className="size-4" aria-hidden="true" />
            {t(action === "chooseTime" ? "showcase.bookings.chooseTime" : "showcase.bookings.chooseAnotherTime")}
          </button>
        );
      case "reschedule":
        return (
          <button key={action} type="button" onClick={() => setScheduling({ booking: b, reschedule: true })} className={btnOutline} disabled={disabled} data-testid={`button-reschedule-${b.id}`}>
            <CalendarClock className="size-4" aria-hidden="true" />
            {t("showcase.bookings.reschedule")}
          </button>
        );
    }
  };

  const durationLabel = (b: Booking) => {
    if (b.status !== "completed") return null;
    return typeof b.session_duration_minutes === "number" && b.session_duration_minutes > 0
      ? t("mentorPortal.durationMinutes", { count: b.session_duration_minutes })
      : t("showcase.bookings.durationNotRecorded");
  };

  const renderDatabaseRow = (b: DashboardBooking) => {
    const name = counterpart(b);
    const { actions: rowActions, note } =
      isMentor || isMentee
        ? rowActionsFor(b, { role: isMentor ? "mentor" : "mentee", now, hasCalLink: Boolean(schedulingLink(b)), programmeManaged: isFeaturedDbId(b.mentor_id) })
        : { actions: [] as RowAction[], note: null };
    const noteLine = noteText(note, b);
    const duration = durationLabel(b);
    return (
      <li key={b.id} className="py-4" data-testid={`booking-row-${b.id}`} data-status={b.status}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[15px] font-bold text-[var(--sc-ink)]" aria-hidden="true">
            {name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] md:basis-auto">
            <p className="truncate text-[15px] font-semibold text-[var(--sc-ink)]" dir="auto">
              {isMentee ? t("showcase.bookings.with", { name: bidi(name) }) : name}
            </p>
            <p className="line-clamp-2 text-[13px] text-[#6c6c84]" dir="auto">
              {b.goal || t("showcase.bookings.session")}
            </p>
          </div>
          <p className="inline-flex items-center gap-2 text-[14px] text-[var(--sc-ink)] tabular-nums">
            <CalendarDays className="size-4 text-[#6c6c84]" aria-hidden="true" />
            {b.scheduled_at ? when.format(new Date(b.scheduled_at)) : b.status === "completed" && b.completed_at ? when.format(new Date(b.completed_at)) : t("showcase.bookings.timeTbc")}
          </p>
          {duration && (
            <p className="inline-flex items-center gap-2 text-[13px] text-[#6c6c84]">
              <Timer className="size-4" aria-hidden="true" />
              {duration}
            </p>
          )}
          <StatusBadge status={b.status} />
          {rowActions.length > 0 && <span className="flex flex-wrap gap-2">{rowActions.map((a) => actionButton(a, b))}</span>}
        </div>
        {noteLine && (
          <p className="mt-2 text-[13px] text-[#6c6c84] md:ps-16" data-testid={`booking-note-${b.id}`}>
            {noteLine}
          </p>
        )}
      </li>
    );
  };

  const renderLocalRow = (b: DashboardBooking) => {
    const at = b.scheduled_at ?? b.completed_at ?? b.created_at;
    const past = b.scheduled_at ? new Date(b.scheduled_at).getTime() < now : false;
    const open = !["canceled", "completed", "rejected"].includes(b.status);
    const name = counterpart(b);
    return (
      <li key={b.id} className="flex flex-wrap items-center gap-4 py-4" data-testid={`booking-row-${b.id}`} data-status={b.status}>
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--sc-peach)] text-[15px] font-bold text-[var(--sc-ink)]" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] md:basis-auto">
          <p className="truncate text-[15px] font-semibold text-[var(--sc-ink)]">{isMentee ? t("showcase.bookings.with", { name }) : name}</p>
          <p className="truncate text-[13px] text-[#6c6c84]">
            {/* The goal is the requester's own words, in either script: isolate its direction. */}
            <bdi>{b.goal ?? t("showcase.bookings.session")}</bdi>
            {!isMentee ? ` · ${t("showcase.bookings.with", { name: mentorNameOf(b) })}` : ""}
          </p>
        </div>
        <p className="inline-flex items-center gap-2 text-[14px] text-[var(--sc-ink)]">
          <CalendarDays className="size-4 text-[#6c6c84]" aria-hidden="true" />
          {b.scheduled_at || b.status === "completed" ? when.format(new Date(at)) : t("showcase.bookings.timeTbc")}
        </p>
        <StatusBadge status={b.status} />
        {signedIn && (
          <span className="flex flex-wrap gap-2">
            {isMentor && b.status === "pending" && (
              <>
                <button type="button" onClick={() => localDecide(b, "accepted")} className={btnPrimary} data-testid={`button-accept-${b.id}`}>
                  <Check className="size-4" aria-hidden="true" />
                  {t("showcase.bookings.accept")}
                </button>
                <button type="button" onClick={() => localDecide(b, "rejected")} className={btnOutline} data-testid={`button-decline-${b.id}`}>
                  <X className="size-4" aria-hidden="true" />
                  {t("showcase.bookings.decline")}
                </button>
              </>
            )}
            {isMentor && UPCOMING_STATUSES.includes(b.status) && (
              <button type="button" onClick={() => localComplete(b)} className={past ? btnPrimary : btnOutline} data-testid={`button-complete-${b.id}`}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t("showcase.bookings.markCompleted")}
              </button>
            )}
            {isMentee && UPCOMING_STATUSES.includes(b.status) && localCalLink(b) && (
              <button type="button" onClick={() => setLocalReschedule(b)} className={btnOutline} data-testid={`button-reschedule-${b.id}`}>
                <CalendarClock className="size-4" aria-hidden="true" />
                {t("showcase.bookings.reschedule")}
              </button>
            )}
            {open && (
              <button type="button" onClick={() => localCancel(b)} className={btnOutline} data-testid={`button-cancel-${b.id}`}>
                <X className="size-4" aria-hidden="true" />
                {t("showcase.bookings.cancel")}
              </button>
            )}
          </span>
        )}
      </li>
    );
  };

  const confirmationCopy = confirmation
    ? {
        decline: {
          title: t("showcase.bookings.confirm.declineTitle", { name: bidi(counterpart(confirmation.booking)) }),
          body: t("showcase.bookings.confirm.declineBody"),
          action: t("showcase.bookings.confirm.declineAction"),
          keep: t("showcase.bookings.confirm.keepRequest"),
        },
        withdraw: {
          title: t("showcase.bookings.confirm.withdrawTitle", { name: bidi(counterpart(confirmation.booking)) }),
          body: t("showcase.bookings.confirm.withdrawBody"),
          action: t("showcase.bookings.confirm.withdrawAction"),
          keep: t("showcase.bookings.confirm.keepRequest"),
        },
        cancel: {
          title: t("showcase.bookings.confirm.cancelTitle"),
          body: t("showcase.bookings.confirm.cancelBody", { name: bidi(counterpart(confirmation.booking)) }),
          action: t("showcase.bookings.confirm.cancelAction"),
          keep: t("showcase.bookings.confirm.keepSession"),
        },
      }[confirmation.kind]
    : null;

  const runConfirmation = () => {
    if (!confirmation) return;
    const { kind, booking } = confirmation;
    if (kind === "decline") actions.decline.mutate(booking, { onSuccess: () => setChosenTab("canceled") });
    else if (kind === "withdraw") actions.withdraw.mutate(booking, { onSuccess: () => setChosenTab("canceled") });
    else actions.cancel.mutate(booking, { onSuccess: () => setChosenTab("canceled") });
    setConfirmation(null);
  };

  const body = () => {
    if (!IS_LOCAL) {
      if (needsProfile && (isMentor || isMentee)) return <ProfileNeededCard role={isMentor ? "mentor" : "mentee"} />;
      if (isError) return <DashboardError message={t("showcase.bookings.loadError")} onRetry={refetch} />;
      if (isLoading) return <DashboardLoading />;
    }
    return (
      <>
        <div role="tablist" aria-label={t(isMentee ? "showcase.analytics.nav.mySessions" : "showcase.analytics.nav.bookings")} className="flex flex-wrap gap-6 border-b border-[var(--sc-hairline)] sm:gap-8">
          {TABS.map((k) => (
            <button
              key={k}
              id={`${tabIds}-${k}`}
              type="button"
              role="tab"
              aria-selected={tab === k}
              aria-controls={`${tabIds}-panel`}
              className={tabCls(tab === k)}
              onClick={() => setChosenTab(k)}
              data-testid={`tab-${k}`}
            >
              {t(`showcase.bookings.${k}`)}
              {k === "requests" && pendingCount > 0 && (
                <span className="ms-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--sc-ink)] px-1.5 text-[11px] font-bold text-white">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
        <div id={`${tabIds}-panel`} role="tabpanel" aria-labelledby={`${tabIds}-${tab}`}>
          {rows.length === 0 ? (
            <div className="mx-auto max-w-[420px] py-16 text-center" data-testid="bookings-empty">
              <div className="mx-auto grid size-[120px] place-items-center rounded-full bg-[#ffd23f]/60" aria-hidden="true">
                {tab === "upcoming" && !isMentee ? <Share2 className="size-12 text-[var(--sc-ink)]" strokeWidth={1.25} /> : <CalendarClock className="size-12 text-[var(--sc-ink)]" strokeWidth={1.25} />}
              </div>
              <h2 className="mt-8 text-[22px] font-bold text-[var(--sc-ink)]">{emptyTitle}</h2>
              <p className="mt-2 text-[15px] text-[#6c6c84]">{emptyBody}</p>
              {tab === "upcoming" && (
                <Link href={isMentee || isAdmin ? ROUTES.mentors : "/dashboard/profile"} className="mt-6 inline-flex h-11 items-center rounded-[8px] bg-[var(--sc-ink)] px-5 text-[14px] font-bold text-white hover:bg-black">
                  {t(isMentee || isAdmin ? "showcase.hero.cta" : "showcase.bookings.sharePage")}
                </Link>
              )}
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--sc-hairline)]" data-testid="bookings-list">
              {rows.map((b) => (IS_LOCAL ? renderLocalRow(b) : renderDatabaseRow(b)))}
            </ul>
          )}
        </div>
      </>
    );
  };

  const calBooking = scheduling?.booking;
  const calLink = calBooking ? schedulingLink(calBooking) : null;

  return (
    <DashboardShell active="bookings">
      <DashboardHeader
        title={t(isMentee ? "showcase.analytics.nav.mySessions" : "showcase.analytics.nav.bookings")}
        trailing={demo ? <Badge tone="warning">{t("analyticsV2.demoBadge")}</Badge> : undefined}
      />
      <div className="px-4 py-6 sm:px-8 lg:px-12">{body()}</div>

      {/* Decline / withdraw / cancel: the safe choice has focus; cancelling a Cal.com booking also points at Cal.com. */}
      <AlertDialog open={!!confirmation} onOpenChange={(open) => !open && setConfirmation(null)}>
        <AlertDialogContent data-testid="dialog-booking-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{confirmationCopy?.body}</p>
                {confirmation?.kind === "cancel" && confirmation.booking.cal_event_uri && (
                  <p data-testid="text-cancel-cal-note">
                    {t("showcase.bookings.confirm.alsoCancelOnCal")}{" "}
                    <a
                      href={calCancelUrl(confirmation.booking.cal_event_uri)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[var(--sc-ink)] underline underline-offset-4"
                      data-testid="link-cancel-on-cal"
                    >
                      {t("showcase.bookings.confirm.openCal")}
                      <ExternalLink className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                    </a>
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-keep">{confirmationCopy?.keep}</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={runConfirmation} data-testid="button-confirm-action">
              {confirmationCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompleteSessionDialog
        open={!!completing}
        onOpenChange={(open) => !open && setCompleting(null)}
        defaultCountry={completing?.country || own.mentor?.country || ""}
        pending={actions.complete.isPending}
        onConfirm={({ minutes, country }) => {
          if (!completing) return;
          actions.complete.mutate(
            { booking: completing, minutes, country },
            {
              onSuccess: () => {
                setCompleting(null);
                setChosenTab("completed");
              },
            },
          );
        }}
      />

      {calBooking && calLink && (
        <CalEmbedWithReschedule
          calLink={calLink}
          mentorName={mentorNameOf(calBooking)}
          menteeName={displayName}
          menteeEmail={user?.email}
          bookingId={calBooking.id}
          rescheduleUid={scheduling?.reschedule ? calBooking.cal_event_uri : undefined}
          open
          onOpenChange={(open) => {
            if (!open) setScheduling(null);
          }}
          onBookingSuccessful={onCalBooked(calBooking.id)}
        />
      )}

      {localReschedule && localCalLink(localReschedule) && (
        <CalEmbed
          calLink={localCalLink(localReschedule)}
          mentorName={mentorNameOf(localReschedule)}
          menteeName={displayName}
          bookingId={localReschedule.id}
          open
          onOpenChange={(open) => {
            if (!open) setLocalReschedule(null);
          }}
          onBookingSuccessful={localRescheduled(localReschedule)}
        />
      )}
    </DashboardShell>
  );
}
