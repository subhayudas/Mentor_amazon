import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { Favorite } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { localStore, newId } from "@/lib/localStore";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";

/**
 * Favourite mentors for a mentee. Local mode: the browser store. Live: the
 * `mentee_favorites` table (a mentee reads and writes only their own rows;
 * `mentor_id` must be a real `mentors.id`, which is why the heart only shows
 * on requestable mentors, F15). One hook returns the set plus a toggle so
 * every surface (card, profile, dashboard) behaves the same.
 *
 * The live toggle is optimistic: the heart flips at once, a failed write rolls
 * it back with an error toast, and the list is re-read when it settles. The
 * activity line is written only after the change succeeded.
 */
export type FavoriteToggleInput = {
  mentorId: string;
  mentorName?: string;
  /** Save (true) or remove (false); defaults to the opposite of the current state. */
  add?: boolean;
};
type ToggleVariables = FavoriteToggleInput & { add: boolean };

const NO_FAVOURITES: Favorite[] = [];

/** The mentee's own row name (RLS: a mentee reads their own row), or undefined when it cannot be read. */
async function ownMenteeName(menteeId: string): Promise<string | undefined> {
  try {
    const { data } = await supabase.from("mentees").select("name").eq("id", menteeId).maybeSingle();
    const name = (data as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}
const noSubscription = () => () => undefined;

/** Demo-mode favourites from this browser; against the database it never touches browser storage. */
function useDemoFavorites(): Favorite[] {
  const isLocal = IS_LOCAL;
  const read = () => (isLocal ? localStore.list("favorites") : NO_FAVOURITES);
  return useSyncExternalStore(isLocal ? localStore.subscribe : noSubscription, read, read);
}

export function useFavorites(menteeId: string | null, menteeName?: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const local = useDemoFavorites();
  const queryKey = ["favorites", menteeId] as const;
  const live = useQuery<Favorite[]>({
    queryKey,
    enabled: !IS_LOCAL && Boolean(menteeId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("mentee_favorites").select("*").eq("mentee_id", menteeId!);
      if (error) throw error;
      return (data ?? []) as Favorite[];
    },
  });
  const rows = IS_LOCAL ? local.filter((f) => f.mentee_id === menteeId) : live.data ?? [];
  const ids = new Set(rows.map((f) => f.mentor_id));

  const mutation = useMutation({
    mutationFn: async ({ mentorId, add }: ToggleVariables): Promise<boolean> => {
      if (!menteeId) throw new Error("no-mentee");
      if (IS_LOCAL) {
        const existing = localStore.list("favorites").find((f) => f.mentee_id === menteeId && f.mentor_id === mentorId);
        if (!add && existing) localStore.remove("favorites", existing.id);
        if (add && !existing) localStore.add("favorites", { id: newId("fav"), mentee_id: menteeId, mentor_id: mentorId, created_at: new Date().toISOString() });
        return add;
      }
      if (!add) {
        const { error } = await supabase.from("mentee_favorites").delete().eq("mentee_id", menteeId).eq("mentor_id", mentorId);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase.from("mentee_favorites").insert({ mentee_id: menteeId, mentor_id: mentorId });
      // 23505: already saved (another tab, a double click) — the end state is what was asked for.
      if (error && error.code !== "23505") throw error;
      return true;
    },
    onMutate: async ({ mentorId, add }) => {
      if (IS_LOCAL || !menteeId) return { previous: undefined as Favorite[] | undefined };
      await qc.cancelQueries({ queryKey, exact: true });
      const previous = qc.getQueryData<Favorite[]>(queryKey);
      qc.setQueryData<Favorite[]>(queryKey, (current = []) => {
        const without = current.filter((f) => f.mentor_id !== mentorId);
        return add
          ? [...without, { id: `optimistic-${mentorId}`, mentee_id: menteeId, mentor_id: mentorId, created_at: new Date().toISOString() }]
          : without;
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (!IS_LOCAL && context?.previous !== undefined) qc.setQueryData(queryKey, context.previous);
      toast.error(t("showcase.favorites.error"));
    },
    onSuccess: (added, { mentorId, mentorName }) => {
      // The feed renders favourites by type in the reader's language from `meta.mentor_name`
      // (R1-46); `summary` is only the English fallback. The actor is named like every other
      // line of this mentee: from the mentees row, not the sign-in metadata.
      void (async () => {
        const name = (IS_LOCAL || !menteeId ? undefined : await ownMenteeName(menteeId)) ?? menteeName;
        logActivity({
          actor_type: "mentee",
          actor_id: menteeId ?? undefined,
          actor_name: name,
          type: added ? "favorite_added" : "favorite_removed",
          subject_type: "mentor",
          subject_id: mentorId,
          summary: added ? `Saved ${mentorName ?? "a mentor"} as a favourite` : `Removed ${mentorName ?? "a mentor"} from favourites`,
          meta: { source: "client", ...(mentorName ? { mentor_name: mentorName } : {}), ...(name ? { name } : {}) },
        });
      })();
    },
    onSettled: () => {
      if (!IS_LOCAL) void qc.invalidateQueries({ queryKey, exact: true });
    },
  });

  // The intended action is fixed when the person clicks, before the optimistic flip.
  const withAction = (input: FavoriteToggleInput): ToggleVariables => ({ ...input, add: input.add ?? !ids.has(input.mentorId) });
  const toggle = {
    ...mutation,
    mutate: (input: FavoriteToggleInput) => mutation.mutate(withAction(input)),
    mutateAsync: (input: FavoriteToggleInput) => mutation.mutateAsync(withAction(input)),
  };

  return { favorites: rows, ids, isFavorite: (mentorId: string) => ids.has(mentorId), toggle, canFavorite: Boolean(menteeId) };
}
