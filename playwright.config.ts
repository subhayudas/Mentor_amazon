import { execFileSync } from 'node:child_process';
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import type { E2eOptions } from './e2e/fixtures/test';

/**
 * E2E against the local Supabase stack (design §5.3 A12, §6.4).
 *
 *   npx playwright test --project=desktop-en --project=mobile-ar e2e/specs/b-requests.spec.ts
 *
 * Environment: scripts/e2e/env.sh is loaded into this process (values already set win), so
 * the dev server, the mock IdP, the seed and the fixtures all see the same settings.
 * Web servers: the dev server (E2E_PORT, default 5173, MC_LOCAL_API=1) and the mock IdP always;
 * the production preview (4173, vercel.json headers) only when `prod-csp` runs; the demo-mode
 * dev server (5176, VITE_LOCAL=1) only when a `demo-local*` project runs.
 * Personas are (re)seeded for the selected projects before the run unless E2E_SKIP_SEED=1.
 * Tags: a test titled with @prod-csp runs only in prod-csp, @demo-local only in demo-local*.
 */
function loadE2eEnv(): void {
  const out = execFileSync('bash', ['-c', 'set -a; source scripts/e2e/env.sh >/dev/null 2>&1; env -0'], {
    encoding: 'utf8',
    env: process.env,
  });
  for (const entry of out.split('\0')) {
    const i = entry.indexOf('=');
    if (i > 0 && process.env[entry.slice(0, i)] === undefined) process.env[entry.slice(0, i)] = entry.slice(i + 1);
  }
}
loadE2eEnv();

const PORT = Number(process.env.E2E_PORT ?? 5173);
const IDP_PORT = Number(process.env.E2E_MOCK_IDP_PORT ?? 54399);

// Which projects this invocation runs (webServers are only started when needed).
const selected = process.argv.flatMap((arg, i, all) =>
  arg.startsWith('--project=') ? [arg.slice('--project='.length)] : arg === '--project' && all[i + 1] ? [all[i + 1]] : [],
);
const runs = (name: string) =>
  selected.length === 0 || selected.some((p) => p === name || (p.includes('*') && new RegExp(`^${p.replace(/\*/g, '.*')}$`).test(name)));

const desktop = { viewport: { width: 1280, height: 800 } };
const mobile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};
const MAIN = `http://localhost:${PORT}`;
const TAGGED = /@prod-csp|@demo-local/;

const webServer: NonNullable<PlaywrightTestConfig['webServer']> = [
  {
    command: `bash -c 'source scripts/e2e/env.sh && exec npx vite --port ${PORT} --strictPort'`,
    url: MAIN,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  {
    command: `bash -c 'source scripts/e2e/env.sh && exec npx tsx scripts/e2e/mock-idp.ts'`,
    url: `http://127.0.0.1:${IDP_PORT}/.well-known/openid-configuration`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
];
if (runs('prod-csp')) {
  webServer.push({
    command: `bash -c 'source scripts/e2e/env.sh && npx vite build >/dev/null && MC_APPLY_VERCEL_HEADERS=1 exec npx vite preview --port 4173 --strictPort'`,
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 300_000,
  });
}
if (runs('demo-local') || runs('demo-local-ar')) {
  webServer.push({
    command: `bash -c 'source scripts/e2e/env.sh && VITE_LOCAL=1 MC_LOCAL_API=0 exec npx vite --port 5176 --strictPort'`,
    url: 'http://localhost:5176',
    reuseExistingServer: true,
    timeout: 120_000,
  });
}

export default defineConfig<E2eOptions>({
  testDir: './e2e/specs',
  outputDir: './test-results',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: MAIN,
    trace: 'retain-on-failure',
    screenshot: 'on',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'desktop-en', grepInvert: TAGGED, use: { ...desktop, lang: 'en', locale: 'en-US' } },
    { name: 'desktop-ar', grepInvert: TAGGED, use: { ...desktop, lang: 'ar', locale: 'ar' } },
    { name: 'mobile-en', grepInvert: TAGGED, use: { ...mobile, lang: 'en', locale: 'en-US' } },
    { name: 'mobile-ar', grepInvert: TAGGED, use: { ...mobile, lang: 'ar', locale: 'ar' } },
    { name: 'prod-csp', grep: /@prod-csp/, use: { ...desktop, lang: 'en', locale: 'en-US', baseURL: 'http://localhost:4173' } },
    { name: 'demo-local', grep: /@demo-local/, use: { ...desktop, lang: 'en', locale: 'en-US', backend: 'local', baseURL: 'http://localhost:5176' } },
    { name: 'demo-local-ar', grep: /@demo-local/, use: { ...desktop, lang: 'ar', locale: 'ar', backend: 'local', baseURL: 'http://localhost:5176' } },
  ],
  webServer,
});
