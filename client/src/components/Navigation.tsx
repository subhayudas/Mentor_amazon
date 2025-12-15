import { Link } from "wouter";
import { BarChart3, UserPlus, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import amazonLogo from "@assets/image_1763389700490.png";

export function Navigation() {
  const { t } = useTranslation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [menteeId, setMenteeId] = useState<string | null>(null);

  useEffect(() => {
    const updateUserInfo = () => {
      // Check for saved mentee or mentor email
      const menteeEmail = localStorage.getItem("menteeEmail");
      const mentorEmail = localStorage.getItem("mentorEmail");
      setUserEmail(menteeEmail || mentorEmail || null);
      
      // Check for saved mentorId and menteeId
      setMentorId(localStorage.getItem("mentorId"));
      setMenteeId(localStorage.getItem("menteeId"));
    };

    // Initial check
    updateUserInfo();

    // Listen for storage events (from other tabs)
    window.addEventListener("storage", updateUserInfo);
    
    // Listen for custom event (from same tab - after registration)
    window.addEventListener("userRegistered", updateUserInfo);

    return () => {
      window.removeEventListener("storage", updateUserInfo);
      window.removeEventListener("userRegistered", updateUserInfo);
    };
  }, []);
  
  return (
    <nav className="sticky top-0 z-50 border-b bg-secondary backdrop-blur supports-[backdrop-filter]:bg-secondary/95">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link href="/" data-testid="link-home">
            <div className="flex items-center gap-4 hover-elevate active-elevate-2 px-3 py-2 rounded-md transition-colors">
              <div className="flex items-center gap-3">
                <img 
                  src={amazonLogo} 
                  alt="Amazon" 
                  className="h-8 w-auto"
                  data-testid="img-amazon-logo"
                />
                <div className="h-8 w-px bg-primary-foreground/20"></div>
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-primary-foreground">MentorConnect</span>
                  <span className="text-[10px] text-primary-foreground/60 font-medium -mt-1">Amazon</span>
                </div>
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/" data-testid="link-browse">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hidden md:flex" data-testid="button-browse">
                {t('nav.browseMentors')}
              </Button>
            </Link>
            <Link href="/analytics" data-testid="link-analytics">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-analytics">
                <BarChart3 className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">{t('nav.analytics')}</span>
              </Button>
            </Link>
            <Link href="/mentor-onboarding" data-testid="link-mentor-onboarding">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-mentor-onboarding">
                <Users className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">{t('nav.becomeMentor')}</span>
              </Button>
            </Link>
            <Link href="/mentee-registration" data-testid="link-mentee-registration">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-mentee-registration">
                <UserPlus className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">{t('nav.joinMentee')}</span>
              </Button>
            </Link>
            {(mentorId || menteeId) && (
              <Link 
                href={mentorId ? `/profile/mentor/${mentorId}` : `/profile/mentee/${menteeId}`}
                data-testid="link-my-profile"
              >
                <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-my-profile">
                  <User className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">{t('nav.myProfile')}</span>
                </Button>
              </Link>
            )}
            {userEmail && <NotificationBell email={userEmail} />}
            <LanguageToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
