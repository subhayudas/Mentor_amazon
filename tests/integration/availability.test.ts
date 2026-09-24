import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { claims, mkMentor, mkUser } from './fixtures.ts';
import { asRole, asService, connect, expectPgError, withTx, type Tx } from './sql.ts';

/** I8 — set_my_availability (design §5.3 A4). */
const sql = connect();
afterAll(() => sql.end());

const SLOTS = [
  { day_of_week: 1, start_time: '09:00', end_time: '12:00' },
  { day_of_week: 3, start_time: '14:00', end_time: '17:00', is_active: false },
];

async function setup(tx: Tx) {
  const mentor = await mkMentor(tx);
  const sub = randomUUID();
  await mkUser(tx, { id: sub, email: mentor.email, user_type: 'mentor' });
  const other = await mkMentor(tx);
  const otherSub = randomUUID();
  await mkUser(tx, { id: otherSub, email: other.email, user_type: 'mentor' });
  const adminSub = randomUUID();
  await mkUser(tx, { id: adminSub, email: `admin.${randomUUID()}@mentorconnect.test`, user_type: 'admin' });
  return {
    mentor,
    asOwner: () => asRole(tx, 'authenticated', claims(sub, mentor.email)),
    asOther: () => asRole(tx, 'authenticated', claims(otherSub, other.email)),
    asAdmin: () => asRole(tx, 'authenticated', claims(adminSub, 'admin@mentorconnect.test')),
  };
}

describeDb('I8 availability', () => {
  it('the owner replaces all slots in one call; rows carry ids and created_at; the public read shows them', async () => {
    await withTx(sql, async (tx) => {
      const s = await setup(tx);
      await s.asOwner();
      await tx`select public.set_my_availability(${s.mentor.id}, ${tx.json([{ day_of_week: 5, start_time: '08:00', end_time: '09:00' }] as never)})`;
      const [{ rows }] = await tx<{ rows: Array<Record<string, unknown>> }[]>`
        select public.set_my_availability(${s.mentor.id}, ${tx.json(SLOTS as never)}) as rows`;
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(r.created_at).toBeTruthy();
        expect(r.mentor_id).toBe(s.mentor.id);
      }
      expect(rows.map((r) => [r.day_of_week, r.start_time, r.end_time, r.is_active])).toEqual([
        [1, '09:00', '12:00', true],
        [3, '14:00', '17:00', false],
      ]);
      await asRole(tx, 'anon');
      const pub = await tx`select day_of_week from public.mentor_availability where mentor_id = ${s.mentor.id} order by 1`;
      expect(pub.map((r) => r.day_of_week)).toEqual([1, 3]);
      await asService(tx);
    });
  });

  it('an invalid slot is 22023 and the previous rows stay', async () => {
    await withTx(sql, async (tx) => {
      const s = await setup(tx);
      await s.asOwner();
      await tx`select public.set_my_availability(${s.mentor.id}, ${tx.json(SLOTS as never)})`;
      const bad = [
        [{ day_of_week: 7, start_time: '09:00', end_time: '10:00' }],
        [{ day_of_week: 1, start_time: '10:00', end_time: '10:00' }],
        [{ day_of_week: 1, start_time: '11:00', end_time: '10:00' }],
        [{ day_of_week: 1, start_time: '9:00', end_time: '10:00' }],
        [{ day_of_week: 1, start_time: '09:00', end_time: '24:00' }],
        [{ day_of_week: '1; drop', start_time: '09:00', end_time: '10:00' }],
        [{ day_of_week: 1, start_time: '09:00', end_time: '10:00', is_active: 'yes' }],
        Array.from({ length: 29 }, (_, i) => ({ day_of_week: i % 7, start_time: '09:00', end_time: '10:00' })),
      ];
      for (const slots of bad) {
        await expectPgError(tx, (sp) => sp`select public.set_my_availability(${s.mentor.id}, ${sp.json(slots as never)})`, '22023', /invalid_slot/);
      }
      await expectPgError(tx, (sp) => sp`select public.set_my_availability(${s.mentor.id}, '{"not":"an array"}'::jsonb)`, '22023', /invalid_slot/);
      const [{ n }] = await tx`select count(*)::int as n from public.mentor_availability where mentor_id = ${s.mentor.id}`;
      expect(n).toBe(2);
      await asService(tx);
    });
  });

  it('another mentor gets 42501; an admin may set it', async () => {
    await withTx(sql, async (tx) => {
      const s = await setup(tx);
      await s.asOther();
      await expectPgError(tx, (sp) => sp`select public.set_my_availability(${s.mentor.id}, ${sp.json(SLOTS as never)})`, '42501', /not_allowed/);
      await asRole(tx, 'authenticated', claims(randomUUID(), 'stranger@mentorconnect.test'));
      await expectPgError(tx, (sp) => sp`select public.set_my_availability(${randomUUID()}, '[]'::jsonb)`, '42501', /not_allowed/);
      await s.asAdmin();
      const [{ rows }] = await tx<{ rows: unknown[] }[]>`select public.set_my_availability(${s.mentor.id}, ${tx.json(SLOTS as never)}) as rows`;
      expect(rows).toHaveLength(2);
      const [{ cleared }] = await tx<{ cleared: unknown[] }[]>`select public.set_my_availability(${s.mentor.id}, '[]'::jsonb) as cleared`;
      expect(cleared).toEqual([]);
      await asService(tx);
    });
  });
});
