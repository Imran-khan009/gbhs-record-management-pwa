import { AuthSession, OperatorUser, UserWorkspaceRole, WorkspaceMember } from '../types/auth';
import {
  getAppState,
  setAppState,
  removeAppState,
  getPendingOutboxOperations,
  setActiveWorkspaceId,
  closeDB,
  clearWorkspaceCachedState,
} from './db';
import { syncEngine } from './syncEngine';
import { DEFAULT_SCHOOL_PROFILE } from './schoolProfileService';
import { isMasterOwnerEmail } from './permissionService';
import {
  getSupabase,
  fetchWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberStatus,
  removeWorkspaceMember,
  checkUserWorkspaceMembership,
} from './supabase';

const SESSION_KEY = 'gbhs_active_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days local cached lifetime

/**
 * Offline sign-in rejection.
 * Fresh sign-ins strictly require an active internet connection to authenticate credentials with Supabase.
 * Offline sessions cannot be created without prior Supabase password verification.
 */
export async function tryOfflineSignIn(
  _normalizedEmail?: string
): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  return {
    success: false,
    error: 'Sign-in requires an active internet connection to securely verify your credentials with Supabase.',
  };
}

/**
 * Helper to build an OperatorUser from Supabase Auth User + Profile
 * All new user registrations and personal logins are AUTOMATICALLY approved
 * as 'approved_user' (Personal User) with full access to their own isolated workspace.
 */
export async function buildOperatorUser(
  authUser: { id: string; email?: string; user_metadata?: Record<string, any> },
  fallbackName?: string
): Promise<OperatorUser> {
  let workspaceRole: UserWorkspaceRole = 'user';
  let workspaceOwnerId = authUser.id;
  let fullName = fallbackName || authUser.user_metadata?.full_name || (authUser.email ? authUser.email.split('@')[0] : 'Operator');
  let isApproved = true;

  // 1. Master Owner Account (Engr Imran Khan) is always authorized as owner
  if (isMasterOwnerEmail(authUser.email)) {
    workspaceRole = 'owner';
    workspaceOwnerId = authUser.id;
    fullName = 'Engr Imran Khan';
    isApproved = true;
  } else {
    // 2. Check if user has an explicit approved staff membership record (access_level: 'read_only')
    try {
      const membership = await checkUserWorkspaceMembership(authUser.id, authUser.email);
      if (membership && membership.status === 'approved' && membership.access_level === 'read_only') {
        workspaceRole = 'team_member';
        workspaceOwnerId = membership.owner_id;
        isApproved = true;
      } else {
        // Automatically approved as Personal User with isolated private workspace
        workspaceRole = 'user';
        workspaceOwnerId = authUser.id;
        isApproved = true;
      }
    } catch {
      workspaceRole = 'user';
      workspaceOwnerId = authUser.id;
      isApproved = true;
    }
  }

  return {
    id: authUser.id,
    email: authUser.email || '',
    fullName,
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    role: 'Computer Operator',
    workspaceRole,
    workspaceOwnerId,
    isApproved: true,
  };
}


/**
 * Sign In with real Supabase Auth (Email + Password)
 */
export async function signInUser(
  email: string,
  password: string
): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  // Initial sign-in strictly requires online access to contact Supabase
  const isOnline = typeof navigator === 'undefined' || typeof navigator.onLine === 'undefined' || navigator.onLine !== false;
  if (!isOnline) {
    return {
      success: false,
      error: 'Sign-in requires an active internet connection to securely verify your credentials with Supabase.',
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase authentication service is unavailable. Please check your system configuration or connect to the internet.',
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('invalid login credentials')) {
        return { success: false, error: 'Invalid email or password. Please verify your credentials and try again.' };
      }
      if (msg.includes('email not confirmed')) {
        return { success: false, error: 'Your email has not been confirmed yet. Please check your inbox for the confirmation link.' };
      }
      if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
        return {
          success: false,
          error: 'Unable to connect to Supabase authentication server. Please check your internet connection and try again.',
        };
      }
      return { success: false, error: error.message };
    }

    if (!data.user || !data.session) {
      return { success: false, error: 'Authentication completed but no user session was returned.' };
    }

    // Safety check: prevent overwriting unsynced operations of another real operator
    const existingSession = await getAppState<AuthSession>(SESSION_KEY);
    const isLegacyMock = existingSession && (existingSession.user.id === 'op_gbhs_primary' || existingSession.token.startsWith('token_'));

    if (existingSession && !isLegacyMock && existingSession.user.id !== data.user.id) {
      const pending = await getPendingOutboxOperations();
      if (pending.length > 0) {
        return {
          success: false,
          error: `Cannot switch user. There are ${pending.length} unsynced operations from previous user "${existingSession.user.email}". Please sync or resolve first to prevent data loss.`,
        };
      }
      // Clean previous user's cached workspace state completely before activating new account
      await clearWorkspaceCachedState();
    }

    const operator = await buildOperatorUser(data.user);

    const now = Date.now();
    const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : now + SESSION_DURATION_MS;

    const session: AuthSession = {
      user: operator,
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
      isTrustedOffline: false,
    };

    setActiveWorkspaceId(operator.workspaceOwnerId || operator.id);
    await setAppState(SESSION_KEY, session);
    syncEngine.setSession(session);

    return { success: true, session };
  } catch (err: any) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
      return {
        success: false,
        error: 'Unable to connect to Supabase authentication server. Please check your internet connection and try again.',
      };
    }
    return { success: false, error: err.message || 'An unexpected error occurred during sign-in.' };
  }
}

/**
 * Sign Up with real Supabase Auth
 */
export async function signUpUser(
  email: string,
  password: string,
  fullName?: string
): Promise<{ success: boolean; session?: AuthSession; requiresConfirmation?: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  const isOnline = typeof navigator === 'undefined' || typeof navigator.onLine === 'undefined' || navigator.onLine !== false;
  if (!isOnline) {
    return { success: false, error: 'Account creation requires an active internet connection.' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Supabase client is not initialized.' };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: fullName?.trim() || normalizedEmail.split('@')[0],
        },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('user already registered')) {
        return { success: false, error: 'An account with this email is already registered. Please sign in instead.' };
      }
      if (error.message.toLowerCase().includes('rate limit')) {
        return { success: false, error: 'Supabase email rate limit reached. Please wait a short while or configure custom SMTP in Supabase.' };
      }
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Registration failed. Please try again.' };
    }

    // If Supabase has email confirmation disabled, session is returned immediately
    if (data.session) {
      const operator = await buildOperatorUser(data.user, fullName);
      const now = Date.now();
      const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : now + SESSION_DURATION_MS;

      const session: AuthSession = {
        user: operator,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        createdAt: now,
        lastActiveAt: now,
        expiresAt,
        isTrustedOffline: false,
      };

      setActiveWorkspaceId(operator.workspaceOwnerId || operator.id);
      await setAppState(SESSION_KEY, session);
      syncEngine.setSession(session);

      return { success: true, session, requiresConfirmation: false };
    }

    // Email confirmation required
    return { success: true, requiresConfirmation: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'An unexpected error occurred during sign-up.' };
  }
}

/**
 * Sign Out
 */
export async function signOutUser(forceClearLocalQueue: boolean = false): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors on sign-out
    }
  }

  await removeAppState(SESSION_KEY);
  syncEngine.setSession(null);
  await clearWorkspaceCachedState();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gbhs_school_profile_changed', { detail: DEFAULT_SCHOOL_PROFILE })
    );
  }
}

/**
 * Restore Session:
 * 1. Checks Supabase client getSession() when online.
 * 2. If offline or network unreachable, falls back to locally cached session in IndexedDB.
 */
export async function restoreSession(): Promise<AuthSession | null> {
  const supabase = getSupabase();
  const isOnline = typeof navigator === 'undefined' || typeof navigator.onLine === 'undefined' || navigator.onLine !== false;

  // 1. Try real Supabase session restoration if online
  if (supabase && isOnline) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data?.session?.user) {
        const operator = await buildOperatorUser(data.session.user);
        const now = Date.now();
        const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : now + SESSION_DURATION_MS;

        const session: AuthSession = {
          user: operator,
          token: data.session.access_token,
          refreshToken: data.session.refresh_token,
          createdAt: now,
          lastActiveAt: now,
          expiresAt,
          isTrustedOffline: false,
        };

        setActiveWorkspaceId(operator.workspaceOwnerId || operator.id);
        await setAppState(SESSION_KEY, session);
        syncEngine.setSession(session);
        return session;
      } else if (!error && !data?.session) {
        // Online and Supabase explicitly reports NO active authenticated session.
        // Clean up any stored session so login screen is properly presented.
        await removeAppState(SESSION_KEY);
        return null;
      }
    } catch {
      // If getSession fails due to network error, fall through to cached local session below
    }
  }

  // 2. Offline / Cached Session Fallback from IndexedDB (strictly when offline or network unreachable)
  const cached = await getAppState<AuthSession>(SESSION_KEY);
  if (!cached) return null;

  // Security Verification: Reject invalid, expired, mock, or fake offline tokens
  const isInvalidToken =
    !cached.token ||
    cached.token.startsWith('offline_') ||
    cached.token.startsWith('token_');

  const isInvalidUser =
    !cached.user ||
    !cached.user.id ||
    !cached.user.email ||
    !cached.user.workspaceRole ||
    cached.user.id === 'op_gbhs_primary' ||
    cached.user.id === 'op_gbhs_master_imran' ||
    cached.user.id.startsWith('member_');

  const isExpired = Boolean(cached.expiresAt && Date.now() > cached.expiresAt);

  if (isInvalidToken || isInvalidUser || isExpired) {
    await removeAppState(SESSION_KEY);
    return null;
  }

  // Preserve existing role; ensure personal users without explicit role are assigned 'user'
  if (cached.user && !isMasterOwnerEmail(cached.user.email) && cached.user.workspaceRole !== 'team_member' && cached.user.workspaceRole !== 'owner') {
    cached.user.isApproved = true;
    cached.user.workspaceRole = 'user';
    cached.user.workspaceOwnerId = cached.user.id;
  }

  setActiveWorkspaceId(cached.user.workspaceOwnerId || cached.user.id);
  // Mark as trusted offline session
  cached.isTrustedOffline = true;
  cached.lastActiveAt = Date.now();
  await setAppState(SESSION_KEY, cached);
  syncEngine.setSession(cached);

  return cached;
}

/**
 * Subscribe to Supabase Auth State Changes
 */
export function subscribeToAuthStateChanges(callback: (session: AuthSession | null) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const { data: authListener } = supabase.auth.onAuthStateChange(async (event, sbSession) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (sbSession?.user) {
        const operator = await buildOperatorUser(sbSession.user);
        const now = Date.now();
        const expiresAt = sbSession.expires_at ? sbSession.expires_at * 1000 : now + SESSION_DURATION_MS;

        const session: AuthSession = {
          user: operator,
          token: sbSession.access_token,
          refreshToken: sbSession.refresh_token,
          createdAt: now,
          lastActiveAt: now,
          expiresAt,
          isTrustedOffline: false,
        };

        setActiveWorkspaceId(operator.workspaceOwnerId || operator.id);
        await setAppState(SESSION_KEY, session);
        syncEngine.setSession(session);
        callback(session);
      }
    } else if (event === 'SIGNED_OUT') {
      await removeAppState(SESSION_KEY);
      syncEngine.setSession(null);
      await clearWorkspaceCachedState();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('gbhs_school_profile_changed', { detail: DEFAULT_SCHOOL_PROFILE })
        );
      }
      callback(null);
    }
  });

  return () => {
    authListener.subscription.unsubscribe();
  };
}

export async function checkUnsyncedChangesBeforeLogout(): Promise<number> {
  const pending = await getPendingOutboxOperations();
  return pending.length;
}

export async function refreshSessionExpiry(): Promise<AuthSession | null> {
  return restoreSession();
}

// Backward-compatible exports
export const loginOperator = signInUser;
export const logoutOperator = signOutUser;
export const loadPersistedSession = restoreSession;

export async function getActiveSession(): Promise<AuthSession | null> {
  const cached = await getAppState<AuthSession>(SESSION_KEY);
  return cached || null;
}

// Workspace Member Management Exports (Owner Only)
export const getWorkspaceMembersList = fetchWorkspaceMembers;
export const inviteTeamMemberByEmail = addWorkspaceMember;
export const approveMemberAccess = (memberId: string) => updateWorkspaceMemberStatus(memberId, 'approved');
export const revokeMemberAccess = (memberId: string) => updateWorkspaceMemberStatus(memberId, 'revoked');
export const deleteMember = removeWorkspaceMember;
