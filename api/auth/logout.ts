import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from '../_lib/env.js';
import { clearAuthCookies } from '../_lib/cookies.js';
import { logSso, noStore, sendMethodNotAllowed, sendMisconfigured, sendRedirect } from '../_lib/http.js';

/**
 * POST /api/auth/logout
 *
 * Clears the `mc_oidc*` cookies and sends the browser to the login page.
 * POST-only so a cross-site GET (an <img> or link) cannot wipe a visitor's
 * in-flight OIDC state.
 * The Supabase session lives in the SPA (localStorage) and is ended there by
 * `auth.logout()` → `supabase.auth.signOut()`; this endpoint only removes the
 * server-side OIDC round-trip state. Amazon Federate does not advertise an
 * RP-initiated logout endpoint, so no upstream sign-out is attempted.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, ['POST']);
    return;
  }

  const envResult = readEnv(['appOrigin'] as const);
  if (!envResult.ok) {
    sendMisconfigured(res, envResult.missing);
    return;
  }

  clearAuthCookies(res);
  logSso('logout');
  sendRedirect(res, new URL('/login', envResult.env.appOrigin).toString());
}
