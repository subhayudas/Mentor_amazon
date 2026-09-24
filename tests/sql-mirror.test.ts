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

  it('the 0002 events insert policy is the tightened one in both files', () => {
    const tightened = /with check \(public\.is_admin\(\) or \(actor_id = any \(public\.my_profile_ids\(\)\) and visible_to <@ public\.my_profile_ids\(\)\)\)/i;
    expect(phase2).toMatch(tightened);
    expect(m0002).toMatch(tightened);
  });
});
