import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-[var(--ink)] hover:bg-[var(--cream-dark)] rounded-full"
          data-testid="button-language-toggle"
        >
          <Globe className="h-5 w-5" />
          <span className="sr-only">Toggle language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setLanguage('en')}
          className={language === 'en' ? 'bg-accent' : ''}
          data-testid="menu-item-english"
        >
          <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-medium">
            {language === 'en' ? <Check className="w-4 h-4" /> : 'EN'}
          </span>
          English
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage('ar')}
          className={language === 'ar' ? 'bg-accent' : ''}
          data-testid="menu-item-arabic"
        >
          <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-medium">
            {language === 'ar' ? <Check className="w-4 h-4" /> : 'AR'}
          </span>
          العربية
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
