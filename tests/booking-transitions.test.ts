import { describe, expect, it } from 'vitest';
import { allowedFromStatuses, canTransition } from '../client/src/lib/bookingTransitions.ts';

/**
 * The statuses a client status write may start from (R1-16). database.ts adds them as the
 * PostgREST condition of every cancel / complete, so a stale tab's write matches no row.
 */
describe('allowedFromStatuses', () => {
  it('cancels only a live booking (pending, accepted or confirmed)', () => {
    expect(allowedFromStatuses('canceled')).toEqual(['pending', 'accepted', 'confirmed']);
  });
  it('completes only an accepted or confirmed session', () => {
    expect(allowedFromStatuses('completed')).toEqual(['accepted', 'confirmed']);
  });
  it('answers only a pending request and confirms only an accepted one', () => {
    expect(allowedFromStatuses('accepted')).toEqual(['pending']);
    expect(allowedFromStatuses('rejected')).toEqual(['pending']);
    expect(allowedFromStatuses('confirmed')).toEqual(['accepted']);
  });
  it('has no condition for a status the app never writes', () => {
    expect(allowedFromStatuses('pending')).toBeUndefined();
    expect(allowedFromStatuses('nonsense')).toBeUndefined();
  });
});

describe('canTransition (was the no-match a lost race?)', () => {
  it('a booking the mentee already cancelled cannot be cancelled again, nor completed', () => {
    expect(canTransition('canceled', 'canceled')).toBe(false);
    expect(canTransition('canceled', 'completed')).toBe(false);
  });
  it('a completed session cannot be completed again (the first duration stands) or cancelled', () => {
    expect(canTransition('completed', 'completed')).toBe(false);
    expect(canTransition('completed', 'canceled')).toBe(false);
  });
  it('live bookings can still move on', () => {
    expect(canTransition('accepted', 'canceled')).toBe(true);
    expect(canTransition('confirmed', 'completed')).toBe(true);
    expect(canTransition('pending', 'canceled')).toBe(true);
    expect(canTransition('pending', 'completed')).toBe(false);
  });
});
