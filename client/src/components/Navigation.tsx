import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown, LogOut, Menu } from "lucide-react";

import { AmazonLogo } from "@/components/AmazonSmile";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { LocalNotificationBell } from "@/components/LocalNotificationBell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { syncRoleStorage } from "@/lib/auth";
import { IS_LOCAL } from "@/lib/demo";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Global header (spec §4 as amended by P0-6/C1, P1-23, P1-26, P2-9).
 * Sticky 56px white bar with a hairline; it occupies flow space, so `main`
 * needs no top padding. No orange anywhere in the header.
 *
 * Visitors: Mentors link · language toggle · "Sign in" (ghost) · "Browse
 * mentors" (outline sm, hidden on /mentors where the page is the action).
 * Signed in: Mentors · role item (Mentee dashboard / Mentor portal / Admin) ·
 * Analytics (admins) · language toggle · bell · avatar menu with the role item
 * and Log out. Active item = navy text + 2px navy underline.
 * Mobile (< lg): logo · language toggle · 44px menu button opening a Sheet at
 * the inline-end with 44px rows; "Become a mentor" lives there (and in the
 * footer), never in the desktop bar.
 *
 * Identity comes from the session only (F19). Database mode never reads the
 * legacy localStorage mirrors: signed in means a Supabase session and the
 * bell follows the session email. Local (demo) mode keeps the
 * browser-registered mentee path (`menteeId` / `menteeEmail`) alive.
 */
type NavItem = { href: string; label: string; testId?: string };

const navLinkClass = (active: boolean) =>
  cn(
    "relative inline-flex h-14 items-center rounded-md px-3 text-[15px] font-medium transition-colors duration-fast focus-visible:-outline-offset-4 lg:h-[72px]",
    "after:absolute after:inset-x-3 after:bottom-4 after:h-0.5 after:rounded-full after:content-['']",
    active
      ? "text-[var(--sc-ink)] after:bg-[var(--sc-ink)]"
      : "text-[var(--sc-ink-soft)] hover:text-[var(--sc-ink)] after:bg-transparent",
  );

const sheetLinkClass = (active: boolean) =>
  cn(
    "flex min-h-11 items-center rounded-md px-3 text-base font-medium transition-colors duration-fast",
    active ? "bg-muted text-secondary" : "text-foreground hover:bg-muted",
  );

export function Navigation() {
  const { t } = useTranslation();
  const { user, isLoading, error, logout } = useAuth();
  const [location, setLocationPath] = useLocation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menteeId, setMenteeId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Database mode: stale mirrors from the preview period must not make a
    // visitor look signed in (LegacyLocalDataNotice offers to clear them).
    if (!IS_LOCAL) return;
    const updateUserInfo = () => {
      try {
        const menteeEmail = localStorage.getItem("menteeEmail");
        const mentorEmail = localStorage.getItem("mentorEmail");
        setUserEmail(menteeEmail || mentorEmail || null);
        setMenteeId(localStorage.getItem("menteeId"));
      } catch {
        setUserEmail(null);
        setMenteeId(null);
      }
    };

    updateUserInfo();
    window.addEventListener("storage", updateUserInfo);
    window.addEventListener("userRegistered", updateUserInfo);
    return () => {
      window.removeEventListener("storage", updateUserInfo);
      window.removeEventListener("userRegistered", updateUserInfo);
    };
  }, []);

  // Close the mobile sheet on navigation.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const handleLogout = async () => {
    await logout();
    syncRoleStorage(null);
    setMenteeId(null);
    setUserEmail(null);
    setLocationPath(ROUTES.home);
  };

  const handleLocalLogout = () => {
    syncRoleStorage(null);
    setMenteeId(null);
    setUserEmail(null);
    setLocationPath(ROUTES.home);
  };

  // menteeId is only ever set in local mode (the effect above returns early otherwise).
  const isLoggedIn = Boolean(user || (IS_LOCAL && menteeId));

  // Roles that unlock protected surfaces come from the authenticated session
  // only. A stored mentorId is never enough: mentor ids are world-readable.
  // The mentee mirror keeps the local-mode (demo) mentee path alive.
  const isMentor = user?.user_type === "mentor";
  const isMentee = user?.user_type === "mentee" || (IS_LOCAL && !user && !!menteeId);
  const isAdmin = user?.user_type === "admin";

  const isActive = (href: string) =>
    href === ROUTES.home ? location === href : location === href || location.startsWith(`${href}/`);

  const primaryItems: NavItem[] = [
    { href: ROUTES.mentors, label: t("nav.mentors"), testId: "nav-mentors" },
    // The showcase dashboard (demo, or any signed-in account) and the mentor sign-up live in the bar itself.
    // Database-mode admins work in /admin (the dashboard only redirects there); they get the role items instead.
    ...(IS_LOCAL || (user && user.user_type !== "admin")
      ? [{ href: "/dashboard", label: user ? t(user.user_type === "mentee" ? "showcase.nav.myDashboard" : "showcase.nav.dashboard") : t("showcase.nav.dashboard"), testId: "nav-dashboard" }]
      : []),
    ...(!isLoggedIn
      ? [
          { href: ROUTES.menteeRegistration, label: t("showcase.footer.joinAsMentee"), testId: "nav-join-mentee" },
          { href: ROUTES.mentorOnboarding, label: t("nav.becomeMentor"), testId: "nav-become-mentor" },
        ]
      : []),
  ];

  const roleItems: NavItem[] = IS_LOCAL
    ? []
    : [
        ...(isMentor ? [{ href: ROUTES.mentorPortal, label: t("nav.mentorPortal") }] : []),
        ...(isMentee ? [{ href: ROUTES.menteeDashboard, label: t("nav.menteeDashboard") }] : []),
        ...(isAdmin ? [{ href: ROUTES.admin, label: t("nav.admin") }, { href: ROUTES.analytics, label: t("nav.analytics") }] : []),
      ];

  const desktopItems = [...primaryItems, ...roleItems];
  const showBrowse = !isLoading && !isLoggedIn && !isActive(ROUTES.mentors);
  const bellEmail = IS_LOCAL ? user?.email || userEmail : user?.email ?? null;
  const accountName = user?.name || user?.email || (IS_LOCAL ? userEmail : null) || "";
  const initial = (accountName || "?").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-[var(--sc-hairline)] bg-white lg:h-[72px]">
      <div className="container-page flex h-14 items-center gap-2 lg:h-[72px]">
        <Link href={ROUTES.home} className="me-4 flex shrink-0 items-center gap-2.5 rounded-md" aria-label={t("nav.homeLink")}>
          <AmazonLogo size="md" className="size-7 lg:size-8" />
          <span className="text-[17px] font-bold text-[var(--sc-ink)] lg:text-[19px]">MentorConnect</span>
        </Link>

        <nav aria-label={t("nav.primaryNav")} className="hidden lg:flex lg:flex-1 lg:items-center">
          <ul className="flex items-center">
            {desktopItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={navLinkClass(isActive(item.href))}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  data-testid={item.testId}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ms-auto flex min-w-0 items-center gap-0.5 sm:gap-2">
          <LanguageToggle />

          {bellEmail && !IS_LOCAL && <NotificationBell email={bellEmail} />}
          {IS_LOCAL && user && <LocalNotificationBell />}

          {/* Visitor CTAs never top the access-error card: with a session whose users row failed to load (F-02), the header stays neutral. */}
          {!isLoading && !isLoggedIn && !error && (
            <>
              <Link
                href={ROUTES.login}
                className="hidden h-10 items-center rounded-[10px] px-3 text-[15px] font-medium text-[var(--sc-ink)] hover:bg-[var(--sc-grey)] lg:inline-flex"
                data-testid="link-sign-in"
              >
                {t("nav.signIn")}
              </Link>
              {showBrowse && (
                <Link
                  href={ROUTES.mentors}
                  className="hidden h-11 items-center gap-2 rounded-[12px] bg-[var(--sc-ink)] ps-4 pe-2 text-[15px] font-medium text-white transition-colors duration-fast hover:bg-black lg:inline-flex"
                  data-testid="link-browse-mentors"
                >
                  {t("showcase.hero.cta")}
                  <span className="inline-flex size-7 items-center justify-center rounded-[6px] bg-white text-[var(--sc-ink)]">
                    <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                  </span>
                </Link>
              )}
            </>
          )}

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden gap-1.5 px-2 lg:inline-flex"
                  aria-label={t("nav.accountMenu")}
                  data-testid="button-account-menu"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-8 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
                  >
                    {initial}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      <bdi>{accountName}</bdi>
                    </p>
                    {user.email && user.name && (
                      <p className="truncate text-caption text-muted-foreground" dir="ltr">
                        <bdi>{user.email}</bdi>
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {roleItems.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
                {roleItems.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut aria-hidden="true" />
                  {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {IS_LOCAL && !user && menteeId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLocalLogout}
              className="hidden text-destructive hover:text-destructive lg:inline-flex"
              data-testid="button-local-logout"
            >
              <LogOut aria-hidden="true" />
              {t("auth.logout")}
            </Button>
          )}

          {/* Mobile menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 lg:hidden"
                aria-label={t("nav.openMenu")}
                data-testid="button-mobile-menu"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="end" className="w-80 max-w-[calc(100%-3rem)] gap-0 p-0" closeClassName="top-2.5">
              <div className="flex h-14 items-center gap-2 border-b border-border px-4">
                <AmazonLogo size="sm" />
                <SheetTitle className="text-base font-semibold">{t("nav.menu")}</SheetTitle>
                <SheetDescription className="sr-only">{t("nav.navigation")}</SheetDescription>
              </div>
              <nav aria-label={t("nav.primaryNav")} className="flex flex-col gap-1 p-3">
                {[...primaryItems, ...roleItems].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={sheetLinkClass(isActive(item.href))}
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                ))}
                {!isLoading && !isLoggedIn && (
                  <>
                    <Link href={ROUTES.login} className={sheetLinkClass(isActive(ROUTES.login))}>
                      {t("nav.signIn")}
                    </Link>
                    <Link href={ROUTES.mentorOnboarding} className={sheetLinkClass(isActive(ROUTES.mentorOnboarding))}>
                      {t("nav.becomeMentor")}
                    </Link>
                  </>
                )}
                {isLoggedIn && (
                  <>
                    <div className="my-2 border-t border-border" role="presentation" />
                    <button
                      type="button"
                      className={cn(sheetLinkClass(false), "w-full gap-2 text-destructive hover:text-destructive")}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (user) void handleLogout();
                        else handleLocalLogout();
                      }}
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      {t("auth.logout")}
                    </button>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
