import { randomInt } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import postgres from 'postgres';
import { calStub, signedCalPost, type CalStub } from './cal';
import { e2eEnv, turnstile } from './env';
import { expectHealthyPage, trackHealth, type HealthTracker, type HealthyPageOptions } from './health';
import { mailpit } from './mailpit';
import { E2E_PASSWORD, personaEmail, type AccountPersona } from './personas';

/**
 * Specs import `test` and `expect` from here:
 *
 *   import { test, expect } from '../fixtures/test';
 *   test('…', async ({ page, loginAs, healthy, db, personaProject }) => {
 *     await loginAs('mentor');
 *     await page.goto('/dashboard');
 *     await healthy();
 *   });
 *
 * Options set per project in playwright.config.ts: `lang` ('en' | 'ar') and `backend`
 * ('database' | 'local'). `personaProject` is the project name the seed used for the
 * personas (desktop-en, mobile-ar, …; prod-csp uses its own).
 */
export type E2eOptions = {
  lang: 'en' | 'ar';
  backend: 'database' | 'local';
};

type E2eFixtures = {
  personaProject: string;
  /** Sign in as a seeded persona: a real password grant in Node, session put where supabase-js reads it. */
  loginAs: (persona: AccountPersona) => Promise<Session>;
  /** Assert the §6.4 health checks on the current page. */
  healthy: (opts?: Partial<HealthyPageOptions>) => Promise<void>;
  healthTracker: HealthTracker;
  /** Rate-limit bucket of this test's /api requests (x-e2e-client-ip, dev server only). */
  clientIp: string;
  cal: CalStub;
};

type E2eWorkerFixtures = {
  db: postgres.Sql;
};

export const test = base.extend<E2eOptions & E2eFixtures, E2eWorkerFixtures>({
  lang: ['en', { option: true }],
  backend: ['database', { option: true }],

  db: [
    async ({}, use) => {
      const sql = postgres(e2eEnv.databaseUrl, { max: 2, onnotice: () => undefined });
      await use(sql);
      await sql.end();
    },
    { scope: 'worker' },
  ],

  personaProject: async ({}, use, testInfo) => {
    await use(testInfo.project.name);
  },

  clientIp: async ({}, use) => {
    await use(`10.${randomInt(1, 250)}.${randomInt(0, 250)}.${randomInt(1, 250)}`);
  },

  page: async ({ page, lang, clientIp, baseURL }, use) => {
    // Language before the first load: LanguageProvider reads localStorage 'language' and
    // drives i18next (whose own detector key is 'i18nextLng'), so both are set — only when
    // absent, so an in-test language toggle sticks.
    await page.addInitScript((l) => {
      try {
        for (const key of ['language', 'i18nextLng']) {
          if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, l);
        }
      } catch {
        /* storage blocked: the app falls back to English */
      }
    }, lang);
    const origin = new URL(baseURL ?? `http://localhost:${e2eEnv.port}`).origin;
    await page.route(`${origin}/api/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-e2e-client-ip': clientIp } }),
    );
    await use(page);
  },

  healthTracker: [
    async ({ page, baseURL }, use) => {
      const appOrigin = new URL(baseURL ?? `http://localhost:${e2eEnv.port}`).origin;
      await use(trackHealth(page, { appOrigin, supabaseOrigin: new URL(e2eEnv.supabaseUrl).origin }));
    },
    { auto: true },
  ],

  healthy: async ({ page, healthTracker, lang, backend }, use, testInfo) => {
    await use((opts = {}) => expectHealthyPage(page, healthTracker, testInfo, { lang, backend, ...opts }));
  },

  loginAs: async ({ page, personaProject }, use) => {
    await use(async (persona) => {
      const sb = createClient(e2eEnv.supabaseUrl, e2eEnv.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const email = personaEmail(personaProject, persona);
      const { data, error } = await sb.auth.signInWithPassword({ email, password: E2E_PASSWORD });
      if (error || !data.session) {
        throw new Error(`loginAs(${persona}): ${error?.message ?? 'no session'} — run scripts/e2e/seed.ts for project ${personaProject}`);
      }
      // Injected once per tab (a sign-out inside the test stays signed out on later navigations).
      await page.addInitScript(
        ([key, value]) => {
          try {
            if (window.sessionStorage.getItem('__e2e_session_injected')) return;
            window.localStorage.setItem(key, value);
            window.sessionStorage.setItem('__e2e_session_injected', '1');
          } catch {
            /* ignore */
          }
        },
        [e2eEnv.authStorageKey, JSON.stringify(data.session)] as const,
      );
      return data.session;
    });
  },

  cal: async ({ page }, use) => {
    await use(await calStub(page));
  },
});

export { expect, mailpit, signedCalPost, turnstile, e2eEnv };
export type { Page };
