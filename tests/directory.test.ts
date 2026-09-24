import { describe, expect, it, vi } from 'vitest';

import { FEATURED_MENTORS, overlayFeatured, resolveShowcaseMentor, type FeaturedMentor } from '../client/src/data/featuredMentors.ts';
import type { PublicMentor } from '../client/src/lib/database.ts';
import { directoryFields, featuredPageState, mergeDirectory, staticFeaturedEntry } from '../client/src/lib/directory.ts';

const manav = FEATURED_MENTORS.find((m) => m.id === 'manav-gupta') as FeaturedMentor;
const ghita = FEATURED_MENTORS.find((m) => m.id === 'ghita-elidrissi') as FeaturedMentor;

/** A `mentors_public` row as the seed (migrations/0004) writes it for a curated mentor. */
function seededRow(m: FeaturedMentor, patch: Partial<PublicMentor> = {}): PublicMentor {
  return {
    id: m.dbId,
    name: m.name,
    name_ar: m.name_ar,
    company: m.company,
    company_ar: m.company_ar,
    position: m.position,
    position_ar: m.position_ar,
    timezone: m.timezone,
    country: m.country,
    photo_url: m.photo_url,
    bio: m.bio,
    bio_ar: m.bio_ar,
    expertise: m.expertise,
    expertise_ar: m.expertise_ar,
    industries: m.industries,
    industries_ar: m.industries_ar,
    languages_spoken: m.languages_spoken,
    mentorship_preference: m.mentorship_preference,
    is_available: true,
    average_rating: '0.00',
    total_ratings: 0,
    created_at: '2026-09-24T10:00:00',
    ...patch,
  };
}

const onboarded: PublicMentor = {
  id: '5b1f7a52-0a8b-4f0e-9d1e-3b4a0c9f1e22',
  name: 'Dana Mentor',
  timezone: 'Europe/London',
  bio: 'Operations leader. Helps with scaling teams.',
  expertise: ['Operations'],
  industries: ['Logistics'],
  languages_spoken: ['English'],
  is_available: true,
  average_rating: '4.50',
  total_ratings: 2,
  created_at: '2026-09-20T09:00:00',
};

describe('mergeDirectory: database mode', () => {
  it('seeded: exactly one card per curated mentor, id = dbId, linked by slug, DB rows kept', () => {
    const dbRows = [...FEATURED_MENTORS.map((m) => seededRow(m)), onboarded];
    const list = mergeDirectory({ isLocal: false, dbRows, featured: FEATURED_MENTORS });
    expect(list).toHaveLength(6);
    for (const m of FEATURED_MENTORS) {
      const cards = list.filter((d) => d.slug === m.id);
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe(m.dbId);
      expect(cards[0].source).toBe('db');
      expect(cards[0].bookable).toBe(true);
      expect(directoryFields(cards[0]).href).toBe(m.id);
    }
    const dana = list.find((d) => d.id === onboarded.id)!;
    expect(dana).toMatchObject({ source: 'db', bookable: true, name: 'Dana Mentor' });
    expect(dana.slug).toBeUndefined();
    expect(directoryFields(dana).href).toBe(onboarded.id);
  });

  it('unseeded: the five static entries, not bookable, no demo ratings, not "accepting"', () => {
    const list = mergeDirectory({ isLocal: false, dbRows: [onboarded], featured: FEATURED_MENTORS });
    expect(list).toHaveLength(6);
    const statics = list.filter((d) => d.source === 'featured');
    expect(statics.map((d) => d.id).sort()).toEqual(FEATURED_MENTORS.map((m) => m.id).sort());
    for (const d of statics) {
      expect(d).toMatchObject({ bookable: false, is_available: false, total_ratings: 0, average_rating: '0' });
      expect(d.slug).toBe(d.id);
      expect(d.availabilityUnknown).toBeUndefined();
      // No showcase extras leak onto a card.
      expect(d).not.toHaveProperty('testimonials');
      expect(d).not.toHaveProperty('bookings');
      expect(d).not.toHaveProperty('rating');
    }
  });

  it('empty database: still the landing five (never emptier than the landing)', () => {
    const list = mergeDirectory({ isLocal: false, dbRows: [], featured: FEATURED_MENTORS });
    expect(list.map((d) => d.id)).toEqual(FEATURED_MENTORS.map((m) => m.id));
    expect(list.every((d) => !d.bookable)).toBe(true);
  });

  it('partially seeded: seeded ones come from the DB, the rest are static, no duplicates', () => {
    const list = mergeDirectory({ isLocal: false, dbRows: [seededRow(manav)], featured: FEATURED_MENTORS });
    expect(list).toHaveLength(5);
    expect(list.filter((d) => d.slug === 'manav-gupta')).toHaveLength(1);
    expect(list.find((d) => d.slug === 'manav-gupta')).toMatchObject({ id: manav.dbId, source: 'db', bookable: true });
    expect(list.filter((d) => d.source === 'featured')).toHaveLength(4);
  });

  it('DB error: the five static entries flagged availabilityUnknown', () => {
    const list = mergeDirectory({ isLocal: false, dbRows: undefined, featured: FEATURED_MENTORS, dbFailed: true });
    expect(list).toHaveLength(5);
    expect(list.every((d) => d.source === 'featured' && !d.bookable && d.availabilityUnknown === true)).toBe(true);
    expect(directoryFields(list[0]).availabilityUnknown).toBe(true);
  });

  it('DB wins on overlap: edited name, photo, availability and real ratings replace the curated values', () => {
    const edited = seededRow(ghita, {
      name: 'Ghita E.',
      photo_url: 'https://example.test/ghita.png',
      is_available: false,
      average_rating: '4.00',
      total_ratings: 3,
      expertise: ['Syndicates'],
      languages_spoken: ['French'],
      country: 'Morocco',
    });
    const [card] = mergeDirectory({ isLocal: false, dbRows: [edited], featured: [ghita] });
    expect(card).toMatchObject({
      id: ghita.dbId,
      slug: 'ghita-elidrissi',
      name: 'Ghita E.',
      photo_url: 'https://example.test/ghita.png',
      is_available: false,
      bookable: false,
      average_rating: '4.00',
      total_ratings: 3,
      expertise: ['Syndicates'],
      languages_spoken: ['French'],
      country: 'Morocco',
    });
    // The curated copy still supplies what the DB row does not own.
    expect(card.company).toBe(ghita.company);
  });

  it('dedupes repeated DB rows by id', () => {
    const list = mergeDirectory({ isLocal: false, dbRows: [onboarded, { ...onboarded }], featured: [] });
    expect(list).toHaveLength(1);
  });

  it('a non-available DB mentor is listed but not bookable', () => {
    const [row] = mergeDirectory({ isLocal: false, dbRows: [{ ...onboarded, is_available: false }], featured: [] });
    expect(row.bookable).toBe(false);
  });
});

describe('mergeDirectory: local (demo) mode', () => {
  it('browser mentors first, then the curated five with their showcase data, deduped by id', () => {
    const local: PublicMentor = { ...onboarded, id: 'dana-mentor-1a2b' };
    const list = mergeDirectory({ isLocal: true, localRows: [local, { ...local }], featured: FEATURED_MENTORS });
    expect(list.map((d) => d.id)).toEqual(['dana-mentor-1a2b', ...FEATURED_MENTORS.map((m) => m.id)]);
    expect(list[0]).toMatchObject({ source: 'local', bookable: true });
    const featuredCard = list.find((d) => d.id === 'manav-gupta')!;
    expect(featuredCard).toMatchObject({ source: 'featured', slug: 'manav-gupta', bookable: true, total_ratings: manav.total_ratings });
  });

  it('ignores DB rows entirely', () => {
    const list = mergeDirectory({ isLocal: true, dbRows: [onboarded], featured: [manav] });
    expect(list.map((d) => d.id)).toEqual(['manav-gupta']);
  });
});

describe('overlayFeatured / staticFeaturedEntry', () => {
  it('keeps the slug as id and records the row id as dbId', () => {
    const merged = overlayFeatured(seededRow(manav, { name: 'Manav G.' }), manav);
    expect(merged.id).toBe('manav-gupta');
    expect(merged.dbId).toBe(manav.dbId);
    expect(merged.name).toBe('Manav G.');
    expect(merged.session).toBe(manav.session);
    expect(merged.faq).toBe(manav.faq);
  });

  it('an empty display column in the row keeps the curated copy', () => {
    const merged = overlayFeatured(seededRow(manav, { photo_url: undefined, name: '' }), manav);
    expect(merged.photo_url).toBe(manav.photo_url);
    expect(merged.name).toBe(manav.name);
  });

  it('an empty Arabic name or bio keeps the curated translation while the English is unchanged', () => {
    const merged = overlayFeatured(seededRow(manav, { name_ar: '', bio_ar: undefined }), manav);
    expect(merged.name_ar).toBe(manav.name_ar);
    expect(merged.bio_ar).toBe(manav.bio_ar);
  });

  it('an empty Arabic name or bio is left empty once the English was edited (the page falls back to it)', () => {
    const merged = overlayFeatured(seededRow(manav, { name: 'Manav G.', name_ar: '', bio: 'A new bio.', bio_ar: '  ' }), manav);
    expect(merged.name_ar).toBe('');
    expect(merged.bio_ar).toBe('');
    const kept = overlayFeatured(seededRow(manav, { name_ar: 'مناف' }), manav);
    expect(kept.name_ar).toBe('مناف');
  });

  it('static entries never carry fabricated ratings', () => {
    const entry = staticFeaturedEntry(manav);
    expect(entry.total_ratings).toBe(0);
    expect(entry.average_rating).toBe('0');
  });
});

describe('directoryFields defaults', () => {
  it('a plain PublicMentor is a DB row, bookable when available', () => {
    expect(directoryFields(onboarded)).toEqual({ href: onboarded.id, slug: undefined, source: 'db', bookable: true, availabilityUnknown: false });
    expect(directoryFields({ ...onboarded, is_available: false }).bookable).toBe(false);
  });
});

describe('resolveShowcaseMentor', () => {
  it('database mode: curated mentors by slug or db id only, never browser storage', () => {
    const getItem = vi.fn(() => null);
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn(), removeItem: vi.fn() });
    expect(resolveShowcaseMentor('manav-gupta', false)?.id).toBe('manav-gupta');
    expect(resolveShowcaseMentor(manav.dbId, false)?.id).toBe('manav-gupta');
    expect(resolveShowcaseMentor(onboarded.id, false)).toBeUndefined();
    expect(resolveShowcaseMentor('nope', false)).toBeUndefined();
    expect(resolveShowcaseMentor(undefined, false)).toBeUndefined();
    expect(getItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('local mode: curated first, then a mentor saved in this browser', () => {
    const saved = { ...onboarded, id: 'dana-mentor-1a2b', cal_link: 'dana/30min' };
    const store: Record<string, string> = { 'mentorconnect.local.mentors': JSON.stringify([saved]) };
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => void (store[key] = value),
      removeItem: (key: string) => void delete store[key],
    });
    expect(resolveShowcaseMentor('manav-gupta', true)?.id).toBe('manav-gupta');
    const local = resolveShowcaseMentor('dana-mentor-1a2b', true);
    expect(local).toMatchObject({ id: 'dana-mentor-1a2b', dbId: 'dana-mentor-1a2b', cal_link: 'dana/30min', testimonials: [] });
    expect(resolveShowcaseMentor('nope', true)).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe('featuredPageState', () => {
  it('local mode: the showcase as designed, requests by entry id', () => {
    const state = featuredPageState({ isLocal: true, featured: manav, query: { status: 'pending' } });
    expect(state).toMatchObject({ kind: 'local', requestId: 'manav-gupta', bookable: true, canFavorite: true, showShowcaseProof: true });
  });

  it('loading: nothing actionable yet', () => {
    const state = featuredPageState({ isLocal: false, featured: manav, query: { status: 'pending' } });
    expect(state).toMatchObject({ kind: 'loading', bookable: false, canFavorite: false, showShowcaseProof: false, accepting: null, requestId: manav.dbId });
  });

  it('db: overlaid row, bookable and favouritable only while accepting', () => {
    const open = featuredPageState({ isLocal: false, featured: manav, query: { status: 'success', data: seededRow(manav) } });
    expect(open).toMatchObject({ kind: 'db', bookable: true, canFavorite: true, accepting: true, requestId: manav.dbId, showShowcaseProof: false });
    const closed = featuredPageState({ isLocal: false, featured: manav, query: { status: 'success', data: seededRow(manav, { is_available: false }) } });
    expect(closed).toMatchObject({ kind: 'db', bookable: false, canFavorite: false, accepting: false });
    expect(closed.mentor.is_available).toBe(false);
  });

  it('static (not seeded yet): opening soon, no Book, no heart', () => {
    const state = featuredPageState({ isLocal: false, featured: manav, query: { status: 'success', data: null } });
    expect(state).toMatchObject({ kind: 'static', bookable: false, canFavorite: false, accepting: null });
  });

  it('without a DB row (loading, not seeded, error) the page never sees the demo ratings (D14)', () => {
    expect(Number(manav.total_ratings)).toBeGreaterThan(0);
    for (const query of [{ status: 'pending' }, { status: 'success', data: null }, { status: 'error' }] as const) {
      const { mentor } = featuredPageState({ isLocal: false, featured: manav, query });
      expect(mentor).toMatchObject({ total_ratings: 0, average_rating: '0', ratings: 0, rating: '', bookings: '', testimonials: [] });
      expect(JSON.stringify(mentor)).not.toContain('412');
    }
  });

  it('db: a row without rating columns does not inherit the demo numbers', () => {
    const { average_rating: _a, total_ratings: _t, ...bare } = seededRow(manav);
    const { mentor } = featuredPageState({ isLocal: false, featured: manav, query: { status: 'success', data: bare as PublicMentor } });
    expect(mentor).toMatchObject({ total_ratings: 0, average_rating: '0', ratings: 0, testimonials: [] });
    const [card] = mergeDirectory({ isLocal: false, dbRows: [bare as PublicMentor], featured: [manav] });
    expect(card).toMatchObject({ total_ratings: 0, average_rating: '0' });
  });

  it('the curated FAQ has an Arabic pair for every question', () => {
    for (const m of FEATURED_MENTORS) {
      for (const f of m.faq) {
        expect(f.q_ar?.trim(), f.q).toBeTruthy();
        expect(f.a_ar?.trim(), f.q).toBeTruthy();
        expect(f.q_ar).toMatch(/؟$/);
      }
    }
  });

  it('error: static page, Book disabled', () => {
    const state = featuredPageState({ isLocal: false, featured: manav, query: { status: 'error' } });
    expect(state).toMatchObject({ kind: 'error', bookable: false, canFavorite: false });
  });

  it('curated mentors are programme-managed unless their row was handed over', () => {
    expect(featuredPageState({ isLocal: false, featured: manav, query: { status: 'success', data: seededRow(manav) } }).programmeManaged).toBe(true);
    const handedOver = { ...seededRow(manav), managed_by_programme: false } as PublicMentor;
    expect(featuredPageState({ isLocal: false, featured: manav, query: { status: 'success', data: handedOver } }).programmeManaged).toBe(false);
    expect(featuredPageState({ isLocal: true, featured: manav, query: { status: 'pending' } }).programmeManaged).toBe(true);
  });
});
