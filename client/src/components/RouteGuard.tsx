import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { auth, type AuthUser, type UserRole } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { bidi } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusCard, StatusPage } from "@/components/StatusCard";

export type GuardStatus = "loading" | "anonymous" | "forbidden" | "ok";

/** How long to wait for AuthContext to resolve a session that already exists before treating the visitor as anonymous. */
const SESSION_GRACE_MS = 4000;

/** Path + query of the page being guarded, so login can send the person back. */
function currentPath(location: string): string {
  const search = typeof window !== "undefined" ? window.location.search : "";
  return `${location}${search}`;
}

/**
 * Resolves the session against an optional required role. Anonymous visitors
 * are redirected to `redirectTo` with `?next=` set to the current page; the
 * wrong role is reported as `forbidden` (never silently redirected, so a
 * mentor landing on /admin understands why). Identity comes from useAuth()
 * only — never from localStorage.
 */
export function useRequireRole(role?: UserRole, redirectTo = "/login"): { status: GuardStatus; user: AuthUser | null } {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Right after an SSO sign-in the Supabase session exists before AuthContext
  // has resolved it (it re-reads the users row asynchronously). Treating that
  // window as "anonymous" would bounce a freshly signed-in admin to /login, so
  // when the context has no user we probe the session once and, if one is
  // present, keep showing the skeleton while the context catches up.
  const [sessionPresent, setSessionPresent] = useState<boolean | null>(null);
  useEffect(() => {
    if (isLoading || user) {
      setSessionPresent(null);
      return;
    }
    let cancelled = false;
    auth.getSession().then((session) => {
      if (!cancelled) setSessionPresent(!!session);
    });
    // If the context never resolves (e.g. the users row lookup failed), stop waiting.
    const giveUp = window.setTimeout(() => {
      if (!cancelled) setSessionPresent(false);
    }, SESSION_GRACE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
    };
  }, [isLoading, user]);

  const status: GuardStatus = isLoading
    ? "loading"
    : !user
      ? sessionPresent === false
        ? "anonymous"
        : "loading"
      : role && user.user_type !== role
        ? "forbidden"
        : "ok";

  useEffect(() => {
    if (status === "anonymous") {
      setLocation(`${redirectTo}?next=${encodeURIComponent(currentPath(location))}`, { replace: true });
    }
  }, [status, redirectTo, location, setLocation]);

  return { status, user: user ?? null };
}

export function GuardSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center" role="status" aria-busy="true">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <p className="pt-2 text-center text-caption text-muted-foreground">{t("guard.checkingAccess")}</p>
      </div>
    </div>
  );
}

/** Wrong role for this route: explains instead of redirecting; the heading takes focus on mount (D7). */
export function AccessDeniedCard({ role, user }: { role: UserRole; user: AuthUser | null }) {
  const { t } = useTranslation();
  const roleLabel = t(`guard.role.${role}`);
  const homeFor: Record<UserRole, string> = {
    admin: ROUTES.admin,
    mentor: ROUTES.mentorPortal,
    mentee: ROUTES.menteeDashboard,
  };
  const ownHome = user ? homeFor[user.user_type] : ROUTES.home;

  return (
    <StatusPage>
      <StatusCard
        titleAs="h1"
        tone="danger"
        icon={ShieldAlert}
        title={t("guard.noAccessTitle")}
        description={t("guard.noAccessBody", { role: roleLabel, email: bidi(user?.email ?? "") })}
        data-testid="card-access-denied"
        actions={
          <>
            <Button asChild variant="secondary" data-testid="button-denied-home">
              <Link href={ownHome}>{t("guard.goToYourArea")}</Link>
            </Button>
            <Button asChild variant="outline" data-testid="button-denied-switch">
              <Link href={ROUTES.login}>{t("guard.switchAccount")}</Link>
            </Button>
            <Button asChild variant="ghost" data-testid="button-denied-root">
              <Link href={ROUTES.home}>{t("guard.backHome")}</Link>
            </Button>
          </>
        }
      />
    </StatusPage>
  );
}

/** Renders children only for a signed-in session; anonymous visitors go to `redirectTo?next=…`. */
export function RequireAuth({ children, redirectTo = "/login" }: { children: ReactNode; redirectTo?: string }) {
  const { status } = useRequireRole(undefined, redirectTo);
  if (status === "ok") return <>{children}</>;
  return <GuardSkeleton />;
}

/** Renders children only for a session with exactly this role; other roles see an explanation instead. */
export function RequireRole({
  role,
  children,
  fallback,
  redirectTo = "/login",
}: {
  role: UserRole;
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}) {
  const { status, user } = useRequireRole(role, redirectTo);
  if (status === "ok") return <>{children}</>;
  if (status === "forbidden") return <>{fallback ?? <AccessDeniedCard role={role} user={user} />}</>;
  return <GuardSkeleton />;
}
