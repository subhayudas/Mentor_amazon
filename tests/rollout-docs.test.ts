import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * R1-25, R1-26, R1-28, R1-31, R1-04: the rollout checklist in TESTING.md ("Before merging the
 * PR — order of operations") is what Subhayu follows on production, so the facts that make it
 * safe are pinned here: the order of the migrations and the merge, consent before 0004,
 * Production-only Turnstile keys, the Supabase CAPTCHA step, the rollback order and the
 * preview check in api/README.md. Wording can change; these facts cannot.
 */

const testing = readFileSync(new URL('../TESTING.md', import.meta.url), 'utf8');
const apiReadme = readFileSync(new URL('../api/README.md', import.meta.url), 'utf8');
const rootEnv = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const clientEnv = readFileSync(new URL('../client/.env.example', import.meta.url), 'utf8');
const migration0003 = readFileSync(new URL('../migrations/0003_restrict_legacy_writes.sql', import.meta.url), 'utf8');

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  expect(from, `missing section "${start}"`).toBeGreaterThanOrEqual(0);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to === -1 ? undefined : to);
}

const runbook = between(testing, '## Before merging the PR — order of operations', '## Cal.com live test');
const [ordered, rollback = ''] = runbook.split('### Rollback');
/** Top-level numbered steps of the checklist, by number. */
const steps = new Map(
  Array.from(ordered.matchAll(/^(\d+)\. ([\s\S]*?)(?=^\d+\. |(?![\s\S]))/gm), (m) => [Number(m[1]), m[2]] as const),
);
const stepOf = (pattern: RegExp) => {
  const hit = [...steps].find(([, body]) => pattern.test(body));
  expect(hit, `no step matches ${pattern}`).toBeDefined();
  return hit![0];
};
const smokeI = between(testing, '## (i) Booking requests, Turnstile and Cal.com sync', '\n---\n');

describe('TESTING.md rollout order (R1-31)', () => {
  it('0002 → merge → 0003 → optional 0004 → Supabase CAPTCHA, in that order', () => {
    const expand = stepOf(/run `migrations\/0002_production_readiness\.sql`/);
    const preview = stepOf(/Verify on a preview/);
    const merge = stepOf(/^\*\*Merge\*\*/);
    const contract = stepOf(/run `migrations\/0003_restrict_legacy_writes\.sql`/);
    const seed = stepOf(/run `migrations\/0004_seed_featured_mentors\.sql`/);
    const captcha = stepOf(/Attack Protection → enable CAPTCHA/);
    expect([expand, preview, merge, contract, seed, captcha]).toEqual([...[expand, preview, merge, contract, seed, captcha]].sort((a, b) => a - b));
    expect(new Set([expand, preview, merge, contract, seed, captcha]).size).toBe(6);
  });

  it('0004 is optional and waits for the featured mentors’ consent', () => {
    const seed = steps.get(stepOf(/0004_seed_featured_mentors/))!;
    expect(seed).toMatch(/Optional/);
    expect(seed).toMatch(/agree to receive requests/);
  });

  it('the CAPTCHA step pastes the Turnstile secret into Supabase and tests every sign-in at once, with a way back', () => {
    const captcha = steps.get(stepOf(/Attack Protection → enable CAPTCHA/))!;
    expect(captcha).toMatch(/secret\*\* key/);
    expect(captcha).toMatch(/TURNSTILE_SECRET_KEY/);
    for (const flow of [/sign up/, /password/, /reset/, /Amazon/]) expect(captcha).toMatch(flow);
    expect(captcha).toMatch(/switch CAPTCHA off again/);
  });

  it('VITE_DEFAULT_CAL_LINK is removed; Upstash is recommended for Production (R1-04)', () => {
    const env = steps.get(stepOf(/Vercel — environment variables/))!;
    expect(env).toMatch(/\*\*Remove\*\* `VITE_DEFAULT_CAL_LINK`/);
    expect(env).toMatch(/Recommended for Production:\*\* `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`/);
  });
});

describe('Turnstile keys are Production-only (R1-26)', () => {
  const env = () => steps.get(stepOf(/Vercel — environment variables/))!;
  const bullet = (pattern: RegExp) => env().split('\n   - ').find((b) => pattern.test(b)) ?? '';

  it('the keys and the hostname allow-list sit in the Production-only bullet, never in "Production and Preview"', () => {
    const turnstile = bullet(/TURNSTILE_SECRET_KEY/);
    expect(turnstile).toMatch(/^\*\*Production only: Turnstile\.\*\*/);
    expect(turnstile).toMatch(/VITE_TURNSTILE_SITE_KEY/);
    expect(turnstile).toMatch(/TURNSTILE_ALLOWED_HOSTNAMES/);
    expect(turnstile).toMatch(/\*\*Do not tick Preview\*\*/);
    expect(bullet(/^\*\*Production and Preview/)).not.toMatch(/TURNSTILE/);
  });

  it('the preview checks run before Supabase CAPTCHA, which also covers previews', () => {
    expect(stepOf(/Verify on a preview/)).toBeLessThan(stepOf(/Attack Protection → enable CAPTCHA/));
    expect(steps.get(stepOf(/Attack Protection → enable CAPTCHA/))!).toMatch(/previews included/);
  });
});

describe('smoke test i1 matches the rollout (R1-25)', () => {
  it('i1a (before 0004), i1b (an ordinary mentor) and i1c (after 0004) exist; there is no bare i1', () => {
    expect(smokeI).toMatch(/\| i1a \| \*\*Before `0004` has run\*\*/);
    expect(smokeI).toMatch(/\| i1b \| .*ordinary\*\* \(database\) mentor/);
    expect(smokeI).toMatch(/\| i1c \| \*\*Only after `0004` has run\*\*/);
    expect(testing).not.toMatch(/\bi1\b(?![abc])/);
  });

  it('i1c is only scheduled by the 0004 step; the preview and production steps use i1a and i1b', () => {
    const seed = stepOf(/0004_seed_featured_mentors/);
    for (const [n, body] of steps) {
      if (/\bi1c\b/.test(body)) expect(n, `step ${n} schedules i1c`).toBe(seed);
    }
    for (const pattern of [/Verify on a preview/, /^\*\*Merge\*\*/]) {
      const body = steps.get(stepOf(pattern))!;
      expect(body).toMatch(/i1a/);
      expect(body).toMatch(/i1b/);
    }
  });
});

describe('signed-out requests in the smoke tests say "Request submitted" and use an address with no account (R2-08)', () => {
  const row = (id: string) => smokeI.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';
  it('i1b and i1c expect "Request submitted", never "Request sent", from an address with no account', () => {
    for (const id of ['i1b', 'i1c']) {
      expect(row(id), id).toMatch(/"Request submitted"/);
      expect(row(id), id).not.toMatch(/"Request sent"/);
    }
    expect(row('i1b')).toMatch(/\*\*no\*\* MentorConnect account/);
    expect(row('i1b')).not.toMatch(/your own test address/);
    expect(row('i1b')).toMatch(/Request not sent: please sign in/);
  });
  it('e1 gives the signed-out title as "Request submitted"', () => {
    const e1 = testing.split('\n').find((l) => l.startsWith('| e1 |')) ?? '';
    expect(e1).toMatch(/signed out it reads "Request submitted"/);
  });
});

describe('previews refuse anonymous requests without a captcha (R2-06)', () => {
  it('the preview check expects 503 captcha_unavailable for the anonymous request, and Preview gets no Turnstile variables', () => {
    const section = between(apiReadme, '## Verify on a preview (before merging)', '\n---\n');
    expect(section).toMatch(/Expect `503 \{"error":"captcha_unavailable"\}`/);
    expect(section).not.toMatch(/Expect `200 \{"ok":true\}`/);
    const preview = steps.get(stepOf(/Verify on a preview/))!;
    expect(preview).toMatch(/503 \{"error":"captcha_unavailable"\}/);
    const env = steps.get(stepOf(/Vercel — environment variables/))!;
    expect(env).toMatch(/On Preview leave all Turnstile variables unset, `TURNSTILE_DISABLED` included/);
    expect(env).not.toMatch(/use Cloudflare's always-pass test pair to see the widget/);
  });
});

describe('rollback order (R1-28)', () => {
  it('once 0003 has run, its ROLLBACK block runs before the previous deployment comes back', () => {
    const afterContract = rollback.split('\n- ').find((b) => /once `0003` has run/.test(b)) ?? '';
    expect(afterContract).toMatch(/0003_restrict_legacy_writes\.sql/);
    expect(afterContract.indexOf('ROLLBACK')).toBeGreaterThanOrEqual(0);
    expect(afterContract.indexOf('ROLLBACK')).toBeLessThan(afterContract.indexOf('previous deployment'));
    expect(afterContract).toMatch(/remove the leading `-- `/);
  });

  it('names the exact lines to copy, from `-- BEGIN;` through `-- COMMIT;`, and those lines run as SQL once uncommented', () => {
    const afterContract = rollback.split('\n- ').find((b) => /once `0003` has run/.test(b)) ?? '';
    // Stripping "-- " from the whole block (headers and the trailing note included) is a syntax
    // error that stops the emergency rollback before any GRANT runs, so the range must be exact.
    expect(afterContract).toMatch(/from `-- BEGIN;` through `-- COMMIT;`/);
    expect(afterContract).toMatch(/nothing above or below/);
    const block = migration0003.slice(migration0003.indexOf('-- ROLLBACK'));
    const from = block.indexOf('-- BEGIN;');
    const to = block.indexOf('-- COMMIT;');
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    const lines = block.slice(from, to + '-- COMMIT;'.length).split('\n');
    for (const line of lines) expect(line, 'every line in the range is a commented SQL line').toMatch(/^-- ./);
    const sql = lines.map((l) => l.slice(3)).join('\n');
    expect(sql).not.toMatch(/^\(/m);
    expect(sql).toMatch(/^GRANT ALL ON public\.bookings/m);
  });

  it('Supabase CAPTCHA is switched off before the code is rolled back', () => {
    expect(rollback).toMatch(/CAPTCHA[\s\S]*before rolling the code back/);
  });
});

describe('api/README.md: verify on a preview before merging', () => {
  it('names the bypass token, one signed Cal.com Ping and one anonymous request, each with its do-not-merge answer', () => {
    const section = between(apiReadme, '## Verify on a preview (before merging)', '\n---\n');
    expect(section).toMatch(/Protection Bypass for Automation/);
    expect(section).toMatch(/x-vercel-protection-bypass/);
    expect(section).toMatch(/\/api\/webhooks\/cal\?mentor=/);
    expect(section).toMatch(/openssl dgst -sha256 -hmac/);
    expect(section).toMatch(/200 \{"ok":true,"outcome":"ping"\}/);
    // A fixed body is recorded once; a repeat answers "duplicate". Each run must sign a new body.
    const body = section.match(/^\s*BODY=(.*)$/m)?.[1] ?? '';
    expect(body).toMatch(/\$\(date -u \+%Y-%m-%dT%H:%M:%S/);
    expect(body).not.toMatch(/"createdAt":"\d{4}-/);
    expect(section).toMatch(/"outcome":"duplicate"/);
    expect(section).toMatch(/\/api\/requests/);
    expect(section).toMatch(/400 \{"error":"invalid_request","fields":\["body"\]\}/);
    expect(section.match(/do not merge/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('.env.example files match the Production-only Turnstile rule (R1-01, R1-26)', () => {
  const turnstileBlock = (text: string) => between(text, 'Cloudflare Turnstile', '\n\n');

  it('the root .env.example marks Turnstile Required in Production, Production only, and documents TURNSTILE_DISABLED', () => {
    const block = between(rootEnv, '# Bot protection', '\n\n');
    expect(block).toMatch(/Required in Production \(both keys\)/);
    expect(block).toMatch(/Production environment only/);
    expect(block).toMatch(/503 captcha_unavailable/);
    expect(block).toMatch(/always-pass/);
    expect(block).toMatch(/^# ?TURNSTILE_DISABLED=$/m);
    expect(block).toMatch(/exactly 1/i);
    expect(block).toMatch(/TURNSTILE_ALLOWED_HOSTNAMES=/);
    expect(block).not.toMatch(/optional/i);
    expect(block).not.toMatch(/set both or neither/i);
    expect(rootEnv).not.toMatch(/for both\s+Production and Preview/);
  });

  it('the root .env.example recommends Upstash for Production (R1-04)', () => {
    const block = between(rootEnv, '# Distributed IP rate limiting', '\n\n');
    expect(block).toMatch(/Recommended for Production/);
  });

  it('client/.env.example gives the site key the same Production-only wording', () => {
    const block = turnstileBlock(clientEnv);
    expect(block).toMatch(/Required in Production/);
    expect(block).toMatch(/Production environment only/);
    expect(block).toMatch(/always-pass/);
    expect(block).not.toMatch(/set both or neither/i);
    expect(block).toMatch(/^VITE_TURNSTILE_SITE_KEY=$/m);
    expect(clientEnv).toMatch(/except VITE_TURNSTILE_SITE_KEY/);
  });
});
