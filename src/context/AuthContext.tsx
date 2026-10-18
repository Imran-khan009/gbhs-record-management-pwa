import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthSession } from '../types/auth';
import { loadPersistedSession, loginOperator, logoutOperator, refreshSessionExpiry } from '../services/authService';

interface AuthContextType {
  session: AuthSession | null;
  isLoading: boolean;
  login: (email: string, passcode: string) => Promise<{ success: boolean; error?: string }>;
  logout: (forceClearQueue?: boolean) => Promise<void>;
  refreshSession: () => Promise<void>;
  isSessionExpired: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function init() {
      try {
        const loaded = await loadPersistedSession();
        setSession(loaded);
      } catch (e) {
        console.error('Failed to load persisted session', e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const login = async (email: string, passcode: string) => {
    const res = await loginOperator(email, passcode);
    if (res.success && res.session) {
      setSession(res.session);
      return { success: true };
    }
    return { success: false, error: res.error || 'Authentication failed' };
  };

  const logout = async (forceClearQueue: boolean = false) => {
    await logoutOperator(forceClearQueue);
    setSession(null);
  };

  const refreshSession = async () => {
    const updated = await refreshSessionExpiry();
    if (updated) {
      setSession(updated);
    }
  };

  const isSessionExpired = Boolean(session && Date.now() > session.expiresAt);

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        login,
        logout,
        refreshSession,
        isSessionExpired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
