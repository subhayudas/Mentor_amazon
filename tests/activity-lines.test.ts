import { describe, expect, it } from 'vitest';
import en from '../client/src/locales/en.json';
import ar from '../client/src/locales/ar.json';
import type { ActivityEvent } from '../client/src/lib/database.ts';
import { CLIENT_SUMMARY_KEYS, clientSummary } from '../client/src/pages/dashboard/activityLines.ts';

/**
 * Client-written activity lines render in the READER's language (R1-46, R1-74): by type, with
 * names from `meta` or the row's actor name, never the sentence stored in the writer's language.
 */
type Row = Pick<ActivityEvent, 'type' | 'actor_name' | 'summary' | 'meta'>;
const row = (type: ActivityEvent['type'], extra: Partial<Row> = {}): Row => ({ type, actor_name: undefined, summary: 'stored line', meta: undefined, ...extra });

describe('clientSummary', () => {
  it('renders registrations and profile saves from the actor name (old rows included)', () => {
    expect(clientSummary(row('mentee_registered', { actor_name: 'Layla', summary: 'انضم Layla كمتدرب' }))).toEqual({ key: 'menteeRegistered', params: { name: 'Layla' } });
    expect(clientSummary(row('mentor_registered', { actor_name: 'Omar' }))).toEqual({ key: 'mentorRegistered', params: { name: 'Omar' } });
    expect(clientSummary(row('profile_updated', { actor_name: 'Old Name', meta: { source: 'client', name: 'Layla K.' } }))).toEqual({ key: 'profileUpdated', params: { name: 'Layla K.' } });
  });

  it('a calendar save needs no name', () => {
    expect(clientSummary(row('calendar_updated', { summary: 'تم حفظ إعدادات التقويم وساعات العمل' }))).toEqual({ key: 'calendarUpdated', params: {} });
  });

  it('favourites take the mentor from meta, else from the old English line, else say "a mentor"', () => {
    expect(clientSummary(row('favorite_added', { meta: { source: 'client', mentor_name: 'Manav Gupta' } }))).toEqual({ key: 'favoriteAdded', params: { mentor: 'Manav Gupta' } });
    expect(clientSummary(row('favorite_removed', { summary: 'Removed Nick Ramil from favourites' }))).toEqual({ key: 'favoriteRemoved', params: { mentor: 'Nick Ramil' } });
    expect(clientSummary(row('favorite_added', { summary: 'Saved a mentor as a favourite' }))).toEqual({ key: 'favoriteAddedUnnamed', params: {} });
    expect(clientSummary(row('favorite_removed', { summary: 'something else' }))).toEqual({ key: 'favoriteRemovedUnnamed', params: {} });
  });

  it('keeps the stored line when there is no name to say, and for types it does not own', () => {
    expect(clientSummary(row('profile_updated'))).toBeNull();
    expect(clientSummary(row('request_sent', { actor_name: 'Layla' }))).toBeNull();
    expect(clientSummary(row('mentor_listed', { actor_name: 'Admin' }))).toBeNull();
  });
});

describe('every client summary key exists in both languages with the same placeholders', () => {
  const summaries = (bundle: unknown) => (bundle as { showcase: { activity: { summaries: Record<string, string> } } }).showcase.activity.summaries;
  const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
  for (const key of CLIENT_SUMMARY_KEYS) {
    it(key, () => {
      expect(typeof summaries(en)[key]).toBe('string');
      expect(typeof summaries(ar)[key]).toBe('string');
      expect(summaries(ar)[key]).not.toBe(summaries(en)[key]);
      expect(placeholders(summaries(ar)[key])).toEqual(placeholders(summaries(en)[key]));
    });
  }
});
