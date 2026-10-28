import 'fake-indexeddb/auto';
import { exportAttendanceToExcel } from '../src/services/excelService';
import {
  setActiveWorkspaceId,
  saveStudentLocally,
  saveAttendanceLocally,
  clearAllStudentsLocally,
  clearAllAttendanceLocally,
  getAllAttendanceRecords,
} from '../src/services/db';
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

async function runAttendanceExportVerification() {
  console.log('================================================================');
  console.log('STARTING ATTENDANCE EXPORT SERVICE TEST SUITE');
  console.log('================================================================\n');

  const workspaceId = 'test-export-ws-001';
  setActiveWorkspaceId(workspaceId);

  // Set up Owner Session
  const ownerUser: OperatorUser = {
    id: workspaceId,
    email: 's.engrimrantareen@gmail.com',
    fullName: 'Engr. Imran Tareen',
    role: 'Computer Operator',
    workspaceRole: 'owner',
    workspaceOwnerId: workspaceId,
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    isApproved: true,
  };
  const ownerSession: AuthSession = {
    user: ownerUser,
    token: 'token-owner',
    refreshToken: 'ref-owner',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: false,
  };
  syncEngine.setSession(ownerSession);

  // Clear workspace
  await clearAllStudentsLocally();
  await clearAllAttendanceLocally();

  // Create Sample Students in Class 7
  const student1: Student = {
    id: 'std-001',
    rollNo: '1',
    name: 'Nadir Ali',
    fatherName: 'Mehrullah',
    class: 'Class 7',
    section: 'A',
    admissionNo: 'GBHS-701',
    status: 'Active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    createdBy: ownerUser.email,
    phone: '03001234567',
  };
  const student2: Student = {
    id: 'std-002',
    rollNo: '2',
    name: 'Muhammad Imran',
    fatherName: 'Abdul Gani',
    class: 'Class 7',
    section: 'A',
    admissionNo: 'GBHS-702',
    status: 'Active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    createdBy: ownerUser.email,
    phone: '03009876543',
  };
  await saveStudentLocally(student1);
  await saveStudentLocally(student2);

  // Add Attendance Records across 3 Dates
  const dates = ['2026-10-18', '2026-10-19', '2026-10-20'];
  const att1: AttendanceRecord = {
    id: 'att-1',
    studentId: student1.id,
    studentName: student1.name,
    rollNo: student1.rollNo,
    class: student1.class,
    section: student1.section,
    date: '2026-10-18',
    status: 'Present',
    remarks: 'On time',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };
  const att2: AttendanceRecord = {
    id: 'att-2',
    studentId: student1.id,
    studentName: student1.name,
    rollNo: student1.rollNo,
    class: student1.class,
    section: student1.section,
    date: '2026-10-19',
    status: 'Absent',
    remarks: 'Sick',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };
  const att3: AttendanceRecord = {
    id: 'att-3',
    studentId: student1.id,
    studentName: student1.name,
    rollNo: student1.rollNo,
    class: student1.class,
    section: student1.section,
    date: '2026-10-20',
    status: 'Present',
    remarks: 'Active lab participation',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };
  const att4: AttendanceRecord = {
    id: 'att-4',
    studentId: student2.id,
    studentName: student2.name,
    rollNo: student2.rollNo,
    class: student2.class,
    section: student2.section,
    date: '2026-10-20',
    status: 'Late',
    remarks: 'Late bus',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };

  await saveAttendanceLocally(att1);
  await saveAttendanceLocally(att2);
  await saveAttendanceLocally(att3);
  await saveAttendanceLocally(att4);

  // --- TEST 1: Owner Export Single Date ---
  console.log('--- Test 1: Owner Export Single Date ---');
  const resSingle = await exportAttendanceToExcel({
    selectedClass: 'Class 7',
    selectedSection: 'A',
    date: '2026-10-20',
    format: 'xlsx',
  });
  assert(resSingle.success === true, '1.1 Owner Single Date Export', `Exported to ${resSingle.filename}`);
  assert(resSingle.count === 2, '1.2 Single Date Record Count', `Exported ${resSingle.count} records for 2026-10-20`);

  // --- TEST 2: Owner Export Date Range Matrix ---
  console.log('\n--- Test 2: Owner Export Date Range Matrix ---');
  const resRange = await exportAttendanceToExcel({
    selectedClass: 'Class 7',
    selectedSection: 'All',
    startDate: '2026-10-18',
    endDate: '2026-10-20',
    format: 'xlsx',
  });
  assert(resRange.success === true, '2.1 Owner Date Range Matrix Export', `Exported to ${resRange.filename}`);
  assert(resRange.count === 4, '2.2 Total Records Count in Range', `Exported ${resRange.count} total records in range`);

  // --- TEST 3: Approved Staff (Read & Export) Access ---
  console.log('\n--- Test 3: Approved Staff Access ---');
  const staffUser: OperatorUser = {
    id: 'staff-999',
    email: 'staff.assistant@gbhs.edu.pk',
    fullName: 'Assistant Teacher',
    role: 'Computer Operator',
    workspaceRole: 'team_member',
    workspaceOwnerId: workspaceId,
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    isApproved: true,
  };
  const staffSession: AuthSession = {
    user: staffUser,
    token: 'token-staff',
    refreshToken: 'ref-staff',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: false,
  };
  syncEngine.setSession(staffSession);

  const resStaff = await exportAttendanceToExcel({
    selectedClass: 'Class 7',
    selectedSection: 'A',
    startDate: '2026-10-18',
    endDate: '2026-10-20',
    format: 'xlsx',
  });
  assert(resStaff.success === true, '3.1 Approved Staff Export Permitted', `Staff exported to ${resStaff.filename}`);

  // --- TEST 4: CSV Export Format ---
  console.log('\n--- Test 4: CSV Format Export ---');
  const resCsv = await exportAttendanceToExcel({
    selectedClass: 'Class 7',
    selectedSection: 'A',
    startDate: '2026-10-18',
    endDate: '2026-10-20',
    format: 'csv',
  });
  assert(resCsv.success === true, '4.1 CSV Export Success', `Exported CSV to ${resCsv.filename}`);

  // --- TEST 5: Unauthorized User Denial ---
  console.log('\n--- Test 5: Unauthorized User Denial ---');
  const unapprovedUser: OperatorUser = {
    id: 'unapproved-111',
    email: 'stranger@gbhs.edu.pk',
    fullName: 'Stranger',
    role: 'Computer Operator',
    workspaceRole: 'team_member',
    workspaceOwnerId: 'different-ws',
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    isApproved: false,
  };
  syncEngine.setSession({
    user: unapprovedUser,
    token: 'token-unapproved',
    refreshToken: 'ref-unapproved',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: false,
  });

  const resDenied = await exportAttendanceToExcel({
    selectedClass: 'Class 7',
  });
  assert(resDenied.success === false, '5.1 Unapproved User Blocked', `Denied with error: ${resDenied.error}`);


  // --- TEST 6: Historical Attendance Export for Inactive and Withdrawn Students ---
  console.log('\n--- Test 6: Historical Attendance Export for Inactive and Withdrawn Students ---');
  // Re-establish owner session
  syncEngine.setSession(ownerSession);

  const lifecycleWs = 'test-export-lifecycle-ws';
  setActiveWorkspaceId(lifecycleWs);
  ownerUser.workspaceOwnerId = lifecycleWs;
  ownerUser.id = lifecycleWs;
  await clearAllStudentsLocally();
  await clearAllAttendanceLocally();

  // Create students with diverse lifecycle statuses
  const stdActive: Student = {
    id: 'std-act-1',
    rollNo: '10',
    name: 'Ali Khan',
    fatherName: 'Akram Khan',
    class: 'Class 8',
    section: 'A',
    admissionNo: 'GBHS-810',
    phone: '03001234567',
    status: 'Active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    createdBy: ownerUser.email,
  };

  const stdWithdrawn: Student = {
    id: 'std-wth-1',
    rollNo: '11',
    name: 'Jameel Ahmed',
    fatherName: 'Noor Ahmed',
    class: 'Class 8',
    section: 'A',
    admissionNo: 'GBHS-811',
    phone: '03001234567',
    status: 'Withdrawn',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    createdBy: ownerUser.email,
  };

  const stdInactive: Student = {
    id: 'std-ina-1',
    rollNo: '12',
    name: 'Bilal Raza',
    fatherName: 'Ghulam Raza',
    class: 'Class 8',
    section: 'A',
    admissionNo: 'GBHS-812',
    phone: '03001234567',
    status: 'Inactive',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    createdBy: ownerUser.email,
  };

  const stdTransferred: Student = {
    id: 'std-trf-1',
    rollNo: '13',
    name: 'Tariq Mehmood',
    fatherName: 'Sultan Mehmood',
    class: 'Class 8',
    section: 'A',
    admissionNo: 'GBHS-813',
    phone: '03001234567',
    status: 'Transferred',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    createdBy: ownerUser.email,
  };

  const stdWithdrawnNoAttendance: Student = {
    id: 'std-wth-no-att',
    rollNo: '14',
    name: 'Zubair Shah',
    fatherName: 'Haider Shah',
    class: 'Class 8',
    section: 'A',
    admissionNo: 'GBHS-814',
    phone: '03001234567',
    status: 'Withdrawn',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    createdBy: ownerUser.email,
  };

  await saveStudentLocally(stdActive);
  await saveStudentLocally(stdWithdrawn);
  await saveStudentLocally(stdInactive);
  await saveStudentLocally(stdTransferred);
  await saveStudentLocally(stdWithdrawnNoAttendance);

  // Attendance records in August 2026
  // 1. Active student attendance
  const recAct: AttendanceRecord = {
    id: 'att-rec-1',
    studentId: stdActive.id,
    studentName: stdActive.name,
    rollNo: stdActive.rollNo,
    class: stdActive.class,
    section: stdActive.section,
    date: '2026-08-10',
    status: 'Present',
    remarks: 'Active student present',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };

  // 2. Withdrawn student attendance BEFORE withdrawal date
  const recWthBefore: AttendanceRecord = {
    id: 'att-rec-2',
    studentId: stdWithdrawn.id,
    studentName: stdWithdrawn.name,
    rollNo: stdWithdrawn.rollNo,
    class: stdWithdrawn.class,
    section: stdWithdrawn.section,
    date: '2026-08-10',
    status: 'Present',
    remarks: 'Historical present before withdrawal',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };

  // 3. Withdrawn student attendance AFTER withdrawal date (e.g. historical audit record)
  const recWthAfter: AttendanceRecord = {
    id: 'att-rec-3',
    studentId: stdWithdrawn.id,
    studentName: stdWithdrawn.name,
    rollNo: stdWithdrawn.rollNo,
    class: stdWithdrawn.class,
    section: stdWithdrawn.section,
    date: '2026-08-25',
    status: 'Absent',
    remarks: 'Historical absent post-withdrawal',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };

  // 4. Inactive student attendance
  const recIna: AttendanceRecord = {
    id: 'att-rec-4',
    studentId: stdInactive.id,
    studentName: stdInactive.name,
    rollNo: stdInactive.rollNo,
    class: stdInactive.class,
    section: stdInactive.section,
    date: '2026-08-10',
    status: 'Late',
    remarks: 'Late bus arrival',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };

  // 5. Transferred student attendance
  const recTrf: AttendanceRecord = {
    id: 'att-rec-5',
    studentId: stdTransferred.id,
    studentName: stdTransferred.name,
    rollNo: stdTransferred.rollNo,
    class: stdTransferred.class,
    section: stdTransferred.section,
    date: '2026-08-10',
    status: 'Leave',
    remarks: 'Authorized leave',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };

  await saveAttendanceLocally(recAct);
  await saveAttendanceLocally(recWthBefore);
  await saveAttendanceLocally(recWthAfter);
  await saveAttendanceLocally(recIna);
  await saveAttendanceLocally(recTrf);

  const resLifecycle = await exportAttendanceToExcel({
    selectedClass: 'Class 8',
    selectedSection: 'A',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    format: 'xlsx',
  });

  assert(resLifecycle.success === true, '6.1 Lifecycle Export Success', `Export completed for Class 8`);
  assert(resLifecycle.count === 5, '6.2 Filtered Attendance Count', `Exported 5 historical records across all statuses`);

  const matrix = resLifecycle.matrixRows || [];
  assert(matrix.length === 4, '6.3 Matrix Student Count', `Matrix contains 4 students (excludes withdrawn student with 0 records)`);

  const aliKhanRow = matrix.find((r) => r['Student Name'] === 'Ali Khan');
  assert(!!aliKhanRow && aliKhanRow['Student Status'] === 'Active', '6.4 Active Student Preserved', `Ali Khan status: ${aliKhanRow?.['Student Status']}`);

  const jameelRow = matrix.find((r) => r['Student Name'] === 'Jameel Ahmed');
  assert(!!jameelRow && jameelRow['Student Status'] === 'Withdrawn', '6.5 Withdrawn Student Preserved', `Jameel Ahmed status: ${jameelRow?.['Student Status']}`);
  assert(jameelRow?.['2026-08-10'] === 'P', '6.6 Withdrawn Record Before Withdrawal', `2026-08-10 status is P`);
  assert(jameelRow?.['2026-08-25'] === 'A', '6.7 Withdrawn Record After Withdrawal', `2026-08-25 status is A`);

  const bilalRow = matrix.find((r) => r['Student Name'] === 'Bilal Raza');
  assert(!!bilalRow && bilalRow['Student Status'] === 'Inactive' && bilalRow?.['2026-08-10'] === 'T', '6.8 Inactive Student Preserved', `Bilal Raza status: ${bilalRow?.['Student Status']}, att: ${bilalRow?.['2026-08-10']}`);

  const tariqRow = matrix.find((r) => r['Student Name'] === 'Tariq Mehmood');
  assert(!!tariqRow && tariqRow['Student Status'] === 'Transferred' && tariqRow?.['2026-08-10'] === 'L', '6.9 Transferred Student Preserved', `Tariq Mehmood status: ${tariqRow?.['Student Status']}, att: ${tariqRow?.['2026-08-10']}`);

  const zubairRow = matrix.find((r) => r['Student Name'] === 'Zubair Shah');
  assert(!zubairRow, '6.10 Withdrawn Student With 0 Records Excluded', `Zubair Shah not added with empty dashes`);

  // Verify Detailed Register Rows
  const register = resLifecycle.registerRows || [];
  assert(register.length === 5, '6.11 Register Rows Count', `Register contains 5 detailed records`);
  const jameelRegBefore = register.find((r) => r['Student Name'] === 'Jameel Ahmed' && r['Date'] === '2026-08-10');
  assert(jameelRegBefore?.['Remarks'] === 'Historical present before withdrawal', '6.12 Register Remarks Preserved', `Remarks: ${jameelRegBefore?.['Remarks']}`);
  assert(jameelRegBefore?.['Student Status'] === 'Withdrawn', '6.13 Register Student Status Preserved', `Student Status: ${jameelRegBefore?.['Student Status']}`);

  // --- TEST 7: Class with 100% Inactive / Withdrawn Students (0 Active Students) ---
  console.log('\n--- Test 7: Export Class with Zero Active Students ---');
  const stdOnlyWithdrawn: Student = {
    id: 'std-c9-wth',
    rollNo: '1',
    name: 'Sole Withdrawn Student',
    fatherName: 'Father',
    class: 'Class 9',
    section: 'A',
    admissionNo: 'GBHS-901',
    phone: '03001234567',
    status: 'Withdrawn',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    createdBy: ownerUser.email,
  };
  await saveStudentLocally(stdOnlyWithdrawn);

  const recC9: AttendanceRecord = {
    id: 'att-c9-1',
    studentId: stdOnlyWithdrawn.id,
    studentName: stdOnlyWithdrawn.name,
    rollNo: stdOnlyWithdrawn.rollNo,
    class: stdOnlyWithdrawn.class,
    section: stdOnlyWithdrawn.section,
    date: '2026-08-15',
    status: 'Present',
    remarks: 'Historical archive entry',
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    markedBy: ownerUser.email,
  };
  await saveAttendanceLocally(recC9);

  const resZeroActive = await exportAttendanceToExcel({
    selectedClass: 'Class 9',
    selectedSection: 'A',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  });
  assert(resZeroActive.success === true, '7.1 Zero Active Students Class Export Success', `Export succeeded without error`);
  assert(resZeroActive.matrixRows?.length === 1, '7.2 Zero Active Class Matrix Count', `Exported 1 historical row for withdrawn student`);

  // --- TEST 8: Empty Date Placeholder Roster Restricted to Active Students ---
  console.log('\n--- Test 8: Empty Date Placeholder Roster Restricted to Active Students ---');
  const resEmptyDate = await exportAttendanceToExcel({
    selectedClass: 'Class 8',
    selectedSection: 'A',
    date: '2026-12-01', // Date with no attendance records
  });
  assert(resEmptyDate.success === true, '8.1 Empty Date Export Success', `Export succeeded for date with 0 records`);
  const placeholderRegister = resEmptyDate.registerRows || [];
  assert(placeholderRegister.length === 1, '8.2 Placeholder Register Count', `Only 1 placeholder created (for Active student)`);
  assert(placeholderRegister[0]['Student Name'] === 'Ali Khan', '8.3 Placeholder Is Active Student Only', `Placeholder name: ${placeholderRegister[0]['Student Name']}`);
  assert(placeholderRegister[0]['Status'] === 'Unmarked', '8.4 Placeholder Status Is Unmarked', `Status: ${placeholderRegister[0]['Status']}`);

  // --- TEST 9: Strictly Read-Only Verification (No Create, Update, or Delete) ---
  console.log('\n--- Test 9: Strictly Read-Only Verification ---');
  const recordsBefore = await getAllAttendanceRecords();
  const snapshotBefore = JSON.stringify(recordsBefore);

  // Perform multiple exports
  await exportAttendanceToExcel({ selectedClass: 'Class 8', selectedSection: 'A', format: 'xlsx' });
  await exportAttendanceToExcel({ selectedClass: 'Class 8', selectedSection: 'A', format: 'csv' });
  await exportAttendanceToExcel({ selectedClass: 'Class 9', format: 'xlsx' });
  await exportAttendanceToExcel({ selectedClass: 'Class 8', date: '2026-12-01' });

  const recordsAfter = await getAllAttendanceRecords();
  const snapshotAfter = JSON.stringify(recordsAfter);

  assert(recordsBefore.length === recordsAfter.length, '9.1 Record Count Unchanged', `Records before: ${recordsBefore.length}, after: ${recordsAfter.length}`);
  assert(snapshotBefore === snapshotAfter, '9.2 Database Records Perfectly Preserved', `Attendance database suffered 0 creations, updates, or deletions`);

  console.log('\n================================================================');
  console.log('ALL ATTENDANCE EXPORT SERVICE TESTS PASSED!');
  console.log('================================================================\n');
}

runAttendanceExportVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
