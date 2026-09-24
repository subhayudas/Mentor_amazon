import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeHtml,
  isDeliverable,
  parseDbTimestamp,
  recipientsFor,
  reminderEmail,
  reminderKind,
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
// Handler: claim-then-send, escaping in the Resend payload, claim release.

type Call = { table: string; op: string; payload?: unknown; filter?: Record<string, unknown> };
class ReminderFakeDb {
  calls: Call[] = [];
  bookings: unknown[] = [];
  claimed = new Set<string>();
  failNotifications = false;
  from(table: string) {
    const db = this;
    const filter: Record<string, unknown> = {};
    let op = 'select';
    let payload: unknown;
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (c: string, v: unknown) => ((filter[c] = v), builder),
      gt: () => builder,
      lte: () => builder,
      insert: (p: unknown) => {
        op = 'insert';
        payload = p;
        return builder;
      },
      update: (p: unknown) => {
        op = 'update';
        payload = p;
        return builder;
      },
      delete: () => {
        op = 'delete';
        return builder;
      },
      upsert: (p: { booking_id: string; kind: string }) => {
        op = 'upsert';
        payload = p;
        return builder;
      },
      then: (resolve: (v: unknown) => void) => {
        db.calls.push({ table, op, payload, filter });
        if (table === 'bookings') return resolve({ data: db.bookings, error: null });
        if (table === 'booking_reminders' && op === 'upsert') {
          const p = payload as { booking_id: string; kind: string };
          const key = `${p.booking_id}:${p.kind}`;
          if (db.claimed.has(key)) return resolve({ data: [], error: null });
          db.claimed.add(key);
          return resolve({ data: [{ id: `claim-${key}` }], error: null });
        }
        if (table === 'booking_reminders' && op === 'delete') {
          for (const k of [...db.claimed]) if (`claim-${k}` === filter.id) db.claimed.delete(k);
          return resolve({ data: null, error: null });
        }
        if (table === 'notifications' && db.failNotifications) return resolve({ data: null, error: { code: '23502', message: 'x' } });
        return resolve({ data: null, error: null });
      },
    };
    return builder;
  }
}

let db = new ReminderFakeDb();
vi.mock('../api/_lib/supabaseAdmin.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/supabaseAdmin.ts')>();
  return { ...actual, createAdminClient: () => db };
});
const { default: cron } = await import('../api/cron/reminders.ts');

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
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  const run = () => invoke(cron, '/api/cron/reminders', { method: 'GET', headers: { authorization: 'Bearer cron-secret-0123456789' } });

  it('401 without the bearer secret', async () => {
    const res = await invoke(cron, '/api/cron/reminders', { method: 'GET', headers: { authorization: 'Bearer wrong' } });
    expect(res.statusCode).toBe(401);
  });

  it('claims once, notifies both parties with explicit ids, and escapes the goal in the Resend payload', async () => {
    const res = await run();
    expect(res.json()).toEqual({ ok: true, reminders: 1, emails: 2, failures: 0 });
    const notes = db.calls.filter((c) => c.table === 'notifications');
    expect(notes).toHaveLength(2);
    for (const n of notes) expect(n.payload).toMatchObject({ id: expect.any(String), created_at: expect.any(String), type: 'reminder' });
    const bodies = resend.mock.calls.map((c) => JSON.parse(String((c as [string, RequestInit])[1].body)) as { html: string });
    expect(bodies).toHaveLength(2);
    for (const b of bodies) {
      expect(b.html).not.toContain('<img');
      expect(b.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
    expect(db.calls.some((c) => c.table === 'activity_events' && c.op === 'insert')).toBe(true);

    // A second (or concurrent) run finds the reminder claimed and sends nothing.
    resend.mockClear();
    const again = await run();
    expect(again.json()).toEqual({ ok: true, reminders: 0, emails: 0, failures: 0 });
    expect(resend).not.toHaveBeenCalled();
  });

  it('releases the claim when nothing reached anyone, so the next run retries', async () => {
    delete process.env.RESEND_API_KEY;
    db.failNotifications = true;
    const res = await run();
    expect(res.json()).toMatchObject({ ok: true, reminders: 0, failures: 2 });
    expect(db.claimed.size).toBe(0);
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
});
