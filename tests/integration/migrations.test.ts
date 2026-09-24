import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { mkBooking, mkMentee, mkMentor } from './fixtures.ts';
import { createScratchDb, SQL, type ScratchDb } from './scratchDb.ts';

/**
 * I1 (migration and re-run chain), I2 (phase-2 repair) and the I6 pre-check, each on a
 * throwaway database (drizzle push of shared/schema.ts + Supabase stand-ins), never the
 * shared one. Design §6.3 and amendment AM1.
 */
const open: ScratchDb[] = [];
async function scratch(push = true): Promise<ScratchDb> {
  const db = await createScratchDb({ push });
  open.push(db);
  return db;
}
afterEach(async () => {
  while (open.length) await open.pop()!.drop();
});

function diff(a: string[], b: string[]): { onlyInA: string[]; onlyInB: string[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  return { onlyInA: a.filter((l) => !sb.has(l)), onlyInB: b.filter((l) => !sa.has(l)) };
}

describeDb('I1 migrations and the re-run chain', () => {
  it('(a) the phase-2 file as committed at a4f3fbd cannot run on the drizzle base (DB-1)', async () => {
    const db = await scratch();
    await db.apply(SQL.v2);
    await expect(db.apply(SQL.phase2Old)).rejects.toThrow(/incompatible types: uuid and character varying/);
  });

  it('(b)–(e) base → v2 → phase2 → 0002 → 0003 → 0004 applies; every file is idempotent; the full chain twice and v2 alone change nothing', async () => {
    const db = await scratch();
    for (const f of [SQL.v2, SQL.phase2, SQL.m0002]) await db.apply(f);
    const expand = await db.fingerprint();
    expect(expand.some((l) => l.startsWith('function create_booking_request('))).toBe(true);

    await db.apply(SQL.m0002);
    expect(diff(expand, await db.fingerprint()), '0002 twice').toEqual({ onlyInA: [], onlyInB: [] });

    await db.apply(SQL.m0003);
    const contract = await db.fingerprint();
    expect(contract).not.toEqual(expand);
    await db.apply(SQL.m0003);
    expect(diff(contract, await db.fingerprint()), '0003 twice').toEqual({ onlyInA: [], onlyInB: [] });

    await db.apply(SQL.m0004);
    await db.apply(SQL.m0004);
    expect(diff(contract, await db.fingerprint()), '0004 is data only').toEqual({ onlyInA: [], onlyInB: [] });

    // (e) a v2 re-run alone reverts nothing (guard_booking_update, revoked grants, policies…)
    await db.apply(SQL.v2);
    expect(diff(contract, await db.fingerprint()), 'v2 re-run alone').toEqual({ onlyInA: [], onlyInB: [] });

    // (d) the full chain again
    for (const f of [SQL.v2, SQL.phase2, SQL.m0002, SQL.m0003]) await db.apply(f);
    expect(diff(contract, await db.fingerprint()), 'v2 → phase2 → 0002 → 0003 twice').toEqual({ onlyInA: [], onlyInB: [] });
    const [{ value }] = await db.sql<{ value: string }[]>`select value from public.mc_settings where key = 'legacy_booking_writes'`;
    expect(value).toBe('blocked');
    const ledger = await db.sql<{ version: string }[]>`select version from public.schema_migrations order by 1`;
    expect(ledger.map((r) => r.version)).toEqual(['0002_production_readiness', '0003_restrict_legacy_writes', '0004_seed_featured_mentors']);
  });

  it('re-running 0002 after 0003 keeps the contract (the rollout switch is written only when absent)', async () => {
    const db = await scratch();
    for (const f of [SQL.v2, SQL.phase2, SQL.m0002, SQL.m0003, SQL.m0002, SQL.phase2]) await db.apply(f);
    const [{ value }] = await db.sql<{ value: string }[]>`select value from public.mc_settings where key = 'legacy_booking_writes'`;
    expect(value).toBe('blocked');
    const [grants] = await db.sql<{ anon_insert: boolean; auth_insert: boolean; anon_mentee_fn: boolean }[]>`
      select has_table_privilege('anon', 'public.bookings', 'INSERT') as anon_insert,
             has_table_privilege('authenticated', 'public.bookings', 'INSERT') as auth_insert,
             has_function_privilege('anon', 'public.get_or_create_mentee(text,text)', 'EXECUTE') as anon_mentee_fn`;
    expect(grants).toEqual({ anon_insert: false, auth_insert: false, anon_mentee_fn: false });
  });

  it('a failing pre-check leaves nothing behind (one transaction)', async () => {
    const db = await scratch();
    await db.apply(SQL.v2);
    await db.apply(SQL.phase2);
    const m = await mkMentor(db.sql);
    const e = await mkMentee(db.sql);
    await mkBooking(db.sql, m.id, e.id, { status: 'pending', mentee_rating: 9 });
    await expect(db.apply(SQL.m0002)).rejects.toThrow(/rating outside 1\.\.5/);
    const [{ ledger, fn }] = await db.sql<{ ledger: string | null; fn: string | null }[]>`
      select to_regclass('public.schema_migrations')::text as ledger,
             to_regprocedure('public.create_booking_request(text,text,text,text)')::text as fn`;
    expect({ ledger, fn }).toEqual({ ledger: null, fn: null });
  });
});

describeDb('I2 phase-2 repair', () => {
  it('0002 on base + v2 without phase2 creates the four tables and reaches the same catalog as phase2 + 0002', async () => {
    const withoutPhase2 = await scratch();
    await withoutPhase2.apply(SQL.v2);
    await withoutPhase2.apply(SQL.m0002);
    const cols = await withoutPhase2.sql<{ c: string }[]>`
      select table_name || '.' || column_name || ':' || data_type as c from information_schema.columns
      where table_schema = 'public' and table_name in ('mentee_favorites', 'booking_reminders')
        and column_name in ('mentee_id', 'mentor_id', 'booking_id') order by 1`;
    expect(cols.map((r) => r.c)).toEqual([
      'booking_reminders.booking_id:character varying',
      'mentee_favorites.mentee_id:character varying',
      'mentee_favorites.mentor_id:character varying',
    ]);

    const normal = await scratch();
    for (const f of [SQL.v2, SQL.phase2, SQL.m0002]) await normal.apply(f);
    expect(diff(await normal.fingerprint(), await withoutPhase2.fingerprint())).toEqual({ onlyInA: [], onlyInB: [] });
  });

  it('uuid-typed reference columns without FKs are converted, FKs added, data kept', async () => {
    const db = await scratch();
    await db.apply(SQL.v2);
    // A hand-edited project: phase-2 tables whose reference columns are uuid and carry no FKs.
    await db.apply(`
      create table public.mentee_favorites (id uuid primary key default gen_random_uuid(), mentee_id uuid not null,
        mentor_id uuid not null, created_at timestamptz not null default now(), unique (mentee_id, mentor_id));
      create table public.booking_reminders (id uuid primary key default gen_random_uuid(), booking_id uuid not null,
        kind text not null check (kind in ('24h', '1h')), sent_at timestamptz not null default now(),
        channels text[] not null default '{}', unique (booking_id, kind));`);
    const mentorId = randomUUID();
    const menteeId = randomUUID();
    const bookingId = randomUUID();
    await mkMentor(db.sql, { id: mentorId });
    await mkMentee(db.sql, { id: menteeId });
    await mkBooking(db.sql, mentorId, menteeId, { id: bookingId });
    await db.sql`insert into public.mentee_favorites (mentee_id, mentor_id) values (${menteeId}, ${mentorId})`;
    await db.sql`insert into public.booking_reminders (booking_id, kind) values (${bookingId}, '24h')`;

    await db.apply(SQL.m0002);

    const types = await db.sql<{ t: string }[]>`
      select data_type as t from information_schema.columns
      where table_schema = 'public' and table_name in ('mentee_favorites', 'booking_reminders')
        and column_name in ('mentee_id', 'mentor_id', 'booking_id')`;
    expect(types.every((r) => r.t === 'character varying')).toBe(true);
    const fks = await db.sql<{ conname: string }[]>`
      select conname from pg_constraint where contype = 'f'
        and conrelid in ('public.mentee_favorites'::regclass, 'public.booking_reminders'::regclass) order by 1`;
    expect(fks.map((f) => f.conname)).toEqual([
      'booking_reminders_booking_id_fkey',
      'mentee_favorites_mentee_id_fkey',
      'mentee_favorites_mentor_id_fkey',
    ]);
    const [fav] = await db.sql`select mentee_id, mentor_id from public.mentee_favorites`;
    expect(fav).toEqual({ mentee_id: menteeId, mentor_id: mentorId });
    const [rem] = await db.sql`select booking_id from public.booking_reminders`;
    expect(rem).toEqual({ booking_id: bookingId });
    // and the repaired database is now idempotent like any other
    const once = await db.fingerprint();
    await db.apply(SQL.m0002);
    expect(diff(once, await db.fingerprint())).toEqual({ onlyInA: [], onlyInB: [] });
  });

  it('a reference to a missing row aborts 0002 and names it', async () => {
    const db = await scratch();
    await db.apply(SQL.v2);
    await db.apply(`create table public.mentee_favorites (id uuid primary key default gen_random_uuid(), mentee_id uuid not null,
      mentor_id uuid not null, created_at timestamptz not null default now(), unique (mentee_id, mentor_id));`);
    const ghost = randomUUID();
    const m = await mkMentor(db.sql, { id: randomUUID() });
    await db.sql`insert into public.mentee_favorites (mentee_id, mentor_id) values (${ghost}, ${m.id})`;
    await expect(db.apply(SQL.m0002)).rejects.toThrow(new RegExp(`mentee_favorites\\.mentee_id has values with no row in public\\.mentees: ${ghost}`));
  });
});

describeDb('I6 pre-check: duplicate Cal uids', () => {
  it('aborts 0002 with a message listing the duplicates', async () => {
    const db = await scratch();
    await db.apply(SQL.v2);
    await db.apply(SQL.phase2);
    const m = await mkMentor(db.sql);
    const e = await mkMentee(db.sql);
    await mkBooking(db.sql, m.id, e.id, { status: 'confirmed', cal_event_uri: 'dupUid123' });
    await mkBooking(db.sql, m.id, e.id, { status: 'confirmed', cal_event_uri: 'dupUid123' });
    await expect(db.apply(SQL.m0002)).rejects.toThrow(/duplicate bookings\.cal_event_uri values: dupUid123 \(2 rows\)/);
  });
});
