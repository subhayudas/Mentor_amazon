import { describe, expect, it } from 'vitest';

import {
  calEmbedConfig,
  calEmbedLink,
  calSuccessEvent,
  embedOutcomeToastKey,
  isCalUid,
  isRecordable,
  normalizeCalStatus,
  parseBookingSuccessV2,
  parseRescheduleSuccessV2,
  toEmbedRecordOutcome,
  toUtcIso,
} from '../client/src/lib/calEvents.ts';

/** `bookingSuccessfulV2` data exactly as @calcom/embed-core 1.5.x types it (sdk-action-manager.d.ts). */
const V2 = {
  uid: 'bQ7x9kL2mN4pR8sT',
  title: '30 Min Meeting between Jane Mentor and Sara K.',
  startTime: '2026-10-02T14:00:00+04:00',
  endTime: '2026-10-02T14:30:00+04:00',
  eventTypeId: 12345,
  status: 'ACCEPTED',
  paymentRequired: false,
  isRecurring: false,
};

describe('parseBookingSuccessV2', () => {
  it('normalises offsets to UTC Z and keeps the uid and status', () => {
    expect(parseBookingSuccessV2(V2)).toEqual({
      uid: 'bQ7x9kL2mN4pR8sT',
      startTime: '2026-10-02T10:00:00.000Z',
      endTime: '2026-10-02T10:30:00.000Z',
      status: 'ACCEPTED',
    });
  });

  it('accepts the CustomEvent the embed dispatches ({ detail: { data } })', () => {
    const event = { detail: { type: 'bookingSuccessfulV2', namespace: '', fullType: 'CAL::bookingSuccessfulV2', data: V2 } };
    expect(parseBookingSuccessV2(event).uid).toBe(V2.uid);
    expect(parseBookingSuccessV2({ data: V2 }).startTime).toBe('2026-10-02T10:00:00.000Z');
  });

  it('upper-cases the status and keeps PENDING (requires confirmation)', () => {
    expect(parseBookingSuccessV2({ ...V2, status: 'pending' }).status).toBe('PENDING');
  });

  it('invalid values become undefined, never garbage', () => {
    expect(parseBookingSuccessV2({ uid: 'x', startTime: 'not a date', endTime: 42, status: 'accepted; drop table' })).toEqual({
      uid: undefined,
      startTime: undefined,
      endTime: undefined,
      status: undefined,
    });
    expect(parseBookingSuccessV2(null)).toEqual({ uid: undefined, startTime: undefined, endTime: undefined, status: undefined });
    expect(parseBookingSuccessV2('string')).toEqual({ uid: undefined, startTime: undefined, endTime: undefined, status: undefined });
  });

  it('isRecordable needs a valid uid and start time', () => {
    expect(isRecordable(parseBookingSuccessV2(V2))).toBe(true);
    expect(isRecordable(parseBookingSuccessV2({ ...V2, startTime: undefined }))).toBe(false);
    expect(isRecordable(parseBookingSuccessV2({ ...V2, uid: 'short' }))).toBe(false);
  });
});

describe('parseRescheduleSuccessV2', () => {
  it('returns the new booking plus the uid it replaces', () => {
    const next = { ...V2, uid: 'newUid_123456', startTime: '2026-10-03T09:00:00Z' };
    expect(parseRescheduleSuccessV2(next, 'bQ7x9kL2mN4pR8sT')).toEqual({
      uid: 'newUid_123456',
      startTime: '2026-10-03T09:00:00.000Z',
      endTime: '2026-10-02T10:30:00.000Z',
      status: 'ACCEPTED',
      rescheduleUid: 'bQ7x9kL2mN4pR8sT',
    });
  });

  it('drops an invalid rescheduleUid', () => {
    expect(parseRescheduleSuccessV2(V2, '../evil').rescheduleUid).toBeUndefined();
  });
});

describe('small parsers', () => {
  it('toUtcIso', () => {
    expect(toUtcIso('2026-10-02T14:00:00-05:30')).toBe('2026-10-02T19:30:00.000Z');
    expect(toUtcIso('')).toBeUndefined();
    expect(toUtcIso(1700000000)).toBeUndefined();
  });

  it('normalizeCalStatus and isCalUid', () => {
    expect(normalizeCalStatus(' accepted ')).toBe('ACCEPTED');
    expect(normalizeCalStatus('')).toBeUndefined();
    expect(isCalUid('abcDEF_12-3')).toBe(true);
    expect(isCalUid('abc')).toBe(false);
    expect(isCalUid('has space 123')).toBe(false);
    expect(isCalUid('x'.repeat(129))).toBe(false);
  });
});

describe('embed link, event and config', () => {
  it('a normal booking opens the mentor link and listens for bookingSuccessfulV2', () => {
    expect(calEmbedLink('https://cal.com/jane/30min?x=1')).toBe('jane/30min');
    expect(calSuccessEvent()).toBe('bookingSuccessfulV2');
  });

  it('a reschedule opens reschedule/<uid> and listens for rescheduleBookingSuccessfulV2', () => {
    expect(calEmbedLink('jane/30min', 'bQ7x9kL2mN4pR8sT')).toBe('reschedule/bQ7x9kL2mN4pR8sT');
    expect(calSuccessEvent('bQ7x9kL2mN4pR8sT')).toBe('rescheduleBookingSuccessfulV2');
    // An invalid uid never builds a path.
    expect(calEmbedLink('jane/30min', '../x')).toBe('jane/30min');
  });

  it('config carries name, email and metadata[mc_booking] only when set', () => {
    expect(calEmbedConfig({ menteeName: ' Sara K. ', menteeEmail: 'sara@example.com', bookingId: 'b-123' })).toEqual({
      theme: 'light',
      layout: 'month_view',
      name: 'Sara K.',
      email: 'sara@example.com',
      'metadata[mc_booking]': 'b-123',
    });
    expect(calEmbedConfig({})).toEqual({ theme: 'light', layout: 'month_view' });
    // The metadata key survives URL encoding the way the stub asserts it (metadata%5Bmc_booking%5D).
    const params = new URLSearchParams(calEmbedConfig({ bookingId: 'b-123' }));
    expect(params.get('metadata[mc_booking]')).toBe('b-123');
    expect(params.toString()).toContain('metadata%5Bmc_booking%5D=b-123');
  });

  it('the scheduling dialog is always light and in month view, whatever the mentor set in Cal.com (R1-80)', () => {
    const config = calEmbedConfig({ menteeName: 'Sara', bookingId: 'b-1' });
    expect(config.theme).toBe('light');
    expect(config.layout).toBe('month_view');
  });
});

describe('record_cal_booking_from_embed outcomes → toasts', () => {
  it('parses the RPC result', () => {
    expect(toEmbedRecordOutcome({ outcome: 'confirmed', booking_id: 'b1' })).toBe('confirmed');
    expect(toEmbedRecordOutcome([{ outcome: 'requested' }])).toBe('requested');
    expect(toEmbedRecordOutcome('rescheduled')).toBe('rescheduled');
    expect(toEmbedRecordOutcome({ outcome: 'weird' })).toBeNull();
    expect(toEmbedRecordOutcome(null)).toBeNull();
  });

  it('maps each outcome to its toast; already_recorded is silent', () => {
    expect(embedOutcomeToastKey('confirmed')).toBe('dashboardV2.cal.toastConfirmed');
    expect(embedOutcomeToastKey('requested')).toBe('dashboardV2.cal.toastRequested');
    expect(embedOutcomeToastKey('rescheduled')).toBe('dashboardV2.cal.toastRescheduled');
    expect(embedOutcomeToastKey('reschedule_requested')).toBe('dashboardV2.cal.toastRescheduleRequested');
    expect(embedOutcomeToastKey('already_recorded')).toBeNull();
    expect(embedOutcomeToastKey(null)).toBeNull();
  });
});
