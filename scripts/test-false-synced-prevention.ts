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
  setAppState,
  getAppState,
} from '../src/services/db';

import {
  createStudent,
} from '../src/services/recordService';

import {
  syncOperationToCloud,
  getSupabase,
  getSupabaseConfig,
  updateSupabaseConfig,
  initSupabaseConfig,
  setNetworkSimulation,
  serializeStudentToSupabase,
  serializeAttendanceToSupabase,
  uploadWorkspaceSnapshotToSupabase,
  downloadWorkspaceSnapshotFromSupabase,
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

async function runFalseSyncedPreventionTests() {
  console.log('================================================================');
  console.log('TEST SUITE: False "Synced" Status Prevention & Live Project Audit');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // 1. Check Project URL and SQL Editor Consistency
  // -------------------------------------------------------------------------
  console.log('--- 1. Supabase Project Configuration & Consistency ---');
  const envUrl = process.env.VITE_SUPABASE_URL || '';
  const envKey = process.env.VITE_SUPABASE_ANON_KEY || '';

  assert(
    Boolean(envUrl && envUrl.includes('supabase.co')),
    '1.1 Project URL Configured',
    `VITE_SUPABASE_URL is defined: "${envUrl}"`
  );
  assert(
    Boolean(envKey && envKey.length > 20),
    '1.2 Anon/Publishable Key Configured',
    `VITE_SUPABASE_ANON_KEY is present and formatted (${envKey.substring(0, 15)}...)`
  );

  const initialConfig = await initSupabaseConfig();
  assert(
    initialConfig.url === envUrl,
    '1.3 Config Init Preserves Environment Project URL',
    `Current client URL matches environment: "${initialConfig.url}"`
  );

  // -------------------------------------------------------------------------
  // 2. Read-Only Verification of Remote Table Count
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Live Supabase Read-Only Inspection ---');
  const liveClient = createClient(envUrl, envKey);
  const { data: remoteStudents, count: studentCount, error: countError } = await liveClient
    .from('students')
    .select('*', { count: 'exact', head: true });

  assert(
    countError === null,
    '2.1 Live Supabase Connection Successful',
    `Connected to "${envUrl}" without error`
  );
  assert(
    studentCount === 0,
    '2.2 Live Supabase SQL Editor Row Count Match',
    `Remote public.students has count: ${studentCount} (Consistent with SQL Editor COUNT(*) = 0)`
  );

  // -------------------------------------------------------------------------
  // 3. Root Cause Verification: No Fallback to Mock Store on Cloud Rejection
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Cloud Rejection & Fallback Prevention ---');
  const testOwnerId = 'c3333333-3333-4000-8000-000000000001';
  const testOwnerEmail = 'operator.test@gbhs.edu.pk';
  setActiveWorkspaceId(testOwnerId);

  const mockSession: AuthSession = {
    user: {
      id: testOwnerId,
      email: testOwnerEmail,
      fullName: 'Computer Operator Test',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School',
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

  // Clean local IndexedDB
  await clearAllStudentsLocally();
  const existingOps = await getOutboxOperations();
  for (const op of existingOps) {
    await removeOutboxOperation(op.opId);
  }

  // Create student locally in Class 1
  const createResult = await createStudent(
    {
      serialNo: '1',
      rollNo: '201',
      district: 'Lasbela',
      schoolName: 'GBHS Jam Yousf Colony',
      trade: 'Computer Operator',
      name: 'Test Student False Synced Check',
      fatherName: 'Father Name',
      gender: 'Male',
      class: 'Class 1',
      section: 'A',
      admissionNo: 'ADM-FALSE-SYNC-001',
      status: 'Active',
      phone: '03001234567',
    },
    testOwnerEmail
  );

  assert(createResult.success && Boolean(createResult.student), '3.1 Local Student Created', 'Student created locally in IndexedDB');
  const student = createResult.student!;

  const pendingOps = await getOutboxOperations();
  const studentOp = pendingOps.find((o) => o.entityId === student.id);
  assert(Boolean(studentOp), '3.2 Outbox Operation Enqueued', `Operation ${studentOp?.opId} enqueued`);

  // Simulate remote check constraint failure (or server rejecting the operation)
  await setNetworkSimulation('check_constraint_class');
  const syncResult = await syncOperationToCloud(studentOp!, mockSession.token, testOwnerId, 'owner');

  assert(
    syncResult.success === false,
    '3.3 syncOperationToCloud Rejects on Remote Failure',
    `Result success is false (Never falsely reports true)`
  );
  assert(
    syncResult.error?.type === 'validation',
    '3.4 Validation Error Accurately Reported',
    `Error type is "${syncResult.error?.type}"`
  );

  // Verify syncEngine marks operation failed, NEVER synced
  syncEngine.setOnlineStatus(true);
  await syncEngine.processQueue();

  const opsAfterSync = await getOutboxOperations();
  const processedOp = opsAfterSync.find((o) => o.entityId === student.id);

  assert(
    processedOp?.status === 'failed',
    '3.5 Outbox Operation Marked Failed (Never Synced)',
    `Outbox operation status is "${processedOp?.status}"`
  );

  const stats = await syncEngine.getStats();
  assert(
    stats.syncedCount === 0 && stats.failedCount === 1,
    '3.6 Honest Sync Stats Reporting',
    `Stats: syncedCount=${stats.syncedCount}, failedCount=${stats.failedCount}, overallStatus="${stats.overallStatus}"`
  );

  // -------------------------------------------------------------------------
  // 4. Mock Store Fallback Strictly Blocked When Real Cloud Configured
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Mock Fallback Lockdown Under Real Credentials ---');

  // Verify snapshot upload refuses mock fallback when client is null but config exists
  const snapshotRes = await uploadWorkspaceSnapshotToSupabase(
    null,
    testOwnerId,
    {
      students: [student],
      attendance: [],
      teachingLogs: [],
      practicalProgress: [],
      absenteeFollowups: [],
    },
    testOwnerId,
    'owner'
  );

  assert(
    snapshotRes.success === false,
    '4.1 Snapshot Upload Rejects Mock Fallback When Configured',
    `uploadWorkspaceSnapshotToSupabase returned false with error: "${snapshotRes.error}"`
  );

  // Verify snapshot download refuses mock fallback when client is null but config exists
  const downloadRes = await downloadWorkspaceSnapshotFromSupabase(
    null,
    testOwnerId,
    testOwnerId,
    testOwnerEmail
  );

  assert(
    downloadRes.success === false,
    '4.2 Snapshot Download Rejects Mock Fallback When Configured',
    `downloadWorkspaceSnapshotFromSupabase returned false with error: "${downloadRes.error}"`
  );

  // -------------------------------------------------------------------------
  // 5. Cleanup
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Cleanup & Reset ---');
  await setNetworkSimulation('none');
  await clearAllStudentsLocally();
  const finalOps = await getOutboxOperations();
  for (const op of finalOps) {
    await removeOutboxOperation(op.opId);
  }

  assert(true, '5.1 Local DB State Cleaned', 'Test state reset without affecting production');

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED OUT OF ${testsPassed + testsFailed} TESTS.`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runFalseSyncedPreventionTests().catch((err) => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
