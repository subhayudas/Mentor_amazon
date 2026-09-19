import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AlertCircle, ChevronDown, Lock, Mail, ShieldCheck } from "lucide-react";

import { authService } from "@/lib/services";
import { clearRoleStorage } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { ROUTES } from "@/lib/routes";
import { safeNext, ssoErrorKey, ssoLoginHref } from "@/lib/ssoClient";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthCard, AuthPage, IconInput, inlineLinkClass } from "@/components/auth/AuthCard";
import { cn } from "@/lib/utils";

/** Paths only a mentee follows; landing here from one of them means the visitor is a mentee (F-01). */
const MENTEE_PATH_PREFIXES = [ROUTES.menteeDashboard, ROUTES.myBookings, ROUTES.menteeRegistration, ROUTES.mentors, "/mentor/"] as const;

function isMenteePath(path: string): boolean {
  return MENTEE_PATH_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path.startsWith(`${p}?`));
}

/** The email the booking dialog / registration mirrored for this visitor, if any. */
function rememberedMenteeEmail(): string {
  try {
    return localStorage.getItem("menteeEmail")?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Sign in. Two audiences share the page: Amazon employees (mentors, admins)
 * use SSO; mentees use email + password. Whichever audience the visitor is
 * evidently from gets the page's one orange action (F-01): a mentee arriving
 * from a mentee route (`?next`) or with a remembered `menteeEmail` sees the
 * password form open, prefilled, with SSO as an outline alternative; everyone
 * else sees SSO first and the password form behind a disclosure. Errors are
 * inline (the toast is only secondary). Mentees without `?next` land on their
 * dashboard when a mentee row exists, otherwise on the directory (P1-1).
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

  const [passwordOpen, setPasswordOpen] = useState(menteePath);
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("auth.validation.emailRequired")).email(t("auth.validation.emailInvalid")),
        password: z.string().min(1, t("auth.validation.passwordRequired")),
        rememberMe: z.boolean().optional(),
      }),
    [t],
  );
  type LoginFormData = z.infer<typeof loginSchema>;

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: rememberedEmail, password: "", rememberMe: false },
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
    mutationFn: (data: LoginFormData) => authService.login({ email: data.email, password: data.password }),
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
      if (data.user_type === "mentor") {
        setLocation(data.profile_id ? ROUTES.mentorPortal : ROUTES.mentorOnboarding);
      } else if (data.user_type === "admin") {
        setLocation(ROUTES.admin);
      } else {
        // P1-1: a returning mentee goes to their dashboard when a mentees row exists.
        setLocation(data.profile_id ? ROUTES.menteeDashboard : ROUTES.mentors);
      }
    },
    onError: () => {
      // lib/auth throws a fixed English message for every credential failure;
      // the translated copy says what to do instead of echoing it.
      setFormError(t("auth.invalidCredentials"));
      form.setFocus("password");
    },
  });

  // Exactly one orange fill per viewport: SSO when the visitor is (probably)
  // an Amazon employee, the password submit when they are a mentee.
  const ssoBlock = (
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
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-input bg-card px-4 py-2.5 text-start transition-colors duration-fast hover:bg-muted"
          data-testid="button-toggle-password-login"
        >
          <span className="min-w-0">
            <span className="block text-body-sm font-medium text-foreground">{t("auth.sso.passwordDisclosure")}</span>
            <span className="block text-caption text-muted-foreground text-pretty">{t("auth.sso.passwordDisclosureHint")}</span>
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-fast", passwordOpen && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => {
              setFormError(null);
              loginMutation.mutate(data);
            })}
            className="space-y-4"
            noValidate
          >
            {formError && (
              <Alert variant="destructive" role="alert" data-testid="alert-login-error">
                <AlertCircle aria-hidden="true" />
                <AlertTitle className="leading-snug">{t("auth.loginFailed")}</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
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

            <FormField
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-remember-me" />
                  </FormControl>
                  <FormLabel className="cursor-pointer font-normal">{t("auth.rememberMe")}</FormLabel>
                </FormItem>
              )}
            />

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

          {menteePath ? passwordSection : ssoBlock}

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-caption text-muted-foreground">{t("auth.sso.or")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {menteePath ? ssoBlock : passwordSection}

          <div className="space-y-2 text-center text-body-sm">
            <Link href={ROUTES.forgotPassword} className="inline-block font-medium text-secondary underline-offset-4 hover:underline" data-testid="link-forgot-password">
              {t("auth.forgotPassword")}
            </Link>
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
