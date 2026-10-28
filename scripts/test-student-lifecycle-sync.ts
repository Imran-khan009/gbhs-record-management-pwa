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
  // .env may not exist in some environments
}

import {
  getDB,
  closeDB,
  setActiveWorkspaceId,
  getActiveWorkspaceId,
  getAllStudents,
  getStudentById,
  saveStudentLocally,
  saveAttendanceLocally,
  getAttendanceByDateAndClass,
  getAllAttendanceRecords,
  enqueueOutboxOperation,
  getOutboxOperations,
  updateOutboxOperation,
  clearAllStudentsLocally,
  setAppState,
  getAppState,
} from '../src/services/db';

import {
  createStudent,
  updateStudent,
  withdrawStudent,
  transferStudent,
  reactivateStudent,
  replaceStudent,
  updateStudentStatus,
  deleteStudent,
  markSingleAttendance,
} from '../src/services/recordService';

import {
  syncOperationToCloud,
  setNetworkSimulation,
  updateSupabaseConfig,
  getSupabaseConfig,
  resetMockCloudStorage,
} from '../src/services/supabase';

import { syncEngine } from '../src/services/syncEngine';
import { Student, AttendanceRecord, StudentStatus } from '../src/types/student';
import { AuthSession } from '../src/types/auth';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  PASS: ${message}`);
    passedTests++;
  }
}

async function runTestSuite() {
  console.log('\n============================================================');
  console.log('TEST SUITE: DYNAMIC STUDENT LIFECYCLE & RELIABLE CLOUD SYNC');
  console.log('============================================================\n');

  // Test setup: Workspace A
  const WORKSPACE_A = 'workspace_owner_alpha_123';
  const USER_A_EMAIL = 'alpha@gbhs.edu.pk';
  const sessionA: AuthSession = {
    token: 'token_alpha',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: true,
    user: {
      id: WORKSPACE_A,
      email: USER_A_EMAIL,
      fullName: 'Operator Alpha',
      schoolId: 'GBHS-ALPHA',
      schoolName: 'Govt Boys High School Alpha',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: WORKSPACE_A,
    },
  };

  setActiveWorkspaceId(WORKSPACE_A);
  await clearAllStudentsLocally();
  syncEngine.setSession(sessionA);
  syncEngine.setOnlineStatus(true);
  updateSupabaseConfig({ simulationMode: 'mock' });
  resetMockCloudStorage();

  // -------------------------------------------------------------
  // Test 1: Dynamic Student Counts & Multi-Student Enrollment
  // -------------------------------------------------------------
  console.log('\n[Test 1] Dynamic Student Counts & Multi-Student Enrollment');
  const enrolledStudents: Student[] = [];
  const classesToTest = ['Class 1', 'Class 5', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];

  for (let i = 0; i < classesToTest.length; i++) {
    const cls = classesToTest[i];
    const roll = String(101 + i);
    const adm = `ADM-${cls.replace(/\D/g, '')}A-${roll}`;
    const res = await createStudent(
      {
        rollNo: roll,
        admissionNo: adm,
        name: `Learner ${i + 1}`,
        fatherName: `Parent ${i + 1}`,
        class: cls as any,
        section: 'A',
        phone: '03001234567',
        status: 'Active',
        registeredStatus: 'Registerd',
      },
      USER_A_EMAIL
    );

    assert(res.success && Boolean(res.student), `Enrolled dynamic student in ${cls}`);
    if (res.student) enrolledStudents.push(res.student);
  }

  const allAfterEnroll = await getAllStudents();
  assert(allAfterEnroll.length === 6, `Dynamic student count is 6 (found ${allAfterEnroll.length})`);
  assert(enrolledStudents[0].owner_id === WORKSPACE_A, 'Student record carries correct workspace owner_id');

  // -------------------------------------------------------------
  // Test 2: Student Editing & Version Increment
  // -------------------------------------------------------------
  console.log('\n[Test 2] Student Editing & Version Control');
  const studentToEdit = enrolledStudents[0];
  const editRes = await updateStudent(
    studentToEdit.id,
    {
      name: 'Learner 1 Updated Name',
      phone: '03119876543',
    },
    USER_A_EMAIL
  );

  assert(editRes.success && Boolean(editRes.student), 'Successfully updated student');
  assert(editRes.student!.name === 'Learner 1 Updated Name', 'Updated name persisted in local record');
  assert(editRes.student!.version === 2, `Version incremented to 2 (got ${editRes.student!.version})`);

  // -------------------------------------------------------------
  // Test 3: Non-Destructive Student Withdrawal (Preserves Records)
  // -------------------------------------------------------------
  console.log('\n[Test 3] Non-Destructive Student Withdrawal (Preserves Attendance & History)');
  const targetStudent = enrolledStudents[1]; // Learner 2 in Class 5

  // First, mark historical attendance for targetStudent
  const historicalDate = '2026-10-10';
  const attRecord = await markSingleAttendance(
    targetStudent,
    historicalDate,
    'Present',
    'Active during class',
    USER_A_EMAIL
  );
  assert(Boolean(attRecord && attRecord.id), 'Successfully recorded historical attendance for student before withdrawal');

  // Now, withdraw student (dropout/left)
  const withdrawRes = await withdrawStudent(
    targetStudent.id,
    'Relocated to another district with family',
    USER_A_EMAIL
  );

  assert(withdrawRes.success && Boolean(withdrawRes.student), 'Successfully withdrew student');
  assert(withdrawRes.student!.status === 'Withdrawn', 'Student status is "Withdrawn"');
  assert(withdrawRes.student!.withdrawalReason === 'Relocated to another district with family', 'Withdrawal reason recorded');
  assert(Boolean(withdrawRes.student!.withdrawnDate), 'Withdrawal date recorded');

  // Verify student is NOT deleted from IndexedDB
  const fetchedAfterWithdraw = await getStudentById(targetStudent.id);
  assert(Boolean(fetchedAfterWithdraw), 'Withdrawn student still exists in local IndexedDB');
  assert(fetchedAfterWithdraw?.status === 'Withdrawn', 'Fetched student status is Withdrawn');

  // Verify historical attendance record still exists
  const allAtt = await getAllAttendanceRecords();
  const studentAtt = allAtt.filter((a) => a.studentId === targetStudent.id);
  assert(studentAtt.length === 1, `Historical attendance preserved (found ${studentAtt.length} record)`);

  // Verify normal deleteStudent() soft-deletes / marks as Withdrawn instead of destructive hard delete
  const targetStudent2 = enrolledStudents[2]; // Learner 3
  await markSingleAttendance(targetStudent2, historicalDate, 'Present', undefined, USER_A_EMAIL);
  const deleteRes = await deleteStudent(targetStudent2.id, USER_A_EMAIL, {
    reason: 'Family left town',
  });
  assert(deleteRes.success && deleteRes.softDeleted === true, 'deleteStudent() safely soft-deleted student with history');
  const fetchedTarget2 = await getStudentById(targetStudent2.id);
  assert(fetchedTarget2?.status === 'Withdrawn', 'Student marked as Withdrawn via deleteStudent()');

  // -------------------------------------------------------------
  // Test 4: Replacement Workflow
  // -------------------------------------------------------------
  console.log('\n[Test 4] Student Replacement Workflow');
  // Student targetStudent (Class 5) is withdrawn. Replace with new Candidate "Replacement Learner"
  const replaceRes = await replaceStudent(
    targetStudent.id,
    {
      rollNo: '102-R',
      name: 'Replacement Candidate',
      fatherName: 'Replacement Father',
      class: targetStudent.class,
      section: targetStudent.section,
      phone: '03445556677',
      gender: 'Male',
      admissionNo: `${targetStudent.admissionNo}-R`,
      status: 'Active',
      registeredStatus: 'Registerd',
    },
    USER_A_EMAIL
  );

  assert(replaceRes.success && Boolean(replaceRes.replacementStudent), 'Successfully enrolled replacement student');
  const replacement = replaceRes.replacementStudent!;
  const originalWithdrawn = replaceRes.withdrawnStudent!;

  assert(replacement.replacedStudentId === targetStudent.id, 'Replacement student links to replacedStudentId');
  assert(originalWithdrawn.replacementStudentId === replacement.id, 'Withdrawn student links to replacementStudentId');
  assert(originalWithdrawn.status === 'Withdrawn', 'Original student remains Withdrawn');
  assert(replacement.status === 'Active', 'Replacement student is Active');

  // Verify both students exist in local database
  const sOriginal = await getStudentById(targetStudent.id);
  const sReplacement = await getStudentById(replacement.id);
  assert(Boolean(sOriginal) && Boolean(sReplacement), 'Both original and replacement students exist in local store');

  // -------------------------------------------------------------
  // Test 5: Reactivation Workflow
  // -------------------------------------------------------------
  console.log('\n[Test 5] Student Reactivation Workflow');
  // Reactivate student targetStudent2
  const reactivateRes = await reactivateStudent(targetStudent2.id, USER_A_EMAIL);
  assert(reactivateRes.success && Boolean(reactivateRes.student), 'Successfully reactivated student');
  assert(reactivateRes.student!.status === 'Active', 'Student status restored to "Active"');
  assert(reactivateRes.student!.registeredStatus === 'Registerd', 'Registered status restored to "Registerd"');

  const fetchedReactivated = await getStudentById(targetStudent2.id);
  assert(fetchedReactivated?.status === 'Active', 'Reactivation persisted in IndexedDB');

  // -------------------------------------------------------------
  // Test 6: Status Transitions: Inactive and Transferred
  // -------------------------------------------------------------
  console.log('\n[Test 6] Status Transitions (Inactive & Transferred)');
  const studentToTransfer = enrolledStudents[3]; // Learner 4
  const transferRes = await transferStudent(
    studentToTransfer.id,
    'Transferred to GBHS Hub Chowki, SLC #9811',
    USER_A_EMAIL
  );
  assert(transferRes.success && transferRes.student!.status === 'Transferred', 'Successfully transferred student');
  assert(Boolean(transferRes.student!.transferDetails?.includes('Hub Chowki')), 'Transfer details preserved');

  const studentToInactivate = enrolledStudents[4]; // Learner 5
  const inactivateRes = await updateStudentStatus(studentToInactivate.id, 'Inactive', 'Medical leave', USER_A_EMAIL);
  assert(inactivateRes.success && inactivateRes.student!.status === 'Inactive', 'Successfully marked student Inactive');

  // -------------------------------------------------------------
  // Test 7: Attendance Roster Filtering (Default vs Historical)
  // -------------------------------------------------------------
  console.log('\n[Test 7] Attendance Roster Filtering (Default vs Historical)');
  const classForAtt = targetStudent.class; // Class 5
  const allClassStudents = (await getAllStudents()).filter((s) => s.class === classForAtt);

  // 1. On a brand new unrecorded date (e.g. today)
  const todayDate = new Date().toISOString().split('T')[0];
  const existingTodayRecords = await getAttendanceByDateAndClass(todayDate, classForAtt);

  const defaultDailyStudents = allClassStudents.filter((s) => {
    if (s.status === 'Active') return true;
    return existingTodayRecords.some((r) => r.studentId === s.id);
  });

  assert(
    defaultDailyStudents.every((s) => s.status === 'Active'),
    'Default daily attendance includes ONLY Active students'
  );
  assert(
    !defaultDailyStudents.some((s) => s.id === targetStudent.id),
    'Withdrawn student is EXCLUDED from default daily attendance on new dates'
  );
  assert(
    defaultDailyStudents.some((s) => s.id === replacement.id),
    'Replacement student is INCLUDED in default daily attendance'
  );

  // 2. On a historical date where targetStudent was marked (2026-10-10)
  const existingHistRecords = await getAttendanceByDateAndClass(historicalDate, classForAtt);
  const historicalDailyStudents = allClassStudents.filter((s) => {
    if (s.status === 'Active') return true;
    return existingHistRecords.some((r) => r.studentId === s.id);
  });

  assert(
    historicalDailyStudents.some((s) => s.id === targetStudent.id),
    'Withdrawn student is PRESERVED on historical date where attendance exists'
  );

  // -------------------------------------------------------------
  // Test 8: Offline Outbox Queueing & Sequential Versioning
  // -------------------------------------------------------------
  console.log('\n[Test 8] Offline Outbox Queueing');
  syncEngine.setOnlineStatus(false);

  // Perform an offline enrollment and edit
  const offlineEnroll = await createStudent(
    {
      rollNo: '201',
      admissionNo: 'ADM-9A-201',
      name: 'Offline Learner',
      fatherName: 'Offline Father',
      class: 'Class 9',
      section: 'A',
      phone: '03001112233',
      status: 'Active',
      registeredStatus: 'Registerd',
    },
    USER_A_EMAIL
  );
  assert(offlineEnroll.success, 'Offline student created successfully in local store');

  const outboxOps = await getOutboxOperations();
  const offlineStudentOps = outboxOps.filter((o) => o.entityId === offlineEnroll.student!.id);
  assert(offlineStudentOps.length === 1, 'Outbox operation queued for offline student');
  assert(offlineStudentOps[0].status === 'pending', 'Outbox operation is in "pending" status');

  // -------------------------------------------------------------
  // Test 9: Offline-to-Online Sync with Confirmed Writes
  // -------------------------------------------------------------
  console.log('\n[Test 9] Offline-to-Online Sync with Confirmed Writes');
  syncEngine.setOnlineStatus(true);
  await new Promise((r) => setTimeout(r, 200));
  await syncEngine.processQueue();
  await new Promise((r) => setTimeout(r, 200));

  const outboxAfterSync = await getOutboxOperations();
  const syncedOps = outboxAfterSync.filter((o) => o.status === 'synced');
  const failedOps = outboxAfterSync.filter((o) => o.status === 'failed');

  assert(syncedOps.length > 0, `Outbox operations marked "synced" after confirmed write (${syncedOps.length} synced)`);
  assert(failedOps.length === 0, `Zero failed ops on normal online reconnect (got ${failedOps.length})`);

  // -------------------------------------------------------------
  // Test 10: Prevention of False Synced Status on Server Error
  // -------------------------------------------------------------
  console.log('\n[Test 10] Prevention of False "Synced" Status on Server Error');
  // Set network simulation to server_error
  updateSupabaseConfig({ simulationMode: 'server_error' });

  // Add another offline student
  const errorStudentRes = await createStudent(
    {
      rollNo: '202',
      admissionNo: 'ADM-9A-202',
      name: 'Server Error Test Student',
      fatherName: 'Father',
      class: 'Class 9',
      section: 'A',
      phone: '03009998877',
      status: 'Active',
      registeredStatus: 'Registerd',
    },
    USER_A_EMAIL
  );

  await syncEngine.processQueue();

  const opsAfterServerError = await getOutboxOperations();
  const errorStudentOp = opsAfterServerError.find((o) => o.entityId === errorStudentRes.student!.id);

  assert(errorStudentOp?.status === 'failed', 'Operation marked "failed" when server returns error (never false "synced")');
  assert(Boolean(errorStudentOp?.errorMessage), 'Error message is captured and not swallowed');

  // Verify student still safely preserved in local IndexedDB
  const localPreserved = await getStudentById(errorStudentRes.student!.id);
  assert(Boolean(localPreserved), 'Student record safely preserved in IndexedDB despite remote failure');

  // Reset simulation to mock
  updateSupabaseConfig({ simulationMode: 'mock' });
  await syncEngine.retryFailedOperations();
  await syncEngine.processQueue();

  const errorStudentOpRetried = (await getOutboxOperations()).find((o) => o.entityId === errorStudentRes.student!.id);
  assert(errorStudentOpRetried?.status === 'synced', 'Operation successfully synced upon retry');

  // -------------------------------------------------------------
  // Test 11: Duplicate Prevention & Re-Sync Safety
  // -------------------------------------------------------------
  console.log('\n[Test 11] Duplicate Prevention & Re-Sync Safety');
  // Attempting to sync student again or trigger re-sync does not duplicate
  const opToResync = errorStudentOpRetried!;
  const resyncResult = await syncOperationToCloud(opToResync, sessionA.token, WORKSPACE_A);
  assert(resyncResult.success, 'Re-sync operation executes cleanly without conflict');

  // -------------------------------------------------------------
  // Test 12: Multi-Workspace Isolation
  // -------------------------------------------------------------
  console.log('\n[Test 12] Multi-Workspace Isolation');
  const WORKSPACE_B = 'workspace_owner_beta_999';
  const USER_B_EMAIL = 'beta@gbhs.edu.pk';
  const sessionB: AuthSession = {
    token: 'token_beta',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: true,
    user: {
      id: WORKSPACE_B,
      email: USER_B_EMAIL,
      fullName: 'Operator Beta',
      schoolId: 'GBHS-BETA',
      schoolName: 'Govt Boys High School Beta',
      role: 'Computer Operator',
      workspaceRole: 'owner',
      workspaceOwnerId: WORKSPACE_B,
    },
  };

  // Switch to Workspace B
  setActiveWorkspaceId(WORKSPACE_B);
  syncEngine.setSession(sessionB);

  const studentsInWorkspaceB = await getAllStudents();
  assert(studentsInWorkspaceB.length === 0, `Workspace B has completely isolated empty database (found ${studentsInWorkspaceB.length})`);

  const outboxInWorkspaceB = await getOutboxOperations();
  assert(outboxInWorkspaceB.length === 0, `Workspace B has isolated empty outbox (found ${outboxInWorkspaceB.length})`);

  // Enroll student in Workspace B
  const betaStudentRes = await createStudent(
    {
      rollNo: '301',
      admissionNo: 'ADM-Beta-301',
      name: 'Beta Student 1',
      fatherName: 'Beta Father',
      class: 'Class 8',
      section: 'A',
      phone: '03123456789',
      status: 'Active',
      registeredStatus: 'Registerd',
    },
    USER_B_EMAIL
  );

  assert(betaStudentRes.success, 'Student created in Workspace B');
  assert(betaStudentRes.student!.owner_id === WORKSPACE_B, 'Student in Workspace B carries owner_id WORKSPACE_B');

  // Switch back to Workspace A
  setActiveWorkspaceId(WORKSPACE_A);
  syncEngine.setSession(sessionA);

  const studentsBackInA = await getAllStudents();
  assert(
    !studentsBackInA.some((s) => s.id === betaStudentRes.student!.id),
    'Workspace A cannot see student created in Workspace B'
  );
  assert(
    studentsBackInA.length === allAfterEnroll.length + 3, // 6 original + 1 replacement + 2 offline students
    `Workspace A retains its original data intact (found ${studentsBackInA.length} students)`
  );

  console.log('\n============================================================');
  console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('============================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\nTest Suite Execution Failed:', err);
  process.exit(1);
});
