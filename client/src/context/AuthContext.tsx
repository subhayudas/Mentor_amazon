import { createContext, useCallback, useContext, ReactNode, useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useLocation } from "wouter";
import { IS_LOCAL } from "@/lib/demo";
import { findLocalAccount, getLocalSession, setLocalSession } from "@/lib/localAuth";
import { localStore } from "@/lib/localStore";
import { auth, AuthUser, type CaptchaOptions } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { ROUTES } from "@/lib/routes";
import { INITIAL_AUTH_HASH, supabase } from "@/lib/supabase";
import { initialRecoveryState, nextRecoveryState, recoveryAppliesTo, type RecoveryState } from "@/lib/authFlow";

interface LoginData {
  email: string;
  password: string;
}

interface AuthContextType {
  user: AuthUser | null | undefined;
  isLoading: boolean;
  /**
   * Set when a Supabase session exists but the app identity (users row)
   * could not be read — an outage, not a sign-out. Guards show an error state
   * with `retry()` instead of redirecting to /login (F-02).
   */
  error: unknown | null;
  retry: () => void;
  /**
   * Re-read the identity without flipping `isLoading` (no skeleton flash):
   * used right after a write that changes it, e.g. onboarding creating the
   * mentor row, so the next page sees the new `profile_id`.
   */
  refresh: () => Promise<AuthUser | null>;
  login: (data: LoginData, options?: CaptchaOptions) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The password-recovery session, if any: started by the recovery link's
 * fragment (captured before supabase-js consumed it) or a `PASSWORD_RECOVERY`
 * event, bound to that session's user, and ended by a sign-out or another
 * account signing in (lib/authFlow `nextRecoveryState`). /reset-password opens
 * its form only for that user (D13, F11).
 */
let recovery: RecoveryState = initialRecoveryState(INITIAL_AUTH_HASH);
supabase.auth.onAuthStateChange((event, session) => {
  // Synchronous and Supabase-free: safe inside auth-js's lock.
  recovery = nextRecoveryState(recovery, event, session?.user?.id ?? null);
});
export function isRecoverySession(userId: string | null | undefined): boolean {
  return recoveryAppliesTo(recovery, userId);
}
/** Whether a recovery link started a recovery session on this page load (the redirect below). */
function recoveryPending(): boolean {
  return recovery.active;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const mountedRef = useRef(true);
  const locationRef = useRef(location);
  locationRef.current = location;

  const resolve = useCallback(async (fresh = false): Promise<AuthUser | null> => {
    try {
      const currentUser = await auth.getCurrentUser({ fresh });
      if (mountedRef.current) {
        setUser(currentUser);
        setError(null);
        setIsLoading(false);
      }
      return currentUser;
    } catch (err) {
      console.error("Auth init error:", err);
      if (mountedRef.current) {
        setUser(null);
        setError(err ?? new Error("auth-resolve-failed"));
        setIsLoading(false);
      }
      return null;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    mountedRef.current = true;
    if (IS_LOCAL) {
      // No Supabase project behind the placeholder env: the session is the
      // locally registered account (lib/localAuth) and follows its changes.
      setUser(getLocalSession());
      setIsLoading(false);
      const unsubscribe = localStore.subscribe(() => {
        if (mountedRef.current) setUser(getLocalSession());
      });
      return () => {
        mountedRef.current = false;
        unsubscribe();
      };
    }
    resolve();

    // A recovery link that Supabase sent to another page (e.g. the Site URL)
    // still ends on the reset form (F34).
    if (recoveryPending() && locationRef.current !== ROUTES.resetPassword) {
      setLocation(ROUTES.resetPassword, { replace: true });
    }

    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChange((authUser, resolveError, event) => {
      if (!mountedRef.current) return;
      setUser(authUser);
      setError(resolveError ?? null);
      if (event === "PASSWORD_RECOVERY") {
        if (locationRef.current !== ROUTES.resetPassword) setLocation(ROUTES.resetPassword, { replace: true });
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [resolve, setLocation]);

  const retry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    resolve();
  }, [resolve]);

  const refresh = useCallback(() => {
    if (IS_LOCAL) {
      const local = getLocalSession();
      setUser(local);
      return Promise.resolve(local);
    }
    // After a profile or role change: never reuse a resolution that started before it.
    return resolve(true);
  }, [resolve]);

  const login = async (data: LoginData, options?: CaptchaOptions): Promise<AuthUser> => {
    if (IS_LOCAL) {
      const account = findLocalAccount(data.email);
      if (!account) throw new Error("local-account-not-found");
      setLocalSession(account);
      setUser(account);
      setError(null);
      queryClient.clear();
      return account;
    }
    const authUser = await auth.login(data, options);
    setUser(authUser);
    setError(null);

    // Clear any stale cache
    queryClient.clear();

    return authUser;
  };

  const logout = async (): Promise<void> => {
    if (IS_LOCAL) setLocalSession(null);
    else await auth.logout();
    // Render "signed out" before the cache is emptied: a component still mounted for the old
    // account (the header's notification bell) would otherwise refetch its emptied queries
    // with the anonymous key in the render the navigation below triggers (401s).
    flushSync(() => {
      setUser(null);
      setError(null);
    });

    // Clear all cached data
    queryClient.clear();

    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error, retry, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
