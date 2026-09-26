import { z } from 'zod';

/**
 * Server-only environment for the Vercel functions (Amazon Federate SSO,
 * booking requests, the Cal.com webhook, the reminder cron, Turnstile).
 *
 * Every variable is declared once in `ENV_SCHEMA` with its shape; handlers
 * read exactly the keys they need through `readEnv` and fail closed when a
 * required one is absent or malformed. Secrets are never prefixed VITE_; the
 * one VITE_ name read here is the public Turnstile site key, only to detect a
 * widget that is on while its secret is missing. Nothing here is imported
 * from client/.
 */
const url = z.string().url();
const nonEmpty = z.string().min(1);

export const ENV_SCHEMA = {
  issuer: { name: 'AMAZON_OIDC_ISSUER', schema: url.transform((v) => v.replace(/\/+$/, '')) },
  clientId: { name: 'AMAZON_OIDC_CLIENT_ID', schema: nonEmpty },
  clientSecret: { name: 'AMAZON_OIDC_CLIENT_SECRET', schema: nonEmpty },
  redirectUri: { name: 'AMAZON_OIDC_REDIRECT_URI', schema: url },
  // Federate advertises `scopes_supported: ["openid"]` only; email/name are not scope-gated there.
  scopes: { name: 'AMAZON_OIDC_SCOPES', schema: nonEmpty, default: 'openid' },
  debug: { name: 'AMAZON_OIDC_DEBUG', schema: z.string(), default: '' },
  supabaseUrl: { name: 'SUPABASE_URL', schema: url },
  supabaseServiceRoleKey: { name: 'SUPABASE_SERVICE_ROLE_KEY', schema: nonEmpty },
  appOrigin: { name: 'APP_ORIGIN', schema: url.transform((v) => v.replace(/\/+$/, '')) },
  // Optional global secret for a programme Cal.com Team/Org webhook (no ?mentor=); '' = off.
  // Per-mentor secrets live in the database (mentor_cal_webhooks).
  calWebhookSecret: { name: 'CAL_WEBHOOK_SECRET', schema: z.string().min(16), default: '' },
  cronSecret: { name: 'CRON_SECRET', schema: z.string().min(16) },
  resendApiKey: { name: 'RESEND_API_KEY', schema: nonEmpty, default: '' },
  mailFrom: { name: 'MAIL_FROM', schema: nonEmpty, default: 'MentorConnect <no-reply@mentorconnect.local>' },
  turnstileSecret: { name: 'TURNSTILE_SECRET_KEY', schema: nonEmpty, default: '' },
  // Comma-separated hostnames Turnstile tokens must have been issued on ('' = any).
  turnstileAllowedHostnames: { name: 'TURNSTILE_ALLOWED_HOSTNAMES', schema: z.string(), default: '' },
  // The public site key, read only to detect "widget on, secret missing" (fail closed).
  turnstileSiteKey: { name: 'VITE_TURNSTILE_SITE_KEY', schema: z.string(), default: '' },
  // Exactly '1' lets /api/requests run in Production with no Turnstile keys (logged on every
  // request). Without it, Production refuses anonymous requests until both keys are set.
  turnstileDisabled: { name: 'TURNSTILE_DISABLED', schema: z.string(), default: '' },
  // Set by Vercel: 'production', 'preview' or 'development' ('' elsewhere).
  vercelEnv: { name: 'VERCEL_ENV', schema: z.string(), default: '' },
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
