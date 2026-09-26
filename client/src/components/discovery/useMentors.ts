import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { mentorService } from "@/lib/services";
import { FEATURED_MENTORS } from "@/data/featuredMentors";
import { IS_LOCAL } from "@/lib/demo";
import { mergeDirectory, type DirectoryMentor } from "@/lib/directory";
import { localStore } from "@/lib/localStore";

/** The one query key both `/` and `/mentors` share (P1-2). */
export const MENTORS_QUERY_KEY = ["mentors"] as const;

/** Above this the client-side design assumption (one page, no pagination) should be revisited. */
const ONE_PAGE_LIMIT = 500;

/**
 * The whole public directory, fetched once and cached 5 minutes; every
 * surface that lists mentors calls this with identical arguments, so
 * navigating never refetches or re-skeletons, and `placeholderData` keeps the
 * previous list on screen during a background refresh.
 *
 * `data` is the merged directory (design D2, `lib/directory.ts`): against the
 * database the `mentors_public` rows plus any curated mentor not seeded yet,
 * so the list is never emptier than the landing's five. When the read fails
 * (after its retry) `data` is the five curated entries, not bookable and
 * flagged `availabilityUnknown` (the grid shows the error notice with them),
 * while `isError` stays true. Demo mode lists this browser's mentors and the
 * five, and never touches the network.
 */
export function useMentors() {
  const query = useQuery<DirectoryMentor[]>({
    queryKey: MENTORS_QUERY_KEY,
    queryFn: async () => {
      if (IS_LOCAL) {
        return mergeDirectory({ isLocal: true, localRows: localStore.list("mentors"), featured: FEATURED_MENTORS });
      }
      const rows = await mentorService.getAll();
      if (import.meta.env.DEV && rows.length > ONE_PAGE_LIMIT) {
        console.warn(`mentors_public returned ${rows.length} rows; discovery assumes a single page (<= ${ONE_PAGE_LIMIT}).`);
      }
      return mergeDirectory({ isLocal: false, dbRows: rows, featured: FEATURED_MENTORS });
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const failedWithoutData = query.data === undefined && query.isError && !IS_LOCAL;
  // Stable identity while the failure lasts, so consumers' memos do not churn.
  const fallback = useMemo(
    () => (failedWithoutData ? mergeDirectory({ isLocal: false, dbRows: undefined, featured: FEATURED_MENTORS, dbFailed: true }) : undefined),
    [failedWithoutData],
  );
  return { ...query, data: query.data ?? fallback };
}
