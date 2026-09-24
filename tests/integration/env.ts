import { describe } from 'vitest';

// The database stores UTC wall-clock `timestamp` columns and postgres.js serialises those values
// through JavaScript Dates, so the suites always run in UTC whatever the machine's zone is.
process.env.TZ = 'UTC';

/**
 * Integration suites run against a LOCAL Supabase stack when SUPABASE_TEST_URL is set and
 * report "skipped" otherwise (so `npm run test:integration` exits 0 on a machine without it).
 *   SUPABASE_TEST_URL               API, e.g. http://127.0.0.1:54321
 *   SUPABASE_TEST_ANON_KEY          (falls back to VITE_SUPABASE_ANON_KEY)
 *   SUPABASE_TEST_SERVICE_ROLE_KEY  (falls back to SUPABASE_SERVICE_ROLE_KEY)
 *   SUPABASE_TEST_DB_URL            default postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *   SUPABASE_TEST_CAPTCHA=on        the stack runs with Turnstile captcha (enables I17)
 *   SUPABASE_TEST_OFFLINE=1         no internet: skips the suites that call Cloudflare (I12)
 * scripts/db/test-integration.sh sets all of this from scripts/e2e/env.sh.
 */
export const TEST_URL = process.env.SUPABASE_TEST_URL ?? '';
export const TEST_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
export const TEST_SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const TEST_DB_URL = process.env.SUPABASE_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const CAPTCHA_ON = process.env.SUPABASE_TEST_CAPTCHA === 'on';
export const OFFLINE = process.env.SUPABASE_TEST_OFFLINE === '1';

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

if (TEST_URL && (!isLocal(TEST_URL) || !isLocal(TEST_DB_URL))) {
  throw new Error('Integration suites only run against a local Supabase stack (127.0.0.1 / localhost).');
}
if (TEST_URL && (!TEST_ANON_KEY || !TEST_SERVICE_KEY)) {
  throw new Error('SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_ROLE_KEY are required with SUPABASE_TEST_URL.');
}

export const describeDb = TEST_URL ? describe : describe.skip;
export const describeOnline = TEST_URL && !OFFLINE ? describe : describe.skip;
export const describeCaptcha = TEST_URL && CAPTCHA_ON ? describe : describe.skip;
