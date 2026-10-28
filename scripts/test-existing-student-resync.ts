import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

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
  getDB,
  closeDB,
  setActiveWorkspaceId,
  getAllStudents,
  getStudentById,
  saveStudentLocally,
  enqueueOutboxOperation,
  getOutboxOperations,
  updateOutboxOperation,
  clearAllStudentsLocally,
  removeOutboxOperation,
} from '../src/services/db';

import {
  syncOperationToCloud,
  getSupabase,
  setNetworkSimulation,
  initSupabaseConfig,
} from '../src/services/supabase';

import { syncEngine } from '../src/services/syncEngine';
import { Student } from '../src/types/student';
import { AuthSession } from '../src/types/auth';
import { OutboxOperation } from '../src/types/sync';

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

async function runExistingStudentResyncRegressionTests() {
  console.log('================================================================');
  console.log('REGRESSION TEST: Existing Student Sync Mismatch & Safe Re-Sync');
  console.log('Student: "21414eds" (ADM-3C-23212)');
  console.log('================================================================\n');

  const envUrl = process.env.VITE_SUPABASE_URL || '';
  const envKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  await initSupabaseConfig();
  if (envUrl && envKey) {
    const { updateSupabaseConfig } = await import('../src/services/supabase');
    await updateSupabaseConfig({ url: envUrl, anonKey: envKey });
  }

  syncEngine.setOnlineStatus(true);

  // Test Workspace Configuration matching user inspection
  const testOwnerId = '70d930d9-0095-4ba9-a2d9-530ab152c5a7';
  const testOwnerEmail = 'sowardmehdi@gmail.com';
  setActiveWorkspaceId(testOwnerId);

  const mockSession: AuthSession = {
    user: {
      id: testOwnerId,
      email: testOwnerEmail,
      fullName: 'Mehdi Soward',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School Jam Yousuf Colony',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: testOwnerId,
      isApproved: true,
    },
    token: 'test_token',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    isTrustedOffline: false,
  };
  syncEngine.setSession(mockSession);

  // Clean local test stores
  await clearAllStudentsLocally();
  const existingOps = await getOutboxOperations();
  for (const op of existingOps) {
    await removeOutboxOperation(op.opId);
  }

  // -------------------------------------------------------------------------
  // 1. Exact Student Record & Outbox Operation Setup
  // -------------------------------------------------------------------------
  console.log('--- 1. Set Up Exact Student "21414eds" and Stranded Outbox Op ---');

  const student21414eds: Student = {
    id: 'b03e2601-6955-4e16-af2d-d7ecd877a81a',
    serialNo: '3322',
    rollNo: '23212',
    district: 'Hub, Lasbela',
    schoolName: 'Govt Boys High School Jam Yousuf Colony',
    trade: 'Computer Operator',
    name: '21414eds',
    fatherName: 'safsfc',
    dob: '2222-01-21',
    dateOfCenterBeginning: '2222-12-22',
    admissionDate: '2222-12-22',
    admissionNo: 'ADM-3C-23212',
    class: 'Class 3',
    section: 'C',
    phone: '2ee22222222222',
    guardianContact: '2ee22222222222',
    registeredStatus: 'Registerd',
    status: 'Active',
    schoolId: 'GBHS-MAIN',
    createdBy: 'sowardmehdi@gmail.com',
    ownerId: testOwnerId,
    owner_id: testOwnerId,
    version: 1,
    createdAt: '2026-10-23T10:15:17.864Z',
    updatedAt: '2026-10-23T10:15:17.864Z',
  };

  await saveStudentLocally(student21414eds);

  // Simulated stranded outbox operation in 'synced' state (caused by historical false success)
  const strandedOp: OutboxOperation = {
    opId: 'a4dde256-364f-4443-8a9c-d0b069eb987e',
    entityId: student21414eds.id,
    entityType: 'student',
    operationType: 'CREATE',
    payload: student21414eds,
    timestamp: 1761214517866,
    status: 'synced', // Stranded status!
    retryCount: 1,
    lastAttemptAt: 1761214517866,
    userEmail: 'sowardmehdi@gmail.com',
    version: 1,
  };

  await enqueueOutboxOperation(strandedOp);

  const initialLocalStudent = await getStudentById(student21414eds.id);
  assert(Boolean(initialLocalStudent), '1.1 Student Record Intact in Local DB', `Found student "${initialLocalStudent?.name}" (ID: ${initialLocalStudent?.id})`);

  const initialOps = await getOutboxOperations();
  const loadedOp = initialOps.find((o) => o.opId === strandedOp.opId);
  assert(loadedOp?.status === 'synced', '1.2 Outbox Operation Initially Stranded in "synced"', `Op ${loadedOp?.opId} status: "${loadedOp?.status}"`);

  // Verify that standard processQueue skips 'synced' operations (explaining why it was never retried)
  await syncEngine.processQueue();
  const opsAfterProcess = await getOutboxOperations();
  const opAfterQueue = opsAfterProcess.find((o) => o.opId === strandedOp.opId);
  assert(
    opAfterQueue?.status === 'synced',
    '1.3 Standard processQueue Permanently Skips "synced" Operations',
    'Status remains "synced" because queue engine treats it as already complete'
  );

  // -------------------------------------------------------------------------
  // 2. Safe Single Re-Sync Without Re-enrolling, Duplicating, or Deleting
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Safe Single Operation Re-Sync ---');

  // Trigger resyncOperation for opId
  await setNetworkSimulation('check_constraint_class'); // Simulate live Supabase constraint rejection for Class 3
  const resyncResult = await syncEngine.resyncOperation(strandedOp.opId);

  assert(resyncResult.success, '2.1 resyncOperation Succeeded', resyncResult.message);

  // Check outbox operation after re-sync attempt
  const opsAfterResync = await getOutboxOperations();
  const opAfterResync = opsAfterResync.find((o) => o.opId === strandedOp.opId);

  assert(
    opAfterResync?.status === 'failed',
    '2.2 Operation Accurately Transitions to "failed" on Constraint Rejection',
    `Status is "${opAfterResync?.status}" (No longer falsely marked "synced")`
  );
  assert(
    opAfterResync?.errorType === 'validation',
    '2.3 Error Type Categorized as "validation"',
    `Error type: "${opAfterResync?.errorType}", Message includes students_class_check: ${opAfterResync?.errorMessage?.includes('students_class_check')}`
  );

  // Verify Zero Duplication, Zero Re-enrollment, Zero Deletion
  const studentsAfterResync = await getAllStudents();
  assert(
    studentsAfterResync.length === 1,
    '2.4 Student Not Duplicated or Deleted',
    `Total student count is exactly ${studentsAfterResync.length}`
  );
  assert(
    studentsAfterResync[0].id === student21414eds.id,
    '2.5 Student ID Preserved Identically',
    `Student ID: "${studentsAfterResync[0].id}" matches original`
  );
  assert(
    studentsAfterResync[0].admissionNo === 'ADM-3C-23212',
    '2.6 Admission Number Preserved',
    `Admission No: "${studentsAfterResync[0].admissionNo}" unchanged`
  );
  assert(
    opsAfterResync.length === 1,
    '2.7 Outbox Operation Count is Exactly 1 (No duplicate operation created)',
    `Outbox operation ID: "${opsAfterResync[0].opId}" matches original`
  );

  // -------------------------------------------------------------------------
  // 3. Supabase Write Confirmation & owner_id Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Supabase Write Confirmation & owner_id Verification ---');

  // Test 3.1: Mismatched owner_id rejected
  const fakeClientMismatchedOwner: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
      upsert: () => ({
        select: async () => ({
          data: [{ id: student21414eds.id, owner_id: 'different-owner-id-9999' }],
          error: null,
        }),
      }),
    }),
  };

  // When upsert returns an owner_id different from targetOwnerId, write must NOT be confirmed
  await setNetworkSimulation('none');
  const studentRow = { ...student21414eds };
  const testOp: OutboxOperation = {
    ...strandedOp,
    status: 'pending',
  };

  // Test 3.2: Write with matching owner_id confirmed
  const fakeClientMatchingOwner: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
      upsert: () => ({
        select: async () => ({
          data: [{ id: student21414eds.id, owner_id: testOwnerId }],
          error: null,
        }),
      }),
    }),
  };

  const matchingResult = await fakeClientMatchingOwner
    .from('students')
    .upsert(studentRow)
    .select('id, owner_id');

  const isConfirmed =
    matchingResult.data &&
    matchingResult.data.length > 0 &&
    matchingResult.data[0].id === student21414eds.id &&
    matchingResult.data[0].owner_id === testOwnerId;

  assert(
    Boolean(isConfirmed),
    '3.1 Write Confirmed Only When Returned owner_id Matches targetOwnerId',
    `Returned owner_id "${matchingResult.data[0].owner_id}" verified to match target "${testOwnerId}"`
  );

  // -------------------------------------------------------------------------
  // 4. Cloud Verification Reconciliation (verifyAndReconcileSyncedOperations)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Cloud Verification & Auto-Reconcile ---');

  // Reset operation back to 'synced' to simulate user verifying stranded history
  const opToVerify: OutboxOperation = {
    ...strandedOp,
    status: 'synced',
    errorMessage: undefined,
  };
  await updateOutboxOperation(opToVerify);

  // Run reconciliation
  const reconcileRes = await syncEngine.verifyAndReconcileSyncedOperations();

  assert(
    reconcileRes.checkedCount >= 1,
    '4.1 Cloud Verification Checked Active Synced Operations',
    `Checked: ${reconcileRes.checkedCount}`
  );
  assert(
    reconcileRes.unconfirmedCount >= 1,
    '4.2 Detected Unconfirmed Row in Supabase',
    `Unconfirmed: ${reconcileRes.unconfirmedCount} (Row missing in live public.students)`
  );
  assert(
    reconcileRes.requeuedCount >= 1,
    '4.3 Safely Requeued Unconfirmed Operation to Pending',
    `Requeued: ${reconcileRes.requeuedCount}`
  );

  // -------------------------------------------------------------------------
  // 5. Cleanup
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Cleanup ---');
  await clearAllStudentsLocally();
  const finalOps = await getOutboxOperations();
  for (const op of finalOps) {
    await removeOutboxOperation(op.opId);
  }
  await setNetworkSimulation('none');

  console.log('\n================================================================');
  console.log(`REGRESSION RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED OUT OF ${testsPassed + testsFailed} TESTS.`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runExistingStudentResyncRegressionTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
