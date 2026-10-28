import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthSession } from '../types/auth';
import {
  restoreSession,
  signInUser,
  signUpUser,
  signOutUser,
  subscribeToAuthStateChanges,
  refreshSessionExpiry,
} from '../services/authService';

interface AuthContextType {
  session: AuthSession | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName?: string
  ) => Promise<{ success: boolean; requiresConfirmation?: boolean; error?: string }>;
  logout: (forceClearQueue?: boolean) => Promise<void>;
  refreshSession: () => Promise<void>;
  isSessionExpired: boolean;
  isOfflineSession: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function init() {
      try {
        const loaded = await restoreSession();
        setSession(loaded);
        unsubscribe = subscribeToAuthStateChanges((updatedSession) => {
          setSession(updatedSession);
        });
      } catch (e) {
        console.error('Failed to load persisted session', e);
      } finally {
        setIsLoading(false);
      }
    }

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await signInUser(email, password);
    if (res.success && res.session) {
      setSession(res.session);
      return { success: true };
    }
    return { success: false, error: res.error || 'Authentication failed' };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const res = await signUpUser(email, password, fullName);
    if (res.success && res.session) {
      setSession(res.session);
      return { success: true, requiresConfirmation: false };
    }
    if (res.success && res.requiresConfirmation) {
      return { success: true, requiresConfirmation: true };
    }
    return { success: false, error: res.error || 'Registration failed' };
  };

  const logout = async (forceClearQueue: boolean = false) => {
    await signOutUser(forceClearQueue);
    setSession(null);
  };

  const refreshSession = async () => {
    const updated = await refreshSessionExpiry();
    if (updated) {
      setSession(updated);
    }
  };

  const isSessionExpired = Boolean(session && Date.now() > session.expiresAt);
  const isOfflineSession = Boolean(session?.isTrustedOffline);

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        login,
        signUp,
        logout,
        refreshSession,
        isSessionExpired,
        isOfflineSession,
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
