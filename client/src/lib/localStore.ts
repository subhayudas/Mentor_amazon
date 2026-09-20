import { useSyncExternalStore } from "react";

import type { Booking, Mentee, Mentor } from "@/lib/database";

/**
 * Browser-side persistence used while no Supabase project is configured
 * (`IS_LOCAL`). Rows are the same shapes the database uses, kept in
 * localStorage under one key per collection, so every surface that reads
 * them (directory, profile, dashboard) reflects a submission immediately
 * and survives reloads. `useLocalCollection` subscribes React to changes,
 * including from other tabs.
 */
type Collections = { mentors: Mentor[]; mentees: Mentee[]; bookings: Booking[] };
type Name = keyof Collections;

const PREFIX = "mentorconnect.local.";
const listeners = new Set<() => void>();
const cache = new Map<Name, unknown[]>();

function read<K extends Name>(name: K): Collections[K] {
  if (cache.has(name)) return cache.get(name) as Collections[K];
  try {
    const raw = localStorage.getItem(PREFIX + name);
    const rows = raw ? (JSON.parse(raw) as Collections[K]) : ([] as unknown as Collections[K]);
    cache.set(name, rows);
    return rows;
  } catch {
    return [] as unknown as Collections[K];
  }
}

function write<K extends Name>(name: K, rows: Collections[K]) {
  cache.set(name, rows);
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(rows));
  } catch {
    /* storage unavailable (private mode): rows still live in memory for this session */
  }
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key?.startsWith(PREFIX)) {
      cache.delete(e.key.slice(PREFIX.length) as Name);
      listeners.forEach((fn) => fn());
    }
  });
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

/** URL-safe slug for a mentor profile ("Manav Gupta" → "manav-gupta-3f2a"). */
export function slugFor(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "mentor"}-${Math.random().toString(36).slice(2, 6)}`;
}

export const localStore = {
  list<K extends Name>(name: K): Collections[K] {
    return read(name);
  },
  add<K extends Name>(name: K, row: Collections[K][number]): Collections[K][number] {
    write(name, [...read(name), row] as Collections[K]);
    return row;
  },
  update<K extends Name>(name: K, id: string, patch: Partial<Collections[K][number]>): Collections[K][number] | null {
    const rows = read(name);
    const index = rows.findIndex((r) => (r as { id: string }).id === id);
    if (index === -1) return null;
    const next = { ...rows[index], ...patch } as Collections[K][number];
    const copy = rows.slice() as Collections[K];
    copy[index] = next;
    write(name, copy);
    return next;
  },
  find<K extends Name>(name: K, id: string): Collections[K][number] | undefined {
    return read(name).find((r) => (r as { id: string }).id === id);
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** React subscription to one collection (stable reference until it changes). */
export function useLocalCollection<K extends Name>(name: K): Collections[K] {
  return useSyncExternalStore(localStore.subscribe, () => read(name), () => read(name));
}

/* ===== Single values (session, per-user settings) ===== */

const VALUE_PREFIX = "mentorconnect.value.";
const valueCache = new Map<string, unknown>();

export function getLocalValue<T>(key: string): T | null {
  if (valueCache.has(key)) return valueCache.get(key) as T;
  try {
    const raw = localStorage.getItem(VALUE_PREFIX + key);
    const value = raw ? (JSON.parse(raw) as T) : null;
    valueCache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export function setLocalValue<T>(key: string, value: T | null) {
  valueCache.set(key, value);
  try {
    if (value === null) localStorage.removeItem(VALUE_PREFIX + key);
    else localStorage.setItem(VALUE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the value still lives in memory for this session */
  }
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key?.startsWith(VALUE_PREFIX)) {
      valueCache.delete(e.key.slice(VALUE_PREFIX.length));
      listeners.forEach((fn) => fn());
    }
  });
}

/** React subscription to one stored value. */
export function useLocalValue<T>(key: string): T | null {
  return useSyncExternalStore(localStore.subscribe, () => getLocalValue<T>(key), () => getLocalValue<T>(key));
}
