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
    // Check if user already exists in our database
    const existingUser = await db.getUserByEmail(data.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create user in Supabase Auth
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

    // Also create user in our database for profile management
    // Note: In Supabase, we store a hashed version of the password
    // but for frontend-only, we'll let Supabase handle password storage
    try {
      await db.createUser({
        id: authData.user.id,
        email: data.email,
        password: 'managed-by-supabase-auth', // Placeholder - actual auth handled by Supabase
        user_type: data.user_type,
      });
    } catch (dbError) {
      // If database creation fails, the user can still sign in via Supabase Auth
      console.warn('Could not create user record in database:', dbError);
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

    const dbUser = await db.getUserByEmail(email);
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
      async (event, session) => {
        if (session?.user) {
          const user = await this.getCurrentUser();
          callback(user);
        } else {
          callback(null);
        }
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

