/**
 * Server-only environment for the Amazon Federate SSO functions.
 *
 * Every handler reads exactly the variables it needs through `readEnv` and
 * fails closed with `{ error: 'server_misconfigured', missing: [...] }` when
 * any are absent. Nothing here is ever prefixed VITE_ and nothing here is
 * imported from client/.
 */

export const ENV_KEYS = {
  issuer: 'AMAZON_OIDC_ISSUER',
  clientId: 'AMAZON_OIDC_CLIENT_ID',
  clientSecret: 'AMAZON_OIDC_CLIENT_SECRET',
  redirectUri: 'AMAZON_OIDC_REDIRECT_URI',
  scopes: 'AMAZON_OIDC_SCOPES',
  debug: 'AMAZON_OIDC_DEBUG',
  supabaseUrl: 'SUPABASE_URL',
  supabaseServiceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
  appOrigin: 'APP_ORIGIN',
} as const;

export type EnvKey = keyof typeof ENV_KEYS;

/** Variables that have a safe default and never count as "missing". */
const OPTIONAL: ReadonlySet<EnvKey> = new Set<EnvKey>(['scopes', 'debug']);

export const DEFAULT_SCOPES = 'openid profile email';

export type EnvResult<K extends EnvKey> =
  | { ok: true; env: Record<K, string> }
  | { ok: false; missing: string[] };

function readRaw(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Read the named variables. Optional keys resolve to their default ('' for
 * debug, the OIDC default scope set for scopes); required keys that are unset
 * or blank are reported in `missing`. Issuer and app origin lose any trailing
 * slash so URL building is predictable.
 */
export function readEnv<K extends EnvKey>(keys: readonly K[]): EnvResult<K> {
  const env = {} as Record<K, string>;
  const missing: string[] = [];

  for (const key of keys) {
    const name = ENV_KEYS[key];
    const raw = readRaw(name);
    if (raw !== undefined) {
      env[key] = key === 'issuer' || key === 'appOrigin' ? raw.replace(/\/+$/, '') : raw;
      continue;
    }
    if (OPTIONAL.has(key)) {
      env[key] = key === 'scopes' ? DEFAULT_SCOPES : '';
      continue;
    }
    missing.push(name);
  }

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, env };
}

/** True only when AMAZON_OIDC_DEBUG is exactly the string 'true'. */
export function isDebugEnabled(): boolean {
  return process.env[ENV_KEYS.debug] === 'true';
}
