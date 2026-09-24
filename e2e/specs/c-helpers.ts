/**
 * Shared helpers for Track C's E2E specs (c-*.spec.ts). Not a spec itself.
 * Accounts these specs create use e2e.* addresses (or `e2e…` Amazon aliases) and are removed
 * by the spec's own cleanup or by the next scripts/e2e/seed.ts run.
 */
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import type postgres from 'postgres';
import { e2eEnv, turnstile } from '../fixtures/env';
import { tr } from '../fixtures/i18n';

/** Whether the current test runs in one of `projects` (design §6.4 project matrix); specs skip otherwise. */
export function runsOn(testInfo: TestInfo, projects: readonly string[]): boolean {
  return projects.includes(testInfo.project.name);
}

/**
 * Put one project's personas and fixture bookings back into the seeded state (Track A's
 * scripts/e2e/seed.ts). Specs that change fixture rows call it first, so their assertions do
 * not depend on which spec ran before them, and a retry starts from a clean state.
 */
export function reseed(project: string): void {
  execFileSync('npx', ['tsx', 'scripts/e2e/seed.ts', project], { stdio: ['ignore', 'ignore', 2], env: process.env });
}

/** The service-role client (local stack only), for admin-only setup and clean-up. */
export function adminClient(): SupabaseClient {
  return createClient(e2eEnv.supabaseUrl, e2eEnv.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A password client that keeps no session (checks that a password does or does not sign in). */
export function anonClient(): SupabaseClient {
  return createClient(e2eEnv.supabaseUrl, e2eEnv.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Delete auth users (and their public.users rows) by email; ignores addresses that do not exist. */
export async function deleteAccounts(db: postgres.Sql, emails: string[]): Promise<void> {
  const admin = adminClient();
  for (const email of emails) {
    const rows = await db<{ id: string }[]>`select id::text from auth.users where lower(email) = ${email.toLowerCase()}`;
    const mentees = await db<{ id: string }[]>`select id from public.mentees where lower(email) = ${email.toLowerCase()}`;
    for (const m of mentees) {
      await db`delete from public.activity_events where ${m.id} = any(visible_to)`;
      await db`delete from public.mentor_activity_log where mentee_id = ${m.id}`;
      await db`delete from public.mentee_favorites where mentee_id = ${m.id}`;
      await db`delete from public.mentees where id = ${m.id}`;
    }
    await db`delete from public.notifications where lower(recipient_email) = ${email.toLowerCase()}`;
    for (const r of rows) {
      await db`delete from public.user_identifiers where user_id = ${r.id}`;
      await db`delete from public.users where id = ${r.id}`;
      const { error } = await admin.auth.admin.deleteUser(r.id);
      if (error && !/not.?found/i.test(error.message)) throw new Error(`delete ${email}: ${error.message}`);
    }
  }
}

/**
 * Give a freshly issued session a moment before the page uses it: PostgREST compares the
 * token's `iat` with a clock it refreshes once a second, and answers a token used within
 * that second with 401 "JWT issued at future" (PGRST303), which the health check reports.
 */
export async function tokenSettle(page: Page): Promise<void> {
  await page.waitForTimeout(1_100);
}

/** Wait until the Turnstile widget (test sitekey) has produced its token, when Turnstile is on. */
export async function captchaReady(scope: Page | Locator): Promise<void> {
  if (!turnstile.enabled) return;
  await expect(scope.locator('[data-testid="turnstile"] input[name="cf-turnstile-response"]').first()).toHaveValue(/.+/, { timeout: 20_000 });
}

/** Database mode shows real data only: no demo banner or badge, nothing written to the browser store. */
export async function expectNoDemo(page: Page, lang: 'en' | 'ar'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-backend', 'database');
  await expect(page.getByTestId('banner-demo-mode')).toHaveCount(0);
  await expect(page.getByTestId('badge-demo-data')).toHaveCount(0);
  await expect(page.getByText(tr(lang, 'analyticsV2.demoBadge'), { exact: true })).toHaveCount(0);
  const localKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((k) => k.startsWith('mentorconnect.local.') || k.startsWith('mentorconnect.value.')),
  );
  expect(localKeys, 'no mentorconnect.local/value keys in database mode').toEqual([]);
}

/** A sonner toast with exactly this text. */
export function toast(page: Page, text: string): Locator {
  return page.locator('[data-sonner-toast]').filter({ hasText: text });
}

/** Visible text without the bidi isolation marks the app wraps names and emails in. */
export const plain = (text: string): string => text.replace(/[\u2066-\u2069\u200e\u200f]/g, '');

/** A 1×1 PNG for photo uploads. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Main-frame paths visited by a page, in order (redirect chains included). */
export function recordPaths(page: Page): string[] {
  const paths: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname);
  });
  return paths;
}

/** Fill the mentor onboarding form's required fields (the first option of each list). */
export async function fillMentorOnboarding(page: Page, opts: { name: string; calLink: string }): Promise<void> {
  await page.getByTestId('input-name').fill(opts.name);
  await page.getByTestId('input-bio').fill('I help first-time founders plan product launches and hire their first engineers.');
  for (const trigger of ['select-expertise', 'select-industries', 'select-languages']) {
    await page.getByTestId(trigger).click();
    await page.getByRole('option').first().click();
  }
  await page.getByTestId('input-calcom').fill(opts.calLink);
}

/** Sign out through the header (account menu on desktop, the menu sheet on mobile); it ends on the home page. */
export async function signOut(page: Page, lang: 'en' | 'ar', isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.getByTestId('button-mobile-menu').click();
    await page.getByRole('button', { name: tr(lang, 'auth.logout') }).click();
  } else {
    await page.getByTestId('button-account-menu').click();
    await page.getByRole('menuitem', { name: tr(lang, 'auth.logout') }).click();
  }
  await expect(page).toHaveURL((u) => u.pathname === '/');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), e2eEnv.authStorageKey), { message: 'session removed' }).toBeNull();
}

/** Remove mentors rows with this email and everything hanging off them (rows a spec created). */
export async function purgeMentorsByEmail(db: postgres.Sql, email: string): Promise<void> {
  const mentors = await db<{ id: string }[]>`select id from public.mentors where lower(email) = ${email.toLowerCase()}`;
  for (const { id } of mentors) {
    const bookings = (await db<{ id: string }[]>`select id from public.bookings where mentor_id = ${id}`).map((b) => b.id);
    await db.begin(async (tx) => {
      if (bookings.length) {
        await tx`delete from public.notifications where booking_id = any(${bookings})`;
        await tx`delete from public.booking_notes where booking_id = any(${bookings})`;
        await tx`delete from public.booking_reminders where booking_id = any(${bookings})`;
        await tx`delete from public.mentor_tasks where booking_id = any(${bookings})`;
        await tx`delete from public.mentor_activity_log where booking_id = any(${bookings})`;
        await tx`delete from public.activity_events where subject_id = any(${bookings})`;
        await tx`delete from public.bookings where id = any(${bookings})`;
      }
      await tx`delete from public.activity_events where ${id} = any(visible_to)`;
      await tx`delete from public.mentor_tasks where mentor_id = ${id}`;
      await tx`delete from public.mentor_activity_log where mentor_id = ${id}`;
      await tx`delete from public.mentor_earnings where mentor_id = ${id}`;
      await tx`delete from public.mentor_availability where mentor_id = ${id}`;
      await tx`delete from public.mentor_cal_webhooks where mentor_id = ${id}`;
      await tx`delete from public.mentee_favorites where mentor_id = ${id}`;
      await tx`update public.approved_users set mentor_id = null where mentor_id = ${id}`;
      await tx`update public.users set profile_id = null where profile_id = ${id}`;
      await tx`delete from public.mentors where id = ${id}`;
    });
  }
}

/** Remove a requester (mentees row by email) and its bookings. */
export async function purgeRequester(db: postgres.Sql, email: string): Promise<void> {
  const mentees = await db<{ id: string }[]>`select id from public.mentees where lower(email) = ${email.toLowerCase()}`;
  for (const { id } of mentees) {
    const bookings = (await db<{ id: string }[]>`select id from public.bookings where mentee_id = ${id}`).map((b) => b.id);
    await db.begin(async (tx) => {
      if (bookings.length) {
        await tx`delete from public.notifications where booking_id = any(${bookings})`;
        await tx`delete from public.booking_reminders where booking_id = any(${bookings})`;
        await tx`delete from public.mentor_activity_log where booking_id = any(${bookings})`;
        await tx`delete from public.activity_events where subject_id = any(${bookings})`;
        await tx`delete from public.bookings where id = any(${bookings})`;
      }
      await tx`delete from public.activity_events where ${id} = any(visible_to)`;
      await tx`delete from public.mentees where id = ${id}`;
    });
  }
  await db`delete from public.notifications where lower(recipient_email) = ${email.toLowerCase()}`;
}

/** A pending request from `email` to `mentorId`, written directly (the mentee is created if needed). */
export async function insertPendingRequest(db: postgres.Sql, opts: { mentorId: string; email: string; name: string; goal: string }): Promise<string> {
  const [mentee] = await db<{ id: string }[]>`
    insert into public.mentees (id, name, email, user_type, timezone, languages_spoken, areas_exploring, verification_status, created_at)
    values (gen_random_uuid()::text, ${opts.name}, ${opts.email.toLowerCase()}, 'individual', 'UTC', ${['English']}, ${['Career Development']},
            'unverified', timezone('utc', now()))
    on conflict (email) do update set name = excluded.name
    returning id`;
  const [booking] = await db<{ id: string }[]>`
    insert into public.bookings (id, mentor_id, mentee_id, status, goal, clicked_at, created_at)
    values (gen_random_uuid()::text, ${opts.mentorId}, ${mentee.id}, 'pending', ${opts.goal}, timezone('utc', now()), timezone('utc', now()))
    returning id`;
  return booking.id;
}

/** Remove everything an Amazon (mock IdP) sign-in created for `alias`: rows, profile, auth user. */
export async function purgeSsoIdentity(db: postgres.Sql, alias: string): Promise<void> {
  const email = `${alias}@amazon.com`;
  const users = await db<{ id: string; email: string }[]>`
    select id::text, email from public.users where amazon_alias = ${alias} or lower(email) = ${email}`;
  for (const address of new Set([email, ...users.map((u) => u.email.toLowerCase())])) await purgeMentorsByEmail(db, address);
  for (const u of users) {
    await db`delete from public.user_identifiers where user_id = ${u.id}`;
    await db`delete from public.notifications where lower(recipient_email) = ${u.email.toLowerCase()}`;
    await db`delete from public.users where id = ${u.id}`;
  }
  await db`delete from public.user_identifiers where provider = 'amazon' and subject = ${alias}`;
  await db`delete from public.approved_users where amazon_alias = ${alias}`;
  await db`delete from public.access_requests where amazon_alias = ${alias}`;
  const auth = await db<{ id: string }[]>`select id::text from auth.users where lower(email) = ${email}`;
  const admin = adminClient();
  for (const a of auth) {
    const { error } = await admin.auth.admin.deleteUser(a.id);
    if (error && !/not.?found/i.test(error.message)) throw new Error(`delete ${email}: ${error.message}`);
  }
}
