import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env variables into process.env for Node/Bun test execution
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  // .env might not exist in some environments
}

import {
  signInUser,
  tryOfflineSignIn,
  restoreSession,
  signOutUser,
} from '../src/services/authService';
import { getAppState, setAppState, removeAppState } from '../src/services/db';
import { AuthSession } from '../src/types/auth';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    testsPassed++;
    console.log(`[PASS] ${testName}: ${detail}`);
  } else {
    testsFailed++;
    console.error(`[FAIL] ${testName}: ${detail}`);
  }
}

async function runFinding1VerificationSuite() {
  console.log('================================================================');
  console.log('VERIFICATION SUITE: Finding 1 - Insecure Offline Authentication');
  console.log('================================================================\n');

  const SESSION_KEY = 'gbhs_active_session';

  // Ensure clean state before running
  await removeAppState(SESSION_KEY);

  const originalNavigator = globalThis.navigator;

  // -------------------------------------------------------------------------
  // Scenario 1: Fresh offline owner login is rejected
  // -------------------------------------------------------------------------
  console.log('--- 1. Fresh Offline Owner Login Rejection ---');
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false },
    configurable: true,
  });

  const offlineOwnerAttempt = await signInUser('engrimrantareen@gmail.com', 'MasterPassword123');
  assert(
    offlineOwnerAttempt.success === false,
    '1.1 Fresh offline owner signInUser rejected',
    `Rejected with error: "${offlineOwnerAttempt.error}"`
  );
  assert(
    offlineOwnerAttempt.session === undefined,
    '1.2 No owner session returned on offline signInUser',
    'Session object is strictly undefined'
  );

  const offlineOwnerDirectFallback = await tryOfflineSignIn('engrimrantareen@gmail.com');
  assert(
    offlineOwnerDirectFallback.success === false,
    '1.3 tryOfflineSignIn unconditionally rejected for owner',
    `tryOfflineSignIn returned success: false, error: "${offlineOwnerDirectFallback.error}"`
  );
  assert(
    offlineOwnerDirectFallback.session === undefined,
    '1.4 No session generated via tryOfflineSignIn for owner',
    'Session is undefined'
  );

  const storedAfterOwner = await getAppState<AuthSession>(SESSION_KEY);
  assert(
    storedAfterOwner === null,
    '1.5 IndexedDB session key remains empty after rejected owner sign-in',
    'No session state persisted'
  );

  // -------------------------------------------------------------------------
  // Scenario 2: Fresh offline staff login is rejected
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Fresh Offline Staff Login Rejection ---');
  const offlineStaffAttempt = await signInUser('staff_teacher@gbhs.edu.pk', 'StaffPassword123');
  assert(
    offlineStaffAttempt.success === false,
    '2.1 Fresh offline staff signInUser rejected',
    `Rejected with error: "${offlineStaffAttempt.error}"`
  );
  assert(
    offlineStaffAttempt.session === undefined,
    '2.2 No staff session returned on offline signInUser',
    'Session object is strictly undefined'
  );

  const offlineStaffDirectFallback = await tryOfflineSignIn('staff_teacher@gbhs.edu.pk');
  assert(
    offlineStaffDirectFallback.success === false,
    '2.3 tryOfflineSignIn unconditionally rejected for staff',
    `tryOfflineSignIn returned: "${offlineStaffDirectFallback.error}"`
  );
  assert(
    offlineStaffDirectFallback.session === undefined,
    '2.4 No session generated via tryOfflineSignIn for staff',
    'Session is undefined'
  );

  // -------------------------------------------------------------------------
  // Scenario 3: Unapproved, pending, or revoked staff member offline fallback
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Unapproved / Pending / Revoked Offline Fallback Blocked ---');
  const pendingEmails = [
    'pending_candidate@gbhs.edu.pk',
    'revoked_ex_staff@gbhs.edu.pk',
    'unapproved_user@external.com',
  ];

  for (const email of pendingEmails) {
    const resSignIn = await signInUser(email, 'AnyPassword123');
    assert(
      resSignIn.success === false && resSignIn.session === undefined,
      `3.1 Offline signInUser rejected for ${email}`,
      `Rejected with: "${resSignIn.error}"`
    );

    const resFallback = await tryOfflineSignIn(email);
    assert(
      resFallback.success === false && resFallback.session === undefined,
      `3.2 Offline fallback rejected for ${email}`,
      `Rejected with: "${resFallback.error}"`
    );
  }

  // -------------------------------------------------------------------------
  // Scenario 4: Online Supabase Authentication Integration
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Online Supabase Authentication Integration ---');
  // Restore online status
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
  });

  // Test online input validation and Supabase invalid credentials rejection
  const onlineBadPassRes = await signInUser('engrimrantareen@gmail.com', '123');
  assert(
    onlineBadPassRes.success === false && Boolean(onlineBadPassRes.error?.includes('6 characters')),
    '4.1 Online Password Length Validation',
    `Rejected short password: "${onlineBadPassRes.error}"`
  );

  const onlineInvalidCredsRes = await signInUser('nonexistent_user@gbhs.edu.pk', 'Invalid_Pass_987654');
  assert(
    onlineInvalidCredsRes.success === false &&
      Boolean(
        onlineInvalidCredsRes.error?.toLowerCase().includes('invalid') ||
        onlineInvalidCredsRes.error?.toLowerCase().includes('credential') ||
        onlineInvalidCredsRes.error?.toLowerCase().includes('connect')
      ),
    '4.2 Online Supabase Invalid Credentials Handled Securely',
    `Supabase rejected with: "${onlineInvalidCredsRes.error}"`
  );

  // Verify no passwords or secrets are leaked in error responses
  assert(
    !onlineInvalidCredsRes.error?.includes('Invalid_Pass_987654'),
    '4.3 Passwords never exposed in error message',
    'Supplied password is omitted from error payload'
  );

  // -------------------------------------------------------------------------
  // Scenario 5: Previously authenticated session restoration & security checks
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Session Restoration Verification (Valid vs Forged/Expired) ---');

  // 5A: Valid legitimate session restoration while offline
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false },
    configurable: true,
  });

  const validLegitSession: AuthSession = {
    user: {
      id: '8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d',
      email: 'verified_operator@gbhs.edu.pk',
      fullName: 'Verified Computer Operator',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: '8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d',
      isApproved: true,
    },
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_session_token.signature',
    refreshToken: 'valid_refresh_token_12345',
    createdAt: Date.now() - 3600000,
    lastActiveAt: Date.now() - 60000,
    expiresAt: Date.now() + 86400000, // Expires in 24 hours
    isTrustedOffline: false,
  };

  await setAppState(SESSION_KEY, validLegitSession);
  const restoredValid = await restoreSession();
  assert(
    restoredValid !== null &&
      restoredValid.user.id === validLegitSession.user.id &&
      restoredValid.isTrustedOffline === true,
    '5.1 Valid previously authenticated session restored offline',
    `Restored user: ${restoredValid?.user.email}, isTrustedOffline: ${restoredValid?.isTrustedOffline}`
  );

  // 5B: Reject Forged Offline Tokens (e.g. offline_master_..., offline_member_...)
  const forgedOfflineTokenSession: AuthSession = {
    user: {
      id: '8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d',
      email: 'engrimrantareen@gmail.com',
      fullName: 'Fake Master',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: '8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d',
    },
    token: 'offline_master_1729000000000',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    isTrustedOffline: true,
  };
  await setAppState(SESSION_KEY, forgedOfflineTokenSession);
  const restoredForged = await restoreSession();
  assert(
    restoredForged === null,
    '5.2 Forged offline token (offline_...) rejected and purged',
    'restoreSession returned null for forged token'
  );
  const storedAfterForged = await getAppState(SESSION_KEY);
  assert(
    storedAfterForged === null,
    '5.3 Forged offline token removed from IndexedDB storage',
    'Session storage purged'
  );

  // 5C: Reject Legacy Mock Tokens (token_...)
  const legacyMockTokenSession: AuthSession = {
    ...validLegitSession,
    token: 'token_mock_1729000000000',
  };
  await setAppState(SESSION_KEY, legacyMockTokenSession);
  const restoredLegacy = await restoreSession();
  assert(
    restoredLegacy === null,
    '5.4 Legacy mock token (token_...) rejected and purged',
    'restoreSession returned null for legacy token'
  );

  // 5D: Reject Insecure / Mock User IDs (op_gbhs_primary, op_gbhs_master_imran, member_...)
  const mockUserIds = ['op_gbhs_primary', 'op_gbhs_master_imran', 'member_1729000000'];
  for (const mockId of mockUserIds) {
    const mockIdSession: AuthSession = {
      ...validLegitSession,
      user: {
        ...validLegitSession.user,
        id: mockId,
      },
      token: 'valid_jwt_format_token_header.payload.signature',
    };
    await setAppState(SESSION_KEY, mockIdSession);
    const restoredMock = await restoreSession();
    assert(
      restoredMock === null,
      `5.5 Mock user ID (${mockId}) rejected and purged`,
      'Mock ID rejected'
    );
  }

  // 5E: Reject Expired Sessions
  const expiredSession: AuthSession = {
    ...validLegitSession,
    expiresAt: Date.now() - 1000, // Expired 1 second ago
  };
  await setAppState(SESSION_KEY, expiredSession);
  const restoredExpired = await restoreSession();
  assert(
    restoredExpired === null,
    '5.6 Expired session rejected and purged',
    'restoreSession returned null for expired session'
  );

  // -------------------------------------------------------------------------
  // Scenario 6: Supabase/network errors cannot silently create an authenticated session
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Network Errors Never Create Authenticated Session ---');
  // Simulate online with simulated network failure
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
  });

  // Ensure storage is empty
  await removeAppState(SESSION_KEY);

  // Trigger signIn with network error emulation by pointing to an unreachable domain or intercepting fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch (simulated network disruption)');
  }) as any;

  try {
    const networkFailRes = await signInUser('engrimrantareen@gmail.com', 'ValidPass123456');
    assert(
      networkFailRes.success === false,
      '6.1 Network failure returns success: false',
      `Error reported: "${networkFailRes.error}"`
    );
    assert(
      networkFailRes.session === undefined,
      '6.2 No session returned on network failure',
      'Session object is strictly undefined'
    );
    assert(
      Boolean(networkFailRes.error?.includes('Unable to connect') || networkFailRes.error?.includes('connection') || networkFailRes.error?.includes('network')),
      '6.3 Clear user-friendly error message on network failure',
      `Friendly error message displayed: "${networkFailRes.error}"`
    );

    const storedAfterNetworkFail = await getAppState<AuthSession>(SESSION_KEY);
    assert(
      storedAfterNetworkFail === null,
      '6.4 No session stored in IndexedDB after network failure',
      'Storage remains completely empty'
    );
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  }

  // Cleanup
  await signOutUser();

  console.log('\n================================================================');
  console.log(`FINDING 1 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED OUT OF ${testsPassed + testsFailed} TESTS.`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runFinding1VerificationSuite().catch((err) => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
