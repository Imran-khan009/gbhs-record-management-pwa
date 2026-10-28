import 'fake-indexeddb/auto';

// Mock localStorage
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

// Mock window and CustomEvent
const dispatchedEvents: { type: string; detail?: any }[] = [];
const eventListeners = new Map<string, Function[]>();

(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: { detail?: any }) {
    this.type = type;
    this.detail = params?.detail;
  }
};

(globalThis as any).window = {
  addEventListener: (event: string, fn: Function) => {
    const list = eventListeners.get(event) || [];
    list.push(fn);
    eventListeners.set(event, list);
  },
  removeEventListener: (event: string, fn: Function) => {
    const list = eventListeners.get(event) || [];
    eventListeners.set(event, list.filter((f) => f !== fn));
  },
  dispatchEvent: (event: any) => {
    dispatchedEvents.push({ type: event.type, detail: event.detail });
    const list = eventListeners.get(event.type) || [];
    for (const fn of list) {
      fn(event);
    }
    return true;
  },
  matchMedia: () => ({ matches: false }),
};

import * as XLSX from 'xlsx';
import { BulkOperationsService } from '../src/services/bulkOperationsService';
import {
  downloadAttendanceTemplate,
  downloadTeachingLogTemplate,
  downloadPracticalTrackerTemplate,
  downloadAbsenteeFollowupTemplate,
  generateModuleTemplateWorkbook,
} from '../src/services/bulkModuleImportService';
import {
  parseExcelOrCsvFile,
  commitApprovedImportRows,
} from '../src/services/excelService';
import {
  bulkSaveStudentsLocally,
  getAllStudents,
  clearAllStudentsLocally,
  bulkSaveAttendanceLocally,
  getAllAttendanceRecords,
  getAllTeachingLogs,
  getAllPracticalProgress,
  getAllAbsenteeFollowups,
  getOutboxOperations,
} from '../src/services/db';
import { Student } from '../src/types/student';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  message: string;
}

const testResults: TestResult[] = [];

function assert(suite: string, name: string, condition: boolean, message: string) {
  testResults.push({ suite, name, passed: condition, message });
  const tag = condition ? 'PASS' : 'FAIL';
  console.log(`[${tag}] [${suite}] ${name}: ${message}`);
  if (!condition) {
    console.error(`      ERROR: ${message}`);
  }
}

function workbookToFile(workbook: XLSX.WorkBook, filename = 'test.xlsx'): File {
  const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return new File([blob], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function runPhase1ReliabilityTests() {
  console.log('===============================================================');
  console.log('PHASE 1: EXCEL IMPORT RELIABILITY & EVIDENCE-BASED TEST SUITE');
  console.log('===============================================================\n');

  // Pre-seed known test students in an isolated in-memory DB
  await clearAllStudentsLocally();
  const testStudents: Student[] = [
    {
      id: 'stu-701',
      rollNo: '1',
      admissionNo: 'ADM-701',
      name: 'Muhammad Ali',
      fatherName: 'Tariq Mehmood',
      class: 'Class 7',
      section: 'A',
      status: 'Active',
      phone: '03001234567',
      schoolId: 'GBHS-TEST',
      createdBy: 'test-admin',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'stu-702',
      rollNo: '2',
      admissionNo: 'ADM-702',
      name: 'Zayan Ahmed',
      fatherName: 'Bashir Ahmed',
      class: 'Class 7',
      section: 'A',
      status: 'Active',
      phone: '03001234567',
      schoolId: 'GBHS-TEST',
      createdBy: 'test-admin',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'stu-801',
      rollNo: '1',
      admissionNo: 'ADM-801',
      name: 'Hamza Khan',
      fatherName: 'Abdul Rehman',
      class: 'Class 8',
      section: 'A',
      status: 'Active',
      phone: '03001234567',
      schoolId: 'GBHS-TEST',
      createdBy: 'test-admin',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'stu-802',
      rollNo: '1190',
      admissionNo: 'GBHS-1190',
      name: 'Imran Baloch',
      fatherName: 'Baloch Khan',
      class: 'Class 8',
      section: 'A',
      status: 'Active',
      phone: '03001234567',
      schoolId: 'GBHS-TEST',
      createdBy: 'test-admin',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'stu-901',
      rollNo: '1',
      admissionNo: 'ADM-901',
      name: 'Bilal Hussain',
      fatherName: 'Muhammad Hussain',
      class: 'Class 9',
      section: 'A',
      status: 'Active',
      phone: '03001234567',
      schoolId: 'GBHS-TEST',
      createdBy: 'test-admin',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  await bulkSaveStudentsLocally(testStudents);
  const initialStudents = await getAllStudents();
  assert('INIT', 'Students Pre-seeded', initialStudents.length === 5, '5 students seeded in isolated test DB');

  // --------------------------------------------------------------------------
  // TEST SCENARIO 1: Template Generation -> Filling Valid Data -> Re-Importing
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 1: Template Round-Trip Across All Modules ---');

  // 1.1 Attendance Template Round-Trip
  const attWb = BulkOperationsService.generateTemplate('attendance', {
    classLevel: 'Class 7',
    date: '2026-10-22',
    students: testStudents.filter(s => s.class === 'Class 7'),
  });
  const attFile = workbookToFile(attWb, 'Attendance_Template.xlsx');
  const attParse = await BulkOperationsService.parseFile(attFile, 'attendance', {
    autoEnrollMissingStudents: false,
    duplicateStrategy: 'update',
  });
  assert(
    'ROUND_TRIP',
    'Attendance Template Parsed Valid Rows',
    attParse.validCount === 2 && attParse.unmatchedCount === 0 && attParse.invalidCount === 0,
    `Expected 2 valid rows for Class 7 students, got valid: ${attParse.validCount}, unmatched: ${attParse.unmatchedCount}`
  );

  // Commit attendance
  const attCommit = await BulkOperationsService.commit('attendance', attParse.validRows, {
    duplicateStrategy: 'update',
  });
  assert(
    'ROUND_TRIP',
    'Attendance Committed to DB',
    attCommit.createdCount === 2 && attCommit.failedCount === 0,
    `Committed 2 attendance records, created: ${attCommit.createdCount}`
  );
  const dbAtt = await getAllAttendanceRecords();
  assert(
    'ROUND_TRIP',
    'Attendance Records In DB',
    dbAtt.length === 2,
    `Expected 2 attendance records in DB, found ${dbAtt.length}`
  );

  // 1.2 Teaching Log Template Round-Trip
  const teachWb = BulkOperationsService.generateTemplate('teaching_logs', { classLevel: 'Class 7' });
  // Add a non-example valid row
  const teachWs = teachWb.Sheets['Teaching Log'];
  const teachData = XLSX.utils.sheet_to_json<any>(teachWs);
  teachData.push({
    'Date (YYYY-MM-DD)*': '2026-10-23',
    'Class (Class 7/8/9)*': 'Class 7',
    'Day': 'Friday',
    'Subject / Topic*': 'Spreadsheet Formulas & Data Sorting',
    'Learning Objectives': 'Understand SUM, AVERAGE, and basic formulas',
    'Theory Covered': 'Formula syntax, cell referencing',
    'Practical Activity': 'Create a student marks sheet with formulas',
    'Students Present': 2,
    'Students Completing Task': 2,
    'Students Needing Help': 0,
    'Teaching Method': 'Lab Demo',
    'Instructor Name': 'Computer Teacher',
    'Remarks': 'Completed successfully',
  });
  const updatedTeachWs = XLSX.utils.json_to_sheet(teachData);
  teachWb.Sheets['Teaching Log'] = updatedTeachWs;
  const teachFile = workbookToFile(teachWb, 'Teaching_Log.xlsx');
  const teachParse = await BulkOperationsService.parseFile(teachFile, 'teaching_logs');
  assert(
    'ROUND_TRIP',
    'Teaching Log Parsed Valid Rows',
    teachParse.validCount === 1,
    `Expected 1 valid row (example row filtered out), got valid: ${teachParse.validCount}`
  );
  const teachCommit = await BulkOperationsService.commit('teaching_logs', teachParse.validRows);
  assert(
    'ROUND_TRIP',
    'Teaching Log Committed',
    teachCommit.createdCount === 1,
    `Created: ${teachCommit.createdCount}`
  );
  const dbTeach = await getAllTeachingLogs();
  assert('ROUND_TRIP', 'Teaching Log in DB', dbTeach.length === 1, `Expected 1 teaching log in DB, found ${dbTeach.length}`);

  // 1.3 Practical Tracker Template Round-Trip
  const pracWb = BulkOperationsService.generateTemplate('practical_progress', {
    classLevel: 'Class 7',
    students: testStudents.filter(s => s.class === 'Class 7'),
  });
  const pracWs = pracWb.Sheets['Practical Tracker'];
  const pracData = XLSX.utils.sheet_to_json<any>(pracWs);
  pracData.push({
    'Assessment Date (YYYY-MM-DD)*': '2026-10-23',
    'Class (Class 7/8/9)*': 'Class 7',
    'Roll Number*': '1',
    'Admission Number': 'ADM-701',
    'Student Name': 'Muhammad Ali',
    'Practical Task / Skill*': 'Excel IF formula implementation',
    'Attempt Number': 1,
    'Practical Completed (Yes/No/In Progress)*': 'Yes',
    'Skill Status (Proficient/Competent/Needs Improvement/Not Started)*': 'Proficient',
    'Score (0-100)': 95,
    'Weak Area': 'None',
    'Remedial Practice Required (Yes/No)': 'No',
    'Remarks': 'Excellent execution',
  });
  pracWb.Sheets['Practical Tracker'] = XLSX.utils.json_to_sheet(pracData);
  const pracFile = workbookToFile(pracWb, 'Practical_Tracker.xlsx');
  const pracParse = await BulkOperationsService.parseFile(pracFile, 'practical_progress');
  assert(
    'ROUND_TRIP',
    'Practical Tracker Parsed Valid Rows',
    pracParse.validCount === 1,
    `Expected 1 valid row, got ${pracParse.validCount}`
  );
  const pracCommit = await BulkOperationsService.commit('practical_progress', pracParse.validRows);
  assert(
    'ROUND_TRIP',
    'Practical Tracker Committed',
    pracCommit.createdCount === 1,
    `Created: ${pracCommit.createdCount}`
  );
  const dbPrac = await getAllPracticalProgress();
  assert('ROUND_TRIP', 'Practical in DB', dbPrac.length === 1, `Found ${dbPrac.length} practical entries in DB`);

  // 1.4 Absentee Follow-up Template Round-Trip
  const absWb = BulkOperationsService.generateTemplate('absentee_followups', {
    classLevel: 'Class 7',
    students: testStudents.filter(s => s.class === 'Class 7'),
  });
  const absWs = absWb.Sheets['Absentee Follow-up'];
  const absData = XLSX.utils.sheet_to_json<any>(absWs);
  absData.push({
    'Date of Record (YYYY-MM-DD)*': '2026-10-23',
    'Class (Class 7/8/9)*': 'Class 7',
    'Roll Number*': '2',
    'Admission Number': 'ADM-702',
    'Student Name': 'Zayan Ahmed',
    'Consecutive Absences': 2,
    'Follow-up Reason*': 'Medical Illness',
    'Action Taken*': 'Phone call to mother',
    'Contact Person': 'Mother',
    'Response Received': 'Medical certificate provided, student will rejoin Monday',
    'Expected Return Date (YYYY-MM-DD)': '2026-10-26',
    'Current Status (Pending Return/Resolved / Returned/Escalated/Prolonged Leave)*': 'Resolved / Returned',
    'Management Referral (Yes/No)': 'No',
    'Remarks': 'Valid excuse',
  });
  absWb.Sheets['Absentee Follow-up'] = XLSX.utils.json_to_sheet(absData);
  const absFile = workbookToFile(absWb, 'Absentee_Followup.xlsx');
  const absParse = await BulkOperationsService.parseFile(absFile, 'absentee_followups');
  assert(
    'ROUND_TRIP',
    'Absentee Follow-up Parsed Valid Rows',
    absParse.validCount === 1,
    `Expected 1 valid row, got ${absParse.validCount}`
  );
  const absCommit = await BulkOperationsService.commit('absentee_followups', absParse.validRows);
  assert(
    'ROUND_TRIP',
    'Absentee Follow-up Committed',
    absCommit.createdCount === 1,
    `Created: ${absCommit.createdCount}`
  );
  const dbAbs = await getAllAbsenteeFollowups();
  assert('ROUND_TRIP', 'Absentee in DB', dbAbs.length === 1, `Found ${dbAbs.length} absentee entries in DB`);

  // --------------------------------------------------------------------------
  // TEST SCENARIO 2: Header Variations & Fuzzy Matching
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: Header Variations & Aliases ---');
  const variationsData = [
    {
      'Attendance Date': '2026-10-24',
      'Grade': '7',
      'Roll': '1',
      'Reg No': 'ADM-701',
      'Learner Name': 'Muhammad Ali',
      'Attendance': 'P',
    },
    {
      'date': '2026-10-24',
      'class': 'Class 8',
      'roll_no': '1190',
      'adm_no': 'GBHS-1190',
      'student_name': 'Imran Baloch',
      'status': 'Present',
    },
  ];
  const varWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(varWb, XLSX.utils.json_to_sheet(variationsData), 'Attendance');
  const varFile = workbookToFile(varWb, 'Variations.xlsx');
  const varParse = await BulkOperationsService.parseFile(varFile, 'attendance');
  assert(
    'HEADERS',
    'Header Variations Parsed Successfully',
    varParse.validCount === 2 && varParse.unmatchedCount === 0,
    `Expected 2 valid rows with header variations, got valid: ${varParse.validCount}, unmatched: ${varParse.unmatchedCount}`
  );

  // --------------------------------------------------------------------------
  // TEST SCENARIO 3: Missing, Duplicated, Unexpected, or Misspelled Headers
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: Missing and Misspelled Headers ---');
  const malformedHeaderData = [
    {
      'Random Extra Header': 'XYZ',
      'Misspelled Date': 'not a date',
      'Roll Number*': '1',
      'Class': 'Class 7',
      'Status': 'Present',
    },
  ];
  const malformedWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(malformedWb, XLSX.utils.json_to_sheet(malformedHeaderData), 'Sheet1');
  const malformedFile = workbookToFile(malformedWb, 'Malformed_Headers.xlsx');
  const malformedParse = await BulkOperationsService.parseFile(malformedFile, 'attendance');
  assert(
    'HEADERS',
    'Missing Required Date Header Flagged as Invalid',
    malformedParse.invalidCount === 1 && malformedParse.validCount === 0,
    `Expected row with missing date header to be invalid, got invalid: ${malformedParse.invalidCount}`
  );

  // --------------------------------------------------------------------------
  // TEST SCENARIO 4: Empty Rows & Invalid Values Validation
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: Blank Fields & Empty Rows ---');
  const blankData = [
    // 4.1 Completely empty row (should be filtered out)
    {
      'Date (YYYY-MM-DD)*': '',
      'Class (Class 7/8/9)*': '',
      'Roll Number*': '',
      'Status (Present/Absent/Leave/Late)*': '',
    },
    // 4.2 Row with missing date but some values (partially blank -> invalid)
    {
      'Date (YYYY-MM-DD)*': '',
      'Class (Class 7/8/9)*': 'Class 7',
      'Roll Number*': '1',
      'Status (Present/Absent/Leave/Late)*': 'Present',
    },
    // 4.3 Row with valid date but invalid status value (invalid)
    {
      'Date (YYYY-MM-DD)*': '2026-10-22',
      'Class (Class 7/8/9)*': 'Class 7',
      'Roll Number*': '1',
      'Status (Present/Absent/Leave/Late)*': 'InvalidStatusXYZ',
    },
  ];
  const blankWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(blankWb, XLSX.utils.json_to_sheet(blankData), 'Sheet1');
  const blankFile = workbookToFile(blankWb, 'Blank_Rows.xlsx');
  const blankParse = await BulkOperationsService.parseFile(blankFile, 'attendance');
  assert(
    'VALIDATION',
    'Completely Blank Row Filtered Out',
    blankParse.totalRows === 2,
    `Expected total rows 2 (empty row omitted), got ${blankParse.totalRows}`
  );
  assert(
    'VALIDATION',
    'Partially Blank & Invalid Status Rows Flagged as Invalid',
    blankParse.invalidCount === 2 && blankParse.validCount === 0,
    `Expected 2 invalid rows, got invalid: ${blankParse.invalidCount}, valid: ${blankParse.validCount}`
  );

  // --------------------------------------------------------------------------
  // TEST SCENARIO 5: Duplicate Detection & Re-import Strategies (Update vs Skip)
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: Duplicate Detection & Skip vs Update Strategy ---');
  // At this point, Class 7 Roll 1 on 2026-10-22 is already in DB as Present from Scenario 1!
  const dupData = [
    {
      'Date (YYYY-MM-DD)*': '2026-10-22',
      'Class (Class 7/8/9)*': 'Class 7',
      'Roll Number*': '1',
      'Admission Number': 'ADM-701',
      'Student Name': 'Muhammad Ali',
      'Status (Present/Absent/Leave/Late)*': 'Late', // Changed to Late!
      'Remarks': 'Updated from Excel',
    },
  ];
  const dupWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(dupWb, XLSX.utils.json_to_sheet(dupData), 'Daily Attendance');
  const dupFile = workbookToFile(dupWb, 'Duplicate.xlsx');

  // 5.1 With Duplicate Strategy = 'skip'
  const dupParseSkip = await BulkOperationsService.parseFile(dupFile, 'attendance', {
    duplicateStrategy: 'skip',
  });
  assert(
    'DUPLICATE',
    'Duplicate Detected When Strategy is Skip',
    dupParseSkip.duplicateCount === 1,
    `Expected duplicateCount: 1, got ${dupParseSkip.duplicateCount}`
  );
  const dupCommitSkip = await BulkOperationsService.commit('attendance', dupParseSkip.validRows, {
    duplicateStrategy: 'skip',
  });
  assert(
    'DUPLICATE',
    'Duplicate Row Skipped Cleanly',
    dupCommitSkip.skippedCount === 1 && dupCommitSkip.updatedCount === 0 && dupCommitSkip.createdCount === 0,
    `Expected skipped: 1, updated: 0, created: 0. Got: skipped: ${dupCommitSkip.skippedCount}, updated: ${dupCommitSkip.updatedCount}`
  );

  // 5.2 With Duplicate Strategy = 'update'
  const dupParseUpdate = await BulkOperationsService.parseFile(dupFile, 'attendance', {
    duplicateStrategy: 'update',
  });
  const dupCommitUpdate = await BulkOperationsService.commit('attendance', dupParseUpdate.validRows, {
    duplicateStrategy: 'update',
  });
  assert(
    'DUPLICATE',
    'Duplicate Row Updated When Strategy is Update',
    dupCommitUpdate.updatedCount === 1 && dupCommitUpdate.skippedCount === 0,
    `Expected updated: 1, skipped: 0. Got: updated: ${dupCommitUpdate.updatedCount}`
  );
  const updatedAtt = await getAllAttendanceRecords();
  const aliAtt = updatedAtt.find(a => a.studentId === 'stu-701' && a.date === '2026-10-22');
  assert(
    'DUPLICATE',
    'Database Value Updated to Late',
    aliAtt?.status === 'Late' && aliAtt?.remarks === 'Updated from Excel',
    `Expected status 'Late', got '${aliAtt?.status}'`
  );

  // --------------------------------------------------------------------------
  // TEST SCENARIO 6: Student Matching & Numeric Roll / Leading Zero Normalization
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 6: Student Matching & Roll/Adm Normalization ---');
  const matchData = [
    // 6.1 Match by numeric Roll Number in Excel (integer 1 vs string "1" in DB)
    {
      'Date (YYYY-MM-DD)*': '2026-10-25',
      'Class (Class 7/8/9)*': 'Class 7',
      'Roll Number*': 1, // numeric!
      'Student Name': 'Muhammad Ali',
      'Status': 'Present',
    },
    // 6.2 Match by Roll with leading zero ("01" vs "1" in DB)
    {
      'Date (YYYY-MM-DD)*': '2026-10-25',
      'Class (Class 7/8/9)*': 'Class 7',
      'Roll Number*': '01',
      'Student Name': 'Muhammad Ali',
      'Status': 'Present',
    },
    // 6.3 Match by Admission Number alone (no roll)
    {
      'Date (YYYY-MM-DD)*': '2026-10-25',
      'Class (Class 7/8/9)*': 'Class 7',
      'Roll Number*': '',
      'Admission Number': 'ADM-702',
      'Student Name': '',
      'Status': 'Present',
    },
    // 6.4 Match by Name + Class alone (when roll and adm missing)
    {
      'Date (YYYY-MM-DD)*': '2026-10-25',
      'Class (Class 7/8/9)*': 'Class 8',
      'Roll Number*': '',
      'Admission Number': '',
      'Student Name': 'Imran Baloch ', // trailing space
      'Status': 'Present',
    },
    // 6.5 Unmatched student (should NOT guess or assign to wrong student)
    {
      'Date (YYYY-MM-DD)*': '2026-10-25',
      'Class (Class 7/8/9)*': 'Class 7',
      'Roll Number*': '9999',
      'Admission Number': 'NON-EXISTENT',
      'Student Name': 'Unknown Stranger',
      'Status': 'Present',
    },
  ];
  const matchWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(matchWb, XLSX.utils.json_to_sheet(matchData), 'Daily Attendance');
  const matchFile = workbookToFile(matchWb, 'Student_Matching.xlsx');
  const matchParse = await BulkOperationsService.parseFile(matchFile, 'attendance', {
    autoEnrollMissingStudents: false,
  });

  assert('MATCHING', 'Numeric Roll 1 Matched', matchParse.validRows[0].matchedStudent?.id === 'stu-701', `Row 0 matched: ${matchParse.validRows[0].matchedStudent?.name}`);
  assert('MATCHING', 'Leading Zero Roll "01" Matched', matchParse.validRows[1].matchedStudent?.id === 'stu-701', `Row 1 matched: ${matchParse.validRows[1].matchedStudent?.name}`);
  assert('MATCHING', 'Admission Number ADM-702 Matched', matchParse.validRows[2].matchedStudent?.id === 'stu-702', `Row 2 matched: ${matchParse.validRows[2].matchedStudent?.name}`);
  assert('MATCHING', 'Name + Class with Space Matched', matchParse.validRows[3].matchedStudent?.id === 'stu-802', `Row 3 matched: ${matchParse.validRows[3].matchedStudent?.name}`);
  assert('MATCHING', 'Unknown Student Not Matched (No Guessing)', matchParse.validRows[4].status === 'unmatched' && matchParse.validRows[4].matchedStudent === undefined, `Row 4 status: ${matchParse.validRows[4].status}`);

  // --------------------------------------------------------------------------
  // TEST SCENARIO 7: Correct Class Separation (Class 7 vs Class 8 vs Class 9)
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: Strict Class Separation ---');
  // In our DB:
  // Class 7 Roll 1 = Muhammad Ali
  // Class 8 Roll 1 = Hamza Khan
  // Class 9 Roll 1 = Bilal Hussain
  const classSepData = [
    { 'Date': '2026-10-25', 'Class': 'Class 7', 'Roll': '1', 'Status': 'Present' },
    { 'Date': '2026-10-25', 'Class': 'Class 8', 'Roll': '1', 'Status': 'Present' },
    { 'Date': '2026-10-25', 'Class': 'Class 9', 'Roll': '1', 'Status': 'Present' },
  ];
  const classSepWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classSepWb, XLSX.utils.json_to_sheet(classSepData), 'Attendance');
  const classSepFile = workbookToFile(classSepWb, 'Class_Separation.xlsx');
  const classSepParse = await BulkOperationsService.parseFile(classSepFile, 'attendance');

  assert('CLASS_SEP', 'Class 7 Roll 1 is Muhammad Ali', classSepParse.validRows[0].matchedStudent?.id === 'stu-701', `Class 7 Roll 1 matched: ${classSepParse.validRows[0].matchedStudent?.name}`);
  assert('CLASS_SEP', 'Class 8 Roll 1 is Hamza Khan', classSepParse.validRows[1].matchedStudent?.id === 'stu-801', `Class 8 Roll 1 matched: ${classSepParse.validRows[1].matchedStudent?.name}`);
  assert('CLASS_SEP', 'Class 9 Roll 1 is Bilal Hussain', classSepParse.validRows[2].matchedStudent?.id === 'stu-901', `Class 9 Roll 1 matched: ${classSepParse.validRows[2].matchedStudent?.name}`);

  // --------------------------------------------------------------------------
  // TEST SCENARIO 8: Historical Date Parsing Without Silent Substitution
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 8: Historical Date Preservation ---');
  const datesToTest = [
    { input: '2024-03-15', expected: '2024-03-15' },
    { input: '15/03/2024', expected: '2024-03-15' },
    { input: '15-03-2024', expected: '2024-03-15' },
    { input: '2 March 2024', expected: '2024-03-02' },
    { input: 'March 2, 2024', expected: '2024-03-02' },
    { input: 45366, expected: '2024-03-15' }, // Excel serial number
    { input: new Date('2024-03-15T00:00:00Z'), expected: '2024-03-15' },
  ];

  for (const dt of datesToTest) {
    const parsed = BulkOperationsService.parseExcelDate(dt.input);
    assert(
      'DATE_PARSING',
      `Parse Date "${String(dt.input)}"`,
      parsed === dt.expected,
      `Expected ${dt.expected}, got ${parsed}`
    );
  }

  // Verify that an invalid date string does NOT return today's date!
  const invalidDate = BulkOperationsService.parseExcelDate('completely-invalid-date-string');
  assert('DATE_PARSING', 'Invalid Date Returns Null (Never Defaults to Today)', invalidDate === null, `Expected null, got ${invalidDate}`);

  // --------------------------------------------------------------------------
  // TEST SCENARIO 9: Large Files Containing 500+ Rows
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 9: High-Volume 500+ Rows Benchmark ---');
  const largeData: any[] = [];
  for (let i = 1; i <= 550; i++) {
    largeData.push({
      'Date (YYYY-MM-DD)*': '2026-10-26',
      'Class (Class 7/8/9)*': 'Class 7',
      'Day': 'Monday',
      'Subject / Topic*': `Lesson Topic Number ${i}`,
      'Learning Objectives': `Objectives for lesson ${i}`,
      'Theory Covered': 'Overview',
      'Practical Activity': 'Hands-on practice',
      'Students Present': 25,
      'Students Completing Task': 20,
      'Students Needing Help': 5,
      'Teaching Method': 'Demonstration',
      'Instructor Name': 'Teacher',
      'Remarks': `Log row ${i}`,
    });
  }
  const largeWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(largeWb, XLSX.utils.json_to_sheet(largeData), 'Teaching Log');
  const largeFile = workbookToFile(largeWb, 'Large_500_Rows.xlsx');

  const startTime = Date.now();
  let progressUpdatesCount = 0;
  const largeParse = await BulkOperationsService.parseFile(largeFile, 'teaching_logs', {
    onProgress: (current, total) => {
      progressUpdatesCount++;
    },
  });
  const elapsed = Date.now() - startTime;
  assert(
    'LARGE_FILE',
    '550 Rows Parsed Completely Without Errors',
    largeParse.totalRows === 550 && largeParse.validCount === 550,
    `Parsed 550 rows in ${elapsed}ms. Valid: ${largeParse.validCount}, Total: ${largeParse.totalRows}`
  );
  assert(
    'LARGE_FILE',
    'Progress Callbacks Fired for Non-Blocking UX',
    progressUpdatesCount > 0,
    `Progress callbacks fired: ${progressUpdatesCount} times`
  );

  // --------------------------------------------------------------------------
  // TEST SCENARIO 10: Outbox Integration & DB Persistence
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 10: Outbox Operations & Sync Engine Audit ---');
  const outboxOps = await getOutboxOperations();
  assert(
    'OUTBOX',
    'Outbox Operations Created for Committed Records',
    outboxOps.length > 0,
    `Found ${outboxOps.length} pending outbox operations for cloud sync`
  );

  const attOps = outboxOps.filter(o => o.entityType === 'attendance');
  assert('OUTBOX', 'Attendance Outbox Operations Exist', attOps.length >= 2, `Found ${attOps.length} attendance operations`);
  const teachOps = outboxOps.filter(o => o.entityType === 'teaching_log');
  assert('OUTBOX', 'Teaching Log Outbox Operations Exist', teachOps.length >= 1, `Found ${teachOps.length} teaching operations`);

  // Verify that all outbox ops have required sync fields
  const allOpsValid = outboxOps.every(o => o.opId && o.operationType && o.entityId && o.status === 'pending');
  assert('OUTBOX', 'All Outbox Records Have Valid Schema', allOpsValid, 'Every queued operation has valid opId, operationType, status');

  // --------------------------------------------------------------------------
  // TEST SUITE SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  console.log(`TEST RUN FINISHED: ${passed}/${total} Passed (${failed} Failed)`);
  console.log('===============================================================');

  if (failed > 0) {
    console.error(`\nFAILED TESTS SUMMARY (${failed}):`);
    testResults.filter(r => !r.passed).forEach(r => {
      console.error(`  - [${r.suite}] ${r.name}: ${r.message}`);
    });
    process.exit(1);
  } else {
    console.log('\nALL PHASE 1 EXCEL IMPORT RELIABILITY TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runPhase1ReliabilityTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
