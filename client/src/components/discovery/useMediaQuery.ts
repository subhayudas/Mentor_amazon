import { useEffect, useState } from "react";

/**
 * Reactive `matchMedia` with a synchronous initial value, so the first render
 * already picks the right composition (no desktop flash on a phone). Used to
 * MOUNT one of two compositions (mobile scroller vs desktop grid, rail vs
 * drawer) rather than CSS-hiding both, which would duplicate test ids and
 * tab stops.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tailwind `lg` (1024px): the desktop discovery layout with the sticky rail. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
/** Below Tailwind `md` (768px): the re-authored mobile landing composition (P0-7). */
export const useIsPhone = () => useMediaQuery("(max-width: 767.98px)");
