import { createHash } from 'node:crypto';

/**
 * E2E personas and fixture rows, shared by scripts/e2e/seed.ts (which creates them) and the
 * Playwright fixtures/specs (which use them). Every id is deterministic, so a spec never has
 * to look anything up: `ids(project).mentor`, `bookingId(project, 'accepted')`, …
 *
 * Emails: e2e.[<ns>.]<project>.<persona>@mentorconnect.test. The optional namespace
 * (E2E_NS, e.g. "b" or "c") lets two tracks seed and run the same Playwright project on the
 * shared stack without touching each other's rows; Phase 3 runs without one.
 */
export const E2E_PROJECTS = ['desktop-en', 'desktop-ar', 'mobile-en', 'mobile-ar', 'prod-csp'] as const;
export type E2eProject = (typeof E2E_PROJECTS)[number];

/** Personas with an account. `anon` is simply "no session". */
export const ACCOUNT_PERSONAS = ['mentee', 'mentee-empty', 'mentee-new', 'mentor', 'mentor-new', 'mentor-linked', 'admin'] as const;
export type AccountPersona = (typeof ACCOUNT_PERSONAS)[number];
export type Persona = AccountPersona | 'anon';

/** Password of every seeded account (local stack only). */
export const E2E_PASSWORD = 'E2e-local-Passw0rd!';

/** Fixture bookings of the `mentor` persona (design §5.3 A12). */
export const FIXTURE_BOOKINGS = ['pending-1', 'pending-2', 'pending-3', 'accepted', 'confirmed', 'completed'] as const;
export type FixtureBooking = (typeof FIXTURE_BOOKINGS)[number];

export function e2eNamespace(): string {
  const ns = (process.env.E2E_NS ?? '').trim().toLowerCase();
  if (ns && !/^[a-z0-9]{1,8}$/.test(ns)) throw new Error('E2E_NS must be 1-8 lowercase letters or digits');
  // A project prefix would make ssoAliasPattern() match un-namespaced aliases (e2e-x-desktop-…).
  if (['desktop', 'mobile', 'prod'].includes(ns)) throw new Error('E2E_NS must not be a project prefix');
  return ns;
}

function scope(project: string): string {
  const ns = e2eNamespace();
  return ns ? `${ns}.${project}` : project;
}

/** RFC 4122 v5 UUID (SHA-1) of `name` in `namespace`. */
export function uuidv5(name: string, namespace = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function e2eId(project: string, ...parts: string[]): string {
  return uuidv5(`https://mentorconnect.test/e2e/${scope(project)}/${parts.join('/')}`);
}

export function personaEmail(project: string, persona: AccountPersona | `requester-${number}` | 'mentor-linked-profile'): string {
  return `e2e.${scope(project)}.${persona}@mentorconnect.test`;
}

/**
 * Amazon alias for a mock-IdP sign-in made by a spec: e2e-<label>-[<ns>-]<project>. The
 * namespace sits right after the label (Track C's e2e-s24-/e2e-s28- aliases follow the same
 * shape), so the seed can purge exactly one namespace's SSO identities.
 */
export function ssoTestAlias(label: string, project: string): string {
  const ns = e2eNamespace();
  return `e2e-${label}-${ns ? `${ns}-` : ''}${project}`.replace(/[^a-z0-9-]/g, '');
}

/**
 * POSIX regex (Postgres `~`) matching the SSO test aliases the seed may remove: every "e2e…"
 * alias without a namespace (Phase 3, single run), only e2e-<label>-<ns>-… with one.
 */
export function ssoAliasPattern(): string {
  const ns = e2eNamespace();
  return ns ? `^e2e-[a-z0-9]+-${ns}-` : '^e2e';
}

/** Amazon alias recorded for the mentor personas' approved_users rows. */
export function personaAlias(project: string, persona: AccountPersona): string {
  return `e2e-${scope(project).replace(/\./g, '-')}-${persona}`;
}

export function displayName(project: string, persona: string): string {
  const label = persona.replace(/(^|-)([a-z])/g, (_m, dash: string, c: string) => (dash ? ' ' : '') + c.toUpperCase());
  return `E2E ${label} (${scope(project)})`;
}

/** The mentor persona's personal Cal.com link (username/event). */
export function mentorCalLink(project: string): string {
  return `e2e-${scope(project).replace(/\./g, '-')}/30min`;
}

/** Cal.com uid of the `confirmed` fixture booking. */
export function confirmedCalUid(project: string): string {
  return `e2e${scope(project).replace(/[^a-z0-9]/g, '')}confirmeduid`;
}

export function bookingId(project: string, key: FixtureBooking): string {
  return e2eId(project, 'booking', key);
}

/** Row ids of a project's personas (mentors / mentees tables). */
export function ids(project: string) {
  return {
    mentor: e2eId(project, 'mentor'),
    mentorLinkedProfile: e2eId(project, 'mentor-linked-profile'),
    mentee: e2eId(project, 'mentee'),
    menteeEmpty: e2eId(project, 'mentee-empty'),
    requesters: [1, 2, 3].map((n) => e2eId(project, `requester-${n}`)),
  };
}
