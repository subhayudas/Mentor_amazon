import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  channelsToStore,
  claimProgress,
  escapeHtml,
  forEachLimit,
  isDeliverable,
  isReclaimable,
  neededParts,
  parseDbTimestamp,
  recipientsFor,
  reminderEmail,
  reminderKind,
  reminderNotification,
  reminderTitle,
  type ReminderRow,
} from '../api/_lib/reminders.ts';
import { invoke } from './helpers/vercel.ts';

/** U5 — reminder cron helpers and the handler's claim/escape behaviour (design §5.3 A10, §6.2). */

const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString().replace('Z', '');

describe('reminderKind', () => {
  it('1h up to and including 60 minutes away, 24h up to and including 24 hours, else nothing', () => {
    expect(reminderKind(NOW, at(1))).toBe('1h');
    expect(reminderKind(NOW, at(60))).toBe('1h');
    expect(reminderKind(NOW, at(61))).toBe('24h');
    expect(reminderKind(NOW, at(24 * 60))).toBe('24h');
    expect(reminderKind(NOW, at(24 * 60 + 1))).toBeNull();
    expect(reminderKind(NOW, at(0))).toBeNull();
    expect(reminderKind(NOW, at(-30))).toBeNull();
    expect(reminderKind(NOW, 'garbage')).toBeNull();
  });

  it('never says "tomorrow": a 24h reminder can go out only a couple of hours before the session', () => {
    expect(reminderTitle('24h')).toBe('Your session is within the next 24 hours');
    expect(reminderTitle('1h')).toBe('Your session starts within the hour');
    expect(reminderTitle('24h')).not.toMatch(/tomorrow/i);
  });

  it('reads zone-less database timestamps as UTC whatever the server time zone', () => {
    expect(parseDbTimestamp('2026-09-24T13:00:00').toISOString()).toBe('2026-09-24T13:00:00.000Z');
    expect(parseDbTimestamp('2026-09-24 13:00:00').toISOString()).toBe('2026-09-24T13:00:00.000Z');
    expect(parseDbTimestamp('2026-09-24T13:00:00+04:00').toISOString()).toBe('2026-09-24T09:00:00.000Z');
    expect(parseDbTimestamp('2026-09-24T13:00:00Z').toISOString()).toBe('2026-09-24T13:00:00.000Z');
  });
});

describe('escaping and recipients', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)> & "q" 'a'`)).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot; &#39;a&#39;');
  });

  it('drops .invalid (programme-managed) and empty addresses', () => {
    const row: ReminderRow = {
      id: 'b1',
      scheduled_at: at(30),
      goal: 'Pricing',
      mentor: { id: 'm1', name: 'Manav', email: 'featured.manav-gupta@mentorconnect.invalid' },
      mentee: { id: 'e1', name: 'Sara', email: 'Sara@Example.com' },
    };
    expect(recipientsFor(row)).toEqual([{ email: 'sara@example.com', type: 'mentee', counterpart: 'Manav' }]);
    expect(recipientsFor({ ...row, mentee: { id: 'e1', name: null, email: '' } })).toEqual([]);
    expect(isDeliverable('someone@example.invalid')).toBe(false);
    expect(isDeliverable('someone@example.com')).toBe(true);
    expect(isDeliverable(null)).toBe(false);
  });

  it('builds escaped e-mail HTML and a single-line subject', () => {
    const row: ReminderRow = {
      id: 'b1',
      scheduled_at: at(30),
      goal: '<img src=x onerror=alert(1)>\nnext line',
      mentor: { id: 'm1', name: '<b>Mentor</b>', email: 'm@example.com' },
      mentee: { id: 'e1', name: 'Sara', email: 's@example.com' },
    };
    const [toMentee] = recipientsFor(row).filter((r) => r.type === 'mentee');
    const mail = reminderEmail('1h', row, toMentee, 'https://mentor-amazon.vercel.app/');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(mail.html).toContain('href="https://mentor-amazon.vercel.app/dashboard/bookings"');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

// ---------------------------------------------------------------------------
// Handler: claim-then-send, escaping in the Resend payload, claim release, take-over (R1-03).

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filter?: Record<string, unknown> };
interface ClaimRow {
  id: string;
  booking_id: string;
  kind: string;
  channels: string[];
  sent_at: string;
}

/**
 * The service-role surface the cron uses, in memory: bookings (the due query), booking_reminders
 * (upsert-ignore-duplicates claim, select, conditional update with `lt`, delete), notifications
 * (insert, select) and activity_events (insert). Every executed call is recorded in `calls`.
 */
class ReminderFakeDb {
  calls: Call[] = [];
  bookings: unknown[] = [];
  claims: ClaimRow[] = [];
  notifications: Row[] = [];
  activity: Row[] = [];
  failNotifications = false;
  /** Recipient addresses whose notification insert fails. */
  failNotificationsFor = new Set<string>();
  /** Booking ids whose notification inserts throw (not an error result: an exception). */
  throwFor = new Set<string>();
  /** Booking ids whose claim throws. */
  throwClaimFor = new Set<string>();
  private seq = 0;

  seedClaim(bookingId: string, kind: string, channels: string[], minutesAgo: number): ClaimRow {
    const claim = { id: `claim-${++this.seq}`, booking_id: bookingId, kind, channels, sent_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() };
    this.claims.push(claim);
    return claim;
  }

  from(table: string) {
    const db = this;
    const filters: Array<[string, 'eq' | 'lt', unknown]> = [];
    let op = 'select';
    let payload: Row | undefined;
    let returning = false;
    let single = false;
    const builder: Record<string, unknown> = {
      select: () => {
        if (op !== 'select') returning = true;
        return builder;
      },
      eq: (c: string, v: unknown) => (filters.push([c, 'eq', v]), builder),
      lt: (c: string, v: unknown) => (filters.push([c, 'lt', v]), builder),
      gt: () => builder,
      lte: () => builder,
      maybeSingle: () => ((single = true), builder),
      insert: (p: Row) => ((op = 'insert'), (payload = p), builder),
      update: (p: Row) => ((op = 'update'), (payload = p), builder),
      delete: () => ((op = 'delete'), builder),
      upsert: (p: Row) => ((op = 'upsert'), (payload = p), builder),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve()
          .then(() => db.run(table, op, payload, filters, returning, single))
          .then(resolve, reject),
    };
    return builder;
  }

  private run(table: string, op: string, payload: Row | undefined, filters: Array<[string, 'eq' | 'lt', unknown]>, returning: boolean, single: boolean) {
    this.calls.push({ table, op, payload, filter: Object.fromEntries(filters.map(([c, , v]) => [c, v])) });
    const bookingId = String((payload as Row | undefined)?.booking_id ?? filters.find(([c]) => c === 'booking_id')?.[2] ?? '');
    if (table === 'notifications' && this.throwFor.has(bookingId)) throw new TypeError('fetch failed');
    if (table === 'booking_reminders' && this.throwClaimFor.has(bookingId)) throw new TypeError('fetch failed');
    const matches = (row: Row) =>
      filters.every(([c, how, v]) => (how === 'eq' ? row[c] === v : Date.parse(String(row[c])) < Date.parse(String(v))));
    if (table === 'bookings') return { data: this.bookings, error: null };
    if (table === 'booking_reminders') {
      const rows = this.claims as unknown as Row[];
      if (op === 'upsert') {
        const p = payload as { booking_id: string; kind: string; channels: string[] };
        if (this.claims.some((c) => c.booking_id === p.booking_id && c.kind === p.kind)) return { data: [], error: null };
        const claim = { id: `claim-${++this.seq}`, booking_id: p.booking_id, kind: p.kind, channels: [...p.channels], sent_at: new Date().toISOString() };
        this.claims.push(claim);
        return { data: [{ id: claim.id }], error: null };
      }
      const hit = rows.filter(matches);
      if (op === 'select') return { data: single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null };
      if (op === 'update') {
        for (const r of hit) Object.assign(r, payload);
        return { data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
      }
      if (op === 'delete') {
        this.claims = this.claims.filter((c) => !hit.includes(c as unknown as Row));
        return { data: null, error: null };
      }
    }
    if (table === 'notifications') {
      if (op === 'insert') {
        const p = payload as Row;
        if (this.failNotifications || this.failNotificationsFor.has(String(p.recipient_email))) {
          return { data: null, error: { code: '23502', message: 'x' } };
        }
        this.notifications.push({ ...p });
        return { data: null, error: null };
      }
      return { data: this.notifications.filter(matches).map((n) => ({ ...n })), error: null };
    }
    if (table === 'activity_events') {
      this.activity.push({ ...(payload as Row) });
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }
}

let db = new ReminderFakeDb();
vi.mock('../api/_lib/supabaseAdmin.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/supabaseAdmin.ts')>();
  return { ...actual, createAdminClient: () => db };
});
const { default: cron } = await import('../api/cron/reminders.ts');

function booking(id: string, minutesAway: number) {
  return {
    id,
    scheduled_at: new Date(Date.now() + minutesAway * 60_000).toISOString().replace('Z', ''),
    goal: '<img src=x onerror=alert(1)>',
    mentor: { id: `m-${id}`, name: 'Mentor', email: `mentor-${id}@example.com` },
    mentee: { id: `e-${id}`, name: 'Mentee', email: `mentee-${id}@example.com` },
  };
}

describe('GET /api/cron/reminders', () => {
  let resend: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    db = new ReminderFakeDb();
    db.bookings = [
      {
        id: 'b1',
        scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString().replace('Z', ''),
        goal: '<img src=x onerror=alert(1)>',
        mentor: { id: 'm1', name: 'Mentor', email: 'mentor@example.com' },
        mentee: { id: 'e1', name: 'Mentee', email: 'mentee@example.com' },
      },
    ];
    Object.assign(process.env, {
      CRON_SECRET: 'cron-secret-0123456789',
      SUPABASE_URL: 'https://fake-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-not-real',
      APP_ORIGIN: 'https://mentor-amazon.vercel.app',
      RESEND_API_KEY: 're_test_key',
    });
    resend = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(resend as unknown as typeof fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  const run = () => invoke(cron, '/api/cron/reminders', { method: 'GET', headers: { authorization: 'Bearer cron-secret-0123456789' } });
  const resendRecipients = () => resend.mock.calls.map((c) => (JSON.parse(String((c as [string, RequestInit])[1].body)) as { to: string }).to).sort();

  it('401 without the bearer secret', async () => {
    const res = await invoke(cron, '/api/cron/reminders', { method: 'GET', headers: { authorization: 'Bearer wrong' } });
    expect(res.statusCode).toBe(401);
  });

  it('claims once, notifies both parties with explicit ids, and escapes the goal in the Resend payload', async () => {
    const res = await run();
    expect(res.json()).toEqual({ ok: true, reminders: 1, emails: 2, failures: 0 });
    const notes = db.calls.filter((c) => c.table === 'notifications' && c.op === 'insert');
    expect(notes).toHaveLength(2);
    for (const n of notes) expect(n.payload).toMatchObject({ id: expect.any(String), created_at: expect.any(String), type: 'reminder' });
    const bodies = resend.mock.calls.map((c) => JSON.parse(String((c as [string, RequestInit])[1].body)) as { html: string });
    expect(bodies).toHaveLength(2);
    for (const b of bodies) {
      expect(b.html).not.toContain('<img');
      expect(b.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
    expect(db.calls.some((c) => c.table === 'activity_events' && c.op === 'insert')).toBe(true);
    expect(db.claims).toEqual([expect.objectContaining({ booking_id: 'b1', kind: '1h', channels: ['in_app', 'email'] })]);

    // A second (or concurrent) run finds the reminder claimed and sends nothing.
    resend.mockClear();
    const again = await run();
    expect(again.json()).toEqual({ ok: true, reminders: 0, emails: 0, failures: 0 });
    expect(resend).not.toHaveBeenCalled();
    expect(db.activity).toHaveLength(1);
  });

  it('releases the claim when nothing reached anyone, so the next run retries', async () => {
    delete process.env.RESEND_API_KEY;
    db.failNotifications = true;
    const res = await run();
    expect(res.json()).toMatchObject({ ok: true, reminders: 0, failures: 2 });
    expect(db.claims).toHaveLength(0);
    db.failNotifications = false;
    const retry = await run();
    expect(retry.json()).toMatchObject({ reminders: 1 });
  });

  it('missing env is 503 with no names in the body', async () => {
    delete process.env.CRON_SECRET;
    const res = await run();
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toMatch(/CRON_SECRET|SUPABASE/);
  });

  describe('crash safety (R1-03)', () => {
    /** The 1h reminder notification a run writes for this recipient of b1, as the cron builds it. */
    const written = (email: string) => {
      const row = db.bookings[0] as ReminderRow;
      const r = recipientsFor(row).find((x) => x.email === email)!;
      return { booking_id: 'b1', recipient_email: email, type: 'reminder', ...reminderNotification('1h', row, r) };
    };
    /** The same reminder, sent for the session's time before a reschedule. */
    const oldTime = (email: string) => ({ ...written(email), message: `Mentoring session with Someone — Tue, 22 Sep 2026, 09:00 UTC` });
    it('a claim left empty by a run that died is taken over after 15 minutes and the reminder goes out', async () => {
      db.seedClaim('b1', '1h', [], 20);
      const res = await run();
      expect(res.json()).toEqual({ ok: true, reminders: 1, emails: 2, failures: 0 });
      expect(db.notifications.map((n) => n.recipient_email).sort()).toEqual(['mentee@example.com', 'mentor@example.com']);
      expect(db.claims).toEqual([expect.objectContaining({ channels: ['in_app', 'email'] })]);
      expect(db.activity).toHaveLength(1);
    });

    it('a claim younger than 15 minutes still belongs to its run and is left alone', async () => {
      db.seedClaim('b1', '1h', [], 5);
      const res = await run();
      expect(res.json()).toEqual({ ok: true, reminders: 0, emails: 0, failures: 0 });
      expect(db.notifications).toHaveLength(0);
      expect(resend).not.toHaveBeenCalled();
    });

    it('a finished reminder is never sent again, however old, including rows written by earlier versions', async () => {
      db.seedClaim('b1', '1h', ['in_app'], 120);
      const res = await run();
      expect(res.json()).toEqual({ ok: true, reminders: 0, emails: 0, failures: 0 });
      expect(db.notifications).toHaveLength(0);
    });

    it('after a partial send only the part that failed is retried, and nobody gets a duplicate', async () => {
      db.failNotificationsFor.add('mentee@example.com');
      const first = await run();
      expect(first.json()).toEqual({ ok: true, reminders: 1, emails: 2, failures: 1 });
      expect(db.claims[0].channels).toEqual(['mentee:email', 'mentor:email', 'mentor:in_app']);

      // The next run within the lease leaves it alone; one after the lease finishes it.
      db.failNotificationsFor.clear();
      resend.mockClear();
      expect((await run()).json()).toEqual({ ok: true, reminders: 0, emails: 0, failures: 0 });
      db.claims[0].sent_at = new Date(Date.now() - 20 * 60_000).toISOString();
      const retry = await run();
      expect(retry.json()).toEqual({ ok: true, reminders: 1, emails: 0, failures: 0 });
      expect(resend).not.toHaveBeenCalled();
      expect(db.notifications.map((n) => n.recipient_email).sort()).toEqual(['mentee@example.com', 'mentor@example.com']);
      expect(db.claims[0].channels).toEqual(['in_app', 'email']);
      expect(db.activity).toHaveLength(1);
    });

    it('a failed e-mail is retried for that recipient only', async () => {
      resend.mockImplementation(async (_url: unknown, init?: RequestInit) =>
        new Response('{}', { status: String(init?.body).includes('mentee@example.com') ? 500 : 200 }),
      );
      expect((await run()).json()).toEqual({ ok: true, reminders: 1, emails: 1, failures: 1 });
      resend.mockReset();
      resend.mockImplementation(async () => new Response('{}', { status: 200 }));
      db.claims[0].sent_at = new Date(Date.now() - 20 * 60_000).toISOString();
      expect((await run()).json()).toEqual({ ok: true, reminders: 1, emails: 1, failures: 0 });
      expect(resendRecipients()).toEqual(['mentee@example.com']);
      expect(db.notifications).toHaveLength(2);
    });

    it('notifications a dead run wrote before recording them are not written twice', async () => {
      db.seedClaim('b1', '1h', [], 20);
      db.notifications.push(written('mentor@example.com'));
      delete process.env.RESEND_API_KEY;
      const res = await run();
      expect(res.json()).toEqual({ ok: true, reminders: 1, emails: 0, failures: 0 });
      expect(db.notifications.filter((n) => n.recipient_email === 'mentor@example.com')).toHaveLength(1);
      expect(db.notifications.filter((n) => n.recipient_email === 'mentee@example.com')).toHaveLength(1);
      expect(db.claims[0].channels).toEqual(['in_app']);
    });

    it('after a reschedule, a take-over does not count the reminder sent for the old time: the mentee is reminded of the new one (R2-05)', async () => {
      delete process.env.RESEND_API_KEY;
      // Both parties were reminded of the old time; the reschedule cleared the claims, not those notifications.
      db.notifications.push(oldTime('mentee@example.com'), oldTime('mentor@example.com'));
      db.failNotificationsFor.add('mentee@example.com');
      await run();
      expect(db.claims[0].channels).toEqual(['mentor:in_app']);
      db.failNotificationsFor.clear();
      db.claims[0].sent_at = new Date(Date.now() - 20 * 60_000).toISOString();
      const res = await run();
      expect(res.json()).toEqual({ ok: true, reminders: 1, emails: 0, failures: 0 });
      const toMentee = db.notifications.filter((n) => n.recipient_email === 'mentee@example.com');
      expect(toMentee.map((n) => n.message)).toEqual([oldTime('mentee@example.com').message, written('mentee@example.com').message]);
      expect(db.claims[0].channels).toEqual(['in_app']);
    });

    it('a claim left empty after a reschedule still sends the reminder for the new time to both parties (R2-12)', async () => {
      delete process.env.RESEND_API_KEY;
      db.seedClaim('b1', '1h', [], 20);
      db.notifications.push(oldTime('mentee@example.com'), oldTime('mentor@example.com'));
      const res = await run();
      expect(res.json()).toEqual({ ok: true, reminders: 1, emails: 0, failures: 0 });
      const forNewTime = db.notifications.filter((n) => n.message === written(String(n.recipient_email)).message);
      expect(forNewTime.map((n) => n.recipient_email).sort()).toEqual(['mentee@example.com', 'mentor@example.com']);
      expect(db.notifications).toHaveLength(4);
      expect(db.claims[0].channels).toEqual(['in_app']);
      expect(db.activity).toHaveLength(1);
    });

    it('a take-over that finds every notification already written by the run that died still records reminder_sent (R2-07)', async () => {
      delete process.env.RESEND_API_KEY;
      db.seedClaim('b1', '1h', [], 20);
      db.notifications.push(written('mentor@example.com'), written('mentee@example.com'));
      const res = await run();
      expect(res.json()).toEqual({ ok: true, reminders: 0, emails: 0, failures: 0 });
      expect(db.notifications).toHaveLength(2);
      expect(db.claims[0].channels).toEqual(['in_app']);
      expect(db.activity).toEqual([expect.objectContaining({ type: 'reminder_sent', subject_id: 'b1' })]);
    });

    it('two runs racing for the same stale claim: exactly one takes it over', async () => {
      db.seedClaim('b1', '1h', [], 20);
      delete process.env.RESEND_API_KEY;
      const [a, b] = await Promise.all([run(), run()]);
      expect([a.json().reminders, b.json().reminders].sort()).toEqual([0, 1]);
      expect(db.notifications).toHaveLength(2);
    });

    it('an exception in one reminder never stops the others', async () => {
      db.bookings = [booking('b1', 30), booking('b2', 45), booking('b3', 50)];
      db.throwFor.add('b1');
      db.throwClaimFor.add('b3');
      const res = await run();
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, reminders: 2, emails: 4, failures: 3 });
      expect(db.notifications.map((n) => n.booking_id)).toEqual(['b2', 'b2']);
      expect(db.claims.some((c) => c.booking_id === 'b3')).toBe(false);
      // b1's e-mails went out and are recorded; its in-app part is retried after the lease.
      expect(db.claims.find((c) => c.booking_id === 'b1')?.channels).toEqual(['mentee:email', 'mentor:email']);
      expect(db.claims.find((c) => c.booking_id === 'b2')?.channels).toEqual(['in_app', 'email']);
    });

    it('sends the e-mails of a run concurrently, not one after another', async () => {
      db.bookings = [booking('b1', 30), booking('b2', 45), booking('b3', 120)];
      let inFlight = 0;
      let peak = 0;
      resend.mockImplementation(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return new Response('{}', { status: 200 });
      });
      const res = await run();
      expect(res.json()).toEqual({ ok: true, reminders: 3, emails: 6, failures: 0 });
      expect(peak).toBeGreaterThanOrEqual(2);
    });

    it('vercel.json gives the cron a maxDuration within the Hobby limit', () => {
      const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
        functions?: Record<string, { maxDuration?: number }>;
      };
      const maxDuration = config.functions?.['api/cron/reminders.ts']?.maxDuration;
      expect(maxDuration).toBeGreaterThanOrEqual(30);
      expect(maxDuration).toBeLessThanOrEqual(60);
    });
  });
});

describe('claim progress helpers', () => {
  it('reads plain channel names as complete and prefixed parts as progress', () => {
    expect(claimProgress(['in_app', 'email'])).toEqual({ complete: true, done: new Set() });
    expect(claimProgress(['mentor:in_app'])).toEqual({ complete: false, done: new Set(['mentor:in_app']) });
    expect(claimProgress([])).toEqual({ complete: false, done: new Set() });
    expect(claimProgress(null)).toEqual({ complete: false, done: new Set() });
  });

  it('stores channel names once every needed part is done, otherwise the parts', () => {
    const recipients = [
      { email: 'a@example.com', type: 'mentor' as const, counterpart: 'B' },
      { email: 'b@example.com', type: 'mentee' as const, counterpart: 'A' },
    ];
    const needed = neededParts(recipients, true);
    expect(needed).toEqual(['mentor:in_app', 'mentor:email', 'mentee:in_app', 'mentee:email']);
    expect(channelsToStore(new Set(needed), needed)).toEqual(['in_app', 'email']);
    expect(channelsToStore(new Set(['mentor:in_app', 'mentee:in_app']), neededParts(recipients, false))).toEqual(['in_app']);
    expect(channelsToStore(new Set(['mentor:in_app']), needed)).toEqual(['mentor:in_app']);
  });

  it('a claim is reclaimable only with work left and after the lease', () => {
    const now = Date.parse('2026-09-25T12:00:00Z');
    expect(isReclaimable({ channels: [], sent_at: '2026-09-25T11:44:00+00:00' }, now)).toBe(true);
    expect(isReclaimable({ channels: [], sent_at: '2026-09-25T11:50:00+00:00' }, now)).toBe(false);
    expect(isReclaimable({ channels: ['mentee:in_app'], sent_at: '2026-09-25T10:00:00+00:00' }, now)).toBe(true);
    expect(isReclaimable({ channels: ['in_app'], sent_at: '2026-09-25T10:00:00+00:00' }, now)).toBe(false);
    expect(isReclaimable({ channels: [], sent_at: 'garbage' }, now)).toBe(false);
  });

  it('forEachLimit runs every item with at most `limit` in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await forEachLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(n);
      inFlight -= 1;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
    await forEachLimit([], 3, async () => {
      throw new Error('never called');
    });
  });
});
