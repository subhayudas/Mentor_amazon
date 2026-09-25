import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { claims, mkMentee, mkMentor, mkUser } from './fixtures.ts';
import { asRole, asService, connect, withTx } from './sql.ts';
import { FEATURED_DB_IDS } from '../../client/src/data/featuredMentors.ts';

/** I3 (catalog, privilege matrix) and I4 (defaults) on the shared stack (design §6.3). */
const sql = connect();
afterAll(() => sql.end());

const ROLES = ['anon', 'authenticated', 'service_role'] as const;
type Role = (typeof ROLES)[number];

// Final state (after 0003): which API roles may EXECUTE each function (design §3.2).
const FUNCTION_MATRIX: Record<string, Role[]> = {
  'public._create_booking_request(text,text,text,text)': [],
  'public.create_booking_request(text,text,text,text)': ['service_role'],
  'public.create_my_booking_request(text,text,text)': ['authenticated'],
  'public.set_my_availability(text,jsonb)': ['authenticated'],
  'public.get_my_cal_webhook(text)': ['authenticated'],
  'public.rotate_cal_webhook_secret(text)': ['authenticated'],
  'public.cal_webhook_status()': ['authenticated'],
  'public.cal_record_delivery(text,text,text,text,text)': ['service_role'],
  'public.cal_apply_event(text,text,text,text,text,timestamptz,timestamptz,text,text[],text,text,text,text)': ['service_role'],
  'public.record_cal_booking_from_embed(text,text,timestamptz,text,text)': ['authenticated'],
  'public.guard_booking_update()': [],
  'public.bookings_activity_events()': [],
  'public.get_or_create_mentee(text,text)': ['service_role'],
  'public.notify_booking_event(text,text)': ['authenticated', 'service_role'],
  'public.my_profile_ids()': ['authenticated', 'service_role'],
  'public.recompute_mentor_rating(text)': ['authenticated', 'service_role'],
  'public.is_admin()': ['anon', 'authenticated', 'service_role'],
  'public.block_sso_password_change()': [],
};

describeDb('I3 catalog', () => {
  it('is_admin() is uid-based with a pinned search_path', async () => {
    const [{ def }] = await sql<{ def: string }[]>`select pg_get_functiondef('public.is_admin()'::regprocedure) as def`;
    expect(def).toContain('u.id = auth.uid()::text');
    expect(def).toContain('pg_temp');
    expect(def).not.toMatch(/auth\.jwt\(\)/);
  });

  it('every SECURITY DEFINER function in public pins search_path with pg_temp', async () => {
    const rows = await sql<{ proname: string }[]>`
      select proname from pg_proc
      where pronamespace = 'public'::regnamespace and prosecdef
        and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%pg_temp%')`;
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it('EXECUTE privileges match the contract for anon, authenticated and service_role', async () => {
    const actual: Record<string, Role[]> = {};
    for (const fn of Object.keys(FUNCTION_MATRIX)) {
      const [row] = await sql<Record<Role, boolean>[]>`
        select has_function_privilege('anon', ${fn}, 'EXECUTE') as anon,
               has_function_privilege('authenticated', ${fn}, 'EXECUTE') as authenticated,
               has_function_privilege('service_role', ${fn}, 'EXECUTE') as service_role`;
      actual[fn] = ROLES.filter((r) => row[r]);
    }
    expect(actual).toEqual(FUNCTION_MATRIX);
  });

  it('table privileges: anon has nothing on bookings, mentees or the Cal/ledger tables; authenticated cannot insert bookings', async () => {
    const tables = ['bookings', 'mentees', 'mentor_cal_webhooks', 'mentee_favorites', 'activity_events', 'booking_reminders', 'cal_webhook_events'];
    for (const t of tables) {
      const [row] = await sql<{ s: boolean; i: boolean; u: boolean; d: boolean }[]>`
        select has_table_privilege('anon', ${`public.${t}`}, 'SELECT') as s, has_table_privilege('anon', ${`public.${t}`}, 'INSERT') as i,
               has_table_privilege('anon', ${`public.${t}`}, 'UPDATE') as u, has_table_privilege('anon', ${`public.${t}`}, 'DELETE') as d`;
      expect({ t, ...row }).toEqual({ t, s: false, i: false, u: false, d: false });
    }
    const [auth] = await sql<{ ins: boolean; sel: boolean; upd: boolean }[]>`
      select has_table_privilege('authenticated', 'public.bookings', 'INSERT') as ins,
             has_table_privilege('authenticated', 'public.bookings', 'SELECT') as sel,
             has_table_privilege('authenticated', 'public.bookings', 'UPDATE') as upd`;
    expect(auth).toEqual({ ins: false, sel: true, upd: true });
    for (const t of ['mentor_cal_webhooks', 'schema_migrations', 'mc_settings', 'booking_cal_superseded_uids', 'reserved_mentor_ids', 'booking_request_attempts']) {
      for (const role of ['anon', 'authenticated']) {
        const [row] = await sql<{ any: boolean }[]>`
          select has_table_privilege(${role}, ${`public.${t}`}, 'SELECT,INSERT,UPDATE,DELETE') as any`;
        expect({ t, role, any: row.any }).toEqual({ t, role, any: false });
      }
    }
  });

  it('my_profile_ids() includes the profile an admin linked (users.profile_id) and the own-email rows', async () => {
    await withTx(sql, async (tx) => {
      const linked = await mkMentor(tx, { email: `linked.${randomUUID()}@mentorconnect.test` });
      const own = await mkMentee(tx);
      const sub = randomUUID();
      await mkUser(tx, { id: sub, email: own.email, user_type: 'mentor', profile_id: linked.id });
      await asRole(tx, 'authenticated', claims(sub, own.email));
      const [{ ids }] = await tx<{ ids: string[] }[]>`select public.my_profile_ids() as ids`;
      expect(ids.sort()).toEqual([linked.id, own.id].sort());
      await asRole(tx, 'authenticated', claims(randomUUID(), 'nobody@mentorconnect.test'));
      const [{ ids: none }] = await tx<{ ids: string[] }[]>`select public.my_profile_ids() as ids`;
      expect(none).toEqual([]);
      await asService(tx);
    });
  });

  it('the reserved mentor ids are exactly the featured dbIds of client/src/data/featuredMentors.ts (R1-09)', async () => {
    const rows = await sql<{ id: string }[]>`select id from public.reserved_mentor_ids order by id`;
    expect(rows.map((r) => r.id)).toEqual([...FEATURED_DB_IDS].sort());
  });

  it('a recipient may update only is_read on a notification (R1-12)', async () => {
    const [row] = await sql<{ table_update: boolean; is_read: boolean; message: boolean; recipient: boolean }[]>`
      select has_table_privilege('authenticated', 'public.notifications', 'UPDATE') as table_update,
             has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE') as is_read,
             has_column_privilege('authenticated', 'public.notifications', 'message', 'UPDATE') as message,
             has_column_privilege('authenticated', 'public.notifications', 'recipient_email', 'UPDATE') as recipient`;
    expect(row).toEqual({ table_update: false, is_read: true, message: false, recipient: false });
  });

  it('auth.users carries the trigger that refuses a password for an Amazon account (R1-37)', async () => {
    const rows = await sql<{ enabled: string; def: string }[]>`
      select t.tgenabled as enabled, pg_get_triggerdef(t.oid) as def from pg_trigger t
      where t.tgrelid = 'auth.users'::regclass and t.tgname = 'auth_users_block_sso_password'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe('O');
    expect(rows[0].def).toMatch(/BEFORE UPDATE OF encrypted_password ON auth\.users FOR EACH ROW EXECUTE FUNCTION (public\.)?block_sso_password_change\(\)/);
  });

  it('RLS is on for every public table', async () => {
    const rows = await sql<{ relname: string }[]>`
      select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describeDb('I4 defaults', () => {
  it('service-role inserts into bookings and notifications without id or created_at', async () => {
    await withTx(sql, async (tx) => {
      const m = await mkMentor(tx);
      const e = await mkMentee(tx);
      await asRole(tx, 'service_role');
      const [b] = await tx<{ id: string; created_at: string }[]>`
        insert into public.bookings (mentor_id, mentee_id, status) values (${m.id}, ${e.id}, 'pending') returning id, created_at::text`;
      expect(b.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(b.created_at).toBeTruthy();
      const [n] = await tx<{ id: string }[]>`
        insert into public.notifications (recipient_email, recipient_type, type, title, message, booking_id)
        values ('x@mentorconnect.test', 'mentor', 'reminder', 't', 'm', ${b.id}) returning id`;
      expect(n.id).toMatch(/^[0-9a-f-]{36}$/);
      for (const table of ['mentees', 'mentor_activity_log', 'booking_notes', 'mentor_tasks', 'mentor_availability']) {
        const [{ def }] = await tx<{ def: string }[]>`
          select column_default as def from information_schema.columns
          where table_schema = 'public' and table_name = ${table} and column_name = 'id'`;
        expect({ table, def }).toEqual({ table, def: '(gen_random_uuid())::text' });
      }
      await asService(tx);
    });
  });
});
