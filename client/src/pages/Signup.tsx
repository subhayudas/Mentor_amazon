import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AlertCircle, Lock, Mail, MailCheck, Users } from "lucide-react";

import { auth } from "@/lib/auth";
import { authService, menteeService } from "@/lib/services";
import { queryClient } from "@/lib/queryClient";
import { ROUTES } from "@/lib/routes";
import { safeNext } from "@/lib/ssoClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthCard, AuthPage, IconInput, passwordStrength, STRENGTH_CLASS } from "@/components/auth/AuthCard";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { cn } from "@/lib/utils";

/**
 * Mentee sign-up (Amazon staff use SSO). After success: `?next` wins; a
 * mentee whose row already exists (created by an anonymous request through
 * `get_or_create_mentee`) goes straight to the dashboard; everyone else
 * completes registration. When email confirmation is on there is no session
 * yet, so the page shows "check your email" instead of bouncing off a guard.
 */
export default function Signup() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmEmailFor, setConfirmEmailFor] = useState<string | null>(null);
  const nextPath = safeNext(new URLSearchParams(searchString).get("next"), "");

  const signupSchema = useMemo(
    () =>
      z
        .object({
          email: z.string().trim().min(1, t("auth.validation.emailRequired")).email(t("auth.validation.emailInvalid")),
          password: z
            .string()
            .min(8, t("auth.validation.passwordMinLength"))
            .regex(/[A-Z]/, t("auth.validation.passwordUppercase"))
            .regex(/[a-z]/, t("auth.validation.passwordLowercase"))
            .regex(/[0-9]/, t("auth.validation.passwordNumber")),
          confirmPassword: z.string().min(1, t("auth.validation.confirmRequired")),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: t("auth.validation.passwordsDoNotMatch"),
          path: ["confirmPassword"],
        }),
    [t],
  );
  type SignupFormData = z.infer<typeof signupSchema>;

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const password = form.watch("password");
  const strength = passwordStrength(password || "");

  const signupMutation = useMutation({
    mutationFn: async (data: SignupFormData) => {
      // Self-service accounts are mentee-only. Amazon mentors sign in with
      // Amazon SSO and are matched to an approved mentor record.
      const user = await authService.signup({ email: data.email, password: data.password, user_type: "mentee" });
      const session = await auth.getSession();
      // With a session the mentee can read their own row (RLS by session email).
      const existing = session ? await menteeService.getByEmail(data.email).catch(() => null) : null;
      return { user, hasSession: !!session, hasMenteeRow: !!existing };
    },
    onSuccess: ({ user, hasSession, hasMenteeRow }) => {
      queryClient.clear();
      localStorage.setItem("user", JSON.stringify(user));
      if (!hasSession) {
        setConfirmEmailFor(user.email);
        return;
      }
      toast({ title: t("auth.signupSuccess"), description: t("auth.accountCreated") });
      if (nextPath) {
        setLocation(nextPath);
      } else {
        setLocation(hasMenteeRow ? ROUTES.menteeDashboard : ROUTES.menteeRegistration);
      }
    },
    onError: (error: Error) => {
      const message = /already (registered|exists)/i.test(error.message) ? t("auth.emailInUse") : t("auth.signupError");
      setFormError(message);
    },
  });

  if (confirmEmailFor) {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="success"
          icon={MailCheck}
          title={t("auth.confirmEmailTitle")}
          description={t("auth.confirmEmailBody", { email: confirmEmailFor })}
          data-testid="card-confirm-email"
          actions={
            <Button asChild variant="secondary">
              <Link href={nextPath ? `${ROUTES.login}?next=${encodeURIComponent(nextPath)}` : ROUTES.login}>{t("auth.goToLogin")}</Link>
            </Button>
          }
        />
      </StatusPage>
    );
  }

  return (
    <AuthPage>
      <AuthCard title={t("auth.signup")} description={t("auth.signupDescription")}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => {
              setFormError(null);
              signupMutation.mutate(data);
            })}
            className="space-y-4"
            noValidate
          >
            {formError && (
              <Alert variant="destructive" role="alert" data-testid="alert-signup-error">
                <AlertCircle aria-hidden="true" />
                <AlertTitle className="leading-snug">{t("auth.signupFailed")}</AlertTitle>
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
                      autoComplete="new-password"
                      dir="ltr"
                      className="text-start"
                      placeholder={t("auth.passwordPlaceholder")}
                      aria-describedby={password ? "password-strength" : undefined}
                      data-testid="input-password"
                    />
                  </FormControl>
                  {password && (
                    <div className="space-y-1 pt-1">
                      <Progress value={strength.score} className={cn("h-2", STRENGTH_CLASS[strength.label])} aria-hidden="true" data-testid="progress-password-strength" />
                      <p id="password-strength" className="text-caption text-muted-foreground" data-testid="text-password-strength">
                        {t("auth.passwordStrength")}: {t(`auth.strength.${strength.label}`)}
                      </p>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.confirmPassword")}</FormLabel>
                  <FormControl>
                    <IconInput
                      {...field}
                      icon={Lock}
                      type="password"
                      autoComplete="new-password"
                      dir="ltr"
                      className="text-start"
                      placeholder={t("auth.confirmPasswordPlaceholder")}
                      data-testid="input-confirm-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4" data-testid="note-amazon-employees">
              <Users className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <div className="text-body-sm">
                <p className="font-medium text-foreground">{t("auth.amazonEmployeeTitle")}</p>
                <p className="text-caption text-muted-foreground text-pretty">
                  {t("auth.amazonEmployeeHint")}{" "}
                  <Link href={ROUTES.login} className="font-medium text-secondary underline-offset-4 hover:underline" data-testid="link-amazon-signin">
                    {t("auth.signInWithAmazon")}
                  </Link>
                </p>
              </div>
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={signupMutation.isPending} data-testid="button-signup">
              {signupMutation.isPending ? t("auth.signingUp") : t("auth.signupButton")}
            </Button>
          </form>
        </Form>

        <p className="mt-6 text-center text-body-sm text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <Link href={nextPath ? `${ROUTES.login}?next=${encodeURIComponent(nextPath)}` : ROUTES.login} className="font-medium text-secondary underline-offset-4 hover:underline" data-testid="link-login">
            {t("auth.loginLink")}
          </Link>
        </p>
      </AuthCard>
    </AuthPage>
  );
}
