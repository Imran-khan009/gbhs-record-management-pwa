import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock localStorage
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

// Mock window and CustomEvent
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: { detail?: any }) {
    this.type = type;
    this.detail = params?.detail;
  }
};
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false }),
};

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
  // .env might not exist
}

import {
  createStudent,
  updateStudent,
  deleteStudent,
} from '../src/services/recordService';
import {
  getStudentById,
  getAllStudents,
  getOutboxOperations,
  removeOutboxOperation,
  clearAllStudentsLocally,
  setActiveWorkspaceId,
} from '../src/services/db';
import {
  serializeStudentToSupabase,
  syncOperationToCloud,
  setNetworkSimulation,
  updateSupabaseConfig,
} from '../src/services/supabase';
import { syncEngine } from '../src/services/syncEngine';
import { normalizeClass, CANONICAL_CLASSES } from '../src/services/classNormalizationService';
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

async function runStudentsClassCheckTests() {
  console.log('================================================================');
  console.log('TEST SUITE: students_class_check Sync & Offline Record Integrity');
  console.log('================================================================\n');

  const testOwnerId = 'e1111111-2222-4000-8000-999999999999';
  const testOwnerEmail = 'owner_operator@gbhs.edu.pk';
  setActiveWorkspaceId(testOwnerId);

  const mockSession: AuthSession = {
    user: {
      id: testOwnerId,
      email: testOwnerEmail,
      fullName: 'Computer Operator',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: testOwnerId,
      isApproved: true,
    },
    token: 'valid_mock_jwt_token',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    isTrustedOffline: false,
  };

  syncEngine.setSession(mockSession);

  // Clean previous local state
  await clearAllStudentsLocally();
  const initialOps = await getOutboxOperations();
  for (const op of initialOps) {
    await removeOutboxOperation(op.opId);
  }

  // -------------------------------------------------------------------------
  // 1. Enrollment & Normalization Flow (Classes 1–10)
  // -------------------------------------------------------------------------
  console.log('--- 1. Enrollment & Normalization Trace ---');

  // Verify normalizeClass handles canonical classes and aliases
  assert(normalizeClass('Class 1') === 'Class 1', '1.1 Canonical Class 1', 'Normalized to Class 1');
  assert(normalizeClass('Class 10') === 'Class 10', '1.2 Canonical Class 10', 'Normalized to Class 10');
  assert(normalizeClass('1') === 'Class 1', '1.3 Numeric alias "1"', 'Normalized to Class 1');
  assert(normalizeClass('10th') === 'Class 10', '1.4 Ordinal alias "10th"', 'Normalized to Class 10');
  assert(normalizeClass('class 7 ') === 'Class 7', '1.5 Case and whitespace tolerance', 'Normalized to Class 7');

  // Create student in Class 1 while offline
  syncEngine.setOnlineStatus(false);

  const createRes = await createStudent(
    {
      serialNo: '1',
      rollNo: '101',
      district: 'Lasbela',
      schoolName: 'GBHS Jam Yousf Colony',
      trade: 'Computer Operator',
      name: 'Muhammad Tariq',
      fatherName: 'Abdul Rasheed',
      gender: 'Male',
      class: 'Class 1',
      section: 'A',
      admissionNo: 'ADM-C1A-101',
      status: 'Active',
      phone: '03001234567',
    },
    testOwnerEmail
  );

  assert(createRes.success === true && Boolean(createRes.student), '1.6 Offline Enrollment Success', 'Student created locally in IndexedDB');
  const enrolledStudent = createRes.student!;

  // Verify record in IndexedDB
  const localStudent = await getStudentById(enrolledStudent.id);
  assert(
    Boolean(localStudent && localStudent.class === 'Class 1' && localStudent.name === 'Muhammad Tariq'),
    '1.7 IndexedDB Persistence',
    `Student record stored in local DB: class="${localStudent?.class}", name="${localStudent?.name}"`
  );

  // Verify Outbox Operation
  const outboxOps = await getOutboxOperations();
  const pendingOp = outboxOps.find((o) => o.entityId === enrolledStudent.id);
  assert(
    Boolean(pendingOp && pendingOp.status === 'pending' && pendingOp.entityType === 'student'),
    '1.8 Outbox Enqueue Verification',
    `Pending operation found in Outbox: opId="${pendingOp?.opId}", entityType="${pendingOp?.entityType}"`
  );
  assert(
    (pendingOp?.payload as any)?.class === 'Class 1',
    '1.9 Outbox Payload Class Preservation',
    `Outbox payload preserved class "${(pendingOp?.payload as any)?.class}"`
  );

  // Verify serialization for Supabase
  const serializedRow = serializeStudentToSupabase(enrolledStudent, testOwnerId);
  assert(
    serializedRow.class === 'Class 1' && serializedRow.owner_id === testOwnerId && serializedRow.admission_no === 'ADM-C1A-101',
    '1.10 Supabase Serialization Mapping',
    `Serialized student: class="${serializedRow.class}", owner_id="${serializedRow.owner_id}", admission_no="${serializedRow.admission_no}"`
  );

  // -------------------------------------------------------------------------
  // 2. Simulating students_class_check Cloud Database Constraint Failure
  // -------------------------------------------------------------------------
  console.log('\n--- 2. students_class_check Cloud Mismatch Handling ---');

  // Configure simulation mode to emulate live database checking ('Class 7', 'Class 8', 'Class 9')
  await setNetworkSimulation('check_constraint_class');

  // Trigger sync while online
  syncEngine.setOnlineStatus(true);
  await syncEngine.processQueue();

  // Check sync outcome for the Class 1 student
  const opsAfterConstraintFailure = await getOutboxOperations();
  const failedOp = opsAfterConstraintFailure.find((o) => o.entityId === enrolledStudent.id);

  assert(
    Boolean(failedOp && failedOp.status === 'failed'),
    '2.1 Operation Marked Failed on Constraint Violation',
    `Op status is "${failedOp?.status}" (Not marked synced falsely)`
  );

  assert(
    failedOp?.errorType === 'validation',
    '2.2 Categorized as Validation Error (Not Network)',
    `errorType is "${failedOp?.errorType}" (Correctly identified as validation/schema constraint)`
  );

  assert(
    Boolean(failedOp?.errorMessage?.includes('students_class_check') || failedOp?.errorMessage?.includes('constraint')),
    '2.3 Descriptive Constraint Error Message',
    `Error message: "${failedOp?.errorMessage}"`
  );

  // -------------------------------------------------------------------------
  // 3. Preservation of Offline Student Record & Outbox Operation
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Record Preservation Guarantees ---');

  // Verify local student in IndexedDB was NOT deleted or overwritten
  const preservedStudent = await getStudentById(enrolledStudent.id);
  assert(
    Boolean(preservedStudent && preservedStudent.id === enrolledStudent.id && preservedStudent.name === 'Muhammad Tariq'),
    '3.1 Local Student 100% Preserved in IndexedDB',
    `Preserved student in IndexedDB: id="${preservedStudent?.id}", name="${preservedStudent?.name}"`
  );

  // Verify outbox op was NOT deleted
  assert(
    Boolean(failedOp && failedOp.entityId === enrolledStudent.id),
    '3.2 Outbox Operation Preserved for Future Retry',
    `Outbox operation "${failedOp?.opId}" remains queued in outbox for resolution`
  );

  // Verify sync engine stats reflect failure honestly
  const stats = await syncEngine.getStats();
  assert(
    stats.failedCount === 1 && stats.overallStatus === 'Sync failed',
    '3.3 Honest Sync Stats Reporting',
    `Sync stats report: failedCount=${stats.failedCount}, overallStatus="${stats.overallStatus}"`
  );

  // -------------------------------------------------------------------------
  // 4. Successful Sync After Migration / Satisfying Constraint
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Resolution & Retry Sync Verification ---');

  // Emulate constraint resolution without executing production migration
  await setNetworkSimulation('mock');

  // Manual retry of failed operations
  await syncEngine.retryAllFailed();

  const opsAfterMigration = await getOutboxOperations();
  const syncedOp = opsAfterMigration.find((o) => o.entityId === enrolledStudent.id);

  assert(
    Boolean(syncedOp && syncedOp.status === 'synced'),
    '4.1 Successful Sync Upon Constraint Resolution',
    `Operation transitioned to status="${syncedOp?.status}"`
  );

  const updatedStats = await syncEngine.getStats();
  assert(
    updatedStats.failedCount === 0 && updatedStats.overallStatus === 'Synced',
    '4.2 Clean Synced Overall Status',
    `Updated stats: failedCount=${updatedStats.failedCount}, overallStatus="${updatedStats.overallStatus}"`
  );

  // Verify no duplicate records created locally
  const allLocal = await getAllStudents();
  const matchingStudents = allLocal.filter((s) => s.id === enrolledStudent.id);
  assert(
    matchingStudents.length === 1,
    '4.3 Duplicate Prevention Guaranteed',
    `Exactly 1 record exists in IndexedDB for ID "${enrolledStudent.id}"`
  );

  // Clean up test data
  await deleteStudent(enrolledStudent.id, testOwnerEmail);
  await clearAllStudentsLocally();

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED OUT OF ${testsPassed + testsFailed} TESTS.`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runStudentsClassCheckTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
