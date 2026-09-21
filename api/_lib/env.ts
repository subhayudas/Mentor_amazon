import { z } from 'zod';

/**
 * Server-only environment for the Vercel functions (Amazon Federate SSO,
 * the Cal.com webhook, the reminder cron, Turnstile).
 *
 * Every variable is declared once in `ENV_SCHEMA` with its shape; handlers
 * read exactly the keys they need through `readEnv` and fail closed with
 * `{ error: 'server_misconfigured', missing: [...] }` when a required one is
 * absent or malformed. Nothing here is ever prefixed VITE_ and nothing here
 * is imported from client/.
 */
const url = z.string().url();
const nonEmpty = z.string().min(1);

export const ENV_SCHEMA = {
  issuer: { name: 'AMAZON_OIDC_ISSUER', schema: url.transform((v) => v.replace(/\/+$/, '')) },
  clientId: { name: 'AMAZON_OIDC_CLIENT_ID', schema: nonEmpty },
  clientSecret: { name: 'AMAZON_OIDC_CLIENT_SECRET', schema: nonEmpty },
  redirectUri: { name: 'AMAZON_OIDC_REDIRECT_URI', schema: url },
  scopes: { name: 'AMAZON_OIDC_SCOPES', schema: nonEmpty, default: 'openid profile email' },
  debug: { name: 'AMAZON_OIDC_DEBUG', schema: z.string(), default: '' },
  supabaseUrl: { name: 'SUPABASE_URL', schema: url },
  supabaseServiceRoleKey: { name: 'SUPABASE_SERVICE_ROLE_KEY', schema: nonEmpty },
  appOrigin: { name: 'APP_ORIGIN', schema: url.transform((v) => v.replace(/\/+$/, '')) },
  calWebhookSecret: { name: 'CAL_WEBHOOK_SECRET', schema: z.string().min(16) },
  cronSecret: { name: 'CRON_SECRET', schema: z.string().min(16) },
  resendApiKey: { name: 'RESEND_API_KEY', schema: nonEmpty, default: '' },
  mailFrom: { name: 'MAIL_FROM', schema: nonEmpty, default: 'MentorConnect <no-reply@mentorconnect.local>' },
  turnstileSecret: { name: 'TURNSTILE_SECRET_KEY', schema: nonEmpty, default: '' },
  upstashUrl: { name: 'UPSTASH_REDIS_REST_URL', schema: url, default: '' },
  upstashToken: { name: 'UPSTASH_REDIS_REST_TOKEN', schema: nonEmpty, default: '' },
} as const;

export type EnvKey = keyof typeof ENV_SCHEMA;

/** Kept for callers that only need the variable's public name. */
export const ENV_KEYS = Object.fromEntries(Object.entries(ENV_SCHEMA).map(([k, v]) => [k, v.name])) as { [K in EnvKey]: (typeof ENV_SCHEMA)[K]['name'] };

export const DEFAULT_SCOPES = ENV_SCHEMA.scopes.default;

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
 * Read and validate the named variables. Keys with a default never count as
 * missing (an empty default means "feature off"); required keys that are
 * unset, blank or fail their schema are reported in `missing` (malformed
 * ones as `NAME (invalid)`).
 */
export function readEnv<K extends EnvKey>(keys: readonly K[]): EnvResult<K> {
  const env = {} as Record<K, string>;
  const missing: string[] = [];

  for (const key of keys) {
    const spec = ENV_SCHEMA[key] as { name: string; schema: z.ZodType<string>; default?: string };
    const raw = readRaw(spec.name);
    if (raw === undefined) {
      if (spec.default !== undefined) {
        env[key] = spec.default;
        continue;
      }
      missing.push(spec.name);
      continue;
    }
    const parsed = spec.schema.safeParse(raw);
    if (!parsed.success) {
      missing.push(`${spec.name} (invalid)`);
      continue;
    }
    env[key] = parsed.data;
  }

  return missing.length > 0 ? { ok: false, missing } : { ok: true, env };
}

/** Debug output is enabled only when `AMAZON_OIDC_DEBUG` is literally `true`. */
export function isDebugEnabled(): boolean {
  return readRaw(ENV_SCHEMA.debug.name) === 'true';
}
