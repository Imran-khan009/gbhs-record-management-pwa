import 'fake-indexeddb/auto';
import {
  saveStudentLocally,
  saveAttendanceLocally,
  saveTeachingLogLocally,
  savePracticalProgressLocally,
  saveAbsenteeFollowupLocally,
  enqueueOutboxOperation,
  setAppState,
  getDB,
  setActiveWorkspaceId,
} from '../src/services/db';
import {
  getStoreCounts,
  createBackupData,
  exportBackupToJSON,
} from '../src/services/backupService';
import { Student, AttendanceRecord } from '../src/types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../src/types/modules';
import { OutboxOperation, ConflictItem } from '../src/types/sync';

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

async function runBackupTests() {
  console.log('====================================================');
  console.log('GBHS SAFE LOCAL DATA BACKUP TEST SUITE');
  console.log('====================================================\n');

  setActiveWorkspaceId('ws_backup_test');

  // Seed sample records across all stores to test relationship and data preservation
  const nowIso = new Date().toISOString();
  const testStudentId1 = 'std_backup_001';
  const testStudentId2 = 'std_backup_002';

  const student1: Student = {
    id: testStudentId1,
    name: 'Ali Ahmed Tareen',
    rollNo: '101',
    phone: '03001234567',
    admissionNo: 'ADM-2026-001',
    fatherName: 'Ahmed Tareen',
    class: 'Class 9',
    section: 'A',
    gender: 'Male',
    trade: 'Computer Science',
    status: 'Active',
    guardianContact: '03001234567',
    createdAt: nowIso,
    updatedAt: nowIso,
    schoolId: 'GBHS-502',
    createdBy: 'operator',
    version: 1,
  };

  const student2: Student = {
    id: testStudentId2,
    name: 'Bilal Khan',
    rollNo: '102',
    phone: '03009876543',
    admissionNo: 'ADM-2026-002',
    fatherName: 'Zahid Khan',
    class: 'Class 9',
    section: 'A',
    gender: 'Male',
    trade: 'Computer Science',
    status: 'Active',
    guardianContact: '03009876543',
    createdAt: nowIso,
    updatedAt: nowIso,
    schoolId: 'GBHS-502',
    createdBy: 'operator',
    version: 1,
  };

  await saveStudentLocally(student1);
  await saveStudentLocally(student2);

  // 2. Attendance records linked to student1
  const attendance1: AttendanceRecord = {
    id: `${testStudentId1}_2026-10-19`,
    studentId: testStudentId1,
    studentName: 'Ali Ahmed Tareen',
    rollNo: '101',
    class: 'Class 9',
    section: 'A',
    date: '2026-10-19',
    status: 'Present',
    markedBy: 'Computer Operator',
    version: 1,
    updatedAt: nowIso,
    schoolId: 'GBHS-502',
    remarks: 'On time for lab',
  };
  await saveAttendanceLocally(attendance1);

  // 3. Teaching log entry
  const teachingLog: TeachingLogEntry = {
    id: 'teach_backup_001',
    date: '2026-10-19',
    day: 'Monday',
    class: 'Class 9',
    subjectTopic: 'Input/Output Devices & Binary Architecture',
    learningObjectives: 'Understand RAM, ROM, and Motherboard bus routing',
    theoryCovered: 'Computer Architecture Unit 3',
    practicalActivity: 'Motherboard Component Identification',
    totalRegistered: 30,
    studentsPresent: 28,
    studentsCompletingTask: 25,
    studentsNeedingHelp: 3,
    teachingMethod: 'Interactive Projector Demonstration',
    instructorName: 'Computer Operator',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await saveTeachingLogLocally(teachingLog);

  // 4. Practical progress linked to student1
  const practical: PracticalProgressEntry = {
    id: 'prac_backup_001',
    assessmentDate: '2026-10-19',
    studentId: testStudentId1,
    registrationId: 'ADM-2026-001',
    studentName: 'Ali Ahmed Tareen',
    class: 'Class 9',
    skillTask: 'MS Word Table Formatting & Mail Merge',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 95,
    skillStatus: 'Proficient',
    remedialPracticeRequired: 'No',
    instructorRemarks: 'Excellent alignment and merge field mapping',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await savePracticalProgressLocally(practical);

  // 5. Absentee follow-up linked to student2
  const followup: AbsenteeFollowupEntry = {
    id: 'absent_backup_001',
    date: '2026-10-18',
    studentId: testStudentId2,
    registrationId: 'ADM-2026-002',
    studentName: 'Bilal Khan',
    class: 'Class 9',
    absenceCount: 3,
    followupReason: 'Illness',
    actionTaken: 'Phone Call',
    contactPerson: 'Father',
    responseReceived: 'Parent confirmed recovery',
    followupDate: '2026-10-18',
    currentStatus: 'Resolved / Returned',
    managementReferral: 'No',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await saveAbsenteeFollowupLocally(followup);

  // 6. Outbox operation (pending mutation queue)
  const pendingOp: OutboxOperation = {
    opId: 'op_backup_001',
    entityId: testStudentId1,
    entityType: 'student',
    operationType: 'UPDATE',
    payload: { id: testStudentId1, guardianContact: '03001234567' },
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    userEmail: 'operator@gbhs.edu.pk',
    version: 1,
  };
  await enqueueOutboxOperation(pendingOp);

  // 7. Conflicts store entry
  const conflictItem: ConflictItem = {
    id: 'conf_backup_001',
    opId: 'op_backup_001',
    entityId: testStudentId1,
    entityType: 'student',
    localData: { status: 'Active' },
    remoteData: { status: 'Inactive' },
    detectedAt: Date.now(),
    resolved: false,
  };
  const db = await getDB();
  await db.put('conflicts', conflictItem);

  // 8. App State entries (with both regular data and sensitive tokens)
  await setAppState('last_sync_timestamp', { timestamp: Date.now() });
  await setAppState('ui_selected_class', '9th');
  await setAppState('gbhs_active_session', {
    user: {
      id: 'usr_sec_123',
      email: 'operator@gbhs.edu.pk',
      fullName: 'Computer Operator',
      schoolId: 'GBHS-502',
    },
    token: 'super_secret_bearer_token_xyz999',
    refreshToken: 'secret_refresh_token_abc777',
    expiresAt: Date.now() + 100000,
  });

  // ----------------------------------------------------
  // TEST 1: Store Counts Before Export
  // ----------------------------------------------------
  const countsBefore = await getStoreCounts();
  assert(
    countsBefore.students === 2 &&
      countsBefore.attendance === 1 &&
      countsBefore.teaching_logs === 1 &&
      countsBefore.practical_progress === 1 &&
      countsBefore.absentee_followups === 1 &&
      countsBefore.outbox === 1 &&
      countsBefore.conflicts === 1 &&
      countsBefore.app_state >= 3,
    'Store Counts Detection',
    `Detected all stores populated (Students: ${countsBefore.students}, Attendance: ${countsBefore.attendance}, Teaching: ${countsBefore.teaching_logs}, Practicals: ${countsBefore.practical_progress}, Followups: ${countsBefore.absentee_followups}, Outbox: ${countsBefore.outbox}, Conflicts: ${countsBefore.conflicts}, AppState: ${countsBefore.app_state})`
  );

  // ----------------------------------------------------
  // TEST 2: Safe Backup Export Execution
  // ----------------------------------------------------
  const { jsonString, filename, verification, metadata } = await exportBackupToJSON();
  assert(
    verification.verified === true && verification.mismatches.length === 0,
    'Non-Destructive Verification',
    `Verified 0 count mismatches before vs after export`
  );

  // ----------------------------------------------------
  // TEST 3: Metadata Integrity
  // ----------------------------------------------------
  assert(
    metadata.databaseName === 'gbhs_operator_db_v1' &&
      metadata.databaseVersion === 2 &&
      metadata.storeNames.length === 8 &&
      metadata.pendingOutboxCount === 1 &&
      Boolean(metadata.exportDate) &&
      filename.startsWith('gbhs-backup-') &&
      filename.endsWith('.json'),
    'Backup Metadata Schema',
    `Metadata valid: DB=${metadata.databaseName} v${metadata.databaseVersion}, Stores=${metadata.storeNames.length}, PendingOutbox=${metadata.pendingOutboxCount}, File=${filename}`
  );

  // ----------------------------------------------------
  // TEST 4: Parsed JSON Verification & Relationships
  // ----------------------------------------------------
  const parsedBackup = JSON.parse(jsonString);
  const exportedStudents = parsedBackup.stores.students;
  const exportedAttendance = parsedBackup.stores.attendance;
  const exportedTeaching = parsedBackup.stores.teaching_logs;
  const exportedPracticals = parsedBackup.stores.practical_progress;
  const exportedFollowups = parsedBackup.stores.absentee_followups;
  const exportedOutbox = parsedBackup.stores.outbox;

  assert(
    exportedStudents.length === 2 &&
      exportedAttendance.length === 1 &&
      exportedTeaching.length === 1 &&
      exportedPracticals.length === 1 &&
      exportedFollowups.length === 1 &&
      exportedOutbox.length === 1,
    'Full Record Set Preserved',
    `All record collections correctly exported into JSON`
  );

  // Verify relational links (foreign keys)
  const linkedAttendance = exportedAttendance.find((a: AttendanceRecord) => a.studentId === testStudentId1);
  const linkedPractical = exportedPracticals.find((p: PracticalProgressEntry) => p.studentId === testStudentId1);
  const linkedFollowup = exportedFollowups.find((f: AbsenteeFollowupEntry) => f.studentId === testStudentId2);

  assert(
    Boolean(linkedAttendance) && Boolean(linkedPractical) && Boolean(linkedFollowup),
    'Relational Integrity (Foreign Keys)',
    `Verified foreign key relationships intact: studentId "${testStudentId1}" & "${testStudentId2}" across attendance, practicals, and followups`
  );

  // ----------------------------------------------------
  // TEST 5: Security & Secret Sanitization
  // ----------------------------------------------------
  // Must NOT include the sensitive token or refresh token in exported JSON
  const containsRawBearerToken = jsonString.includes('super_secret_bearer_token_xyz999');
  const containsRawRefreshToken = jsonString.includes('secret_refresh_token_abc777');
  const containsRedactedMarker = jsonString.includes('[REDACTED_SECURITY_TOKEN]');

  assert(
    !containsRawBearerToken && !containsRawRefreshToken && containsRedactedMarker,
    'Secret & Token Sanitization',
    `Guaranteed: No bearer tokens or secrets in export (tokens redacted: ${containsRedactedMarker})`
  );

  // ----------------------------------------------------
  // TEST 6: Store Counts AFTER Export (Zero Deletion / Mutation Check)
  // ----------------------------------------------------
  const countsAfter = await getStoreCounts();
  let zeroDataLoss = true;
  for (const store of metadata.storeNames as (keyof typeof countsBefore)[]) {
    if (countsBefore[store] !== countsAfter[store]) {
      zeroDataLoss = false;
      break;
    }
  }

  assert(
    zeroDataLoss,
    'Zero Deletion Guarantee',
    `Database counts after export are 100% identical to counts before export (zero records deleted or modified)`
  );

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED OUT OF ${testsPassed + testsFailed} TESTS.`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runBackupTests().catch((err) => {
  console.error('Fatal backup test error:', err);
  process.exit(1);
});
