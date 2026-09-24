/**
 * Authentication Service using Supabase Auth
 * Handles all authentication operations directly from the client
 */

import type { AuthChangeEvent } from '@supabase/supabase-js';

import { supabase } from './supabase';
import { db } from './database';
import type { User as DbUser } from './database';
import { AuthFlowError, asAuthFlowError } from './authFlow';
import { authConfirmUrl } from './routes';

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

/**
 * The email the booking dialog / registration mirrored for this visitor, if
 * any — what Login and Signup prefill so an anonymous requester signs in or
 * signs up with exactly the email the request was sent from (F-01, N-08).
 */
export function rememberedMenteeEmail(): string {
  try {
    return localStorage.getItem('menteeEmail')?.trim() ?? '';
  } catch {
    return '';
  }
}

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

/** Cloudflare Turnstile token for Supabase Auth's captcha check (D6); omitted when the widget is off. */
export interface CaptchaOptions {
  captchaToken?: string | null;
}

function captcha(options?: CaptchaOptions): { captchaToken?: string } {
  return options?.captchaToken ? { captchaToken: options.captchaToken } : {};
}

function origin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

class AuthService {
  /**
   * Create a mentee account (F31, F32). The confirmation link returns to
   * `/auth/confirm?next=<same-origin path>`; `captchaToken` is sent whenever
   * the Turnstile widget is on. Throws `AuthFlowError`; an address that
   * already has an account comes back as `user_already_exists` (GoTrue hides
   * it as a user with no identities when confirmations are on).
   */
  async signup(data: SignupData, options: CaptchaOptions & { next?: string | null } = {}): Promise<AuthUser> {
    // No pre-check against `users`: anonymous callers cannot read that table
    // (RLS v2), and Supabase Auth already rejects duplicate emails itself.

    // Self-service signup is mentee-only. Mentor identities come from Amazon
    // SSO (amazonAlias) plus an approved mentor record — never a self-selected role.
    if (data.user_type !== 'mentee') {
      throw new AuthFlowError('mentor_signup_not_allowed', 400, 'Mentor accounts are provisioned through Amazon sign-in');
    }

    let authData;
    try {
      const result = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { user_type: data.user_type },
          emailRedirectTo: authConfirmUrl(origin(), options.next),
          ...captcha(options),
        },
      });
      if (result.error) throw result.error;
      authData = result.data;
    } catch (error) {
      throw asAuthFlowError(error);
    }

    if (!authData.user) {
      throw new AuthFlowError('unknown', null, 'Failed to create user');
    }
    // Confirmations on + address already registered: GoTrue answers with an
    // obfuscated user that has no identities instead of an error.
    if (!authData.session && Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
      throw new AuthFlowError('user_already_exists', 422);
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

  /** Send the sign-up confirmation email again (F32); same redirect as `signup`. */
  async resendSignup(email: string, options: CaptchaOptions & { next?: string | null } = {}): Promise<void> {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: authConfirmUrl(origin(), options.next), ...captcha(options) },
      });
      if (error) throw error;
    } catch (error) {
      throw asAuthFlowError(error);
    }
  }

  /**
   * Password sign-in. Throws `AuthFlowError` with GoTrue's code
   * (`invalid_credentials`, `email_not_confirmed`, `captcha_failed`, rate limits).
   */
  async login(data: LoginData, options: CaptchaOptions = {}): Promise<AuthUser> {
    let authData;
    try {
      const result = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
        options: captcha(options),
      });
      if (result.error) throw result.error;
      authData = result.data;
    } catch (error) {
      throw asAuthFlowError(error);
    }

    if (!authData.user) {
      throw new AuthFlowError('unknown', null, 'Login failed');
    }

    return this.resolveAuthUser(authData.user);
  }

  /**
   * Build the app-level identity from a Supabase auth user.
   *
   * The role comes from the `users` row only (F48): auth `user_metadata` is
   * writable by the account itself, so it never grants a role. With no row
   * (and none creatable) the account is a mentee; a failed row READ is thrown
   * so the guards show the access-error state instead of a wrong role. The
   * profile id is only ever a row that this account provably owns:
   * `users.profile_id`, or the mentor/mentee row whose email equals the
   * authenticated email (the same predicate RLS uses for ownership). Nothing
   * here reads localStorage.
   */
  /** Identity resolutions in flight, by auth user id (see resolveAuthUser). */
  private resolving = new Map<string, Promise<AuthUser>>();

  /**
   * The app identity of a Supabase user. Calls made while one is in flight
   * for the same user share it: a page load resolves the same session from
   * the initial check and from each auth event, and one set of reads is
   * enough (it also leaves nothing half-way when a page signs out right after
   * deciding, e.g. /reset-password for an Amazon account). `fresh` starts a
   * new resolution, for callers that just changed the users/profile rows.
   */
  private resolveAuthUser(
    user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
    options: { fresh?: boolean } = {},
  ): Promise<AuthUser> {
    const pending = options.fresh ? undefined : this.resolving.get(user.id);
    if (pending) return pending;
    const run = this.loadAuthUser(user).finally(() => {
      if (this.resolving.get(user.id) === run) this.resolving.delete(user.id);
    });
    this.resolving.set(user.id, run);
    return run;
  }

  private async loadAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<AuthUser> {
    const email = user.email!;
    const metadata = user.user_metadata || {};

    let userType: UserRole = 'mentee';
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
   * Rows created (or being created) by this page, by auth user id. A first
   * sign-in resolves the identity several times at once (initial load plus
   * the auth events); they share one insert instead of racing into
   * duplicate-key errors.
   */
  private usersRows = new Map<string, Promise<DbUser | null>>();

  /**
   * Create the app-level users row for a signed-in account if it is missing.
   * Never throws: without a row the account is treated as a mentee.
   */
  private ensureUsersRow(id: string, email: string, userType: 'mentee'): Promise<DbUser | null> {
    const pending = this.usersRows.get(id);
    if (pending) return pending;
    const run = this.createUsersRow(id, email, userType).then((row) => {
      // Only a row that exists is remembered; a failure may be retried later.
      if (!row) this.usersRows.delete(id);
      return row;
    });
    this.usersRows.set(id, run);
    return run;
  }

  private async createUsersRow(id: string, email: string, userType: 'mentee'): Promise<DbUser | null> {
    try {
      return await db.createUser({
        id,
        email,
        password: 'managed-by-supabase-auth', // placeholder; Supabase Auth owns credentials
        user_type: userType,
      });
    } catch (dbError) {
      // Duplicate (another tab's first sign-in) or RLS-denied: re-read, else fall back.
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
  async getCurrentUser(options: { fresh?: boolean } = {}): Promise<AuthUser | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }

    return this.resolveAuthUser(user, options);
  }

  /**
   * Send a password-reset email. Throws `AuthFlowError`; GoTrue answers an
   * unknown address like a known one, so the page can surface rate limits and
   * send failures without revealing whether the account exists.
   */
  async forgotPassword(email: string, options: CaptchaOptions = {}): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin()}/reset-password`,
        ...captcha(options),
      });
      if (error) throw error;
    } catch (error) {
      throw asAuthFlowError(error);
    }
  }

  /** Set a new password inside a recovery session. Throws `AuthFlowError` (`weak_password`, `same_password`, …). */
  async resetPassword(newPassword: string): Promise<void> {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } catch (error) {
      throw asAuthFlowError(error);
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
   * Listen for auth state changes. `error` is set when a session exists but
   * the app identity could not be resolved (users-row read failed); the
   * caller then shows an error state with retry instead of treating the
   * person as signed out (F-02).
   */
  onAuthStateChange(callback: (user: AuthUser | null, error?: unknown, event?: AuthChangeEvent) => void): () => void {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // auth-js holds its lock while it awaits this callback, so no other
        // Supabase call (getUser, PostgREST reads that need the session) may
        // be awaited in here or the client deadlocks — updateUser() and the
        // token auto-refresh both emit events from inside the lock. Resolve
        // the identity on the next tick, outside the lock, using the session
        // user that was handed to us.
        if (!session?.user) {
          callback(null, undefined, event);
          return;
        }
        const sessionUser = session.user;
        setTimeout(() => {
          void (async () => {
            // The session may be gone by now (the reset page signs out right after
            // updateUser emits USER_UPDATED): resolving would then query as the
            // anonymous role. SIGNED_OUT reports the change itself.
            const { data: current } = await supabase.auth.getSession();
            if (current.session?.user?.id !== sessionUser.id) return;
            try {
              callback(await this.resolveAuthUser(sessionUser), undefined, event);
            } catch (error) {
              console.error('Auth state resolution error:', error);
              callback(null, error, event);
            }
          })();
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

