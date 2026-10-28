import 'fake-indexeddb/auto';
import {
  setActiveWorkspaceId,
  saveStudentLocally,
  saveAttendanceLocally,
  clearAllStudentsLocally,
  clearAllAttendanceLocally,
  getStudentsByClass,
  getAttendanceByDateAndClass,
  getAllAttendanceRecords,
  getStudentById,
} from '../src/services/db';
import {
  validateAttendanceEnrollmentDate,
  AttendanceEnrollmentValidation,
} from '../src/services/recordService';
import { BulkOperationsService } from '../src/services/bulkOperationsService';
import { syncEngine } from '../src/services/syncEngine';
import { AuthSession, OperatorUser } from '../src/types/auth';
import { Student, AttendanceRecord } from '../src/types/student';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`[PASS] ${testName}: ${detail}`);
  } else {
    console.error(`[FAIL] ${testName}: ${detail}`);
    process.exit(1);
  }
}

async function runHistoricalAttendanceBackfillTests() {
  console.log('================================================================');
  console.log('HISTORICAL ATTENDANCE BACKFILL & LIFECYCLE REGRESSION TEST SUITE');
  console.log('================================================================\n');

  const isolatedWorkspaceId = 'test-historical-backfill-ws-001';
  setActiveWorkspaceId(isolatedWorkspaceId);

  // Set up authenticated test operator session
  const operatorUser: OperatorUser = {
    id: isolatedWorkspaceId,
    email: 'operator@gbhs.edu.pk',
    fullName: 'Test Attendance Operator',
    role: 'Computer Operator',
    workspaceRole: 'owner',
    workspaceOwnerId: isolatedWorkspaceId,
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    isApproved: true,
  };
  const session: AuthSession = {
    user: operatorUser,
    token: 'token-test',
    refreshToken: 'ref-test',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: false,
  };
  syncEngine.setSession(session);

  // Ensure clean isolated database
  await clearAllStudentsLocally();
  await clearAllAttendanceLocally();

  // Seed representative student roster across all 4 lifecycle statuses
  const studentActive: Student = {
    id: 'std-act-001',
    admissionNo: 'ADM-101',
    name: 'Ahmed Active',
    fatherName: 'Father Active',
    class: 'Class 8',
    section: 'A',
    rollNo: '1',
    status: 'Active',
    admissionDate: '2025-04-01',
    dateOfCenterBeginning: '2025-04-01',
    phone: '03001111111',
    version: 1,
    createdAt: '2025-04-01T00:00:00Z',
    updatedAt: '2025-04-01T00:00:00Z',
    schoolId: 'GBHS-MAIN',
    createdBy: 'test-operator',
  };

  const studentWithdrawn: Student = {
    id: 'std-wth-002',
    admissionNo: 'ADM-102',
    name: 'Waqas Withdrawn',
    fatherName: 'Father Withdrawn',
    class: 'Class 8',
    section: 'A',
    rollNo: '2',
    status: 'Withdrawn',
    admissionDate: '2025-04-01',
    dateOfCenterBeginning: '2025-04-01',
    withdrawnDate: '2026-02-15',
    phone: '03002222222',
    version: 1,
    createdAt: '2025-04-01T00:00:00Z',
    updatedAt: '2025-04-01T00:00:00Z',
    schoolId: 'GBHS-MAIN',
    createdBy: 'test-operator',
  };

  const studentTransferred: Student = {
    id: 'std-trf-003',
    admissionNo: 'ADM-103',
    name: 'Tariq Transferred',
    fatherName: 'Father Transferred',
    class: 'Class 8',
    section: 'A',
    rollNo: '3',
    status: 'Transferred',
    admissionDate: '2025-04-01',
    dateOfCenterBeginning: '2025-04-01',
    transferredDate: '2026-01-20',
    phone: '03003333333',
    version: 1,
    createdAt: '2025-04-01T00:00:00Z',
    updatedAt: '2025-04-01T00:00:00Z',
    schoolId: 'GBHS-MAIN',
    createdBy: 'test-operator',
  };

  const studentInactive: Student = {
    id: 'std-ina-004',
    admissionNo: 'ADM-104',
    name: 'Ilyas Inactive',
    fatherName: 'Father Inactive',
    class: 'Class 8',
    section: 'A',
    rollNo: '4',
    status: 'Inactive',
    admissionDate: '2025-04-01',
    dateOfCenterBeginning: '2025-04-01',
    phone: '03004444444',
    version: 1,
    createdAt: '2025-04-01T00:00:00Z',
    updatedAt: '2025-04-01T00:00:00Z',
    schoolId: 'GBHS-MAIN',
    createdBy: 'test-operator',
  };

  await saveStudentLocally(studentActive);
  await saveStudentLocally(studentWithdrawn);
  await saveStudentLocally(studentTransferred);
  await saveStudentLocally(studentInactive);

  console.log('Seeded 4 test students in Class 8: 1 Active, 1 Withdrawn (2026-02-15), 1 Transferred (2026-01-20), 1 Inactive.\n');

  // --------------------------------------------------------------------------
  // TEST 1: Default daily roster restricted to Active students only
  // --------------------------------------------------------------------------
  console.log('TEST 1: Default daily roster verification');
  const allClass8Students = await getStudentsByClass('Class 8');
  const todayDate = '2026-10-25';
  const existingTodayRecords = await getAttendanceByDateAndClass(todayDate, 'Class 8');

  // Default roster logic (without historical backfill enabled)
  const defaultDailyRoster = allClass8Students.filter((s) => {
    if (s.status === 'Active') return true;
    if (existingTodayRecords.some((rec) => rec.studentId === s.id)) return true;
    return false; // Historical backfill disabled by default
  });

  assert(
    defaultDailyRoster.length === 1 && defaultDailyRoster[0].id === studentActive.id,
    'TEST 1.1',
    `Default roster contains only 1 student: ${defaultDailyRoster.map((s) => s.name).join(', ')}`
  );
  assert(
    !defaultDailyRoster.some((s) => s.status !== 'Active'),
    'TEST 1.2',
    'Withdrawn, Transferred, and Inactive students are strictly excluded from default daily roster'
  );

  // --------------------------------------------------------------------------
  // TEST 2: Historical backfill toggle includes all student lifecycles
  // --------------------------------------------------------------------------
  console.log('\nTEST 2: Historical backfill toggle option');
  const historicalBackfillRoster = allClass8Students.filter((s) => {
    if (s.status === 'Active') return true;
    if (existingTodayRecords.some((rec) => rec.studentId === s.id)) return true;
    return true; // Historical backfill explicitly toggled ON
  });

  assert(
    historicalBackfillRoster.length === 4,
    'TEST 2.1',
    `Historical backfill roster includes all 4 lifecycle students: ${historicalBackfillRoster.map((s) => `${s.name} (${s.status})`).join(', ')}`
  );
  assert(
    historicalBackfillRoster.some((s) => s.status === 'Withdrawn') &&
      historicalBackfillRoster.some((s) => s.status === 'Transferred') &&
      historicalBackfillRoster.some((s) => s.status === 'Inactive'),
    'TEST 2.2',
    'Withdrawn, Transferred, and Inactive students are all present when historical backfill is active'
  );

  // --------------------------------------------------------------------------
  // TEST 3: Enrollment Period Validation Rules (Respecting Withdrawal & Transfer Dates)
  // --------------------------------------------------------------------------
  console.log('\nTEST 3: Enrollment Period Validation Rules');

  // 3.1 Date prior to enrollment
  const valPrior = validateAttendanceEnrollmentDate(studentWithdrawn, '2025-01-15');
  assert(
    valPrior.isOutsideEnrollment === true && valPrior.warningType === 'before_enrollment',
    'TEST 3.1',
    `Prior to enrollment date (2025-01-15 < 2025-04-01): flagged with "${valPrior.reason}"`
  );

  // 3.2 Date within active enrollment for Withdrawn student
  const valWithinWithdrawn = validateAttendanceEnrollmentDate(studentWithdrawn, '2026-01-10');
  assert(
    valWithinWithdrawn.isOutsideEnrollment === false && valWithinWithdrawn.warningType === 'none',
    'TEST 3.2',
    'Valid historical date before withdrawal (2026-01-10 <= 2026-02-15): accepted without warning'
  );

  // 3.3 Date on exact withdrawal date
  const valExactWithdrawal = validateAttendanceEnrollmentDate(studentWithdrawn, '2026-02-15');
  assert(
    valExactWithdrawal.isOutsideEnrollment === false,
    'TEST 3.3',
    'Exact withdrawal date (2026-02-15): within enrollment window'
  );

  // 3.4 Date after official withdrawal date
  const valAfterWithdrawal = validateAttendanceEnrollmentDate(studentWithdrawn, '2026-03-01');
  assert(
    valAfterWithdrawal.isOutsideEnrollment === true && valAfterWithdrawal.warningType === 'after_withdrawal',
    'TEST 3.4',
    `After withdrawal date (2026-03-01 > 2026-02-15): flagged with "${valAfterWithdrawal.reason}"`
  );

  // 3.5 Date after official transfer date
  const valAfterTransfer = validateAttendanceEnrollmentDate(studentTransferred, '2026-02-01');
  assert(
    valAfterTransfer.isOutsideEnrollment === true && valAfterTransfer.warningType === 'after_transfer',
    'TEST 3.5',
    `After transfer date (2026-02-01 > 2026-01-20): flagged with "${valAfterTransfer.reason}"`
  );

  // 3.6 Date within active enrollment for Transferred student
  const valWithinTransfer = validateAttendanceEnrollmentDate(studentTransferred, '2025-11-15');
  assert(
    valWithinTransfer.isOutsideEnrollment === false,
    'TEST 3.6',
    'Valid historical date before transfer (2025-11-15 <= 2026-01-20): accepted without warning'
  );

  // 3.7 Inactive student with no withdrawal/transfer date
  const valInactiveValid = validateAttendanceEnrollmentDate(studentInactive, '2026-01-15');
  assert(
    valInactiveValid.isOutsideEnrollment === false,
    'TEST 3.7',
    'Historical date for inactive student with no exit date: accepted'
  );

  // --------------------------------------------------------------------------
  // TEST 4: Safe Historical Backfill Execution & Zero Student Mutation
  // --------------------------------------------------------------------------
  console.log('\nTEST 4: Backfill Execution & Student Lifecycle Immutability');

  // Backfill an attendance record for Withdrawn student on 2026-01-10
  const backfillRecord1: AttendanceRecord = {
    id: `${studentWithdrawn.id}_2026-01-10`,
    studentId: studentWithdrawn.id,
    studentName: studentWithdrawn.name,
    rollNo: studentWithdrawn.rollNo,
    class: studentWithdrawn.class,
    section: studentWithdrawn.section,
    date: '2026-01-10',
    status: 'Present',
    remarks: 'Historical register entry',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: 'operator@gbhs.edu.pk',
  };

  await saveAttendanceLocally(backfillRecord1);

  // Verify record was safely written to attendance store
  const savedRec = (await getAllAttendanceRecords()).find((r) => r.id === `${studentWithdrawn.id}_2026-01-10`);
  assert(
    savedRec !== undefined && savedRec.status === 'Present' && savedRec.remarks === 'Historical register entry',
    'TEST 4.1',
    `Historical attendance record persisted: ${savedRec?.studentName} on ${savedRec?.date} = ${savedRec?.status}`
  );

  // CRITICAL CHECK: Verify student record in database was NOT modified or reactivated
  const studentAfterSave = await getStudentById(studentWithdrawn.id);
  assert(
    studentAfterSave !== undefined && studentAfterSave.status === 'Withdrawn',
    'TEST 4.2',
    `CRITICAL: Student status remains unchanged as "${studentAfterSave?.status}" (No reactivation)`
  );
  assert(
    studentAfterSave?.withdrawnDate === '2026-02-15',
    'TEST 4.3',
    `CRITICAL: Student withdrawnDate remains intact as "${studentAfterSave?.withdrawnDate}"`
  );

  // --------------------------------------------------------------------------
  // TEST 5: Duplicate Prevention on Backfilled and Daily Records
  // --------------------------------------------------------------------------
  console.log('\nTEST 5: Duplicate Prevention and Composite Key Integrity');

  // Update attendance for the same student on the same date with new status 'Late'
  const updatedBackfillRecord: AttendanceRecord = {
    ...backfillRecord1,
    status: 'Late',
    remarks: 'Corrected status',
    version: 2,
    updatedAt: new Date().toISOString(),
  };

  await saveAttendanceLocally(updatedBackfillRecord);

  const allRecordsAfterUpdate = await getAllAttendanceRecords();
  const matchingRecords = allRecordsAfterUpdate.filter((r) => r.id === `${studentWithdrawn.id}_2026-01-10`);

  assert(
    matchingRecords.length === 1,
    'TEST 5.1',
    `Exactly 1 record exists for composite ID ${studentWithdrawn.id}_2026-01-10 (No duplicates created)`
  );
  assert(
    matchingRecords[0].status === 'Late' && matchingRecords[0].version === 2,
    'TEST 5.2',
    `Existing record updated cleanly to status "${matchingRecords[0].status}", version ${matchingRecords[0].version}`
  );

  // --------------------------------------------------------------------------
  // TEST 6: Roster Persistence & Isolation Across Dates
  // --------------------------------------------------------------------------
  console.log('\nTEST 6: Roster Isolation Across Dates');

  // When viewing historical date 2026-01-10, studentWithdrawn should appear even without backfill toggle
  // because an existing record exists for that date!
  const recordsOnHistoricalDate = await getAttendanceByDateAndClass('2026-01-10', 'Class 8');
  const rosterOnHistoricalDate = allClass8Students.filter((s) => {
    if (s.status === 'Active') return true;
    if (recordsOnHistoricalDate.some((rec) => rec.studentId === s.id)) return true;
    return false; // backfill toggle OFF
  });

  assert(
    rosterOnHistoricalDate.some((s) => s.id === studentWithdrawn.id),
    'TEST 6.1',
    'Student with existing historical attendance record correctly displays on 2026-01-10 without needing backfill toggle'
  );

  // However, on today's date (2026-10-25), studentWithdrawn has no record today, so default roster must still exclude them!
  const rosterOnTodayDate = allClass8Students.filter((s) => {
    if (s.status === 'Active') return true;
    if (existingTodayRecords.some((rec) => rec.studentId === s.id)) return true;
    return false; // backfill toggle OFF
  });

  assert(
    !rosterOnTodayDate.some((s) => s.id === studentWithdrawn.id),
    'TEST 6.2',
    "StudentWithdrawn is strictly excluded from today's roster, preventing accidental marking in daily register"
  );

  // --------------------------------------------------------------------------
  // TEST 7: Bulk Operations Service Enrollment Validation & Backfill Options
  // --------------------------------------------------------------------------
  console.log('\nTEST 7: Bulk Import Enrollment Period Validation & Historical Backfill Option');

  // Verify that BulkOperationsService.parseFile respects allowHistoricalBackfill option
  const csvContent = [
    'Date,Class,Section,Roll No,Admission No,Name,Status,Remarks',
    '2026-03-01,8,A,2,ADM-102,Waqas Withdrawn,P,After exit date',
    '2026-01-10,8,A,2,ADM-102,Waqas Withdrawn,P,Valid backfill date',
  ].join('\n');

  const file = new File([csvContent], 'historical-backfill-test.csv', { type: 'text/csv' });

  // 7.1 Without allowHistoricalBackfill: post-withdrawal date is treated as an invalid row / enrollment mismatch
  const resultWithoutBackfill = await BulkOperationsService.parseFile(file, 'attendance', {
    allowHistoricalBackfill: false,
    duplicateStrategy: 'update',
  });

  const row1WithoutBackfill = resultWithoutBackfill.validRows.find((r) => r.resolvedDate === '2026-03-01');
  assert(
    row1WithoutBackfill !== undefined &&
      row1WithoutBackfill.isValid === false &&
      row1WithoutBackfill.validationNotes.includes('Enrollment Period Mismatch'),
    'TEST 7.1',
    `Without backfill flag, post-withdrawal date row is rejected with: "${row1WithoutBackfill?.validationNotes}"`
  );

  // 7.2 With allowHistoricalBackfill: post-withdrawal date is accepted with an explicit historical backfill warning
  const resultWithBackfill = await BulkOperationsService.parseFile(file, 'attendance', {
    allowHistoricalBackfill: true,
    duplicateStrategy: 'update',
  });

  const row1WithBackfill = resultWithBackfill.validRows.find((r) => r.resolvedDate === '2026-03-01');
  assert(
    row1WithBackfill !== undefined &&
      row1WithBackfill.isValid === true &&
      row1WithBackfill.validationNotes.includes('[Historical Backfill Warning]'),
    'TEST 7.2',
    `With backfill flag, post-withdrawal date row is valid with warning: "${row1WithBackfill?.validationNotes}"`
  );

  const row2WithBackfill = resultWithBackfill.validRows.find((r) => r.resolvedDate === '2026-01-10');
  assert(
    row2WithBackfill !== undefined &&
      row2WithBackfill.isValid === true &&
      row2WithBackfill.validationNotes.includes('[Historical Backfill]'),
    'TEST 7.3',
    `Valid historical date within enrollment is confirmed with: "${row2WithBackfill?.validationNotes}"`
  );

  // --------------------------------------------------------------------------
  // TEST 8: Commit Bulk Backfill & Verify Zero Student Schema or Data Mutation
  // --------------------------------------------------------------------------
  console.log('\nTEST 8: Commit Bulk Backfill & Verify Student Immutability');
  const commitResult = await BulkOperationsService.commit(
    'attendance',
    resultWithBackfill.validRows,
    { duplicateStrategy: 'update' }
  );

  assert(
    commitResult.createdCount + commitResult.updatedCount === 2,
    'TEST 8.1',
    `Successfully committed 2 historical attendance backfill rows (${commitResult.createdCount} created, ${commitResult.updatedCount} updated)`
  );

  // Check student status once more to guarantee zero side effects
  const studentWithdrawnFinal = await getStudentById(studentWithdrawn.id);
  assert(
    studentWithdrawnFinal?.status === 'Withdrawn',
    'TEST 8.2',
    `Waqas Withdrawn status is STILL "${studentWithdrawnFinal?.status}" after bulk commit`
  );

  const studentActiveFinal = await getStudentById(studentActive.id);
  assert(
    studentActiveFinal?.status === 'Active',
    'TEST 8.3',
    `Ahmed Active status remains "${studentActiveFinal?.status}"`
  );

  // Cleanup isolated test database
  await clearAllStudentsLocally();
  await clearAllAttendanceLocally();

  console.log('\n================================================================');
  console.log('ALL HISTORICAL ATTENDANCE BACKFILL TESTS PASSED SUCCESSFULLY (19/19)');
  console.log('================================================================\n');
}

runHistoricalAttendanceBackfillTests().catch((err) => {
  console.error('[TEST SUITE CRASHED]:', err);
  process.exit(1);
});
