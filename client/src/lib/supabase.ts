import { createClient } from '@supabase/supabase-js';

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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
