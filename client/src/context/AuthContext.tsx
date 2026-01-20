import { createContext, useContext, ReactNode, useState, useEffect } from "react";
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
  login: (data: LoginData) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const currentUser = await auth.getCurrentUser();
        if (mounted) {
          setUser(currentUser);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Auth init error:', error);
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChange((authUser) => {
      if (mounted) {
        setUser(authUser);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (data: LoginData): Promise<AuthUser> => {
    try {
      const authUser = await auth.login(data);
      setUser(authUser);
      
      // Clear any stale cache
      queryClient.clear();
      
      return authUser;
    } catch (error) {
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await auth.logout();
      setUser(null);
      
      // Clear all cached data
      queryClient.clear();
      
      setLocation("/login");
    } catch (error) {
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
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
