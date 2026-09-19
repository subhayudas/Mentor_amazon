import { Redirect } from "wouter";

import { ROUTES } from "@/lib/routes";

/**
 * `/mentor-dashboard` was a legacy duplicate of the portal; its one unique
 * control — the "Accept new requests" toggle — now lives in the portal's
 * Profile tab (`switch-availability`). Kept as a redirect so the App.tsx
 * route keeps working until the integrator removes it.
 */
export default function MentorDashboard() {
  return <Redirect to={`${ROUTES.mentorPortal}/profile`} replace />;
}
