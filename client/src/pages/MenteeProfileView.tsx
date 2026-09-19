import { Redirect } from "wouter";

import { ROUTES } from "@/lib/routes";

/**
 * `/profile/mentee/:id` had no honest audience: mentee rows are readable only
 * by the mentee, the mentors they booked and admins, so a public profile page
 * showed either the caller's own data or nothing. It now sends the person to
 * their own profile tab; the integrator removes the route.
 */
export default function MenteeProfileView() {
  return <Redirect to={`${ROUTES.menteeDashboard}/profile`} replace />;
}
