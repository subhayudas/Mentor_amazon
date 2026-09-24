import { describe, expect, it, vi } from 'vitest';

import { CAL_PATTERN, calCancelUrl, calPublicUrl, calRescheduleLink, calUsername, isValidCalLink, normalizeCalLink } from '../client/src/lib/calLink.ts';
import {
  ATTENTION_OUTCOMES,
  WORKING_OUTCOMES,
  calSyncStatus,
  getMyCalWebhook,
  isProductionUrl,
  isSyncUnavailableError,
  maskSecret,
  outcomeCopyKey,
  outcomeTone,
  rotateCalWebhookSecret,
  subscriberUrl,
  toCalWebhookInfo,
  triggerCopyKey,
} from '../client/src/lib/calSync.ts';
import en from '../client/src/locales/en.json';
import ar from '../client/src/locales/ar.json';

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('normalizeCalLink', () => {
  it.each([
    ['https://cal.com/jane/30min', 'jane/30min'],
    ['https://cal.com/jane/30min?month=2026-10#top', 'jane/30min'],
    ['http://www.cal.com/jane/30min/', 'jane/30min'],
    ['https://app.cal.com/jane/30min', 'jane/30min'],
    ['app.cal.com/jane/30min', 'jane/30min'],
    ['cal.com/jane/30min', 'jane/30min'],
    ['/jane/30min/', 'jane/30min'],
    ['  jane/30min  ', 'jane/30min'],
    ['HTTPS://CAL.COM/Jane.Doe/Intro-Call', 'Jane.Doe/Intro-Call'],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('%j → %j', (input, output) => {
    expect(normalizeCalLink(input)).toBe(output);
  });
});

describe('isValidCalLink / CAL_PATTERN / calUsername', () => {
  it('accepts username/event after normalising', () => {
    expect(isValidCalLink('https://cal.com/jane/30min')).toBe(true);
    expect(isValidCalLink('jane_doe.x/15-min')).toBe(true);
    expect(isValidCalLink('team/acme')).toBe(true);
  });

  it('rejects a bare username, extra segments and junk', () => {
    expect(isValidCalLink('jane')).toBe(false);
    expect(isValidCalLink('jane/30min/extra')).toBe(false);
    expect(isValidCalLink('jane/30 min')).toBe(false);
    expect(isValidCalLink('')).toBe(false);
    expect(CAL_PATTERN.test('https://cal.com/jane/30min')).toBe(false);
  });

  it('calUsername is the lower-cased personal username, null for teams and invalid links', () => {
    expect(calUsername('https://cal.com/Jane.Doe/30min')).toBe('jane.doe');
    expect(calUsername('team/acme')).toBeNull();
    expect(calUsername('jane')).toBeNull();
    expect(calUsername(null)).toBeNull();
  });
});

describe('Cal.com URLs', () => {
  it('reschedule, cancel and public links', () => {
    expect(calRescheduleLink('bQ7x9kL2mN4pR8sT')).toBe('reschedule/bQ7x9kL2mN4pR8sT');
    expect(calCancelUrl('a b/c')).toBe('https://app.cal.com/booking/a%20b%2Fc?cancel=true');
    expect(calPublicUrl('jane/30min')).toBe('https://cal.com/jane/30min');
  });
});

describe('Cal sync helpers (lib/calSync.ts)', () => {
  const mentorId = '738d7465-42c6-5550-be9a-6e7ef35f52bc';

  it('subscriberUrl uses the given origin, trimmed, with the encoded mentor id', () => {
    expect(subscriberUrl(mentorId, 'https://mentor-amazon.vercel.app/')).toBe(`https://mentor-amazon.vercel.app/api/webhooks/cal?mentor=${mentorId}`);
    expect(subscriberUrl('a&b', 'http://localhost:5174')).toBe('http://localhost:5174/api/webhooks/cal?mentor=a%26b');
  });

  it('isProductionUrl only for the production host', () => {
    expect(isProductionUrl('https://mentor-amazon.vercel.app/api/webhooks/cal?mentor=x')).toBe(true);
    expect(isProductionUrl('https://mentor-amazon-git-fix-x.vercel.app/api/webhooks/cal')).toBe(false);
    expect(isProductionUrl('http://localhost:5174/api/webhooks/cal')).toBe(false);
    expect(isProductionUrl('not a url')).toBe(false);
  });

  it('maskSecret shows only the last four characters', () => {
    expect(maskSecret('a'.repeat(60) + '9f3a')).toBe('•••• 9f3a');
    expect(maskSecret(null)).toBe('••••');
  });

  it('every outcome in the frozen vocabulary has a tone and EN + AR copy', () => {
    for (const outcome of WORKING_OUTCOMES) expect(outcomeTone(outcome)).toBe('working');
    for (const outcome of ATTENTION_OUTCOMES) expect(outcomeTone(outcome)).toBe('attention');
    for (const outcome of [...WORKING_OUTCOMES, ...ATTENTION_OUTCOMES]) {
      const key = outcomeCopyKey(outcome);
      expect(key).toBe(`calSync.outcomes.${outcome}`);
      expect(typeof lookup(en, key), `${key} (en)`).toBe('string');
      expect(typeof lookup(ar, key), `${key} (ar)`).toBe('string');
      expect(lookup(ar, key)).not.toBe(lookup(en, key));
    }
    expect(outcomeCopyKey('something_new')).toBe('calSync.outcomes.unknown');
    expect(outcomeCopyKey(null)).toBe('calSync.outcomes.unknown');
    expect(typeof lookup(en, 'calSync.outcomes.unknown')).toBe('string');
    expect(outcomeTone('something_new')).toBe('unknown');
  });

  it('trigger labels exist for the triggers the setup steps ask for', () => {
    for (const trigger of ['PING', 'BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED', 'BOOKING_REQUESTED', 'BOOKING_REJECTED']) {
      const key = triggerCopyKey(trigger)!;
      expect(typeof lookup(en, key), key).toBe('string');
      expect(typeof lookup(ar, key), key).toBe('string');
    }
    expect(triggerCopyKey('ping')).toBe('calSync.triggers.PING');
    expect(triggerCopyKey('MEETING_ENDED')).toBeNull();
  });

  it('calSyncStatus: not connected, working, attention', () => {
    expect(calSyncStatus(null)).toEqual({ kind: 'not_connected' });
    expect(calSyncStatus({ last_delivery_at: null, last_trigger: null, last_outcome: null })).toEqual({ kind: 'not_connected' });
    expect(calSyncStatus({ last_delivery_at: '2026-09-24T10:00:00Z', last_trigger: 'PING', last_outcome: 'ping' })).toEqual({
      kind: 'working',
      at: '2026-09-24T10:00:00Z',
      trigger: 'PING',
      outcome: 'ping',
    });
    expect(calSyncStatus({ last_delivery_at: '2026-09-24T10:00:00Z', last_trigger: 'BOOKING_CREATED', last_outcome: 'unmatched_direct_booking' }).kind).toBe('attention');
  });

  it('toCalWebhookInfo normalises the RPC jsonb', () => {
    expect(toCalWebhookInfo({ mentor_id: mentorId, secret: 'abc', deliveries_total: '3', last_outcome: '' }, 'x')).toEqual({
      mentor_id: mentorId,
      secret: 'abc',
      created_at: null,
      rotated_at: null,
      previous_valid_until: null,
      last_delivery_at: null,
      last_trigger: null,
      last_outcome: null,
      deliveries_total: 3,
    });
    expect(toCalWebhookInfo(null, mentorId).mentor_id).toBe(mentorId);
  });

  it('RPC wrappers call the right functions and surface errors', async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === 'get_my_cal_webhook'
        ? { data: { mentor_id: mentorId, secret: 's1', deliveries_total: 0 }, error: null }
        : { data: { secret: 's2', rotated_at: '2026-09-24T10:00:00Z', previous_valid_until: '2026-09-25T10:00:00Z' }, error: null },
    );
    await expect(getMyCalWebhook(rpc, mentorId)).resolves.toMatchObject({ secret: 's1' });
    await expect(rotateCalWebhookSecret(rpc, mentorId)).resolves.toEqual({ secret: 's2', rotated_at: '2026-09-24T10:00:00Z', previous_valid_until: '2026-09-25T10:00:00Z' });
    expect(rpc.mock.calls).toEqual([
      ['get_my_cal_webhook', { p_mentor_id: mentorId }],
      ['rotate_cal_webhook_secret', { p_mentor_id: mentorId }],
    ]);
    const failing = vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }));
    const error = await getMyCalWebhook(failing, mentorId).catch((e) => e);
    expect(isSyncUnavailableError(error)).toBe(true);
    expect(isSyncUnavailableError({ code: '42501' })).toBe(false);
  });
});
