/**
 * Authentication Service using Supabase Auth
 * Handles all authentication operations directly from the client
 */

import { supabase } from './supabase';
import { db } from './database';
import type { User as DbUser, Mentor, Mentee } from './database';

export interface AuthUser {
  id: string;
  email: string;
  user_type: 'mentor' | 'mentee';
  profile_id?: string;
}

export interface SignupData {
  email: string;
  password: string;
  user_type: 'mentor' | 'mentee';
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

    // Get user type from metadata or database
    let userType: 'mentor' | 'mentee' = authData.user.user_metadata?.user_type || 'mentee';
    let profileId: string | undefined;

    // Try to get additional user info from database
    const dbUser = await db.getUserByEmail(data.email);
    if (dbUser) {
      userType = dbUser.user_type;
      profileId = dbUser.profile_id || undefined;
    }

    return {
      id: authData.user.id,
      email: data.email,
      user_type: userType,
      profile_id: profileId,
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

    // Clear local storage
    localStorage.removeItem('user');
    localStorage.removeItem('mentorId');
    localStorage.removeItem('menteeId');
    localStorage.removeItem('mentorEmail');
    localStorage.removeItem('menteeEmail');
    localStorage.removeItem('menteeName');
  }

  /**
   * Get the current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }

    // Get user type from metadata or database
    let userType: 'mentor' | 'mentee' = user.user_metadata?.user_type || 'mentee';
    let profileId: string | undefined;

    // Try to get additional user info from database
    const dbUser = await db.getUserByEmail(user.email!);
    if (dbUser) {
      userType = dbUser.user_type;
      profileId = dbUser.profile_id || undefined;
    }

    return {
      id: user.id,
      email: user.email!,
      user_type: userType,
      profile_id: profileId,
    };
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

