import { Redirect } from "wouter";

import { ROUTES } from "@/lib/routes";

/**
 * `/my-bookings` folded into the mentee dashboard (P1-24): the bookings tab
 * carries the same rows, the feedback dialog and the notes/tasks dialog
 * (inside "View request"). Kept as a component so the App.tsx route keeps
 * working until the integrator swaps it for a `<Redirect>`.
 */
export default function MyBookings() {
  return <Redirect to={ROUTES.menteeBookings} replace />;
}
