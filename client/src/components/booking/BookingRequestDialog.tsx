import * as React from "react";
import { Link } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert } from "lucide-react";

import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { RequestRail } from "@/components/RequestRail";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/Turnstile";
import { SHORT_RETRY_SECONDS, classifyBookingError, invalidRequestFields, useSendBlocked, type BookingErrorKind } from "@/components/booking/bookingErrors";
import { DiscardRequestDialog } from "@/components/booking/DiscardRequestDialog";
import { railStopsFor } from "@/components/booking/requestState";
import { TimeZoneNote } from "@/components/profile/TimeZoneNote";
import { inlineLinkClass, textLinkDestructiveClass } from "@/components/profile/styles";
import type { PublicMentor } from "@/lib/database";
import { bidi, formatNumber } from "@/lib/format";
import { isBookingRequestError } from "@/lib/requests";
import { ROUTES, loginHref } from "@/lib/routes";
import { bookingService } from "@/lib/services";
import { lastDiscoveryHref } from "@/lib/urlState";
import { cn } from "@/lib/utils";

export const GOAL_MIN = 20;
export const GOAL_MAX = 1000;
/** The counter appears only near the limits (P1-20). */
const COUNTER_HIGH = 900;
/** Footer and success actions are the primary mobile controls: 44px below `md` (spec §3). */
const mobileTapClass = "max-md:h-11 max-md:text-base";

export interface BookingPrefill {
  name: string;
  email: string;
  /** True only when a mentees row supplied the name (P2-13). */
  nameReadOnly: boolean;
  /** True when signed in: the session email is the identity. */
  emailReadOnly: boolean;
}

export interface BookingRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mentor: PublicMentor;
  /** Localised display name. */
  mentorName: string;
  signedIn: boolean;
  prefill: BookingPrefill;
  /** `/mentors?expertise=<first tag>` for the "stopped accepting" error. */
  similarHref: string;
  /** Where focus lands on close: the CTA, or the anchored status block's first link after success. */
  returnFocusRef: React.RefObject<HTMLElement>;
  /** Called once per successful send with the email used. */
  onSent: (email: string) => void;
  /** Extra query keys to invalidate on success (the signed-in mentee's bookings). */
  invalidateKeys?: ReadonlyArray<ReadonlyArray<unknown>>;
}

type Step = "form" | "success";

interface Values {
  name: string;
  email: string;
  goal: string;
}

/** The IP limiter's window is minutes, the DB limit an hour: say which. */

/**
 * The booking request dialog (§7 as amended: P0-3/C4, P1-20/C5, P1-22,
 * P1-29, P0-1, P2-12, P2-13, P2-14).
 *
 * One step, no stepper: name, email, one guided textarea, the request rail
 * as "What happens next" and the time-zone line in a muted strip. Radix
 * Dialog only (`ResponsiveDialog`, fullscreen below `md`; at `md+` anchored
 * 32px from the top with the viewport's height, so the whole form fits at
 * 1280×720 and a growing error slot never re-centres the surface — F-07).
 * `initialFocusRef` is the goal field when name and email are prefilled,
 * else the name field. Escape, outside pointer-down, the close button and
 * Cancel all pass through the discard guard while the goal is dirty, and are
 * ignored while the send is in flight. Success is the dialog itself (F-08):
 * the DialogTitle becomes "Request sent to {name}" and receives focus, the
 * description carries the follow-up copy, the rail shows stop 1 done, and
 * there is one primary and one text link — no toast, no footer, no second
 * heading. Escape and the close button then close it and focus returns to
 * the anchored status block.
 *
 * Sending (design B4, F31): `bookingService.createRequest` posts anonymous
 * requests to `/api/requests` with a Turnstile token (the widget renders only
 * for anonymous visitors, and only when a site key is configured; no token
 * means no POST) and signed-in requests to `create_my_booking_request`, which
 * uses the account email (shown read-only). A second request while one is
 * still pending is reported as success ("already waiting"), with nothing new
 * written. The widget is reset after every failed attempt.
 */
export function BookingRequestDialog({
  open,
  onOpenChange,
  mentor,
  mentorName,
  signedIn,
  prefill,
  similarHref,
  returnFocusRef,
  onSent,
  invalidateKeys,
}: BookingRequestDialogProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const formId = React.useId();
  const alertId = React.useId();

  const [step, setStep] = React.useState<Step>("form");
  const [serverError, setServerError] = React.useState<BookingErrorKind | null>(null);
  const [retryAfter, setRetryAfter] = React.useState<number | undefined>(undefined);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [sentEmail, setSentEmail] = React.useState("");
  const [alreadyPending, setAlreadyPending] = React.useState(false);
  // Anonymous senders prove they are human; a signed-in request is tied to the account instead.
  const needsCaptcha = !signedIn && turnstileEnabled();
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);
  const turnstileRef = React.useRef<TurnstileHandle>(null);

  const nameRef = React.useRef<HTMLInputElement>(null);
  const goalRef = React.useRef<HTMLTextAreaElement>(null);
  const alertRef = React.useRef<HTMLDivElement>(null);
  const successRef = React.useRef<HTMLSpanElement>(null);

  const maxText = formatNumber(GOAL_MAX, lang);
  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, { message: t("bookingRequest.validation.name") }),
        email: z.string().trim().email({ message: t("bookingRequest.validation.email") }),
        goal: z
          .string()
          .trim()
          .min(GOAL_MIN, { message: t("bookingRequest.validation.goalShort", { name: bidi(mentorName) }) })
          .max(GOAL_MAX, { message: t("bookingRequest.validation.goalLong", { max: maxText }) }),
      }),
    [t, mentorName, maxText],
  );

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: prefill.name, email: prefill.email, goal: "" },
    mode: "onSubmit",
    // Errors clear while typing, never on blur: a blur-time re-render resizes the dialog and
    // moves the footer's Send button between mousedown and mouseup, swallowing the click.
    reValidateMode: "onChange",
  });

  const goal = useWatch({ control: form.control, name: "goal" }) ?? "";
  const goalLength = goal.length;
  const goalDirty = goalLength > 0;
  const showCounter = goalLength < GOAL_MIN || goalLength > COUNTER_HIGH;

  // Fresh form on every open (a second request after "Send another request" starts clean).
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      form.reset({ name: prefill.name, email: prefill.email, goal: "" });
      setStep("form");
      setServerError(null);
      setRetryAfter(undefined);
      setAlreadyPending(false);
      setDiscardOpen(false);
      setCaptchaToken(null);
    }
    wasOpen.current = open;
  }, [open, prefill.name, prefill.email, form]);

  // The account can finish loading after the dialog opened (a fast click on a
  // fresh page): fill what the person has not typed themselves, and always the
  // read-only account fields, so a read-only email is never left empty.
  React.useEffect(() => {
    if (!open) return;
    const dirty = form.formState.dirtyFields;
    if (prefill.email && (prefill.emailReadOnly || !dirty.email) && form.getValues("email") !== prefill.email) form.setValue("email", prefill.email);
    if (prefill.name && (prefill.nameReadOnly || !dirty.name) && form.getValues("name") !== prefill.name) form.setValue("name", prefill.name);
  }, [open, prefill.email, prefill.name, prefill.emailReadOnly, prefill.nameReadOnly, form]);

  const mutation = useMutation({
    mutationFn: (data: { mentor_id: string; mentee_name: string; mentee_email: string; goal: string; turnstileToken?: string | null }) =>
      bookingService.createRequest(data),
    onSuccess: (result, variables) => {
      try {
        // Per-browser prefill for the next request (Login reads the same keys); only once it went out.
        localStorage.setItem("menteeName", variables.mentee_name);
        localStorage.setItem("menteeEmail", variables.mentee_email);
      } catch {
        /* storage unavailable */
      }
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
      setSentEmail(variables.mentee_email);
      setAlreadyPending(result.outcome === "already_pending");
      setServerError(null);
      setStep("success");
      // Clears the dirty flag so closing the success state never asks to discard.
      form.reset({ name: variables.mentee_name, email: variables.mentee_email, goal: "" });
      onSent(variables.mentee_email);
    },
    onError: (error) => {
      // A token is single-use: any failed attempt needs a fresh check.
      if (needsCaptcha) turnstileRef.current?.reset();
      const kind = classifyBookingError(error);
      setRetryAfter(isBookingRequestError(error) ? error.retryAfterSeconds : undefined);
      if (kind === "invalidEmail") {
        form.setError("email", { type: "server", message: t("bookingRequest.error.invalidEmail") });
        form.setFocus("email");
        return;
      }
      if (kind === "invalid") {
        const fields = invalidRequestFields(error);
        if (fields.includes("goal")) form.setError("goal", { type: "server", message: t("bookingRequest.validation.goalShort", { name: bidi(mentorName) }) });
        if (fields.includes("name")) form.setError("name", { type: "server", message: t("bookingRequest.validation.name") });
      }
      if (kind === "unavailable") {
        // The mentor's is_available flipped since the profile loaded, so the
        // page and directory re-read it.
        queryClient.invalidateQueries({ queryKey: ["mentor", mentor.id] });
        queryClient.invalidateQueries({ queryKey: ["mentors"] });
      }
      setServerError(kind);
    },
  });
  const isPending = mutation.isPending;
  // After the rate limit (until its cooldown ends) or a "stopped accepting"
  // refusal another send cannot succeed, so the primary is aria-disabled
  // (still focusable) and described by the alert that says why; a fresh open
  // clears it.
  const sendBlocked = useSendBlocked(serverError, retryAfter);

  React.useEffect(() => {
    if (serverError) alertRef.current?.focus();
  }, [serverError]);

  React.useEffect(() => {
    if (step === "success") successRef.current?.focus();
  }, [step]);

  const submitValid = form.handleSubmit((values) => {
    if (mutation.isPending) return;
    if (mentor.is_available === false) {
      setServerError("unavailable");
      return;
    }
    if (needsCaptcha && !captchaToken) {
      // No token yet (still solving, blocked, or expired): no POST at all.
      setServerError("botCheck");
      return;
    }
    setServerError(null);
    mutation.mutate({
      mentor_id: mentor.id,
      mentee_name: values.name,
      mentee_email: values.email,
      goal: values.goal,
      turnstileToken: needsCaptcha ? captchaToken : undefined,
    });
  });
  const submit = (event?: React.BaseSyntheticEvent) => {
    if (sendBlocked) {
      event?.preventDefault();
      return Promise.resolve();
    }
    return submitValid(event);
  };

  const guardDirty = step === "form" && goalDirty;

  const askDiscard = React.useCallback(() => {
    if (isPending) return;
    setDiscardOpen(true);
  }, [isPending]);

  const requestClose = React.useCallback(() => {
    if (isPending) return;
    if (guardDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }, [isPending, guardDirty, onOpenChange]);

  const discard = React.useCallback(() => {
    setDiscardOpen(false);
    form.reset({ name: prefill.name, email: prefill.email, goal: "" });
    setServerError(null);
    onOpenChange(false);
  }, [form, prefill.name, prefill.email, onOpenChange]);

  const prefilled = prefill.name.trim().length > 0 && prefill.email.trim().length > 0;
  const initialFocusRef = (prefilled ? goalRef : nameRef) as React.RefObject<HTMLElement>;

  const signupHref = `${ROUTES.signup}?next=${encodeURIComponent(ROUTES.menteeBookings)}`;
  const success = step === "success";
  const successStops = railStopsFor(
    t,
    { kind: "sent", email: sentEmail, sentAt: "", source: "local" },
    { signedIn, name: bidi(mentorName) },
  ).stops;

  const footer = success ? undefined : (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={requestClose}
          aria-disabled={isPending || undefined}
          className={cn(mobileTapClass, isPending && "text-muted-foreground")}
          data-testid="button-cancel-booking"
        >
          {t("bookingRequest.cancel")}
        </Button>
        <Button
          type="submit"
          form={formId}
          loading={isPending}
          aria-disabled={sendBlocked || undefined}
          aria-describedby={sendBlocked ? alertId : undefined}
          className={cn(
            mobileTapClass,
            sendBlocked && "bg-muted text-muted-foreground hover:bg-muted active:bg-muted active:scale-100",
          )}
          data-testid="button-submit-booking"
        >
          {t("bookingRequest.send")}
        </Button>
      </>
    );

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        // The inner spans restate the type roles: `cn()` in the dialog primitives
        // drops `text-h3` / `text-body-sm` next to a colour class (ticket: lib/utils.ts
        // extendTailwindMerge); once merged these wrappers are redundant and can go.
        title={
          success ? (
            // The success heading IS the dialog title (one heading, F-08); the
            // focusable span lets it receive focus the way the old inner h3 did.
            <span className="flex items-center gap-3 text-h3">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-success"
              >
                <Check className="size-5" strokeWidth={2} />
              </span>
              <span ref={successRef} tabIndex={-1} className="min-w-0 rounded-sm" data-testid="booking-success-title" data-outcome={alreadyPending ? "already_pending" : "sent"}>
                <Trans
                  i18nKey={alreadyPending ? "bookingRequest.success.pendingTitle" : "bookingRequest.success.title"}
                  values={{ name: mentorName }}
                  components={{ name: <bdi /> }}
                />
              </span>
            </span>
          ) : (
            <span className="text-h3">
              <Trans i18nKey="bookingRequest.title" values={{ name: mentorName }} components={{ name: <bdi /> }} />
            </span>
          )
        }
        description={
          success ? (
            <span className="text-body-sm">
              {alreadyPending ? (
                <Trans
                  i18nKey="bookingRequest.success.pendingBody"
                  values={{ name: mentorName }}
                  components={{ name: <bdi /> }}
                />
              ) : signedIn ? (
                <Trans
                  i18nKey="bookingRequest.success.signedIn"
                  values={{ name: mentorName }}
                  components={{ name: <bdi /> }}
                />
              ) : (
                <>
                  <Trans
                    i18nKey="bookingRequest.success.anonymous"
                    values={{ name: mentorName, email: sentEmail }}
                    components={{ name: <bdi />, email: <bdi dir="ltr" className="font-medium text-foreground" /> }}
                  />{" "}
                  <Trans
                    i18nKey="bookingRequest.success.createAccountInline"
                    components={{
                      // `<link>` is a void tag to the Trans parser, hence `<signup>`; inline (not the
                      // 32px line-box link class) so the description keeps its line height.
                      signup: <Link href={signupHref} className={inlineLinkClass} data-testid="link-success-signup" />,
                    }}
                  />
                </>
              )}
            </span>
          ) : (
            <span className="text-body-sm">
              <Trans i18nKey="bookingRequest.description" values={{ name: mentorName }} components={{ name: <bdi /> }} />{" "}
              {t("bookingRequest.allRequired")}
            </span>
          )
        }
        size="lg"
        fullscreenOnMobile
        initialFocusRef={initialFocusRef}
        returnFocusRef={returnFocusRef}
        dirty={isPending || guardDirty}
        onDiscard={askDiscard}
        testId="dialog-booking-request"
        className="md:bottom-auto md:top-6 md:my-0 md:max-h-[calc(100dvh-3rem)]"
        bodyClassName="pb-5"
        footer={footer}
      >
        {success ? (
          <div className="flex flex-col gap-5 pt-1" data-testid="booking-success">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-caption text-muted-foreground">{t("bookingRequest.whatNext")}</p>
              <RequestRail
                size="sm"
                stops={successStops}
                ariaLabel={t("bookingRequest.whatNext")}
                className="mt-2 [&>li:not(:last-child)]:pb-3"
              />
            </div>
            {/* Primary first in the DOM so phone Tab order matches the painted order (N-12, WCAG 2.4.3); ≥sm the row is reversed so the primary keeps the inline-end. */}
            <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-start">
              {signedIn ? (
                <Button variant="secondary" className={mobileTapClass} asChild>
                  <Link href={ROUTES.menteeBookings} data-testid="link-success-bookings">
                    {t("bookingRequest.success.viewBookings")}
                  </Link>
                </Button>
              ) : (
                <Button variant="secondary" className={mobileTapClass} asChild>
                  <Link href={loginHref(ROUTES.menteeBookings)} data-testid="link-success-sign-in">
                    {t("bookingRequest.success.signIn")}
                  </Link>
                </Button>
              )}
              <Button variant="link" className="max-md:min-h-11" asChild>
                <Link href={lastDiscoveryHref()} data-testid="link-success-back">
                  {t("bookingRequest.success.backToMentors")}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-3">
              {/* Reserved error slot: grows downward, never re-centres the dialog (P2-14). */}
              <div className="min-h-0 empty:hidden">
                {serverError && (
                  <Alert
                    ref={alertRef}
                    id={alertId}
                    tabIndex={-1}
                    variant="destructive"
                    data-testid="booking-error"
                    data-kind={serverError}
                  >
                    <CircleAlert aria-hidden="true" />
                    <AlertDescription className="flex flex-col gap-2">
                      <span>
                        {serverError === "rateLimited" &&
                          (retryAfter !== undefined && retryAfter <= SHORT_RETRY_SECONDS
                            ? t("bookingRequest.error.rateLimitedSoon")
                            : t("bookingRequest.error.rateLimited"))}
                        {serverError === "unavailable" && (
                          <Trans
                            i18nKey="bookingRequest.error.unavailable"
                            values={{ name: mentorName }}
                            components={{ name: <bdi /> }}
                          />
                        )}
                        {serverError === "captcha" && t("bookingRequest.error.captcha")}
                        {serverError === "botCheck" && t("bookingRequest.error.botCheck")}
                        {serverError === "invalid" && t("bookingRequest.error.invalid")}
                        {serverError === "invalidEmail" && t("bookingRequest.error.invalidEmail")}
                        {serverError === "generic" && t("bookingRequest.error.generic")}
                        {serverError === "service" && t("bookingRequest.error.service")}
                      </span>
                      {serverError === "unavailable" && (
                        <span>
                          <Link href={similarHref} className={textLinkDestructiveClass}>
                            {t("bookingRequest.error.findSimilar")}
                          </Link>
                        </span>
                      )}
                      {(serverError === "generic" || serverError === "service") && (
                        <span>
                          <Button type="submit" form={formId} variant="outline" size="sm" data-testid="button-retry-booking">
                            {t("bookingRequest.error.tryAgain")}
                          </Button>
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("bookingRequest.nameLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          ref={(element) => {
                            field.ref(element);
                            (nameRef as React.MutableRefObject<HTMLInputElement | null>).current = element;
                          }}
                          autoComplete="name"
                          dir="auto"
                          required
                          readOnly={prefill.nameReadOnly}
                          placeholder={t("bookingRequest.namePlaceholder")}
                          data-testid="input-booking-name"
                        />
                      </FormControl>
                      {prefill.nameReadOnly && <FormDescription>{t("bookingRequest.fromAccount")}</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("bookingRequest.emailLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          spellCheck={false}
                          dir="ltr"
                          className="text-start"
                          required
                          readOnly={prefill.emailReadOnly}
                          placeholder={t("bookingRequest.emailPlaceholder")}
                          data-testid="input-booking-email"
                        />
                      </FormControl>
                      <FormDescription>
                        {prefill.emailReadOnly ? t("bookingRequest.fromAccount") : t("bookingRequest.emailHelp")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="goal"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t("bookingRequest.goalLabel")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        ref={(element) => {
                          field.ref(element);
                          (goalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = element;
                        }}
                        dir="auto"
                        required
                        minLength={GOAL_MIN}
                        rows={3}
                        className="min-h-20 resize-y"
                        placeholder={t("bookingRequest.goalPlaceholder")}
                        onKeyDown={(event) => {
                          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                            event.preventDefault();
                            void submit();
                          }
                        }}
                        data-testid="textarea-booking-goal"
                      />
                    </FormControl>
                    {/* One helper line: the prompts and, near the limits, the counter (F-07). */}
                    <FormDescription className="text-pretty">
                      {t("bookingRequest.goalHelp")}
                      {/* The "at least 20" counter yields to the validation message saying the same thing. */}
                      {showCounter && !(fieldState.error && goalLength < GOAL_MIN) && (
                        <span className="tabular-nums" data-testid="goal-counter">
                          {" "}
                          {goalLength < GOAL_MIN
                            ? t("bookingRequest.goalCountShort", { count: goalLength })
                            : t("bookingRequest.goalCountLong", {
                                typed: formatNumber(goalLength, lang),
                                max: maxText,
                              })}
                        </span>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {needsCaptcha && (
                <div role="group" aria-labelledby={`${formId}-captcha`} className="flex flex-col gap-1.5">
                  <p id={`${formId}-captcha`} className="text-body-sm font-medium text-foreground">
                    {t("bookingRequest.captchaLabel")}
                  </p>
                  <Turnstile
                    ref={turnstileRef}
                    action="booking-request"
                    className="min-h-[65px]"
                    onToken={(token) => {
                      setCaptchaToken(token);
                      // "Complete the check" is answered by the token; a server-side rejection stays until the next send.
                      if (token) setServerError((current) => (current === "botCheck" ? null : current));
                    }}
                  />
                </div>
              )}

              <div className="mt-1 rounded-lg bg-muted/40 p-3">
                <p className="text-caption text-muted-foreground">{t("bookingRequest.whatNext")}</p>
                <RequestRail
                  size="sm"
                  stops={railStopsFor(t, { kind: "cta" }, { signedIn, name: bidi(mentorName) }).stops}
                  ariaLabel={t("bookingRequest.whatNext")}
                  className="mt-2 [&>li:not(:last-child)]:pb-3"
                />
                <TimeZoneNote mentorName={mentorName} mentorTz={mentor.timezone} className="mt-2" />
              </div>
            </form>
          </Form>
        )}
      </ResponsiveDialog>

      <DiscardRequestDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        mentorName={mentorName}
        onDiscard={discard}
        returnFocusRef={goalRef}
      />
    </>
  );
}
