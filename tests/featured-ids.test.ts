import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FEATURED_DB_IDS, FEATURED_MENTORS, featuredMentorByAnyId, isFeaturedDbId } from '../client/src/data/featuredMentors.ts';

/**
 * Design §3.1: the five curated mentors have deterministic UUIDv5 ids (URL
 * namespace, name `https://mentor-amazon.vercel.app/mentor/<slug>`). This test
 * recomputes them in Node and checks the client data and the SQL seed
 * (`migrations/0004_seed_featured_mentors.sql`, amendment AM2) agree.
 */
const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

/** The frozen table from design §3.1. */
const EXPECTED: Record<string, string> = {
  'manav-gupta': '738d7465-42c6-5550-be9a-6e7ef35f52bc',
  'bashar-aboudaoud': 'caf1ee67-267d-591f-9842-5ae649ec2a26',
  'nick-ramil': '20b28010-7bf8-5b6b-a1cc-d9435478d131',
  'levi-lewandowski': 'ec758eba-8efc-5c32-a3ee-768badd8c9c9',
  'ghita-elidrissi': '6afa7b6d-d098-568a-b629-2b04c6edeef1',
};

/** RFC 4122 §4.3 name-based UUID, SHA-1 (version 5). */
function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const nameFor = (slug: string) => `https://mentor-amazon.vercel.app/mentor/${slug}`;

describe('featured mentor ids (UUIDv5)', () => {
  it('the helper reproduces the RFC 4122 test vector', () => {
    // RFC 4122 / Python uuid docs: uuid5(NAMESPACE_DNS, 'python.org').
    expect(uuidV5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('recomputed ids equal the frozen table in design §3.1', () => {
    for (const [slug, id] of Object.entries(EXPECTED)) {
      expect(uuidV5(nameFor(slug), URL_NAMESPACE)).toBe(id);
    }
  });

  it('featuredMentors.ts carries exactly those five slugs and ids', () => {
    expect(FEATURED_MENTORS.map((m) => m.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const m of FEATURED_MENTORS) {
      expect(m.dbId).toBe(EXPECTED[m.id]);
      expect(m.dbId).toBe(uuidV5(nameFor(m.id), URL_NAMESPACE));
    }
    expect([...FEATURED_DB_IDS].sort()).toEqual(Object.values(EXPECTED).sort());
  });

  it('lookups accept the slug or the db id, nothing else', () => {
    expect(featuredMentorByAnyId('manav-gupta')?.dbId).toBe(EXPECTED['manav-gupta']);
    expect(featuredMentorByAnyId(EXPECTED['nick-ramil'])?.id).toBe('nick-ramil');
    expect(featuredMentorByAnyId('nope')).toBeUndefined();
    expect(featuredMentorByAnyId(undefined)).toBeUndefined();
    expect(isFeaturedDbId(EXPECTED['ghita-elidrissi'])).toBe(true);
    expect(isFeaturedDbId('ghita-elidrissi')).toBe(false);
    expect(isFeaturedDbId(null)).toBe(false);
  });
});

// FEATURED_SEED_SQL lets a reviewer point the check at another copy of the seed (e.g. a branch not merged yet).
const SEED_PATH = process.env.FEATURED_SEED_SQL || fileURLToPath(new URL('../migrations/0004_seed_featured_mentors.sql', import.meta.url));
const hasSeed = existsSync(SEED_PATH);
if (!hasSeed) {
  console.warn(
    `[featured-ids] SKIPPING the SQL seed check: ${SEED_PATH} does not exist in this branch. ` +
      'migrations/0004_seed_featured_mentors.sql is added by Track A (amendment AM2) and arrives at merge; ' +
      'the UUIDv5 and featuredMentors.ts checks still ran.',
  );
}
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * SQL with comments removed (string literals are respected, so a `--` inside
 * a quoted bio survives), leaving only executable text.
 */
function executableSql(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'") {
      const end = closingQuote(source, i);
      out += source.slice(i, end + 1);
      i = end;
    } else if (ch === '-' && source[i + 1] === '-') {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

/** Index of the quote closing the literal that opens at `start` (`''` is an escaped quote). */
function closingQuote(sql: string, start: number): number {
  for (let i = start + 1; i < sql.length; i++) {
    if (sql[i] !== "'") continue;
    if (sql[i + 1] === "'") {
      i++;
      continue;
    }
    return i;
  }
  return sql.length - 1;
}

/** Top-level comma-separated items of a parenthesised group whose "(" is at `open`; returns the items and the index after ")". */
function splitGroup(sql: string, open: number): { items: string[]; end: number } {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      const end = closingQuote(sql, i);
      current += sql.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === '(' || ch === '[') {
      depth++;
      if (depth === 1 && ch === '(') continue;
    } else if (ch === ')' || ch === ']') {
      depth--;
      if (depth === 0) {
        items.push(current.trim());
        return { items, end: i + 1 };
      }
    } else if (ch === ',' && depth === 1) {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  throw new Error('unbalanced parentheses in seed SQL');
}

/** Every row of every `INSERT INTO public.mentors (...) VALUES (...), (...)` as a column → raw value map. */
function seedRows(sql: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const insert = /insert\s+into\s+(?:public\.)?mentors\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = insert.exec(sql))) {
    const columns = splitGroup(sql, match.index + match[0].length - 1);
    const cols = columns.items.map((c) => c.replace(/"/g, '').trim().toLowerCase());
    const valuesAt = sql.slice(columns.end).search(/\S/);
    const rest = sql.slice(columns.end + valuesAt);
    if (!/^values\b/i.test(rest)) continue;
    let cursor = columns.end + valuesAt + 'values'.length;
    for (;;) {
      const next = sql.slice(cursor).search(/\S/);
      if (next === -1 || sql[cursor + next] !== '(') break;
      const tuple = splitGroup(sql, cursor + next);
      rows.push(Object.fromEntries(cols.map((c, i) => [c, tuple.items[i] ?? ''])));
      cursor = tuple.end;
      const after = sql.slice(cursor).search(/\S/);
      if (after === -1 || sql[cursor + after] !== ',') break;
      cursor += after + 1;
    }
  }
  return rows;
}

const unquote = (raw: string) => raw.replace(/::\w+$/, '').trim().replace(/^'(.*)'$/s, '$1').replace(/''/g, "'");

describe('migrations/0004_seed_featured_mentors.sql literals', () => {
  const title = hasSeed
    ? 'the seed inserts exactly the five §3.1 ids, each with its own placeholder email, idempotently'
    : 'SKIPPED: migrations/0004_seed_featured_mentors.sql is not in this branch yet (Track A adds it; it arrives at merge)';
  (hasSeed ? it : it.skip)(title, () => {
    const sql = executableSql(readFileSync(SEED_PATH, 'utf8'));

    // No stray (mistyped) uuid anywhere in the executable SQL.
    const literals = new Set((sql.match(UUID_RE) ?? []).map((id) => id.toLowerCase()));
    literals.delete(URL_NAMESPACE); // a namespace literal (if the seed also recomputes ids in SQL) is not a row id
    expect([...literals].sort()).toEqual(Object.values(EXPECTED).sort());

    // Column-aware: each row's `id` is the §3.1 id of the slug its `email` names.
    const rows = seedRows(sql);
    expect(rows, 'INSERT INTO public.mentors (...) VALUES rows').toHaveLength(5);
    const pairs = Object.fromEntries(
      rows.map((row) => [unquote(row.email ?? '').toLowerCase(), unquote(row.id ?? '').toLowerCase()]),
    );
    for (const [slug, id] of Object.entries(EXPECTED)) {
      expect(pairs[`featured.${slug}@mentorconnect.invalid`], `row for ${slug}`).toBe(id);
    }
    for (const row of rows) {
      if ('managed_by_programme' in row) expect(unquote(row.managed_by_programme).toLowerCase()).toBe('true');
      if ('cal_link' in row) expect(unquote(row.cal_link)).toBe('');
    }
    expect(sql).toMatch(/on\s+conflict\s*\(\s*id\s*\)\s*do\s+nothing/i);
  });
});
