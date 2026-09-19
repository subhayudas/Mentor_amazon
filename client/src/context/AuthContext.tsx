import { createContext, useCallback, useContext, ReactNode, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { auth, AuthUser } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";

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
  login: (data: LoginData) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const mountedRef = useRef(true);

  const resolve = useCallback(async () => {
    try {
      const currentUser = await auth.getCurrentUser();
      if (mountedRef.current) {
        setUser(currentUser);
        setError(null);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Auth init error:", err);
      if (mountedRef.current) {
        setUser(null);
        setError(err ?? new Error("auth-resolve-failed"));
        setIsLoading(false);
      }
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    mountedRef.current = true;
    resolve();

    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChange((authUser, resolveError) => {
      if (!mountedRef.current) return;
      setUser(authUser);
      setError(resolveError ?? null);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [resolve]);

  const retry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    resolve();
  }, [resolve]);

  const login = async (data: LoginData): Promise<AuthUser> => {
    const authUser = await auth.login(data);
    setUser(authUser);
    setError(null);

    // Clear any stale cache
    queryClient.clear();

    return authUser;
  };

  const logout = async (): Promise<void> => {
    await auth.logout();
    setUser(null);
    setError(null);

    // Clear all cached data
    queryClient.clear();

    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error, retry, login, logout }}>
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
