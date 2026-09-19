import { useEffect, useState } from "react";

/**
 * True when the viewport is at least `px` wide. Lets a control render ONE
 * element (a segmented control above the breakpoint, a Select below it)
 * instead of two CSS-toggled twins with the same test id. Defaults to the
 * wide variant before hydration so the first paint matches a desktop capture.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
