import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isDebugEnabled, readEnv } from '../_lib/env.js';
import { deriveCookieKey, parseCookies, verifyValue, DEBUG_COOKIE } from '../_lib/cookies.js';
import { noStore, sendJson, sendMethodNotAllowed, sendMisconfigured } from '../_lib/http.js';

/**
 * GET /api/auth/debug-claims
 *
 * Integ-only helper for confirming with Amazon's identity team which claims
 * arrive in the ID token (in particular that `sub` equals `amazonAlias`).
 * Returns the claims captured by the last callback in this browser, read from
 * the signed `mc_oidc_debug` cookie. Responds 404 unless AMAZON_OIDC_DEBUG is
 * exactly 'true', so the route does not exist in production.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  if (!isDebugEnabled()) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendMethodNotAllowed(res, ['GET', 'HEAD']);
    return;
  }

  const envResult = readEnv(['clientSecret'] as const);
  if (!envResult.ok) {
    sendMisconfigured(res, envResult.missing);
    return;
  }

  const cookies = parseCookies(req);
  const payload = verifyValue<Record<string, unknown>>(deriveCookieKey(envResult.env.clientSecret), cookies[DEBUG_COOKIE]);
  if (!payload) {
    sendJson(res, 200, {
      claims: null,
      hint: 'No captured claims in this browser. Sign in via /api/auth/login/amazon first, then reload this URL within 15 minutes.',
    });
    return;
  }

  sendJson(res, 200, {
    ...payload,
    sub_equals_alias: typeof payload.sub === 'string' && typeof payload.alias === 'string' && payload.sub.toLowerCase() === payload.alias,
  });
}
