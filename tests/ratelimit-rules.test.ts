import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULES, type RateLimitRule } from '../api/_lib/ratelimit.ts';
import { REQUESTS_RULE } from '../api/requests.ts';
import { FAIL_LIMIT } from '../api/webhooks/cal.ts';

/**
 * R1-06 — the rate-limit rules stay in step with the routes. A rule left behind for a deleted
 * endpoint, or two rules sharing a key name with different limits, silently merges or drifts
 * the per-IP buckets (`rl:<name>:<ip>`).
 */

const API_DIR = fileURLToPath(new URL('../api', import.meta.url));

function routeSources(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return routeSources(full);
      return entry.name.endsWith('.ts') && full !== path.join(API_DIR, '_lib', 'ratelimit.ts') ? readFileSync(full, 'utf8') : '';
    })
    .join('\n');
}

describe('rate-limit rules', () => {
  it('every shared RULES entry is used by a route', () => {
    const sources = routeSources(API_DIR);
    const unused = Object.keys(RULES).filter((key) => !new RegExp(`\\bRULES\\.${key}\\b`).test(sources));
    expect(unused).toEqual([]);
  });

  it('no two rules share a key name', () => {
    const rules: RateLimitRule[] = [...Object.values(RULES), REQUESTS_RULE, FAIL_LIMIT];
    const names = rules.map((rule) => rule.name);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });
});
