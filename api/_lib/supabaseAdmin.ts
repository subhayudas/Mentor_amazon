import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase access for the SSO bridge. This client bypasses RLS,
 * so it lives only in api/ and is only ever built from server env vars.
 */

export type AdminClient = SupabaseClient;

export function createAdminClient(url: string, serviceRoleKey: string): AdminClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class SsoDataError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'SsoDataError';
  }
}

// ---------------------------------------------------------------------------
// Row shapes (subset of shared/schema.ts that the bridge touches)

export interface ApprovedUserRow {
  id: string;
  amazon_alias: string;
  email: string | null;
  role: 'mentor' | 'admin';
  mentor_id: string | null;
  is_active: boolean;
}

export interface UsersRow {
  id: string;
  email: string;
  user_type: 'mentor' | 'mentee' | 'admin';
  profile_id: string | null;
  amazon_alias: string | null;
  is_verified: boolean;
}

/** Escape LIKE wildcards so `ilike` behaves as case-insensitive equality. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function sameText(a: string | null | undefined, b: string): boolean {
  return typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Allow-list

export async function findApprovedUser(sb: AdminClient, alias: string): Promise<ApprovedUserRow | null> {
  const { data, error } = await sb
    .from('approved_users')
    .select('id, amazon_alias, email, role, mentor_id, is_active')
    .ilike('amazon_alias', likeLiteral(alias))
    .eq('is_active', true)
    .limit(5);
  if (error) throw new SsoDataError('approved_lookup', error.message);
  const rows = (data ?? []) as ApprovedUserRow[];
  return rows.find((r) => sameText(r.amazon_alias, alias) && r.is_active) ?? null;
}

export interface AccessRequestInput {
  alias: string;
  email?: string;
  name?: string;
}

/**
 * Record that an unapproved alias tried to sign in. One pending row per alias:
 * a repeat attempt refreshes the email/name on the existing pending row rather
 * than creating a duplicate. A unique-violation from a concurrent insert is
 * treated as success.
 */
export async function upsertAccessRequest(sb: AdminClient, input: AccessRequestInput): Promise<'created' | 'existing'> {
  const { data, error } = await sb
    .from('access_requests')
    .select('id, amazon_alias, email, name')
    .ilike('amazon_alias', likeLiteral(input.alias))
    .eq('status', 'pending')
    .limit(5);
  if (error) throw new SsoDataError('access_request_lookup', error.message);

  const existing = ((data ?? []) as Array<{ id: string; amazon_alias: string; email: string | null; name: string | null }>)
    .find((r) => sameText(r.amazon_alias, input.alias));

  if (existing) {
    const patch: Record<string, string> = {};
    if (input.email && !existing.email) patch.email = input.email;
    if (input.name && !existing.name) patch.name = input.name;
    if (Object.keys(patch).length > 0) {
      await sb.from('access_requests').update(patch).eq('id', existing.id);
    }
    return 'existing';
  }

  const { error: insertError } = await sb.from('access_requests').insert({
    id: randomUUID(),
    amazon_alias: input.alias,
    email: input.email ?? null,
    name: input.name ?? null,
    status: 'pending',
    requested_at: new Date().toISOString(),
  });
  if (insertError) {
    if (insertError.code === '23505') return 'existing';
    throw new SsoDataError('access_request_insert', insertError.message);
  }
  return 'created';
}

// ---------------------------------------------------------------------------
// users row

const USER_COLUMNS = 'id, email, user_type, profile_id, amazon_alias, is_verified';

export async function findUserByAlias(sb: AdminClient, alias: string): Promise<UsersRow | null> {
  const { data, error } = await sb.from('users').select(USER_COLUMNS).ilike('amazon_alias', likeLiteral(alias)).limit(5);
  if (error) throw new SsoDataError('user_lookup_alias', error.message);
  return ((data ?? []) as UsersRow[]).find((r) => sameText(r.amazon_alias, alias)) ?? null;
}

export async function findUserByEmail(sb: AdminClient, email: string): Promise<UsersRow | null> {
  const { data, error } = await sb.from('users').select(USER_COLUMNS).ilike('email', likeLiteral(email)).limit(5);
  if (error) throw new SsoDataError('user_lookup_email', error.message);
  return ((data ?? []) as UsersRow[]).find((r) => sameText(r.email, email)) ?? null;
}

export async function findMentorIdByEmail(sb: AdminClient, email: string): Promise<string | null> {
  const { data, error } = await sb.from('mentors').select('id, email').ilike('email', likeLiteral(email)).limit(5);
  if (error) throw new SsoDataError('mentor_lookup', error.message);
  const row = ((data ?? []) as Array<{ id: string; email: string }>).find((r) => sameText(r.email, email));
  return row?.id ?? null;
}

export interface CreateAuthUserInput {
  email: string;
  role: 'mentor' | 'admin';
  alias: string;
  name?: string;
}

/**
 * Create the Supabase auth user for a first-time SSO login. Returns the new
 * id, or null when an auth user with that email already exists (the caller
 * must then decide whether that pre-existing user may be bound — see the
 * callback; it is never bound blindly).
 */
export async function createAuthUser(sb: AdminClient, input: CreateAuthUserInput): Promise<string | null> {
  const { data, error } = await sb.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: {
      user_type: input.role,
      amazon_alias: input.alias,
      full_name: input.name ?? null,
    },
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message)) return null;
    throw new SsoDataError('auth_create_user', error.message);
  }
  if (!data.user?.id) throw new SsoDataError('auth_create_user', 'no user returned');
  return data.user.id;
}

export interface ExistingAuthUser {
  id: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  providers: string[];
}

/**
 * Look up the auth user that owns an email (used only after createUser reported
 * `email_exists`). The Admin API has no lookup-by-email, so we page through
 * listUsers with a narrow page size — the callback is a rare, single-user
 * path, so the cost is acceptable.
 */
export async function findAuthUserByEmail(sb: AdminClient, email: string): Promise<ExistingAuthUser | null> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new SsoDataError('auth_lookup', error.message);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === wanted);
    if (hit) {
      const providers = (hit.app_metadata as { providers?: unknown } | undefined)?.providers;
      return {
        id: hit.id,
        emailConfirmedAt: hit.email_confirmed_at ?? null,
        lastSignInAt: hit.last_sign_in_at ?? null,
        providers: Array.isArray(providers) ? providers.filter((p): p is string => typeof p === 'string') : [],
      };
    }
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Remove an auth user that nobody has ever confirmed or signed in with — an
 * orphan pre-registration (possibly an attacker squatting on a corporate
 * address ahead of the real person's first SSO login).
 */
export async function deleteAuthUser(sb: AdminClient, id: string): Promise<void> {
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) throw new SsoDataError('auth_delete_user', error.message);
}

/**
 * Invalidate any password on an auth user we are about to bind to an SSO
 * identity, so a credential set before the link can no longer sign in as
 * the privileged account.
 */
export async function rotateAuthPassword(sb: AdminClient, id: string): Promise<void> {
  const { error } = await sb.auth.admin.updateUserById(id, { password: randomBytes(48).toString('base64url') });
  if (error) throw new SsoDataError('auth_rotate_password', error.message);
}

/** Best-effort metadata sync for accounts that predate SSO; never fails the login. */
export async function syncAuthMetadata(sb: AdminClient, userId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await sb.auth.admin.updateUserById(userId, { user_metadata: patch });
  } catch {
    // ignored: metadata is a convenience mirror, the users row is authoritative
  }
}

export interface InsertUsersRowInput {
  id: string;
  email: string;
  role: 'mentor' | 'admin';
  alias: string;
  profileId: string | null;
}

export async function insertUsersRow(sb: AdminClient, input: InsertUsersRowInput): Promise<UsersRow> {
  const row = {
    id: input.id,
    email: input.email,
    password: 'managed-by-amazon-sso',
    user_type: input.role,
    amazon_alias: input.alias,
    profile_id: input.profileId,
    is_verified: true,
    created_at: new Date().toISOString(),
  };
  const { error } = await sb.from('users').insert(row);
  if (error) {
    // Concurrent first login: someone inserted the same email/alias a moment ago.
    if (error.code === '23505') {
      const existing = (await findUserByAlias(sb, input.alias)) ?? (await findUserByEmail(sb, input.email));
      if (existing) return existing;
    }
    throw new SsoDataError('users_insert', error.message);
  }
  return { ...row, profile_id: input.profileId, amazon_alias: input.alias };
}

export async function updateUsersRow(sb: AdminClient, id: string, patch: Partial<Pick<UsersRow, 'amazon_alias' | 'profile_id' | 'is_verified'>>): Promise<void> {
  const { error } = await sb.from('users').update(patch).eq('id', id);
  if (error) throw new SsoDataError('users_update', error.message);
}

// ---------------------------------------------------------------------------
// user_identifiers

export interface IdentifierInput {
  userId: string;
  alias: string;
  email?: string;
  claims: Record<string, unknown>;
}

export async function upsertIdentifier(sb: AdminClient, input: IdentifierInput): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('user_identifiers')
    .select('id, subject')
    .eq('provider', 'amazon')
    .ilike('subject', likeLiteral(input.alias))
    .limit(5);
  if (error) throw new SsoDataError('identifier_lookup', error.message);

  const existing = ((data ?? []) as Array<{ id: string; subject: string }>).find((r) => sameText(r.subject, input.alias));
  if (existing) {
    const { error: updateError } = await sb
      .from('user_identifiers')
      .update({ user_id: input.userId, email: input.email ?? null, claims: input.claims, last_login_at: now })
      .eq('id', existing.id);
    if (updateError) throw new SsoDataError('identifier_update', updateError.message);
    return;
  }

  const { error: insertError } = await sb.from('user_identifiers').insert({
    id: randomUUID(),
    user_id: input.userId,
    provider: 'amazon',
    subject: input.alias,
    email: input.email ?? null,
    claims: input.claims,
    created_at: now,
    last_login_at: now,
  });
  if (insertError && insertError.code !== '23505') {
    throw new SsoDataError('identifier_insert', insertError.message);
  }
}

// ---------------------------------------------------------------------------
// Session bridge

export interface MagicLink {
  hashedToken: string;
  userId: string;
}

/**
 * Mint a one-time magic-link token for the email. The hashed token is what
 * the SPA passes to `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`.
 * The response also carries the auth user, which is how we learn the id of an
 * auth user that existed before the users row did.
 */
export async function generateMagicLink(sb: AdminClient, email: string): Promise<MagicLink> {
  const { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new SsoDataError('magiclink', error.message);
  const hashedToken = data.properties?.hashed_token;
  const userId = data.user?.id;
  if (!hashedToken || !userId) throw new SsoDataError('magiclink', 'incomplete link response');
  return { hashedToken, userId };
}
