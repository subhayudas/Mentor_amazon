import { useQuery } from "@tanstack/react-query";

import type { ActivityEvent, ActivityType } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { localStore, newId, useLocalCollection } from "@/lib/localStore";
import { supabase } from "@/lib/supabase";

/**
 * Activity audit feed: an append-only event per state change. Local mode
 * keeps the events in the browser store; against a live project they live in
 * `activity_events` (supabase_phase2.sql + migration 0002). Booking lifecycle
 * events are written ONLY by the database trigger `bookings_activity_events`
 * (design D9); the client logs just its own settings, profile and favourite
 * writes, after they succeeded, and the insert policy only accepts events
 * about the caller's own profiles. Logging never throws: an audit write
 * failing must not break the action it describes (failures are logged in dev).
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

export interface ActivityFeed {
  events: ActivityEvent[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Events visible to one profile (or every event for admins / the showcase),
 * newest first. Database mode reads `activity_events` only (RLS scopes it to
 * the caller); local mode reads this browser's store. `IS_LOCAL` never changes
 * after boot, so the branch always calls the same hooks.
 */
export function useActivity(profileId: string | null, opts: { all?: boolean; limit?: number } = {}): ActivityFeed {
  return IS_LOCAL ? useLocalActivity(profileId, opts) : useLiveActivity(profileId, opts);
}

function useLiveActivity(profileId: string | null, opts: { all?: boolean; limit?: number }): ActivityFeed {
  const limit = opts.limit ?? 200;
  const live = useQuery<ActivityEvent[]>({
    queryKey: ["activity", profileId, opts.all ? "all" : "own", limit],
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
  return { events: live.data ?? [], isLoading: live.isLoading, isError: live.isError, refetch: () => void live.refetch() };
}

function useLocalActivity(profileId: string | null, opts: { all?: boolean; limit?: number }): ActivityFeed {
  const local = useLocalCollection("events");
  const limit = opts.limit ?? 200;
  const rows = opts.all || !profileId ? local : local.filter((e) => e.visible_to.includes(profileId));
  return { events: rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit), isLoading: false, isError: false, refetch: () => undefined };
}
