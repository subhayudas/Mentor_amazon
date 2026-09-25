import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, nextIp } from './helpers/vercel.ts';

/**
 * U3 — POST /api/requests (design §3.4, §6.2) with the real handler, a fake service-role
 * client and a mocked Cloudflare siteverify.
 */
type RpcResult = { data?: unknown; error?: { code: string; message: string } | null };
const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>): Promise<RpcResult> => ({
  data: { outcome: 'created', booking_id: 'b1' },
  error: null,
}));
const createAdminClient = vi.fn(() => ({ rpc }));
vi.mock('../api/_lib/supabaseAdmin.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/supabaseAdmin.ts')>();
  return { ...actual, createAdminClient: (...args: unknown[]) => createAdminClient(...(args as [])) };
});

const { default: handler } = await import('../api/requests.ts');

const MENTOR = '738d7465-42c6-5550-be9a-6e7ef35f52bc';
const VALID = { mentorId: MENTOR, name: 'Sara K.', email: 'sara@example.com', goal: 'I would like advice on our seed round.' };
const ENV_NAMES = /SUPABASE|TURNSTILE|SERVICE_ROLE|CAL_WEBHOOK|CRON_SECRET|VITE_/;
const JSON_HEADERS = { 'content-type': 'application/json' };

function send(body: unknown, opts: { headers?: Record<string, string>; ip?: string; method?: string } = {}) {
  return invoke(handler, '/api/requests', {
    method: opts.method ?? 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: opts.headers ?? JSON_HEADERS,
    ip: opts.ip ?? nextIp(),
  });
}

let siteverify: ReturnType<typeof vi.fn>;
beforeEach(() => {
  rpc.mockClear();
  rpc.mockImplementation(async () => ({ data: { outcome: 'created', booking_id: 'b1' }, error: null }));
  createAdminClient.mockClear();
  process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-not-real';
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.VITE_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
  delete process.env.TURNSTILE_DISABLED;
  delete process.env.VERCEL_ENV;
  siteverify =vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: 'mentor-amazon.vercel.app' }), { status: 200 }));
  vi.spyOn(globalThis, 'fetch').mockImplementation(siteverify as unknown as typeof fetch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('request shape', () => {
  it('405 for anything but POST', async () => {
    const res = await invoke(handler, '/api/requests', { method: 'GET' });
    expect(res.statusCode).toBe(405);
  });

  it('415 without application/json', async () => {
    const res = await send(VALID, { headers: { 'content-type': 'text/plain' } });
    expect(res.statusCode).toBe(415);
  });

  it('413 over 16 KiB (declared or streamed)', async () => {
    const declared = await send(VALID, { headers: { ...JSON_HEADERS, 'content-length': String(16 * 1024 + 1) } });
    expect(declared.statusCode).toBe(413);
    const streamed = await send({ ...VALID, goal: 'x'.repeat(17 * 1024) });
    expect(streamed.statusCode).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('400 with the offending fields', async () => {
    const res = await send({ mentorId: 'manav-gupta', name: '', email: 'not-an-email', goal: 'too short' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_request', fields: ['mentorId', 'name', 'email', 'goal'] });
    const badJson = await send('{nope');
    expect(badJson.statusCode).toBe(400);
    expect(badJson.json()).toMatchObject({ error: 'invalid_request' });
    const longName = await send({ ...VALID, name: 'n'.repeat(121) });
    expect(longName.json()).toEqual({ error: 'invalid_request', fields: ['name'] });
    const longGoal = await send({ ...VALID, goal: 'g'.repeat(1001) });
    expect(longGoal.json()).toEqual({ error: 'invalid_request', fields: ['goal'] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an e-mail address over 254 characters is refused before the RPC; 254 is accepted (R1-63)', async () => {
    const domain = '@example.com';
    const tooLong = `${'a'.repeat(255 - domain.length)}${domain}`;
    expect(tooLong).toHaveLength(255);
    const res = await send({ ...VALID, email: tooLong });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_request', fields: ['email'] });
    expect(rpc).not.toHaveBeenCalled();
    const longest = `${'a'.repeat(254 - domain.length)}${domain}`;
    expect((await send({ ...VALID, email: longest })).statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('Turnstile', () => {
  it('with the secret set, a missing token is 403 and Cloudflare is not called', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    const res = await send(VALID);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'captcha_failed' });
    expect(siteverify).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a token Cloudflare rejects is 403', async () => {
    process.env.TURNSTILE_SECRET_KEY = '2x0000000000000000000000000000000AA';
    siteverify.mockImplementation(async () => new Response(JSON.stringify({ success: false }), { status: 200 }));
    const res = await send({ ...VALID, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' });
    expect(res.statusCode).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a siteverify answer without success: true is 403 and nothing reaches the RPC (R1-55)', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    for (const body of [{}, { success: 'true' }, { success: 1 }]) {
      siteverify.mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
      const res = await send({ ...VALID, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' });
      expect(res.statusCode, JSON.stringify(body)).toBe(403);
      expect(res.json()).toEqual({ error: 'captcha_failed' });
    }
    expect(siteverify).toHaveBeenCalledTimes(3);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a verified token reaches the RPC; siteverify gets the client IP', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    const res = await send({ ...VALID, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }, { ip: '198.51.100.7' });
    expect(res.statusCode).toBe(200);
    const form = new URLSearchParams(String((siteverify.mock.calls[0] as [string, RequestInit])[1].body));
    expect(form.get('remoteip')).toBe('198.51.100.7');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('siteverify unreachable is 503 captcha_unavailable (fail closed)', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    siteverify.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    const res = await send({ ...VALID, turnstileToken: 'tok' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'captcha_unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('the hostname allow-list applies', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'other.example';
    const res = await send({ ...VALID, turnstileToken: 'tok' });
    expect(res.statusCode).toBe(403);
  });

  it('site key set but secret missing: 503 unavailable, logged, nothing reaches the DB', async () => {
    process.env.VITE_TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
    const res = await send({ ...VALID, turnstileToken: 'tok' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'unavailable' });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('TURNSTILE_SECRET_KEY missing while the site key is set'));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('neither key set: no check', async () => {
    const res = await send(VALID);
    expect(res.statusCode).toBe(200);
    expect(siteverify).not.toHaveBeenCalled();
  });
});

describe('Turnstile in Production (R1-01: fail closed)', () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = 'production';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('neither key set: anonymous requests are refused with 503 captcha_unavailable, logged, nothing written', async () => {
    const res = await send(VALID);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'captcha_unavailable' });
    expect(res.body).not.toMatch(ENV_NAMES);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('TURNSTILE_SECRET_KEY is not set in Production'));
    expect(siteverify).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('TURNSTILE_DISABLED=1 is the explicit opt-out, and it is logged on every request it lets through', async () => {
    process.env.TURNSTILE_DISABLED = '1';
    const res = await send(VALID);
    expect(res.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('TURNSTILE_DISABLED=1'));
  });

  it('only exactly "1" opts out', async () => {
    for (const value of ['true', 'yes', '0', ' ']) {
      process.env.TURNSTILE_DISABLED = value;
      const res = await send(VALID);
      expect(res.statusCode, `TURNSTILE_DISABLED=${JSON.stringify(value)}`).toBe(503);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('the opt-out never switches off a configured check', async () => {
    process.env.TURNSTILE_DISABLED = '1';
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    const missing = await send(VALID);
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toEqual({ error: 'captcha_failed' });
    const verified = await send({ ...VALID, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' });
    expect(verified.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('with both keys set a verified token goes through as before', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    process.env.VITE_TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
    const res = await send({ ...VALID, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' });
    expect(res.statusCode).toBe(200);
    expect(siteverify).toHaveBeenCalledTimes(1);
  });

  it('Preview and development deployments keep the no-keys behaviour (no check)', async () => {
    for (const env of ['preview', 'development']) {
      process.env.VERCEL_ENV = env;
      const res = await send(VALID);
      expect(res.statusCode, `VERCEL_ENV=${env}`).toBe(200);
    }
    expect(siteverify).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('RPC', () => {
  it('calls create_booking_request with the validated, trimmed values', async () => {
    const res = await send({ ...VALID, mentorId: MENTOR.toUpperCase(), name: '  Sara K.  ', email: ' sara@example.com ', goal: `  ${VALID.goal}  ` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('create_booking_request', {
      p_mentor_id: MENTOR,
      p_email: 'sara@example.com',
      p_name: 'Sara K.',
      p_goal: VALID.goal,
    });
  });

  it('an already pending request looks exactly like a new one', async () => {
    rpc.mockImplementation(async () => ({ data: { outcome: 'already_pending', booking_id: 'b1' }, error: null }));
    const res = await send(VALID);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.body).not.toContain('already_pending');
  });

  it('a request under the mentor\'s own address answers like a normal one (no e-mail oracle)', async () => {
    rpc.mockImplementation(async () => ({
      data: null,
      error: { code: '42501', message: 'not_allowed', details: 'self_request' } as RpcResult['error'],
    }));
    const res = await send(VALID);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain('sara@example.com');
  });

  const mapping: Array<[string, { code: string; message: string }, number, unknown]> = [
    ['42501 not_allowed (not a self request)', { code: '42501', message: 'not_allowed' }, 500, { error: 'server_error' }],
    ['22023 invalid_goal', { code: '22023', message: 'invalid_goal' }, 400, { error: 'invalid_request', fields: ['goal'] }],
    ['22023 invalid_email', { code: '22023', message: 'invalid_email' }, 400, { error: 'invalid_request', fields: ['email'] }],
    ['42501 mentor_unavailable', { code: '42501', message: 'mentor_unavailable' }, 422, { error: 'mentor_unavailable' }],
    ['P0001 rate_limited', { code: 'P0001', message: 'rate_limited' }, 429, { error: 'rate_limited' }],
    ['PGRST202 function missing', { code: 'PGRST202', message: 'Could not find the function' }, 503, { error: 'unavailable' }],
    ['anything else', { code: 'XX000', message: 'SUPABASE_SERVICE_ROLE_KEY exploded for sara@example.com' }, 500, { error: 'server_error' }],
  ];
  for (const [name, error, status, body] of mapping) {
    it(`maps ${name} → ${status}`, async () => {
      rpc.mockImplementation(async () => ({ data: null, error }));
      const res = await send(VALID);
      expect(res.statusCode).toBe(status);
      expect(res.json()).toEqual(body);
      expect(res.body).not.toMatch(ENV_NAMES);
    });
  }

  it('the server error log carries the code only (no PII)', async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { code: 'XX000', message: 'boom for sara@example.com' } }));
    await send(VALID);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain('XX000');
    expect(logged).not.toContain('sara@example.com');
  });

  it('missing Supabase env is 503 with no names in the body', async () => {
    delete process.env.SUPABASE_URL;
    const res = await send(VALID);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'unavailable' });
    expect(res.body).not.toMatch(ENV_NAMES);
  });
});

describe('IP limit', () => {
  it('the 11th request from one IP within 10 minutes is 429 with Retry-After', async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await send(VALID, { ip })).statusCode);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    const limited = await send(VALID, { ip });
    expect(Number(limited.getHeader('retry-after'))).toBeGreaterThan(0);
    expect((await send(VALID, { ip: nextIp() })).statusCode).toBe(200);
  });
});
