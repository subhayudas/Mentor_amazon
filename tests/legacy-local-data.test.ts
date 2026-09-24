import { describe, expect, it } from 'vitest';
import {
  clearLegacyLocalData,
  detectLegacyLocalData,
  legacyKeys,
  type StorageLike,
} from '../client/src/lib/legacyLocalData.ts';

/** Minimal in-memory Storage (insertion-ordered like the browser's). */
class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  keys() {
    return Array.from(this.map.keys()).sort();
  }
}

const json = (v: unknown) => JSON.stringify(v);

function previewBrowser() {
  return new MemoryStorage({
    'mentorconnect.local.bookings': json([
      { id: 'b1', mentor_id: 'manav-gupta', mentee_id: 'm1', goal: 'Plan my move into product management', status: 'pending', created_at: '2026-09-01T10:00:00.000Z' },
    ]),
    'mentorconnect.local.mentees': json([
      { id: 'm1', name: 'Layla', email: 'layla@example.com', organization_name: 'Hope NGO', created_at: '2026-08-31T09:00:00.000Z' },
    ]),
    'mentorconnect.local.events': json([{ id: 'e1', type: 'request_sent' }]),
    'mentorconnect.value.session': json({ id: 'local-m1' }),
    'mentorconnect.value.checklist:layla@example.com': json(['share']),
    menteeId: 'm1',
    menteeEmail: 'layla@example.com',
    menteeName: 'Layla',
    mentorId: 'x',
    mentorEmail: 'x@example.com',
    mentorName: 'X',
    language: 'ar',
    i18nextLng: 'ar',
    'mc.sentRequests': json({ 'manav-gupta': { email: 'layla@example.com', sentAt: '2026-09-01T10:00:00.000Z' } }),
    user: json({ id: 'u1' }),
    'sb-127-auth-token': json({ access_token: 'token' }),
  });
}

describe('detectLegacyLocalData', () => {
  it('finds nothing in a clean browser', () => {
    const result = detectLegacyLocalData(new MemoryStorage({ language: 'en', 'sb-127-auth-token': '{}' }));
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('is empty for a missing storage', () => {
    expect(detectLegacyLocalData(null).total).toBe(0);
    expect(detectLegacyLocalData(undefined).total).toBe(0);
  });

  it('counts requests and registrations and summarises each, newest first', () => {
    const result = detectLegacyLocalData(previewBrowser());
    expect(result.total).toBe(2);
    expect(result.counts).toEqual({ requests: 1, registrations: 1, mentorProfiles: 0, favorites: 0 });
    expect(result.items).toEqual([
      {
        kind: 'request',
        id: 'b1',
        mentorId: 'manav-gupta',
        mentorName: undefined,
        goal: 'Plan my move into product management',
        email: 'layla@example.com',
        createdAt: '2026-09-01T10:00:00.000Z',
      },
      { kind: 'registration', id: 'm1', name: 'Layla', email: 'layla@example.com', organization: 'Hope NGO', createdAt: '2026-08-31T09:00:00.000Z' },
    ]);
  });

  it('counts mentor profiles and favourites and resolves local mentor names', () => {
    const storage = new MemoryStorage({
      'mentorconnect.local.mentors': json([{ id: 'sara-1a2b', name: 'Sara K.', email: 'sara@amazon.com', created_at: '2026-09-02T00:00:00Z' }]),
      'mentorconnect.local.favorites': json([{ id: 'f1', mentee_id: 'm1', mentor_id: 'sara-1a2b', created_at: '2026-09-03T00:00:00Z' }]),
    });
    const result = detectLegacyLocalData(storage);
    expect(result.total).toBe(2);
    expect(result.counts).toEqual({ requests: 0, registrations: 0, mentorProfiles: 1, favorites: 1 });
    expect(result.items[0]).toEqual({ kind: 'favorite', id: 'f1', mentorId: 'sara-1a2b', mentorName: 'Sara K.', createdAt: '2026-09-03T00:00:00Z' });
    expect(result.items[1]).toMatchObject({ kind: 'mentorProfile', name: 'Sara K.' });
  });

  it('ignores activity events and single values (they are not items to resend)', () => {
    const storage = new MemoryStorage({
      'mentorconnect.local.events': json([{ id: 'e1' }, { id: 'e2' }]),
      'mentorconnect.value.session': json({ id: 'x' }),
    });
    expect(detectLegacyLocalData(storage).total).toBe(0);
  });

  it('treats malformed JSON, non-arrays and non-object rows as nothing', () => {
    const storage = new MemoryStorage({
      'mentorconnect.local.bookings': '{not json',
      'mentorconnect.local.mentees': json({ id: 'm1' }),
      'mentorconnect.local.mentors': json([null, 3, 'x', ['nested'], { id: 'ok', name: 'Real' }]),
    });
    const result = detectLegacyLocalData(storage);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ kind: 'mentorProfile', id: 'ok', name: 'Real' });
  });

  it('survives a storage that throws on every read', () => {
    const throwing: StorageLike = {
      get length(): number {
        throw new Error('SecurityError');
      },
      key() {
        throw new Error('SecurityError');
      },
      getItem() {
        throw new Error('SecurityError');
      },
      removeItem() {
        throw new Error('SecurityError');
      },
    };
    expect(detectLegacyLocalData(throwing).total).toBe(0);
    expect(legacyKeys(throwing)).toEqual([]);
    expect(clearLegacyLocalData(throwing)).toEqual([]);
  });
});

describe('clearLegacyLocalData', () => {
  it('removes the local store, single values and legacy role mirrors, and keeps everything else', () => {
    const storage = previewBrowser();
    const removed = clearLegacyLocalData(storage);
    expect(removed.sort()).toEqual(
      [
        'mentorconnect.local.bookings',
        'mentorconnect.local.mentees',
        'mentorconnect.local.events',
        'mentorconnect.value.session',
        'mentorconnect.value.checklist:layla@example.com',
        'menteeId',
        'mentorId',
        'mentorEmail',
        'mentorName',
      ].sort(),
    );
    expect(storage.keys()).toEqual(['i18nextLng', 'language', 'mc.sentRequests', 'menteeEmail', 'menteeName', 'sb-127-auth-token', 'user']);
    expect(detectLegacyLocalData(storage).total).toBe(0);
  });

  it('is idempotent', () => {
    const storage = previewBrowser();
    clearLegacyLocalData(storage);
    expect(clearLegacyLocalData(storage)).toEqual([]);
  });

  it('keeps going when one key cannot be removed', () => {
    const storage = previewBrowser();
    const original = storage.removeItem.bind(storage);
    storage.removeItem = (key: string) => {
      if (key === 'menteeId') throw new Error('locked');
      original(key);
    };
    const removed = clearLegacyLocalData(storage);
    expect(removed).not.toContain('menteeId');
    expect(removed).toContain('mentorconnect.local.bookings');
    expect(storage.getItem('mentorconnect.local.bookings')).toBeNull();
  });
});
