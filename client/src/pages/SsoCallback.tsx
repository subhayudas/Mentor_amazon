import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { auth, syncRoleStorage, type AuthUser } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { ROUTES } from "@/lib/routes";
import { buttonVariants } from "@/components/ui/button";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { consumeSsoFragment, ssoLoginHref, ssoDestination, takeBridgeBindCookie } from "@/lib/ssoClient";

type SsoErrorCode = "missing_token" | "bind_mismatch" | "verify_failed" | "no_user";

const ERROR_KEYS: Record<SsoErrorCode, string> = {
  missing_token: "sso.callback.errors.missing_token",
  bind_mismatch: "sso.callback.errors.bind_mismatch",
  verify_failed: "sso.callback.errors.verify_failed",
  no_user: "sso.callback.errors.no_user",
};

type Outcome =
  | { ok: true; user: AuthUser; next: string }
  | { ok: false; code: SsoErrorCode };

/**
 * The fragment is consumed (and stripped from the URL) exactly once, and the
 * one-time token can only be verified once. Sharing the in-flight promise at
 * module scope keeps a double mount (StrictMode, remount) from turning a
 * successful exchange into an error card.
 */
let inflight: Promise<Outcome> | null = null;

function completeSignIn(): Promise<Outcome> {
  if (!inflight) {
    inflight = (async (): Promise<Outcome> => {
      const fragment = consumeSsoFragment();
      if (!fragment.tokenHash) return { ok: false, code: "missing_token" };

      // The token is only redeemed in the browser that completed the Amazon
      // round trip: the callback set a cookie whose value must match the
      // fragment. A bridge URL pasted into another browser stops here.
      const bindCookie = takeBridgeBindCookie();
      if (!fragment.bind || !bindCookie || fragment.bind !== bindCookie) {
        return { ok: false, code: "bind_mismatch" };
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: fragment.tokenHash,
        type: "magiclink",
      });
      if (error) return { ok: false, code: "verify_failed" };

      const user = await auth.getCurrentUser();
      if (!user) return { ok: false, code: "no_user" };

      syncRoleStorage(user);
      localStorage.setItem("user", JSON.stringify(user));
      // Same signal the password login sends so Navigation refreshes immediately.
      window.dispatchEvent(new CustomEvent("userRegistered"));
      queryClient.clear();

      return { ok: true, user, next: fragment.next };
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * /auth/sso — second half of the Amazon sign-in bridge.
 *
 * The serverless callback lands here with `#token_hash=...&type=magiclink&next=/path`
 * in the fragment (never in the query, so it never reaches server logs). We
 * turn that one-time token into a Supabase session, hydrate the app identity
 * and route by role.
 */
export default function SsoCallback() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<SsoErrorCode | null>(null);

  useEffect(() => {
    let cancelled = false;

    completeSignIn()
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.ok) {
          setLocation(ssoDestination(outcome.user, outcome.next), { replace: true });
        } else {
          setError(outcome.code);
        }
      })
      .catch(() => {
        if (!cancelled) setError("verify_failed");
      });

    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  return (
    <StatusPage>
      {error ? (
        <StatusCard
          titleAs="h1"
          tone="danger"
          icon={AlertCircle}
          title={t("sso.callback.errorTitle")}
          description={t(ERROR_KEYS[error])}
          focusKey={error}
          data-testid="card-sso-error"
          actions={
            <>
              <a href={ssoLoginHref()} className={buttonVariants({ variant: "primary" })} data-testid="link-sso-retry">
                {t("sso.callback.tryAgain")}
              </a>
              <a href={ROUTES.login} className={buttonVariants({ variant: "outline" })} data-testid="link-sso-use-password">
                {t("sso.callback.usePassword")}
              </a>
            </>
          }
        />
      ) : (
        <StatusCard
          titleAs="h1"
          tone="busy"
          title={t("sso.callback.title")}
          description={<span role="status">{t("sso.callback.working")}</span>}
          aria-busy="true"
          data-testid="card-sso-working"
        />
      )}
    </StatusPage>
  );
}
