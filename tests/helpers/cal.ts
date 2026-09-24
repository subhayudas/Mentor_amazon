import { createHmac } from 'node:crypto';

/**
 * Cal.com webhook test helpers: HMAC signing exactly as Cal.com does it (hex SHA-256 of the
 * raw body under the webhook secret, sent as `x-cal-signature-256`) and payload builders
 * shaped after Cal.com's documented webhook examples (triggerEvent + createdAt + payload with
 * uid, startTime/endTime, organizer, attendees, responses, metadata, status).
 */

export type CalTrigger =
  | 'BOOKING_CREATED'
  | 'BOOKING_REQUESTED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_REJECTED'
  | 'MEETING_ENDED'
  | 'PING';

export function signCal(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function calHeaders(body: string, secret: string, opts: { prefix?: boolean } = {}): Record<string, string> {
  const sig = signCal(body, secret);
  return { 'content-type': 'application/json', 'x-cal-signature-256': opts.prefix ? `sha256=${sig}` : sig };
}

export interface CalPayloadOptions {
  uid: string;
  /** ISO start; defaults to tomorrow 10:00 UTC. Offsets such as +04:00 are allowed. */
  start?: string;
  end?: string;
  status?: string | null;
  attendees?: string[];
  /** `responses.email` as Cal.com sends it: `{ label, value }`, or a plain string. */
  responsesEmail?: string | { value: string } | null;
  organizerUsername?: string | null;
  mcBooking?: string | null;
  rescheduleUid?: string | null;
  reason?: string;
  createdAt?: string;
}

function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function calEvent(trigger: CalTrigger, o: CalPayloadOptions): Record<string, unknown> {
  const start = o.start ?? tomorrowAt(10);
  const end = o.end ?? new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
  const attendees = (o.attendees ?? ['mentee@example.com']).map((email, i) => ({
    email,
    name: `Attendee ${i + 1}`,
    timeZone: 'Asia/Dubai',
    language: { locale: 'en' },
  }));
  const payload: Record<string, unknown> = {
    type: '30min',
    title: '30min between Mentor and Attendee 1',
    description: '',
    additionalNotes: '',
    startTime: start,
    endTime: end,
    organizer: {
      id: 5,
      name: 'Mentor',
      email: 'mentor@example.com',
      ...(o.organizerUsername === null ? {} : { username: o.organizerUsername ?? 'mentor' }),
      timeZone: 'Asia/Dubai',
      language: { locale: 'en' },
    },
    responses: {
      name: { label: 'your_name', value: 'Attendee 1' },
      ...(o.responsesEmail === null || o.responsesEmail === undefined
        ? { email: { label: 'email_address', value: attendees[0]?.email ?? '' } }
        : { email: typeof o.responsesEmail === 'string' ? o.responsesEmail : { label: 'email_address', ...o.responsesEmail } }),
    },
    attendees,
    location: 'integrations:daily',
    eventTypeId: 7,
    uid: o.uid,
    bookingId: 91,
    length: 30,
    metadata: o.mcBooking === undefined || o.mcBooking === null ? { videoCallUrl: 'https://app.cal.com/video/x' } : { mc_booking: o.mcBooking },
  };
  if (o.status !== null) payload.status = o.status ?? (trigger === 'BOOKING_REQUESTED' ? 'PENDING' : trigger === 'BOOKING_CANCELLED' ? 'CANCELLED' : trigger === 'BOOKING_REJECTED' ? 'REJECTED' : 'ACCEPTED');
  if (o.rescheduleUid) {
    payload.rescheduleUid = o.rescheduleUid;
    payload.rescheduleStartTime = tomorrowAt(9);
  }
  if (trigger === 'BOOKING_CANCELLED') payload.cancellationReason = o.reason ?? 'Something came up';
  if (trigger === 'BOOKING_REJECTED') payload.rejectionReason = o.reason ?? 'Not available then';
  return { triggerEvent: trigger, createdAt: o.createdAt ?? new Date().toISOString(), payload };
}

/** Cal.com's "Ping test" delivery. */
export function pingEvent(createdAt = new Date().toISOString()): Record<string, unknown> {
  return {
    triggerEvent: 'PING',
    createdAt,
    payload: {
      type: 'Test',
      title: 'Test trigger event',
      startTime: createdAt,
      endTime: createdAt,
      attendees: [{ email: 'JohnSmith@example.com', name: 'John Smith', timeZone: 'Europe/London' }],
      organizer: { name: 'Cal', email: 'no-reply@cal.com', timeZone: 'Europe/London' },
    },
  };
}
