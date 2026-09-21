import { createClient } from '@supabase/supabase-js';

import { ENV_FORCES_LOCAL } from '@/lib/demo';

/**
 * Thrown at startup when a required Supabase environment variable is absent.
 * There are deliberately no fallback values: the previous hardcoded project
 * no longer exists, and silently connecting to a baked-in project is exactly
 * the failure mode this guards against.
 */
export class MissingSupabaseEnvError extends Error {
  constructor(variable: string) {
    super(
      `Missing required environment variable: ${variable}. ` +
      'Set it in client/.env for local development, or in the Vercel project ' +
      'environment variables (Production AND Preview) for deployments.'
    );
    this.name = 'MissingSupabaseEnvError';
  }
}

// No project configured (lib/demo.ts): the app must still boot — every data
// path is served from the browser store and nothing here is called — so the
// client points at an inert placeholder instead of throwing at import time
// and blanking the whole site. (A configured-but-dead project is detected at
// boot by resolveBackend() and also runs in local mode; the client below is
// simply never used then.)
const supabaseUrl = ENV_FORCES_LOCAL ? 'https://example.supabase.co' : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = ENV_FORCES_LOCAL ? 'local-placeholder' : import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new MissingSupabaseEnvError('VITE_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new MissingSupabaseEnvError('VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
