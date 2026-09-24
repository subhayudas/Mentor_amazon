import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calEvent, calHeaders, pingEvent } from './helpers/cal.ts';
import { CalFakeDb } from './helpers/calFakeDb.ts';
import { invoke, nextIp } from './helpers/vercel.ts';

/**
 * U1 — POST /api/webhooks/cal with the real handler and a fake service-role client
 * (design §6.2). createAdminClient is spied on so the cheap rejections can prove they never
 * reached the database.
 */
let db = new CalFakeDb();
const createAdminClient = vi.fn(() => db);
vi.mock('../api/_lib/supabaseAdmin.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/supabaseAdmin.ts')>();
  return { ...actual, createAdminClient: (...args: unknown[]) => createAdminClient(...(args as [])) };
});

const { default: handler } = await import('../api/webhooks/cal.ts');
const { readEnv } = await import('../api/_lib/env.ts');

const MENTOR = '3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b';
const SECRET = 'a'.repeat(64);
const GLOBAL_SECRET = 'global-secret-at-least-16-chars';
const ENV_NAMES = /SUPABASE|CAL_WEBHOOK|SERVICE_ROLE|TURNSTILE|CRON_SECRET/;

function post(path: string, body: string, headers: Record<string, string>, ip = nextIp()) {
  return invoke(handler, path, { method: 'POST', body, headers, ip });
}

function created(): string {
  return JSON.stringify(calEvent('BOOKING_CREATED', { uid: 'calUid123', attendees: ['mentee@example.com'] }));
}

beforeEach(() => {
  db = new CalFakeDb();
  db.webhooks.set(MENTOR, { secret: SECRET, previous_secret: null, previous_valid_until: null });
  createAdminClient.mockClear();
  process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-not-real';
  delete process.env.CAL_WEBHOOK_SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('request shape', () => {
  it('405 for anything but POST', async () => {
    const res = await invoke(handler, `/api/webhooks/cal?mentor=${MENTOR}`, { method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('allow')).toBe('POST');
  });

  it('413 when content-length or the streamed body exceeds 256 KiB', async () => {
    const big = 'x'.repeat(256 * 1024 + 1);
    const declared = await post(`/api/webhooks/cal?mentor=${MENTOR}`, '{}', { ...calHeaders('{}', SECRET), 'content-length': String(big.length) });
    expect(declared.statusCode).toBe(413);
    const streamed = await post(`/api/webhooks/cal?mentor=${MENTOR}`, big, calHeaders(big, SECRET));
    expect(streamed.statusCode).toBe(413);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe('401 without touching the database', () => {
  const body = created();
  const cases: Array<[string, string, Record<string, string>]> = [
    ['missing signature header', `/api/webhooks/cal?mentor=${MENTOR}`, { 'content-type': 'application/json' }],
    ['non-hex signature', `/api/webhooks/cal?mentor=${MENTOR}`, { 'x-cal-signature-256': 'z'.repeat(64) }],
    ['wrong-length signature', `/api/webhooks/cal?mentor=${MENTOR}`, { 'x-cal-signature-256': 'ab'.repeat(20) }],
    ['no-secret-provided', `/api/webhooks/cal?mentor=${MENTOR}`, { 'x-cal-signature-256': 'no-secret-provided' }],
    ['malformed ?mentor=', '/api/webhooks/cal?mentor=not-a-uuid', calHeaders(body, SECRET)],
  ];
  for (const [name, path, headers] of cases) {
    it(name, async () => {
      const res = await post(path, body, headers);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'invalid_signature' });
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(db.rpcCalls).toEqual([]);
    });
  }
});

describe('signature verification', () => {
  it('401 for a wrong secret and for an unknown mentor, with no RPC', async () => {
    const body = created();
    const wrong = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, 'b'.repeat(64)));
    expect(wrong.statusCode).toBe(401);
    const unknown = await post('/api/webhooks/cal?mentor=00000000-0000-4000-8000-000000000000', body, calHeaders(body, SECRET));
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
    expect(db.rpcCalls).toEqual([]);
  });

  it('accepts the signature with or without the sha256= prefix and in upper case', async () => {
    const body = created();
    const sig = calHeaders(body, SECRET)['x-cal-signature-256'];
    for (const header of [sig, `sha256=${sig}`, sig.toUpperCase()]) {
      const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, { 'content-type': 'application/json', 'x-cal-signature-256': header });
      expect(res.statusCode).toBe(200);
    }
  });

  it('accepts the previous secret before previous_valid_until and rejects it after', async () => {
    const body = created();
    const old = 'c'.repeat(64);
    db.webhooks.set(MENTOR, { secret: SECRET, previous_secret: old, previous_valid_until: new Date(Date.now() + 60_000).toISOString() });
    expect((await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, old))).statusCode).toBe(200);
    db.webhooks.set(MENTOR, { secret: SECRET, previous_secret: old, previous_valid_until: new Date(Date.now() - 1000).toISOString() });
    expect((await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, old))).statusCode).toBe(401);
  });

  it('without ?mentor= and without CAL_WEBHOOK_SECRET every delivery is 401', async () => {
    const body = created();
    const res = await post('/api/webhooks/cal', body, calHeaders(body, ''));
    expect(res.statusCode).toBe(401);
    const signedAnyway = await post('/api/webhooks/cal', body, calHeaders(body, 'anything-at-all-16'));
    expect(signedAnyway.statusCode).toBe(401);
  });

  it('the global path verifies CAL_WEBHOOK_SECRET when it is set', async () => {
    process.env.CAL_WEBHOOK_SECRET = GLOBAL_SECRET;
    const body = created();
    const res = await post('/api/webhooks/cal', body, calHeaders(body, GLOBAL_SECRET));
    expect(res.statusCode).toBe(200);
    expect(db.rpcCalls[0]).toMatchObject({ name: 'cal_apply_event', args: { p_mentor_id: null } });
    expect(String(db.rpcCalls[0].args.p_delivery_id)).toMatch(/^global:BOOKING_CREATED:calUid123:/);
  });

  it('a set but short CAL_WEBHOOK_SECRET is invalid: the global path answers 401', async () => {
    process.env.CAL_WEBHOOK_SECRET = 'short';
    const body = created();
    const res = await post('/api/webhooks/cal', body, calHeaders(body, 'short'));
    expect(res.statusCode).toBe(401);
  });

  it('a failed secret lookup is a server error, never a 401', async () => {
    db.lookupError = { code: '08006', message: 'connection failure' };
    const body = created();
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatch(ENV_NAMES);
  });
});

describe('deliveries', () => {
  it('PING is recorded with cal_record_delivery(ping)', async () => {
    const body = JSON.stringify(pingEvent());
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, outcome: 'ping' });
    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0]).toMatchObject({ name: 'cal_record_delivery', args: { p_mentor_id: MENTOR, p_trigger: 'PING', p_outcome: 'ping' } });
    expect(String(db.rpcCalls[0].args.p_payload_sha256)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a payload without triggerEvent is recorded as unrecognised_payload (200)', async () => {
    const body = JSON.stringify({ payload: { uid: 'x' } });
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(200);
    expect(db.rpcCalls[0].args.p_outcome).toBe('unrecognised_payload');
  });

  it('an unsupported trigger is recorded as ignored (200)', async () => {
    const body = JSON.stringify(calEvent('MEETING_ENDED', { uid: 'u1' }));
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(200);
    expect(db.rpcCalls[0]).toMatchObject({ name: 'cal_record_delivery', args: { p_outcome: 'ignored', p_trigger: 'MEETING_ENDED' } });
  });

  it('a booking event without a uid is recorded as invalid_payload (200)', async () => {
    const event = calEvent('BOOKING_CREATED', { uid: 'u1' }) as { payload: Record<string, unknown> };
    delete event.payload.uid;
    const body = JSON.stringify(event);
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(200);
    expect(db.rpcCalls[0].args.p_outcome).toBe('invalid_payload');
  });

  it('invalid JSON is 400 after a valid signature', async () => {
    const body = '{not json';
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_json' });
  });

  it('a booking event goes to cal_apply_event with normalised arguments', async () => {
    const body = JSON.stringify(
      calEvent('BOOKING_RESCHEDULED', {
        uid: 'newUid456',
        rescheduleUid: 'oldUid123',
        start: '2026-10-01T14:00:00+04:00',
        end: '2026-10-01T14:30:00+04:00',
        attendees: ['Mentee@Example.com', 'guest@example.com'],
        responsesEmail: { value: 'mentee@example.com' },
        organizerUsername: 'Jane.Doe',
        mcBooking: 'D2A6C1B0-1111-4222-8333-944455556666',
      }),
    );
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, outcome: 'confirmed' });
    expect(db.rpcCalls[0].name).toBe('cal_apply_event');
    expect(db.rpcCalls[0].args).toMatchObject({
      p_mentor_id: MENTOR,
      p_trigger: 'BOOKING_RESCHEDULED',
      p_uid: 'newUid456',
      p_reschedule_uid: 'oldUid123',
      p_start: '2026-10-01T10:00:00.000Z',
      p_end: '2026-10-01T10:30:00.000Z',
      p_status: 'ACCEPTED',
      p_attendee_emails: ['mentee@example.com', 'guest@example.com'],
      p_mc_booking: 'd2a6c1b0-1111-4222-8333-944455556666',
      p_organizer_username: 'jane.doe',
    });
    expect(db.rpcCalls[0].args.p_delivery_id).toBe(`${MENTOR}:BOOKING_RESCHEDULED:newUid456:oldUid123:2026-10-01T10:00:00.000Z:ACCEPTED`);
  });

  it('an RPC error is a 500 whose body names no environment variable', async () => {
    db.rpcHandler = () => ({ error: { code: 'XX000', message: 'SUPABASE_SERVICE_ROLE_KEY boom' } });
    const body = created();
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'server_error' });
    expect(res.body).not.toMatch(ENV_NAMES);
  });

  it('missing Supabase env is 503 with no names in the body', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const body = created();
    const res = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET));
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'unavailable' });
    expect(res.body).not.toMatch(ENV_NAMES);
  });
});

describe('fail limiter', () => {
  it('429 after 30 bad signatures from one IP; a valid delivery from a fresh IP is not limited', async () => {
    const ip = nextIp();
    const body = created();
    const bad = calHeaders(body, 'd'.repeat(64));
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, bad, ip)).statusCode);
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
    const good = await post(`/api/webhooks/cal?mentor=${MENTOR}`, body, calHeaders(body, SECRET), nextIp());
    expect(good.statusCode).toBe(200);
  });
});

describe('env', () => {
  it('CAL_WEBHOOK_SECRET is optional, and a set value under 16 characters is rejected', () => {
    delete process.env.CAL_WEBHOOK_SECRET;
    expect(readEnv(['calWebhookSecret'] as const)).toEqual({ ok: true, env: { calWebhookSecret: '' } });
    process.env.CAL_WEBHOOK_SECRET = 'fifteen-chars!!';
    expect(readEnv(['calWebhookSecret'] as const)).toEqual({ ok: false, missing: ['CAL_WEBHOOK_SECRET (invalid)'] });
    process.env.CAL_WEBHOOK_SECRET = GLOBAL_SECRET;
    expect(readEnv(['calWebhookSecret'] as const)).toEqual({ ok: true, env: { calWebhookSecret: GLOBAL_SECRET } });
  });
});
