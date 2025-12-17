import { Link, useLocation } from "wouter";
import { BarChart3, UserPlus, Users, User, LogOut, LogIn, LayoutDashboard, Menu, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
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
import amazonLogo from "@assets/image_1763389700490.png";

export function Navigation() {
  const { t } = useTranslation();
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [menteeId, setMenteeId] = useState<string | null>(null);

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
    localStorage.removeItem("mentorId");
    localStorage.removeItem("menteeId");
    localStorage.removeItem("mentorEmail");
    localStorage.removeItem("menteeEmail");
    localStorage.removeItem("menteeName");
    setMentorId(null);
    setMenteeId(null);
    setUserEmail(null);
    setLocation("/");
  };

  const handleLocalLogout = () => {
    localStorage.removeItem("mentorId");
    localStorage.removeItem("menteeId");
    localStorage.removeItem("mentorEmail");
    localStorage.removeItem("menteeEmail");
    localStorage.removeItem("menteeName");
    setMentorId(null);
    setMenteeId(null);
    setUserEmail(null);
    setLocation("/");
  };
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isLoggedIn = user || mentorId || menteeId;

  const NavLinks = ({ mobile = false, onItemClick }: { mobile?: boolean; onItemClick?: () => void }) => {
    const handleClick = () => {
      if (mobile) setMobileMenuOpen(false);
      if (onItemClick) onItemClick();
    };

    return (
      <>
        <Link href="/" data-testid="link-browse" onClick={handleClick}>
          <Button 
            variant="ghost" 
            className={mobile 
              ? "w-full justify-start text-foreground" 
              : "w-full justify-start"
            }
            data-testid="button-browse"
          >
            <Users className="w-4 h-4 mr-2" />
            {t('nav.browseMentors')}
          </Button>
        </Link>
        <Link href="/analytics" data-testid="link-analytics" onClick={handleClick}>
          <Button 
            variant="ghost" 
            className={mobile 
              ? "w-full justify-start text-foreground" 
              : "w-full justify-start"
            }
            data-testid="button-analytics"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {t('nav.analytics')}
          </Button>
        </Link>
        
        {!isLoggedIn && (
          <>
            <Link href="/mentor-onboarding" data-testid="link-mentor-onboarding" onClick={handleClick}>
              <Button 
                variant="ghost" 
                className={mobile 
                  ? "w-full justify-start text-foreground" 
                  : "w-full justify-start"
                }
                data-testid="button-mentor-onboarding"
              >
                <Users className="w-4 h-4 mr-2" />
                {t('nav.becomeMentor')}
              </Button>
            </Link>
            <Link href="/mentee-registration" data-testid="link-mentee-registration" onClick={handleClick}>
              <Button 
                variant="ghost" 
                className={mobile 
                  ? "w-full justify-start text-foreground" 
                  : "w-full justify-start"
                }
                data-testid="button-mentee-registration"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {t('nav.joinMentee')}
              </Button>
            </Link>
          </>
        )}

        {mentorId && (
          <Link href="/mentor-portal" data-testid="link-mentor-portal" onClick={handleClick}>
            <Button 
              variant="ghost" 
              className={mobile 
                ? "w-full justify-start text-foreground" 
                : "w-full justify-start"
              }
              data-testid="button-mentor-portal"
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              {t('nav.mentorPortal')}
            </Button>
          </Link>
        )}
        {menteeId && (
          <Link href="/mentee-dashboard" data-testid="link-mentee-dashboard" onClick={handleClick}>
            <Button 
              variant="ghost" 
              className={mobile 
                ? "w-full justify-start text-foreground" 
                : "w-full justify-start"
              }
              data-testid="button-mentee-dashboard"
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              {t('nav.menteeDashboard')}
            </Button>
          </Link>
        )}
      </>
    );
  };
  
  return (
    <nav className="sticky top-0 z-50 border-b bg-secondary backdrop-blur supports-[backdrop-filter]:bg-secondary/95">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" data-testid="link-home" className="flex-shrink-0">
            <div className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1.5 rounded-md transition-colors">
              <img 
                src={amazonLogo} 
                alt="Amazon" 
                className="h-7 w-auto"
                data-testid="img-amazon-logo"
              />
              <div className="h-6 w-px bg-primary-foreground/30 hidden sm:block"></div>
              <div className="hidden sm:flex flex-col">
                <span className="text-sm font-bold text-primary-foreground leading-tight">MentorConnect</span>
                <span className="text-[9px] text-primary-foreground/60 font-medium leading-tight">Amazon</span>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation - Dropdown Menu */}
          <div className="hidden md:flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                  data-testid="button-nav-menu"
                >
                  <Menu className="w-4 h-4 mr-2" />
                  {t('nav.menu')}
                  <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuLabel>{t('nav.navigation')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="flex flex-col">
                  <NavLinks />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-1">
            {userEmail && <NotificationBell email={userEmail} />}
            <LanguageToggle />
            
            {/* Login button when not logged in */}
            {!isLoading && !user && !mentorId && !menteeId && (
              <Link href="/login" data-testid="link-nav-login">
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                  data-testid="button-nav-login"
                >
                  <LogIn className="w-4 h-4 md:mr-1" />
                  <span className="hidden md:inline">{t('auth.login')}</span>
                </Button>
              </Link>
            )}
            
            {/* User menu for authenticated users */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-primary-foreground hover:bg-primary-foreground/10"
                    data-testid="button-user-menu"
                  >
                    <User className="w-4 h-4 md:mr-1" />
                    <span className="hidden md:inline max-w-[100px] truncate">{user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleLogout}
                    className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                    data-testid="button-logout"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('auth.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Logout button for localStorage-based users (not authenticated) */}
            {!user && (mentorId || menteeId) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleLocalLogout}
                className="text-primary-foreground hover:bg-primary-foreground/10"
                data-testid="button-local-logout"
              >
                <LogOut className="w-4 h-4 md:mr-1" />
                <span className="hidden md:inline">{t('auth.logout')}</span>
              </Button>
            )}

            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="md:hidden text-primary-foreground hover:bg-primary-foreground/10"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="text-lg font-bold mb-4">{t('nav.menu')}</SheetTitle>
                <div className="flex flex-col gap-1 mt-4">
                  <NavLinks mobile />
                  
                  {/* Mobile logout option */}
                  {(user || mentorId || menteeId) && (
                    <>
                      <div className="border-t my-2" />
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-destructive"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          if (user) {
                            handleLogout();
                          } else {
                            handleLocalLogout();
                          }
                        }}
                        data-testid="button-mobile-logout"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        {t('auth.logout')}
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
