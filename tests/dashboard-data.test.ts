import { describe, expect, it } from 'vitest';
import type { Booking } from '../client/src/lib/database.ts';
import {
  asUtcIso,
  bookingsTabFor,
  checklistDone,
  mentorProfileComplete,
  upcomingWithin,
  displayNameFor,
  firstNameOf,
  normalizeBookingTimes,
  ownRows,
  recordedMinutes,
  rowActionsFor,
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

describe('bookingsTabFor', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  it('sorts rows into the four tabs', () => {
    expect(bookingsTabFor({ status: 'pending' }, now)).toBe('requests');
    expect(bookingsTabFor({ status: 'accepted' }, now)).toBe('upcoming');
    expect(bookingsTabFor({ status: 'confirmed', scheduled_at: '2026-09-25T09:00:00Z' }, now)).toBe('upcoming');
    expect(bookingsTabFor({ status: 'confirmed' }, now)).toBe('upcoming');
    expect(bookingsTabFor({ status: 'confirmed', scheduled_at: '2026-09-23T09:00:00Z' }, now)).toBe('completed');
    expect(bookingsTabFor({ status: 'completed' }, now)).toBe('completed');
    expect(bookingsTabFor({ status: 'canceled' }, now)).toBe('canceled');
    expect(bookingsTabFor({ status: 'rejected' }, now)).toBe('canceled');
  });
});

describe('rowActionsFor', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const future = '2026-09-25T09:00:00Z';
  const past = '2026-09-23T09:00:00Z';
  const mentor = { role: 'mentor' as const, now, hasCalLink: true, programmeManaged: false };
  const mentee = { role: 'mentee' as const, now, hasCalLink: true, programmeManaged: false };

  it('mentor: accept or decline a pending request', () => {
    expect(rowActionsFor({ status: 'pending' }, mentor)).toEqual({ actions: ['accept', 'decline'], note: null });
  });
  it('mentor: complete or cancel accepted and confirmed sessions, with the right note', () => {
    expect(rowActionsFor({ status: 'accepted' }, mentor)).toEqual({ actions: ['complete', 'cancel'], note: 'waitingForTime' });
    expect(rowActionsFor({ status: 'accepted', cal_status: 'requested', cal_event_uri: 'uid-1' }, mentor).note).toBe('timeRequestedMentor');
    expect(rowActionsFor({ status: 'confirmed', scheduled_at: future, cal_event_uri: 'uid-1' }, mentor)).toEqual({ actions: ['complete', 'cancel'], note: null });
    expect(rowActionsFor({ status: 'confirmed', scheduled_at: past }, mentor)).toEqual({ actions: ['complete', 'cancel'], note: 'awaitingCompletion' });
  });
  it.each(['completed', 'canceled', 'rejected'] as const)('mentor: no actions on %s rows', (status) => {
    expect(rowActionsFor({ status }, mentor)).toEqual({ actions: [], note: null });
    expect(rowActionsFor({ status }, mentee)).toEqual({ actions: [], note: null });
  });
  it('mentee: withdraw a pending request', () => {
    expect(rowActionsFor({ status: 'pending' }, mentee)).toEqual({ actions: ['withdraw'], note: null });
  });
  it('mentee: choose a time once accepted when the mentor has a Cal link', () => {
    expect(rowActionsFor({ status: 'accepted' }, mentee)).toEqual({ actions: ['chooseTime', 'cancel'], note: null });
    // A Cal booking that was released (cancelled on Cal) leaves no uid: choose again.
    expect(rowActionsFor({ status: 'accepted', cal_status: 'cancelled' }, mentee)).toEqual({ actions: ['chooseTime', 'cancel'], note: null });
  });
  it('mentee: waits while the mentor confirms a requested time, re-picks after a decline', () => {
    expect(rowActionsFor({ status: 'accepted', cal_status: 'requested', cal_event_uri: 'uid' }, mentee)).toEqual({ actions: ['cancel'], note: 'timeRequested' });
    expect(rowActionsFor({ status: 'accepted', cal_status: 'rejected' }, mentee)).toEqual({ actions: ['chooseAnotherTime', 'cancel'], note: 'timeDeclined' });
    expect(rowActionsFor({ status: 'accepted', cal_status: 'rejected' }, { ...mentee, hasCalLink: false })).toEqual({ actions: ['cancel'], note: 'timeDeclined' });
  });
  it('mentee: without a Cal link, the programme team (featured) or the mentor arranges the time', () => {
    expect(rowActionsFor({ status: 'accepted' }, { ...mentee, hasCalLink: false, programmeManaged: true })).toEqual({ actions: ['cancel'], note: 'programmeArranges' });
    expect(rowActionsFor({ status: 'accepted' }, { ...mentee, hasCalLink: false })).toEqual({ actions: ['cancel'], note: 'mentorWillShare' });
  });
  it('mentee: reschedule only a Cal booking; a past session has no actions', () => {
    expect(rowActionsFor({ status: 'confirmed', scheduled_at: future, cal_event_uri: 'uid-1' }, mentee)).toEqual({ actions: ['reschedule', 'cancel'], note: null });
    expect(rowActionsFor({ status: 'confirmed', scheduled_at: future }, mentee)).toEqual({ actions: ['cancel'], note: null });
    expect(rowActionsFor({ status: 'confirmed', scheduled_at: past, cal_event_uri: 'uid-1' }, mentee)).toEqual({ actions: [], note: 'sessionPassed' });
  });
});

describe('checklistDone / mentorProfileComplete', () => {
  const complete = { name: 'Sara', bio: 'I help people move into product roles.', photo_url: 'https://x/p.jpg', expertise: ['Product Management'], position: 'PM', company: 'Amazon', cal_link: 'sara/30min' };
  it('treats a profile as complete only with photo, bio, expertise and a headline', () => {
    expect(mentorProfileComplete(complete)).toBe(true);
    expect(mentorProfileComplete({ ...complete, photo_url: '' })).toBe(false);
    expect(mentorProfileComplete({ ...complete, bio: '  ' })).toBe(false);
    expect(mentorProfileComplete({ ...complete, expertise: [] })).toBe(false);
    expect(mentorProfileComplete({ ...complete, position: '', company: '' })).toBe(false);
    expect(mentorProfileComplete({ ...complete, position: '' })).toBe(true);
    expect(mentorProfileComplete(null)).toBe(false);
  });
  it('computes every step from state (only "share" comes from this browser)', () => {
    expect(Array.from(checklistDone({ mentor: complete, availabilityWindows: 3, bookings: 1, shared: true })).sort()).toEqual(['availability', 'calendar', 'profile', 'sessions', 'share']);
    expect(Array.from(checklistDone({ mentor: { ...complete, cal_link: '' }, availabilityWindows: 0, bookings: 0, shared: false }))).toEqual(['profile']);
    expect(checklistDone({ mentor: { ...complete, cal_link: 'not a link' }, availabilityWindows: 0, bookings: 0, shared: false }).has('calendar')).toBe(false);
    expect(checklistDone({ mentor: null, availabilityWindows: 0, bookings: 0, shared: false }).size).toBe(0);
  });
});

describe('upcomingWithin', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  it('keeps confirmed sessions in the window, soonest first', () => {
    const rows = [
      { id: 'late', status: 'confirmed' as const, scheduled_at: '2026-10-20T09:00:00Z' },
      { id: 'b', status: 'confirmed' as const, scheduled_at: '2026-09-30T09:00:00Z' },
      { id: 'a', status: 'confirmed' as const, scheduled_at: '2026-09-25T09:00:00Z' },
      { id: 'past', status: 'confirmed' as const, scheduled_at: '2026-09-20T09:00:00Z' },
      { id: 'accepted', status: 'accepted' as const, scheduled_at: '2026-09-26T09:00:00Z' },
      { id: 'untimed', status: 'confirmed' as const },
    ];
    expect(upcomingWithin(rows, now, 14).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
