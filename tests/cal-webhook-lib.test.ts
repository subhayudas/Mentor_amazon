import { describe, expect, it } from 'vitest';
import {
  attendeeEmails,
  deliveryId,
  normalizeCalEvent,
  parseMentorParam,
  parseSignatureHeader,
  recordId,
  sha256Hex,
  verifyHmac,
} from '../api/_lib/calWebhook.ts';
import { calEvent, pingEvent, signCal } from './helpers/cal.ts';

/** U2 — pure Cal.com webhook helpers (design §6.2). */

describe('signature header', () => {
  const hex = 'ab'.repeat(32);
  it('accepts plain and sha256=-prefixed hex, any case', () => {
    expect(parseSignatureHeader(hex)).toBe(hex);
    expect(parseSignatureHeader(`sha256=${hex}`)).toBe(hex);
    expect(parseSignatureHeader(`SHA256=${hex.toUpperCase()}`)).toBe(hex);
    expect(parseSignatureHeader([` ${hex} `])).toBe(hex);
  });
  it('rejects missing, non-hex, wrong-length and no-secret-provided', () => {
    for (const bad of [undefined, '', 'no-secret-provided', 'zz'.repeat(32), 'ab'.repeat(31), 'ab'.repeat(33), `sha1=${hex}`]) {
      expect(parseSignatureHeader(bad)).toBeNull();
    }
  });
});

describe('verifyHmac', () => {
  const body = Buffer.from('{"triggerEvent":"PING"}');
  it('matches any candidate secret', () => {
    const sig = signCal(body.toString(), 'second-secret');
    expect(verifyHmac(body, sig, ['first-secret', 'second-secret'])).toBe(true);
    expect(verifyHmac(body, sig, ['first-secret'])).toBe(false);
    expect(verifyHmac(body, sig, [])).toBe(false);
    expect(verifyHmac(body, sig, [''])).toBe(false);
  });
  it('never verifies with an empty secret, even against a signature made with the empty string (R1-63)', () => {
    const emptyKeyed = signCal(body.toString(), '');
    expect(verifyHmac(body, emptyKeyed, [''])).toBe(false);
    expect(verifyHmac(body, emptyKeyed, ['', 'real-secret-value'])).toBe(false);
  });
  it('is over the exact bytes', () => {
    const sig = signCal(body.toString(), 's');
    expect(verifyHmac(Buffer.from('{"triggerEvent": "PING"}'), sig, ['s'])).toBe(false);
  });
  it('rejects a malformed digest without throwing', () => {
    expect(verifyHmac(body, 'nothex', ['s'])).toBe(false);
  });
});

describe('?mentor=', () => {
  it('lower-cases a UUID, treats absence as the global path, flags garbage', () => {
    expect(parseMentorParam('3F1C2A9E-8B7D-4C6E-9A1B-2C3D4E5F6A7B')).toBe('3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b');
    expect(parseMentorParam(undefined)).toBeNull();
    expect(parseMentorParam('')).toBeNull();
    expect(parseMentorParam('manav-gupta')).toBe(false);
    expect(parseMentorParam("' or 1=1 --")).toBe(false);
  });
});

describe('normalizeCalEvent', () => {
  it('collects every attendee email plus responses.email in both shapes, lower-cased and deduped', () => {
    const asObject = calEvent('BOOKING_CREATED', { uid: 'u1', attendees: ['A@x.com', 'b@x.com', 'a@X.com'], responsesEmail: { value: 'C@x.com' } });
    expect(attendeeEmails((asObject as { payload: Record<string, unknown> }).payload)).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    const asString = calEvent('BOOKING_CREATED', { uid: 'u1', attendees: [], responsesEmail: 'D@x.com' });
    expect(attendeeEmails((asString as { payload: Record<string, unknown> }).payload)).toEqual(['d@x.com']);
  });

  it('keeps metadata.mc_booking only when it is UUID-shaped', () => {
    const ok = normalizeCalEvent(calEvent('BOOKING_CREATED', { uid: 'u1', mcBooking: 'D2A6C1B0-1111-4222-8333-944455556666' }));
    expect(ok.kind === 'event' && ok.event.mcBooking).toBe('d2a6c1b0-1111-4222-8333-944455556666');
    for (const bad of ['1; drop table bookings', 'not-a-uuid', '']) {
      const r = normalizeCalEvent(calEvent('BOOKING_CREATED', { uid: 'u1', mcBooking: bad }));
      expect(r.kind === 'event' && r.event.mcBooking).toBeNull();
    }
  });

  it('normalises offsets to UTC Z and upper-cases status', () => {
    const r = normalizeCalEvent(
      calEvent('BOOKING_REQUESTED', { uid: 'u1', start: '2026-10-01T14:00:00+04:00', end: '2026-10-01T14:30:00+04:00', status: 'pending' }),
    );
    expect(r).toMatchObject({ kind: 'event', event: { startIso: '2026-10-01T10:00:00.000Z', endIso: '2026-10-01T10:30:00.000Z', status: 'PENDING' } });
  });

  it('an unparseable start or end, or a missing uid, is invalid', () => {
    expect(normalizeCalEvent(calEvent('BOOKING_CREATED', { uid: 'u1', start: 'tomorrow-ish' })).kind).toBe('invalid');
    expect(normalizeCalEvent(calEvent('BOOKING_CREATED', { uid: 'u1', end: 'nope' })).kind).toBe('invalid');
    const noUid = calEvent('BOOKING_CANCELLED', { uid: 'u1' }) as { payload: Record<string, unknown> };
    noUid.payload.uid = '';
    expect(normalizeCalEvent(noUid).kind).toBe('invalid');
  });

  it('classifies PING, unsupported triggers and unrecognised payloads', () => {
    expect(normalizeCalEvent(pingEvent())).toEqual({ kind: 'ping', trigger: 'PING' });
    expect(normalizeCalEvent(calEvent('MEETING_ENDED', { uid: 'u1' }))).toEqual({ kind: 'ignored', trigger: 'MEETING_ENDED' });
    expect(normalizeCalEvent({ payload: {} }).kind).toBe('unrecognised');
    expect(normalizeCalEvent({ triggerEvent: 'BOOKING_CREATED' }).kind).toBe('unrecognised');
    expect(normalizeCalEvent('hello').kind).toBe('unrecognised');
    expect(normalizeCalEvent(null).kind).toBe('unrecognised');
  });

  it('lower-cases the organizer username and truncates reasons to 500 characters', () => {
    const r = normalizeCalEvent(calEvent('BOOKING_CANCELLED', { uid: 'u1', organizerUsername: 'Jane_Doe.1', reason: 'x'.repeat(900) }));
    expect(r.kind === 'event' && r.event.organizerUsername).toBe('jane_doe.1');
    expect(r.kind === 'event' && r.event.reason?.length).toBe(500);
    const noOrganizer = normalizeCalEvent(calEvent('BOOKING_CREATED', { uid: 'u1', organizerUsername: null }));
    expect(noOrganizer.kind === 'event' && noOrganizer.event.organizerUsername).toBeNull();
  });
});

describe('delivery ids', () => {
  it('are deterministic per mentor and event', () => {
    const e = { trigger: 'BOOKING_CREATED' as const, uid: 'u1', rescheduleUid: null, startIso: '2026-10-01T10:00:00.000Z', status: 'ACCEPTED' };
    expect(deliveryId('m1', e)).toBe('m1:BOOKING_CREATED:u1::2026-10-01T10:00:00.000Z:ACCEPTED');
    expect(deliveryId('m1', e)).toBe(deliveryId('m1', { ...e }));
    expect(deliveryId(null, e)).toBe('global:BOOKING_CREATED:u1::2026-10-01T10:00:00.000Z:ACCEPTED');
    expect(deliveryId('m1', { ...e, rescheduleUid: 'old' })).not.toBe(deliveryId('m1', e));
    expect(deliveryId('m1', { ...e, status: null })).toBe('m1:BOOKING_CREATED:u1::2026-10-01T10:00:00.000Z:');
  });
  it('non-booking deliveries are keyed by payload hash, so every ping is recorded once', () => {
    const a = sha256Hex(JSON.stringify(pingEvent('2026-09-24T10:00:00.000Z')));
    const b = sha256Hex(JSON.stringify(pingEvent('2026-09-24T10:05:00.000Z')));
    expect(recordId('m1', 'PING', a)).toBe(`m1:PING:sha256:${a}`);
    expect(recordId('m1', 'PING', a)).not.toBe(recordId('m1', 'PING', b));
    expect(recordId(null, '', a)).toBe(`global:NONE:sha256:${a}`);
  });
});
