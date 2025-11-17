import { Link } from "wouter";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navigation() {
  return (
    <nav className="sticky top-0 z-50 border-b bg-secondary backdrop-blur supports-[backdrop-filter]:bg-secondary/95">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" data-testid="link-home">
            <div className="flex items-center gap-4 hover-elevate active-elevate-2 px-3 py-2 rounded-md transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded bg-primary flex items-center justify-center font-bold text-white text-lg">
                  A
                </div>
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
          </div>
        </div>
      </div>
    </nav>
  );
}
