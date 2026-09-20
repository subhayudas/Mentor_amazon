import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { PublicMentor } from "@/lib/database";
import { mentorService } from "@/lib/services";
import { FEATURED_MENTORS } from "@/data/featuredMentors";
import { IS_LOCAL } from "@/lib/demo";
import { localStore } from "@/lib/localStore";

/** The one query key both `/` and `/mentors` share (P1-2). */
export const MENTORS_QUERY_KEY = ["mentors"] as const;

/** Above this the client-side design assumption (one page, no pagination) should be revisited. */
const ONE_PAGE_LIMIT = 500;

/**
 * The whole public directory, fetched once and cached 5 minutes. The landing
 * and the discovery page call this with identical arguments, so navigating
 * between them never refetches or re-skeletons; `placeholderData` keeps the
 * previous list on screen during a background refresh.
 */
export function useMentors() {
  return useQuery<PublicMentor[]>({
    queryKey: MENTORS_QUERY_KEY,
    queryFn: async () => {
      // Local mode: the curated set plus every mentor who registered in this browser.
      if (IS_LOCAL) return [...localStore.list("mentors"), ...FEATURED_MENTORS];
      const list = await mentorService.getAll();
      if (import.meta.env.DEV && list.length > ONE_PAGE_LIMIT) {
        console.warn(`mentors_public returned ${list.length} rows; discovery assumes a single page (<= ${ONE_PAGE_LIMIT}).`);
      }
      return list;
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
