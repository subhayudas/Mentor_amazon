import { TEST_SERVICE_KEY, TEST_URL } from './env.ts';

/**
 * Point the real api/ handlers at the local stack for an end-to-end suite (I11, I12, I13, I19).
 * Returns a restore function for afterAll.
 */
export function useStackEnv(extra: Record<string, string | undefined> = {}): () => void {
  const saved = new Map<string, string | undefined>();
  const set = (k: string, v: string | undefined) => {
    if (!saved.has(k)) saved.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  set('SUPABASE_URL', TEST_URL);
  set('SUPABASE_SERVICE_ROLE_KEY', TEST_SERVICE_KEY);
  for (const [k, v] of Object.entries(extra)) set(k, v);
  return () => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}
