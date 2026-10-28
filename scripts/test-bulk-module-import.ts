import 'fake-indexeddb/auto';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      onLine: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    configurable: true,
    writable: true,
  });
} catch {}

const listeners = new Map<string, Function[]>();
(globalThis as any).window = {
  addEventListener: (event: string, fn: Function) => {
    const list = listeners.get(event) || [];
    list.push(fn);
    listeners.set(event, list);
  },
  removeEventListener: (event: string, fn: Function) => {
    const list = listeners.get(event) || [];
    listeners.set(event, list.filter((f) => f !== fn));
  },
  matchMedia: () => ({ matches: false }),
};

import * as XLSX from 'xlsx';
import {
  generateModuleTemplateWorkbook,
  parseModuleImportFile,
  commitModuleImportRows,
  parseFlexibleDate,
  normalizeAttendanceStatus,
  normalizeSkillStatus,
  normalizePracticalCompleted,
  normalizeFollowupStatus,
} from '../src/services/bulkModuleImportService';
import {
  bulkSaveStudentsLocally,
  getAllStudents,
  clearAllStudentsLocally,
  getAllAttendanceRecords,
  getOutboxOperations,
  setActiveWorkspaceId,
} from '../src/services/db';
import {
  fetchTeachingLogs,
  fetchPracticalProgress,
  fetchAbsenteeFollowups,
  clearAllModulesMockData,
} from '../src/services/modulesService';
import { Student } from '../src/types/student';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(suite: string, name: string, condition: boolean, message: string) {
  results.push({ suite, name, passed: condition, message });
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`[${status}] [${suite}] ${name}: ${message}`);
  if (!condition) {
    console.error(`  --> ASSERTION FAILED: ${message}`);
  }
}

function workbookToFile(wb: XLSX.WorkBook, filename: string): File {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return new File([blob], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function csvTextToFile(csvText: string, filename: string): File {
  const blob = new Blob([csvText], { type: 'text/csv' });
  return new File([blob], filename, { type: 'text/csv' });
}

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING TEST SUITE: Bulk Module Import Service');
  console.log('====================================================\n');

  // SETUP: Seed isolated test students
  setActiveWorkspaceId('test-bulk-import-ws');
  await clearAllStudentsLocally();
  await clearAllModulesMockData();

  const testStudents: Student[] = [
    {
      id: 'mock-stu-1',
      rollNo: '101',
      admissionNo: 'ADM-001',
      name: 'Ahmed Ali',
      fatherName: 'Muhammad Ali',
      class: 'Class 7',
      section: 'A',
      phone: '03001234567',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-operator@gbhs.edu.pk',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mock-stu-2',
      rollNo: '102',
      admissionNo: 'ADM-002',
      name: 'Bilal Khan',
      fatherName: 'Tariq Khan',
      class: 'Class 8',
      section: 'B',
      phone: '03007654321',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-operator@gbhs.edu.pk',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mock-stu-3',
      rollNo: '103',
      admissionNo: 'ADM-003',
      name: 'Usman Ghani',
      fatherName: 'Ghani Rehman',
      class: 'Class 9',
      section: 'A',
      phone: '03009876543',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-operator@gbhs.edu.pk',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  await bulkSaveStudentsLocally(testStudents);
  const loadedStudents = await getAllStudents();
  assert('Setup', 'Seed Isolated Students', loadedStudents.length === 3, `Expected 3 test students, found ${loadedStudents.length}`);

  // 1. TEMPLATE GENERATION
  console.log('\n--- 1. Template Generation Tests ---');
  for (const mod of ['attendance', 'teaching_log', 'practical', 'absentee'] as const) {
    const wb = generateModuleTemplateWorkbook(mod);
    assert('Templates', `Generate ${mod} template`, Boolean(wb && wb.SheetNames.length >= 1), `Generated workbook with sheets: ${wb.SheetNames.join(', ')}`);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);
    assert('Templates', `${mod} contains sample rows`, rows.length >= 1, `Sheet rows count: ${rows.length}`);
    const firstRowStr = JSON.stringify(rows[0]);
    assert('Templates', `${mod} contains EXAMPLE row marker`, firstRowStr.includes('[EXAMPLE ROW'), `Row marker found in ${firstRowStr.slice(0, 50)}...`);
  }

  // 2. NORMALIZERS
  console.log('\n--- 2. Type & Date Normalizers ---');
  assert('Normalizers', 'YYYY-MM-DD date', parseFlexibleDate('2026-10-15') === '2026-10-15', 'Valid ISO date preserved');
  assert('Normalizers', 'DD/MM/YYYY date', parseFlexibleDate('15/10/2026') === '2026-10-15', 'Converted UK slash date to ISO');
  assert('Normalizers', 'DD-MM-YYYY date', parseFlexibleDate('15-10-2026') === '2026-10-15', 'Converted hyphen date to ISO');
  assert('Normalizers', 'Excel serial date', parseFlexibleDate(46310) !== null, 'Handled Excel numeric serial date');
  assert('Normalizers', 'Invalid date rejected', parseFlexibleDate('invalid-date') === null, 'Rejected invalid date string');

  assert('Normalizers', 'Attendance: Present (P/present)', normalizeAttendanceStatus('P') === 'Present' && normalizeAttendanceStatus('present') === 'Present', 'P/present mapped to Present');
  assert('Normalizers', 'Attendance: Absent (A/absent)', normalizeAttendanceStatus('A') === 'Absent' && normalizeAttendanceStatus('absent') === 'Absent', 'A/absent mapped to Absent');
  assert('Normalizers', 'Attendance: Late (T/LT/Late)', normalizeAttendanceStatus('T') === 'Late' && normalizeAttendanceStatus('LT') === 'Late' && normalizeAttendanceStatus('Late') === 'Late', 'T, LT, Late mapped to Late');
  assert('Normalizers', 'Attendance: Leave (Lv/Leave)', normalizeAttendanceStatus('Lv') === 'Leave' && normalizeAttendanceStatus('Leave') === 'Leave', 'Lv and Leave mapped to Leave');
  assert('Normalizers', 'Attendance: Ambiguous L rejected without context', normalizeAttendanceStatus('L') === null, 'Ambiguous L rejected without context');
  assert('Normalizers', 'Attendance: Official workbook L is Late', normalizeAttendanceStatus('L', { templateFormat: 'official' }) === 'Late', 'Official template L mapped to Late');
  assert('Normalizers', 'Attendance: Standard template L is Leave', normalizeAttendanceStatus('L', { lMeaning: 'Leave' }) === 'Leave', 'Standard template L mapped to Leave');

  assert('Normalizers', 'Skill: Proficient', normalizeSkillStatus('proficient') === 'Proficient', 'proficient normalized');
  assert('Normalizers', 'Skill: Competent', normalizeSkillStatus('Pass') === 'Competent', 'Pass mapped to Competent');
  assert('Normalizers', 'Practical Completed: Yes', normalizePracticalCompleted('done') === 'Yes', 'done mapped to Yes');
  assert('Normalizers', 'Followup Status: Pending', normalizeFollowupStatus('pending') === 'Pending Return', 'pending mapped to Pending Return');

  // 3. ATTENDANCE BULK IMPORT: MATCHING & VALIDATION
  console.log('\n--- 3. Attendance Bulk Import Parsing ---');
  const attWb = XLSX.utils.book_new();
  const attData = [
    {
      'Date': '2026-10-22',
      'Class': 'Class 7',
      'Admission No': 'ADM-001',
      'Roll No': '101',
      'Student Name': 'Ahmed Ali',
      'Attendance Status': 'Present',
      'Remarks': 'On time',
    },
    {
      'Date': '2026-10-22',
      'Class': 'Class 8',
      'Admission No': 'ADM-002',
      'Roll No': '102',
      'Student Name': 'Bilal Khan',
      'Attendance Status': 'Absent',
      'Remarks': 'Uninformed',
    },
    {
      // Unknown student row: must be unmatched and MUST NOT create dummy student
      'Date': '2026-10-22',
      'Class': 'Class 7',
      'Admission No': 'UNKNOWN-999',
      'Roll No': '999',
      'Student Name': 'Ghost Student',
      'Attendance Status': 'Present',
      'Remarks': 'Should not exist',
    },
    {
      // Unknown student with invalid date: genuine structural error -> MUST be invalid, NOT unmatched
      'Date': 'not-a-date',
      'Class': 'Class 7',
      'Admission No': 'UNKNOWN-888',
      'Roll No': '888',
      'Student Name': 'Invalid Date Student',
      'Attendance Status': 'Present',
      'Remarks': 'Bad date row',
    },
    {
      // Missing student identity: no Name, Roll, or Admission -> MUST be invalid
      'Date': '2026-10-22',
      'Class': 'Class 7',
      'Admission No': '',
      'Roll No': '',
      'Student Name': '',
      'Attendance Status': 'Present',
      'Remarks': 'Missing identity',
    },
  ];
  const attSheet = XLSX.utils.json_to_sheet(attData);
  XLSX.utils.book_append_sheet(attWb, attSheet, 'Attendance');
  const attFile = workbookToFile(attWb, 'attendance_test.xlsx');

  const parsedAtt = await parseModuleImportFile(attFile, 'attendance');
  assert('Import Parsing', 'Attendance Rows Parsed', parsedAtt.validRows.length === 5, `Expected 5 rows, got ${parsedAtt.validRows.length}`);
  assert('Import Parsing', 'Valid row 1 matched', parsedAtt.validRows[0].status === 'valid' && parsedAtt.validRows[0].matchedStudent?.id === 'mock-stu-1', 'Row 1 resolved to mock-stu-1');
  assert('Import Parsing', 'Valid row 2 matched', parsedAtt.validRows[1].status === 'valid' && parsedAtt.validRows[1].matchedStudent?.id === 'mock-stu-2', 'Row 2 resolved to mock-stu-2');
  assert('Import Parsing', 'Unmatched row 3 identified', parsedAtt.validRows[2].status === 'unmatched', `Row 3 status is ${parsedAtt.validRows[2].status}`);
  assert('Import Parsing', 'Unmatched count is 1', parsedAtt.unmatchedCount === 1, `Unmatched count: ${parsedAtt.unmatchedCount}`);
  assert('Import Parsing', 'Invalid count is 2', parsedAtt.invalidCount === 2, `Invalid count: ${parsedAtt.invalidCount}`);
  assert('Import Parsing', 'Unmatched preview message identifies unknown student', parsedAtt.validRows[2].errors[0].includes('No existing student found in Class 7 for Roll No "999"'), 'Preview error accurately identifies missing student');
  assert('Import Parsing', 'Row 4 with invalid date classified as invalid', parsedAtt.validRows[3].status === 'invalid', 'Row 4 is invalid');
  assert('Import Parsing', 'Row 4 contains date error and student reason', parsedAtt.validRows[3].errors.some((e) => e.includes('Invalid or missing date')), 'Row 4 has date error');
  assert('Import Parsing', 'Row 5 with missing identity classified as invalid', parsedAtt.validRows[4].status === 'invalid', 'Row 5 is invalid');

  // Commit valid attendance rows
  const commitRes = await commitModuleImportRows(
    'attendance',
    parsedAtt.validRows,
    'skip',
    'test-operator@gbhs.edu.pk'
  );
  assert('Commit', 'Attendance committed count', commitRes.createdCount === 2, `Expected 2 created, got ${commitRes.createdCount}`);
  assert('Commit', 'Attendance unmatched count', commitRes.unmatchedCount === 1, `Expected 1 unmatched, got ${commitRes.unmatchedCount}`);
  assert('Commit', 'Attendance invalid count', commitRes.invalidCount === 2, `Expected 2 invalid, got ${commitRes.invalidCount}`);

  // Safety check: verify no placeholder student was created
  const studentsAfter = await getAllStudents();
  assert('Safety', 'Never create placeholder students', studentsAfter.length === 3, `Student count remained 3; no dummy students created`);

  // Verify attendance records in IndexedDB
  const attRecords = await getAllAttendanceRecords();
  assert('Persistence', 'Attendance records in IndexedDB', attRecords.length === 2, `Expected 2 attendance records in IndexedDB, got ${attRecords.length}`);
  const ahmedRecord = attRecords.find((r) => r.studentId === 'mock-stu-1');
  assert('Persistence', 'Ahmed Ali attendance status', ahmedRecord?.status === 'Present' && ahmedRecord?.date === '2026-10-22', 'Ahmed is Present on 2026-10-22');

  // 4. DUPLICATE DETECTION & HANDLING
  console.log('\n--- 4. Duplicate Detection & Handling ---');
  // Re-parse the exact same file
  const reParsed = await parseModuleImportFile(attFile, 'attendance');
  assert('Duplicates', 'Duplicate row detected on re-parse', reParsed.validRows[0].isDuplicate === true, 'Row 1 flagged as duplicate');

  // Test duplicate strategy: 'skip'
  const skipCommit = await commitModuleImportRows('attendance', reParsed.validRows, 'skip');
  assert('Duplicates', 'Strategy "skip" increments skippedCount', skipCommit.skippedCount === 2 && skipCommit.createdCount === 0, `Skipped: ${skipCommit.skippedCount}, Created: ${skipCommit.createdCount}`);

  // Test duplicate strategy: 'update' (change status to Late and update remarks)
  reParsed.validRows[0].data['Status (Present/Absent/Leave/Late)*'] = 'Late';
  reParsed.validRows[0].data['attendance status'] = 'Late';
  reParsed.validRows[0].data['attendancestatus'] = 'Late';
  reParsed.validRows[0].data['Remarks'] = 'Bus breakdown: arrived 25 mins late';
  reParsed.validRows[0].data['remarks'] = 'Bus breakdown: arrived 25 mins late';
  reParsed.validRows[0].duplicateAction = 'update';
  const updateCommit = await commitModuleImportRows('attendance', [reParsed.validRows[0]], 'update');
  assert('Duplicates', 'Strategy "update" increments updatedCount', updateCommit.updatedCount === 1, `Updated: ${updateCommit.updatedCount}`);
  const updatedRecords = await getAllAttendanceRecords();
  const ahmedUpdated = updatedRecords.find((r) => r.studentId === 'mock-stu-1');
  assert('Duplicates', 'Record updated faithfully: status is Late', ahmedUpdated?.status === 'Late', `Ahmed updated status is ${ahmedUpdated?.status}`);
  assert('Duplicates', 'Record updated faithfully: remarks updated', ahmedUpdated?.remarks === 'Bus breakdown: arrived 25 mins late', `Ahmed remarks: ${ahmedUpdated?.remarks}`);
  assert('Duplicates', 'Student ID preserved on duplicate update', ahmedUpdated?.studentId === 'mock-stu-1', 'Student ID preserved');
  assert('Duplicates', 'Date preserved on duplicate update', ahmedUpdated?.date === '2026-10-22', 'Date preserved');
  assert('Duplicates', 'Version incremented on duplicate update', (ahmedUpdated?.version || 1) >= 2, `Version is ${ahmedUpdated?.version}`);
  assert('Duplicates', 'Workspace ownership preserved on duplicate update', ahmedUpdated?.owner_id === 'test-bulk-import-ws', `Owner ID: ${ahmedUpdated?.owner_id}`);

  // Second duplicate update: change Bilal from Absent to Leave with new remarks
  reParsed.validRows[1].data['attendancestatus'] = 'Leave';
  reParsed.validRows[1].data['Remarks'] = 'Approved sick leave';
  reParsed.validRows[1].duplicateAction = 'update';
  const updateCommit2 = await commitModuleImportRows('attendance', [reParsed.validRows[1]], 'update');
  assert('Duplicates', 'Second record updated count', updateCommit2.updatedCount === 1, 'Updated Bilal');
  const recordsAfterSecond = await getAllAttendanceRecords();
  const bilalUpdated = recordsAfterSecond.find((r) => r.studentId === 'mock-stu-2');
  assert('Duplicates', 'Bilal updated faithfully to Leave', bilalUpdated?.status === 'Leave', `Bilal status: ${bilalUpdated?.status}`);
  assert('Duplicates', 'Bilal remarks updated to Approved sick leave', bilalUpdated?.remarks === 'Approved sick leave', `Bilal remarks: ${bilalUpdated?.remarks}`);

  // Re-verify that skip strategy does not overwrite records
  reParsed.validRows[0].data['attendancestatus'] = 'Absent';
  const skipCommit2 = await commitModuleImportRows('attendance', [reParsed.validRows[0]], 'skip');
  assert('Duplicates', 'Skip strategy does not update', skipCommit2.skippedCount === 1 && skipCommit2.updatedCount === 0, 'Skipped duplicate row');
  const recordsAfterSkip = await getAllAttendanceRecords();
  const ahmedAfterSkip = recordsAfterSkip.find((r) => r.studentId === 'mock-stu-1');
  assert('Duplicates', 'Ahmed status remains Late after skip', ahmedAfterSkip?.status === 'Late', 'Ahmed status was not overwritten');

  // 5. TEACHING LOG BULK IMPORT
  console.log('\n--- 5. Teaching Log Bulk Import ---');
  const teachWb = XLSX.utils.book_new();
  const teachData = [
    {
      'Date': '2026-10-22',
      'Class': 'Class 7',
      'Day': 'Thursday',
      'Subject / Topic': 'Computer Hardware & Ports',
      'Learning Objectives': 'Understand USB, HDMI, and VGA interfaces',
      'Theory Covered': 'Input/output peripheral bus standards',
      'Practical Activity': 'Physical port identification on PC back panel',
      'Total Registered': 40,
      'Students Present': 38,
      'Students Completing Task': 35,
      'Students Needing Help': 3,
      'Teaching Method': 'Demonstration & Hands-on Lab',
      'Instructor Name': 'Sir Imran Khan',
    },
  ];
  const teachSheet = XLSX.utils.json_to_sheet(teachData);
  XLSX.utils.book_append_sheet(teachWb, teachSheet, 'TeachingLog');
  const teachFile = workbookToFile(teachWb, 'teaching_test.xlsx');

  const parsedTeach = await parseModuleImportFile(teachFile, 'teaching_log');
  assert('Teaching Import', 'Row parsed as valid', parsedTeach.validRows[0].status === 'valid', `Status: ${parsedTeach.validRows[0].status}`);
  const teachCommit = await commitModuleImportRows('teaching_log', parsedTeach.validRows, 'skip');
  assert('Teaching Import', 'Teaching log committed', teachCommit.createdCount === 1, `Created: ${teachCommit.createdCount}`);
  const loadedLogs = await fetchTeachingLogs('All');
  assert('Teaching Import', 'Teaching log in local store', loadedLogs.length >= 1, `Loaded logs count: ${loadedLogs.length}`);

  // 6. PRACTICAL TRACKER BULK IMPORT
  console.log('\n--- 6. Practical Tracker Bulk Import ---');
  const pracWb = XLSX.utils.book_new();
  const pracData = [
    {
      'Assessment Date': '2026-10-22',
      'Class': 'Class 8',
      'Admission No': 'ADM-002',
      'Roll No': '102',
      'Student Name': 'Bilal Khan',
      'Skill Task': 'MS Excel SUM & AVERAGE Formulas',
      'Attempt Number': 1,
      'Score (0-100)': 85,
      'Skill Status': 'Proficient',
      'Practical Completed': 'Yes',
      'Remarks': 'Excellent execution',
    },
  ];
  const pracSheet = XLSX.utils.json_to_sheet(pracData);
  XLSX.utils.book_append_sheet(pracWb, pracSheet, 'Practicals');
  const pracFile = workbookToFile(pracWb, 'practical_test.xlsx');

  const parsedPrac = await parseModuleImportFile(pracFile, 'practical');
  assert('Practical Import', 'Matched student mock-stu-2', parsedPrac.validRows[0].matchedStudent?.id === 'mock-stu-2', `Resolved ID: ${parsedPrac.validRows[0].matchedStudent?.id}`);
  assert('Practical Import', 'Row valid', parsedPrac.validRows[0].status === 'valid', `Status: ${parsedPrac.validRows[0].status}`);
  const pracCommit = await commitModuleImportRows('practical', parsedPrac.validRows, 'skip');
  assert('Practical Import', 'Committed 1 practical entry', pracCommit.createdCount === 1, `Created: ${pracCommit.createdCount}`);
  const loadedPrac = await fetchPracticalProgress('All');
  assert('Practical Import', 'Practical entry saved in local store', loadedPrac.length >= 1, `Loaded practicals count: ${loadedPrac.length}`);

  // 7. ABSENTEE FOLLOW-UP BULK IMPORT
  console.log('\n--- 7. Absentee Follow-up Bulk Import ---');
  const absWb = XLSX.utils.book_new();
  const absData = [
    {
      'Date': '2026-10-22',
      'Class': 'Class 9',
      'Admission No': 'ADM-003',
      'Roll No': '103',
      'Student Name': 'Usman Ghani',
      'Absence Count': 3,
      'Follow-up Reason': 'Medical / Viral Fever',
      'Action Taken': 'Phone Call to Guardian',
      'Contact Person': 'Father (Ghani Rehman)',
      'Response Received': 'Doctor advised rest until Monday',
      'Expected Return Date': '2026-10-26',
      'Current Status': 'Pending Return',
      'Management Referral': 'No',
    },
  ];
  const absSheet = XLSX.utils.json_to_sheet(absData);
  XLSX.utils.book_append_sheet(absWb, absSheet, 'Absentee');
  const absFile = workbookToFile(absWb, 'absentee_test.xlsx');

  const parsedAbs = await parseModuleImportFile(absFile, 'absentee');
  assert('Absentee Import', 'Matched student mock-stu-3', parsedAbs.validRows[0].matchedStudent?.id === 'mock-stu-3', `Resolved ID: ${parsedAbs.validRows[0].matchedStudent?.id}`);
  const absCommit = await commitModuleImportRows('absentee', parsedAbs.validRows, 'skip');
  assert('Absentee Import', 'Committed 1 absentee follow-up', absCommit.createdCount === 1, `Created: ${absCommit.createdCount}`);
  const loadedAbs = await fetchAbsenteeFollowups('All');
  assert('Absentee Import', 'Follow-up saved in local store', loadedAbs.length >= 1, `Loaded follow-ups count: ${loadedAbs.length}`);

  // 8. CSV SUPPORT VERIFICATION
  console.log('\n--- 8. CSV Support Verification ---');
  const csvContent = `Date,Class,Admission No,Roll No,Student Name,Attendance Status,Remarks\n2026-10-21,Class 7,ADM-001,101,Ahmed Ali,Present,CSV test`;
  const csvFile = csvTextToFile(csvContent, 'attendance.csv');
  const parsedCsv = await parseModuleImportFile(csvFile, 'attendance');
  assert('CSV Import', 'Parsed CSV file successfully', parsedCsv.validRows.length === 1, `CSV rows count: ${parsedCsv.validRows.length}`);
  assert('CSV Import', 'Resolved student from CSV', parsedCsv.validRows[0].matchedStudent?.id === 'mock-stu-1', 'CSV student resolved to mock-stu-1');

  // 9. OUTBOX INTEGRITY VERIFICATION
  console.log('\n--- 9. Outbox Operations Verification ---');
  const outbox = await getOutboxOperations();
  assert('Outbox', 'Outbox operations queued for sync', outbox.length > 0, `Total outbox operations queued: ${outbox.length}`);
  const attOp = outbox.find((o) => o.entityType === 'attendance');
  const teachOp = outbox.find((o) => o.entityType === 'teaching_log');
  const pracOp = outbox.find((o) => o.entityType === 'practical_progress');
  const absOp = outbox.find((o) => o.entityType === 'absentee_followup');
  assert('Outbox', 'Attendance outbox op queued', Boolean(attOp), 'Found attendance outbox op');
  assert('Outbox', 'Teaching outbox op queued', Boolean(teachOp), 'Found teaching log outbox op');
  assert('Outbox', 'Practical outbox op queued', Boolean(pracOp), 'Found practical outbox op');
  assert('Outbox', 'Absentee outbox op queued', Boolean(absOp), 'Found absentee outbox op');

  // SUMMARY
  console.log('\n====================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
