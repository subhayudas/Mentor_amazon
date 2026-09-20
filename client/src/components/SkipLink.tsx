import { useTranslation } from "react-i18next";

/**
 * "Skip to content" (spec §11): the first focusable element on the page,
 * visually hidden until focused, targets `main#main` (which has
 * `tabIndex={-1}` and `scroll-mt-14` so the sticky header never covers it).
 */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-secondary focus:px-4 focus:py-2 focus:text-body-sm focus:font-medium focus:text-secondary-foreground"
    >
      {t("a11y.skipToContent")}
    </a>
  );
}
