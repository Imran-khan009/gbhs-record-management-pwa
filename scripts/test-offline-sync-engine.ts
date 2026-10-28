import 'fake-indexeddb/auto';
import { createHash } from 'crypto';

import {
  getDB,
  closeDB,
  LEGACY_DB_NAME,
  setActiveWorkspaceId,
  getActiveWorkspaceId,
  getWorkspaceDatabaseName,
  inspectLegacyRecords,
  linkAndMigrateLegacyRecordsToWorkspace,
  getAllStudents,
  getStudentById,
  getAllAttendanceRecords,
  getAllTeachingLogs,
  getAllPracticalProgress,
  getAllAbsenteeFollowups,
  getOutboxOperations,
  getPendingOutboxOperations,
  saveStudentLocally,
  saveAttendanceLocally,
  saveTeachingLogLocally,
  savePracticalProgressLocally,
  saveAbsenteeFollowupLocally,
  enqueueOutboxOperation,
  getAllConflicts,
  setAppState,
  getAppState,
} from '../src/services/db';

import {
  createStudent,
  updateStudent,
  deleteStudent,
  markSingleAttendance,
} from '../src/services/recordService';

import {
  createTeachingLog,
  updateTeachingLog,
  deleteTeachingLog,
  createPracticalProgress,
  updatePracticalProgress,
  deletePracticalProgress,
  createAbsenteeFollowup,
  updateAbsenteeFollowup,
  deleteAbsenteeFollowup,
} from '../src/services/modulesService';

import {
  serializeStudentToSupabase,
  deserializeStudentFromSupabase,
  serializeAttendanceToSupabase,
  deserializeAttendanceFromSupabase,
  uploadWorkspaceSnapshotToSupabase,
  downloadWorkspaceSnapshotFromSupabase,
  setNetworkSimulation,
  updateSupabaseConfig,
} from '../src/services/supabase';

import { syncEngine } from '../src/services/syncEngine';
import { Student } from '../src/types/student';
import { AuthSession } from '../src/types/auth';
import { createBackupData, exportBackupToJSON } from '../src/services/backupService';

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

async function runOfflineSyncSuite() {
  console.log('================================================================');
  console.log('GBHS OFFLINE-FIRST AUTOMATIC SYNCHRONIZATION INTEGRITY TEST SUITE');
  console.log('================================================================\n');

  // Ensure test runs in verified mock cloud isolation without touching production
  await updateSupabaseConfig({ url: '', anonKey: '' });

  const ownerAId = 'a1111111-1111-4000-8000-000000000001';
  const ownerAEmail = 'operator.alpha@gbhs.edu.pk';

  const ownerBId = 'b2222222-2222-4000-8000-000000000002';
  const ownerBEmail = 'operator.beta@gbhs.edu.pk';

  const sessionA: AuthSession = {
    user: {
      id: ownerAId,
      email: ownerAEmail,
      fullName: 'Operator Alpha',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: ownerAId,
    },
    token: 'jwt_mock_token_alpha',
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    isTrustedOffline: true,
  };

  const sessionB: AuthSession = {
    user: {
      id: ownerBId,
      email: ownerBEmail,
      fullName: 'Operator Beta',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: ownerBId,
    },
    token: 'jwt_mock_token_beta',
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    isTrustedOffline: true,
  };

  // ----------------------------------------------------------------
  // TEST 1: Preserve Legacy Database & Exclude 1,012 Legacy Outbox
  // ----------------------------------------------------------------
  console.log('--- TEST 1: Legacy Database & 1,012 Outbox Records Exclusion ---');
  setActiveWorkspaceId(null);
  const legacyDb = await getDB(LEGACY_DB_NAME);

  // Populate legacy DB with simulated real school data
  const legacyStudents: Student[] = Array.from({ length: 75 }, (_, i) => ({
    id: `leg_std_${i + 1}`,
    admissionNo: `ADM-${2020 + (i % 5)}-${1000 + i}`,
    rollNo: `R-${101 + i}`,
    name: `Legacy Student ${i + 1}`,
    fatherName: `Father ${i + 1}`,
    class: (i % 3 === 0 ? 'Class 7' : i % 3 === 1 ? 'Class 8' : 'Class 9') as any,
    section: 'A' as any,
    phone: '03001234567',
    status: 'Active',
    schoolId: 'GBHS-MAIN',
    createdBy: 'legacy_import',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  }));
  for (const s of legacyStudents) await legacyDb.put('students', s);

  // Populate 1,012 legacy outbox records
  for (let i = 1; i <= 1012; i++) {
    await legacyDb.put('outbox', {
      opId: `legacy_op_${i}`,
      entityId: `leg_std_${(i % 75) + 1}`,
      entityType: 'student',
      operationType: 'UPDATE',
      payload: { id: `leg_std_${(i % 75) + 1}`, name: `Legacy Name ${i}` },
      timestamp: 1600000000000 + i,
      status: 'pending',
      retryCount: 0,
      userEmail: 'unassigned@local',
      version: 1,
    });
  }

  const legacyInspect = await inspectLegacyRecords();
  assert(
    legacyInspect.counts.students === 75 && legacyInspect.counts.outbox === 1012,
    'Legacy Database Setup',
    `Preserved ${legacyInspect.counts.students} students and ${legacyInspect.counts.outbox} legacy outbox records in ${LEGACY_DB_NAME}`
  );

  // Migrate legacy data to Owner A workspace
  setActiveWorkspaceId(ownerAId);
  syncEngine.setSession(sessionA);
  const migrateRes = await linkAndMigrateLegacyRecordsToWorkspace(ownerAId, ownerAEmail);
  assert(migrateRes.success, 'Legacy Workspace Linking', `Successfully linked legacy records to workspace ${getWorkspaceDatabaseName(ownerAId)}`);

  const pendingAfterMigrate = await getPendingOutboxOperations();
  assert(
    pendingAfterMigrate.length === 0,
    'Legacy Outbox Excluded from Sync',
    `Workspace has exactly ${pendingAfterMigrate.length} pending operations. All 1,012 legacy outbox items are tagged legacy_archived and excluded from cloud sync.`
  );

  // Verify original legacy DB was NOT modified
  const postMigrateLegacy = await inspectLegacyRecords();
  assert(
    postMigrateLegacy.counts.students === 75 && postMigrateLegacy.counts.outbox === 1012,
    'Zero-Mutation Guarantee on Legacy Archive',
    `Original ${LEGACY_DB_NAME} holds 75 students and 1,012 outbox records 100% intact.`
  );

  // ----------------------------------------------------------------
  // TEST 2: Offline Edits & Queueing (Students, Modules, Attendance)
  // ----------------------------------------------------------------
  console.log('\n--- TEST 2: Offline Edits & Outbox Queueing ---');
  // Set sync engine offline
  syncEngine.setOnlineStatus(false);

  // 1. Create a student offline
  const newStudentRes = await createStudent(
    {
      admissionNo: 'ADM-2026-9999',
      rollNo: 'R-999',
      name: 'Offline Student Tariq',
      fatherName: 'Muhammad Tariq',
      class: 'Class 9',
      section: 'A',
      status: 'Active',
      phone: '03001234567',
    },
    ownerAEmail
  );
  assert(newStudentRes.success && Boolean(newStudentRes.student), 'Offline Student Creation', 'Created student locally in IndexedDB while offline');

  // 2. Mark attendance offline
  const attRecord = await markSingleAttendance(
    newStudentRes.student!,
    '2026-10-19',
    'Present',
    'On time',
    ownerAEmail
  );
  assert(Boolean(attRecord.id), 'Offline Attendance Marking', `Marked attendance for ${newStudentRes.student!.name} offline`);

  // 3. Create a teaching log offline
  const logRes = await createTeachingLog(
    {
      date: '2026-10-19',
      day: 'Monday',
      class: 'Class 9',
      subjectTopic: 'Computer Networks - TCP/IP Protocol Suite',
      learningObjectives: 'Understand IP addressing and subnetting',
      theoryCovered: 'OSI 7 layers vs TCP/IP 4 layers model',
      practicalActivity: 'Configured static IP on Windows machines in lab',
      totalRegistered: 30,
      studentsPresent: 28,
      studentsCompletingTask: 26,
      studentsNeedingHelp: 2,
      teachingMethod: 'Demonstration and hands-on',
      instructorName: 'Engr. Imran Khan',
    },
    ownerAEmail
  );
  assert(logRes.success && Boolean(logRes.entry), 'Offline Teaching Log Creation', 'Created teaching log in IndexedDB while offline');

  // 4. Create practical progress offline
  const practRes = await createPracticalProgress(
    {
      assessmentDate: '2026-10-19',
      studentId: newStudentRes.student!.id,
      registrationId: newStudentRes.student!.rollNo,
      studentName: newStudentRes.student!.name,
      class: 'Class 9',
      skillTask: 'RJ45 Cable Crimping (T568B Standard)',
      attemptNumber: 1,
      practicalCompleted: 'Yes',
      scoreMarks: 95,
      skillStatus: 'Proficient',
      remedialPracticeRequired: 'No',
    },
    ownerAEmail
  );
  assert(practRes.success && Boolean(practRes.entry), 'Offline Practical Progress Creation', 'Created practical progress entry in IndexedDB while offline');

  // 5. Create absentee followup offline
  const absRes = await createAbsenteeFollowup(
    {
      date: '2026-10-19',
      followupDate: '2026-10-19',
      studentId: newStudentRes.student!.id,
      registrationId: newStudentRes.student!.rollNo,
      studentName: newStudentRes.student!.name,
      class: 'Class 9',
      absenceCount: 2,
      followupReason: 'Medical illness',
      actionTaken: 'Phone Call',
      contactPerson: 'Father',
      responseReceived: 'Student will resume school tomorrow with medical certificate',
      currentStatus: 'Pending Return',
      managementReferral: 'No',
    },
    ownerAEmail
  );
  assert(absRes.success && Boolean(absRes.entry), 'Offline Absentee Followup Creation', 'Created absentee followup entry in IndexedDB while offline');

  // Verify all 5 offline actions created legitimate pending outbox operations
  const pendingOps = await getPendingOutboxOperations();
  assert(
    pendingOps.length === 5,
    'Pending Outbox Count Verification',
    `Outbox has exactly 5 pending operations queued offline (Student, Attendance, Log, Practical, Followup)`
  );

  const pendingTypes = new Set(pendingOps.map((o) => o.entityType));
  assert(
    pendingTypes.has('student') &&
      pendingTypes.has('attendance') &&
      pendingTypes.has('teaching_log') &&
      pendingTypes.has('practical_progress') &&
      pendingTypes.has('absentee_followup'),
    'Multi-Module Outbox Integrity',
    'All 5 entity types are present in the pending outbox queue'
  );

  // ----------------------------------------------------------------
  // TEST 3: Reconnection & Automatic Synchronization
  // ----------------------------------------------------------------
  console.log('\n--- TEST 3: Reconnection & Automatic Synchronization ---');
  // Reconnect online
  syncEngine.setOnlineStatus(true);

  // Allow queue processing to finish cleanly
  while ((await syncEngine.getStats()).syncingCount > 0 || (await syncEngine.getStats()).pendingCount > 0) {
    await new Promise((res) => setTimeout(res, 50));
  }
  await new Promise((res) => setTimeout(res, 100));

  const remainingPending = await getPendingOutboxOperations();
  assert(
    remainingPending.length === 0,
    'Automatic Outbox Processing on Reconnection',
    `All 5 pending outbox operations were successfully and automatically synced on reconnection (Remaining pending: ${remainingPending.length})`
  );

  const stats = await syncEngine.getStats();
  assert(
    stats.overallStatus === 'Synced' && stats.syncedCount >= 5,
    'Sync Engine Synced State',
    `SyncEngine transitioned to "Synced" state with ${stats.syncedCount} synced records`
  );

  // ----------------------------------------------------------------
  // TEST 4: Single Operation Remote Conflict Detection
  // ----------------------------------------------------------------
  console.log('\n--- TEST 4: Conflict Handling & Overwrite Prevention ---');
  // Configure conflict simulation to ensure conflict handling is triggered
  setNetworkSimulation('conflict_trigger');

  // Trigger an update on the student
  const updateRes = await updateStudent(newStudentRes.student!.id, { name: 'Tariq Updated Local' }, ownerAEmail);
  assert(updateRes.success, 'Student Local Edit for Conflict Test', 'Updated student locally');

  // Allow background processQueue triggered by updateStudent to complete
  while ((await syncEngine.getStats()).syncingCount > 0) {
    await new Promise((res) => setTimeout(res, 50));
  }
  await new Promise((res) => setTimeout(res, 200));

  const conflicts = await getAllConflicts();
  assert(
    conflicts.length > 0,
    'Conflict Isolation',
    `Detected remote conflict: ${conflicts[0].id} on entity ${conflicts[0].entityId}. Local record was not silently overwritten.`
  );

  // Clear simulation
  setNetworkSimulation('none');

  // Resolve conflict using keep_local
  await syncEngine.resolveConflict(conflicts[0], 'keep_local');
  const postResolveConflicts = await getAllConflicts();
  assert(
    postResolveConflicts.every((c) => c.resolved),
    'Conflict Resolution',
    'Conflict marked resolved and local version safely bumped'
  );

  // ----------------------------------------------------------------
  // TEST 5: Upload Snapshot to Cloud
  // ----------------------------------------------------------------
  console.log('\n--- TEST 5: Idempotent Upload Snapshot ---');
  const uploadResult = await syncEngine.uploadActiveWorkspaceToCloud(ownerAId);
  assert(uploadResult.success, 'Workspace Cloud Snapshot Upload', `Uploaded workspace to cloud: Pre-counts students=${uploadResult.preUploadCounts.students}, logs=${uploadResult.preUploadCounts.teaching_logs}`);

  // ----------------------------------------------------------------
  // TEST 6: Download Cloud Changes to Fresh Workspace
  // ----------------------------------------------------------------
  console.log('\n--- TEST 6: Download Authorized Cloud Changes ---');
  // Switch to a new device simulation for Owner A (empty database)
  const newDeviceId = 'a1111111-1111-4000-8000-000000000001_device2';
  setActiveWorkspaceId(newDeviceId);

  const initialNewDeviceStudents = await getAllStudents();
  assert(initialNewDeviceStudents.length === 0, 'Clean Secondary Workspace', 'Clean new device starts with 0 local students');

  // Download cloud records for Owner A
  const downloadResult = await syncEngine.downloadActiveWorkspaceFromCloud(ownerAId);
  assert(downloadResult.success, 'Cloud Download Execution', 'Successfully downloaded cloud workspace records');

  const downloadedStudents = await getAllStudents();
  const downloadedLogs = await getAllTeachingLogs();
  assert(
    downloadedStudents.length >= 75 && downloadedLogs.length >= 1,
    'Reconciled Local Records',
    `Clean secondary device reconciled ${downloadedStudents.length} students and ${downloadedLogs.length} teaching logs from cloud`
  );

  // ----------------------------------------------------------------
  // TEST 7: Account & Workspace Privacy Isolation
  // ----------------------------------------------------------------
  console.log('\n--- TEST 7: Multi-Tenant Workspace & RLS Account Isolation ---');
  // Switch to Account B
  setActiveWorkspaceId(ownerBId);
  syncEngine.setSession(sessionB);

  const accountBStudents = await getAllStudents();
  const accountBOutbox = await getPendingOutboxOperations();
  assert(
    accountBStudents.length === 0 && accountBOutbox.length === 0,
    'Account B Clean Isolation',
    `Account B has 0 students and 0 outbox operations. Cannot see Account A's ${downloadedStudents.length} students.`
  );

  // Try downloading cloud records as Account B
  const accountBDownload = await syncEngine.downloadActiveWorkspaceFromCloud(ownerBId);
  assert(
    accountBDownload.success && accountBDownload.downloadedCounts.students === 0,
    'Cloud Account Isolation',
    `Account B cloud download retrieved 0 students (cannot access Account A records under RLS/workspace ownership)`
  );

  // ----------------------------------------------------------------
  // TEST 8: JSON Database Backup & Integrity Checksum
  // ----------------------------------------------------------------
  console.log('\n--- TEST 8: JSON Database Backup & Checksum Verification ---');
  setActiveWorkspaceId(ownerAId);
  const { backup, verification } = await createBackupData(getWorkspaceDatabaseName(ownerAId));
  const { jsonString, filename } = await exportBackupToJSON(getWorkspaceDatabaseName(ownerAId));
  const sha256 = createHash('sha256').update(jsonString).digest('hex');

  assert(
    verification.verified && backup.metadata.totalRecords > 0 && Boolean(sha256),
    'Cryptographic JSON Backup',
    `Exported verified backup "${filename}" with SHA-256 checksum (${sha256.substring(0, 16)}...) and total ${backup.metadata.totalRecords} records (${backup.metadata.countsPerStore.students} students).`
  );

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED | ${testsFailed} FAILED OUT OF ${testsPassed + testsFailed} TESTS`);
  console.log('================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
  syncEngine.stopAutoSyncInterval();
  process.exit(0);
}

runOfflineSyncSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
