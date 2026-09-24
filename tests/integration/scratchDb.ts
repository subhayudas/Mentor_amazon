import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { connect, type Sql } from './sql.ts';
import { TEST_DB_URL } from './env.ts';

const run = promisify(execFile);
export const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Repo SQL files in their apply order (paths relative to the repo root). */
export const SQL = {
  stubs: 'scripts/db/supabase-stubs.sql',
  v2: 'supabase_setup_v2.sql',
  phase2: 'supabase_phase2.sql',
  phase2Old: 'tests/integration/fixtures/supabase_phase2.a4f3fbd.sql',
  m0002: 'migrations/0002_production_readiness.sql',
  m0003: 'migrations/0003_restrict_legacy_writes.sql',
  m0004: 'migrations/0004_seed_featured_mentors.sql',
  fingerprint: 'scripts/db/fingerprint.sql',
} as const;

export function readSql(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8');
}

export interface ScratchDb {
  name: string;
  url: string;
  sql: Sql;
  /** Run a repo SQL file (or raw SQL) as one simple-protocol script, like the SQL editor does. */
  apply(fileOrSql: string): Promise<void>;
  fingerprint(): Promise<string[]>;
  drop(): Promise<void>;
}

/**
 * A throwaway database on the local server with Supabase's auth/storage/extensions stand-ins
 * (scripts/db/supabase-stubs.sql) and, unless `push: false`, the drizzle base schema, so the
 * migration suites never touch the shared database.
 */
export async function createScratchDb(opts: { push?: boolean } = {}): Promise<ScratchDb> {
  const name = `mc_scratch_${randomBytes(5).toString('hex')}`;
  const admin = connect(TEST_DB_URL, 1);
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  const url = new URL(TEST_DB_URL);
  url.pathname = `/${name}`;
  // One connection: the SQL files carry their own BEGIN/COMMIT.
  const sql = connect(url.toString(), 1);

  const apply = async (fileOrSql: string) => {
    const text = fileOrSql.endsWith('.sql') && !fileOrSql.includes('\n') ? readSql(fileOrSql) : fileOrSql;
    try {
      await sql.unsafe(text).simple();
    } catch (err) {
      // A failed script stops inside its own BEGIN; end that transaction like the SQL editor does.
      await sql.unsafe('rollback').simple().catch(() => undefined);
      const e = err as { message?: string; detail?: string };
      if (e.detail && e.message && !e.message.includes(e.detail)) e.message = `${e.message} — ${e.detail}`;
      throw err;
    }
  };
  await apply(SQL.stubs);
  if (opts.push !== false) {
    await run('npx', ['drizzle-kit', 'push', '--force', '--strict=false'], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url.toString() },
      maxBuffer: 16 * 1024 * 1024,
    });
  }
  return {
    name,
    url: url.toString(),
    sql,
    apply,
    async fingerprint() {
      const rows = await sql.unsafe<{ line: string }[]>(readSql(SQL.fingerprint));
      return rows.map((r) => r.line);
    },
    async drop() {
      await sql.end({ timeout: 5 });
      const a = connect(TEST_DB_URL, 1);
      await a.unsafe(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}
