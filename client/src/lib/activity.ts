import { useQuery } from "@tanstack/react-query";

import type { ActivityEvent, ActivityType } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { localStore, newId, useLocalCollection } from "@/lib/localStore";
import { supabase } from "@/lib/supabase";

/**
 * Activity audit feed: an append-only event per state change. Local mode
 * keeps the events in the browser store; against a live project they go to
 * `activity_events` (see supabase_phase2.sql — insert-only for users, admins
 * read everything). Logging never throws: an audit write failing must not
 * break the action it describes.
 */
export interface LogInput {
  actor_type: ActivityEvent["actor_type"];
  actor_id?: string;
  actor_name?: string;
  type: ActivityType;
  subject_type?: ActivityEvent["subject_type"];
  subject_id?: string;
  visible_to?: string[];
  summary: string;
  meta?: Record<string, unknown>;
}

export function logActivity(input: LogInput): ActivityEvent {
  const event: ActivityEvent = {
    id: newId("event"),
    created_at: new Date().toISOString(),
    visible_to: Array.from(new Set([...(input.visible_to ?? []), ...(input.actor_id ? [input.actor_id] : [])])),
    ...input,
  };
  if (IS_LOCAL) {
    localStore.add("events", event);
    return event;
  }
  void supabase
    .from("activity_events")
    .insert({
      actor_type: event.actor_type,
      actor_id: event.actor_id ?? null,
      actor_name: event.actor_name ?? null,
      type: event.type,
      subject_type: event.subject_type ?? null,
      subject_id: event.subject_id ?? null,
      visible_to: event.visible_to,
      summary: event.summary,
      meta: event.meta ?? {},
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn("[activity] insert failed", error.message);
    });
  return event;
}

/** Events visible to one profile (or every event for admins / the showcase), newest first. */
export function useActivity(profileId: string | null, opts: { all?: boolean; limit?: number } = {}) {
  const local = useLocalCollection("events");
  const limit = opts.limit ?? 200;
  const live = useQuery<ActivityEvent[]>({
    queryKey: ["activity", profileId, opts.all ? "all" : "own", limit],
    enabled: !IS_LOCAL,
    staleTime: 15_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      let q = supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(limit);
      if (!opts.all && profileId) q = q.contains("visible_to", [profileId]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActivityEvent[];
    },
  });
  if (IS_LOCAL) {
    const rows = opts.all || !profileId ? local : local.filter((e) => e.visible_to.includes(profileId));
    return { events: rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit), isLoading: false, isError: false };
  }
  return { events: live.data ?? [], isLoading: live.isLoading, isError: live.isError };
}
