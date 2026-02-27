import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as customAuth from '@/lib/customAuth';

export type User = customAuth.AuthUser;
export type Session = customAuth.AuthSession;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean; recoveryKey: string | null }>;
  signOut: () => Promise<void>;
  /** Re-read session from localStorage (e.g. after OTP login) */
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session from localStorage
    const currentSession = customAuth.getSession();
    setSession(currentSession);
    setUser(currentSession?.user ?? null);
    setLoading(false);
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { error, session } = await customAuth.signIn(email, password);
    if (!error && session) {
      setSession(session);
      setUser(session.user);
    }
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { error, session, recoveryKey } = await customAuth.signUp(email, password);
    if (!error && session) {
      setSession(session);
      setUser(session.user);
    }
    return {
      error,
      // Sign up completes immediately (no email confirmation needed)
      needsEmailConfirmation: false,
      recoveryKey: recoveryKey ?? null,
    };
  };

  const signOut = async () => {
    // Clear the in-memory encryption key cache so keys are not accessible after logout
    const { clearKeyCache } = await import('@/lib/crypto');
    clearKeyCache();
    await customAuth.signOut();
    setSession(null);
    setUser(null);
  };

  const refreshAuth = () => {
    const currentSession = customAuth.getSession();
    setSession(currentSession);
    setUser(currentSession?.user ?? null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithEmail, signUpWithEmail, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
