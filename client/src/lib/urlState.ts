/**
 * Discovery URL state — the React half (P0-5, P0-8, P1-12).
 *
 * Reads the RAW, undecoded search string from `wouter/use-browser-location`.
 * Never use wouter's top-level `useSearch()`: it runs `unescape()` on the
 * string, which turns `%D8%B9%D8%B1%D8%A8%D9%8A` into Latin-1 mojibake and
 * un-escapes `%26` into a second `&` key.
 *
 * Debounce contract (P0-8):
 * - Search text lives in component state and filters the list on every
 *   keystroke. The URL is derived from it: write `q` with `replace` through a
 *   `SEARCH_DEBOUNCE_MS` trailing debounce, cancelled on unmount and flushed
 *   immediately on Enter (`useDebouncedUrlWrite` implements this).
 * - Chip / checkbox / sort changes write `push` synchronously — one entry per
 *   user action (a mobile FilterDrawer "Apply" is one push for all changes).
 * - On popstate / URL change the component re-hydrates from the parsed URL,
 *   never the other way round while the user is typing: compare the incoming
 *   raw search against `lastWrittenRef` and ignore echoes of your own write.
 * - The results-count live region updates after the same debounce, not per
 *   keystroke (P1-29).
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { navigate, useSearch as useRawSearch } from "wouter/use-browser-location";

import {
  type DiscoveryState,
  parseDiscovery,
  serializeDiscovery,
} from "@/lib/discoveryState";

export {
  DISCOVERY_SORTS,
  EMPTY_DISCOVERY,
  activeFilterCount,
  isEmptyDiscovery,
  parseDiscovery,
  serializeDiscovery,
} from "@/lib/discoveryState";
export type { DiscoveryState, DiscoverySort } from "@/lib/discoveryState";

/** Raw `location.search` (with the leading `?`, still percent-encoded). */
export { useRawSearch };

/** Trailing debounce for typing → URL `replace` writes (Safari allows 100 writes / 30 s). */
export const SEARCH_DEBOUNCE_MS = 300;

export type WriteMode = "replace" | "push";

/**
 * `[state, write]` for the discovery page. `state` is parsed from the raw
 * search string; `write(next, mode)` serialises and navigates on the current
 * pathname (no Router base is configured). `write` never debounces itself —
 * see `useDebouncedUrlWrite` for the typing path.
 */
export function useDiscoveryUrlState() {
  const raw = useRawSearch();
  const [path] = useLocation();
  const state = useMemo(() => parseDiscovery(new URLSearchParams(raw)), [raw]);
  const write = useCallback(
    (next: Partial<DiscoveryState>, mode: WriteMode) => {
      const qs = serializeDiscovery(next).toString();
      navigate(`${path}${qs ? `?${qs}` : ""}`, { replace: mode === "replace" });
    },
    [path],
  );
  return [state, write] as const;
}

/**
 * Debounced `replace` writer for the search box. Returns `{ schedule, flush,
 * cancel, lastWrittenRef }`: `schedule(next)` arms a trailing write,
 * `flush()` writes immediately (Enter), `cancel()` drops the pending write
 * (unmount). `lastWrittenRef.current` holds the last query string this hook
 * wrote so the re-hydration effect can ignore its own echo.
 */
export function useDebouncedUrlWrite(
  write: (next: Partial<DiscoveryState>, mode: WriteMode) => void,
  delay: number = SEARCH_DEBOUNCE_MS,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<DiscoveryState> | null>(null);
  const lastWrittenRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current) {
      const next = pending.current;
      pending.current = null;
      lastWrittenRef.current = serializeDiscovery(next).toString();
      write(next, "replace");
    }
  }, [write]);

  const schedule = useCallback(
    (next: Partial<DiscoveryState>) => {
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  useEffect(() => cancel, [cancel]);

  return { schedule, flush, cancel, lastWrittenRef };
}

const LAST_DISCOVERY_KEY = "mc.lastDiscovery";

/** Remember the current discovery search string so back links can restore it (P1-12). */
export function remember(search: string): void {
  try {
    sessionStorage.setItem(LAST_DISCOVERY_KEY, search.startsWith("?") ? search : search ? `?${search}` : "");
  } catch {
    /* storage unavailable: back links fall back to bare /mentors */
  }
}

/** `/mentors` plus the last remembered search string (or bare `/mentors`). */
export function lastDiscoveryHref(): string {
  try {
    const search = sessionStorage.getItem(LAST_DISCOVERY_KEY) ?? "";
    return `/mentors${search}`;
  } catch {
    return "/mentors";
  }
}
