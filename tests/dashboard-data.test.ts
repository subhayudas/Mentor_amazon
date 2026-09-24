import { describe, expect, it } from 'vitest';
import type { Booking } from '../client/src/lib/database.ts';
import {
  asUtcIso,
  displayNameFor,
  firstNameOf,
  normalizeBookingTimes,
  ownRows,
  recordedMinutes,
  selectDashboardRows,
  type DashboardRole,
} from '../client/src/pages/dashboard/dataSource.ts';

const booking = (id: string, mentor_id: string, mentee_id: string, extra: Partial<Booking> = {}): Booking => ({
  id,
  mentor_id,
  mentee_id,
  status: 'pending',
  created_at: '2026-09-20T10:00:00',
  ...extra,
});

const MENTOR = 'mentor-1';
const MENTEE = 'mentee-1';
const DB_ROWS = [
  booking('db-1', MENTOR, MENTEE),
  booking('db-2', MENTOR, 'mentee-2'),
  booking('db-3', 'mentor-2', MENTEE),
  booking('db-4', 'mentor-3', 'mentee-3'),
];
const LOCAL_ROWS = [booking('local-1', MENTOR, MENTEE), booking('local-2', 'mentor-9', 'mentee-9')];
const MOCK_ROWS = [booking('mock-1', 'mock-mentor', 'mock-mentee'), booking('mock-2', 'mock-mentor', 'mock-mentee')];

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('selectDashboardRows — database mode', () => {
  const roles: DashboardRole[] = ['mentor', 'mentee', 'admin'];

  it.each(roles)('never returns mock or browser rows and never flags demo (%s)', (role) => {
    const result = selectDashboardRows({
      isLocal: false,
      role,
      profileId: role === 'admin' ? null : role === 'mentor' ? MENTOR : MENTEE,
      dbRows: DB_ROWS,
      localRows: LOCAL_ROWS,
      mockRows: MOCK_ROWS,
    });
    expect(result.demo).toBe(false);
    for (const row of result.rows) {
      expect(row.id.startsWith('db-')).toBe(true);
    }
  });

  it('a mentor sees only rows where they are the mentor', () => {
    const result = selectDashboardRows({ isLocal: false, role: 'mentor', profileId: MENTOR, dbRows: DB_ROWS, mockRows: MOCK_ROWS });
    expect(ids(result.rows)).toEqual(['db-1', 'db-2']);
    expect(result.needsProfile).toBe(false);
  });

  it('a mentee sees only rows where they are the mentee', () => {
    const result = selectDashboardRows({ isLocal: false, role: 'mentee', profileId: MENTEE, dbRows: DB_ROWS });
    expect(ids(result.rows)).toEqual(['db-1', 'db-3']);
  });

  it('an admin sees every row the query returned', () => {
    const result = selectDashboardRows({ isLocal: false, role: 'admin', profileId: 'admin-users-row', dbRows: DB_ROWS });
    expect(ids(result.rows)).toEqual(['db-1', 'db-2', 'db-3', 'db-4']);
  });

  it.each(['mentor', 'mentee'] as const)('a %s without a profile gets no rows and needsProfile', (role) => {
    const result = selectDashboardRows({ isLocal: false, role, profileId: null, dbRows: DB_ROWS, localRows: LOCAL_ROWS, mockRows: MOCK_ROWS });
    expect(result).toEqual({ rows: [], demo: false, needsProfile: true });
  });

  it('with zero real bookings the result is empty (no sample rows fill the gap)', () => {
    const result = selectDashboardRows({ isLocal: false, role: 'mentor', profileId: MENTOR, dbRows: [], localRows: LOCAL_ROWS, mockRows: MOCK_ROWS });
    expect(result).toEqual({ rows: [], demo: false, needsProfile: false });
  });

  it('while the query is still loading there are no rows (and no demo)', () => {
    const result = selectDashboardRows({ isLocal: false, role: 'mentee', profileId: MENTEE, dbRows: undefined, mockRows: MOCK_ROWS });
    expect(result).toEqual({ rows: [], demo: false, needsProfile: false });
  });

  it('no session role → nothing', () => {
    expect(selectDashboardRows({ isLocal: false, role: null, profileId: null, dbRows: DB_ROWS })).toEqual({ rows: [], demo: false, needsProfile: false });
  });
});

describe('selectDashboardRows — local (demo) mode keeps its behaviour', () => {
  it('a local account sees its own browser rows, not the sample set', () => {
    const result = selectDashboardRows({ isLocal: true, role: 'mentor', profileId: MENTOR, localRows: LOCAL_ROWS, mockRows: MOCK_ROWS });
    expect(ids(result.rows)).toEqual(['local-1']);
    expect(result.demo).toBe(false);
  });

  it('the local admin sees every browser row', () => {
    const result = selectDashboardRows({ isLocal: true, role: 'admin', profileId: 'admin', localRows: LOCAL_ROWS, mockRows: MOCK_ROWS });
    expect(ids(result.rows)).toEqual(['local-1', 'local-2']);
  });

  it('the showcase (no account) sees browser rows plus the sample set, flagged demo', () => {
    const result = selectDashboardRows({ isLocal: true, role: null, profileId: null, localRows: LOCAL_ROWS, mockRows: MOCK_ROWS });
    expect(ids(result.rows)).toEqual(['local-1', 'local-2', 'mock-1', 'mock-2']);
    expect(result.demo).toBe(true);
  });
});

describe('ownRows', () => {
  it('filters by role and profile', () => {
    expect(ids(ownRows(DB_ROWS, 'mentor', 'mentor-2'))).toEqual(['db-3']);
    expect(ids(ownRows(DB_ROWS, 'mentee', 'mentee-3'))).toEqual(['db-4']);
    expect(ownRows(DB_ROWS, 'mentee', null)).toEqual([]);
    expect(ownRows(DB_ROWS, null, MENTOR)).toEqual([]);
  });
});

describe('asUtcIso / normalizeBookingTimes', () => {
  it('reads a zone-less timestamp as UTC', () => {
    expect(asUtcIso('2026-09-24T10:00:00')).toBe('2026-09-24T10:00:00Z');
    expect(asUtcIso('2026-09-24T10:00:00.123456')).toBe('2026-09-24T10:00:00.123456Z');
    expect(asUtcIso('2026-09-24 10:00:00')).toBe('2026-09-24T10:00:00Z');
    expect(new Date(asUtcIso('2026-09-24T10:00:00')!).toISOString()).toBe('2026-09-24T10:00:00.000Z');
  });
  it('leaves values that already carry an offset alone', () => {
    expect(asUtcIso('2026-09-24T10:00:00Z')).toBe('2026-09-24T10:00:00Z');
    expect(asUtcIso('2026-09-24T10:00:00+04:00')).toBe('2026-09-24T10:00:00+04:00');
    expect(asUtcIso('2026-09-24T10:00:00.5-0530')).toBe('2026-09-24T10:00:00.5-0530');
  });
  it('passes through empties and date-only values', () => {
    expect(asUtcIso(null)).toBeUndefined();
    expect(asUtcIso('')).toBeUndefined();
    expect(asUtcIso('2026-09-24')).toBe('2026-09-24');
  });
  it('normalises every timestamp field of a booking and nothing else', () => {
    const row = normalizeBookingTimes(
      booking('b', MENTOR, MENTEE, { scheduled_at: '2026-09-25T08:30:00', completed_at: undefined, cal_requested_start: '2026-09-26T09:00:00', goal: '2026-09-24T10:00:00' }),
    );
    expect(row.created_at).toBe('2026-09-20T10:00:00Z');
    expect(row.scheduled_at).toBe('2026-09-25T08:30:00Z');
    expect(row.cal_requested_start).toBe('2026-09-26T09:00:00Z');
    expect(row.completed_at).toBeUndefined();
    expect(row.goal).toBe('2026-09-24T10:00:00');
  });
});

describe('recordedMinutes', () => {
  it('sums only recorded durations of completed sessions and counts the missing ones', () => {
    const rows = [
      { status: 'completed' as const, session_duration_minutes: 45 },
      { status: 'completed' as const, session_duration_minutes: 30 },
      { status: 'completed' as const, session_duration_minutes: undefined },
      { status: 'completed' as const, session_duration_minutes: 0 },
      { status: 'confirmed' as const, session_duration_minutes: 60 },
      { status: 'pending' as const },
    ];
    expect(recordedMinutes(rows)).toEqual({ minutes: 75, missing: 2 });
  });
  it('is zero for nothing', () => {
    expect(recordedMinutes([])).toEqual({ minutes: 0, missing: 0 });
  });
});

describe('displayNameFor / firstNameOf', () => {
  it('prefers the row name, else the email local part', () => {
    expect(displayNameFor('Layla Haddad', 'layla@example.com')).toBe('Layla Haddad');
    expect(displayNameFor('  ', 'dev.c.mentee@mentorconnect.test')).toBe('dev.c.mentee');
    expect(displayNameFor(undefined, undefined)).toBe('');
  });
  it('takes the first word', () => {
    expect(firstNameOf('Layla Haddad')).toBe('Layla');
    expect(firstNameOf('dev.c.mentee')).toBe('dev.c.mentee');
    expect(firstNameOf('')).toBe('');
  });
});
