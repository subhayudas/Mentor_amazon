import { describe, expect, it } from 'vitest';
import en from '../client/src/locales/en.json';
import ar from '../client/src/locales/ar.json';
import type { ActivityEvent } from '../client/src/lib/database.ts';
import { TRIGGER_SUMMARY_KEYS, TRIGGER_TYPES, triggerSummary } from '../client/src/lib/activitySummary.ts';

const options = {
  formatWhen: (iso: string) => `WHEN(${iso})`,
  fallbacks: { mentor: 'a mentor', mentee: 'a mentee' },
};

function event(type: ActivityEvent['type'], meta: Record<string, unknown> | undefined, actor: ActivityEvent['actor_type'] = 'mentor') {
  return { type, actor_type: actor, meta };
}

const META = {
  source: 'db_trigger',
  change_source: 'app',
  booking_id: 'b1',
  mentor_id: 'm1',
  mentee_id: 'e1',
  mentor_name: 'Manav Gupta',
  mentee_name: 'Layla',
  from_status: 'pending',
  to_status: 'accepted',
  scheduled_at: null,
  duration_minutes: null,
};

describe('triggerSummary', () => {
  it('returns null for events that did not come from the trigger (the feed shows summary)', () => {
    expect(triggerSummary(event('request_accepted', undefined), options)).toBeNull();
    expect(triggerSummary(event('request_accepted', {}), options)).toBeNull();
    expect(triggerSummary(event('request_accepted', { ...META, source: 'client' }), options)).toBeNull();
    expect(triggerSummary(event('profile_updated', META), options)).toBeNull();
    expect(triggerSummary(event('favorite_added', META), options)).toBeNull();
  });

  it('maps a mentor accepting a request, with both names from meta', () => {
    expect(triggerSummary(event('request_accepted', META), options)).toEqual({
      key: 'request_accepted',
      params: { mentor: 'Manav Gupta', mentee: 'Layla' },
    });
  });

  it('uses the programme-team variant when an admin answers', () => {
    expect(triggerSummary(event('request_accepted', { ...META, change_source: 'admin' }, 'admin'), options)?.key).toBe('request_accepted_admin');
    expect(triggerSummary(event('request_declined', META, 'admin'), options)?.key).toBe('request_declined_admin');
    expect(triggerSummary(event('request_declined', META, 'mentor'), options)?.key).toBe('request_declined');
  });

  it('formats scheduled_at through the caller (viewer zone) and picks the untimed key without it', () => {
    const timed = triggerSummary(event('booking_confirmed', { ...META, scheduled_at: '2026-10-01T09:00:00Z' }, 'mentee'), options);
    expect(timed).toEqual({ key: 'booking_confirmed', params: { mentor: 'Manav Gupta', mentee: 'Layla', when: 'WHEN(2026-10-01T09:00:00Z)' } });
    expect(triggerSummary(event('booking_confirmed', META, 'system'), options)?.key).toBe('booking_confirmed_untimed');
    expect(triggerSummary(event('booking_confirmed', { ...META, scheduled_at: 'not a date' }), options)?.key).toBe('booking_confirmed_untimed');
    expect(triggerSummary(event('booking_rescheduled', { ...META, scheduled_at: '2026-10-02T09:00:00Z' }), options)?.key).toBe('booking_rescheduled');
    expect(triggerSummary(event('booking_rescheduled', META), options)?.key).toBe('booking_rescheduled_untimed');
    expect(triggerSummary(event('booking_time_requested', { ...META, scheduled_at: '2026-10-02T09:00:00Z' }, 'system'), options)?.key).toBe('booking_time_requested');
    expect(triggerSummary(event('booking_time_requested', META, 'system'), options)?.key).toBe('booking_time_requested_untimed');
  });

  it('includes the recorded duration for completed sessions, never an invented one', () => {
    expect(triggerSummary(event('session_completed', { ...META, duration_minutes: 45 }), options)).toEqual({
      key: 'session_completed',
      params: { mentor: 'Manav Gupta', mentee: 'Layla', minutes: 45 },
    });
    expect(triggerSummary(event('session_completed', META), options)?.key).toBe('session_completed_untimed');
    expect(triggerSummary(event('session_completed', { ...META, duration_minutes: -5 }), options)?.key).toBe('session_completed_untimed');
    expect(triggerSummary(event('session_completed', { ...META, duration_minutes: '45' }), options)?.key).toBe('session_completed_untimed');
  });

  it('says who cancelled', () => {
    expect(triggerSummary(event('booking_canceled', { ...META, change_source: 'cal' }, 'system'), options)?.key).toBe('booking_canceled_cal');
    expect(triggerSummary(event('booking_canceled', META, 'admin'), options)?.key).toBe('booking_canceled_admin');
    expect(triggerSummary(event('booking_canceled', META, 'mentor'), options)?.key).toBe('booking_canceled_mentor');
    expect(triggerSummary(event('booking_canceled', META, 'mentee'), options)?.key).toBe('booking_canceled_mentee');
    expect(triggerSummary(event('booking_canceled', META, 'system'), options)?.key).toBe('booking_canceled');
  });

  it('falls back to neutral names when a party has none', () => {
    const result = triggerSummary(event('request_sent', { ...META, mentor_name: null, mentee_name: '  ' }, 'mentee'), options);
    expect(result).toEqual({ key: 'request_sent', params: { mentor: 'a mentor', mentee: 'a mentee' } });
  });

  it('localises reminders written by the cron (meta.source = cron) and nothing else from it', () => {
    const cron = { source: 'cron', kind: '24h', channels: ['in_app'], booking_id: 'b1' };
    expect(triggerSummary(event('reminder_sent', cron, 'system'), options)?.key).toBe('reminder_sent_24h');
    expect(triggerSummary(event('reminder_sent', { ...cron, kind: '1h' }, 'system'), options)?.key).toBe('reminder_sent_1h');
    expect(triggerSummary(event('reminder_sent', { ...cron, kind: 'weekly' }, 'system'), options)).toBeNull();
    expect(triggerSummary(event('request_sent', cron, 'system'), options)).toBeNull();
  });

  it('covers every trigger type', () => {
    for (const type of TRIGGER_TYPES) {
      const result = triggerSummary(event(type, { ...META, scheduled_at: '2026-10-01T09:00:00Z', duration_minutes: 30 }), options);
      expect(result, type).not.toBeNull();
      expect(TRIGGER_SUMMARY_KEYS).toContain(result!.key);
    }
  });
});

describe('summary strings', () => {
  const enSummaries = (en as { showcase: { activity: { summaries: Record<string, string>; types: Record<string, string> } } }).showcase.activity;
  const arSummaries = (ar as { showcase: { activity: { summaries: Record<string, string>; types: Record<string, string> } } }).showcase.activity;

  it.each(TRIGGER_SUMMARY_KEYS)('%s exists in EN and AR with the same placeholders, AR in Arabic', (key) => {
    const enValue = enSummaries.summaries[key];
    const arValue = arSummaries.summaries[key];
    expect(typeof enValue).toBe('string');
    expect(typeof arValue).toBe('string');
    expect(arValue).toMatch(/[؀-ۿ]/);
    const placeholders = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g), (m) => m[1]).sort();
    expect(placeholders(arValue)).toEqual(placeholders(enValue));
  });

  it('has a type label for the two new Cal types in EN and AR', () => {
    for (const type of ['booking_time_requested', 'booking_time_declined']) {
      expect(typeof enSummaries.types[type]).toBe('string');
      expect(arSummaries.types[type]).toMatch(/[؀-ۿ]/);
    }
  });
});
