/**
 * Pure helpers for the reminder cron (api/cron/reminders.ts): which reminder a session is due,
 * who receives it, and the escaped e-mail/notification text. No I/O.
 */
export type ReminderKind = '24h' | '1h';

export interface ReminderParty {
  id: string;
  name: string | null;
  email: string | null;
}

export interface ReminderRow {
  id: string;
  scheduled_at: string;
  goal: string | null;
  mentor: ReminderParty | null;
  mentee: ReminderParty | null;
}

export interface ReminderRecipient {
  email: string;
  type: 'mentor' | 'mentee';
  /** The other party's name, as the recipient should read it. */
  counterpart: string;
}

/** bookings timestamps are UTC wall-clock without a zone; read them as UTC, never local time. */
export function parseDbTimestamp(value: string | Date): Date {
  if (value instanceof Date) return value;
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim());
  return new Date(hasZone ? value : `${value.trim().replace(' ', 'T')}Z`);
}

/**
 * The reminder due now: '1h' when the session starts within the next 60 minutes, '24h' within
 * the next 24 hours, otherwise null (already started, or further away).
 */
export function reminderKind(now: Date | number, scheduledAt: string | Date): ReminderKind | null {
  const minutesAway = (parseDbTimestamp(scheduledAt).getTime() - (typeof now === 'number' ? now : now.getTime())) / 60_000;
  if (!Number.isFinite(minutesAway) || minutesAway <= 0) return null;
  if (minutesAway <= 60) return '1h';
  if (minutesAway <= 24 * 60) return '24h';
  return null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Addresses under the reserved .invalid domain (programme-managed mentors) never receive anything. */
export function isDeliverable(email: string | null | undefined): email is string {
  const e = (email ?? '').trim().toLowerCase();
  return e.includes('@') && !e.endsWith('.invalid');
}

export function recipientsFor(row: ReminderRow): ReminderRecipient[] {
  const out: ReminderRecipient[] = [];
  if (row.mentor && isDeliverable(row.mentor.email)) {
    out.push({ email: row.mentor.email.trim().toLowerCase(), type: 'mentor', counterpart: row.mentee?.name?.trim() || 'your mentee' });
  }
  if (row.mentee && isDeliverable(row.mentee.email)) {
    out.push({ email: row.mentee.email.trim().toLowerCase(), type: 'mentee', counterpart: row.mentor?.name?.trim() || 'your mentor' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claim progress (booking_reminders.channels)
//
// A reminder is claimed by inserting its (booking_id, kind) row with `channels = '{}'`; `sent_at`
// is the time of the claim (or of the latest take-over). When every part has gone out the row
// holds the channel names, e.g. ['in_app', 'email'], the format every earlier run wrote too. While
// a send is only partial the row holds the parts that did go out, '<recipient>:<channel>', so a
// later run sends only what is missing. An empty or partial row older than the lease is taken
// over by the next run: its owner died (function timeout, crash) or one part failed.

export type ReminderChannel = 'in_app' | 'email';
export type ReminderPart = `${ReminderRecipient['type']}:${ReminderChannel}`;

/** How long a claim belongs to the run that made it before another run may take it over. */
export const CLAIM_LEASE_MS = 15 * 60_000;

export function reminderPart(type: ReminderRecipient['type'], channel: ReminderChannel): ReminderPart {
  return `${type}:${channel}`;
}

/** Complete when the row holds a plain channel name; otherwise the parts already delivered. */
export function claimProgress(channels: readonly string[] | null | undefined): { complete: boolean; done: Set<string> } {
  const list = channels ?? [];
  return { complete: list.some((c) => !c.includes(':')), done: new Set(list.filter((c) => c.includes(':'))) };
}

/** Every part a reminder needs: in-app per recipient, plus e-mail when Resend is configured. */
export function neededParts(recipients: readonly ReminderRecipient[], email: boolean): ReminderPart[] {
  return recipients.flatMap((r) => [reminderPart(r.type, 'in_app'), ...(email ? [reminderPart(r.type, 'email')] : [])]);
}

/** Channel names (in_app first) of the given parts. */
export function channelNames(parts: Iterable<string>): ReminderChannel[] {
  const names = new Set(Array.from(parts, (p) => p.slice(p.indexOf(':') + 1)));
  return (['in_app', 'email'] as const).filter((c) => names.has(c));
}

/** What to store after a run: the channel names when nothing is missing, else the parts done so far. */
export function channelsToStore(done: ReadonlySet<string>, needed: readonly string[]): string[] {
  return needed.every((p) => done.has(p)) ? channelNames(done) : Array.from(done).sort();
}

/** A claim another run may take over: work left, and older than the lease. */
export function isReclaimable(row: { channels: string[] | null; sent_at: string }, now: number, leaseMs = CLAIM_LEASE_MS): boolean {
  if (claimProgress(row.channels).complete) return false;
  const claimedAt = parseDbTimestamp(row.sent_at).getTime();
  return Number.isFinite(claimedAt) && claimedAt <= now - leaseMs;
}

/** Run `task` over `items` with at most `limit` in flight. */
export async function forEachLimit<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}

function when(row: ReminderRow): string {
  return parseDbTimestamp(row.scheduled_at).toUTCString();
}

/**
 * The cron runs hourly and a '24h' reminder can go out anywhere from 24 down to 1 hour before the
 * session, so the copy names the window, never "tomorrow" (the exact time is in the body).
 */
export function reminderTitle(kind: ReminderKind): string {
  return kind === '1h' ? 'Your session starts within the hour' : 'Your session is within the next 24 hours';
}

/** In-app notification text (plain text; the bell renders it as text). */
export function reminderNotification(kind: ReminderKind, row: ReminderRow, r: ReminderRecipient): { title: string; message: string } {
  return {
    title: reminderTitle(kind),
    message: `${row.goal?.trim() || 'Mentoring session'} with ${r.counterpart} — ${when(row)}`,
  };
}

/** E-mail subject and HTML; every value that came from a person is escaped. */
export function reminderEmail(kind: ReminderKind, row: ReminderRow, r: ReminderRecipient, appOrigin: string): { subject: string; html: string } {
  const goal = row.goal?.trim() || 'Mentoring session';
  const subject = `${reminderTitle(kind)}: ${goal.replace(/[\r\n]+/g, ' ').slice(0, 120)}`;
  const link = `${appOrigin.replace(/\/+$/, '')}/dashboard/bookings`;
  const html =
    `<p>${escapeHtml(goal)} with ${escapeHtml(r.counterpart)} — ${escapeHtml(when(row))}</p>` +
    `<p><a href="${escapeHtml(link)}">Open MentorConnect</a></p>`;
  return { subject, html };
}
