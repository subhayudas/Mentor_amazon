import { describe, expect, it, vi } from 'vitest';

import {
  BookingRequestError,
  REQUESTS_ENDPOINT,
  isBookingRequestError,
  mapRequestsResponse,
  mapRpcError,
  parseRetryAfter,
  submitAnonymousRequest,
  toRequestField,
} from '../client/src/lib/requests.ts';
import { classifyBookingError, invalidRequestFields, isSendBlocked, rateLimitCooldownMs } from '../client/src/components/booking/bookingErrors.ts';
import { railStatesFor, railStopsFor, resolveRequestState, sentMemoryForViewer, type RequestState } from '../client/src/components/booking/requestState.ts';
import { FEATURED_MENTORS } from '../client/src/data/featuredMentors.ts';
import type { Booking } from '../client/src/lib/database.ts';

const input = {
  mentorId: '738d7465-42c6-5550-be9a-6e7ef35f52bc',
  name: '  Sara K.  ',
  email: ' sara@example.com ',
  goal: '  I want help preparing my seed round narrative.  ',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('submitAnonymousRequest (POST /api/requests)', () => {
  it('posts trimmed JSON (no token when there is none) and resolves "sent" on { ok: true }', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    await expect(submitAnonymousRequest(input, fetchImpl as unknown as typeof fetch)).resolves.toEqual({ outcome: 'sent' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REQUESTS_ENDPOINT);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      mentorId: input.mentorId,
      name: 'Sara K.',
      email: 'sara@example.com',
      goal: 'I want help preparing my seed round narrative.',
    });
  });

  it('sends the Turnstile token when there is one', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    await submitAnonymousRequest({ ...input, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }, fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).turnstileToken).toBe('XXXX.DUMMY.TOKEN.XXXX');
  });

  it('never treats a 200 without { ok: true } as sent (SPA fallback, proxies)', async () => {
    const html = new Response('<!doctype html><title>MentorConnect</title>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    await expect(submitAnonymousRequest(input, (async () => html) as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'generic', status: 200 });
    await expect(submitAnonymousRequest(input, (async () => jsonResponse(200, { ok: false })) as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'generic' });
  });

  it('a thrown fetch is a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(submitAnonymousRequest(input, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ name: 'BookingRequestError', kind: 'network' });
  });

  it.each([
    [400, { error: 'invalid_request', fields: ['email'] }, {}, { kind: 'invalid', fields: ['email'] }],
    [400, { error: 'invalid_request', fields: ['goal', 'name', 'goal'] }, {}, { kind: 'invalid', fields: ['goal', 'name'] }],
    [403, { error: 'captcha_failed' }, {}, { kind: 'captcha', fields: ['captcha'] }],
    [422, { error: 'mentor_unavailable' }, {}, { kind: 'unavailable' }],
    [429, { error: 'rate_limited' }, { 'Retry-After': '540' }, { kind: 'rateLimited', retryAfterSeconds: 540 }],
    [503, { error: 'unavailable' }, {}, { kind: 'service', status: 503 }],
    [503, { error: 'captcha_unavailable' }, {}, { kind: 'service', code: 'captcha_unavailable' }],
    [500, { error: 'server_error' }, {}, { kind: 'service', status: 500 }],
    [502, null, {}, { kind: 'service', status: 502 }],
    [413, { error: 'payload_too_large' }, {}, { kind: 'generic' }],
    [415, { error: 'unsupported_media_type' }, {}, { kind: 'generic' }],
  ])('HTTP %i %j maps to %j', async (status, body, headers, expected) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status, body, headers));
    const error = await submitAnonymousRequest(input, fetchImpl as unknown as typeof fetch).catch((e) => e);
    expect(isBookingRequestError(error)).toBe(true);
    expect(error).toMatchObject(expected);
  });

  it('a non-JSON error body still maps by status', async () => {
    const res = new Response('Too many', { status: 429, headers: { 'Retry-After': '60' } });
    const error = await submitAnonymousRequest(input, (async () => res) as unknown as typeof fetch).catch((e) => e);
    expect(error).toMatchObject({ kind: 'rateLimited', retryAfterSeconds: 60 });
  });
});

describe('mapRequestsResponse', () => {
  it('reads retry_after_seconds from the IP limiter body when there is no header', () => {
    expect(mapRequestsResponse(429, { error: 'rate_limited', retry_after_seconds: 42 })).toMatchObject({ kind: 'rateLimited', retryAfterSeconds: 42 });
  });

  it('a 403 that is not the bot check (e.g. deployment protection) is generic, not captcha', () => {
    expect(mapRequestsResponse(403, null)).toMatchObject({ kind: 'generic' });
  });

  it('never surfaces server wording, only the vocabulary', () => {
    const error = mapRequestsResponse(500, { error: 'server_error', detail: 'SUPABASE_SERVICE_ROLE_KEY missing' });
    expect(error.message).toBe('booking_request_service');
  });
});

describe('mapRpcError (create_my_booking_request)', () => {
  it.each([
    [{ code: '22023', message: 'invalid_email' }, { kind: 'invalid', fields: ['email'] }],
    [{ code: '22023', message: 'invalid_goal' }, { kind: 'invalid', fields: ['goal'] }],
    [{ code: '22023', message: 'invalid_name' }, { kind: 'invalid', fields: ['name'] }],
    [{ code: '42501', message: 'mentor_unavailable' }, { kind: 'unavailable' }],
    [{ code: '42501', message: 'not_allowed' }, { kind: 'generic' }],
    [{ code: '42501', message: 'permission denied for function create_my_booking_request' }, { kind: 'generic' }],
    [{ code: 'P0001', message: 'rate_limited' }, { kind: 'rateLimited' }],
    [{ code: 'PGRST202', message: 'Could not find the function public.create_my_booking_request' }, { kind: 'service', code: 'PGRST202' }],
    [{ code: '', message: 'TypeError: Failed to fetch' }, { kind: 'network' }],
    [new TypeError('Load failed'), { kind: 'network' }],
    [{ code: 'XX000', message: 'boom' }, { kind: 'generic' }],
    [null, { kind: 'generic' }],
  ])('%j → %j', (error, expected) => {
    expect(mapRpcError(error)).toMatchObject(expected);
  });

  it('passes a BookingRequestError through unchanged', () => {
    const original = new BookingRequestError('captcha');
    expect(mapRpcError(original)).toBe(original);
  });
});

describe('small helpers', () => {
  it('parseRetryAfter accepts delta seconds only', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter('1.2')).toBe(2);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('toRequestField maps server names and RPC fragments', () => {
    expect(toRequestField('invalid_email')).toBe('email');
    expect(toRequestField('turnstileToken')).toBe('captcha');
    expect(toRequestField('mentorId')).toBe('mentor');
    expect(toRequestField('something')).toBeNull();
  });
});

describe('classifyBookingError (the copy cases the forms render)', () => {
  it.each([
    [new BookingRequestError('captcha'), 'captcha'],
    [new BookingRequestError('rateLimited'), 'rateLimited'],
    [new BookingRequestError('unavailable'), 'unavailable'],
    [new BookingRequestError('invalid', { fields: ['email'] }), 'invalidEmail'],
    [new BookingRequestError('invalid', { fields: ['goal'] }), 'invalid'],
    [new BookingRequestError('network'), 'generic'],
    [new BookingRequestError('generic'), 'generic'],
    [new BookingRequestError('service'), 'service'],
    [mapRequestsResponse(503, { error: 'unavailable' }), 'service'],
    [{ code: 'P0001', message: 'rate_limited' }, 'rateLimited'],
    [{ code: '42501', message: 'mentor_unavailable' }, 'unavailable'],
    [new Error('anything'), 'generic'],
  ])('%o → %s', (error, kind) => {
    expect(classifyBookingError(error)).toBe(kind);
  });

  it('invalidRequestFields and isSendBlocked', () => {
    expect(invalidRequestFields(new BookingRequestError('invalid', { fields: ['goal', 'name'] }))).toEqual(['goal', 'name']);
    expect(invalidRequestFields(new BookingRequestError('captcha'))).toEqual([]);
    expect(isSendBlocked('rateLimited')).toBe(true);
    expect(isSendBlocked('unavailable')).toBe(true);
    expect(isSendBlocked('captcha')).toBe(false);
    expect(isSendBlocked(null)).toBe(false);
    expect(isSendBlocked('service')).toBe(false);
  });

  it('a 429 blocks Send only for its Retry-After (an hour without one), never past an hour', () => {
    expect(rateLimitCooldownMs(120)).toBe(120_000);
    expect(rateLimitCooldownMs(0)).toBe(5_000);
    expect(rateLimitCooldownMs(undefined)).toBe(3_600_000);
    expect(rateLimitCooldownMs(86_400)).toBe(3_600_000);
  });
});

describe('sentMemoryForViewer (cards, profile and scheduler share it)', () => {
  const memory = { email: 'Sara@Example.com ', sentAt: '2026-09-20T10:00:00Z' };
  it('signed out: the browser memory shows', () => {
    expect(sentMemoryForViewer(memory, undefined)).toBe(memory);
    expect(sentMemoryForViewer(memory, null)).toBe(memory);
  });
  it('signed in: only a memory sent from the same address (case and spaces ignored)', () => {
    expect(sentMemoryForViewer(memory, 'sara@example.com')).toBe(memory);
    expect(sentMemoryForViewer(memory, 'omar@example.com')).toBeNull();
    expect(sentMemoryForViewer(null, 'sara@example.com')).toBeNull();
  });
});

describe('request state with Cal.com and programme-managed rows (B7)', () => {
  const featuredDbId = FEATURED_MENTORS[0].dbId;
  const base: Booking = {
    id: 'b1',
    mentor_id: 'm-db',
    mentee_id: 'me1',
    status: 'accepted',
    created_at: '2026-09-20T10:00:00Z',
  };
  const sent = (patch: Partial<Extract<RequestState, { kind: 'sent' }>>): RequestState => ({
    kind: 'sent',
    email: 'sara@example.com',
    sentAt: base.created_at,
    status: 'accepted',
    source: 'row',
    ...patch,
  });
  const t = ((key: string, values?: Record<string, unknown>) => (values?.name ? `${key}(${values.name})` : key)) as never;

  it('accepted with a link: the mentee chooses a time', () => {
    expect(railStatesFor(sent({ calLink: 'jane/30min' }))).toMatchObject({ states: ['done', 'done', 'current'], canChooseTime: true });
  });

  it('a requested Cal.com time waits for the mentor: no "Choose a time"', () => {
    const progress = railStatesFor(sent({ calLink: 'jane/30min', calStatus: 'requested' }));
    expect(progress).toMatchObject({ canChooseTime: false, stop3Key: 'dashboardV2.rail.waitingConfirm', states: ['done', 'done', 'current'] });
    expect(railStopsFor(t, sent({ calLink: 'jane/30min', calStatus: 'requested' }), { name: 'Jane' }).stops[2].label).toBe('dashboardV2.rail.waitingConfirm(Jane)');
  });

  it('a declined Cal.com time: choose another', () => {
    expect(railStatesFor(sent({ calLink: 'jane/30min', calStatus: 'rejected' }))).toMatchObject({ canChooseTime: true, chooseAnother: true, stop3Key: 'dashboardV2.rail.timeDeclined' });
  });

  it('accepted, no link: waiting for the link, or the programme team for a curated mentor', () => {
    expect(railStatesFor(sent({}))).toMatchObject({ canChooseTime: false, waitingKey: 'dashboardV2.rail.acceptedNoLink', states: ['done', 'current', 'next'] });
    expect(railStatesFor(sent({ programmeManaged: true }))).toMatchObject({ canChooseTime: false, stop3Key: 'dashboardV2.rail.programmeTeam', states: ['done', 'done', 'current'] });
  });

  it('resolveRequestState carries cal_status and marks curated mentors as programme-managed', () => {
    const state = resolveRequestState({
      mentorId: featuredDbId,
      isAvailable: true,
      bookings: [{ ...base, mentor_id: featuredDbId, cal_status: 'requested' }],
      viewerEmail: 'sara@example.com',
      local: null,
    });
    expect(state).toMatchObject({ kind: 'sent', bookingId: 'b1', calStatus: 'requested', programmeManaged: true });
    const other = resolveRequestState({ mentorId: 'm-db', isAvailable: true, bookings: [base], viewerEmail: 'sara@example.com', local: null });
    expect(other).toMatchObject({ kind: 'sent', programmeManaged: false, calStatus: null });
  });

  it('pending and confirmed keep their rails', () => {
    expect(railStatesFor(sent({ status: 'pending' })).states).toEqual(['done', 'current', 'next']);
    expect(railStatesFor(sent({ status: 'confirmed' })).states).toEqual(['done', 'done', 'done']);
    expect(railStatesFor({ kind: 'cta' }).states).toEqual(['next', 'next', 'next']);
  });
});
