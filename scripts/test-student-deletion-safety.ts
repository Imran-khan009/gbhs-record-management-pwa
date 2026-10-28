/**
 * Isolated Regression Test: Student Deletion Safety & Data Integrity
 * 
 * Verifies:
 * 1. Safe bulk deletion for students with NO history (unassessed roster).
 * 2. Strict BLOCK of bulk deletion for students with ATTENDANCE history, explaining why.
 * 3. Strict BLOCK of bulk deletion for students with LINKED MODULE records (practicals, follow-ups, teaching logs).
 * 4. Class-scoped deletion safety (deleteStudentsByClassData).
 * 5. Read-only Staff permission denial (cannot delete or purge students).
 * 6. Single-student soft-delete preservation (students with history are marked 'Withdrawn', never orphaned).
 * 7. Authorized explicit purge with defined scope and complete outbox synchronization.
 */

import 'fake-indexeddb/auto';
import {
  getDB,
  setActiveWorkspaceId,
  getWorkspaceDatabaseName,
  getAllStudents,
  getAllAttendanceRecords,
  getAllPracticalProgress,
  getAllAbsenteeFollowups,
  getAllTeachingLogs,
  getOutboxOperations,
} from '../src/services/db';
import {
  deleteAllStudentsData,
  deleteStudentsByClassData,
  deleteStudent,
  getLinkedHistorySummary,
  CONFIRM_PURGE_PHRASE,
} from '../src/services/recordService';
import { syncEngine } from '../src/services/syncEngine';
import { Student, AttendanceRecord } from '../src/types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../src/types/modules';
import { AuthSession, OperatorUser } from '../src/types/auth';

// Terminal formatting
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}${detail ? ` (${detail})` : ''}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - FAILED: ${detail}` : ''}`);
  }
}

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

async function runStudentDeletionSafetyTests() {
  console.log(`\n${BOLD}======================================================================${RESET}`);
  console.log(`${BOLD}    STUDENT DELETION SAFETY & DATA INTEGRITY - REGRESSION SUITE     ${RESET}`);
  console.log(`${BOLD}======================================================================${RESET}\n`);

  const testWorkspaceId = 'test_del_safety_ws_001';
  const ownerEmail = 'owner@gbhs.edu.pk';
  const staffEmail = 'staff@gbhs.edu.pk';
  const dbName = getWorkspaceDatabaseName(testWorkspaceId);

  // Set active workspace
  setActiveWorkspaceId(testWorkspaceId);

  // Set session as Owner
  syncEngine.setSession(
    createMockSession(
      {
        id: testWorkspaceId,
        email: ownerEmail,
        fullName: 'Lead Operator & Owner',
        schoolId: 'GBHS-MAIN',
        schoolName: 'GBHS Main Campus',
        role: 'Admin',
        workspaceRole: 'owner',
        isApproved: true,
        workspaceOwnerId: testWorkspaceId,
      },
      'owner_token_123'
    )
  );

  const db = await getDB(dbName);
  const nowIso = new Date().toISOString();

  // Helper student fixtures
  const student1: Student = {
    id: 'stu_safe_001',
    name: 'Nadir Ali',
    fatherName: 'Mehrullah',
    class: 'Class 7',
    section: 'A',
    rollNo: '1',
    admissionNo: 'GBHS-701',
    status: 'Active',
    phone: '03001111111',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    schoolId: 'GBHS-MAIN',
    owner_id: testWorkspaceId,
    createdBy: ownerEmail,
  };

  const student2: Student = {
    id: 'stu_safe_002',
    name: 'Muhammad Imran',
    fatherName: 'Abdul Rauf',
    class: 'Class 7',
    section: 'A',
    rollNo: '2',
    admissionNo: 'GBHS-702',
    status: 'Active',
    phone: '03002222222',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    schoolId: 'GBHS-MAIN',
    owner_id: testWorkspaceId,
    createdBy: ownerEmail,
  };

  const student3: Student = {
    id: 'stu_safe_003',
    name: 'Babar Ali',
    fatherName: 'Ghulam Rasool',
    class: 'Class 8',
    section: 'B',
    rollNo: '1',
    admissionNo: 'GBHS-801',
    status: 'Active',
    phone: '03003333333',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    schoolId: 'GBHS-MAIN',
    owner_id: testWorkspaceId,
    createdBy: ownerEmail,
  };

  // ============================================================================
  // SECTION 1: Students With NO History (Safe Bulk Deletion)
  // ============================================================================
  console.log(`${BOLD}[SECTION 1] Students with NO History (Safe Bulk Deletion)${RESET}`);

  // Seed two students with no attendance, practicals, followups, or teaching logs
  await db.clear('students');
  await db.clear('attendance');
  await db.clear('practical_progress');
  await db.clear('absentee_followups');
  await db.clear('teaching_logs');
  await db.clear('outbox');

  await db.put('students', student1);
  await db.put('students', student2);

  const history1 = await getLinkedHistorySummary();
  assert(!history1.hasHistory, 'History summary detects zero historical records');
  assert(history1.totalHistoricalRecords === 0, 'Total historical records is 0');

  const deletedCount = await deleteAllStudentsData(ownerEmail);
  assert(deletedCount === 2, 'deleteAllStudentsData succeeds and returns 2 deleted students');

  const studentsAfter = await getAllStudents();
  assert(studentsAfter.length === 0, 'Students store is now empty in IndexedDB');

  const outboxOps = await getOutboxOperations();
  const studentDeleteOps = outboxOps.filter(
    (op) => op.entityType === 'student' && op.operationType === 'DELETE'
  );
  assert(studentDeleteOps.length === 2, 'Outbox contains 2 DELETE operations for remote sync');
  assert(studentDeleteOps.some((op) => op.entityId === 'stu_safe_001'), 'Outbox has DELETE op for student 1');
  assert(studentDeleteOps.some((op) => op.entityId === 'stu_safe_002'), 'Outbox has DELETE op for student 2');

  // ============================================================================
  // SECTION 2: Students With ATTENDANCE History (Destructive Deletion BLOCKED)
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 2] Students with Attendance History (Destructive Deletion BLOCKED)${RESET}`);

  // Seed students and attendance records
  await db.clear('students');
  await db.clear('attendance');
  await db.clear('outbox');

  await db.put('students', student1);
  await db.put('students', student2);

  const attRecord1: AttendanceRecord = {
    id: `${student1.id}_2026-10-20`,
    studentId: student1.id,
    studentName: student1.name,
    rollNo: student1.rollNo,
    class: student1.class,
    section: student1.section,
    date: '2026-10-20',
    status: 'Present',
    markedBy: ownerEmail,
    version: 1,
    updatedAt: nowIso,
    schoolId: 'GBHS-MAIN',
    owner_id: testWorkspaceId,
  };

  const attRecord2: AttendanceRecord = {
    id: `${student2.id}_2026-10-20`,
    studentId: student2.id,
    studentName: student2.name,
    rollNo: student2.rollNo,
    class: student2.class,
    section: student2.section,
    date: '2026-10-20',
    status: 'Absent',
    markedBy: ownerEmail,
    version: 1,
    updatedAt: nowIso,
    schoolId: 'GBHS-MAIN',
    owner_id: testWorkspaceId,
  };

  await db.put('attendance', attRecord1);
  await db.put('attendance', attRecord2);

  const history2 = await getLinkedHistorySummary();
  assert(history2.hasHistory, 'History summary detects active historical records');
  assert(history2.attendanceCount === 2, 'History summary detects 2 attendance records');

  let blockedError: string | null = null;
  try {
    await deleteAllStudentsData(ownerEmail);
  } catch (err: any) {
    blockedError = err.message;
  }

  assert(blockedError !== null, 'deleteAllStudentsData threw error when attendance history exists');
  assert(
    blockedError?.includes('Destructive deletion blocked') === true,
    'Error message explicitly states Destructive deletion blocked'
  );
  assert(
    blockedError?.includes('2 attendance record(s)') === true,
    'Error message specifies exact count of 2 attendance records'
  );
  assert(
    blockedError?.includes('prevent orphaned records and data loss') === true,
    'Error message explains prevention of orphaned records'
  );

  // Verify database is 100% UNTOUCHED
  const studentsPreserved = await getAllStudents();
  assert(studentsPreserved.length === 2, 'Students count remains strictly 2 (untouched)');
  const attendancePreserved = await getAllAttendanceRecords();
  assert(attendancePreserved.length === 2, 'Attendance count remains strictly 2 (untouched)');

  const outboxAfterBlock = await getOutboxOperations();
  const deleteOpsAfterBlock = outboxAfterBlock.filter((op) => op.operationType === 'DELETE');
  assert(deleteOpsAfterBlock.length === 0, 'Zero DELETE outbox operations enqueued');

  // ============================================================================
  // SECTION 3: Students with MODULE Records (Practicals, Follow-ups, Teaching Logs)
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 3] Students with Module Records (Practicals, Follow-ups, Logs BLOCKED)${RESET}`);

  // Clear attendance, add practical and follow-up
  await db.clear('attendance');

  const practical1: PracticalProgressEntry = {
    id: 'prac_safe_001',
    assessmentDate: '2026-10-20',
    studentId: student1.id,
    registrationId: '1',
    studentName: student1.name,
    class: 'Class 7',
    skillTask: 'Hardware Identification',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 90,
    skillStatus: 'Proficient',
    remedialPracticeRequired: 'No',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    owner_id: testWorkspaceId,
  };

  const followup1: AbsenteeFollowupEntry = {
    id: 'fol_safe_001',
    date: '2026-10-20',
    studentId: student2.id,
    registrationId: '2',
    studentName: student2.name,
    class: 'Class 7',
    absenceCount: 3,
    followupReason: 'Medical Leave',
    actionTaken: 'Phone Call',
    contactPerson: 'Father',
    responseReceived: 'Confirmed',
    followupDate: '2026-10-21',
    currentStatus: 'Pending Return',
    managementReferral: 'No',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    owner_id: testWorkspaceId,
  };

  const teachingLog1: TeachingLogEntry = {
    id: 'teach_safe_001',
    date: '2026-10-20',
    day: 'Tuesday',
    class: 'Class 7',
    subjectTopic: 'Computer Fundamentals',
    learningObjectives: 'Input and Output devices',
    theoryCovered: 'Hardware components',
    practicalActivity: 'Motherboard inspection',
    totalRegistered: 2,
    studentsPresent: 2,
    studentsCompletingTask: 2,
    studentsNeedingHelp: 0,
    teachingMethod: 'Interactive Demo',
    instructorName: 'Lead Operator',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    owner_id: testWorkspaceId,
  };

  await db.put('practical_progress', practical1);
  await db.put('absentee_followups', followup1);
  await db.put('teaching_logs', teachingLog1);

  const history3 = await getLinkedHistorySummary();
  assert(history3.hasHistory, 'History summary detects module records');
  assert(history3.practicalCount === 1, 'History summary detects 1 practical assessment');
  assert(history3.absenteeFollowupCount === 1, 'History summary detects 1 absentee follow-up');
  assert(history3.teachingLogCount === 1, 'History summary detects 1 teaching log');

  let moduleBlockError: string | null = null;
  try {
    await deleteAllStudentsData(ownerEmail);
  } catch (err: any) {
    moduleBlockError = err.message;
  }

  assert(moduleBlockError !== null, 'deleteAllStudentsData threw error when module history exists');
  assert(
    moduleBlockError?.includes('1 practical assessment(s)') === true,
    'Error message identifies practical assessment'
  );
  assert(
    moduleBlockError?.includes('1 absentee follow-up(s)') === true,
    'Error message identifies absentee follow-up'
  );
  assert(
    moduleBlockError?.includes('1 curriculum teaching log(s)') === true,
    'Error message identifies teaching log'
  );

  // Verify all records untouched
  assert((await getAllStudents()).length === 2, 'Students untouched');
  assert((await getAllPracticalProgress()).length === 1, 'Practicals untouched');
  assert((await getAllAbsenteeFollowups()).length === 1, 'Follow-ups untouched');
  assert((await getAllTeachingLogs()).length === 1, 'Teaching logs untouched');

  // ============================================================================
  // SECTION 4: Class-Scoped Deletion Safeguard (deleteStudentsByClassData)
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 4] Class-Scoped Deletion Safeguard (deleteStudentsByClassData)${RESET}`);

  // Add Class 8 student with no history
  await db.put('students', student3);
  assert((await getAllStudents()).length === 3, 'Seeded 3 students (2 in Class 7, 1 in Class 8)');

  // Deleting Class 7 should be BLOCKED because Class 7 has practicals, follow-ups, and logs
  let class7BlockError: string | null = null;
  try {
    await deleteStudentsByClassData('Class 7', ownerEmail);
  } catch (err: any) {
    class7BlockError = err.message;
  }

  assert(class7BlockError !== null, 'deleteStudentsByClassData blocked for Class 7 with history');
  assert(
    class7BlockError?.includes('Destructive deletion blocked') === true,
    'Class 7 error confirms destructive deletion blocked'
  );

  // Deleting Class 8 should SUCCEED because Class 8 has NO history
  const class8Deleted = await deleteStudentsByClassData('Class 8', ownerEmail);
  assert(class8Deleted === 1, 'deleteStudentsByClassData deletes 1 student for Class 8');

  const remainingStudents = await getAllStudents();
  assert(remainingStudents.length === 2, 'Class 7 students remain intact (2 students)');
  assert(remainingStudents.every((s) => s.class === 'Class 7'), 'Only Class 7 students remain');

  // ============================================================================
  // SECTION 5: Read-Only Staff Access Denial
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 5] Read-Only Staff Permission Denial${RESET}`);

  // Switch session to Approved Staff (team_member role, read-only permissions)
  syncEngine.setSession(
    createMockSession(
      {
        id: 'staff_user_999',
        email: staffEmail,
        fullName: 'Assistant Staff Operator',
        schoolId: 'GBHS-MAIN',
        schoolName: 'GBHS Main Campus',
        role: 'Computer Operator',
        workspaceRole: 'team_member',
        isApproved: true,
        workspaceOwnerId: testWorkspaceId,
      },
      'staff_token_456'
    )
  );

  let staffDeleteAllDenied = false;
  try {
    await deleteAllStudentsData(staffEmail);
  } catch (err: any) {
    if (err.message.includes('Permission denied')) {
      staffDeleteAllDenied = true;
    }
  }
  assert(staffDeleteAllDenied, 'Read-only staff is strictly denied deleteAllStudentsData');

  let staffClassDeleteDenied = false;
  try {
    await deleteStudentsByClassData('Class 7', staffEmail);
  } catch (err: any) {
    if (err.message.includes('Permission denied')) {
      staffClassDeleteDenied = true;
    }
  }
  assert(staffClassDeleteDenied, 'Read-only staff is strictly denied deleteStudentsByClassData');

  // Switch back to Owner
  syncEngine.setSession(
    createMockSession(
      {
        id: testWorkspaceId,
        email: ownerEmail,
        fullName: 'Lead Operator & Owner',
        schoolId: 'GBHS-MAIN',
        schoolName: 'GBHS Main Campus',
        role: 'Admin',
        workspaceRole: 'owner',
        isApproved: true,
        workspaceOwnerId: testWorkspaceId,
      },
      'owner_token_123'
    )
  );

  // ============================================================================
  // SECTION 6: Single-Student Soft-Delete Lifecycle Preservation
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 6] Single-Student Soft-Delete Lifecycle Preservation${RESET}`);

  // Seed student with attendance record
  await db.clear('students');
  await db.clear('attendance');
  await db.put('students', student1);
  await db.put('attendance', attRecord1);

  // Attempt deleteStudent on student with history
  const singleDeleteRes = await deleteStudent(student1.id, ownerEmail);
  assert(singleDeleteRes.success, 'deleteStudent returns success: true');
  assert(singleDeleteRes.softDeleted === true, 'deleteStudent performs soft delete (softDeleted: true)');

  const softDeletedStudent = await db.get('students', student1.id);
  assert(softDeletedStudent !== undefined, 'Student record still exists in IndexedDB');
  assert(softDeletedStudent?.status === 'Withdrawn', 'Student status is Withdrawn (never purged)');
  assert(softDeletedStudent?.id === student1.id, 'Student ID preserved intact');
  assert(softDeletedStudent?.rollNo === '1', 'Student roll number preserved intact');

  const attendanceStillLinked = await db.get('attendance', attRecord1.id);
  assert(attendanceStillLinked !== undefined, 'Attendance record remains preserved in IndexedDB');
  assert(attendanceStillLinked?.studentId === student1.id, 'Attendance link to student preserved');

  // Test single student with zero history and forcePermanent
  const temporaryStudent: Student = {
    ...student2,
    id: 'stu_temp_004',
    name: 'Temporary Mistake Student',
    admissionNo: 'GBHS-TEMP-01',
  };
  await db.put('students', temporaryStudent);

  const permDeleteRes = await deleteStudent(temporaryStudent.id, ownerEmail, { forcePermanent: true });
  assert(permDeleteRes.success, 'Permanent delete for student with zero history succeeds');
  assert(permDeleteRes.softDeleted === false, 'Student with zero history was permanently deleted locally');

  const tempStudentAfter = await db.get('students', temporaryStudent.id);
  assert(tempStudentAfter === undefined, 'Temporary student removed from IndexedDB');

  // ============================================================================
  // SECTION 7: Authorized Explicit Purge with Defined Scope & Outbox Integrity
  // ============================================================================
  console.log(`\n${BOLD}[SECTION 7] Authorized Explicit Purge with Defined Scope${RESET}`);

  // Seed full dataset: students, attendance, practicals, follow-ups
  await db.clear('students');
  await db.clear('attendance');
  await db.clear('practical_progress');
  await db.clear('absentee_followups');
  await db.clear('teaching_logs');
  await db.clear('outbox');

  await db.put('students', student1);
  await db.put('students', student2);
  await db.put('attendance', attRecord1);
  await db.put('attendance', attRecord2);
  await db.put('practical_progress', practical1);
  await db.put('absentee_followups', followup1);
  await db.put('teaching_logs', teachingLog1);

  // Test wrong confirmation phrase
  let invalidPhraseError = false;
  try {
    await deleteAllStudentsData(ownerEmail, {
      confirmPurgeHistory: true,
      confirmationPhrase: 'WRONG_PHRASE',
    });
  } catch (err: any) {
    if (err.message.includes('Invalid confirmation phrase')) {
      invalidPhraseError = true;
    }
  }
  assert(invalidPhraseError, 'Rejects purge when confirmation phrase is invalid');

  // Execute authorized purge with correct confirmation phrase
  const purgedCount = await deleteAllStudentsData(ownerEmail, {
    confirmPurgeHistory: true,
    confirmationPhrase: CONFIRM_PURGE_PHRASE,
  });

  assert(purgedCount === 2, 'Authorized purge successfully removed 2 students');

  // Verify scoped stores are cleared in IndexedDB
  assert((await getAllStudents()).length === 0, 'Students store cleared in IndexedDB');
  assert((await getAllAttendanceRecords()).length === 0, 'Attendance store cleared in IndexedDB');
  assert((await getAllPracticalProgress()).length === 0, 'Practical assessments cleared in IndexedDB');
  assert((await getAllAbsenteeFollowups()).length === 0, 'Absentee follow-ups cleared in IndexedDB');

  // Verify teaching logs PRESERVED by default (curriculum lesson plans are not student personal data)
  assert((await getAllTeachingLogs()).length === 1, 'Teaching logs curriculum records preserved by default');

  // Verify Outbox Integrity: Every single purged record has an enqueued DELETE operation
  const finalOutboxOps = await getOutboxOperations();
  const studentOps = finalOutboxOps.filter((o) => o.entityType === 'student' && o.operationType === 'DELETE');
  const attOps = finalOutboxOps.filter((o) => o.entityType === 'attendance' && o.operationType === 'DELETE');
  const practicalOps = finalOutboxOps.filter(
    (o) => o.entityType === 'practical_progress' && o.operationType === 'DELETE'
  );
  const followupOps = finalOutboxOps.filter(
    (o) => o.entityType === 'absentee_followup' && o.operationType === 'DELETE'
  );

  assert(studentOps.length === 2, 'Outbox has 2 student DELETE operations for cloud sync');
  assert(attOps.length === 2, 'Outbox has 2 attendance DELETE operations (never silently deleted)');
  assert(practicalOps.length === 1, 'Outbox has 1 practical assessment DELETE operation');
  assert(followupOps.length === 1, 'Outbox has 1 absentee follow-up DELETE operation');

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

runStudentDeletionSafetyTests().catch((err) => {
  console.error('Test suite crashed with unhandled error:', err);
  process.exit(1);
});
