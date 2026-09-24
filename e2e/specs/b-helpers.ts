/**
 * Shared helpers for Track B's E2E specs (b-*.spec.ts). Not a spec itself.
 * Rows these specs create use `dev.b.*@mentorconnect.test` addresses and are removed by
 * `purgeRequester` in the spec's own cleanup, so a run leaves the stack as it found it.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type postgres from 'postgres';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** The five curated mentors (design §3.1): slug, database id, EN / AR names. */
export const FEATURED = [
  { slug: 'manav-gupta', dbId: '738d7465-42c6-5550-be9a-6e7ef35f52bc', name: 'Manav Gupta', nameAr: 'ماناف غوبتا' },
  { slug: 'bashar-aboudaoud', dbId: 'caf1ee67-267d-591f-9842-5ae649ec2a26', name: 'Bashar Aboudaoud', nameAr: 'بشار أبو داود' },
  { slug: 'nick-ramil', dbId: '20b28010-7bf8-5b6b-a1cc-d9435478d131', name: 'Nick Ramil', nameAr: 'نيك راميل' },
  { slug: 'levi-lewandowski', dbId: 'ec758eba-8efc-5c32-a3ee-768badd8c9c9', name: 'Levi Lewandowski', nameAr: 'ليفاي ليفاندوفسكي' },
  { slug: 'ghita-elidrissi', dbId: '6afa7b6d-d098-568a-b629-2b04c6edeef1', name: 'Ghita Elidrissi', nameAr: 'غيثة الإدريسي' },
] as const;
export const FEATURED_IDS: ReadonlySet<string> = new Set(FEATURED.map((f) => f.dbId));

const PROJECT_ORDER = ['desktop-en', 'desktop-ar', 'mobile-en', 'mobile-ar', 'prod-csp'];

/** A different curated mentor per project, so parallel projects never share a request target. */
export function featuredFor(project: string, offset = 0): (typeof FEATURED)[number] {
  const i = Math.max(0, PROJECT_ORDER.indexOf(project));
  return FEATURED[(i + offset) % FEATURED.length];
}

/** A fresh requester address for rows this spec creates. */
export function devEmail(tag: string): string {
  return `dev.b.${tag}.${Date.now().toString(36)}${randomBytes(2).toString('hex')}@mentorconnect.test`;
}

/**
 * The app's LanguageContext reads localStorage `language` (and pushes it into i18next), so
 * both keys are set before the first load; only when absent, so an in-test toggle sticks.
 */
export async function useLanguage(page: Page, lang: 'en' | 'ar'): Promise<void> {
  await page.addInitScript((l) => {
    try {
      if (!window.localStorage.getItem('language')) window.localStorage.setItem('language', l);
      if (!window.localStorage.getItem('i18nextLng')) window.localStorage.setItem('i18nextLng', l);
    } catch {
      /* storage blocked */
    }
  }, lang);
}

type Dict = Record<string, unknown>;
const dicts: Record<'en' | 'ar', Dict> = {
  en: JSON.parse(readFileSync(path.join(ROOT, 'client/src/locales/en.json'), 'utf8')) as Dict,
  ar: JSON.parse(readFileSync(path.join(ROOT, 'client/src/locales/ar.json'), 'utf8')) as Dict,
};

/** The locale string for `key` with `{{vars}}` filled in and `<tag>`s removed (what the page shows as text). */
export function tr(lang: 'en' | 'ar', key: string, vars: Record<string, string | number> = {}): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Dict)[part] : undefined), dicts[lang]);
  if (typeof value !== 'string') throw new Error(`missing ${lang} string ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars[name] ?? '')).replace(/<\/?\w+>/g, '');
}

/** Visible text without the bidi isolation marks the app wraps names in. */
export const plain = (text: string) => text.replace(/[⁦-⁩‎‏]/g, '');

/** Remove everything a requester address created (bookings and what hangs off them, then the mentee). */
export async function purgeRequester(db: postgres.Sql, email: string): Promise<void> {
  const mentees = await db<{ id: string }[]>`select id from public.mentees where lower(email) = ${email.toLowerCase()}`;
  const ids = mentees.map((m) => m.id);
  if (ids.length === 0) return;
  const bookings = (await db<{ id: string }[]>`select id from public.bookings where mentee_id = any(${ids})`).map((b) => b.id);
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
    await tx`delete from public.mentor_activity_log where mentee_id = any(${ids})`;
    await tx`delete from public.mentee_favorites where mentee_id = any(${ids})`;
    await tx`delete from public.mentees where id = any(${ids})`;
  });
}

/** A pending request from a fresh requester, written directly (fixtures for admin / limit tests). */
export async function insertPendingRequest(db: postgres.Sql, opts: { mentorId: string; email: string; name: string; goal?: string; status?: string }): Promise<{ bookingId: string; menteeId: string }> {
  const [mentee] = await db<{ id: string }[]>`
    insert into public.mentees (id, name, email, user_type, timezone, languages_spoken, areas_exploring, verification_status, created_at)
    values (gen_random_uuid()::text, ${opts.name}, ${opts.email.toLowerCase()}, 'individual', 'UTC', ${['English']}, ${['Career Development']},
            'unverified', timezone('utc', now()))
    on conflict (email) do update set name = excluded.name
    returning id`;
  const [booking] = await db<{ id: string }[]>`
    insert into public.bookings (id, mentor_id, mentee_id, status, goal, clicked_at, created_at)
    values (gen_random_uuid()::text, ${opts.mentorId}, ${mentee.id}, ${opts.status ?? 'pending'},
            ${opts.goal ?? 'E2E request: help me plan the first investor meetings for our seed round.'},
            timezone('utc', now()), timezone('utc', now()))
    returning id`;
  return { bookingId: booking.id, menteeId: mentee.id };
}

/** The mentor's per-mentor Cal.com webhook secret (created as the owner's first panel view would). */
export async function webhookSecret(db: postgres.Sql, mentorId: string): Promise<string> {
  await db`insert into public.mentor_cal_webhooks (mentor_id) values (${mentorId}) on conflict (mentor_id) do nothing`;
  const [row] = await db<{ secret: string }[]>`select secret from public.mentor_cal_webhooks where mentor_id = ${mentorId}`;
  return row.secret;
}

/** A Cal.com webhook body (documented shape: triggerEvent + createdAt + payload). */
export function calWebhookBody(
  trigger: 'PING' | 'BOOKING_CREATED' | 'BOOKING_REQUESTED' | 'BOOKING_RESCHEDULED' | 'BOOKING_CANCELLED' | 'BOOKING_REJECTED',
  o: { uid?: string; start?: string; status?: string; attendees?: string[]; organizerUsername?: string; mcBooking?: string; rescheduleUid?: string } = {},
): Record<string, unknown> {
  if (trigger === 'PING') {
    return { triggerEvent: 'PING', createdAt: new Date().toISOString(), payload: { type: 'Test', title: 'Test trigger event', uid: 'ping' } };
  }
  const start = o.start ?? new Date(Date.now() + 2 * 86_400_000).toISOString();
  const end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
  return {
    triggerEvent: trigger,
    createdAt: new Date().toISOString(),
    payload: {
      uid: o.uid,
      startTime: start,
      endTime: end,
      status: o.status ?? 'ACCEPTED',
      organizer: { username: o.organizerUsername, email: 'organizer@example.com', timeZone: 'UTC' },
      attendees: (o.attendees ?? []).map((email) => ({ email, name: 'Attendee', timeZone: 'UTC' })),
      responses: { email: { label: 'Email', value: o.attendees?.[0] ?? '' } },
      metadata: o.mcBooking ? { mc_booking: o.mcBooking } : {},
      ...(o.rescheduleUid ? { rescheduleUid: o.rescheduleUid } : {}),
    },
  };
}

/** Sign a raw body the way Cal.com does (hex HMAC-SHA256 in x-cal-signature-256). */
export function calSignature(raw: string, secret: string): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

/** A Cal.com booking uid in the shape the confirm RPC accepts. */
export function calUid(tag: string): string {
  return `${tag}${randomBytes(8).toString('hex')}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}
