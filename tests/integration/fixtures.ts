import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST_ANON_KEY, TEST_SERVICE_KEY, TEST_URL } from './env.ts';
import type { Sql, Tx } from './sql.ts';

/**
 * Rows and accounts for the integration suites. Row helpers write as the migration context
 * (inside the caller's transaction, so they vanish with the rollback); account helpers create
 * real GoTrue users with unique it.<rand>.<label>@mentorconnect.test addresses and remove
 * them (and every row under those addresses) in cleanup().
 */
export const rand = (n = 4) => randomBytes(n).toString('hex');
export const itEmail = (label: string) => `it.${rand()}.${label}@mentorconnect.test`;
export const GOAL = 'I would like help preparing our seed round and investor pitch.';

type Db = Sql | Tx;

export async function mkMentor(db: Db, over: Record<string, unknown> = {}): Promise<{ id: string; email: string }> {
  const id = (over.id as string) ?? randomUUID();
  const email = ((over.email as string) ?? itEmail('mentor')).toLowerCase();
  const row = {
    id,
    name: 'IT Mentor',
    email,
    timezone: 'UTC',
    bio: 'Integration test mentor',
    cal_link: 'it-mentor/30min',
    expertise: ['Testing'],
    industries: ['Software'],
    languages_spoken: ['English'],
    comms_owner: 'exec',
    is_available: true,
    managed_by_programme: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
  await db`insert into public.mentors ${db(row)}`;
  return { id, email };
}

export async function mkMentee(db: Db, over: Record<string, unknown> = {}): Promise<{ id: string; email: string }> {
  const id = (over.id as string) ?? randomUUID();
  const email = ((over.email as string) ?? itEmail('mentee')).toLowerCase();
  const row = {
    id,
    name: 'IT Mentee',
    email,
    user_type: 'individual',
    timezone: 'UTC',
    languages_spoken: ['English'],
    areas_exploring: ['Career Development'],
    created_at: new Date().toISOString(),
    ...over,
  };
  await db`insert into public.mentees ${db(row)}`;
  return { id, email };
}

export async function mkBooking(db: Db, mentorId: string, menteeId: string, over: Record<string, unknown> = {}): Promise<string> {
  const id = (over.id as string) ?? randomUUID();
  const row = { id, mentor_id: mentorId, mentee_id: menteeId, status: 'pending', goal: GOAL, created_at: new Date().toISOString(), ...over };
  await db`insert into public.bookings ${db(row)}`;
  return id;
}

export async function mkUser(db: Db, over: { id?: string; email: string; user_type: 'mentor' | 'mentee' | 'admin'; profile_id?: string | null }): Promise<string> {
  const id = over.id ?? randomUUID();
  await db`insert into public.users (id, email, password, user_type, profile_id, is_verified, created_at)
           values (${id}, ${over.email}, 'managed-by-supabase-auth', ${over.user_type}, ${over.profile_id ?? null}, true, now())`;
  return id;
}

/** JWT claims PostgREST would set for a signed-in user. */
export function claims(sub: string, email: string) {
  return { sub, email, aud: 'authenticated' };
}

// ---------------------------------------------------------------------------
// Real accounts through GoTrue + PostgREST

export function serviceClient(): SupabaseClient {
  return createClient(TEST_URL, TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): SupabaseClient {
  return createClient(TEST_URL, TEST_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * A client built on first use. Vitest still runs skipped describe bodies to collect them, and
 * createClient() throws without a URL, so suites hold lazy clients at module/describe level.
 */
export function lazyClient(make: () => SupabaseClient): SupabaseClient {
  let client: SupabaseClient | undefined;
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      client ??= make();
      const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value;
    },
  });
}

export interface Account {
  id: string;
  email: string;
  client: SupabaseClient;
}

export class Accounts {
  readonly emails: string[] = [];
  readonly authIds: string[] = [];
  readonly admin = lazyClient(serviceClient);

  /** A confirmed GoTrue user signed in with a password; optional public.users row. */
  async create(label: string, opts: { userType?: 'mentor' | 'mentee' | 'admin'; profileId?: string | null; email?: string } = {}): Promise<Account> {
    const email = (opts.email ?? itEmail(label)).toLowerCase();
    const password = `It-${rand(8)}!`;
    const { data, error } = await this.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    this.emails.push(email);
    this.authIds.push(data.user.id);
    if (opts.userType) {
      const { error: rowError } = await this.admin.from('users').insert({
        id: data.user.id,
        email,
        password: 'managed-by-supabase-auth',
        user_type: opts.userType,
        profile_id: opts.profileId ?? null,
        is_verified: true,
        created_at: new Date().toISOString(),
      });
      if (rowError) throw new Error(`users row ${email}: ${rowError.message}`);
    }
    const client = anonClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`signIn ${email}: ${signInError.message}`);
    return { id: data.user.id, email, client };
  }

  track(email: string): void {
    this.emails.push(email.toLowerCase());
  }

  /** Remove everything created under the tracked addresses, then the auth users. */
  async cleanup(sql: Sql): Promise<void> {
    const emails = this.emails;
    if (emails.length > 0) {
      await sql.begin(async (tx) => {
        const mentors = await tx<{ id: string }[]>`select id from public.mentors where lower(email) = any(${emails})`;
        const mentees = await tx<{ id: string }[]>`select id from public.mentees where lower(email) = any(${emails})`;
        const parties = [...mentors, ...mentees].map((r) => r.id);
        const bookings = await tx<{ id: string }[]>`
          select id from public.bookings where mentor_id = any(${parties}) or mentee_id = any(${parties})`;
        const bookingIds = bookings.map((b) => b.id);
        await tx`delete from public.notifications where booking_id = any(${bookingIds}) or lower(recipient_email) = any(${emails})`;
        await tx`delete from public.mentor_activity_log where booking_id = any(${bookingIds}) or mentor_id = any(${parties})`;
        await tx`delete from public.activity_events where subject_id = any(${bookingIds}) or visible_to && ${parties}::text[]`;
        await tx`delete from public.booking_notes where booking_id = any(${bookingIds})`;
        await tx`delete from public.mentor_tasks where booking_id = any(${bookingIds}) or mentor_id = any(${parties})`;
        await tx`delete from public.mentor_earnings where booking_id = any(${bookingIds}) or mentor_id = any(${parties})`;
        await tx`delete from public.bookings where id = any(${bookingIds})`;
        await tx`delete from public.mentor_availability where mentor_id = any(${parties})`;
        await tx`delete from public.mentee_favorites where mentee_id = any(${parties}) or mentor_id = any(${parties})`;
        await tx`update public.approved_users set mentor_id = null where mentor_id = any(${parties})`;
        await tx`update public.users set profile_id = null where profile_id = any(${parties})`;
        await tx`delete from public.mentors where id = any(${parties})`;
        await tx`delete from public.mentees where id = any(${parties})`;
        const users = await tx<{ id: string }[]>`select id from public.users where lower(email) = any(${emails})`;
        await tx`delete from public.user_identifiers where user_id = any(${users.map((u) => u.id)})`;
        await tx`delete from public.users where lower(email) = any(${emails})`;
        await tx`delete from public.approved_users where lower(email) = any(${emails})`;
      });
    }
    for (const id of this.authIds) await this.admin.auth.admin.deleteUser(id);
  }
}
