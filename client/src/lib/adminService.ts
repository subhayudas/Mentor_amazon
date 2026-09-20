/**
 * Admin data access for /admin.
 *
 * Every call goes straight to Supabase with the signed-in admin's session;
 * RLS (`public.is_admin()`) is what actually authorizes these reads and
 * writes, so nothing here is a security boundary. The service deliberately
 * does not go through `db` so the admin dashboard has no compile-time
 * dependency on the data-layer slice that is evolving in parallel.
 */

import { supabase } from '@/lib/supabase';
import type { Mentor, Mentee, Booking, User, ApprovedUser, AccessRequest, VerificationStatus } from '@/lib/database';

/** Booking row with the small mentor/mentee projections the admin tables need. */
export type AdminBooking = Booking & {
  mentor?: Pick<Mentor, 'id' | 'name' | 'email' | 'country'> | null;
  mentee?: Pick<Mentee, 'id' | 'name' | 'email' | 'user_type' | 'organization_name'> | null;
};

/** `users` row without secrets (never select `password` or reset tokens). */
export type AdminUser = Pick<User, 'id' | 'email' | 'user_type' | 'profile_id' | 'amazon_alias' | 'is_verified' | 'created_at'>;

export type ApprovedRole = ApprovedUser['role'];

export const adminQueryKeys = {
  all: ['admin'] as const,
  mentors: ['admin', 'mentors'] as const,
  mentees: ['admin', 'mentees'] as const,
  bookings: ['admin', 'bookings'] as const,
  users: ['admin', 'users'] as const,
  approvedUsers: ['admin', 'approved-users'] as const,
  accessRequests: ['admin', 'access-requests'] as const,
};

function newId(): string {
  return crypto.randomUUID();
}

/** Amazon aliases are case-insensitive logins; store them in one canonical form. */
export function normalizeAlias(alias: string): string {
  return alias.trim().toLowerCase();
}

/** Best-effort alias guess for a mentor approved by email (`jdoe@amazon.com` → `jdoe`). */
export function aliasFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  return normalizeAlias(local);
}

export interface UpsertApprovedUserInput {
  amazon_alias: string;
  email?: string;
  role: ApprovedRole;
  mentor_id?: string;
  approved_by: string;
  note?: string;
}

export const adminService = {
  // ==================== READS ====================

  async getMentors(): Promise<Mentor[]> {
    const { data, error } = await supabase
      .from('mentors')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Mentor[];
  },

  async getMentees(): Promise<Mentee[]> {
    const { data, error } = await supabase
      .from('mentees')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Mentee[];
  },

  async getBookings(): Promise<AdminBooking[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, mentor:mentors(id, name, email, country), mentee:mentees(id, name, email, user_type, organization_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as AdminBooking[];
  },

  async getUsers(): Promise<AdminUser[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, user_type, profile_id, amazon_alias, is_verified, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as AdminUser[];
  },

  async getApprovedUsers(): Promise<ApprovedUser[]> {
    const { data, error } = await supabase
      .from('approved_users')
      .select('*')
      .order('approved_at', { ascending: false });
    if (error) throw error;
    return (data || []) as ApprovedUser[];
  },

  async getAccessRequests(): Promise<AccessRequest[]> {
    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .order('requested_at', { ascending: false });
    if (error) throw error;
    return (data || []) as AccessRequest[];
  },

  // ==================== MENTORS ====================

  async setMentorAvailability(id: string, isAvailable: boolean): Promise<Mentor> {
    const { data, error } = await supabase
      .from('mentors')
      .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Mentor;
  },

  // ==================== MENTEES ====================

  async setMenteeVerification(id: string, status: VerificationStatus): Promise<Mentee> {
    const { data, error } = await supabase
      .from('mentees')
      .update({ verification_status: status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Mentee;
  },

  // ==================== APPROVED USERS ====================

  /**
   * Insert or re-activate the allow-list row for an alias. `amazon_alias` is
   * unique, so an existing row is updated in place (keeping its id, which
   * may be referenced elsewhere) rather than replaced.
   */
  async upsertApprovedUser(input: UpsertApprovedUserInput): Promise<ApprovedUser> {
    const alias = normalizeAlias(input.amazon_alias);
    if (!alias) throw new Error('Alias is required');
    const email = input.email?.trim().toLowerCase() || undefined;
    const now = new Date().toISOString();

    const { data: existing, error: lookupError } = await supabase
      .from('approved_users')
      .select('id')
      .eq('amazon_alias', alias)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const base = {
      role: input.role,
      is_active: true,
      approved_by: input.approved_by,
      approved_at: now,
    };

    if (existing?.id) {
      // Re-approval: only overwrite the optional columns that were actually supplied,
      // so re-adding a bare alias never wipes an email or mentor link set earlier.
      const { data, error } = await supabase
        .from('approved_users')
        .update({
          ...base,
          ...(email ? { email } : {}),
          ...(input.mentor_id ? { mentor_id: input.mentor_id } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as ApprovedUser;
    }

    const { data, error } = await supabase
      .from('approved_users')
      .insert({
        id: newId(),
        amazon_alias: alias,
        email: email ?? null,
        mentor_id: input.mentor_id ?? null,
        note: input.note ?? null,
        ...base,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ApprovedUser;
  },

  async setApprovedUserActive(id: string, isActive: boolean): Promise<ApprovedUser> {
    const { data, error } = await supabase
      .from('approved_users')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ApprovedUser;
  },

  // ==================== ACCESS REQUESTS ====================

  async resolveAccessRequest(
    id: string,
    status: 'approved' | 'rejected',
    resolvedBy: string,
    note?: string,
  ): Promise<AccessRequest> {
    const { data, error } = await supabase
      .from('access_requests')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        ...(note !== undefined ? { note } : {}),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as AccessRequest;
  },

  /** Allow-list the requester, then close the request. Two writes; the second only runs if the first succeeded. */
  async approveAccessRequest(
    request: AccessRequest,
    role: ApprovedRole,
    adminEmail: string,
  ): Promise<{ approved: ApprovedUser; request: AccessRequest }> {
    const approved = await adminService.upsertApprovedUser({
      amazon_alias: request.amazon_alias,
      email: request.email,
      role,
      approved_by: adminEmail,
    });
    const resolved = await adminService.resolveAccessRequest(request.id, 'approved', adminEmail);
    return { approved, request: resolved };
  },
};
