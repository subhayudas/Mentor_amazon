/**
 * The E2E environment (scripts/e2e/env.sh, loaded into process.env by playwright.config.ts).
 * Read lazily so a spec file can be imported without the env being set.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run through playwright.config.ts or source scripts/e2e/env.sh`);
  return value;
}

export const e2eEnv = {
  get supabaseUrl() { return required('VITE_SUPABASE_URL'); },
  get anonKey() { return required('VITE_SUPABASE_ANON_KEY'); },
  get serviceRoleKey() { return required('SUPABASE_SERVICE_ROLE_KEY'); },
  get databaseUrl() { return required('DATABASE_URL'); },
  get mailpitUrl() { return process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'; },
  get cronSecret() { return required('CRON_SECRET'); },
  get port() { return Number(process.env.E2E_PORT ?? 5173); },
  get mockIdpControl() { return `http://127.0.0.1:${process.env.E2E_MOCK_IDP_CONTROL_PORT ?? 54398}`; },
  /** Supabase-js' localStorage key for the session (sb-<first host label>-auth-token). */
  get authStorageKey() { return `sb-${new URL(required('VITE_SUPABASE_URL')).hostname.split('.')[0]}-auth-token`; },
};

/** Cloudflare Turnstile test keys in use (design §6.4); disabled when E2E_TURNSTILE=off. */
export const turnstile = {
  get siteKey() { return process.env.VITE_TURNSTILE_SITE_KEY ?? ''; },
  get secret() { return process.env.TURNSTILE_SECRET_KEY ?? ''; },
  get enabled() { return Boolean(process.env.VITE_TURNSTILE_SITE_KEY); },
  /** Token the test sitekeys hand out; accepted by the 1x… test secret. */
  dummyToken: 'XXXX.DUMMY.TOKEN.XXXX',
  keys: {
    siteAlwaysPasses: '1x00000000000000000000AA',
    siteAlwaysBlocks: '2x00000000000000000000AB',
    secretAlwaysPasses: '1x0000000000000000000000000000000AA',
    secretAlwaysFails: '2x0000000000000000000000000000000AA',
  },
};
