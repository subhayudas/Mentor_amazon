import { useCallback, useSyncExternalStore } from "react";

/**
 * Reactive `matchMedia` (F-05: the one copy). The snapshot is read
 * synchronously, so the first render already picks the right composition (no
 * desktop flash on a phone). Use it to MOUNT one of two compositions (mobile
 * scroller vs desktop grid, rail vs drawer, segmented control vs Select) rather
 * than CSS-hiding both, which would duplicate test ids and tab stops. CSS still
 * owns every purely visual breakpoint.
 *
 * `initial` is the value used when `window.matchMedia` is unavailable (tests,
 * server snapshots): controls that must look like their desktop capture on the
 * first paint pass `true`.
 */
export function useMediaQuery(query: string, initial = false): boolean {
  const supported = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query, supported],
  );
  const getSnapshot = useCallback(() => (supported ? window.matchMedia(query).matches : initial), [query, supported, initial]);
  const getServerSnapshot = useCallback(() => initial, [initial]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind `lg` (1024px): the desktop discovery layout with the sticky rail, the profile's two columns. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** Tailwind `lg` (1024px) and up. */
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
/** Below Tailwind `md` (768px): the re-authored mobile landing composition (P0-7). */
export const useIsPhone = () => useMediaQuery("(max-width: 767.98px)");
/** True when the viewport is at least `px` wide; defaults to the wide variant where matchMedia is missing. */
export const useMinWidth = (px: number) => useMediaQuery(`(min-width: ${px}px)`, true);
