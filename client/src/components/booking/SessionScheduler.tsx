import * as React from "react";
import { lazy, Suspense } from "react";
import { Link } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, CircleAlert, Clock, Hourglass, Send } from "lucide-react";

import { CAL_NAMESPACE, loadCalApi } from "@/components/CalEmbed";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/Turnstile";
import { GOAL_MAX, GOAL_MIN } from "@/components/booking/BookingRequestDialog";
import { classifyBookingError, invalidRequestFields, isSendBlocked, type BookingErrorKind } from "@/components/booking/bookingErrors";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import type { FeaturedMentor } from "@/data/featuredMentors";
import { logActivity } from "@/lib/activity";
import { parseBookingSuccessV2 } from "@/lib/calEvents";
import { normalizeCalLink } from "@/lib/calLink";
import type { Booking, Mentee } from "@/lib/database";
import type { FeaturedPageState } from "@/lib/directory";
import { bidi, formatNumber, formatRelativeDay } from "@/lib/format";
import { localStore, newId } from "@/lib/localStore";
import { isBookingRequestError } from "@/lib/requests";
import { ROUTES, discoveryUrl, loginHref } from "@/lib/routes";
import { clearSentRequest, getSentRequest, markSent, type SentRequest } from "@/lib/sentRequests";
import { bookingService, menteeService } from "@/lib/services";
import { cn } from "@/lib/utils";

// Same on-demand chunk the scheduling dialog uses; nothing Cal-related ships in the route bundle.
const Cal = lazy(() => import("@calcom/embed-react"));

/**
 * Scheduling card on the session page `/mentor/:id/book` (design B3, F03/F42).
 *
 * Against the database it is ALWAYS the request form (D4): mentors' Cal.com
 * links stay private until they accept, and scheduling happens afterwards in
 * the dashboards. The form validates like the request dialog (name, email,
 * goal 20–1000), shows Cloudflare Turnstile to anonymous visitors when a site
 * key is configured, and sends through `bookingService.createRequest` (the
 * `/api/requests` endpoint, or the signed-in RPC). Success is shown only after
 * the server confirms, with honest copy about who replies and how to follow
 * the request; nothing is written to browser storage except the per-browser
 * "request sent" memory. A curated mentor that is not in the database yet
 * shows "Requests open soon" and no form; a mentor who stopped accepting shows
 * that instead; an unknown availability (the read failed) offers Retry.
 *
 * In demo (local) mode the form records the request in this browser, and a
 * mentor onboarded in this browser with their own Cal.com link gets the inline
 * calendar. Cal.com's public sample account is never used, in any mode.
 */
export interface SessionSchedulerProps {
  /** The mentor as displayed (overlaid with the DB row against the database). */
  mentor: FeaturedMentor;
  sessionTitle: string;
  /** Localised display name. */
  name: string;
  state: FeaturedPageState;
  onRetry: () => void;
  retrying?: boolean;
}

const inputClass =
  "mt-1 h-11 w-full rounded-[6px] border border-[#d9d9d9] bg-white px-3 text-[14px] text-[var(--sc-ink)] aria-[invalid=true]:border-[#c40000] read-only:bg-[var(--sc-sand)] read-only:text-[#5c5c5c]";
const primaryButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--sc-ink)] text-[15px] font-bold text-white hover:bg-black disabled:opacity-60";
const primaryLink = "inline-flex h-11 items-center sm:flex-1 justify-center rounded-[6px] bg-[var(--sc-ink)] px-4 text-center text-[14px] font-bold text-white hover:bg-black";
const secondaryLink =
  "inline-flex h-11 items-center justify-center rounded-[6px] border border-[#e3e8ed] sm:flex-1 px-4 text-center text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)]";

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function SessionScheduler({ mentor, sessionTitle, name, state, onRetry, retrying = false }: SessionSchedulerProps) {
  const { t } = useTranslation();
  const firstName = name.split(" ")[0] || name;

  let body: React.ReactNode;
  if (state.kind === "local") {
    body = <LocalScheduler mentor={mentor} sessionTitle={sessionTitle} name={name} requestId={state.requestId} />;
  } else if (state.kind === "loading") {
    body = (
      <div className="mt-6 space-y-3" role="status" aria-busy="true" data-testid="scheduler-loading">
        <span className="sr-only">{t("showcase.profile.checking")}</span>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else if (state.kind === "error") {
    body = (
      <Notice icon={CircleAlert} tone="danger" title={t("showcase.profile.checkError")} testId="scheduler-check-error" role="alert">
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying || undefined}
          className="mt-3 inline-flex h-11 items-center rounded-[6px] border border-[#d9d9d9] bg-white px-4 text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-[var(--sc-sand)] disabled:opacity-60"
          data-testid="button-retry-availability"
        >
          {t("common.tryAgain")}
        </button>
      </Notice>
    );
  } else if (state.kind === "static") {
    body = (
      <Notice icon={Hourglass} title={t("showcase.profile.openingSoonTitle")} testId="scheduler-opening-soon" role="status">
        <p>{t("showcase.profile.openingSoonBody", { name: bidi(name) })}</p>
      </Notice>
    );
  } else if (!state.bookable) {
    body = (
      <Notice icon={Clock} title={t("mentorProfile.notAcceptingShort")} testId="mentor-unavailable">
        <p>
          <Trans i18nKey="mentorProfile.notAcceptingBody" values={{ name }} components={{ name: <bdi /> }} />
        </p>
        <Link
          href={discoveryUrl({ expertise: mentor.expertise?.[0] ? [mentor.expertise[0]] : [] })}
          className="mt-2 inline-flex min-h-11 items-center font-semibold text-[var(--sc-ink)] underline underline-offset-4"
        >
          {t("mentorProfile.findSimilar")}
        </Link>
      </Notice>
    );
  } else {
    body = <RequestFlow mode="db" mentor={mentor} sessionTitle={sessionTitle} name={name} requestId={state.requestId} programmeManaged={state.programmeManaged} />;
  }

  return (
    <div>
      {/* The mentor's own details, always */}
      <div className="flex items-center gap-4">
        {mentor.photo_url ? (
          <img src={mentor.photo_url} alt="" className="size-14 rounded-full object-cover" />
        ) : (
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--sc-ink)] text-[20px] font-bold text-white" aria-hidden="true">
            {name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <h2 id="when-title" className="text-[18px] font-bold leading-tight text-[var(--sc-ink)]">
            {t("showcase.scheduler.title", { name: bidi(firstName) })}
          </h2>
          <p className="mt-1 inline-flex items-center gap-2 text-[13px] text-[#6c6c84]">
            <CalendarDays className="size-4" aria-hidden="true" />
            {t("showcase.rail.minutes", { minutes: mentor.session.minutes })} · {t("showcase.session.free")}
          </p>
        </div>
      </div>
      {body}
    </div>
  );
}

function Notice({
  icon: Icon,
  title,
  children,
  testId,
  role,
  tone = "neutral",
}: {
  icon: typeof Clock;
  title: React.ReactNode;
  children?: React.ReactNode;
  testId?: string;
  role?: "status" | "alert";
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      role={role}
      data-testid={testId}
      className={cn(
        "mt-6 rounded-[12px] p-4 text-[14px] leading-[22px] text-[var(--sc-ink-soft)]",
        tone === "danger" ? "border border-[#f3c4c4] bg-[#fdf1f1]" : "bg-[var(--sc-sand)]",
      )}
    >
      <p className="flex items-center gap-2 text-[15px] font-bold text-[var(--sc-ink)]">
        <Icon className={cn("size-4 shrink-0", tone === "danger" && "text-[#c40000]")} aria-hidden="true" />
        {title}
      </p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The request form (database and demo mode)
// ---------------------------------------------------------------------------

interface Values {
  name: string;
  email: string;
  goal: string;
}

type Sent = { email: string; outcome: "created" | "already_pending" | "sent" };

function RequestFlow({
  mode,
  mentor,
  sessionTitle,
  name,
  requestId,
  programmeManaged,
}: {
  mode: "db" | "local";
  mentor: FeaturedMentor;
  sessionTitle: string;
  name: string;
  requestId: string;
  programmeManaged: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const ids = React.useId();
  const firstName = name.split(" ")[0] || name;

  const [remembered, setRemembered] = React.useState<SentRequest | null>(() => getSentRequest(requestId));
  const [sent, setSent] = React.useState<Sent | null>(null);
  const [serverError, setServerError] = React.useState<BookingErrorKind | null>(null);
  const [retryAfter, setRetryAfter] = React.useState<number | undefined>(undefined);
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);
  const turnstileRef = React.useRef<TurnstileHandle>(null);
  const alertRef = React.useRef<HTMLDivElement>(null);
  const successRef = React.useRef<HTMLHeadingElement>(null);
  const needsCaptcha = mode === "db" && !signedIn && turnstileEnabled();

  React.useEffect(() => setRemembered(getSentRequest(requestId)), [requestId]);

  // Signed-in identity: the account email (the RPC uses it whatever is typed) and the mentees row name.
  const email = user?.email;
  const menteeQuery = useQuery<Mentee | null>({
    queryKey: ["mentee", "email", email],
    queryFn: () => menteeService.getByEmail(email!),
    enabled: mode === "db" && Boolean(email),
    staleTime: 5 * 60_000,
  });
  const prefill = React.useMemo(
    () =>
      signedIn
        ? { name: menteeQuery.data?.name ?? user?.name ?? "", email: user?.email ?? "" }
        : { name: readStored("menteeName"), email: readStored("menteeEmail") },
    [signedIn, menteeQuery.data?.name, user?.name, user?.email],
  );

  const maxText = formatNumber(GOAL_MAX, lang);
  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, { message: t("bookingRequest.validation.name") }).max(120, { message: t("bookingRequest.validation.name") }),
        email: z.string().trim().email({ message: t("bookingRequest.validation.email") }).max(254, { message: t("bookingRequest.validation.email") }),
        goal: z
          .string()
          .trim()
          .min(GOAL_MIN, { message: t("bookingRequest.validation.goalShort", { name: bidi(name) }) })
          .max(GOAL_MAX, { message: t("bookingRequest.validation.goalLong", { max: maxText }) }),
      }),
    [t, name, maxText],
  );
  // Errors clear while the person types (onChange), never on blur: a blur-time re-render would
  // move the Send button between mousedown and mouseup and swallow the click.
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { ...prefill, goal: "" }, mode: "onSubmit", reValidateMode: "onChange" });
  // Late prefill (the mentees row arrives after mount) fills only untouched fields.
  React.useEffect(() => {
    if (!form.formState.dirtyFields.name && prefill.name) form.setValue("name", prefill.name);
    if (!form.formState.dirtyFields.email && prefill.email) form.setValue("email", prefill.email);
  }, [prefill.name, prefill.email, form]);

  const recordLocally = React.useCallback(
    (values: Values) => {
      const existing = localStore.list("mentees").find((m) => m.email.toLowerCase() === values.email.toLowerCase());
      const menteeId =
        existing?.id ??
        localStore.add("mentees", {
          id: newId("mentee"),
          name: values.name || values.email,
          email: values.email,
          user_type: "individual",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          languages_spoken: [],
          areas_exploring: [],
          created_at: new Date().toISOString(),
        } as Mentee).id;
      const booking = localStore.add("bookings", {
        id: newId("booking"),
        mentor_id: requestId,
        mentee_id: menteeId,
        goal: values.goal,
        status: "pending",
        clicked_at: new Date().toISOString(),
        session_duration_minutes: mentor.session.minutes,
        created_at: new Date().toISOString(),
      } as Booking);
      logActivity({
        actor_type: "mentee",
        actor_id: menteeId,
        actor_name: values.name,
        type: "request_sent",
        subject_type: "booking",
        subject_id: booking.id,
        visible_to: [requestId, menteeId],
        summary: t("showcase.activity.summaries.requestSent", { mentor: name, session: sessionTitle }),
      });
    },
    [requestId, mentor.session.minutes, name, sessionTitle, t],
  );

  const mutation = useMutation({
    mutationFn: async (input: Values & { turnstileToken?: string | null }): Promise<Sent> => {
      if (mode === "local") {
        recordLocally(input);
        return { email: input.email, outcome: "created" };
      }
      const result = await bookingService.createRequest({
        mentor_id: requestId,
        mentee_name: input.name,
        mentee_email: input.email,
        goal: input.goal,
        turnstileToken: input.turnstileToken,
      });
      return { email: input.email, outcome: result.outcome };
    },
    onSuccess: (result, input) => {
      try {
        // Per-browser prefill for the next request (Login reads the same keys).
        localStorage.setItem("menteeName", input.name);
        localStorage.setItem("menteeEmail", input.email);
      } catch {
        /* storage unavailable */
      }
      markSent(requestId, signedIn && user?.email ? user.email : result.email);
      setRemembered(getSentRequest(requestId));
      setServerError(null);
      setSent(result);
      for (const key of [["bookings"], ["notifications"], ["dashboard"], ["analytics"], ["mentee"]]) void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => {
      if (needsCaptcha) turnstileRef.current?.reset();
      const kind = classifyBookingError(error);
      if (kind === "invalidEmail") {
        form.setError("email", { type: "server", message: t("bookingRequest.error.invalidEmail") });
        form.setFocus("email");
        return;
      }
      if (kind === "invalid") {
        const fields = invalidRequestFields(error);
        if (fields.includes("goal")) form.setError("goal", { type: "server", message: t("bookingRequest.validation.goalShort", { name: bidi(name) }) });
        if (fields.includes("name")) form.setError("name", { type: "server", message: t("bookingRequest.validation.name") });
      }
      if (kind === "unavailable") {
        void queryClient.invalidateQueries({ queryKey: ["mentor", requestId] });
        void queryClient.invalidateQueries({ queryKey: ["mentors"] });
      }
      setRetryAfter(isBookingRequestError(error) ? error.retryAfterSeconds : undefined);
      setServerError(kind);
    },
  });

  React.useEffect(() => {
    if (serverError) alertRef.current?.focus();
  }, [serverError]);
  React.useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const sendBlocked = isSendBlocked(serverError);
  const onSubmit = form.handleSubmit((values) => {
    if (mutation.isPending || sendBlocked) return;
    if (needsCaptcha && !captchaToken) {
      setServerError("botCheck");
      return;
    }
    setServerError(null);
    mutation.mutate({ ...values, turnstileToken: needsCaptcha ? captchaToken : undefined });
  });

  if (sent) {
    const pending = sent.outcome === "already_pending";
    const bookingsHref = "/dashboard/bookings";
    const signupHref = `${ROUTES.signup}?next=${encodeURIComponent(ROUTES.menteeBookings)}`;
    return (
      <div role="status" className="mt-6" data-testid="slot-confirmation" data-outcome={sent.outcome}>
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-[#d8f0a3] text-[var(--sc-ink)]">
          <Check className="size-6" aria-hidden="true" />
        </span>
        <h3 ref={successRef} tabIndex={-1} className="mt-4 text-[22px] font-bold text-[var(--sc-ink)] focus:outline-none">
          {pending ? t("showcase.scheduler.pendingTitle", { name: bidi(firstName) }) : t("showcase.picker.sentTitle", { name: bidi(firstName) })}
        </h3>
        <p className="mt-2 text-[15px] leading-[24px] text-[var(--sc-ink-soft)]" data-testid="text-request-followup">
          {pending
            ? t("showcase.scheduler.pendingBody")
            : programmeManaged
              ? t("showcase.scheduler.sentBodyProgramme")
              : t("showcase.scheduler.sentBodyMentor", { name: bidi(firstName) })}{" "}
          {signedIn ? (
            t("showcase.scheduler.followSignedIn")
          ) : (
            <Trans
              i18nKey="showcase.scheduler.followAnon"
              values={{ email: sent.email }}
              components={{ email: <bdi dir="ltr" className="font-semibold text-[var(--sc-ink)]" /> }}
            />
          )}
        </p>
        <dl className="mt-6 divide-y divide-[var(--sc-hairline)] rounded-[12px] border border-[var(--sc-hairline)] text-[14px]">
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-[#6c6c84]">{t("showcase.picker.session")}</dt>
            <dd className="text-end font-semibold text-[var(--sc-ink)]">{sessionTitle}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {signedIn ? (
            <Link href={bookingsHref} className={primaryLink} data-testid="link-success-bookings">
              {t("showcase.scheduler.viewBookings")}
            </Link>
          ) : (
            <>
              <Link href={signupHref} className={primaryLink} data-testid="link-success-signup">
                {t("showcase.scheduler.createAccount")}
              </Link>
              <Link href={loginHref(ROUTES.menteeBookings)} className={secondaryLink} data-testid="link-success-sign-in">
                {t("showcase.scheduler.signIn")}
              </Link>
            </>
          )}
        </div>
        <Link href={ROUTES.mentors} className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--sc-ink)] underline underline-offset-4">
          {t("mentorProfile.backToMentors")}
        </Link>
      </div>
    );
  }

  if (remembered) {
    return (
      <div className="mt-6 rounded-[12px] bg-[var(--sc-sand)] p-4" data-testid="scheduler-sent-before" role="status">
        <p className="flex items-center gap-2 text-[15px] font-bold text-[var(--sc-ink)]">
          <Check className="size-4" aria-hidden="true" />
          {t("bookingRequest.status.sent")}
        </p>
        <p className="mt-1 text-[14px] leading-[22px] text-[var(--sc-ink-soft)]">
          <Trans
            i18nKey="showcase.scheduler.sentBefore"
            values={{ when: formatRelativeDay(remembered.sentAt, lang), email: remembered.email }}
            components={{ email: <bdi dir="ltr" /> }}
          />
        </p>
        <button
          type="button"
          onClick={() => {
            clearSentRequest(requestId);
            setRemembered(null);
          }}
          className="mt-3 inline-flex h-11 items-center rounded-[6px] border border-[#d9d9d9] bg-white px-4 text-[14px] font-semibold text-[var(--sc-ink)] hover:bg-white/70"
          data-testid="button-send-another"
        >
          {t("showcase.scheduler.sendAnother")}
        </button>
      </div>
    );
  }

  const errors = form.formState.errors;
  const goalLength = form.watch("goal")?.length ?? 0;
  const errorText =
    serverError === "rateLimited"
      ? retryAfter !== undefined && retryAfter <= 15 * 60
        ? t("bookingRequest.error.rateLimitedSoon")
        : t("bookingRequest.error.rateLimited")
      : serverError === "captcha"
        ? t("bookingRequest.error.captcha")
        : serverError === "botCheck"
          ? t("bookingRequest.error.botCheck")
          : serverError === "invalid"
            ? t("bookingRequest.error.invalid")
            : serverError === "generic"
              ? t("bookingRequest.error.generic")
              : null;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate data-testid="form-session-request">
      <p className="text-[14px] leading-[22px] text-[var(--sc-ink-soft)]">
        {mode === "local"
          ? t("showcase.scheduler.noCalendar", { name: bidi(firstName) })
          : programmeManaged
            ? t("showcase.scheduler.requestIntroProgramme")
            : t("showcase.scheduler.requestIntro", { name: bidi(firstName) })}
      </p>

      {serverError && serverError !== "invalidEmail" && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="rounded-[8px] border border-[#f3c4c4] bg-[#fdf1f1] px-3 py-2 text-[13px] leading-[20px] text-[#9b1c1c]"
          data-testid="booking-error"
          data-kind={serverError}
        >
          {serverError === "unavailable" ? (
            <Trans i18nKey="bookingRequest.error.unavailable" values={{ name }} components={{ name: <bdi /> }} />
          ) : (
            errorText
          )}
        </div>
      )}

      <Field id={`${ids}-name`} label={t("bookingRequest.nameLabel")} error={errors.name?.message}>
        <input
          id={`${ids}-name`}
          {...form.register("name")}
          className={inputClass}
          autoComplete="name"
          dir="auto"
          maxLength={120}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${ids}-name-error` : undefined}
          data-testid="input-session-name"
        />
      </Field>
      <Field
        id={`${ids}-email`}
        label={t("bookingRequest.emailLabel")}
        error={errors.email?.message}
        hint={signedIn && mode === "db" ? t("bookingRequest.fromAccount") : t("bookingRequest.emailHelp")}
      >
        <input
          id={`${ids}-email`}
          type="email"
          inputMode="email"
          {...form.register("email")}
          readOnly={signedIn && mode === "db"}
          className={cn(inputClass, "text-start")}
          autoComplete="email"
          spellCheck={false}
          dir="ltr"
          maxLength={254}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={`${ids}-email-hint${errors.email ? ` ${ids}-email-error` : ""}`}
          data-testid="input-session-email"
        />
      </Field>
      <Field
        id={`${ids}-goal`}
        label={t("bookingRequest.goalLabel")}
        error={errors.goal?.message}
        hint={
          goalLength > 0 && goalLength < GOAL_MIN && !errors.goal
            ? t("bookingRequest.goalCountShort", { count: goalLength })
            : t("bookingRequest.goalHelp")
        }
      >
        <textarea
          id={`${ids}-goal`}
          rows={4}
          {...form.register("goal")}
          className="mt-1 w-full rounded-[6px] border border-[#d9d9d9] bg-white px-3 py-2 text-[14px] text-[var(--sc-ink)] aria-[invalid=true]:border-[#c40000]"
          dir="auto"
          placeholder={t("bookingRequest.goalPlaceholder")}
          aria-invalid={errors.goal ? true : undefined}
          aria-describedby={`${ids}-goal-hint${errors.goal ? ` ${ids}-goal-error` : ""}`}
          data-testid="textarea-session-goal"
        />
      </Field>

      {needsCaptcha && (
        <div role="group" aria-labelledby={`${ids}-captcha`} className="space-y-1.5">
          <p id={`${ids}-captcha`} className="text-[14px] font-semibold text-[var(--sc-ink)]">
            {t("bookingRequest.captchaLabel")}
          </p>
          <Turnstile
            ref={turnstileRef}
            action="booking-request"
            className="min-h-[65px]"
            onToken={(token) => {
              setCaptchaToken(token);
              if (token) setServerError((current) => (current === "botCheck" || current === "captcha" ? null : current));
            }}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        aria-disabled={sendBlocked || undefined}
        aria-busy={mutation.isPending || undefined}
        className={cn(primaryButton, sendBlocked && "bg-[#9a9aa5] hover:bg-[#9a9aa5]")}
        data-testid="button-send-request"
      >
        <Send className="size-4" aria-hidden="true" />
        {t("showcase.scheduler.send")}
      </button>
    </form>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-[14px] font-semibold text-[var(--sc-ink)]">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-[12px] leading-[18px] text-[#6c6c84]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] leading-[18px] text-[#c40000]" role="alert">
          {error}
        </p>
      )}
      {hint && error && <span id={`${id}-hint`} hidden />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo (local) mode
// ---------------------------------------------------------------------------

/**
 * Local mode: a mentor onboarded in this browser with their own Cal.com link
 * gets the inline calendar (the booking is recorded in this browser when Cal
 * reports it); everyone else gets the request form. No shared or sample
 * calendar, ever.
 */
function LocalScheduler({ mentor, sessionTitle, name, requestId }: { mentor: FeaturedMentor; sessionTitle: string; name: string; requestId: string }) {
  const calLink = normalizeCalLink(mentor.cal_link);
  if (!calLink) {
    return <RequestFlow mode="local" mentor={mentor} sessionTitle={sessionTitle} name={name} requestId={requestId} programmeManaged={false} />;
  }
  return <LocalCalInline calLink={calLink} mentor={mentor} sessionTitle={sessionTitle} name={name} requestId={requestId} />;
}

function LocalCalInline({ calLink, mentor, sessionTitle, name, requestId }: { calLink: string; mentor: FeaturedMentor; sessionTitle: string; name: string; requestId: string }) {
  const { t, i18n } = useTranslation();
  const [ready, setReady] = React.useState(false);
  const [done, setDone] = React.useState<{ when?: string } | null>(null);
  const firstName = name.split(" ")[0] || name;

  React.useEffect(() => {
    if (done) return;
    let disposed = false;
    const onBooked = (event: unknown) => {
      if (disposed) return;
      const detail = parseBookingSuccessV2(event);
      const booking = localStore.add("bookings", {
        id: newId("booking"),
        mentor_id: requestId,
        mentee_id: "guest",
        goal: sessionTitle,
        status: "confirmed",
        scheduled_at: detail.startTime,
        cal_event_uri: detail.uid,
        session_duration_minutes: mentor.session.minutes,
        created_at: new Date().toISOString(),
      } as Booking);
      logActivity({
        actor_type: "mentee",
        actor_id: booking.mentee_id,
        type: "booking_confirmed",
        subject_type: "booking",
        subject_id: booking.id,
        visible_to: [requestId],
        summary: t("showcase.activity.summaries.bookingConfirmed", { mentor: name, session: sessionTitle }),
      });
      setDone({ when: detail.startTime });
    };
    const onReady = () => {
      if (!disposed) setReady(true);
    };
    loadCalApi()
      .then((cal) => {
        if (disposed) return;
        cal("on", { action: "bookingSuccessfulV2", callback: onBooked as never });
        cal("on", { action: "linkReady", callback: onReady as never });
      })
      .catch(() => undefined);
    const fallback = window.setTimeout(onReady, 4000);
    return () => {
      disposed = true;
      window.clearTimeout(fallback);
      loadCalApi()
        .then((cal) => {
          cal("off", { action: "bookingSuccessfulV2", callback: onBooked as never });
          cal("off", { action: "linkReady", callback: onReady as never });
        })
        .catch(() => undefined);
    };
  }, [done, requestId, sessionTitle, mentor.session.minutes, name, t]);

  if (done) {
    const whenLabel = done.when
      ? new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(done.when))
      : "";
    return (
      <div role="status" className="mt-6" data-testid="slot-confirmation" data-outcome="confirmed">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-[#d8f0a3] text-[var(--sc-ink)]">
          <Check className="size-6" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-[22px] font-bold text-[var(--sc-ink)]">{t("showcase.scheduler.confirmedTitle", { name: bidi(firstName) })}</h3>
        <p className="mt-2 text-[15px] leading-[24px] text-[var(--sc-ink-soft)]">{t("showcase.scheduler.confirmedBody")}</p>
        {whenLabel && (
          <dl className="mt-6 rounded-[12px] border border-[var(--sc-hairline)] text-[14px]">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-[#6c6c84]">{t("showcase.picker.slot")}</dt>
              <dd className="text-end font-semibold text-[var(--sc-ink)]">{whenLabel}</dd>
            </div>
          </dl>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/dashboard/bookings" className={primaryLink}>
            {t("showcase.scheduler.viewBookings")}
          </Link>
          <Link href={ROUTES.mentors} className={secondaryLink}>
            {t("mentorProfile.backToMentors")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-container relative mt-5 min-h-[600px] overflow-hidden rounded-[16px] border border-[var(--sc-hairline)] bg-white" data-testid="cal-inline">
      <Suspense fallback={null}>
        <Cal
          namespace={CAL_NAMESPACE}
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
  );
}
