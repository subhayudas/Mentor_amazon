import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AlertCircle, ChevronRight, Lock, Mail, ShieldCheck } from "lucide-react";

import { authService } from "@/lib/services";
import { LOCAL_ADMIN_EMAIL, findLocalAccount, setLocalSession } from "@/lib/localAuth";
import { clearRoleStorage, rememberedMenteeEmail } from "@/lib/auth";
import { authErrorKey, mapAuthError, toAuthFlowError, type AuthErrorKind } from "@/lib/authErrors";
import { Turnstile, turnstileEnabled, type TurnstileHandle, type TurnstileStatus } from "@/components/Turnstile";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { queryClient } from "@/lib/queryClient";
import { ROUTES, isMenteePath } from "@/lib/routes";
import { IS_LOCAL } from "@/lib/demo";
import { safeNext, ssoErrorKey, ssoLoginHref } from "@/lib/ssoClient";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthCard, AuthPage, IconInput, inlineLinkClass } from "@/components/auth/AuthCard";
import { cn } from "@/lib/utils";

/**
 * Sign in. Two audiences share the page: Amazon employees (mentors, admins)
 * use SSO; mentees use email + password. Whichever audience the visitor is
 * evidently from gets the page's one orange action (F-01): a mentee arriving
 * from a mentee route (`?next`) or with a remembered `menteeEmail` sees the
 * password form open, prefilled, with SSO as an outline alternative; everyone
 * else sees SSO first and the password form behind a disclosure. Errors are
 * inline (the toast is only secondary). Mentees without `?next` land on their
 * dashboard when a mentee row exists, otherwise on the directory (P1-1).
 * The password form carries the Turnstile check when it is enabled (F31):
 * submit waits for a token and the widget resets after every attempt. An
 * unconfirmed email gets "Confirm your email first" with Resend (F33).
 */
export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  // api/auth/callback/amazon sends failures back here as ?error=sso_* (+ &reason= on integ).
  const searchParams = new URLSearchParams(searchString);
  const ssoErrorMessageKey = ssoErrorKey(searchParams.get("error"));
  const ssoReason = searchParams.get("reason");
  // RouteGuard / MentorOnboarding send anonymous visitors here with ?next=<same-origin path>.
  const nextPath = safeNext(searchParams.get("next"), "");

  // Decided once per mount: the booking success state sends anonymous mentees
  // here with ?next=/mentee-dashboard/bookings and a mirrored email.
  const [rememberedEmail] = useState(rememberedMenteeEmail);
  const menteePath = Boolean(rememberedEmail) || (nextPath !== "" && isMenteePath(nextPath));

  const [passwordOpen, setPasswordOpen] = useState(menteePath || IS_LOCAL);
  const [formError, setFormError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AuthErrorKind | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaStatus, setCaptchaStatus] = useState<TurnstileStatus>("loading");
  // A token means the check works now: a message saying it could not run, or was not done, no longer applies.
  const onCaptchaToken = (token: string | null) => {
    setCaptchaToken(token);
    if (token) setFormError((current) => (current === t("auth.captcha.unavailable") || current === t("auth.errors.captchaRequired") ? null : current));
  };
  const needsCaptcha = !IS_LOCAL && turnstileEnabled();

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("auth.validation.emailRequired")).email(t("auth.validation.emailInvalid")),
        password: IS_LOCAL ? z.string().optional() : z.string().min(1, t("auth.validation.passwordRequired")),
      }),
    [t],
  );
  type LoginFormData = z.infer<typeof loginSchema>;

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: rememberedEmail, password: IS_LOCAL ? "local" : "" },
  });

  // Expanding the disclosure moves focus into the form (D7). On the mentee
  // path the form is open on load; the route-change effect owns focus (h1)
  // then, so nothing steals it.
  useEffect(() => {
    if (!passwordOpen || menteePath) return;
    const frame = window.requestAnimationFrame(() => emailRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [passwordOpen, menteePath]);

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      if (IS_LOCAL) {
        // No auth backend: the account is the locally registered email (lib/localAuth).
        const account = findLocalAccount(data.email);
        if (!account) throw new Error("local-account-not-found");
        setLocalSession(account);
        return account;
      }
      return authService.login({ email: data.email, password: data.password ?? "" }, { captchaToken });
    },
    onSettled: () => {
      // A Turnstile token is single-use: every attempt needs a fresh one.
      if (needsCaptcha) turnstileRef.current?.reset();
    },
    onSuccess: (data) => {
      localStorage.setItem("user", JSON.stringify(data));

      // Role-specific localStorage mirrors for legacy consumers. Always clear
      // the opposite role first so a previous session's ids can't leak into
      // this one. Access control derives identity from the session, not storage.
      if (data.user_type === "mentor") {
        clearRoleStorage("mentor");
        if (data.profile_id) localStorage.setItem("mentorId", data.profile_id);
        localStorage.setItem("mentorEmail", data.email);
      } else if (data.user_type === "mentee") {
        clearRoleStorage("mentee");
        if (data.profile_id) localStorage.setItem("menteeId", data.profile_id);
        localStorage.setItem("menteeEmail", data.email);
      } else {
        clearRoleStorage();
      }

      window.dispatchEvent(new CustomEvent("userRegistered"));
      queryClient.clear();
      toast.success(t("auth.loginSuccess"), { description: t("auth.welcomeBack") });

      if (nextPath) {
        setLocation(nextPath);
        return;
      }
      if (IS_LOCAL) {
        setLocation("/dashboard");
        return;
      }
      if (data.user_type === "mentor") {
        setLocation(data.profile_id ? ROUTES.mentorPortal : ROUTES.mentorOnboarding);
      } else if (data.user_type === "admin") {
        setLocation(ROUTES.admin);
      } else {
        // P1-1: a returning mentee goes to their dashboard when a mentees row exists.
        setLocation(data.profile_id ? ROUTES.menteeDashboard : ROUTES.mentors);
      }
    },
    onError: (error, variables) => {
      if (IS_LOCAL) {
        setFormError(t("showcase.auth.localNotFound"));
        form.setFocus("password");
        return;
      }
      // lib/auth throws AuthFlowError; the translated copy says what to do next (F33).
      const flowError = toAuthFlowError(error);
      const kind = mapAuthError(flowError.code, flowError.status, "login");
      setErrorKind(kind);
      if (kind === "email_not_confirmed") {
        setUnconfirmedEmail(variables.email.trim());
        setFormError(t("auth.errors.email_not_confirmed"));
        return;
      }
      setUnconfirmedEmail(null);
      setFormError(t(authErrorKey(kind) ?? "auth.invalidCredentials"));
      if (kind === "invalid_credentials") form.setFocus("password");
    },
  });

  // Exactly one orange fill per viewport: SSO when the visitor is (probably)
  // an Amazon employee, the password submit when they are a mentee.
  const ssoBlock = IS_LOCAL ? (
    // Amazon Federate lives in the Vercel API + a database; neither exists in local mode.
    <div className="rounded-[12px] border border-[var(--sc-hairline)] bg-[var(--sc-sand)] p-4 text-[14px] leading-[22px] text-[var(--sc-ink-soft)]" data-testid="sso-local-note">
      <p className="font-semibold text-[var(--sc-ink)]">{t("auth.sso.signInWithAmazon")}</p>
      <p className="mt-1">{t("showcase.auth.localSso")}</p>
      <p className="mt-2">
        {t("showcase.auth.localAdmin")} <code className="rounded bg-white px-1.5 py-0.5 text-[13px]" dir="ltr">{LOCAL_ADMIN_EMAIL}</code>
      </p>
    </div>
  ) : (
    <div className="space-y-2">
      <a
        href={ssoLoginHref(nextPath)}
        className={cn(buttonVariants({ variant: menteePath ? "outline" : "primary", size: "lg" }), "w-full")}
        data-testid="link-amazon-sso"
      >
        <ShieldCheck aria-hidden="true" />
        {t("auth.sso.signInWithAmazon")}
      </a>
      <p className="text-center text-caption text-muted-foreground text-pretty">{t("auth.sso.amazonHint")}</p>
    </div>
  );

  const passwordSection = (
    <Collapsible open={passwordOpen} onOpenChange={setPasswordOpen}>
      {!IS_LOCAL && (
      <CollapsibleTrigger asChild>
        {/* A ghost disclosure with a leading chevron, not a bordered box with a trailing one — that silhouette read as a Select (N-07). */}
        <button
          type="button"
          className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-2 text-start transition-colors duration-fast hover:bg-muted"
          data-testid="button-toggle-password-login"
        >
          <ChevronRight
            className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-fast rtl:-scale-x-100", passwordOpen && "rotate-90")}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-body-sm font-medium text-secondary">{t("auth.sso.passwordDisclosure")}</span>
            <span className="block text-caption text-muted-foreground text-pretty">{t("auth.sso.passwordDisclosureHint")}</span>
          </span>
        </button>
      </CollapsibleTrigger>
      )}
      <CollapsibleContent className="pt-4">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => {
              setFormError(null);
              setErrorKind(null);
              if (needsCaptcha && !captchaToken) {
                setFormError(captchaStatus === "failed" ? t("auth.captcha.unavailable") : t("auth.errors.captchaRequired"));
                return;
              }
              loginMutation.mutate(data);
            })}
            className="space-y-4"
            noValidate
          >
            {formError && (
              <Alert variant={errorKind === "email_not_confirmed" ? "warning" : "destructive"} role="alert" data-testid="alert-login-error" data-kind={errorKind ?? undefined}>
                <AlertCircle aria-hidden="true" />
                <AlertTitle className="leading-snug">{t(errorKind === "email_not_confirmed" ? "auth.errors.confirmFirstTitle" : "auth.loginFailed")}</AlertTitle>
                <AlertDescription>
                  <p>{formError}</p>
                  {errorKind === "email_not_confirmed" && unconfirmedEmail && <ResendConfirmation email={unconfirmedEmail} next={nextPath || null} className="mt-3" />}
                </AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.email")}</FormLabel>
                  <FormControl>
                    <IconInput
                      {...field}
                      ref={(node) => {
                        field.ref(node);
                        emailRef.current = node;
                      }}
                      icon={Mail}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      spellCheck={false}
                      dir="ltr"
                      className="text-start"
                      placeholder={t("auth.emailPlaceholder")}
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!IS_LOCAL && (
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.password")}</FormLabel>
                  <FormControl>
                    <IconInput
                      {...field}
                      icon={Lock}
                      type="password"
                      autoComplete="current-password"
                      dir="ltr"
                      className="text-start"
                      placeholder={t("auth.passwordPlaceholder")}
                      data-testid="input-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            )}

            {needsCaptcha && <Turnstile ref={turnstileRef} onToken={onCaptchaToken} onStatus={setCaptchaStatus} action="login" copy="auth" />}

            <Button type="submit" variant={menteePath ? "primary" : "secondary"} size="lg" className="w-full" loading={loginMutation.isPending} data-testid="button-login">
              {loginMutation.isPending ? t("auth.loggingIn") : t("auth.loginButton")}
            </Button>
          </form>
        </Form>
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <AuthPage>
      <AuthCard title={t("auth.login")} description={t("auth.loginDescription")}>
        <div className="space-y-5" data-mentee-path={menteePath || undefined}>
          {ssoErrorMessageKey && (
            <Alert variant="destructive" data-testid="alert-sso-error">
              <AlertCircle aria-hidden="true" />
              <AlertTitle className="leading-snug">{t("auth.sso.errorTitle")}</AlertTitle>
              <AlertDescription>
                <p>{t(ssoErrorMessageKey)}</p>
                {ssoReason && (
                  <p className="mt-1 font-mono text-caption text-muted-foreground" dir="ltr" data-testid="text-sso-error-reason">
                    {t("auth.sso.errorReference", { reason: ssoReason })}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {IS_LOCAL ? (
            <>
              {passwordSection}
              {ssoBlock}
            </>
          ) : (
            <>
              {menteePath ? passwordSection : ssoBlock}

              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-caption text-muted-foreground">{t("auth.sso.or")}</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              {menteePath ? ssoBlock : passwordSection}
            </>
          )}

          <div className="space-y-2 text-center text-body-sm">
            {!IS_LOCAL && (
            <Link href={ROUTES.forgotPassword} className="inline-block font-medium text-secondary underline-offset-4 hover:underline" data-testid="link-forgot-password">
              {t("auth.forgotPassword")}
            </Link>
            )}
            <p className="text-muted-foreground">
              {t("auth.noAccount")}{" "}
              <Link href={nextPath ? `${ROUTES.signup}?next=${encodeURIComponent(nextPath)}` : ROUTES.signup} className={inlineLinkClass} data-testid="link-signup">
                {t("auth.signupLink")}
              </Link>
            </p>
          </div>
        </div>
      </AuthCard>
    </AuthPage>
  );
}
