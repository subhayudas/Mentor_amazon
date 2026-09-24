import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure helpers for the Cal.com webhook (api/webhooks/cal.ts): request shape checks, HMAC
 * verification against several candidate secrets, and normalising a delivery into exactly
 * what the cal_apply_event RPC needs. No I/O here, so it is unit-tested directly.
 */

/** `?mentor=` must be a lower-case UUID (mentors.id of the webhook's owner). */
export const MENTOR_PARAM_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIGNATURE_RE = /^(?:sha256=)?([0-9a-f]{64})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SUPPORTED_TRIGGERS = [
  'BOOKING_CREATED',
  'BOOKING_REQUESTED',
  'BOOKING_RESCHEDULED',
  'BOOKING_CANCELLED',
  'BOOKING_REJECTED',
] as const;
export type SupportedTrigger = (typeof SUPPORTED_TRIGGERS)[number];

/** The hex digest from `x-cal-signature-256` (optionally `sha256=`-prefixed), or null. */
export function parseSignatureHeader(header: string | string[] | undefined): string | null {
  const value = (Array.isArray(header) ? header[0] : header) ?? '';
  const match = SIGNATURE_RE.exec(value.trim().toLowerCase());
  return match ? match[1] : null;
}

/** The `?mentor=` value lower-cased, `null` when absent, or `false` when malformed. */
export function parseMentorParam(value: string | undefined | null): string | null | false {
  if (value === undefined || value === null || value === '') return null;
  const lower = value.trim().toLowerCase();
  return MENTOR_PARAM_RE.test(lower) ? lower : false;
}

export function sha256Hex(body: Buffer | string): string {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * True when `signatureHex` is the HMAC-SHA256 of `body` under any of `secrets`. Every
 * candidate is computed and compared in constant time, whatever matches first.
 */
export function verifyHmac(body: Buffer | string, signatureHex: string, secrets: readonly string[]): boolean {
  if (!/^[0-9a-f]{64}$/.test(signatureHex)) return false;
  const given = Buffer.from(signatureHex, 'hex');
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = createHmac('sha256', secret).update(body).digest();
    if (timingSafeEqual(expected, given)) matched = true;
  }
  return matched;
}

export interface CalEventInput {
  trigger: SupportedTrigger;
  uid: string;
  rescheduleUid: string | null;
  startIso: string;
  endIso: string;
  status: string | null;
  attendeeEmails: string[];
  mcBooking: string | null;
  organizerUsername: string | null;
  reason: string | null;
}

export type NormalizedCal =
  | { kind: 'unrecognised'; trigger: string }
  | { kind: 'ping'; trigger: 'PING' }
  | { kind: 'ignored'; trigger: string }
  | { kind: 'invalid'; trigger: string }
  | { kind: 'event'; event: CalEventInput };

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function responseEmail(value: unknown): string | null {
  if (typeof value === 'string') return str(value);
  if (value && typeof value === 'object') return str((value as { value?: unknown }).value);
  return null;
}

/** Every attendee email plus `responses.email` (string or `{ value }`), lower-cased and deduped. */
export function attendeeEmails(payload: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];
  for (const a of attendees) {
    const email = a && typeof a === 'object' ? str((a as { email?: unknown }).email) : null;
    if (email) out.add(email.toLowerCase());
  }
  const responses = payload.responses && typeof payload.responses === 'object' ? (payload.responses as Record<string, unknown>) : {};
  const fromResponses = responseEmail(responses.email);
  if (fromResponses) out.add(fromResponses.toLowerCase());
  return Array.from(out);
}

/** Turn a parsed Cal.com delivery into what the handler records or applies. */
export function normalizeCalEvent(json: unknown): NormalizedCal {
  if (!json || typeof json !== 'object') return { kind: 'unrecognised', trigger: '' };
  const root = json as Record<string, unknown>;
  const trigger = (str(root.triggerEvent) ?? '').toUpperCase();
  const payload = root.payload && typeof root.payload === 'object' ? (root.payload as Record<string, unknown>) : null;
  if (!trigger || !payload) return { kind: 'unrecognised', trigger };
  if (trigger === 'PING') return { kind: 'ping', trigger: 'PING' };
  if (!(SUPPORTED_TRIGGERS as readonly string[]).includes(trigger)) return { kind: 'ignored', trigger };

  const uid = str(payload.uid);
  const startIso = isoOrNull(payload.startTime);
  const endIso = isoOrNull(payload.endTime);
  if (!uid || !startIso || !endIso) return { kind: 'invalid', trigger };

  const metadata = payload.metadata && typeof payload.metadata === 'object' ? (payload.metadata as Record<string, unknown>) : {};
  const mc = str(metadata.mc_booking);
  const organizer = payload.organizer && typeof payload.organizer === 'object' ? (payload.organizer as Record<string, unknown>) : {};
  const reason = str(payload.cancellationReason) ?? str(payload.rejectionReason);
  const status = str(payload.status);
  return {
    kind: 'event',
    event: {
      trigger: trigger as SupportedTrigger,
      uid,
      rescheduleUid: str(payload.rescheduleUid),
      startIso,
      endIso,
      status: status ? status.toUpperCase() : null,
      attendeeEmails: attendeeEmails(payload),
      mcBooking: mc && UUID_RE.test(mc) ? mc.toLowerCase() : null,
      organizerUsername: str(organizer.username)?.toLowerCase() ?? null,
      reason: reason ? reason.slice(0, 500) : null,
    },
  };
}

/**
 * Idempotency key of a booking event: the same Cal.com event delivered twice (or to the same
 * webhook again) maps to the same row in cal_webhook_events.
 */
export function deliveryId(mentorId: string | null, e: Pick<CalEventInput, 'trigger' | 'uid' | 'rescheduleUid' | 'startIso' | 'status'>): string {
  return `${mentorId || 'global'}:${e.trigger}:${e.uid}:${e.rescheduleUid ?? ''}:${e.startIso ?? ''}:${e.status ?? ''}`;
}

/**
 * Key of a delivery that changes no booking (PING, unsupported trigger, unreadable payload):
 * the payload hash, so each "Ping test" is recorded while a byte-identical replay is not.
 */
export function recordId(mentorId: string | null, trigger: string, payloadSha256: string): string {
  return `${mentorId || 'global'}:${trigger || 'NONE'}:sha256:${payloadSha256}`;
}
