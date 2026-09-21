import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { MOCK_BOOKINGS, MOCK_MENTEES, MOCK_MENTORS } from "@/data/mockAnalytics";
import type { Booking, Mentee, Mentor } from "@/lib/database";
import { IS_LOCAL } from "@/lib/demo";
import { useLocalCollection } from "@/lib/localStore";
import { bookingService, menteeService, mentorService } from "@/lib/services";

/**
 * Rows behind the dashboard pages: the seeded demo set in demo mode (or
 * while a real account has fewer than five bookings), else the caller's own
 * rows through the same services the reporting page uses.
 */
export function useDashboardData() {
  const { user } = useAuth();
  const enabled = !IS_LOCAL && Boolean(user);
  /** A registered account sees only its own rows; the showcase (no account) sees the seeded picture. */
  const role = user?.user_type ?? null;
  const profileId = user?.profile_id ?? null;
  const bookingsQuery = useQuery<Booking[]>({ queryKey: ["analytics", "bookings"], queryFn: () => bookingService.getAll(), enabled, staleTime: 60_000 });
  const menteesQuery = useQuery<Mentee[]>({ queryKey: ["analytics", "mentees"], queryFn: () => menteeService.getAll(), enabled, staleTime: 5 * 60_000 });
  const mentorsQuery = useQuery<Mentor[]>({ queryKey: ["analytics", "mentors"], queryFn: () => mentorService.getAll() as Promise<Mentor[]>, enabled, staleTime: 5 * 60_000 });
  const demo = IS_LOCAL || (bookingsQuery.isSuccess && bookingsQuery.data.length < 5);
  // Rows people actually submitted in this browser come first; the seeded set fills the rest of the picture.
  const localBookings = useLocalCollection("bookings");
  const localMentees = useLocalCollection("mentees");
  const localMentors = useLocalCollection("mentors");
  const own = IS_LOCAL && Boolean(profileId);
  const ownBookings = own
    ? role === "admin"
      ? localBookings
      : localBookings.filter((b) => (role === "mentor" ? b.mentor_id === profileId : b.mentee_id === profileId))
    : null;
  return {
    demo: own ? false : demo,
    role,
    profileId,
    isLoading: enabled && (bookingsQuery.isLoading || menteesQuery.isLoading),
    bookings: ownBookings ?? (demo ? [...localBookings, ...MOCK_BOOKINGS] : bookingsQuery.data ?? []),
    mentees: own ? localMentees : demo ? [...localMentees, ...MOCK_MENTEES] : menteesQuery.data ?? [],
    mentors: own ? localMentors : demo ? [...localMentors, ...MOCK_MENTORS] : mentorsQuery.data ?? [],
    localCount: { bookings: localBookings.length, mentees: localMentees.length, mentors: localMentors.length },
  };
}

export const UPCOMING_STATUSES: Booking["status"][] = ["accepted", "confirmed"];
