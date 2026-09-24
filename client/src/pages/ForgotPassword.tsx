import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Mail, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthCard, AuthPage, IconInput } from "@/components/auth/AuthCard";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/Turnstile";
import { authErrorKey, mapAuthError, toAuthFlowError, type AuthErrorKind } from "@/lib/authErrors";
import { authService } from "@/lib/services";
import { ROUTES } from "@/lib/routes";

/**
 * What the person must hear about: they can act on these (wait, retry the
 * check, reconnect, contact the team). Anything else shows the same "check
 * your email" card as a success, so the page never reveals whether an account
 * exists (F33).
 */
const SURFACED: ReadonlySet<AuthErrorKind> = new Set<AuthErrorKind>(["email_rate_limited", "request_rate_limited", "send_failed", "captcha_failed", "network"]);

/** Request a password-reset email (Turnstile when enabled, F31). Never reveals whether the email exists. */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const needsCaptcha = turnstileEnabled();

  const schema = useMemo(
    () => z.object({ email: z.string().trim().min(1, t("auth.validation.emailRequired")).email(t("auth.validation.emailInvalid")) }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const send = useMutation({
    mutationFn: async (data: Values) => {
      try {
        await authService.forgotPassword(data.email, { captchaToken });
      } catch (error) {
        const flowError = toAuthFlowError(error);
        const kind = mapAuthError(flowError.code, flowError.status, "recover");
        if (SURFACED.has(kind)) throw flowError;
        // Anything else is answered like a success: no account enumeration.
      }
      return data.email;
    },
    onSettled: () => {
      if (needsCaptcha) turnstileRef.current?.reset();
    },
    onSuccess: (email) => setSubmittedEmail(email),
    onError: (error) => {
      const flowError = toAuthFlowError(error);
      const key = authErrorKey(mapAuthError(flowError.code, flowError.status, "recover"));
      setFormError(key ? t(key) : t("auth.forgotPasswordError"));
    },
  });

  if (submittedEmail) {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="success"
          icon={MailCheck}
          title={t("auth.checkYourEmail")}
          description={
            <>
              <p>{t("auth.resetEmailSent", { email: submittedEmail })}</p>
              <p className="mt-2">{t("auth.resetEmailInstructions")}</p>
            </>
          }
          data-testid="card-reset-email-sent"
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setSubmittedEmail(null);
                  form.reset();
                }}
                data-testid="button-try-different-email"
              >
                {t("auth.tryDifferentEmail")}
              </Button>
              <Button asChild variant="ghost" data-testid="link-back-to-login-success">
                <Link href={ROUTES.login}>
                  <ArrowLeft className="rtl:-scale-x-100" aria-hidden="true" />
                  {t("auth.backToLogin")}
                </Link>
              </Button>
            </>
          }
        />
      </StatusPage>
    );
  }

  return (
    <AuthPage>
      <AuthCard title={t("auth.forgotPasswordTitle")} description={t("auth.forgotPasswordDescription")}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => {
              setFormError(null);
              if (needsCaptcha && !captchaToken) {
                setFormError(t("auth.errors.captchaRequired"));
                return;
              }
              send.mutate(data);
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

            {needsCaptcha && <Turnstile ref={turnstileRef} onToken={setCaptchaToken} action="recover" />}

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={send.isPending} data-testid="button-send-reset-link">
              {send.isPending ? t("auth.sending") : t("auth.sendResetLink")}
            </Button>

            <div className="text-center">
              <Button asChild variant="ghost" data-testid="link-back-to-login">
                <Link href={ROUTES.login}>
                  <ArrowLeft className="rtl:-scale-x-100" aria-hidden="true" />
                  {t("auth.backToLogin")}
                </Link>
              </Button>
            </div>
          </form>
        </Form>
      </AuthCard>
    </AuthPage>
  );
}
