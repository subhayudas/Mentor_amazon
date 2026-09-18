import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { auth, syncRoleStorage, type AuthUser } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { consumeSsoFragment, ssoLoginHref, ssoDestination } from "@/lib/ssoClient";

type SsoErrorCode = "missing_token" | "verify_failed" | "no_user";

const ERROR_KEYS: Record<SsoErrorCode, string> = {
  missing_token: "sso.callback.errors.missing_token",
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
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md mx-auto">
        {error ? (
          <Card className="border border-[#D5D9D9] rounded-lg" data-testid="card-sso-error">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2 text-[#C40000]">
                <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                <CardTitle className="text-xl font-bold text-[#0F1111]">
                  {t("sso.callback.errorTitle")}
                </CardTitle>
              </div>
              <CardDescription className="text-[#565959]">{t(ERROR_KEYS[error])}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <a
                href={ssoLoginHref()}
                className="inline-flex w-full items-center justify-center rounded-md bg-[#FF9900] px-6 py-3 text-sm font-semibold text-white hover:bg-[#E88B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900] focus-visible:ring-offset-2"
                data-testid="link-sso-retry"
              >
                {t("sso.callback.tryAgain")}
              </a>
              <a
                href="/login"
                className="text-center text-sm text-[#0066C0] hover:text-[#C45500] hover:underline"
                data-testid="link-sso-use-password"
              >
                {t("sso.callback.usePassword")}
              </a>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-[#D5D9D9] rounded-lg" data-testid="card-sso-working" aria-busy="true">
            <CardHeader className="items-center text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF9900]" aria-hidden="true" />
              <CardTitle className="text-xl font-bold text-[#232F3E]">{t("sso.callback.title")}</CardTitle>
              <CardDescription className="text-[#565959]" role="status">
                {t("sso.callback.working")}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
