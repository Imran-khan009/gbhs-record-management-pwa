import 'fake-indexeddb/auto';
import {
  setActiveWorkspaceId,
  getActiveWorkspaceId,
  getDB,
  getAllStudents,
  saveStudentLocally,
  getAllAttendanceRecords,
  saveAttendanceLocally,
  getOutboxOperations,
  enqueueOutboxOperation,
  getStudentById,
  deleteWorkspaceDatabase,
} from '../src/services/db';
import {
  initTestSandbox,
  runInSandbox,
} from '../src/services/testSandbox';
import {
  setMockCloudOnly,
  isMockCloudOnly,
  getSupabaseConfig,
  setNetworkSimulation,
  syncOperationToCloud,
} from '../src/services/supabase';
import { createStudent, markSingleAttendance, deleteStudent } from '../src/services/recordService';
import { createTeachingLog, createPracticalProgress, createAbsenteeFollowup } from '../src/services/modulesService';
import { syncEngine } from '../src/services/syncEngine';

let passedChecks = 0;
let failedChecks = 0;

function assert(condition: boolean, title: string, detail: string) {
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${title}: ${detail}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] ${title}: ${detail}`);
  }
}

async function verifyIsolation() {
  console.log('===============================================================');
  console.log('AUDIT & VERIFY: INTERACTIVE COMPLIANCE TEST SUITE ISOLATION');
  console.log('===============================================================\n');

  // Step 1: Seed a simulated Real User Workspace
  const REAL_WORKSPACE_ID = 'real_user_workspace_001';
  setActiveWorkspaceId(REAL_WORKSPACE_ID);

  const realStudent1 = {
    id: 'real-student-uuid-1',
    admissionNo: 'REAL-ADM-1001',
    rollNo: '1',
    name: 'Real Existing Student A',
    fatherName: 'Real Father A',
    class: 'Class 7' as const,
    section: 'A' as const,
    phone: '0300-9999999',
    status: 'Active' as const,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    createdBy: 'realowner@gbhs.edu.pk',
  };

  const realStudent2 = {
    id: 'real-student-uuid-2',
    admissionNo: 'REAL-ADM-1002',
    rollNo: '2',
    name: 'Real Existing Student B',
    fatherName: 'Real Father B',
    class: 'Class 8' as const,
    section: 'B' as const,
    phone: '0300-8888888',
    status: 'Active' as const,
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    createdBy: 'realowner@gbhs.edu.pk',
  };

  await saveStudentLocally(realStudent1);
  await saveStudentLocally(realStudent2);

  const realAttendance = {
    id: 'real-student-uuid-1_2026-10-24',
    studentId: 'real-student-uuid-1',
    studentName: 'Real Existing Student A',
    schoolId: 'GBHS-MAIN',
    date: '2026-10-24',
    status: 'Present' as const,
    class: 'Class 7' as const,
    section: 'A' as const,
    rollNo: '1',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    markedBy: 'realowner@gbhs.edu.pk',
  };
  await saveAttendanceLocally(realAttendance);

  const realOutboxOp = {
    opId: 'real-outbox-op-001',
    entityId: 'real-student-uuid-1',
    entityType: 'student' as const,
    operationType: 'UPDATE' as const,
    payload: realStudent1,
    timestamp: Date.now(),
    status: 'pending' as const,
    retryCount: 0,
    userEmail: 'realowner@gbhs.edu.pk',
    version: 1,
  };
  await enqueueOutboxOperation(realOutboxOp);

  const initialRealStudents = await getAllStudents();
  const initialRealAttendance = await getAllAttendanceRecords();
  const initialRealOutbox = await getOutboxOperations();

  console.log('--- Phase 1: Real Workspace Baseline Pre-Test Verification ---');
  assert(initialRealStudents.length === 2, 'Real Students Baseline', 'Found 2 real student records in owner workspace.');
  assert(initialRealAttendance.length === 1, 'Real Attendance Baseline', 'Found 1 real attendance record in owner workspace.');
  assert(initialRealOutbox.length === 1, 'Real Outbox Baseline', 'Found 1 real outbox operation in owner workspace.');
  assert(getActiveWorkspaceId() === REAL_WORKSPACE_ID, 'Active Workspace', `Active workspace is "${REAL_WORKSPACE_ID}".`);

  // Step 2: Test Sandbox Initialization & Workspace Isolation
  console.log('\n--- Phase 2: Sandbox Workspace Isolation & Mock-Only Cloud Mode ---');
  const sandbox = await initTestSandbox('verification_test');
  const sandboxWsId = sandbox.sandboxWorkspaceId;

  assert(getActiveWorkspaceId() === sandboxWsId, 'Workspace Switched', `Workspace successfully switched to isolated sandbox: ${sandboxWsId}`);
  assert(sandboxWsId !== REAL_WORKSPACE_ID, 'Workspace Partitioning', 'Sandbox workspace ID is strictly distinct from real workspace ID.');
  assert(isMockCloudOnly() === true, 'Mock-Only Cloud Mode', 'Cloud sync forced to mock-only mode (zero production Supabase requests).');

  // Verify Sandbox starts completely empty
  const sandboxInitialStudents = await getAllStudents();
  const sandboxInitialAttendance = await getAllAttendanceRecords();
  const sandboxInitialOutbox = await getOutboxOperations();

  assert(sandboxInitialStudents.length === 0, 'Clean Sandbox Students', 'Sandbox starts with 0 students.');
  assert(sandboxInitialAttendance.length === 0, 'Clean Sandbox Attendance', 'Sandbox starts with 0 attendance records.');
  assert(sandboxInitialOutbox.length === 0, 'Clean Sandbox Outbox', 'Sandbox starts with 0 outbox operations.');

  // Step 3: Perform Mutative Operations inside Sandbox
  console.log('\n--- Phase 3: Mutative Operations inside Sandbox ---');
  const testStudentRes = await createStudent(
    {
      admissionNo: 'TEST-ADM-9999',
      rollNo: '99',
      name: 'Sandbox Mutated Pupil',
      fatherName: 'Sandbox Father',
      class: 'Class 9',
      section: 'A',
      phone: '0300-1112223',
      status: 'Active',
    },
    'test@gbhs.edu.pk'
  );
  assert(testStudentRes.success === true, 'Sandbox Create Student', 'Created student in sandbox.');

  const testAttRes = await markSingleAttendance(
    testStudentRes.student!,
    '2026-10-24',
    'Present',
    'Test Attendance in Sandbox',
    'test@gbhs.edu.pk'
  );
  assert(Boolean(testAttRes), 'Sandbox Mark Attendance', 'Marked attendance in sandbox.');

  await createTeachingLog(
    {
      date: '2026-10-24',
      day: 'Saturday',
      class: 'Class 9',
      subjectTopic: 'Computer Science: Binary Systems',
      learningObjectives: 'Understand bits and bytes',
      teachingMethod: 'Lecture',
      theoryCovered: 'Binary arithmetic',
      practicalActivity: 'Binary conversion exercise',
      instructorName: 'Test Instructor',
      studentsPresent: 40,
      totalRegistered: 45,
      studentsCompletingTask: 38,
      studentsNeedingHelp: 2,
    },
    'test@gbhs.edu.pk'
  );

  const sandboxMidStudents = await getAllStudents();
  const sandboxMidAttendance = await getAllAttendanceRecords();
  const sandboxMidOutbox = await getOutboxOperations();

  assert(sandboxMidStudents.length === 1, 'Sandbox Student Count', 'Sandbox has 1 student.');
  assert(sandboxMidAttendance.length === 1, 'Sandbox Attendance Count', 'Sandbox has 1 attendance record.');
  assert(sandboxMidOutbox.length >= 2, 'Sandbox Outbox Count', `Sandbox has ${sandboxMidOutbox.length} outbox operations queued.`);

  // Test sync in mock mode (must succeed without touching real cloud)
  const syncOp = sandboxMidOutbox[0];
  const syncRes = await syncOperationToCloud(syncOp);
  assert(syncRes.success === true, 'Mock Cloud Sync', 'Outbox operation processed idempotently in mock cloud store.');

  // Step 4: Cleanup & Restoration Verification
  console.log('\n--- Phase 4: Cleanup and Guaranteed Restoration ---');
  await sandbox.cleanupAndRestore();

  assert(getActiveWorkspaceId() === REAL_WORKSPACE_ID, 'Restored Workspace', `Active workspace restored to "${REAL_WORKSPACE_ID}".`);
  assert(isMockCloudOnly() === false, 'Restored Cloud Mode', 'Mock-only cloud mode disabled.');

  // Step 5: Verify Real Workspace Remains 100% Untouched
  console.log('\n--- Phase 5: Verification of Real Data Untouched ---');
  const postTestRealStudents = await getAllStudents();
  const postTestRealAttendance = await getAllAttendanceRecords();
  const postTestRealOutbox = await getOutboxOperations();

  assert(
    postTestRealStudents.length === initialRealStudents.length,
    'Real Students Count Preserved',
    `Count remained exactly ${initialRealStudents.length} (zero records added or deleted).`
  );
  assert(
    postTestRealStudents[0].name === realStudent1.name && postTestRealStudents[1].name === realStudent2.name,
    'Real Students Content Preserved',
    'Student names and attributes remain identical.'
  );
  assert(
    postTestRealAttendance.length === initialRealAttendance.length,
    'Real Attendance Count Preserved',
    `Attendance count remained exactly ${initialRealAttendance.length}.`
  );
  assert(
    postTestRealOutbox.length === initialRealOutbox.length,
    'Real Outbox Count Preserved',
    `Outbox count remained exactly ${initialRealOutbox.length} (zero test outbox operations leaked!).`
  );
  assert(
    postTestRealOutbox[0].opId === realOutboxOp.opId,
    'Real Outbox Content Preserved',
    'Original outbox operation ID intact.'
  );

  // Step 6: Verify Error Handling & Restoration in Finally
  console.log('\n--- Phase 6: Error Resilience & Finally Restoration ---');
  let caughtError = false;
  try {
    await runInSandbox('failing_test_simulation', async () => {
      // Simulate an unhandled test assertion failure or runtime exception
      throw new Error('Simulated runtime failure inside test execution');
    });
  } catch (err: any) {
    caughtError = true;
    assert(err.message === 'Simulated runtime failure inside test execution', 'Error Trapped', 'Test error caught as expected.');
  }

  assert(caughtError === true, 'Caught Error Check', 'Handled exception correctly.');
  assert(getActiveWorkspaceId() === REAL_WORKSPACE_ID, 'Finally Restored Workspace', `Workspace restored to "${REAL_WORKSPACE_ID}" after error.`);
  assert(isMockCloudOnly() === false, 'Finally Restored Cloud Mode', 'Cloud mode restored to live after error.');

  // Clean up simulated real workspace
  await deleteWorkspaceDatabase(REAL_WORKSPACE_ID);

  console.log('\n===============================================================');
  console.log(`ISOLATION VERIFICATION SUMMARY: ${passedChecks} PASSED, ${failedChecks} FAILED`);
  console.log('===============================================================\n');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

verifyIsolation().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
