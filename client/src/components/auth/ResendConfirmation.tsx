import * as React from "react";
import { useTranslation } from "react-i18next";
import { Mail, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IconInput } from "@/components/auth/AuthCard";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/Turnstile";
import { auth } from "@/lib/auth";
import { authErrorKey, cooldownRemaining, mapAuthError, toAuthFlowError } from "@/lib/authErrors";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Send the confirmation email again" (F32): used by the sign-up "Check your
 * email" card, the sign-in "Confirm your email first" alert and the expired
 * link state on /auth/confirm. The button rests for 60 s after each send; the
 * Turnstile widget (when enabled) must produce a token first and is reset
 * after every attempt, because a token is single-use. Outcome lines are
 * announced politely.
 */
export function ResendConfirmation({
  email: fixedEmail,
  next,
  className,
  autoFocusInput = false,
}: {
  /** The address to resend to; when omitted the component asks for it. */
  email?: string;
  next?: string | null;
  className?: string;
  autoFocusInput?: boolean;
}) {
  const { t } = useTranslation();
  const inputId = React.useId();
  const [typedEmail, setTypedEmail] = React.useState("");
  const [token, setToken] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [sentAt, setSentAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const turnstileRef = React.useRef<TurnstileHandle>(null);
  const needsToken = turnstileEnabled();
  const remaining = cooldownRemaining(sentAt, now);

  React.useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  const email = (fixedEmail ?? typedEmail).trim();

  const send = async () => {
    setMessage(null);
    if (!EMAIL_RE.test(email)) {
      setMessage({ tone: "error", text: t("auth.validation.emailInvalid") });
      return;
    }
    if (needsToken && !token) {
      setMessage({ tone: "error", text: t("auth.errors.captchaRequired") });
      return;
    }
    setPending(true);
    try {
      await auth.resendSignup(email, { captchaToken: token, next });
      setSentAt(Date.now());
      setNow(Date.now());
      setMessage({ tone: "ok", text: t("auth.resend.sent", { email }) });
    } catch (error) {
      const flowError = toAuthFlowError(error);
      const kind = mapAuthError(flowError.code, flowError.status, "resend");
      const key = authErrorKey(kind);
      setMessage({ tone: "error", text: key && kind !== "invalid_credentials" ? t(key) : t("auth.resend.failed") });
    } finally {
      setPending(false);
      if (needsToken) turnstileRef.current?.reset();
    }
  };

  return (
    <div className={cn("space-y-3", className)} data-testid="resend-confirmation">
      {fixedEmail === undefined && (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>{t("auth.email")}</Label>
          <IconInput
            id={inputId}
            icon={Mail}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            dir="ltr"
            className="text-start"
            value={typedEmail}
            onChange={(e) => setTypedEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            autoFocus={autoFocusInput}
            data-testid="input-resend-email"
          />
        </div>
      )}
      {needsToken && <Turnstile ref={turnstileRef} onToken={setToken} action="resend" />}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full sm:w-auto"
        onClick={() => void send()}
        loading={pending}
        disabled={remaining > 0}
        data-testid="button-resend-confirmation"
      >
        <RotateCw className="rtl:-scale-x-100" aria-hidden="true" />
        {remaining > 0 ? t("auth.resend.wait", { seconds: remaining }) : t("auth.resend.button")}
      </Button>
      <p
        aria-live="polite"
        className={cn("min-h-5 text-body-sm", message?.tone === "error" ? "text-destructive" : "text-muted-foreground")}
        data-testid="text-resend-status"
      >
        {message?.text ?? ""}
      </p>
    </div>
  );
}
