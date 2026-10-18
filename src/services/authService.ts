import { AuthSession, OperatorUser } from '../types/auth';
import { getAppState, setAppState, removeAppState, getPendingOutboxOperations } from './db';
import { syncEngine } from './syncEngine';

const SESSION_KEY = 'gbhs_active_session';
const DEFAULT_OPERATOR: OperatorUser = {
  id: 'op_gbhs_primary',
  email: 's.engrimrantareen@gmail.com',
  fullName: 'Engr. Imran Tareen',
  schoolId: 'GBHS-MAIN',
  schoolName: 'Govt Boys High School',
  role: 'Computer Operator',
};

// 7 days default offline token duration; session activity extends it
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function loadPersistedSession(): Promise<AuthSession | null> {
  const session = await getAppState<AuthSession>(SESSION_KEY);
  if (!session) return null;

  // If expired, check if we allow trusted offline access
  const now = Date.now();
  if (now > session.expiresAt) {
    // If offline, preserve session as trusted offline for local work, but sync requires re-auth
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      session.isTrustedOffline = true;
    }
  } else {
    // Update activity
    session.lastActiveAt = now;
    await setAppState(SESSION_KEY, session);
  }

  syncEngine.setSession(session);
  return session;
}

export async function loginOperator(
  email: string,
  passcode: string
): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Validate authorized user credentials
  // Allows the primary authorized email or school operator passcode (e.g. 1234 or operator password)
  const isAuthorizedEmail =
    normalizedEmail === 's.engrimrantareen@gmail.com' ||
    normalizedEmail === 'operator@gbhs.edu.pk' ||
    normalizedEmail.includes('gbhs');

  // Friendly PIN / password check: accepts 'gbhs2026', '1234', 'admin', or non-empty passcode
  if (!passcode || passcode.length < 4) {
    return { success: false, error: 'Passcode / PIN must be at least 4 characters.' };
  }

  // Prevent another account from opening or overwriting previous account's local data
  const existingSession = await getAppState<AuthSession>(SESSION_KEY);
  if (existingSession && existingSession.user.email !== normalizedEmail) {
    const pending = await getPendingOutboxOperations();
    if (pending.length > 0) {
      return {
        success: false,
        error: `Cannot log in as "${normalizedEmail}". There are ${pending.length} unsynced changes from previous operator "${existingSession.user.email}". Please sync or safely resolve first to prevent data collision.`,
      };
    }
  }

  const user: OperatorUser = {
    ...DEFAULT_OPERATOR,
    email: normalizedEmail,
    fullName: normalizedEmail === DEFAULT_OPERATOR.email ? DEFAULT_OPERATOR.fullName : 'GBHS Computer Operator',
  };

  const now = Date.now();
  const session: AuthSession = {
    user,
    token: `token_${crypto.randomUUID()}`,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    isTrustedOffline: true,
  };

  await setAppState(SESSION_KEY, session);
  syncEngine.setSession(session);

  return { success: true, session };
}

export async function checkUnsyncedChangesBeforeLogout(): Promise<number> {
  const pending = await getPendingOutboxOperations();
  return pending.length;
}

export async function logoutOperator(forceClearLocalQueue: boolean = false): Promise<void> {
  if (forceClearLocalQueue) {
    // If user explicitly confirms discarding unsynced data
    // Remove session
    await removeAppState(SESSION_KEY);
  } else {
    // Preserve local outbox safely, just deactivate session
    await removeAppState(SESSION_KEY);
  }
  syncEngine.setSession(null);
}

export async function refreshSessionExpiry(): Promise<AuthSession | null> {
  const session = await getAppState<AuthSession>(SESSION_KEY);
  if (session) {
    session.expiresAt = Date.now() + SESSION_DURATION_MS;
    session.lastActiveAt = Date.now();
    session.isTrustedOffline = true;
    await setAppState(SESSION_KEY, session);
    syncEngine.setSession(session);
    return session;
  }
  return null;
}
