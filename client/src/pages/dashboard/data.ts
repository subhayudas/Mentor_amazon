import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { MOCK_BOOKINGS, MOCK_MENTEES, MOCK_MENTORS } from "@/data/mockAnalytics";
import type { Booking, Mentee, Mentor } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { useLocalCollection } from "@/lib/localStore";
import { bookingService, menteeService, mentorService } from "@/lib/services";
import { normalizeBookingTimes, selectDashboardRows, type DashboardBooking, type DashboardRole } from "@/pages/dashboard/dataSource";

export type { DashboardBooking } from "@/pages/dashboard/dataSource";

/** Every dashboard query lives under this key; every booking mutation invalidates it (design §3.6). */
export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

export interface DashboardData {
  /** Sample rows are on screen (local showcase only). Always false in database mode. */
  demo: boolean;
  role: DashboardRole | null;
  profileId: string | null;
  /** Database mode: a signed-in mentor/mentee without a profile row yet. */
  needsProfile: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  bookings: DashboardBooking[];
  mentees: Mentee[];
  mentors: Mentor[];
}

/**
 * Rows behind the `/dashboard/*` pages and the impact report (design C4, F01).
 *
 * Database mode: the caller's OWN rows only — `mentorService.getBookings`
 * (mentee embedded) for a mentor, `menteeService.getBookings` (mentor and,
 * once accepted, its Cal link attached) for a mentee — under
 * `['dashboard','bookings',role,profileId]`, with loading, error and empty
 * states. Never mock rows, never browser rows, never a demo badge. Admins load
 * the whole programme only where a page asks for it (`programme: true`:
 * analytics and the impact report); the personal dashboard pages send admins
 * to /admin instead.
 *
 * Local (demo) mode is unchanged: a local account sees its own browser rows,
 * the showcase sees them plus the seeded sample set behind the demo badge.
 *
 * `IS_LOCAL` is decided before the first render and never changes, so the
 * branch below always calls the same hooks for the lifetime of the app.
 */
export function useDashboardData(options: { programme?: boolean } = {}): DashboardData {
  return IS_LOCAL ? useLocalDashboardData() : useDatabaseDashboardData(options.programme === true);
}

function uniqueById<T extends { id: string }>(rows: readonly (T | null | undefined)[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) if (row && !byId.has(row.id)) byId.set(row.id, row);
  return Array.from(byId.values());
}

function useDatabaseDashboardData(programme: boolean): DashboardData {
  const { user } = useAuth();
  const role: DashboardRole | null = user?.user_type ?? null;
  const profileId = user?.profile_id ?? null;
  const adminProgramme = role === "admin" && programme;
  const enabled = Boolean(user) && (adminProgramme || ((role === "mentor" || role === "mentee") && Boolean(profileId)));

  const bookingsQuery = useQuery<DashboardBooking[]>({
    queryKey: [...DASHBOARD_QUERY_KEY, "bookings", role, profileId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const rows: DashboardBooking[] =
        role === "mentor"
          ? await mentorService.getBookings(profileId!)
          : role === "mentee"
            ? await menteeService.getBookings(profileId!)
            : await bookingService.getAll();
      return rows.map(normalizeBookingTimes);
    },
  });
  // Public directory rows name the mentors (programme views, favourites); admins also need every mentee.
  const mentorsQuery = useQuery<Mentor[]>({
    queryKey: [...DASHBOARD_QUERY_KEY, "mentors"],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: () => mentorService.getAll() as Promise<Mentor[]>,
  });
  const menteesQuery = useQuery<Mentee[]>({
    queryKey: [...DASHBOARD_QUERY_KEY, "mentees"],
    enabled: adminProgramme,
    staleTime: 5 * 60_000,
    queryFn: () => menteeService.getAll(),
  });

  const selected = selectDashboardRows<DashboardBooking>({ isLocal: false, role, profileId, dbRows: bookingsQuery.data });
  const rows = selected.rows as DashboardBooking[];
  return {
    demo: false,
    role,
    profileId,
    needsProfile: selected.needsProfile,
    isLoading: enabled && bookingsQuery.isLoading,
    isError: bookingsQuery.isError,
    refetch: () => void bookingsQuery.refetch(),
    bookings: rows,
    mentees: role === "admin" ? menteesQuery.data ?? [] : uniqueById(rows.map((r) => r.mentee)),
    mentors: uniqueById([...rows.map((r) => r.mentor), ...(mentorsQuery.data ?? [])]),
  };
}

function useLocalDashboardData(): DashboardData {
  const { user } = useAuth();
  const role: DashboardRole | null = user?.user_type ?? null;
  const profileId = user?.profile_id ?? null;
  // Rows people actually submitted in this browser come first; the seeded set fills the showcase picture.
  const localBookings = useLocalCollection("bookings");
  const localMentees = useLocalCollection("mentees");
  const localMentors = useLocalCollection("mentors");
  const own = Boolean(profileId);
  const selected = selectDashboardRows<Booking>({ isLocal: true, role, profileId, localRows: localBookings, mockRows: MOCK_BOOKINGS });
  return {
    demo: selected.demo,
    role,
    profileId,
    needsProfile: false,
    isLoading: false,
    isError: false,
    refetch: () => undefined,
    bookings: selected.rows,
    mentees: own ? localMentees : [...localMentees, ...MOCK_MENTEES],
    mentors: own ? localMentors : [...localMentors, ...MOCK_MENTORS],
  };
}

export interface OwnProfile {
  mentor: Mentor | null;
  mentee: Mentee | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Query key prefix of the signed-in person's own profile row (invalidated after a profile save). */
export const OWN_PROFILE_KEY = [...DASHBOARD_QUERY_KEY, "own"] as const;

/**
 * The signed-in person's own mentors / mentees row (design C6/C7): read by
 * the same predicates RLS uses (session email, or the `users.profile_id` link
 * for a mentor whose row carries another address). Local mode reads this
 * browser's store instead.
 */
export function useOwnProfile(): OwnProfile {
  return IS_LOCAL ? useLocalOwnProfile() : useDatabaseOwnProfile();
}

function useDatabaseOwnProfile(): OwnProfile {
  const { user } = useAuth();
  const email = user?.email ?? "";
  const profileId = user?.profile_id;
  const mentorQuery = useQuery<Mentor | null>({
    queryKey: [...OWN_PROFILE_KEY, "mentor", email, profileId ?? null],
    enabled: user?.user_type === "mentor" && Boolean(email),
    queryFn: () => mentorService.getOwn({ email, profileId }),
  });
  const menteeQuery = useQuery<Mentee | null>({
    queryKey: [...OWN_PROFILE_KEY, "mentee", email],
    enabled: user?.user_type === "mentee" && Boolean(email),
    queryFn: () => menteeService.getByEmail(email),
  });
  const active = user?.user_type === "mentor" ? mentorQuery : user?.user_type === "mentee" ? menteeQuery : null;
  return {
    mentor: mentorQuery.data ?? null,
    mentee: menteeQuery.data ?? null,
    isLoading: Boolean(active?.isLoading),
    isError: Boolean(active?.isError),
    refetch: () => void active?.refetch(),
  };
}

function useLocalOwnProfile(): OwnProfile {
  const { user } = useAuth();
  const mentors = useLocalCollection("mentors");
  const mentees = useLocalCollection("mentees");
  const id = user?.profile_id;
  return {
    mentor: user?.user_type === "mentor" ? mentors.find((m) => m.id === id) ?? null : null,
    mentee: user?.user_type === "mentee" ? mentees.find((m) => m.id === id) ?? null : null,
    isLoading: false,
    isError: false,
    refetch: () => undefined,
  };
}

export const UPCOMING_STATUSES: Booking["status"][] = ["accepted", "confirmed"];
