import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { auth, type AuthUser, type UserRole } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { IS_LOCAL } from "@/lib/demo";
import { bidi, intlLocale } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusCard, StatusPage } from "@/components/StatusCard";

export type GuardStatus = "loading" | "anonymous" | "forbidden" | "error" | "ok";

/** How long to wait for AuthContext to resolve a session that already exists before treating the visitor as anonymous. */
const SESSION_GRACE_MS = 4000;

/** Path + query of the page being guarded, so login can send the person back. */
function currentPath(location: string): string {
  const search = typeof window !== "undefined" ? window.location.search : "";
  return `${location}${search}`;
}

/** Whether a session role satisfies a route's requirement (one role or any of several). */
export function roleAllows(required: UserRole | readonly UserRole[] | undefined, actual: UserRole): boolean {
  if (!required) return true;
  return typeof required === "string" ? required === actual : required.includes(actual);
}

/**
 * Resolves the session against an optional required role (or any of several). Anonymous visitors
 * are redirected to `redirectTo` with `?next=` set to the current page; the
 * wrong role is reported as `forbidden` (never silently redirected, so a
 * mentor landing on /admin understands why); a session whose users-row lookup
 * failed is reported as `error` (F-02) and is never redirected — signing in
 * again would only re-run the same failing read. Identity comes from
 * useAuth() only — never from localStorage.
 */
export function useRequireRole(role?: UserRole | readonly UserRole[], redirectTo = "/login"): { status: GuardStatus; user: AuthUser | null } {
  const { user, isLoading, error } = useAuth();
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
    // If the context never resolves, stop waiting. A failed lookup is not
    // "never resolves": the context reports it as `error` and the guard shows
    // the error state instead.
    const giveUp = error
      ? undefined
      : window.setTimeout(() => {
          if (!cancelled) setSessionPresent(false);
        }, SESSION_GRACE_MS);
    return () => {
      cancelled = true;
      if (giveUp !== undefined) window.clearTimeout(giveUp);
    };
  }, [isLoading, user, error]);

  const status: GuardStatus = IS_LOCAL
    ? "ok"
    : isLoading
    ? "loading"
    : !user
      ? sessionPresent === false
        ? "anonymous"
        : sessionPresent === true && error
          ? "error"
          : "loading"
      : !roleAllows(role, user.user_type)
        ? "forbidden"
        : "ok";

  useEffect(() => {
    if (status === "anonymous") {
      setLocation(`${redirectTo}?next=${encodeURIComponent(currentPath(location))}`, { replace: true });
    }
  }, [status, redirectTo, location, setLocation]);

  return { status, user: user ?? null };
}

/**
 * Shell skeleton shown while the session resolves (F-15): the geometry of the
 * app-shell pages it precedes — PageHeader block (eyebrow, title, one meta
 * line) at the inline-start of `.container-page`, the tab row on its hairline,
 * then two card blocks — so nothing moves when the page mounts. Announced
 * once through the sr-only text; the bars are decorative.
 */
export function GuardSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="container-page pb-16" role="status" aria-busy="true" data-testid="guard-skeleton">
      <span className="sr-only">{t("guard.checkingAccess")}</span>
      <div className="py-8 md:py-10" aria-hidden="true">
        <Skeleton className="mb-2 h-4 w-28" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="flex min-h-11 items-center gap-6 border-b border-border" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-20" />
        ))}
      </div>
      <div className="mt-6 space-y-4" aria-hidden="true">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    </div>
  );
}

/**
 * A session exists but the app could not read the account (F-02): explain,
 * offer a retry that re-runs the lookup, and a sign-out — never a redirect to
 * /login, which would loop the person through the same failing read.
 */
export function AccessErrorCard() {
  const { t } = useTranslation();
  const { retry, logout, isLoading } = useAuth();
  return (
    <StatusPage>
      <StatusCard
        titleAs="h1"
        tone="danger"
        icon={TriangleAlert}
        title={t("guard.errorTitle")}
        description={t("guard.errorBody")}
        data-testid="card-access-error"
        actions={
          <>
            <Button variant="secondary" onClick={retry} loading={isLoading} data-testid="button-access-retry">
              {t("common.tryAgain")}
            </Button>
            <Button variant="outline" onClick={() => logout().catch(() => undefined)} data-testid="button-access-sign-out">
              {t("guard.signOut")}
            </Button>
          </>
        }
      />
    </StatusPage>
  );
}

/** Wrong role for this route: explains instead of redirecting; the heading takes focus on mount (D7). */
export function AccessDeniedCard({ role, user }: { role: UserRole | readonly UserRole[]; user: AuthUser | null }) {
  const { t, i18n } = useTranslation();
  const roles: readonly UserRole[] = typeof role === "string" ? [role] : role;
  const roleLabel = new Intl.ListFormat(intlLocale(i18n.language), { style: "long", type: "disjunction" }).format(roles.map((r) => t(`guard.role.${r}`)));
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
  if (status === "error") return <AccessErrorCard />;
  return <GuardSkeleton />;
}

/** Renders children only for a session with this role (or any of these roles); other roles see an explanation instead. */
export function RequireRole({
  role,
  children,
  fallback,
  redirectTo = "/login",
}: {
  role: UserRole | readonly UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}) {
  const { status, user } = useRequireRole(role, redirectTo);
  if (status === "ok") return <>{children}</>;
  if (status === "forbidden") return <>{fallback ?? <AccessDeniedCard role={role} user={user} />}</>;
  if (status === "error") return <AccessErrorCard />;
  return <GuardSkeleton />;
}
