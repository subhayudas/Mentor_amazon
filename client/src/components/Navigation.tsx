import { Link } from "wouter";
import { BarChart3, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import amazonLogoWhite from "@assets/stock_images/amazon_logo_white_tr_9c83c892.jpg";

export function Navigation() {
  return (
    <nav className="sticky top-0 z-50 border-b bg-secondary backdrop-blur supports-[backdrop-filter]:bg-secondary/95">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" data-testid="link-home">
            <div className="flex items-center gap-4 hover-elevate active-elevate-2 px-3 py-2 rounded-md transition-colors">
              <div className="flex items-center gap-3">
                <img 
                  src={amazonLogoWhite} 
                  alt="Amazon" 
                  className="h-8 w-auto brightness-0 invert"
                  data-testid="img-amazon-logo"
                />
                <div className="h-8 w-px bg-primary-foreground/20"></div>
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-primary-foreground">MentorConnect</span>
                  <span className="text-[10px] text-primary-foreground/60 font-medium -mt-1">Amazon Egypt</span>
                </div>
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/" data-testid="link-browse">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-browse">
                Browse Mentors
              </Button>
            </Link>
            <Link href="/analytics" data-testid="link-analytics">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-analytics">
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </Button>
            </Link>
            <Link href="/mentor-onboarding" data-testid="link-mentor-onboarding">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-mentor-onboarding">
                <Users className="w-4 h-4 mr-2" />
                Become a Mentor
              </Button>
            </Link>
            <Link href="/mentee-registration" data-testid="link-mentee-registration">
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-mentee-registration">
                <UserPlus className="w-4 h-4 mr-2" />
                Join as Mentee
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
