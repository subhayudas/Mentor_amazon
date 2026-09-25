import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The SQL files that redefine the same object must agree (design D11, F36), otherwise
 * re-running one of them silently reverts the other. The real-database proof is the
 * re-run-chain fingerprint (tests/integration/migrations.test.ts); this is the fast check.
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const v2 = read('supabase_setup_v2.sql');
const phase2 = read('supabase_phase2.sql');
const m0002 = read('migrations/0002_production_readiness.sql');
const m0003 = read('migrations/0003_restrict_legacy_writes.sql');

/** The $$…$$ body of `function public.<name>(` in a file (case-insensitive header). */
function body(sql: string, name: string): string {
  const header = new RegExp(`create or replace function public\\.${name}\\(`, 'i');
  const start = sql.search(header);
  if (start < 0) throw new Error(`public.${name} not found`);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return sql.slice(open, close + 2);
}

describe('mirrored SQL', () => {
  it('supabase_setup_v2.sql carries the 0002 guard_booking_update character for character', () => {
    const def = (sql: string) => {
      const s = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_booking_update()');
      return sql.slice(s, sql.indexOf('END $$;', s) + 'END $$;'.length);
    };
    expect(def(v2)).toBe(def(m0002));
  });

  it('0002 and supabase_setup_v2.sql define the same mentors_public columns (with managed_by_programme)', () => {
    const cols = (sql: string) => {
      const s = sql.search(/VIEW public\.mentors_public WITH/);
      return sql.slice(s, sql.indexOf('FROM public.mentors;', s)).replace(/\s+/g, ' ');
    };
    expect(cols(m0002)).toBe(cols(v2));
    expect(cols(v2)).toMatch(/created_at, managed_by_programme $/);
    expect(cols(v2)).not.toMatch(/\b(email|cal_link|linkedin_url)\b/);
  });

  it('supabase_phase2.sql and 0002 define the same my_profile_ids()', () => {
    expect(body(phase2, 'my_profile_ids')).toBe(body(m0002, 'my_profile_ids'));
  });

  it('supabase_phase2.sql no longer defines is_admin() and uses varchar references', () => {
    expect(phase2).not.toMatch(/function public\.is_admin\(/i);
    expect(phase2).not.toMatch(/^\s+(mentee_id|mentor_id|booking_id)\s+uuid/m);
  });

  it('v2 never grants what 0003 revokes', () => {
    expect(v2).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.get_or_create_mentee\(text, text\) TO [^;]*\banon\b/);
    expect(v2).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.notify_booking_event\(text, text\) TO [^;]*\banon\b/);
    expect(m0003).toMatch(/REVOKE INSERT ON public\.bookings FROM authenticated/);
  });

  it('the 0002 events insert policy is the tightened one in both files: own feed only, with size limits (R1-12)', () => {
    const policy = (sql: string) => {
      const start = sql.search(/create policy "events: append as self"/i);
      return sql.slice(start, sql.indexOf(';', start)).replace(/\s+/g, ' ').toLowerCase();
    };
    expect(policy(phase2)).toBe(policy(m0002));
    const tightened = /with check \(\(public\.is_admin\(\) or \(actor_id = any \(public\.my_profile_ids\(\)\) and visible_to <@ public\.my_profile_ids\(\)\)\)/;
    expect(policy(m0002)).toMatch(tightened);
    expect(policy(m0002)).toMatch(/and length\(summary\) <= 500 and length\(type\) <= 64 and length\(coalesce\(actor_name, ''\)\) <= 200 and pg_column_size\(meta\) <= 8192\)$/);
  });

  // Objects both supabase_setup_v2.sql and 0002 define: a v2 re-run must never revert a fix.
  const definition = (sql: string, name: string) => {
    const s0 = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    if (s0 < 0) throw new Error(`public.${name} not found`);
    return sql.slice(s0, sql.indexOf('END $$;', s0) + 'END $$;'.length);
  };
  it.each([
    ['guard_users_role_columns', 'profile_id may only name your own profile (R1-07)'],
    ['block_sso_password_change', 'an Amazon account cannot set a password (R1-37)'],
    ['guard_mentor_derived_columns', 'reserved ids and admin-only identity columns (R1-09)'],
    ['guard_profile_id_namespace', 'mentor and mentee ids never collide (R1-07)'],
    ['notify_booking_event', 'programme-managed fan-out, dashboard link (R1-19, R1-23)'],
    ['get_or_create_mentee', 'a registered address stays with its account (R1-08)'],
  ])('supabase_setup_v2.sql and 0002 carry the same %s (%s)', (name) => {
    expect(definition(v2, name)).toBe(definition(m0002, name));
  });

  it('supabase_setup_v2.sql and 0002 clear the same profile links made before the guard, and say so (R2-13)', () => {
    const block = (sql: string) => {
      const s0 = sql.indexOf('-- Links made before this guard existed (R2-13).');
      if (s0 < 0) throw new Error('the R2-13 remediation block is missing');
      return sql.slice(s0, sql.indexOf('END $$;', s0) + 'END $$;'.length);
    };
    expect(block(v2)).toBe(block(m0002));
    expect(block(m0002)).toMatch(/UPDATE public\.users u SET profile_id = NULL/);
    expect(block(m0002)).toMatch(/RAISE WARNING 'users\.profile_id links cleared/);
    // It runs right after the guard, so a link can never be made again once it is cleared.
    const guard = m0002.indexOf('CREATE TRIGGER users_guard_role_columns');
    expect(guard).toBeGreaterThan(0);
    expect(m0002.indexOf('-- Links made before this guard existed (R2-13).')).toBeGreaterThan(guard);
  });

  it('the storage policies are identical in supabase_setup_v2.sql and 0002, with no public list policy (R1-11)', () => {
    const policies = (sql: string) => {
      const s0 = sql.indexOf('DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;');
      const end = sql.indexOf(';', sql.indexOf('CREATE POLICY "Users can delete their own files"', s0)) + 1;
      return sql.slice(s0, end);
    };
    expect(policies(m0002)).toBe(policies(v2));
    expect(policies(v2)).not.toMatch(/FOR SELECT TO public/);
    expect(policies(v2)).toMatch(/split_part\(name, '\/', 2\) = auth\.uid\(\)::text/);
  });

  it('the reserved mentor ids are the five featured ids of 0004, in both v2 and 0002 (R1-09)', () => {
    const uuids = (text: string) => (text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []).sort();
    const reserved = (sql: string) => {
      const s0 = sql.indexOf('INSERT INTO public.reserved_mentor_ids');
      return sql.slice(s0, sql.indexOf(';', s0));
    };
    const seed = read('migrations/0004_seed_featured_mentors.sql');
    const seeded = [...new Set(uuids(seed.slice(seed.indexOf('INSERT INTO public.mentors'))))];
    expect(seeded).toHaveLength(5);
    expect(uuids(reserved(v2))).toEqual(seeded);
    expect(uuids(reserved(m0002))).toEqual(seeded);
  });

  it('0002 says what it tightens and lists its preconditions readably (R1-32, R1-27)', () => {
    const header = m0002.slice(0, m0002.indexOf('BEGIN;'));
    expect(header).not.toMatch(/only ADDS/);
    expect(header).toMatch(/It is not purely additive/);
    expect(header).toMatch(/image\/heic/);
    expect(header).toMatch(/Keep the time between this file and 0003 short/);
    expect(m0002).not.toMatch(/v_problems := v_problems \|\|/);
  });
});
