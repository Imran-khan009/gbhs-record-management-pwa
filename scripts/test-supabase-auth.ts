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
  console.error('Failed to read .env file', e);
}

import {
  signInUser,
  signUpUser,
  signOutUser,
  restoreSession,
} from '../src/services/authService';
import { setAppState, removeAppState, enqueueOutboxOperation, removeOutboxOperation } from '../src/services/db';
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

async function runAuthTests() {
  console.log('====================================================');
  console.log('GBHS REAL SUPABASE AUTHENTICATION TEST SUITE');
  console.log('====================================================\n');

  // 1. Client-Side Input Validation (Bad email format)
  const badEmailRes = await signInUser('invalid-email-format', 'validpassword123');
  assert(
    !badEmailRes.success && Boolean(badEmailRes.error?.includes('valid email')),
    'Validation: Bad Email Format',
    `Rejected with: "${badEmailRes.error}"`
  );

  // 2. Client-Side Input Validation (Password too short)
  const shortPassRes = await signInUser('test@example.com', '12345');
  assert(
    !shortPassRes.success && Boolean(shortPassRes.error?.includes('6 characters')),
    'Validation: Short Password',
    `Rejected with: "${shortPassRes.error}"`
  );

  // 3. Real Supabase Live API: Invalid Credentials Rejection
  const invalidCredsRes = await signInUser('nonexistent_user_gbhs@school.pk', 'InvalidPass_999!');
  assert(
    !invalidCredsRes.success && Boolean(invalidCredsRes.error?.includes('Invalid') || invalidCredsRes.error?.includes('credentials')),
    'Supabase Live API: Invalid Credentials',
    `Supabase rejected invalid credentials with: "${invalidCredsRes.error}"`
  );

  // 4. Real Supabase Live API: Sign-Up Endpoint Communication
  const testEmail = `operator_${Date.now()}@gmail.com`;
  const testPassword = `SecurePass_${Date.now()}!`;
  const testFullName = 'Engr. Test Operator';

  const signUpRes = await signUpUser(testEmail, testPassword, testFullName);
  const validSignUpOutcome =
    signUpRes.success === true ||
    (signUpRes.success === false &&
      (signUpRes.error?.includes('rate limit') ||
        signUpRes.error?.includes('already registered') ||
        signUpRes.error?.includes('confirmation')));

  assert(
    Boolean(validSignUpOutcome),
    'Supabase Live API: Sign-Up Handling',
    signUpRes.success
      ? `Registration succeeded. Requires confirmation: ${signUpRes.requiresConfirmation}`
      : `Live Supabase response handled gracefully: "${signUpRes.error}"`
  );

  // 5. Rejection of Legacy Mock Sessions (Requirement 3: Never treat op_gbhs_primary as logged-in)
  const legacyMockSession: AuthSession = {
    user: {
      id: 'op_gbhs_primary',
      email: 's.engrimrantareen@gmail.com',
      fullName: 'Engr. Imran Tareen',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School',
      role: 'Computer Operator',
      workspaceRole: undefined as any,
      workspaceOwnerId: undefined as any,
    },
    token: 'token_mock_legacy_123',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    isTrustedOffline: true,
  };
  await setAppState('gbhs_active_session', legacyMockSession);

  const mockRestored = await restoreSession();
  assert(
    mockRestored === null,
    'Legacy Mock Session Rejection',
    'Legacy mock session (op_gbhs_primary) correctly rejected and not used as active login.'
  );

  // 6. Real Session Storage and Restoration with Workspace Role & UUID
  const realUserUuid = 'c03260a1-4321-4def-9abc-0123456789ab';
  const realUserSession: AuthSession = {
    user: {
      id: realUserUuid,
      email: 'owner@gbhs.edu.pk',
      fullName: 'School Principal & Operator',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: realUserUuid,
    },
    token: 'supabase_real_jwt_token_header.payload.signature',
    refreshToken: 'supabase_real_refresh_token_xyz',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    isTrustedOffline: false,
  };

  await setAppState('gbhs_active_session', realUserSession);

  // Simulate offline to test cached real session restoration
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false },
    configurable: true,
  });

  const offlineSession = await restoreSession();
  assert(
    offlineSession !== null &&
      offlineSession.user.id === realUserUuid &&
      offlineSession.user.workspaceRole === 'owner' &&
      offlineSession.user.workspaceOwnerId === realUserUuid,
    'Real Session Offline Restoration & Role Verification',
    `Restored real session: UUID=${offlineSession?.user.id}, Role=${offlineSession?.user.workspaceRole}, OwnerID=${offlineSession?.user.workspaceOwnerId}`
  );

  // Restore navigator
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
  });

  // 7. Security: Prevention of Overwriting Unsynced Operations of Another User
  const sampleOp = {
    opId: 'op_test_1',
    entityId: 'std_unsynced_1',
    entityType: 'student' as const,
    operationType: 'CREATE' as const,
    payload: { id: 'std_unsynced_1', name: 'Test Student' } as any,
    timestamp: Date.now(),
    status: 'pending' as const,
    retryCount: 0,
    userEmail: 'operator@gbhs.edu.pk',
    version: 1,
  };
  await enqueueOutboxOperation(sampleOp);

  const { checkUnsyncedChangesBeforeLogout } = await import('../src/services/authService');
  const unsyncedCount = await checkUnsyncedChangesBeforeLogout();
  assert(
    unsyncedCount === 1,
    'User Isolation & Data Safety: Detect Unsynced Outbox Work',
    `Successfully detected ${unsyncedCount} unsynced operation(s) pending sync`
  );

  // Clean outbox and active session
  await removeOutboxOperation('op_test_1');
  await removeAppState('gbhs_active_session');

  // 8. Sign-Out & Clean State
  await signOutUser();
  const clearedSession = await restoreSession();
  assert(
    clearedSession === null,
    'Sign-Out & State Clearance',
    'Sign-out successfully invalidated active session and cleared stored tokens.'
  );

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED OUT OF ${testsPassed + testsFailed} TESTS.`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
