/**
 * Authentication Service using Supabase Auth
 * Handles all authentication operations directly from the client
 */

import { supabase } from './supabase';
import { db } from './database';
import type { User as DbUser, Mentor, Mentee } from './database';

export type UserRole = 'mentor' | 'mentee' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  user_type: UserRole;
  /** Verified profile row id (mentors.id / mentees.id) owned by this account, if any. */
  profile_id?: string;
  /** Amazon Federate alias (OIDC `sub`) when the account was created via SSO. */
  amazon_alias?: string;
}

export interface SignupData {
  email: string;
  password: string;
  user_type: 'mentee';
}

/**
 * localStorage keys that mirror the signed-in role for legacy consumers
 * (Navigation, mentee dashboard). They are conveniences only — never an
 * identity source. Anything that grants access derives identity from the
 * authenticated session via `auth.getCurrentUser()`.
 */
const MENTOR_STORAGE_KEYS = ['mentorId', 'mentorEmail', 'mentorName'] as const;
const MENTEE_STORAGE_KEYS = ['menteeId', 'menteeEmail', 'menteeName'] as const;

export function clearRoleStorage(keep?: 'mentor' | 'mentee'): void {
  if (keep !== 'mentor') MENTOR_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
  if (keep !== 'mentee') MENTEE_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
}

/** Mirror an auth-derived identity into the legacy role keys (clearing the opposite role). */
export function syncRoleStorage(user: AuthUser | null): void {
  if (!user) {
    clearRoleStorage();
    localStorage.removeItem('user');
    return;
  }
  if (user.user_type === 'mentor' && user.profile_id) {
    clearRoleStorage('mentor');
    localStorage.setItem('mentorId', user.profile_id);
    localStorage.setItem('mentorEmail', user.email);
  } else if (user.user_type === 'mentee') {
    clearRoleStorage('mentee');
    if (user.profile_id) localStorage.setItem('menteeId', user.profile_id);
    localStorage.setItem('menteeEmail', user.email);
  } else {
    clearRoleStorage();
  }
}

export interface LoginData {
  email: string;
  password: string;
}

class AuthService {
  /**
   * Sign up a new user
   */
  async signup(data: SignupData): Promise<AuthUser> {
    // No pre-check against `users`: anonymous callers cannot read that table
    // (RLS v2), and Supabase Auth already rejects duplicate emails itself.

    // Self-service signup is mentee-only. Mentor identities come from Amazon
    // SSO (amazonAlias) plus an approved mentor record — never a self-selected role.
    if (data.user_type !== 'mentee') {
      throw new Error('Mentor accounts are provisioned through Amazon sign-in');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          user_type: data.user_type,
        },
      },
    });

    if (authError) {
      console.error('Supabase signup error:', authError);
      throw new Error(authError.message);
    }

    if (!authData.user) {
      throw new Error('Failed to create user');
    }

    // The `users` row can only be inserted by an authenticated session (RLS).
    // With email confirmation on there is no session yet, so the row is
    // created lazily on the first signed-in resolveAuthUser() instead.
    if (authData.session) {
      await this.ensureUsersRow(authData.user.id, data.email, 'mentee');
    }

    return {
      id: authData.user.id,
      email: data.email,
      user_type: data.user_type,
    };
  }

  /**
   * Log in an existing user
   */
  async login(data: LoginData): Promise<AuthUser> {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      console.error('Login error:', authError);
      throw new Error('Invalid email or password');
    }

    if (!authData.user) {
      throw new Error('Login failed');
    }

    return this.resolveAuthUser(authData.user);
  }

  /**
   * Build the app-level identity from a Supabase auth user.
   *
   * Role comes from the `users` row (authoritative) and falls back to auth
   * metadata only for accounts that predate the row. The profile id is only
   * ever a row that this account provably owns: `users.profile_id`, or the
   * mentor/mentee row whose email equals the authenticated email (the same
   * predicate RLS uses for ownership). Nothing here reads localStorage.
   */
  private async resolveAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<AuthUser> {
    const email = user.email!;
    const metadata = user.user_metadata || {};

    let userType: UserRole = (metadata.user_type as UserRole) || 'mentee';
    let profileId: string | undefined;

    let dbUser = await db.getUserByEmail(email);
    if (!dbUser) {
      // Password signups that confirmed their email never had a session at
      // signup time, so their row is created here on first sign-in. The RLS
      // insert policy only allows a mentee row for one's own id/email.
      dbUser = await this.ensureUsersRow(user.id, email, 'mentee');
    }
    if (dbUser) {
      userType = dbUser.user_type;
      profileId = dbUser.profile_id || undefined;
    }

    if (!profileId) {
      if (userType === 'mentor') {
        const mentor = await db.getMentorByEmail(email);
        profileId = mentor?.id;
      } else if (userType === 'mentee') {
        const mentee = await db.getMenteeByEmail(email);
        profileId = mentee?.id;
      }
    }

    const name =
      (metadata.full_name as string | undefined) ||
      (metadata.name as string | undefined) ||
      undefined;

    return {
      id: user.id,
      email,
      name,
      user_type: userType,
      profile_id: profileId,
      amazon_alias: (dbUser?.amazon_alias || (metadata.amazon_alias as string | undefined)) || undefined,
    };
  }

  /**
   * Create the app-level users row for a signed-in account if it is missing.
   * Never throws: identity resolution falls back to auth metadata.
   */
  private async ensureUsersRow(id: string, email: string, userType: 'mentee'): Promise<DbUser | null> {
    try {
      return await db.createUser({
        id,
        email,
        password: 'managed-by-supabase-auth', // placeholder; Supabase Auth owns credentials
        user_type: userType,
      });
    } catch (dbError) {
      // Duplicate (concurrent first sign-in) or RLS-denied: re-read, else fall back.
      try {
        return await db.getUserByEmail(email);
      } catch {
        console.warn('Could not create user record in database:', dbError);
        return null;
      }
    }
  }

  /**
   * Log out the current user
   */
  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error);
      throw new Error('Failed to logout');
    }

    // Clear every role mirror so a later login as the other role can't inherit stale ids
    syncRoleStorage(null);
  }

  /**
   * Get the current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }

    return this.resolveAuthUser(user);
  }

  /**
   * Send password reset email
   */
  async forgotPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      console.error('Forgot password error:', error);
      // Don't throw - we don't want to reveal if email exists
    }
  }

  /**
   * Reset password with token (called after user clicks reset link)
   */
  async resetPassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('Reset password error:', error);
      throw new Error('Failed to reset password');
    }
  }

  /**
   * Update user profile ID after creating mentor/mentee profile
   */
  async updateProfileId(userId: string, profileId: string): Promise<void> {
    // Update in Supabase user metadata
    await supabase.auth.updateUser({
      data: { profile_id: profileId },
    });

    // Update in our database
    const { error } = await supabase
      .from('users')
      .update({ profile_id: profileId })
      .eq('id', userId);

    if (error) {
      console.warn('Could not update profile_id in database:', error);
    }
  }

  /**
   * Listen for auth state changes
   */
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // auth-js holds its lock while it awaits this callback, so no other
        // Supabase call (getUser, PostgREST reads that need the session) may
        // be awaited in here or the client deadlocks — updateUser() and the
        // token auto-refresh both emit events from inside the lock. Resolve
        // the identity on the next tick, outside the lock, using the session
        // user that was handed to us.
        if (!session?.user) {
          callback(null);
          return;
        }
        const sessionUser = session.user;
        setTimeout(() => {
          this.resolveAuthUser(sessionUser)
            .then(callback)
            .catch((error) => {
              console.error('Auth state resolution error:', error);
              callback(null);
            });
        }, 0);
      }
    );

    return () => subscription.unsubscribe();
  }

  /**
   * Get session (for checking if user is logged in)
   */
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Get session error:', error);
      return null;
    }
    return session;
  }
}

// Export singleton instance
export const auth = new AuthService();

