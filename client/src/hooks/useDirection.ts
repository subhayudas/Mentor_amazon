import { useTranslation } from "react-i18next";

export type Direction = "ltr" | "rtl";

const RTL_LANGUAGES = ["ar", "he", "fa", "ur"];

/** Direction for a language tag ("ar", "ar-AE" → rtl). Pure; safe on the server. */
export function directionForLanguage(language: string | undefined): Direction {
  const base = (language ?? "en").split("-")[0];
  return RTL_LANGUAGES.includes(base) ? "rtl" : "ltr";
}

/**
 * Reactive text direction derived from the active i18n language (never from
 * `document`, so it is SSR-safe and re-renders with the language toggle).
 * Radix primitives inherit it through `<DirectionProvider>` in App.tsx; use
 * this hook only where a component needs the value itself (sonner position,
 * sheet side resolution, chart tooltips).
 */
export function useDirection(): { dir: Direction; isRTL: boolean } {
  const { i18n } = useTranslation();
  const dir = directionForLanguage(i18n.language);
  return { dir, isRTL: dir === "rtl" };
}
