import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, RefreshCw, ShieldCheck } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthCard, AuthPage, IconInput, passwordStrength, STRENGTH_CLASS } from "@/components/auth/AuthCard";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { isRecoverySession } from "@/context/AuthContext";
import { auth, syncRoleStorage } from "@/lib/auth";
import { authErrorKey, mapAuthError, toAuthFlowError } from "@/lib/authErrors";
import { isAmazonSessionUser } from "@/lib/authFlow";
import { authService } from "@/lib/services";
import { INITIAL_AUTH_HASH, supabase } from "@/lib/supabase";
import { ROUTES } from "@/lib/routes";
import { ssoLoginHref } from "@/lib/ssoClient";
import { cn } from "@/lib/utils";

/** How long to wait for the recovery fragment to become a session before calling the link invalid. */
const RECOVERY_GRACE_MS = 4000;

type Gate = "checking" | "ready" | "invalid" | "amazon" | "error";

/**
 * Set a new password from a Supabase recovery link (D13, F11, F34). The form
 * opens ONLY for a password-recovery session: the recovery link's fragment
 * (captured before supabase-js consumed it) or a `PASSWORD_RECOVERY` event.
 * An ordinary signed-in session, an expired or used link, or no session at
 * all gets the invalid-link state. An Amazon (SSO) account never gets a
 * password: the page refuses and signs that recovery session out.
 */
export default function ResetPassword() {
  const { t } = useTranslation();
  const [gate, setGate] = useState<Gate>(() => (INITIAL_AUTH_HASH.errorCode ? "invalid" : "checking"));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bumped by Retry after a failed account check: re-runs the decision below.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (INITIAL_AUTH_HASH.errorCode) return;
    let cancelled = false;
    let deciding = false;
    const refuseAmazon = async () => {
      // Amazon accounts sign in through Amazon only; the recovery session must not linger.
      await supabase.auth.signOut().catch(() => undefined);
      syncRoleStorage(null);
      if (!cancelled) setGate("amazon");
    };
    /**
     * Fail closed (F11): the form opens only when this is the recovery session
     * AND the account is known not to be an Amazon one. The session's own
     * metadata is checked first (no database read); then the users row. Any
     * failure along the way is an error state with Retry, never the form.
     */
    const decide = async () => {
      if (cancelled || deciding) return;
      deciding = true;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const sessionUser = data.session?.user;
        if (!sessionUser) {
          deciding = false; // no session yet: wait for the event, or the grace timeout
          return;
        }
        if (cancelled) return;
        if (!isRecoverySession(sessionUser.id)) {
          setGate("invalid");
          return;
        }
        if (isAmazonSessionUser(sessionUser)) {
          await refuseAmazon();
          return;
        }
        const current = await auth.getCurrentUser();
        if (cancelled) return;
        // getCurrentUser answers null when GoTrue could not confirm the user: unknown, so no form.
        if (!current || current.id !== sessionUser.id) throw new Error("reset-account-unverified");
        if (current.amazon_alias) {
          await refuseAmazon();
          return;
        }
        setGate("ready");
      } catch (error) {
        console.error("Could not verify the account for this reset link:", error);
        if (!cancelled) setGate("error");
      }
    };
    // Supabase holds its auth lock while it runs this callback: decide on the next tick.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) window.setTimeout(() => void decide(), 0);
    });
    void decide();
    const giveUp = window.setTimeout(() => {
      if (!cancelled) setGate((current) => (current === "checking" ? "invalid" : current));
    }, RECOVERY_GRACE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
      subscription.unsubscribe();
    };
  }, [attempt]);

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
    onSuccess: async () => {
      // The recovery session has done its job: sign in again with the new password.
      await supabase.auth.signOut().catch(() => undefined);
      syncRoleStorage(null);
      setDone(true);
    },
    onError: (error) => {
      const kind = mapAuthError(toAuthFlowError(error).code, toAuthFlowError(error).status, "update");
      const key = authErrorKey(kind);
      setFormError(key && kind !== "invalid_credentials" ? t(key) : t("auth.resetPasswordError"));
    },
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

  if (gate === "amazon") {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="warning"
          icon={ShieldCheck}
          title={t("auth.reset.amazonTitle")}
          description={t("auth.reset.amazonBody")}
          data-testid="card-reset-amazon"
          actions={
            <>
              <a href={ssoLoginHref()} className={buttonVariants({ variant: "primary" })} data-testid="link-reset-amazon-sso">
                {t("auth.sso.signInWithAmazon")}
              </a>
              <Button asChild variant="outline">
                <Link href={ROUTES.login}>{t("auth.backToLogin")}</Link>
              </Button>
            </>
          }
        />
      </StatusPage>
    );
  }

  if (gate === "error") {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="danger"
          icon={AlertCircle}
          title={t("auth.reset.checkFailedTitle")}
          description={t("auth.reset.checkFailedBody")}
          data-testid="card-reset-error"
          actions={
            <Button
              variant="primary"
              onClick={() => {
                setGate("checking");
                setAttempt((n) => n + 1);
              }}
              data-testid="button-reset-retry"
            >
              <RefreshCw aria-hidden="true" />
              {t("common.tryAgain")}
            </Button>
          }
        />
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
