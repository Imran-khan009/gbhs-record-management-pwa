import 'fake-indexeddb/auto';
import {
  getDB,
  closeDB,
  LEGACY_DB_NAME,
  setActiveWorkspaceId,
  getActiveWorkspaceId,
  getWorkspaceDatabaseName,
  inspectLegacyRecords,
  linkAndMigrateLegacyRecordsToWorkspace,
  rollbackLegacyMigration,
  getAllStudents,
  saveStudentLocally,
  getAllAttendanceRecords,
  saveAttendanceLocally,
  getAllTeachingLogs,
  saveTeachingLogLocally,
  getAllPracticalProgress,
  savePracticalProgressLocally,
  getAllAbsenteeFollowups,
  saveAbsenteeFollowupLocally,
  enqueueOutboxOperation,
  getOutboxOperations,
  getPendingOutboxOperations,
  setAppState,
  getAppState,
} from '../src/services/db';
import { Student, AttendanceRecord } from '../src/types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../src/types/modules';
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

async function runLocalIsolationTests() {
  console.log('====================================================');
  console.log('GBHS STEP 1: SAFE LOCAL ACCOUNT ISOLATION TEST SUITE');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------
    // 1. SETUP LEGACY UNPARTITIONED DATABASE (gbhs_operator_db_v1)
    // -------------------------------------------------------------
    console.log('--- Phase 1: Existing Legacy Database & Non-Destructive Integrity ---');

    // Ensure we start with no active workspace
    setActiveWorkspaceId(null);
    const legacyDb = await getDB(LEGACY_DB_NAME);

    const nowIso = new Date().toISOString();
    const legacyStudent1: Student = {
      id: 'legacy_std_001',
      name: 'Muhammad Tariq',
      fatherName: 'Tariq Mehmood',
      phone: '03001112233',
      rollNo: '101',
      admissionNo: 'ADM-LEGACY-001',
      class: 'Class 9',
      section: 'A',
      gender: 'Male',
      trade: 'Computer Science',
      status: 'Active',
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      schoolId: 'GBHS-MAIN',
      createdBy: 'offline_operator',
    };

    const legacyStudent2: Student = {
      id: 'legacy_std_002',
      name: 'Zubair Khan',
      fatherName: 'Khan Muhammad',
      phone: '03004445566',
      rollNo: '102',
      admissionNo: 'ADM-LEGACY-002',
      class: 'Class 8',
      section: 'B',
      gender: 'Male',
      trade: 'General',
      status: 'Active',
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      schoolId: 'GBHS-MAIN',
      createdBy: 'offline_operator',
    };

    const legacyAttendance: AttendanceRecord = {
      id: 'legacy_att_001',
      studentId: 'legacy_std_001',
      studentName: 'Muhammad Tariq',
      rollNo: '101',
      class: 'Class 9',
      section: 'A',
      date: '2026-10-18',
      status: 'Present',
      version: 1,
      updatedAt: nowIso,
      schoolId: 'GBHS-MAIN',
      markedBy: 'offline_operator',
    };

    const legacyLog: TeachingLogEntry = {
      id: 'legacy_log_001',
      date: '2026-10-18',
      day: 'Monday',
      class: 'Class 9',
      subjectTopic: 'Computer Hardware Components',
      learningObjectives: 'Understand CPU and RAM',
      theoryCovered: 'Von Neumann Architecture',
      practicalActivity: 'Motherboard inspection',
      totalRegistered: 30,
      studentsPresent: 28,
      studentsCompletingTask: 25,
      studentsNeedingHelp: 3,
      teachingMethod: 'Lecture & Lab Demo',
      instructorName: 'Sir Rashid',
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const legacyProgress: PracticalProgressEntry = {
      id: 'legacy_prog_001',
      assessmentDate: '2026-10-18',
      studentId: 'legacy_std_001',
      registrationId: 'ADM-LEGACY-001',
      studentName: 'Muhammad Tariq',
      class: 'Class 9',
      skillTask: 'Motherboard RAM Installation',
      attemptNumber: 1,
      practicalCompleted: 'Yes',
      scoreMarks: 95,
      skillStatus: 'Proficient',
      remedialPracticeRequired: 'No',
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const legacyFollowup: AbsenteeFollowupEntry = {
      id: 'legacy_fol_001',
      date: '2026-10-18',
      studentId: 'legacy_std_002',
      registrationId: 'ADM-LEGACY-002',
      studentName: 'Zubair Khan',
      class: 'Class 8',
      absenceCount: 3,
      followupReason: 'Fever and medical rest',
      actionTaken: 'Phone call to father',
      contactPerson: 'Father',
      responseReceived: 'Will return on Wednesday with doctor note',
      expectedReturnDate: '2026-10-21',
      followupDate: '2026-10-18',
      currentStatus: 'Pending Return',
      managementReferral: 'No',
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const legacyOutboxOp: OutboxOperation = {
      opId: 'legacy_op_001',
      entityId: 'legacy_std_001',
      entityType: 'student',
      operationType: 'CREATE',
      payload: legacyStudent1,
      timestamp: Date.now() - 50000,
      status: 'pending',
      retryCount: 0,
      userEmail: 'unassigned@local',
      version: 1,
    };

    // Save into unpartitioned legacy database
    await legacyDb.put('students', legacyStudent1);
    await legacyDb.put('students', legacyStudent2);
    await legacyDb.put('attendance', legacyAttendance);
    await legacyDb.put('teaching_logs', legacyLog);
    await legacyDb.put('practical_progress', legacyProgress);
    await legacyDb.put('absentee_followups', legacyFollowup);
    await legacyDb.put('outbox', legacyOutboxOp);

    // Inspect legacy records
    const inspection = await inspectLegacyRecords();
    assert(
      inspection.hasLegacyData === true &&
        inspection.totalRecords === 7 &&
        inspection.counts.students === 2 &&
        inspection.counts.attendance === 1 &&
        inspection.counts.teaching_logs === 1 &&
        inspection.counts.practical_progress === 1 &&
        inspection.counts.absentee_followups === 1 &&
        inspection.counts.outbox === 1,
      'Legacy Data Detection',
      `Detected 7 unassigned legacy records without mutation (Students: 2, Attendance: 1, Logs: 1, Practicals: 1, Followups: 1, Outbox: 1)`
    );

    assert(
      inspection.isAlreadyLinked === false,
      'Zero Auto-Assignment Guarantee',
      'Existing records are NOT automatically linked or assigned to any account prior to explicit confirmation'
    );

    // -------------------------------------------------------------
    // 2. ACCOUNT A (OWNER) AUTHENTICATION & EXPLICIT LINKING
    // -------------------------------------------------------------
    console.log('\n--- Phase 2: Owner Account Authentication & Explicit Linking ---');

    const accountAId = 'usr_owner_alpha_1';
    const accountAEmail = 'operator_alpha@gbhs.edu.pk';

    // Mount Account A's workspace
    setActiveWorkspaceId(accountAId);
    assert(
      getActiveWorkspaceId() === accountAId,
      'Active Workspace Activation',
      `Workspace active ID set to "${accountAId}"`
    );

    // Prior to explicit confirmation, Account A's isolated database must have 0 records
    const initialAStudents = await getAllStudents();
    const initialAOutbox = await getOutboxOperations();
    assert(
      initialAStudents.length === 0 && initialAOutbox.length === 0,
      'Empty Pre-Confirmation Workspace',
      `Before linking confirmation, Account A workspace contains 0 students and 0 outbox operations`
    );

    // Explicit confirmation: Link legacy records to Account A
    const linkResult = await linkAndMigrateLegacyRecordsToWorkspace(accountAId, accountAEmail);
    assert(
      linkResult.success === true && linkResult.manifest !== undefined,
      'Explicit Linking Execution',
      `Successfully linked legacy records to Account A with manifest targeting db "${linkResult.manifest?.targetDb}"`
    );

    // Verify Account A's workspace now contains all 7 records, stamped with owner_id
    const postLinkAStudents = await getAllStudents();
    const postLinkAAttendance = await getAllAttendanceRecords();
    const postLinkATeaching = await getAllTeachingLogs();
    const postLinkAProgress = await getAllPracticalProgress();
    const postLinkAFollowups = await getAllAbsenteeFollowups();
    const postLinkAOutbox = await getOutboxOperations();

    assert(
      postLinkAStudents.length === 2 &&
        postLinkAStudents[0].owner_id === accountAId &&
        postLinkAStudents[1].owner_id === accountAId,
      'Student Partitioning & Ownership Stamping',
      `Account A now owns 2 students, correctly stamped with owner_id="${accountAId}"`
    );

    assert(
      postLinkAAttendance.length === 1 && postLinkAAttendance[0].owner_id === accountAId,
      'Attendance Partitioning & Ownership',
      `Attendance record correctly migrated with owner_id="${accountAId}"`
    );

    assert(
      postLinkATeaching.length === 1 &&
        postLinkAProgress.length === 1 &&
        postLinkAFollowups.length === 1,
      'Modules Records Partitioning',
      `Teaching logs (1), practicals (1), and followups (1) populated into Account A workspace`
    );

    assert(
      postLinkAOutbox.length === 1 && postLinkAOutbox[0].userEmail === accountAEmail,
      'Outbox Migration & Ownership',
      `Outbox operation transferred with userEmail="${accountAEmail}"`
    );

    // Verify legacy database (gbhs_operator_db_v1) remains 100% intact (ZERO records deleted)
    const legacyStudentsAfter = await legacyDb.getAll('students');
    const legacyAttendanceAfter = await legacyDb.getAll('attendance');
    const legacyLogsAfter = await legacyDb.getAll('teaching_logs');
    assert(
      legacyStudentsAfter.length === 2 &&
        legacyAttendanceAfter.length === 1 &&
        legacyLogsAfter.length === 1,
      'Archive Zero Deletion Guarantee',
      `Original gbhs_operator_db_v1 still holds all records intact (Students: ${legacyStudentsAfter.length}, Attendance: ${legacyAttendanceAfter.length}, Logs: ${legacyLogsAfter.length})`
    );

    // -------------------------------------------------------------
    // 3. LOGOUT & WORKSPACE UNBINDING
    // -------------------------------------------------------------
    console.log('\n--- Phase 3: Logout & Database Connection Teardown ---');

    await closeDB();
    setActiveWorkspaceId(null);
    assert(
      getActiveWorkspaceId() === null,
      'Logout Workspace Unmount',
      'Workspace cleanly unmounted and active workspace set to null'
    );

    // -------------------------------------------------------------
    // 4. ACCOUNT B (NEW USER) ON THE SAME DEVICE
    // -------------------------------------------------------------
    console.log('\n--- Phase 4: Account B (New User) Workspace Isolation ---');

    const accountBId = 'usr_operator_beta_2';
    const accountBEmail = 'operator_beta@gbhs.edu.pk';

    // Log in Account B
    setActiveWorkspaceId(accountBId);
    assert(
      getActiveWorkspaceId() === accountBId,
      'Account B Workspace Activation',
      `Account B active workspace set to "${accountBId}"`
    );

    // Requirement 4: New users must get an empty local workspace and must never see another account's records
    const bStudents = await getAllStudents();
    const bAttendance = await getAllAttendanceRecords();
    const bTeaching = await getAllTeachingLogs();
    const bProgress = await getAllPracticalProgress();
    const bFollowups = await getAllAbsenteeFollowups();
    const bOutbox = await getOutboxOperations();

    assert(
      bStudents.length === 0,
      'Account B Clean Students Isolation',
      `Account B has exactly 0 students (cannot see Account A's 2 students)`
    );

    assert(
      bAttendance.length === 0 &&
        bTeaching.length === 0 &&
        bProgress.length === 0 &&
        bFollowups.length === 0,
      'Account B Clean Modules Isolation',
      `Account B has exactly 0 attendance, 0 teaching logs, 0 practicals, and 0 followups`
    );

    assert(
      bOutbox.length === 0,
      'Account B Clean Outbox Isolation',
      `Account B has exactly 0 pending outbox operations (cannot see Account A's pending outbox)`
    );

    // -------------------------------------------------------------
    // 5. PENDING OUTBOX ISOLATION ACROSS ACCOUNTS ON THE SAME DEVICE
    // -------------------------------------------------------------
    console.log('\n--- Phase 5: Pending Outbox Isolation Between Accounts ---');

    // Account B creates a student and enqueues a pending outbox operation
    const studentB: Student = {
      id: 'std_beta_101',
      name: 'Farhan Ali (Beta Workspace)',
      fatherName: 'Ali Asghar',
      phone: '03007778899',
      rollNo: '201',
      admissionNo: 'ADM-BETA-201',
      class: 'Class 7',
      section: 'A',
      gender: 'Male',
      trade: 'Computer Science',
      status: 'Active',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      createdBy: accountBEmail,
    };

    await saveStudentLocally(studentB);

    const outboxOpB: OutboxOperation = {
      opId: 'op_beta_outbox_001',
      entityId: studentB.id,
      entityType: 'student',
      operationType: 'CREATE',
      payload: studentB,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail: accountBEmail,
      version: 1,
    };

    await enqueueOutboxOperation(outboxOpB);

    const bPendingAfterCreate = await getPendingOutboxOperations();
    assert(
      bPendingAfterCreate.length === 1 && bPendingAfterCreate[0].opId === 'op_beta_outbox_001',
      'Account B Outbox Enqueue',
      `Account B enqueued 1 pending operation: op_beta_outbox_001`
    );

    // Logout Account B and switch back to Account A
    await closeDB();
    setActiveWorkspaceId(accountAId);

    const aPendingOps = await getPendingOutboxOperations();
    const aStudents = await getAllStudents();

    assert(
      aStudents.some((s) => s.id === 'std_beta_101') === false,
      'Cross-Account Student Privacy',
      `Account A cannot see Account B's student "std_beta_101"`
    );

    assert(
      aPendingOps.some((op) => op.opId === 'op_beta_outbox_001') === false,
      'Cross-Account Outbox Isolation',
      `Account A cannot see Account B's pending outbox operation "op_beta_outbox_001" (Account A pending: ${aPendingOps.length})`
    );

    // Switch back to Account B and verify Account B's outbox is intact
    await closeDB();
    setActiveWorkspaceId(accountBId);

    const bPendingRestored = await getPendingOutboxOperations();
    assert(
      bPendingRestored.length === 1 && bPendingRestored[0].opId === 'op_beta_outbox_001',
      'Account B Outbox Persistence',
      `Account B's pending operation "op_beta_outbox_001" remains safely preserved and isolated`
    );

    // -------------------------------------------------------------
    // 6. SAFE MIGRATION ROLLBACK PROTECTION
    // -------------------------------------------------------------
    console.log('\n--- Phase 6: Safe Migration Rollback Protection ---');

    // Switch to Account A and trigger rollback
    setActiveWorkspaceId(accountAId);
    const rollbackResult = await rollbackLegacyMigration(accountAId);

    assert(
      rollbackResult.success === true,
      'Rollback Execution',
      `Rollback succeeded with message: "${rollbackResult.message}"`
    );

    const aStudentsAfterRollback = await getAllStudents();
    const aOutboxAfterRollback = await getOutboxOperations();
    assert(
      aStudentsAfterRollback.length === 0 && aOutboxAfterRollback.length === 0,
      'Post-Rollback Clean Workspace',
      `Account A workspace reverted to empty (0 students, 0 outbox operations)`
    );

    // Verify gbhs_operator_db_v1 still has all original legacy data intact
    const currentLegacyDb = await getDB(LEGACY_DB_NAME);
    const legacyStudentsFinal = await currentLegacyDb.getAll('students');
    const legacyOutboxFinal = await currentLegacyDb.getAll('outbox');
    assert(
      legacyStudentsFinal.length === 2 && legacyOutboxFinal.length === 1,
      'Rollback Archive Preservation',
      `Legacy archive gbhs_operator_db_v1 remained 100% untouched throughout migration and rollback`
    );

    // Verify inspectLegacyRecords reports ready to link again
    const reInspection = await inspectLegacyRecords(accountAId);
    assert(
      reInspection.hasLegacyData === true && reInspection.isAlreadyLinked === false,
      'Re-Inspect After Rollback',
      `inspectLegacyRecords confirms legacy records are available to re-link when desired`
    );

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED OUT OF ${testsPassed + testsFailed} TESTS.`);
    console.log('====================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error('Fatal test runner error:', error);
    process.exit(1);
  }
}

runLocalIsolationTests();
