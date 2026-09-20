import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthCard, AuthPage, IconInput, passwordStrength, STRENGTH_CLASS } from "@/components/auth/AuthCard";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { authService } from "@/lib/services";
import { supabase } from "@/lib/supabase";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** How long to wait for the recovery fragment to become a session before calling the link invalid. */
const RECOVERY_GRACE_MS = 4000;

type Gate = "checking" | "ready" | "invalid";

/**
 * Set a new password from a Supabase recovery link. The link carries the
 * recovery token in the URL fragment and becomes a session (`PASSWORD_RECOVERY`
 * event or an already-present session) — there is no `?token=` query
 * parameter, so the form is gated on the session, never on the query string.
 */
export default function ResetPassword() {
  const { t } = useTranslation();
  const [gate, setGate] = useState<Gate>("checking");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) setGate("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setGate("ready");
    });
    const giveUp = window.setTimeout(() => {
      if (!cancelled) setGate((current) => (current === "checking" ? "invalid" : current));
    }, RECOVERY_GRACE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
      subscription.unsubscribe();
    };
  }, []);

  const schema = useMemo(
    () =>
      z
        .object({
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
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "", confirmPassword: "" } });
  const password = form.watch("password");
  const strength = passwordStrength(password || "");

  const reset = useMutation({
    mutationFn: (data: Values) => authService.resetPassword(data.password),
    onSuccess: () => setDone(true),
    onError: () => setFormError(t("auth.resetPasswordError")),
  });

  if (done) {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="success"
          icon={CheckCircle2}
          title={t("auth.passwordResetSuccess")}
          description={t("auth.passwordResetSuccessDescription")}
          data-testid="card-reset-success"
          actions={
            <Button asChild variant="primary" data-testid="button-go-to-login">
              <Link href={ROUTES.login}>{t("auth.goToLogin")}</Link>
            </Button>
          }
        />
      </StatusPage>
    );
  }

  if (gate === "checking") {
    return (
      <StatusPage>
        <StatusCard titleAs="h1" tone="busy" title={t("auth.resetPasswordTitle")} description={t("auth.checkingResetLink")} aria-busy="true" data-testid="card-reset-checking" />
      </StatusPage>
    );
  }

  if (gate === "invalid") {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="danger"
          icon={AlertCircle}
          title={t("auth.invalidResetLink")}
          description={t("auth.invalidResetLinkDescription")}
          data-testid="card-reset-invalid"
          actions={
            <Button asChild variant="primary" data-testid="button-request-new-link">
              <Link href={ROUTES.forgotPassword}>{t("auth.requestNewLink")}</Link>
            </Button>
          }
        />
      </StatusPage>
    );
  }

  const eyeToggle = (shown: boolean, toggle: () => void, testId: string) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9"
      onClick={toggle}
      aria-pressed={shown}
      aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}
      data-testid={testId}
    >
      {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </Button>
  );

  return (
    <AuthPage>
      <AuthCard title={t("auth.resetPasswordTitle")} description={t("auth.resetPasswordDescription")}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => {
              setFormError(null);
              reset.mutate(data);
            })}
            className="space-y-5"
            noValidate
          >
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertCircle aria-hidden="true" />
                <AlertTitle className="leading-snug">{t("auth.error")}</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.newPassword")}</FormLabel>
                  <FormControl>
                    <IconInput
                      {...field}
                      icon={Lock}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      dir="ltr"
                      className="text-start"
                      placeholder={t("auth.newPasswordPlaceholder")}
                      aria-describedby={password ? "reset-password-strength" : undefined}
                      trailing={eyeToggle(showPassword, () => setShowPassword((s) => !s), "button-toggle-password")}
                      data-testid="input-password"
                    />
                  </FormControl>
                  {password && (
                    <div className="space-y-1 pt-1">
                      <Progress value={strength.score} className={cn("h-2", STRENGTH_CLASS[strength.label])} aria-hidden="true" />
                      <p id="reset-password-strength" className="text-caption text-muted-foreground">
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
                  <FormLabel>{t("auth.confirmNewPassword")}</FormLabel>
                  <FormControl>
                    <IconInput
                      {...field}
                      icon={Lock}
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      dir="ltr"
                      className="text-start"
                      placeholder={t("auth.confirmNewPasswordPlaceholder")}
                      trailing={eyeToggle(showConfirm, () => setShowConfirm((s) => !s), "button-toggle-confirm-password")}
                      data-testid="input-confirm-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={reset.isPending} data-testid="button-reset-password">
              {reset.isPending ? t("auth.resetting") : t("auth.resetPassword")}
            </Button>
          </form>
        </Form>
      </AuthCard>
    </AuthPage>
  );
}
