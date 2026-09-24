import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { LinkIcon, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusCard, StatusPage } from "@/components/StatusCard";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { auth, syncRoleStorage } from "@/lib/auth";
import { IS_LOCAL } from "@/lib/demo";
import { queryClient } from "@/lib/queryClient";
import { ROUTES, confirmDestination, sameOriginPath } from "@/lib/routes";
import { INITIAL_AUTH_HASH, supabase } from "@/lib/supabase";

/** How long the confirmation link may take to become a session. */
const SESSION_WAIT_MS = 8000;

type State = "checking" | "expired" | "error";

/**
 * `/auth/confirm` — where the sign-up confirmation email lands (F32).
 * Supabase verifies the link and redirects here with the session in the URL
 * fragment (consumed by supabase-js) or an error (`otp_expired` for a used or
 * expired link). The page waits up to 8 s for the session, reads the account,
 * then routes: the `next` it was sent with, else mentee registration (no
 * mentees row yet), else the mentee dashboard. A failed link, or no session,
 * shows "link expired or already used" with a form to send a new one.
 */
export default function AuthConfirm() {
  if (IS_LOCAL) return <Redirect to={ROUTES.login} replace />;
  return <AuthConfirmPage />;
}

function AuthConfirmPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const next = sameOriginPath(new URLSearchParams(search).get("next"), "");
  const [state, setState] = useState<State>(() => (INITIAL_AUTH_HASH.errorCode ? "expired" : "checking"));
  const [attempt, setAttempt] = useState(0);
  const finishing = useRef(false);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const user = await auth.getCurrentUser();
      if (!user) {
        finishing.current = false;
        setState("expired");
        return;
      }
      // Session exists: the legacy mirrors may be written now (F50).
      syncRoleStorage(user);
      try {
        localStorage.setItem("user", JSON.stringify(user));
      } catch {
        /* storage blocked: nothing depends on the mirror */
      }
      window.dispatchEvent(new CustomEvent("userRegistered"));
      queryClient.clear();
      setLocation(confirmDestination({ role: user.user_type, hasProfile: Boolean(user.profile_id), next }), { replace: true });
    } catch {
      finishing.current = false;
      setState("error");
    }
  }, [next, setLocation]);

  useEffect(() => {
    if (INITIAL_AUTH_HASH.errorCode || state !== "checking") return;
    let cancelled = false;
    // Supabase holds its auth lock while it runs this callback: continue on the next tick.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !cancelled) window.setTimeout(() => void finish(), 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !cancelled) void finish();
    });
    const giveUp = window.setTimeout(() => {
      if (!cancelled && !finishing.current) setState("expired");
    }, SESSION_WAIT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
      subscription.unsubscribe();
    };
  }, [finish, state, attempt]);

  if (state === "error") {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="danger"
          icon={TriangleAlert}
          title={t("guard.errorTitle")}
          description={t("guard.errorBody")}
          data-testid="card-confirm-error"
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                setState("checking");
                setAttempt((n) => n + 1);
              }}
              data-testid="button-confirm-retry"
            >
              {t("common.tryAgain")}
            </Button>
          }
        />
      </StatusPage>
    );
  }

  if (state === "expired") {
    return (
      <StatusPage>
        <StatusCard
          titleAs="h1"
          tone="danger"
          icon={LinkIcon}
          title={t("auth.confirm.expiredTitle")}
          description={t("auth.confirm.expiredBody")}
          data-testid="card-confirm-expired"
          actions={
            <Button asChild variant="ghost" data-testid="link-confirm-sign-in">
              <Link href={next ? `${ROUTES.login}?next=${encodeURIComponent(next)}` : ROUTES.login}>{t("auth.confirm.alreadyConfirmed")}</Link>
            </Button>
          }
        >
          <ResendConfirmation next={next || null} />
        </StatusCard>
      </StatusPage>
    );
  }

  return (
    <StatusPage>
      <StatusCard
        titleAs="h1"
        tone="busy"
        title={t("auth.confirm.checkingTitle")}
        description={<span role="status">{t("auth.confirm.checkingBody")}</span>}
        aria-busy="true"
        data-testid="card-confirm-checking"
      />
    </StatusPage>
  );
}
