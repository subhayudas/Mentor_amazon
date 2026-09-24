import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { describeDb } from './env.ts';
import { Accounts, claims, itEmail, mkBooking, mkMentee, mkMentor, mkUser } from './fixtures.ts';
import { asRole, asService, connect, expectPgError, withTx, type Sql, type Tx } from './sql.ts';

/** I9 — cal_apply_event, one test per row of the design §3.3 transition table, plus the edges. */
const sql = connect();
const accounts = new Accounts();
afterAll(async () => {
  await accounts.cleanup(sql);
  await sql.end();
});

type Db = Sql | Tx;
interface Delivery {
  mentor?: string | null;
  trigger: string;
  uid: string;
  reschedule?: string | null;
  start?: string;
  status?: string | null;
  emails?: string[];
  mc?: string | null;
  org?: string | null;
  reason?: string | null;
  delivery?: string;
}
type Result = { outcome: string; booking_id: string | null; changed: boolean };

async function apply(db: Db, d: Delivery): Promise<Result> {
  const start = d.start ?? '2026-10-01T10:00:00Z';
  const end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
  const [{ r }] = await db<{ r: Result }[]>`
    select public.cal_apply_event(${d.delivery ?? randomUUID()}, ${d.mentor ?? null}, ${d.trigger}, ${d.uid}, ${d.reschedule ?? null},
      ${start}, ${end}, ${d.status === undefined ? 'ACCEPTED' : d.status}, ${d.emails ?? []}, ${d.mc ?? null},
      ${d.org === undefined ? 'jane.doe' : d.org}, ${d.reason ?? null}, 'sha256-test') as r`;
  return r;
}

async function world(db: Db, opts: { calLink?: string } = {}) {
  const mentor = await mkMentor(db, { cal_link: opts.calLink ?? 'jane.doe/30min', name: 'Jane Doe' });
  const mentee = await mkMentee(db, { name: 'Omar' });
  return { mentor, mentee };
}

async function booking(db: Db, id: string) {
  const [b] = await db`select status, scheduled_at::text, cal_event_uri, cal_status, cal_requested_start::text, canceled_by,
                              canceled_at is not null as canceled, responded_at is not null as responded
                       from public.bookings where id = ${id}`;
  return b;
}

async function reminders(db: Db, id: string) {
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from public.booking_reminders where booking_id = ${id}`;
  return n;
}

async function notes(db: Db, id: string) {
  return db<{ recipient_email: string; type: string; title: string }[]>`
    select recipient_email, type, title from public.notifications where booking_id = ${id} order by recipient_email`;
}

describeDb('I9 transition table', () => {
  it('CREATED/REQUESTED + PENDING on an accepted request → requested', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_REQUESTED', uid: 'reqUid001', status: null, emails: [mentee.email], mc: id });
      expect(r).toEqual({ outcome: 'requested', booking_id: id, changed: true });
      expect(await booking(tx, id)).toMatchObject({ status: 'accepted', cal_event_uri: 'reqUid001', cal_status: 'requested', cal_requested_start: '2026-10-01 10:00:00', scheduled_at: null });
      const again = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_REQUESTED', uid: 'reqUid001', status: 'PENDING', emails: [mentee.email] });
      expect(again.outcome).toBe('no_change');
    });
  });

  it('CREATED (ACCEPTED) on an accepted request → confirmed, mentor notified', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'creUid001', start: '2026-10-01T14:00:00+04:00', emails: [mentee.email], mc: id });
      expect(r).toEqual({ outcome: 'confirmed', booking_id: id, changed: true });
      expect(await booking(tx, id)).toMatchObject({ status: 'confirmed', scheduled_at: '2026-10-01 10:00:00', cal_event_uri: 'creUid001', cal_status: 'accepted', responded: true });
      expect(await notes(tx, id)).toEqual([{ recipient_email: mentor.email, type: 'booking_confirmed', title: 'Session scheduled' }]);
    });
  });

  it('CREATED (ACCEPTED) on a confirmed booking with the same uid → no_change, or rescheduled when the time differs', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'sameUid01', scheduled_at: '2026-10-01 10:00:00' });
      await tx`insert into public.booking_reminders (booking_id, kind) values (${id}, '24h')`;
      expect((await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'sameUid01', emails: [mentee.email] })).outcome).toBe('no_change');
      expect(await reminders(tx, id)).toBe(1);
      const moved = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'sameUid01', start: '2026-10-02T10:00:00Z', emails: [mentee.email] });
      expect(moved.outcome).toBe('rescheduled');
      expect(await booking(tx, id)).toMatchObject({ scheduled_at: '2026-10-02 10:00:00' });
      expect(await reminders(tx, id)).toBe(0);
    });
  });

  it('REJECTED on a requested time (matched by uid) → rejected; the mentee is told to choose another time', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted', cal_event_uri: 'rejUid001', cal_status: 'requested', cal_requested_start: '2026-10-01 10:00:00' });
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_REJECTED', uid: 'rejUid001', status: 'REJECTED', emails: [mentee.email] });
      expect(r).toEqual({ outcome: 'rejected', booking_id: id, changed: true });
      expect(await booking(tx, id)).toMatchObject({ status: 'accepted', cal_status: 'rejected', cal_event_uri: null, cal_requested_start: null });
      expect(await notes(tx, id)).toEqual([{ recipient_email: mentee.email, type: 'booking_accepted', title: 'Choose another time' }]);
    });
  });

  it('CANCELLED on a confirmed booking → canceled by cal, reminders cleared, both parties notified', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'canUid001', cal_status: 'accepted', scheduled_at: '2026-10-01 10:00:00' });
      await tx`insert into public.booking_reminders (booking_id, kind) values (${id}, '24h')`;
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CANCELLED', uid: 'canUid001', status: 'CANCELLED', reason: 'Travel' });
      expect(r).toEqual({ outcome: 'canceled', booking_id: id, changed: true });
      expect(await booking(tx, id)).toMatchObject({ status: 'canceled', canceled_by: 'cal', cal_status: 'cancelled', canceled: true });
      expect(await reminders(tx, id)).toBe(0);
      const n = await notes(tx, id);
      expect(n.map((x) => [x.recipient_email, x.type, x.title]).sort()).toEqual(
        [[mentor.email, 'booking_canceled', 'Session cancelled on Cal.com'], [mentee.email, 'booking_canceled', 'Session cancelled on Cal.com']].sort(),
      );
    });
  });

  it('CANCELLED while the Cal booking is only pending → cal_booking_released (the acceptance stands)', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted', cal_event_uri: 'relUid001', cal_status: 'requested', cal_requested_start: '2026-10-01 10:00:00' });
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CANCELLED', uid: 'relUid001', status: 'CANCELLED' });
      expect(r.outcome).toBe('cal_booking_released');
      expect(await booking(tx, id)).toMatchObject({ status: 'accepted', cal_event_uri: null, cal_status: 'cancelled', cal_requested_start: null });
    });
  });

  it('RESCHEDULED (ACCEPTED) on a confirmed booking → same row, new uid and time, reminders cleared, both told', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'oldUid001', scheduled_at: '2026-10-01 10:00:00' });
      await tx`insert into public.booking_reminders (booking_id, kind) values (${id}, '1h')`;
      const [{ before }] = await tx<{ before: number }[]>`select count(*)::int as before from public.bookings`;
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: 'newUid001', reschedule: 'oldUid001', start: '2026-10-05T08:00:00Z' });
      expect(r).toEqual({ outcome: 'rescheduled', booking_id: id, changed: true });
      expect(await booking(tx, id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'newUid001', scheduled_at: '2026-10-05 08:00:00' });
      expect(await reminders(tx, id)).toBe(0);
      const [{ after }] = await tx<{ after: number }[]>`select count(*)::int as after from public.bookings`;
      expect(after).toBe(before);
      expect((await notes(tx, id)).map((x) => x.title)).toEqual(['Session moved', 'Session moved']);
    });
  });

  it('RESCHEDULED (PENDING) on a confirmed booking → reschedule_requested', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'oldUid002', scheduled_at: '2026-10-01 10:00:00' });
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: 'newUid002', reschedule: 'oldUid002', status: 'PENDING', start: '2026-10-06T08:00:00Z' });
      expect(r.outcome).toBe('reschedule_requested');
      expect(await booking(tx, id)).toMatchObject({ status: 'accepted', cal_status: 'requested', cal_requested_start: '2026-10-06 08:00:00', scheduled_at: null, cal_event_uri: 'newUid002' });
    });
  });

  it('a reschedule of a still-requested time: PENDING → requested, ACCEPTED → confirmed', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted', cal_event_uri: 'oldUid003', cal_status: 'requested', cal_requested_start: '2026-10-01 10:00:00' });
      const pending = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: 'midUid003', reschedule: 'oldUid003', status: 'PENDING', start: '2026-10-07T08:00:00Z' });
      expect(pending.outcome).toBe('requested');
      expect(await booking(tx, id)).toMatchObject({ cal_event_uri: 'midUid003', cal_requested_start: '2026-10-07 08:00:00', status: 'accepted' });
      const accepted = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: 'newUid003', reschedule: 'midUid003', start: '2026-10-08T08:00:00Z' });
      expect(accepted.outcome).toBe('confirmed');
      expect(await booking(tx, id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'newUid003', scheduled_at: '2026-10-08 08:00:00', cal_status: 'accepted' });
    });
  });

  it('CANCELLED(old) before RESCHEDULED(new) revives the session (rescheduled_revived)', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'oldUid004', scheduled_at: '2026-10-01 10:00:00' });
      expect((await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CANCELLED', uid: 'oldUid004', status: 'CANCELLED' })).outcome).toBe('canceled');
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: 'newUid004', reschedule: 'oldUid004', start: '2026-10-09T08:00:00Z' });
      expect(r).toEqual({ outcome: 'rescheduled_revived', booking_id: id, changed: true });
      expect(await booking(tx, id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'newUid004', scheduled_at: '2026-10-09 08:00:00', canceled_by: null, canceled: false });
    });
  });

  it('stale states and person-made cancellations never change: stale_state', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      for (const [status, extra] of [
        ['pending', {}],
        ['rejected', {}],
        ['completed', {}],
        ['canceled', { canceled_by: 'mentee', canceled_at: '2026-09-20 10:00:00' }],
      ] as const) {
        const uid = `stale${status}01`;
        const id = await mkBooking(tx, mentor.id, mentee.id, { status, cal_event_uri: uid, ...extra });
        const created = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid });
        expect({ status, outcome: created.outcome }).toEqual({ status, outcome: status === 'canceled' ? 'stale_state' : 'stale_state' });
        const moved = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: `${uid}x`, reschedule: uid });
        expect(moved.outcome).toBe('stale_state');
        expect((await booking(tx, id)).status).toBe(status);
      }
    });
  });
});

describeDb('I9 matching and safety', () => {
  it('a replay is duplicate with zero writes', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      const delivery = `replay-${randomUUID()}`;
      await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'repUid001', emails: [mentee.email], mc: id, delivery });
      const [{ events }] = await tx<{ events: number }[]>`select count(*)::int as events from public.activity_events where subject_id = ${id}`;
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'repUid001', emails: [mentee.email], mc: id, delivery });
      expect(r).toEqual({ outcome: 'duplicate', booking_id: null, changed: false });
      const [{ events: after }] = await tx<{ events: number }[]>`select count(*)::int as events from public.activity_events where subject_id = ${id}`;
      expect(after).toBe(events);
      const [{ rows }] = await tx<{ rows: number }[]>`select count(*)::int as rows from public.cal_webhook_events where id = ${delivery}`;
      expect(rows).toBe(1);
    });
  });

  it('a booking made directly on Cal.com is recorded, never inserted (even for an unregistered attendee)', async () => {
    await withTx(sql, async (tx) => {
      const { mentor } = await world(tx);
      const [{ before }] = await tx<{ before: number }[]>`select count(*)::int as before from public.bookings`;
      const delivery = randomUUID();
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'dirUid001', emails: ['walk-in@example.com'], delivery });
      expect(r).toEqual({ outcome: 'unmatched_direct_booking', booking_id: null, changed: false });
      const [{ after }] = await tx<{ after: number }[]>`select count(*)::int as after from public.bookings`;
      expect(after).toBe(before);
      const [ev] = await tx`select outcome, mentor_id, processed_at is not null as processed from public.cal_webhook_events where id = ${delivery}`;
      expect(ev).toEqual({ outcome: 'unmatched_direct_booking', mentor_id: mentor.id, processed: true });
    });
  });

  it('organizer_mismatch: john is not johnny; usernames with _ and . match exactly', async () => {
    await withTx(sql, async (tx) => {
      const johnny = await mkMentor(tx, { cal_link: 'johnny/15min' });
      expect((await apply(tx, { mentor: johnny.id, trigger: 'BOOKING_CREATED', uid: 'orgUid001', org: 'john' })).outcome).toBe('organizer_mismatch');
      const dotted = await mkMentor(tx, { cal_link: 'jane.doe_2/30min' });
      expect((await apply(tx, { mentor: dotted.id, trigger: 'BOOKING_CREATED', uid: 'orgUid002', org: 'jane.doe_2' })).outcome).toBe('unmatched_direct_booking');
      expect((await apply(tx, { mentor: dotted.id, trigger: 'BOOKING_CREATED', uid: 'orgUid003', org: 'jane_doe_2' })).outcome).toBe('organizer_mismatch');
      const urlLink = await mkMentor(tx, { cal_link: 'https://cal.com/Sam/30min' });
      expect((await apply(tx, { mentor: urlLink.id, trigger: 'BOOKING_CREATED', uid: 'orgUid004', org: 'sam' })).outcome).toBe('unmatched_direct_booking');
      const team = await mkMentor(tx, { cal_link: 'team/brinc/intro' });
      expect((await apply(tx, { mentor: team.id, trigger: 'BOOKING_CREATED', uid: 'orgUid005', org: 'anyone' })).outcome).toBe('unmatched_direct_booking');
    });
  });

  it('a forged mc_booking (another mentor\'s booking, or the wrong attendee) matches nothing', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const other = await mkMentor(tx, { cal_link: 'other/30min' });
      const victim = await mkBooking(tx, other.id, mentee.id, { status: 'accepted' });
      const r = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'forUid001', emails: [mentee.email], mc: victim });
      expect(r.outcome).toBe('unmatched_direct_booking');
      expect((await booking(tx, victim)).status).toBe('accepted');
      const own = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      const wrongAttendee = await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'forUid002', emails: ['intruder@example.com'], mc: own });
      expect(wrongAttendee.outcome).toBe('unmatched_direct_booking');
      expect((await booking(tx, own)).status).toBe('accepted');
      // global path: the metadata booking is the only way to find the mentor, and it fails the cross-check
      const globalForged = await apply(tx, { mentor: null, trigger: 'BOOKING_CREATED', uid: 'forUid003', emails: ['intruder@example.com'], mc: own, org: null });
      expect(globalForged.outcome).toBe('unmatched');
    });
  });

  it('the global path finds the mentor from a cross-checked mc_booking, or from a unique organizer username', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx, { calLink: `glob${randomUUID().slice(0, 8)}/30min` });
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      const viaMeta = await apply(tx, { mentor: null, trigger: 'BOOKING_CREATED', uid: 'gloUid001', emails: [mentee.email], mc: id, org: null });
      expect(viaMeta).toEqual({ outcome: 'confirmed', booking_id: id, changed: true });
      const second = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      const username = (await tx`select split_part(cal_link, '/', 1) as u from public.mentors where id = ${mentor.id}`)[0].u as string;
      const viaOrg = await apply(tx, { mentor: null, trigger: 'BOOKING_CREATED', uid: 'gloUid002', emails: [mentee.email], org: username });
      expect(viaOrg).toEqual({ outcome: 'confirmed', booking_id: second, changed: true });
    });
  });

  it('two accepted requests from the same attendee without metadata → ambiguous', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      expect((await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'ambUid001', emails: [mentee.email] })).outcome).toBe('ambiguous');
      const single = await mkMentor(tx, { cal_link: 'jane.doe/15min' });
      const only = await mkBooking(tx, single.id, mentee.id, { status: 'accepted' });
      expect(await apply(tx, { mentor: single.id, trigger: 'BOOKING_CREATED', uid: 'ambUid002', emails: ['x@example.com', mentee.email.toUpperCase()] })).toEqual({ outcome: 'confirmed', booking_id: only, changed: true });
    });
  });

  it('CANCELLED for an unknown uid leaves an open request alone; CREATED after CANCELLED does not resurrect', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const open = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      expect((await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CANCELLED', uid: 'unkUid001', status: 'CANCELLED', emails: [mentee.email], mc: open })).outcome).toBe('unmatched');
      expect(await booking(tx, open)).toMatchObject({ status: 'accepted', cal_event_uri: null });
      const done = await mkBooking(tx, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'resUid001', scheduled_at: '2026-10-01 10:00:00' });
      await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CANCELLED', uid: 'resUid001', status: 'CANCELLED' });
      expect((await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'resUid001', emails: [mentee.email] })).outcome).toBe('stale_state');
      expect((await booking(tx, done)).status).toBe('canceled');
    });
  });

  it('only the service context may call it; last-delivery fields and counts are updated', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      await tx`insert into public.mentor_cal_webhooks (mentor_id) values (${mentor.id})`;
      await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'lstUid001', emails: [mentee.email] });
      const [w] = await tx`select last_trigger, last_outcome, deliveries_total, last_delivery_at is not null as delivered from public.mentor_cal_webhooks where mentor_id = ${mentor.id}`;
      expect(w).toEqual({ last_trigger: 'BOOKING_CREATED', last_outcome: 'confirmed', deliveries_total: 1, delivered: true });
      await asRole(tx, 'authenticated', claims(randomUUID(), mentee.email));
      await expectPgError(tx, (sp) => apply(sp, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'lstUid002' }), '42501');
    });
  });

  it('crash safety: a failure anywhere rolls the whole delivery back, and a re-delivery then succeeds', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      await tx.unsafe(`
        create function pg_temp.it_explode() returns trigger language plpgsql as $$
        begin if new.subject_id = '${id}' and new.type = 'booking_confirmed' then raise exception 'boom'; end if; return new; end $$;
        create trigger it_explode before insert on public.activity_events for each row execute function pg_temp.it_explode();`);
      const delivery = `crash-${randomUUID()}`;
      await expectPgError(tx, (sp) => apply(sp, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'crsUid001', emails: [mentee.email], mc: id, delivery }), 'P0001', /boom/);
      expect(await booking(tx, id)).toMatchObject({ status: 'accepted', cal_event_uri: null });
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.cal_webhook_events where id = ${delivery}`;
      expect(n).toBe(0);
      expect(await notes(tx, id)).toEqual([]);
      await tx.unsafe('drop trigger it_explode on public.activity_events');
      expect((await apply(tx, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: 'crsUid001', emails: [mentee.email], mc: id, delivery })).outcome).toBe('confirmed');
    });
  });
});

/**
 * Provenance (design §3.2/§3.3, extended): the uid and start of record_cal_booking_from_embed come
 * from the mentee's browser; the HMAC-verified webhook is the authority. It records the uid it
 * vouched for (cal_verified_uid), corrects whatever the browser recorded for the same booking, and
 * the browser never overwrites a verified booking — whichever arrives first.
 */
describeDb('I9 provenance: the signed webhook is authoritative, in both arrival orders', () => {
  /** A whole-hour UTC instant `days` from now, and how the timestamp columns render it. */
  const at = (days: number, hour = 10) => {
    const d = new Date(Date.now() + days * 86_400_000);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const wall = (iso: string) => iso.replace('T', ' ').slice(0, 19);

  async function setup(tx: Tx) {
    const { mentor, mentee } = await world(tx);
    const sub = randomUUID();
    await mkUser(tx, { id: sub, email: mentee.email, user_type: 'mentee' });
    const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
    return { mentor, mentee, sub, id };
  }

  /** record_cal_booking_from_embed as the booking's mentee (PostgREST's role and claims). */
  async function embed(tx: Tx, w: { sub: string; mentee: { email: string }; id: string }, uid: string, start: string,
                       status = 'ACCEPTED', reschedule: string | null = null): Promise<string> {
    await asRole(tx, 'authenticated', claims(w.sub, w.mentee.email));
    const [{ r }] = await tx<{ r: { outcome: string } }[]>`
      select public.record_cal_booking_from_embed(${w.id}, ${uid}, ${start}, ${status}, ${reschedule}) as r`;
    await asService(tx);
    return r.outcome;
  }

  async function verifiedUid(tx: Tx, id: string): Promise<string | null> {
    const [{ v }] = await tx<{ v: string | null }[]>`select cal_verified_uid as v from public.bookings where id = ${id}`;
    return v;
  }

  it('embed first, honest: the webhook verifies the same uid and start (no_change); the browser can no longer change it', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      const s1 = at(7);
      expect(await embed(tx, w, 'pvHonest01', s1)).toBe('confirmed');
      expect(await verifiedUid(tx, w.id)).toBeNull();
      const r = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_CREATED', uid: 'pvHonest01', start: s1, emails: [w.mentee.email], mc: w.id });
      expect(r).toEqual({ outcome: 'no_change', booking_id: w.id, changed: false });
      expect(await verifiedUid(tx, w.id)).toBe('pvHonest01');
      // Now the browser can neither move the time nor swap the uid, not even as a "reschedule".
      expect(await embed(tx, w, 'pvHonest01', at(9))).toBe('already_recorded');
      expect(await embed(tx, w, 'pvHonest02', at(9), 'ACCEPTED', 'pvHonest01')).toBe('already_recorded');
      expect(await booking(tx, w.id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'pvHonest01', scheduled_at: wall(s1) });
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.activity_events where subject_id = ${w.id} and type = 'booking_confirmed'`;
      expect(n).toBe(1);
    });
  });

  it('embed first with a fabricated uid and time: the delivery matched through metadata puts Cal.com\'s uid and start in place', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      expect(await embed(tx, w, 'pvFake0001', at(3, 6))).toBe('confirmed');
      await tx`insert into public.booking_reminders (booking_id, kind) values (${w.id}, '24h')`;
      const real = at(8, 12);
      const r = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_CREATED', uid: 'pvReal0001', start: real, emails: [w.mentee.email], mc: w.id });
      expect(r).toEqual({ outcome: 'rescheduled', booking_id: w.id, changed: true });
      expect(await booking(tx, w.id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'pvReal0001', scheduled_at: wall(real), cal_status: 'accepted', cal_requested_start: null });
      expect(await verifiedUid(tx, w.id)).toBe('pvReal0001');
      expect(await reminders(tx, w.id)).toBe(0);
      const moved = (await notes(tx, w.id)).filter((x) => x.title === 'Session moved').map((x) => x.recipient_email).sort();
      expect(moved).toEqual([w.mentor.email, w.mentee.email].sort());
      // The corrected booking is verified: the fabricated uid cannot come back from the browser.
      await asRole(tx, 'authenticated', claims(w.sub, w.mentee.email));
      await expectPgError(tx, (sp) => sp`select public.record_cal_booking_from_embed(${w.id}, 'pvFake0001', ${at(3, 6)}, 'ACCEPTED')`, '22023', /invalid_state/);
      await asService(tx);
    });
  });

  it('embed first with the right time but another uid: corrected to Cal.com\'s uid without a "moved" notification; no metadata, no match', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      const s1 = at(5);
      expect(await embed(tx, w, 'pvWrongUid', s1)).toBe('confirmed');
      const r = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_CREATED', uid: 'pvRightUid', start: s1, emails: [w.mentee.email], mc: w.id });
      expect(r).toEqual({ outcome: 'confirmed', booking_id: w.id, changed: true });
      expect(await booking(tx, w.id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'pvRightUid', scheduled_at: wall(s1) });
      expect(await verifiedUid(tx, w.id)).toBe('pvRightUid');
      expect((await notes(tx, w.id)).filter((x) => x.title === 'Session moved')).toEqual([]);
      // Without metadata.mc_booking there is no exact link to the booking the browser confirmed.
      const other = await mkBooking(tx, w.mentor.id, w.mentee.id, { status: 'accepted' });
      expect(await embed(tx, { ...w, id: other }, 'pvNoMeta01', at(6))).toBe('confirmed');
      const noMeta = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_CREATED', uid: 'pvNoMeta02', start: at(6), emails: [w.mentee.email] });
      expect(noMeta.outcome).toBe('unmatched_direct_booking');
      expect(await booking(tx, other)).toMatchObject({ cal_event_uri: 'pvNoMeta01' });
    });
  });

  it('embed first says ACCEPTED, the delivery says the time waits for the mentor: back to requested, then confirmed by Cal.com', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      const s1 = at(4);
      expect(await embed(tx, w, 'pvPending1', s1)).toBe('confirmed');
      const pending = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_REQUESTED', uid: 'pvPending1', start: s1, status: null, emails: [w.mentee.email], mc: w.id });
      expect(pending).toEqual({ outcome: 'requested', booking_id: w.id, changed: true });
      expect(await booking(tx, w.id)).toMatchObject({ status: 'accepted', cal_status: 'requested', cal_requested_start: wall(s1), scheduled_at: null, cal_event_uri: 'pvPending1' });
      expect(await verifiedUid(tx, w.id)).toBe('pvPending1');
      const [{ types }] = await tx<{ types: string[] }[]>`
        select array_agg(type order by created_at, type) as types from public.activity_events where subject_id = ${w.id}`;
      expect(types).toContain('booking_time_requested');
      const created = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_CREATED', uid: 'pvPending1', start: s1, emails: [w.mentee.email], mc: w.id });
      expect(created.outcome).toBe('confirmed');
      expect(await booking(tx, w.id)).toMatchObject({ status: 'confirmed', scheduled_at: wall(s1), cal_status: 'accepted' });
    });
  });

  it('embed first reschedules to a fabricated uid: the RESCHEDULED delivery finds the booking through metadata and corrects it', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      expect(await embed(tx, w, 'pvResOld01', at(3))).toBe('confirmed');
      expect(await embed(tx, w, 'pvResFake1', at(4), 'ACCEPTED', 'pvResOld01')).toBe('rescheduled');
      const real = at(6, 15);
      const r = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: 'pvResReal1', reschedule: 'pvResOld01', start: real, emails: [w.mentee.email], mc: w.id });
      expect(r).toEqual({ outcome: 'rescheduled', booking_id: w.id, changed: true });
      expect(await booking(tx, w.id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'pvResReal1', scheduled_at: wall(real) });
      expect(await verifiedUid(tx, w.id)).toBe('pvResReal1');
      // A forged hint (an attendee who is not the booking's mentee) still matches nothing.
      const forged = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: 'pvResForg1', reschedule: 'pvNope0001', start: at(9), emails: ['intruder@example.com'], mc: w.id });
      expect(forged.outcome).toBe('unmatched');
      expect(await booking(tx, w.id)).toMatchObject({ cal_event_uri: 'pvResReal1' });
    });
  });

  it('webhook first: the embed never overwrites what the webhook recorded; the next delivery still applies', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      const s1 = at(7);
      const r = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_CREATED', uid: 'pvHook0001', start: s1, emails: [w.mentee.email], mc: w.id });
      expect(r).toEqual({ outcome: 'confirmed', booking_id: w.id, changed: true });
      expect(await verifiedUid(tx, w.id)).toBe('pvHook0001');
      expect(await embed(tx, w, 'pvHook0001', at(9))).toBe('already_recorded');
      expect(await embed(tx, w, 'pvHook0003', at(10), 'ACCEPTED', 'pvHook0001')).toBe('already_recorded');
      await asRole(tx, 'authenticated', claims(w.sub, w.mentee.email));
      await expectPgError(tx, (sp) => sp`select public.record_cal_booking_from_embed(${w.id}, 'pvHook0002', ${at(9)}, 'ACCEPTED')`, '22023', /invalid_state/);
      await asService(tx);
      expect(await booking(tx, w.id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'pvHook0001', scheduled_at: wall(s1) });
      const moved = at(11, 9);
      const resched = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_RESCHEDULED', uid: 'pvHook0004', reschedule: 'pvHook0001', start: moved, emails: [w.mentee.email], mc: w.id });
      expect(resched).toEqual({ outcome: 'rescheduled', booking_id: w.id, changed: true });
      expect(await booking(tx, w.id)).toMatchObject({ cal_event_uri: 'pvHook0004', scheduled_at: wall(moved) });
      expect(await verifiedUid(tx, w.id)).toBe('pvHook0004');
    });
  });

  it('webhook first on a requires-confirmation event: the browser can neither confirm nor move the requested time', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      const s1 = at(5);
      const req = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_REQUESTED', uid: 'pvReq00001', start: s1, status: 'PENDING', emails: [w.mentee.email], mc: w.id });
      expect(req).toEqual({ outcome: 'requested', booking_id: w.id, changed: true });
      expect(await embed(tx, w, 'pvReq00001', s1, 'ACCEPTED')).toBe('already_recorded');
      expect(await embed(tx, w, 'pvReq00001', at(6), 'PENDING')).toBe('already_recorded');
      expect(await booking(tx, w.id)).toMatchObject({ status: 'accepted', cal_status: 'requested', cal_requested_start: wall(s1), scheduled_at: null });
      // Cal.com rejects the time: the booking is free again, and a new pick from the browser is recorded.
      const rej = await apply(tx, { mentor: w.mentor.id, trigger: 'BOOKING_REJECTED', uid: 'pvReq00001', status: 'REJECTED' });
      expect(rej.outcome).toBe('rejected');
      expect(await verifiedUid(tx, w.id)).toBeNull();
      expect(await embed(tx, w, 'pvReq00002', at(8), 'PENDING')).toBe('requested');
      expect(await booking(tx, w.id)).toMatchObject({ cal_status: 'requested', cal_event_uri: 'pvReq00002' });
    });
  });

  it('nobody writes cal_verified_uid through PostgREST, not even while legacy writes are allowed', async () => {
    await withTx(sql, async (tx) => {
      const w = await setup(tx);
      await tx`update public.bookings set status = 'confirmed', cal_event_uri = 'pvGuard001', scheduled_at = ${wall(at(5))} where id = ${w.id}`;
      for (const legacy of ['blocked', 'allowed']) {
        await asService(tx);
        await tx`insert into public.mc_settings (key, value) values ('legacy_booking_writes', ${legacy})
                 on conflict (key) do update set value = excluded.value`;
        await asRole(tx, 'authenticated', claims(w.sub, w.mentee.email));
        await expectPgError(tx, (sp) => sp`update public.bookings set cal_verified_uid = 'pvGuard001' where id = ${w.id}`, '42501', /forbidden_column_change/);
      }
      await asService(tx);
      expect(await verifiedUid(tx, w.id)).toBeNull();
    });
  });
});

describeDb('I9 concurrency (committed rows, separate connections)', () => {
  async function committedWorld() {
    const mentorEmail = itEmail('conc-mentor');
    const menteeEmail = itEmail('conc-mentee');
    accounts.track(mentorEmail);
    accounts.track(menteeEmail);
    const mentor = await mkMentor(sql, { email: mentorEmail, cal_link: 'jane.doe/30min' });
    const mentee = await mkMentee(sql, { email: menteeEmail });
    return { mentor, mentee };
  }

  it('two identical deliveries at once: one change, one activity row, one duplicate', async () => {
    const { mentor, mentee } = await committedWorld();
    const id = await mkBooking(sql, mentor.id, mentee.id, { status: 'accepted' });
    const delivery = `conc-${randomUUID()}`;
    const d = { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid: `concUid${randomUUID().slice(0, 8)}`, emails: [mentee.email], mc: id, delivery };
    const results = await Promise.all([apply(sql, d), apply(sql, d)]);
    expect(results.map((r) => r.outcome).sort()).toEqual(['confirmed', 'duplicate']);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.activity_events where subject_id = ${id} and type = 'booking_confirmed'`;
    expect(n).toBe(1);
  });

  it('the embed confirmation and the webhook racing: one confirmed state, one activity row', async () => {
    const { mentor, mentee } = await committedWorld();
    const sub = randomUUID();
    const id = await mkBooking(sql, mentor.id, mentee.id, { status: 'accepted' });
    const uid = `raceUid${randomUUID().slice(0, 8)}`;
    // Both report the same Cal.com booking, so the same start: a different one would be a real
    // correction by the webhook ('rescheduled') whenever the embed happened to commit first.
    const start = new Date(Date.now() + 7 * 86_400_000);
    start.setUTCSeconds(0, 0);
    const [embed, hook] = await Promise.all([
      sql.begin(async (tx) => {
        await mkUser(tx, { id: sub, email: `race.user.${randomUUID()}@mentorconnect.test`, user_type: 'mentee' });
        await asRole(tx, 'authenticated', claims(sub, mentee.email));
        const [{ r }] = await tx<{ r: { outcome: string } }[]>`select public.record_cal_booking_from_embed(${id}, ${uid}, ${start.toISOString()}, 'ACCEPTED') as r`;
        await tx`reset role`;
        await tx`delete from public.users where id = ${sub}`;
        return r.outcome;
      }),
      apply(sql, { mentor: mentor.id, trigger: 'BOOKING_CREATED', uid, start: start.toISOString(), emails: [mentee.email], mc: id }).then((r) => r.outcome),
    ]);
    expect([embed, hook].sort()).toEqual(expect.arrayContaining(['confirmed']));
    expect(['already_recorded', 'no_change']).toContain([embed, hook].find((o) => o !== 'confirmed'));
    expect(await booking(sql, id)).toMatchObject({ status: 'confirmed', cal_event_uri: uid });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.activity_events where subject_id = ${id} and type = 'booking_confirmed'`;
    expect(n).toBe(1);
  });
});

describeDb('I10 record_cal_booking_from_embed input checks (the values come from the browser)', () => {
  it('only the mentee may record; the uid is shaped; the start must lie in the bookable window; a uid is never shared', async () => {
    await withTx(sql, async (tx) => {
      const { mentor, mentee } = await world(tx);
      const id = await mkBooking(tx, mentor.id, mentee.id, { status: 'accepted' });
      const other = await mkBooking(tx, mentor.id, mentee.id, { status: 'confirmed', cal_event_uri: 'takenUid001', scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString() });
      expect(other).toBeTruthy();
      const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
      const menteeSub = randomUUID();
      const mentorSub = randomUUID();
      await mkUser(tx, { id: menteeSub, email: mentee.email, user_type: 'mentee' });
      await mkUser(tx, { id: mentorSub, email: mentor.email, user_type: 'mentor' });

      await asRole(tx, 'authenticated', claims(mentorSub, mentor.email));
      await expectPgError(tx, (sp) => sp`select public.record_cal_booking_from_embed(${id}, 'embedUid100', ${inDays(2)}, 'ACCEPTED')`, '42501', /not_allowed/);

      await asRole(tx, 'authenticated', claims(menteeSub, mentee.email));
      await expectPgError(tx, (sp) => sp`select public.record_cal_booking_from_embed(${id}, 'bad uid!', ${inDays(2)}, 'ACCEPTED')`, '22023', /invalid_uid/);
      await expectPgError(tx, (sp) => sp`select public.record_cal_booking_from_embed(${id}, 'embedUid100', ${inDays(-2)}, 'ACCEPTED')`, '22023', /invalid_state/);
      await expectPgError(tx, (sp) => sp`select public.record_cal_booking_from_embed(${id}, 'embedUid100', ${inDays(400)}, 'ACCEPTED')`, '22023', /invalid_state/);
      await expectPgError(tx, (sp) => sp`select public.record_cal_booking_from_embed(${id}, 'takenUid001', ${inDays(2)}, 'ACCEPTED')`, '23505', /uid_in_use/);
      const [{ r }] = await tx<{ r: { outcome: string } }[]>`select public.record_cal_booking_from_embed(${id}, 'embedUid100', ${inDays(2)}, 'ACCEPTED') as r`;
      expect(r.outcome).toBe('confirmed');
      await tx`reset role`;
      expect(await booking(tx, id)).toMatchObject({ status: 'confirmed', cal_event_uri: 'embedUid100', cal_status: 'accepted' });
    });
  });
});
