import * as React from "react";
import { Link } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert } from "lucide-react";

import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { DEFAULT_STOPS, RequestRail } from "@/components/RequestRail";
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
import { classifyBookingError, type BookingErrorKind } from "@/components/booking/bookingErrors";
import { DiscardRequestDialog } from "@/components/booking/DiscardRequestDialog";
import { TimeZoneNote } from "@/components/profile/TimeZoneNote";
import { textLinkDestructiveClass } from "@/components/profile/styles";
import { useToast } from "@/hooks/use-toast";
import type { PublicMentor } from "@/lib/database";
import { formatNumber } from "@/lib/format";
import { ROUTES, loginHref } from "@/lib/routes";
import { bookingService } from "@/lib/services";
import { lastDiscoveryHref } from "@/lib/urlState";

export const GOAL_MIN = 20;
export const GOAL_MAX = 1000;
/** The counter appears only near the limits (P1-20). */
const COUNTER_HIGH = 900;

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

/** The visual required marker; the legend above the fields explains it once and `required` carries the semantics. */
function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-muted-foreground">
      *
    </span>
  );
}

interface Values {
  name: string;
  email: string;
  goal: string;
}

/**
 * The booking request dialog (§7 as amended: P0-3/C4, P1-20/C5, P1-22,
 * P1-29, P0-1, P2-12, P2-13, P2-14).
 *
 * One step, no stepper: name, email, one guided textarea, the request rail
 * as "What happens next" and the time-zone line. Radix Dialog only
 * (`ResponsiveDialog`, fullscreen below `md`, top-anchored at `md+` so a
 * growing error slot never re-centres the surface). `initialFocusRef` is the
 * goal field when name and email are prefilled, else the name field.
 * Escape, outside pointer-down, the close button and Cancel all pass through
 * the discard guard while the goal is dirty, and are ignored while the send
 * is in flight. Success renders inside the dialog (never toast-only): the
 * h3 receives focus, and on close focus returns to the anchored status block.
 * `bookingService.createRequest({ mentor_id, mentee_name, mentee_email, goal })`
 * is called exactly as before (RLS depends on it) and the legacy toast keeps
 * firing (TESTING e1).
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const formId = React.useId();

  const [step, setStep] = React.useState<Step>("form");
  const [serverError, setServerError] = React.useState<BookingErrorKind | null>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [sentEmail, setSentEmail] = React.useState("");

  const nameRef = React.useRef<HTMLInputElement>(null);
  const goalRef = React.useRef<HTMLTextAreaElement>(null);
  const alertRef = React.useRef<HTMLDivElement>(null);
  const successRef = React.useRef<HTMLHeadingElement>(null);

  const maxText = formatNumber(GOAL_MAX, lang);
  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, { message: t("bookingRequest.validation.name") }),
        email: z.string().trim().email({ message: t("bookingRequest.validation.email") }),
        goal: z
          .string()
          .trim()
          .min(GOAL_MIN, { message: t("bookingRequest.validation.goalShort", { name: mentorName }) })
          .max(GOAL_MAX, { message: t("bookingRequest.validation.goalLong", { max: maxText }) }),
      }),
    [t, mentorName, maxText],
  );

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: prefill.name, email: prefill.email, goal: "" },
    mode: "onSubmit",
    reValidateMode: "onBlur",
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
      setDiscardOpen(false);
    }
    wasOpen.current = open;
  }, [open, prefill.name, prefill.email, form]);

  const mutation = useMutation({
    mutationFn: (data: { mentor_id: string; mentee_name: string; mentee_email: string; goal: string }) =>
      bookingService.createRequest(data),
    onSuccess: (_booking, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
      toast({
        title: t("booking.requestSentTitle"),
        description: t("booking.requestSentBody"),
      });
      setSentEmail(variables.mentee_email);
      setServerError(null);
      setStep("success");
      // Clears the dirty flag so closing the success state never asks to discard.
      form.reset({ name: variables.mentee_name, email: variables.mentee_email, goal: "" });
      onSent(variables.mentee_email);
    },
    onError: (error) => {
      const kind = classifyBookingError(error);
      if (kind === "invalidEmail") {
        form.setError("email", { type: "server", message: t("bookingRequest.error.invalidEmail") });
        form.setFocus("email");
        return;
      }
      if (kind === "unavailable") {
        // RLS refused the insert: the mentor's is_available flipped since the
        // profile loaded, so the page and directory re-read it.
        queryClient.invalidateQueries({ queryKey: ["mentor", mentor.id] });
        queryClient.invalidateQueries({ queryKey: ["mentors"] });
      }
      setServerError(kind);
    },
  });
  const isPending = mutation.isPending;

  React.useEffect(() => {
    if (serverError) alertRef.current?.focus();
  }, [serverError]);

  React.useEffect(() => {
    if (step === "success") successRef.current?.focus();
  }, [step]);

  const submit = form.handleSubmit((values) => {
    if (mutation.isPending) return;
    if (mentor.is_available === false) {
      setServerError("unavailable");
      return;
    }
    try {
      localStorage.setItem("menteeName", values.name);
      localStorage.setItem("menteeEmail", values.email);
    } catch {
      /* storage unavailable: the request still goes out */
    }
    setServerError(null);
    mutation.mutate({
      mentor_id: mentor.id,
      mentee_name: values.name,
      mentee_email: values.email,
      goal: values.goal,
    });
  });

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

  const footer =
    step === "form" ? (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={requestClose}
          aria-disabled={isPending || undefined}
          className={isPending ? "text-muted-foreground" : undefined}
          data-testid="button-cancel-booking"
        >
          {t("bookingRequest.cancel")}
        </Button>
        <Button type="submit" form={formId} loading={isPending} data-testid="button-submit-booking">
          {t("bookingRequest.send")}
        </Button>
      </>
    ) : (
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-success">
        {t("bookingRequest.success.close")}
      </Button>
    );

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={<Trans i18nKey="bookingRequest.title" values={{ name: mentorName }} components={{ name: <bdi /> }} />}
        description={
          <Trans i18nKey="bookingRequest.description" values={{ name: mentorName }} components={{ name: <bdi /> }} />
        }
        hideDescription={step === "success"}
        size="lg"
        fullscreenOnMobile
        initialFocusRef={initialFocusRef}
        returnFocusRef={returnFocusRef}
        dirty={isPending || guardDirty}
        onDiscard={askDiscard}
        testId="dialog-booking-request"
        className="md:bottom-auto md:top-[10vh] md:my-0 md:max-h-[80vh]"
        bodyClassName="pb-3"
        footer={footer}
      >
        {step === "success" ? (
          // Fullscreen on mobile: centre the confirmation in the viewport, clear of the top toast.
          <div
            className="flex flex-col items-center gap-4 py-2 text-center max-md:min-h-full max-md:justify-center"
            data-testid="booking-success"
          >
            <span className="grid size-10 place-items-center rounded-full bg-success-soft text-success">
              <Check className="size-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 ref={successRef} tabIndex={-1} className="text-h3 text-foreground">
              <Trans i18nKey="bookingRequest.success.title" values={{ name: mentorName }} components={{ name: <bdi /> }} />
            </h3>
            <p className="max-w-prose text-body-sm text-muted-foreground text-pretty">
              {signedIn ? (
                <Trans
                  i18nKey="bookingRequest.success.signedIn"
                  values={{ name: mentorName }}
                  components={{ name: <bdi /> }}
                />
              ) : (
                <Trans
                  i18nKey="bookingRequest.success.anonymous"
                  values={{ name: mentorName, email: sentEmail }}
                  components={{ name: <bdi />, email: <bdi dir="ltr" className="font-medium text-foreground" /> }}
                />
              )}
            </p>
            <RequestRail
              size="sm"
              stops={DEFAULT_STOPS(t, ["done", "next", "next"])}
              ariaLabel={t("bookingRequest.whatNext")}
              className="w-full max-w-sm text-start"
            />
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {signedIn ? (
                <Button variant="secondary" asChild>
                  <Link href={ROUTES.menteeBookings} data-testid="link-success-bookings">
                    {t("bookingRequest.success.viewBookings")}
                  </Link>
                </Button>
              ) : (
                <>
                  <Button variant="secondary" asChild>
                    <Link href={loginHref(ROUTES.menteeBookings)} data-testid="link-success-sign-in">
                      {t("bookingRequest.success.signIn")}
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={signupHref} data-testid="link-success-signup">
                      {t("bookingRequest.success.createAccount")}
                    </Link>
                  </Button>
                </>
              )}
              <Button variant={signedIn ? "outline" : "link"} asChild>
                <Link href={lastDiscoveryHref()} data-testid="link-success-back">
                  {t("bookingRequest.success.backToMentors")}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
              {/* Reserved error slot: grows downward, never re-centres the dialog (P2-14). */}
              <div className="min-h-0 empty:hidden">
                {serverError && (
                  <Alert
                    ref={alertRef}
                    tabIndex={-1}
                    variant="destructive"
                    data-testid="booking-error"
                    data-kind={serverError}
                  >
                    <CircleAlert aria-hidden="true" />
                    <AlertDescription className="flex flex-col gap-2">
                      <span>
                        {serverError === "rateLimited" && t("bookingRequest.error.rateLimited")}
                        {serverError === "unavailable" && (
                          <Trans
                            i18nKey="bookingRequest.error.unavailable"
                            values={{ name: mentorName }}
                            components={{ name: <bdi /> }}
                          />
                        )}
                        {serverError === "generic" && t("bookingRequest.error.generic")}
                      </span>
                      {serverError === "unavailable" && (
                        <span>
                          <Link href={similarHref} className={textLinkDestructiveClass}>
                            {t("bookingRequest.error.findSimilar")}
                          </Link>
                        </span>
                      )}
                      {serverError === "generic" && (
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

              <p className="text-caption text-muted-foreground">{t("bookingRequest.requiredNote")}</p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("bookingRequest.nameLabel")} <RequiredMark />
                      </FormLabel>
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
                      <FormLabel>
                        {t("bookingRequest.emailLabel")} <RequiredMark />
                      </FormLabel>
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("bookingRequest.goalLabel")} <RequiredMark />
                    </FormLabel>
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
                        className="min-h-24 resize-y"
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
                    <FormDescription className="text-pretty">
                      {t("bookingRequest.goalHelp")}
                      {showCounter && (
                        <span className="mt-1 block tabular-nums" data-testid="goal-counter">
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

              <div className="border-t border-border pt-4">
                <p className="text-caption text-muted-foreground">{t("bookingRequest.whatNext")}</p>
                <RequestRail
                  size="sm"
                  stops={DEFAULT_STOPS(t)}
                  ariaLabel={t("bookingRequest.whatNext")}
                  className="mt-2"
                />
                <TimeZoneNote mentorName={mentorName} mentorTz={mentor.timezone} className="mt-3" />
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
