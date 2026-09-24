import { describe, expect, it } from 'vitest';
import { asUtcIso, parseTimestamp, timestampMs } from '../client/src/lib/timestamps.ts';
import { formatDateTime, formatRelativeDay, formatRelativeTime, formatTime } from '../client/src/lib/format.ts';
import { isFuture } from '../client/src/lib/menteeBookings.ts';
import { dueReminders } from '../client/src/lib/reminders.ts';
import { inWindow } from '../client/src/lib/reporting.ts';
import type { Booking } from '../client/src/lib/database.ts';

/**
 * F45 / R14: base-table timestamps are `timestamp without time zone` holding UTC wall-clock
 * time, and PostgREST returns them with no offset. The client must read them as UTC, never
 * as the viewer's local time. vitest.config.ts runs the unit suite in Asia/Dubai (UTC+4), so
 * reading one as local time fails here even on a UTC CI runner.
 */
describe('the unit suite time zone', () => {
  it('is Asia/Dubai, so a local-time misread cannot pass unnoticed', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-240);
  });
});

describe('asUtcIso', () => {
  it('marks an offset-less date-time as UTC', () => {
    expect(asUtcIso('2026-09-24T10:00:00')).toBe('2026-09-24T10:00:00Z');
    expect(asUtcIso('2026-09-24 10:00:00.123456')).toBe('2026-09-24T10:00:00.123456Z');
    expect(asUtcIso('2026-09-24T10:00')).toBe('2026-09-24T10:00Z');
  });
  it('leaves offsets, date-only values and other text alone', () => {
    expect(asUtcIso('2026-09-24T10:00:00Z')).toBe('2026-09-24T10:00:00Z');
    expect(asUtcIso('2026-09-24T10:00:00+00:00')).toBe('2026-09-24T10:00:00+00:00');
    expect(asUtcIso('2026-09-24T10:00:00+04')).toBe('2026-09-24T10:00:00+04');
    expect(asUtcIso('2026-09-24')).toBe('2026-09-24');
    expect(asUtcIso('Sep 24 2026 10:00')).toBe('Sep 24 2026 10:00');
    expect(asUtcIso(undefined)).toBeUndefined();
  });
});

describe('parseTimestamp / timestampMs', () => {
  it('reads a stored (offset-less) timestamp as that UTC instant', () => {
    expect(parseTimestamp('2026-09-24T10:00:00')?.toISOString()).toBe('2026-09-24T10:00:00.000Z');
    expect(parseTimestamp('2026-09-24T10:00:00.123456')?.toISOString()).toBe('2026-09-24T10:00:00.123Z');
    expect(timestampMs('2026-09-24 10:00:00')).toBe(Date.UTC(2026, 8, 24, 10));
  });
  it('keeps explicit offsets, Dates and epoch numbers', () => {
    expect(parseTimestamp('2026-09-24T14:00:00+04:00')?.toISOString()).toBe('2026-09-24T10:00:00.000Z');
    expect(parseTimestamp('2026-09-24T10:00:00.000Z')?.toISOString()).toBe('2026-09-24T10:00:00.000Z');
    const d = new Date(Date.UTC(2026, 8, 24, 10));
    expect(parseTimestamp(d)).toBe(d);
    expect(parseTimestamp(d.getTime())?.getTime()).toBe(d.getTime());
  });
  it('returns null (NaN) for missing or unparsable input', () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('not a date')).toBeNull();
    expect(parseTimestamp(new Date(Number.NaN))).toBeNull();
    expect(timestampMs(undefined)).toBeNaN();
  });
});

describe('formatters read stored timestamps as UTC', () => {
  // 12:00 UTC is 16:00 in Dubai; the misread showed 12:00.
  it('formats the time in the viewer zone', () => {
    expect(formatTime('2026-09-24T12:00:00', 'en', 'Asia/Dubai')).toBe('16:00');
    expect(formatDateTime('2026-09-24T12:00:00', 'en', 'Asia/Dubai')).toBe(formatDateTime('2026-09-24T12:00:00Z', 'en', 'Asia/Dubai'));
  });
  it('counts relative days from the viewer local day (the "sent yesterday" misread)', () => {
    // Sent 20:30 UTC = 00:30 on the 25th in Dubai; ten minutes later it is still that day.
    expect(formatRelativeDay('2026-09-24T20:30:00', 'en', new Date('2026-09-24T20:40:00Z'))).toBe('today');
  });
  it('measures relative times from the real instant', () => {
    expect(formatRelativeTime('2026-09-24T20:30:00', 'en', new Date('2026-09-24T20:31:00Z'))).toBe('1 minute ago');
  });
});

describe('time checks read stored timestamps as UTC', () => {
  const booking = (scheduled_at: string, status: Booking['status'] = 'confirmed') => ({ id: 'b1', status, scheduled_at }) as Booking;

  it('isFuture: a session at 20:30 UTC is still ahead at 18:00 UTC', () => {
    expect(isFuture('2026-09-24T20:30:00', new Date('2026-09-24T18:00:00Z'))).toBe(true);
    expect(isFuture('2026-09-24T20:30:00', new Date('2026-09-24T20:31:00Z'))).toBe(false);
  });
  it('dueReminders: thirty minutes before the session is the 1h reminder', () => {
    const [reminder] = dueReminders([booking('2026-09-24T20:30:00')], new Date('2026-09-24T20:00:00Z'));
    expect(reminder?.minutesAway).toBe(30);
    expect(reminder?.kind).toBe('1h');
  });
  it('inWindow: 21:00 UTC on 30 September falls in October for a Dubai window', () => {
    const october = { start: new Date('2026-10-01T00:00:00+04:00'), end: new Date('2026-11-01T00:00:00+04:00') };
    expect(inWindow('2026-09-30T21:00:00', october)).toBe(true);
    expect(inWindow('2026-09-30T19:00:00', october)).toBe(false);
  });
});
