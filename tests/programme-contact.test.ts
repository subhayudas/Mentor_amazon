import { describe, expect, it } from 'vitest';
import { programmeContactEmail, programmeMailto } from '../client/src/lib/programmeContact';

/**
 * The programme team's address that the request forms offer when their security check cannot
 * run (R1-72): only a plain, well-formed address is used; anything else means no contact line.
 */
describe('programmeContactEmail', () => {
  it('keeps a well-formed address, trimmed', () => {
    expect(programmeContactEmail('programme@mentorconnect.test')).toBe('programme@mentorconnect.test');
    expect(programmeContactEmail('  team+mentors@example.org \n')).toBe('team+mentors@example.org');
  });

  it('treats unset, empty or malformed values as no address', () => {
    for (const raw of [undefined, null, '', '   ', 'programme', 'a@b', 'two words@example.com', 'x@example.com?subject=hi', 'Name <x@example.com>', 'x@example.com,y@example.com', 42]) {
      expect(programmeContactEmail(raw), String(raw)).toBeNull();
    }
  });
});

describe('programmeMailto', () => {
  it('builds a mailto link with the subject encoded (Arabic included)', () => {
    expect(programmeMailto('programme@mentorconnect.test', 'Session request: Manav Gupta')).toBe(
      'mailto:programme@mentorconnect.test?subject=Session%20request%3A%20Manav%20Gupta',
    );
    const ar = programmeMailto('programme@mentorconnect.test', 'طلب جلسة: ماناف غوبتا');
    expect(decodeURIComponent(ar.split('subject=')[1])).toBe('طلب جلسة: ماناف غوبتا');
    expect(ar).not.toMatch(/[\s&]/);
  });
});
