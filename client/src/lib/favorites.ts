import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Favorite } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { localStore, newId, useLocalCollection } from "@/lib/localStore";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";

/**
 * Favourite mentors for a mentee. Local mode: the browser store. Live: the
 * `mentee_favorites` table (supabase_phase2.sql — a mentee reads and writes
 * only their own rows). One hook returns the set plus a toggle so every
 * surface (card, profile, dashboard) behaves the same.
 */
export function useFavorites(menteeId: string | null, menteeName?: string) {
  const qc = useQueryClient();
  const local = useLocalCollection("favorites");
  const live = useQuery<Favorite[]>({
    queryKey: ["favorites", menteeId],
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

  const toggle = useMutation({
    mutationFn: async ({ mentorId, mentorName }: { mentorId: string; mentorName?: string }) => {
      if (!menteeId) throw new Error("no-mentee");
      const existing = rows.find((f) => f.mentor_id === mentorId);
      if (IS_LOCAL) {
        if (existing) localStore.remove("favorites", existing.id);
        else localStore.add("favorites", { id: newId("fav"), mentee_id: menteeId, mentor_id: mentorId, created_at: new Date().toISOString() });
      } else if (existing) {
        const { error } = await supabase.from("mentee_favorites").delete().eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("mentee_favorites").insert({ mentee_id: menteeId, mentor_id: mentorId });
        if (error) throw error;
      }
      logActivity({
        actor_type: "mentee",
        actor_id: menteeId,
        actor_name: menteeName,
        type: existing ? "favorite_removed" : "favorite_added",
        subject_type: "mentor",
        subject_id: mentorId,
        summary: existing ? `Removed ${mentorName ?? "a mentor"} from favourites` : `Saved ${mentorName ?? "a mentor"} as a favourite`,
      });
      return !existing;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["favorites", menteeId] });
    },
  });

  return { favorites: rows, ids, isFavorite: (mentorId: string) => ids.has(mentorId), toggle, canFavorite: Boolean(menteeId) };
}
