import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { ensureLanguageLoaded } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Language toggle (spec §4, P2-9): one button whose visible text is the OTHER
 * language's own name ("عربي" while in English, "English" while in Arabic),
 * with `lang` set to that language and an accessible name that contains the
 * visible text. While ar.json downloads it is `aria-busy` and a polite
 * `role="status"` announces `common.loadingLanguage`; focus stays on the
 * button and the document title is refreshed by the App route effect.
 *
 * Test ids: `button-language-toggle` on the button; the legacy
 * `menu-item-arabic` / `menu-item-english` ids sit on the label of the
 * language the button switches to, so either id still switches that language.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const target = language === "en" ? "ar" : "en";
  const targetLabel = target === "ar" ? "عربي" : "English";

  const toggle = () => {
    setLanguage(target);
    if (target !== "ar") return;
    setLoading(true);
    void ensureLanguageLoaded("ar").finally(() => {
      if (alive.current) setLoading(false);
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        lang={target}
        aria-label={t("nav.switchLanguage")}
        aria-busy={loading || undefined}
        onClick={toggle}
        className={cn("px-3 font-medium text-foreground", className)}
        data-testid="button-language-toggle"
      >
        <span data-testid={target === "ar" ? "menu-item-arabic" : "menu-item-english"}>{targetLabel}</span>
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {loading ? t("common.loadingLanguage") : ""}
      </span>
    </>
  );
}
