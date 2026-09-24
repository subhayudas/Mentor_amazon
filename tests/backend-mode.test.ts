import { describe, expect, it, vi } from 'vitest';
import {
  allowLocalFallback,
  createHealthStore,
  decideBackend,
  envForcesLocal,
  healthUrl,
  mustAwaitProbe,
  probeHealth,
} from '../client/src/lib/backendMode.ts';

const LIVE = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' };

describe('envForcesLocal', () => {
  it('is false for a configured project', () => {
    expect(envForcesLocal(LIVE)).toBe(false);
  });
  it.each([
    ['VITE_LOCAL=1', { ...LIVE, VITE_LOCAL: '1' }],
    ['VITE_DEMO=1', { ...LIVE, VITE_DEMO: '1' }],
    ['missing URL', { VITE_SUPABASE_ANON_KEY: 'k' }],
    ['blank URL', { VITE_SUPABASE_URL: '   ', VITE_SUPABASE_ANON_KEY: 'k' }],
    ['missing key', { VITE_SUPABASE_URL: 'https://abc.supabase.co' }],
    ['placeholder URL', { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }],
  ])('is true for %s', (_label, env) => {
    expect(envForcesLocal(env)).toBe(true);
  });
  it('ignores VITE_LOCAL values other than "1"', () => {
    expect(envForcesLocal({ ...LIVE, VITE_LOCAL: '0' })).toBe(false);
    expect(envForcesLocal({ ...LIVE, VITE_LOCAL: 'true' })).toBe(false);
  });
});

describe('allowLocalFallback', () => {
  it('is on in dev builds', () => {
    expect(allowLocalFallback({ DEV: true })).toBe(true);
  });
  it('is on for a preview flagged with VITE_ALLOW_LOCAL_FALLBACK=1', () => {
    expect(allowLocalFallback({ DEV: false, VITE_ALLOW_LOCAL_FALLBACK: '1' })).toBe(true);
  });
  it('is off in a production build without the flag (and for any other flag value)', () => {
    expect(allowLocalFallback({ DEV: false })).toBe(false);
    expect(allowLocalFallback({ DEV: false, VITE_ALLOW_LOCAL_FALLBACK: 'true' })).toBe(false);
    expect(allowLocalFallback({})).toBe(false);
  });
});

describe('mustAwaitProbe', () => {
  it('waits only when a failed probe could still switch to local mode', () => {
    expect(mustAwaitProbe({ envForcesLocal: false, allowFallback: true })).toBe(true);
    expect(mustAwaitProbe({ envForcesLocal: false, allowFallback: false })).toBe(false);
    expect(mustAwaitProbe({ envForcesLocal: true, allowFallback: true })).toBe(false);
    expect(mustAwaitProbe({ envForcesLocal: true, allowFallback: false })).toBe(false);
  });
});

describe('decideBackend (the decision table)', () => {
  it('env forces local whatever the probe says', () => {
    for (const probe of ['ok', 'failed', 'not_run'] as const) {
      for (const allowFallback of [true, false]) {
        expect(decideBackend({ envForcesLocal: true, allowFallback, probe })).toEqual({
          mode: 'local',
          reason: 'env',
          health: 'unknown',
          probeInBackground: false,
        });
      }
    }
  });

  it('dev/preview: a failed boot probe falls back to local mode (reason unreachable)', () => {
    expect(decideBackend({ envForcesLocal: false, allowFallback: true, probe: 'failed' })).toEqual({
      mode: 'local',
      reason: 'unreachable',
      health: 'unknown',
      probeInBackground: false,
    });
  });

  it('production: a failed probe NEVER switches to local mode; it only marks the backend degraded', () => {
    expect(decideBackend({ envForcesLocal: false, allowFallback: false, probe: 'failed' })).toEqual({
      mode: 'database',
      reason: null,
      health: 'degraded',
      probeInBackground: false,
    });
  });

  it('a healthy probe means database mode, healthy', () => {
    for (const allowFallback of [true, false]) {
      expect(decideBackend({ envForcesLocal: false, allowFallback, probe: 'ok' })).toEqual({
        mode: 'database',
        reason: null,
        health: 'ok',
        probeInBackground: false,
      });
    }
  });

  it('production boot (no probe awaited): database mode, health unknown, probe in the background', () => {
    expect(decideBackend({ envForcesLocal: false, allowFallback: false, probe: 'not_run' })).toEqual({
      mode: 'database',
      reason: null,
      health: 'unknown',
      probeInBackground: true,
    });
  });

  it('never returns local mode for a configured project unless fallback is allowed', () => {
    for (const probe of ['ok', 'failed', 'not_run'] as const) {
      expect(decideBackend({ envForcesLocal: false, allowFallback: false, probe }).mode).toBe('database');
    }
  });
});

describe('healthUrl', () => {
  it('appends the auth health path and tolerates trailing slashes', () => {
    expect(healthUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co/auth/v1/health');
    expect(healthUrl('http://127.0.0.1:54321///')).toBe('http://127.0.0.1:54321/auth/v1/health');
  });
});

describe('probeHealth', () => {
  it('resolves ok on the first 2xx and sends the anon key', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await expect(probeHealth({ url: 'https://abc.supabase.co', anonKey: 'anon', attempts: 2, fetchImpl })).resolves.toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://abc.supabase.co/auth/v1/health');
    expect(init.headers.apikey).toBe('anon');
  });

  it('retries once after a failure, then reports ok', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce({ ok: true });
    await expect(probeHealth({ url: 'https://abc.supabase.co', anonKey: 'k', attempts: 2, fetchImpl })).resolves.toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports failed when every attempt fails (network error, then 5xx)', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('dns')).mockResolvedValueOnce({ ok: false });
    await expect(probeHealth({ url: 'https://abc.supabase.co', anonKey: 'k', attempts: 2, fetchImpl })).resolves.toBe('failed');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('aborts an attempt that exceeds the timeout', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await expect(probeHealth({ url: 'https://abc.supabase.co', anonKey: 'k', attempts: 1, timeoutMs: 20, fetchImpl })).resolves.toBe('failed');
  });
});

describe('createHealthStore', () => {
  it('notifies subscribers on change only, and unsubscribes', () => {
    const store = createHealthStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    expect(store.get()).toBe('unknown');
    store.set('degraded');
    store.set('degraded');
    expect(listener).toHaveBeenCalledTimes(1);
    store.set('ok');
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    store.set('degraded');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get()).toBe('degraded');
  });
});
