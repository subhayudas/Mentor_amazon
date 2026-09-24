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

function when(row: ReminderRow): string {
  return parseDbTimestamp(row.scheduled_at).toUTCString();
}

export function reminderTitle(kind: ReminderKind): string {
  return kind === '1h' ? 'Your session starts in an hour' : 'Session tomorrow';
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
