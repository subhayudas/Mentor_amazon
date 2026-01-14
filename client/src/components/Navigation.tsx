import { Link, useLocation } from "wouter";
import { LogOut, Menu, ChevronDown, Globe } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { AmazonLogo } from "@/components/AmazonSmile";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

export function Navigation() {
  const { t } = useTranslation();
  const { user, isLoading, logout } = useAuth();
  const [location] = useLocation();
  const [, setLocationPath] = useLocation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [menteeId, setMenteeId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const updateUserInfo = () => {
      const menteeEmail = localStorage.getItem("menteeEmail");
      const mentorEmail = localStorage.getItem("mentorEmail");
      setUserEmail(menteeEmail || mentorEmail || null);
      setMentorId(localStorage.getItem("mentorId"));
      setMenteeId(localStorage.getItem("menteeId"));
    };

    updateUserInfo();
    window.addEventListener("storage", updateUserInfo);
    window.addEventListener("userRegistered", updateUserInfo);
    return () => {
      window.removeEventListener("storage", updateUserInfo);
      window.removeEventListener("userRegistered", updateUserInfo);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    localStorage.clear();
    setMentorId(null);
    setMenteeId(null);
    setUserEmail(null);
    setLocationPath("/");
  };

  const handleLocalLogout = () => {
    localStorage.clear();
    setMentorId(null);
    setMenteeId(null);
    setUserEmail(null);
    setLocationPath("/");
  };

  const isLoggedIn = user || mentorId || menteeId;
  
  // Determine user role from auth context or localStorage
  const isMentor = user?.user_type === 'mentor' || !!mentorId;
  const isMentee = user?.user_type === 'mentee' || !!menteeId;

  // Navigation items
  const coreNavItems = [
    { href: "/", label: t('nav.browseMentors') },
    { href: "/analytics", label: t('nav.analytics') },
  ];

  const guestItems = [
    { href: "/mentee-registration", label: t('nav.joinMentee') },
    { href: "/mentor-onboarding", label: t('nav.becomeMentor') },
  ];

  // Role-specific navigation items
  const userItems = [
    ...(isMentor ? [{ href: "/mentor-portal", label: t('nav.mentorPortal') }] : []),
    ...(isMentee ? [{ href: "/mentee-dashboard", label: t('nav.menteeDashboard') }] : []),
  ];

  return (
    <>
      {/* Clean, Spacious Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 py-4">
        <div
          className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3 rounded-full"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
          }}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <AmazonLogo size="md" />
            <span className="font-bold text-base hidden sm:block" style={{ color: 'var(--ink)' }}>
              MentorConnect
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-2">
            {coreNavItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <button
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${location === item.href
                      ? 'bg-[var(--amazon-squid)] text-white'
                      : 'text-[var(--ink-light)] hover:bg-[var(--cream-dark)] hover:text-[var(--ink)]'
                    }`}
                >
                  {item.label}
                </button>
              </Link>
            ))}

            {!isLoggedIn && guestItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <button
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${location === item.href
                      ? 'bg-[var(--amazon-squid)] text-white'
                      : 'text-[var(--ink-light)] hover:bg-[var(--cream-dark)] hover:text-[var(--ink)]'
                    }`}
                >
                  {item.label}
                </button>
              </Link>
            ))}

            {isLoggedIn && userItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <button
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${location === item.href
                      ? 'bg-[var(--amazon-squid)] text-white'
                      : 'text-[var(--ink-light)] hover:bg-[var(--cream-dark)] hover:text-[var(--ink)]'
                    }`}
                >
                  {item.label}
                </button>
              </Link>
            ))}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            {userEmail && <NotificationBell email={userEmail} />}
            <LanguageToggle />

            {!isLoading && !isLoggedIn && (
              <Link href="/login">
                <button
                  className="px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200"
                  style={{
                    background: 'var(--amazon-orange)',
                    color: 'white'
                  }}
                >
                  {t('auth.login')}
                </button>
              </Link>
            )}

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-[var(--cream-dark)] transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--amazon-orange)] to-[#E68A00] flex items-center justify-center text-white text-sm font-bold">
                      {user.email?.charAt(0).toUpperCase()}
                    </div>
                    <ChevronDown className="w-4 h-4 text-[var(--ink-muted)]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('auth.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {!user && (mentorId || menteeId) && (
              <button
                onClick={handleLocalLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-red-50 text-red-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}

            {/* Mobile menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button className="lg:hidden p-2 rounded-full hover:bg-[var(--cream-dark)] transition-colors">
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80" style={{ background: 'var(--cream)' }}>
                <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
                <div className="flex flex-col gap-2 mt-8">
                  <div className="flex items-center gap-3 mb-6 px-2">
                    <AmazonLogo size="md" />
                    <span className="font-bold text-lg" style={{ color: 'var(--ink)' }}>
                      MentorConnect
                    </span>
                  </div>

                  {[...coreNavItems, ...(isLoggedIn ? userItems : guestItems)].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-white font-medium transition-colors">
                        {item.label}
                      </button>
                    </Link>
                  ))}

                  {isLoggedIn && (
                    <>
                      <div className="border-t my-4" />
                      <button
                        className="w-full text-left px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 font-medium transition-colors"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          user ? handleLogout() : handleLocalLogout();
                        }}
                      >
                        {t('auth.logout')}
                      </button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {/* Spacer */}
      <div className="h-24" />
    </>
  );
}
