import { useCallback, useSyncExternalStore } from "react";

/**
 * Reactive `matchMedia` for the one place the profile must render different
 * DOM per breakpoint (the desktop request card vs the mobile action bar), so
 * exactly one `button-request-session` / `booking-section` exists at a time.
 * CSS still owns every purely visual breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Tailwind `lg` — where the profile's two-column layout and request card begin. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
