/**
 * Isolated Regression Test: Safe Backup Restore
 * 
 * Verifies:
 * 1. Valid restore (happy path restoring all 8 IndexedDB stores, preserving relationships & IDs)
 * 2. Invalid JSON handling (syntax error rejection)
 * 3. Wrong application identity rejection (rejects backups not from GBHS application)
 * 4. Missing expected stores rejection (rejects backup missing any of the 8 stores)
 * 5. Extra unexpected stores rejection (rejects arbitrary extra stores)
 * 6. Record-count mismatch rejection (rejects metadata declaring false counts)
 * 7. Invalid relational integrity rejection (rejects attendance referencing unknown student ID)
 * 8. Workspace ownership & isolation verification (rejects cross-workspace restore)
 * 9. Failed restoration rollback protection (automatic restoration of pre-restore snapshot)
 * 10. Read-only Staff access denial (rejects non-owner / staff attempt to restore)
 * 11. Secrets and authentication tokens redaction guarantee in app_state
 * 12. Pending outbox safe archiving (prevents auto-replay or false synced status)
 */

import 'fake-indexeddb/auto';
import { getDB, setActiveWorkspaceId, getWorkspaceDatabaseName } from '../src/services/db';
import {
  validateBackupJSON,
  restoreBackupData,
  getStoreCounts,
  createBackupData,
  APP_NAME,
  APP_VERSION,
  STORE_NAMES,
} from '../src/services/backupService';
import { syncEngine } from '../src/services/syncEngine';
import { DatabaseBackup, StoreCounts } from '../src/types/backup';
import { Student, AttendanceRecord } from '../src/types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../src/types/modules';
import { OutboxOperation, ConflictItem } from '../src/types/sync';
import { AuthSession, OperatorUser } from '../src/types/auth';

function createMockSession(user: OperatorUser, token: string): AuthSession {
  return {
    user,
    token,
    refreshToken: 'mock_refresh_token',
    expiresAt: Date.now() + 86400000,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    isTrustedOffline: true,
  };
}

// Terminal colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${BOLD}${testName}${RESET}`);
    if (detail) console.error(`    ${RED}Detail:${RESET} ${detail}`);
  }
}

async function runRestoreTestSuite() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}      SAFE BACKUP RESTORE - ISOLATED REGRESSION TEST SUITE            ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  const ownerWorkspaceId = 'test_owner_workspace_001';
  const ownerEmail = 'owner@gbhs.edu.pk';
  const ownerDbName = getWorkspaceDatabaseName(ownerWorkspaceId);

  // Set active workspace and session as Owner
  setActiveWorkspaceId(ownerWorkspaceId);
  syncEngine.setSession(
    createMockSession(
      {
        id: ownerWorkspaceId,
        email: ownerEmail,
        fullName: 'Lead Operator & Owner',
        schoolId: 'GBHS-MAIN',
        schoolName: 'GBHS Main Campus',
        role: 'Admin',
        workspaceRole: 'owner',
        isApproved: true,
        workspaceOwnerId: ownerWorkspaceId,
      },
      'test_live_session_token_123'
    )
  );

  // Seed baseline records in owner database
  const db = await getDB(ownerDbName);
  const nowIso = new Date().toISOString();

  const studentA: Student = {
    id: 'student_uuid_001',
    name: 'Nadir Ali',
    fatherName: 'Mehrullah',
    class: 'Class 7',
    section: 'A',
    rollNo: '1',
    admissionNo: 'GBHS-701',
    status: 'Active',
    phone: '03001111111',
    version: 1,
    schoolId: 'GBHS-MAIN',
    createdBy: ownerEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
    owner_id: ownerWorkspaceId,
  };

  const studentB: Student = {
    id: 'student_uuid_002',
    name: 'Muhammad Imran',
    fatherName: 'Abdul Gani',
    class: 'Class 7',
    section: 'A',
    rollNo: '2',
    admissionNo: 'GBHS-702',
    status: 'Active',
    phone: '03002222222',
    version: 1,
    schoolId: 'GBHS-MAIN',
    createdBy: ownerEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
    owner_id: ownerWorkspaceId,
  };

  const att1: AttendanceRecord = {
    id: 'att_001',
    studentId: 'student_uuid_001',
    studentName: 'Nadir Ali',
    rollNo: '1',
    class: 'Class 7',
    section: 'A',
    date: '2026-10-20',
    status: 'Present',
    markedBy: ownerEmail,
    version: 1,
    updatedAt: nowIso,
    schoolId: 'GBHS-MAIN',
    owner_id: ownerWorkspaceId,
  };

  const log1: TeachingLogEntry = {
    id: 'teach_001',
    date: '2026-10-20',
    day: 'Tuesday',
    class: 'Class 7',
    subjectTopic: 'Module 1: Computer Hardware & Peripherals',
    learningObjectives: 'Understands input vs output devices',
    theoryCovered: 'CPU, RAM, ROM, Secondary Storage',
    practicalActivity: 'Identifying components inside system unit',
    totalRegistered: 25,
    studentsPresent: 24,
    studentsCompletingTask: 23,
    studentsNeedingHelp: 1,
    teachingMethod: 'Interactive Demo',
    instructorName: 'Lead Operator',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    owner_id: ownerWorkspaceId,
  };

  const prac1: PracticalProgressEntry = {
    id: 'prac_001',
    assessmentDate: '2026-10-20',
    studentId: 'student_uuid_001',
    registrationId: '1',
    studentName: 'Nadir Ali',
    class: 'Class 7',
    skillTask: 'Motherboard Component Identification',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 95,
    skillStatus: 'Proficient',
    remedialPracticeRequired: 'No',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    owner_id: ownerWorkspaceId,
  };

  const fol1: AbsenteeFollowupEntry = {
    id: 'fol_001',
    date: '2026-10-20',
    studentId: 'student_uuid_002',
    registrationId: '2',
    studentName: 'Muhammad Imran',
    class: 'Class 7',
    absenceCount: 3,
    followupReason: 'Family emergency, will return tomorrow',
    actionTaken: 'Review missed curriculum notes',
    contactPerson: 'Father (03002222222)',
    responseReceived: 'Acknowledged and confirmed return',
    followupDate: '2026-10-21',
    currentStatus: 'Pending Return',
    managementReferral: 'No',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    owner_id: ownerWorkspaceId,
  };

  const outboxOp: OutboxOperation = {
    opId: 'op_001',
    entityId: 'student_uuid_001',
    entityType: 'student',
    operationType: 'CREATE',
    payload: studentA,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    userEmail: ownerEmail,
    version: 1,
  };

  const conflict1: ConflictItem = {
    id: 'conf_001',
    opId: 'op_001',
    entityId: 'student_uuid_001',
    entityType: 'student',
    localData: studentA,
    remoteData: studentA,
    detectedAt: Date.now(),
    resolved: false,
  };

  const appStateEntry = {
    key: 'theme_preference',
    value: 'dark',
  };

  // Populate owner database
  await db.put('students', studentA);
  await db.put('students', studentB);
  await db.put('attendance', att1);
  await db.put('teaching_logs', log1);
  await db.put('practical_progress', prac1);
  await db.put('absentee_followups', fol1);
  await db.put('outbox', outboxOp);
  await db.put('conflicts', conflict1);
  await db.put('app_state', appStateEntry);

  // Generate a legitimate backup from the owner database
  const { backup: validBackup } = await createBackupData(ownerDbName);
  const validBackupJSON = JSON.stringify(validBackup, null, 2);

  // ============================================================================
  // TEST 1: Valid Restore & Preview
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 1] Valid Backup Validation & Preview${RESET}`);

  const previewRes = await validateBackupJSON(validBackupJSON, ownerWorkspaceId, ownerDbName);
  assert(previewRes.isValid, 'Valid backup JSON passes validation');
  assert(previewRes.errors.length === 0, 'Zero errors reported for valid backup');
  assert(previewRes.summary !== undefined, 'Summary object generated for preview');
  assert(previewRes.summary?.totalRecords === 9, 'Summary reports 9 total records to restore');
  assert(previewRes.summary?.countsPerStore.students === 2, 'Summary reports 2 students');
  assert(previewRes.summary?.countsPerStore.attendance === 1, 'Summary reports 1 attendance record');

  // Mutate database (clear it or change data) to test restoration
  await db.clear('students');
  await db.clear('attendance');
  const countsBeforeRestore = await getStoreCounts(ownerDbName);
  assert(countsBeforeRestore.students === 0, 'Owner database students cleared prior to restore test');

  // Execute restore
  const restoreRes = await restoreBackupData(validBackup, ownerWorkspaceId, ownerDbName);
  assert(restoreRes.success, 'restoreBackupData completes successfully');
  assert(restoreRes.totalRecords >= 9, 'Restored at least 9 records');

  const countsAfterRestore = await getStoreCounts(ownerDbName);
  assert(countsAfterRestore.students === 2, 'Students count restored to 2');
  assert(countsAfterRestore.attendance === 1, 'Attendance count restored to 1');
  assert(countsAfterRestore.teaching_logs === 1, 'Teaching logs restored to 1');
  assert(countsAfterRestore.practical_progress === 1, 'Practicals restored to 1');
  assert(countsAfterRestore.absentee_followups === 1, 'Follow-ups restored to 1');

  // Verify relationships and student IDs preserved
  const restoredStudent = await db.get('students', 'student_uuid_001');
  assert(restoredStudent?.name === 'Nadir Ali', 'Student ID and name preserved intact');
  const restoredAtt = await db.get('attendance', 'att_001');
  assert(restoredAtt?.studentId === 'student_uuid_001', 'Attendance studentId relationship preserved intact');

  // ============================================================================
  // TEST 2: Invalid JSON Syntax
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 2] Invalid JSON Syntax${RESET}`);

  const invalidJsonRes = await validateBackupJSON('{"broken": json', ownerWorkspaceId, ownerDbName);
  assert(!invalidJsonRes.isValid, 'Rejects malformed JSON string');
  assert(
    invalidJsonRes.errors.some((e) => e.toLowerCase().includes('json')),
    'Identifies JSON syntax error'
  );

  // ============================================================================
  // TEST 3: Wrong Application Identity
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 3] Wrong Application Identity${RESET}`);

  const wrongAppBackup = JSON.parse(validBackupJSON);
  wrongAppBackup.metadata.appName = 'Some Arbitrary Unrelated App';
  const wrongAppRes = await validateBackupJSON(JSON.stringify(wrongAppBackup), ownerWorkspaceId, ownerDbName);
  assert(!wrongAppRes.isValid, 'Rejects backup with mismatched application name');
  assert(
    wrongAppRes.errors.some((e) => e.includes('Incompatible application identity')),
    'Explains incompatible app identity'
  );

  // ============================================================================
  // TEST 4: Missing Expected Stores
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 4] Missing Expected Stores${RESET}`);

  const missingStoreBackup = JSON.parse(validBackupJSON);
  delete missingStoreBackup.stores.teaching_logs;
  missingStoreBackup.metadata.storeNames = missingStoreBackup.metadata.storeNames.filter(
    (s: string) => s !== 'teaching_logs'
  );
  const missingStoreRes = await validateBackupJSON(JSON.stringify(missingStoreBackup), ownerWorkspaceId, ownerDbName);
  assert(!missingStoreRes.isValid, 'Rejects backup missing teaching_logs store');
  assert(
    missingStoreRes.errors.some((e) => e.includes('teaching_logs')),
    'Identifies missing store name in error message'
  );

  // ============================================================================
  // TEST 5: Unexpected Extra Stores
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 5] Unexpected Extra Stores${RESET}`);

  const extraStoreBackup = JSON.parse(validBackupJSON);
  extraStoreBackup.stores.unauthorized_store = [{ id: 'hack' }];
  const extraStoreRes = await validateBackupJSON(JSON.stringify(extraStoreBackup), ownerWorkspaceId, ownerDbName);
  assert(!extraStoreRes.isValid, 'Rejects backup with unexpected extra stores');
  assert(
    extraStoreRes.errors.some((e) => e.includes('unauthorized_store')),
    'Flags illegal store in error output'
  );

  // ============================================================================
  // TEST 6: Record-Count Mismatch
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 6] Record-Count Mismatch${RESET}`);

  const countMismatchBackup = JSON.parse(validBackupJSON);
  countMismatchBackup.metadata.countsPerStore.students = 999; // Fraudulent count
  const countMismatchRes = await validateBackupJSON(JSON.stringify(countMismatchBackup), ownerWorkspaceId, ownerDbName);
  assert(!countMismatchRes.isValid, 'Rejects backup where metadata store count does not match actual records');
  assert(
    countMismatchRes.errors.some((e) => e.includes('Record count mismatch')),
    'Identifies specific store count discrepancy'
  );

  // ============================================================================
  // TEST 7: Invalid Relational Integrity (Broken Student ID References)
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 7] Invalid Relational Integrity${RESET}`);

  const brokenRelationBackup = JSON.parse(validBackupJSON);
  brokenRelationBackup.stores.attendance.push({
    id: 'att_orphan_999',
    studentId: 'non_existent_ghost_student_id',
    studentName: 'Ghost Student',
    rollNo: '99',
    class: 'Class 7',
    section: 'A',
    date: '2026-10-20',
    status: 'Present',
    markedBy: ownerEmail,
    version: 1,
    updatedAt: nowIso,
    schoolId: 'GBHS-MAIN',
  });
  brokenRelationBackup.metadata.countsPerStore.attendance += 1;
  brokenRelationBackup.metadata.totalRecords += 1;

  const brokenRelationRes = await validateBackupJSON(JSON.stringify(brokenRelationBackup), ownerWorkspaceId, ownerDbName);
  assert(!brokenRelationRes.isValid, 'Rejects backup with broken relational integrity');
  assert(
    brokenRelationRes.errors.some((e) => e.includes('non_existent_ghost_student_id')),
    'Identifies unknown referenced student ID'
  );

  // ============================================================================
  // TEST 8: Workspace Ownership & Isolation Violation
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 8] Workspace Ownership & Isolation Violation${RESET}`);

  const mismatchedWsBackup = JSON.parse(validBackupJSON);
  mismatchedWsBackup.metadata.workspaceId = 'foreign_workspace_alien_id';
  const mismatchedWsRes = await validateBackupJSON(JSON.stringify(mismatchedWsBackup), ownerWorkspaceId, ownerDbName);
  assert(!mismatchedWsRes.isValid, 'Rejects backup originating from a different workspace');
  assert(
    mismatchedWsRes.errors.some((e) => e.includes('Workspace mismatch')),
    'Explicitly reports workspace mismatch error'
  );

  // ============================================================================
  // TEST 9: Failed Restoration Rollback Protection
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 9] Failed Restoration Atomic Rollback Protection${RESET}`);

  // Capture existing state before simulated failure
  const preFailCounts = await getStoreCounts(ownerDbName);
  assert(preFailCounts.students === 2, 'Pre-failure database has 2 students');

  // Construct a backup that causes an IndexedDB constraint or validation failure mid-transaction
  const malformedPutBackup: any = {
    metadata: { ...validBackup.metadata },
    stores: {
      ...validBackup.stores,
      // Pass a non-object or invalid record structure designed to fail put
      attendance: [{ id: null, invalidField: true }],
    },
  };

  const rollbackRes = await restoreBackupData(malformedPutBackup, ownerWorkspaceId, ownerDbName);
  assert(!rollbackRes.success, 'Restore reports failure on transaction error');
  assert(rollbackRes.rolledBack === true, 'Rollback flag confirmed true');

  // Verify that database was NOT left partially replaced
  const postRollbackCounts = await getStoreCounts(ownerDbName);
  assert(
    postRollbackCounts.students === preFailCounts.students,
    'Students count is 100% restored to pre-failure state via rollback'
  );
  assert(
    postRollbackCounts.attendance === preFailCounts.attendance,
    'Attendance count is 100% restored to pre-failure state via rollback'
  );

  // ============================================================================
  // TEST 10: Read-Only Staff Denial (Permission Restriction)
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 10] Read-Only Staff Permission Denial${RESET}`);

  // Switch session to Approved Staff (read_only)
  syncEngine.setSession(
    createMockSession(
      {
        id: 'staff_user_002',
        email: 'staff@gbhs.edu.pk',
        fullName: 'Assistant Staff Operator',
        schoolId: 'GBHS-MAIN',
        schoolName: 'GBHS Main Campus',
        role: 'Computer Operator',
        workspaceRole: 'team_member',
        isApproved: true,
        workspaceOwnerId: ownerWorkspaceId,
      },
      'test_staff_token'
    )
  );

  let staffDenied = false;
  try {
    await restoreBackupData(validBackup, ownerWorkspaceId, ownerDbName);
  } catch (err: any) {
    if (err.message.includes('Permission denied')) {
      staffDenied = true;
    }
  }

  assert(staffDenied, 'Approved Staff / Read-only team members are strictly denied restore permission');

  // Restore owner session for remaining tests
  syncEngine.setSession(
    createMockSession(
      {
        id: ownerWorkspaceId,
        email: ownerEmail,
        fullName: 'Lead Operator & Owner',
        schoolId: 'GBHS-MAIN',
        schoolName: 'GBHS Main Campus',
        role: 'Admin',
        workspaceRole: 'owner',
        isApproved: true,
        workspaceOwnerId: ownerWorkspaceId,
      },
      'test_live_session_token_123'
    )
  );
  await db.put('app_state', {
    key: 'gbhs_active_session',
    value: syncEngine.getSession(),
  });

  // ============================================================================
  // TEST 11: Secrets & Sensitive Credentials Redaction Protection
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 11] Secrets & Authentication Redaction Protection${RESET}`);

  const backupWithSecrets = JSON.parse(validBackupJSON);
  backupWithSecrets.stores.app_state = [
    { key: 'gbhs_active_session', value: { token: 'old_backup_token_xyz', user: { id: 'old_user' } } },
    { key: 'supabase_anon_key', value: '[REDACTED_CREDENTIAL]' },
    { key: 'admin_password', value: 'secret_123' },
    { key: 'school_theme', value: 'dark' },
  ];
  backupWithSecrets.metadata.countsPerStore.app_state = 4;
  backupWithSecrets.metadata.totalRecords = 12;

  await restoreBackupData(backupWithSecrets, ownerWorkspaceId, ownerDbName);
  const appStateEntries = await db.getAll('app_state');

  const restoredSessionEntry = appStateEntries.find((e) => e.key === 'gbhs_active_session');
  assert(
    restoredSessionEntry?.value?.token === 'test_live_session_token_123',
    'Live authenticated session token was NOT overwritten by backup token'
  );

  const restoredPassword = appStateEntries.find((e) => e.key === 'admin_password');
  assert(restoredPassword === undefined, 'Passwords and secrets from backup are not imported');

  const restoredTheme = appStateEntries.find((e) => e.key === 'school_theme');
  assert(restoredTheme?.value === 'dark', 'Safe configuration settings (theme) restored successfully');

  // ============================================================================
  // TEST 12: Pending Outbox Safe Archiving
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 12] Pending Outbox Safe Archiving (No Auto-Replay)${RESET}`);

  const backupWithPendingOutbox = JSON.parse(validBackupJSON);
  backupWithPendingOutbox.stores.outbox = [
    {
      opId: 'op_stale_pending_01',
      entityId: 'student_uuid_001',
      entityType: 'student',
      operationType: 'UPDATE',
      payload: { id: 'student_uuid_001', name: 'Nadir Ali' },
      timestamp: Date.now() - 500000,
      status: 'pending', // Was pending when exported
      retryCount: 0,
      userEmail: ownerEmail,
      version: 1,
    },
    {
      opId: 'op_already_synced_02',
      entityId: 'student_uuid_002',
      entityType: 'student',
      operationType: 'CREATE',
      payload: { id: 'student_uuid_002', name: 'Muhammad Imran' },
      timestamp: Date.now() - 600000,
      status: 'synced', // Was already synced when exported
      retryCount: 0,
      userEmail: ownerEmail,
      version: 1,
    },
  ];
  backupWithPendingOutbox.metadata.countsPerStore.outbox = 2;
  backupWithPendingOutbox.metadata.totalRecords = 10;

  await restoreBackupData(backupWithPendingOutbox, ownerWorkspaceId, ownerDbName);
  const restoredOps = await db.getAll('outbox');

  const staleOp = restoredOps.find((o) => o.opId === 'op_stale_pending_01');
  assert(
    staleOp?.status === 'legacy_archived',
    'Pending outbox operation from backup is converted to legacy_archived (safe local quarantine)'
  );
  assert(staleOp?.isLegacy === true, 'isLegacy flag set so syncEngine ignores it completely');
  assert(staleOp?.status !== 'synced', 'Pending outbox operation is NOT falsely marked as synced');

  const syncedOp = restoredOps.find((o) => o.opId === 'op_already_synced_02');
  assert(syncedOp?.status === 'synced', 'Previously confirmed synced operation remains synced');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log(`\n${BOLD}======================================================================${RESET}`);
  console.log(`${BOLD}REGRESSION TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)${RESET}`);
  console.log(`${BOLD}======================================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRestoreTestSuite().catch((err) => {
  console.error('Test suite crashed with unhandled error:', err);
  process.exit(1);
});
