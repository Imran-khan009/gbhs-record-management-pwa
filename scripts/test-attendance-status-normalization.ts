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
  BulkOperationsService,
  AttendanceStatusContext,
} from '../src/services/bulkOperationsService';
import {
  parseModuleImportFile,
  commitModuleImportRows,
  normalizeAttendanceStatus,
  parseAttendanceStatusWithDetails,
} from '../src/services/bulkModuleImportService';
import {
  setActiveWorkspaceId,
  clearAllStudentsLocally,
  bulkSaveStudentsLocally,
  getAllAttendanceRecords,
} from '../src/services/db';
import { clearAllModulesMockData } from '../src/services/modulesService';
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

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('STARTING ATTENDANCE STATUS CODE NORMALIZATION REGRESSION TESTS');
  console.log('================================================================\n');

  setActiveWorkspaceId('test-att-norm-ws');
  await clearAllStudentsLocally();
  await clearAllModulesMockData();

  // Seed 4 test students
  const testStudents: Student[] = [
    {
      id: 'stu-norm-1',
      rollNo: '1',
      admissionNo: 'ADM-101',
      name: 'Muhammad Ali',
      fatherName: 'Ali Khan',
      class: 'Class 7',
      section: 'A',
      phone: '03001111111',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-admin',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'stu-norm-2',
      rollNo: '2',
      admissionNo: 'ADM-102',
      name: 'Bilal Hassan',
      fatherName: 'Hassan Shah',
      class: 'Class 7',
      section: 'A',
      phone: '03002222222',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-admin',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'stu-norm-3',
      rollNo: '3',
      admissionNo: 'ADM-103',
      name: 'Danish Tariq',
      fatherName: 'Tariq Mehmood',
      class: 'Class 7',
      section: 'A',
      phone: '03003333333',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-admin',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'stu-norm-4',
      rollNo: '4',
      admissionNo: 'ADM-104',
      name: 'Ehsan Ullah',
      fatherName: 'Inam Ullah',
      class: 'Class 7',
      section: 'A',
      phone: '03004444444',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-admin',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  await bulkSaveStudentsLocally(testStudents);

  // -------------------------------------------------------------
  // SUITE 1: PRESENT CODES
  // -------------------------------------------------------------
  console.log('\n--- 1. Present Codes Normalization ---');
  const presentVariants = ['P', 'p', 'Present', 'present', 'PRESENT', 'hazir', 'حاضر', 'yes', 'y'];
  for (const variant of presentVariants) {
    const res = parseAttendanceStatusWithDetails(variant);
    assert(
      'Present Codes',
      `Normalize "${variant}"`,
      res.status === 'Present' && res.isValid === true && res.isAmbiguous === false,
      `"${variant}" mapped to Present`
    );
  }

  // -------------------------------------------------------------
  // SUITE 2: ABSENT CODES
  // -------------------------------------------------------------
  console.log('\n--- 2. Absent Codes Normalization ---');
  const absentVariants = ['A', 'a', 'Absent', 'absent', 'ABSENT', 'ghairhazir', 'غیرحاضر', 'no', 'n'];
  for (const variant of absentVariants) {
    const res = parseAttendanceStatusWithDetails(variant);
    assert(
      'Absent Codes',
      `Normalize "${variant}"`,
      res.status === 'Absent' && res.isValid === true && res.isAmbiguous === false,
      `"${variant}" mapped to Absent`
    );
  }

  // -------------------------------------------------------------
  // SUITE 3: LATE CODES (T, LT, Late, Urdu, Tardy)
  // -------------------------------------------------------------
  console.log('\n--- 3. Late Codes Normalization ---');
  const lateVariants = ['T', 't', 'LT', 'lt', 'Late', 'late', 'LATE', 'der', 'تاخیر', 'tardy'];
  for (const variant of lateVariants) {
    const res = parseAttendanceStatusWithDetails(variant);
    assert(
      'Late Codes',
      `Normalize "${variant}"`,
      res.status === 'Late' && res.isValid === true && res.isAmbiguous === false,
      `"${variant}" mapped to Late`
    );
  }

  // -------------------------------------------------------------
  // SUITE 4: LEAVE CODES (Lv, Leave, Urdu, On Leave)
  // -------------------------------------------------------------
  console.log('\n--- 4. Leave Codes Normalization ---');
  const leaveVariants = ['Lv', 'lv', 'LV', 'Leave', 'leave', 'LEAVE', 'chutti', 'رخصت', 'on leave', 'onleave'];
  for (const variant of leaveVariants) {
    const res = parseAttendanceStatusWithDetails(variant);
    assert(
      'Leave Codes',
      `Normalize "${variant}"`,
      res.status === 'Leave' && res.isValid === true && res.isAmbiguous === false,
      `"${variant}" mapped to Leave`
    );
  }

  // -------------------------------------------------------------
  // SUITE 5: AMBIGUOUS 'L' WITH NO CONTEXT (NEVER SILENTLY GUESS)
  // -------------------------------------------------------------
  console.log('\n--- 5. Ambiguous "L" Without Context (Strict Rejection) ---');
  const bareL = parseAttendanceStatusWithDetails('L');
  assert(
    'Ambiguity Handling',
    'Bare "L" status is null without context',
    bareL.status === null,
    'Bare L status returned null'
  );
  assert(
    'Ambiguity Handling',
    'Bare "L" flags isAmbiguous = true',
    bareL.isAmbiguous === true,
    'Bare L isAmbiguous flagged true'
  );
  assert(
    'Ambiguity Handling',
    'Bare "L" provides actionable error message',
    typeof bareL.error === 'string' && bareL.error.includes('Ambiguous attendance code "L"'),
    `Error explains ambiguity: "${bareL.error}"`
  );
  assert(
    'Ambiguity Handling',
    'normalizeAttendanceStatus("L") returns null',
    normalizeAttendanceStatus('L') === null,
    'Helper function returns null for bare L'
  );

  // -------------------------------------------------------------
  // SUITE 6: OFFICIAL ATTENDANCE WORKBOOK FORMAT (L is Late, Lv is Leave)
  // -------------------------------------------------------------
  console.log('\n--- 6. Official Workbook Context (L = Late, Lv = Leave) ---');
  // 6a. By fileName: GBHS_Attendance_Workbook.xlsx
  const fileCtx: AttendanceStatusContext = { fileName: 'GBHS_Attendance_Workbook.xlsx' };
  assert(
    'Official Workbook',
    'L in GBHS_Attendance_Workbook.xlsx resolves to Late',
    normalizeAttendanceStatus('L', fileCtx) === 'Late',
    'L mapped to Late via fileName signature'
  );
  assert(
    'Official Workbook',
    'Lv in GBHS_Attendance_Workbook.xlsx resolves to Leave',
    normalizeAttendanceStatus('Lv', fileCtx) === 'Leave',
    'Lv preserved as Leave in official workbook'
  );

  // 6b. By sheetName: Attendance Detail
  const sheetCtx: AttendanceStatusContext = { sheetName: 'Attendance Detail' };
  assert(
    'Official Workbook',
    'L in "Attendance Detail" sheet resolves to Late',
    normalizeAttendanceStatus('L', sheetCtx) === 'Late',
    'L mapped to Late via sheetName signature'
  );

  // 6c. By legendText: "Grid codes: P present, A absent, L late, Lv leave"
  const legendCtx: AttendanceStatusContext = {
    legendText: 'Grid codes: P present, A absent, L late, Lv leave',
  };
  assert(
    'Official Workbook',
    'L with official legend text resolves to Late',
    normalizeAttendanceStatus('L', legendCtx) === 'Late',
    'L mapped to Late via legend text'
  );

  // 6d. By explicit templateFormat: 'official' or 'gbhs_attendance'
  assert(
    'Official Workbook',
    'templateFormat: official resolves L to Late',
    normalizeAttendanceStatus('L', { templateFormat: 'official' }) === 'Late',
    'L mapped to Late via templateFormat: official'
  );
  assert(
    'Official Workbook',
    'templateFormat: gbhs_attendance resolves L to Late',
    normalizeAttendanceStatus('L', { templateFormat: 'gbhs_attendance' }) === 'Late',
    'L mapped to Late via templateFormat: gbhs_attendance'
  );

  // 6e. By detected tokens: Dataset contains 'lv' alongside 'l'
  const detectedLvCtx: AttendanceStatusContext = {
    detectedTokens: new Set(['p', 'a', 'l', 'lv']),
  };
  assert(
    'Official Workbook',
    'Dataset containing Lv auto-disambiguates L to Late',
    normalizeAttendanceStatus('L', detectedLvCtx) === 'Late',
    'L mapped to Late because dataset contains Lv'
  );

  // -------------------------------------------------------------
  // SUITE 7: STANDARD / EXPLICIT LEAVE CONTEXT
  // -------------------------------------------------------------
  console.log('\n--- 7. Standard / Explicit Leave Context ---');
  assert(
    'Standard Context',
    'Explicit lMeaning: Leave resolves L to Leave',
    normalizeAttendanceStatus('L', { lMeaning: 'Leave' }) === 'Leave',
    'L mapped to Leave via explicit lMeaning'
  );
  assert(
    'Standard Context',
    'templateFormat: standard resolves L to Leave',
    normalizeAttendanceStatus('L', { templateFormat: 'standard' }) === 'Leave',
    'L mapped to Leave via templateFormat: standard'
  );
  const detectedLtCtx: AttendanceStatusContext = {
    detectedTokens: new Set(['p', 'a', 'l', 'lt']),
  };
  assert(
    'Standard Context',
    'Dataset containing LT and no Lv auto-disambiguates L to Leave',
    normalizeAttendanceStatus('L', detectedLtCtx) === 'Leave',
    'L mapped to Leave because dataset uses LT for Late'
  );

  // -------------------------------------------------------------
  // SUITE 8: END-TO-END WORKBOOK IMPORT WITH OFFICIAL FORMAT
  // -------------------------------------------------------------
  console.log('\n--- 8. End-to-End Official Workbook Import ---');
  const officialWb = XLSX.utils.book_new();
  const officialRows = [
    {
      'Date': '2026-10-24',
      'Class': 'Class 7',
      'Admission No': 'ADM-101',
      'Roll No': '1',
      'Student Name': 'Muhammad Ali',
      'Attendance Status': 'P',
      'Remarks': 'Present and active in lab',
    },
    {
      'Date': '2026-10-24',
      'Class': 'Class 7',
      'Admission No': 'ADM-102',
      'Roll No': '2',
      'Student Name': 'Bilal Hassan',
      'Attendance Status': 'A',
      'Remarks': 'Sick without notice',
    },
    {
      'Date': '2026-10-24',
      'Class': 'Class 7',
      'Admission No': 'ADM-103',
      'Roll No': '3',
      'Student Name': 'Danish Tariq',
      'Attendance Status': 'L', // In official workbook this MUST BE Late
      'Remarks': 'Arrived 20 mins late due to transport',
    },
    {
      'Date': '2026-10-24',
      'Class': 'Class 7',
      'Admission No': 'ADM-104',
      'Roll No': '4',
      'Student Name': 'Ehsan Ullah',
      'Attendance Status': 'Lv', // Official code for Leave
      'Remarks': 'Approved family medical leave',
    },
  ];
  const officialSheet = XLSX.utils.json_to_sheet(officialRows);
  XLSX.utils.book_append_sheet(officialWb, officialSheet, 'Attendance Detail');
  const officialFile = workbookToFile(officialWb, 'GBHS_Attendance_Workbook.xlsx');

  const parseResult = await parseModuleImportFile(officialFile, 'attendance');
  assert(
    'Official Import',
    'Total 4 rows parsed',
    parseResult.totalRows === 4,
    `Parsed ${parseResult.totalRows} rows`
  );
  assert(
    'Official Import',
    'All 4 rows valid (0 invalid, 0 unmatched)',
    parseResult.validCount === 4 && parseResult.invalidCount === 0,
    `Valid: ${parseResult.validCount}, Invalid: ${parseResult.invalidCount}`
  );

  // Commit to local DB
  const commitResult = await commitModuleImportRows(
    'attendance',
    parseResult.validRows,
    'update',
    'admin@gbhs.edu.pk'
  );
  assert(
    'Official Import',
    'All 4 records committed to IndexedDB',
    commitResult.createdCount === 4,
    `Committed ${commitResult.createdCount} records`
  );

  // Inspect saved attendance records in IndexedDB
  const allSaved = await getAllAttendanceRecords();
  const aliRec = allSaved.find((r) => r.studentId === 'stu-norm-1');
  const bilalRec = allSaved.find((r) => r.studentId === 'stu-norm-2');
  const danishRec = allSaved.find((r) => r.studentId === 'stu-norm-3');
  const ehsanRec = allSaved.find((r) => r.studentId === 'stu-norm-4');

  // Verify status mapping
  assert(
    'Official Import Fidelity',
    'Ali (P) is Present',
    aliRec?.status === 'Present',
    `Ali status: ${aliRec?.status}`
  );
  assert(
    'Official Import Fidelity',
    'Bilal (A) is Absent',
    bilalRec?.status === 'Absent',
    `Bilal status: ${bilalRec?.status}`
  );
  assert(
    'Official Import Fidelity',
    'Danish (L) is Late in official template (NOT Leave)',
    danishRec?.status === 'Late',
    `Danish status: ${danishRec?.status}`
  );
  assert(
    'Official Import Fidelity',
    'Ehsan (Lv) is Leave',
    ehsanRec?.status === 'Leave',
    `Ehsan status: ${ehsanRec?.status}`
  );

  // Verify preservation of remarks, dates, and student IDs
  assert(
    'Field Preservation',
    'Ali remarks preserved',
    aliRec?.remarks === 'Present and active in lab',
    `Ali remarks: "${aliRec?.remarks}"`
  );
  assert(
    'Field Preservation',
    'Danish remarks preserved',
    danishRec?.remarks === 'Arrived 20 mins late due to transport',
    `Danish remarks: "${danishRec?.remarks}"`
  );
  assert(
    'Field Preservation',
    'Ehsan remarks preserved',
    ehsanRec?.remarks === 'Approved family medical leave',
    `Ehsan remarks: "${ehsanRec?.remarks}"`
  );
  assert(
    'Field Preservation',
    'Dates preserved as 2026-10-24',
    aliRec?.date === '2026-10-24' && danishRec?.date === '2026-10-24',
    'Dates match source exactly'
  );
  assert(
    'Field Preservation',
    'Student IDs matched accurately',
    danishRec?.studentId === 'stu-norm-3' && ehsanRec?.studentId === 'stu-norm-4',
    'Student IDs match database IDs'
  );

  // -------------------------------------------------------------
  // SUITE 9: AMBIGUOUS WORKBOOK IMPORT (NEVER SILENTLY GUESS)
  // -------------------------------------------------------------
  console.log('\n--- 9. Ambiguous Workbook Import (Safe Rejection) ---');
  const ambiguousWb = XLSX.utils.book_new();
  const ambiguousRows = [
    {
      'Date': '2026-10-24',
      'Class': 'Class 7',
      'Admission No': 'ADM-101',
      'Roll No': '1',
      'Student Name': 'Muhammad Ali',
      'Attendance Status': 'P',
    },
    {
      'Date': '2026-10-24',
      'Class': 'Class 7',
      'Admission No': 'ADM-102',
      'Roll No': '2',
      'Student Name': 'Bilal Hassan',
      'Attendance Status': 'L', // Ambiguous! No Lv, no LT, generic filename/sheet
    },
  ];
  const ambiguousSheet = XLSX.utils.json_to_sheet(ambiguousRows);
  XLSX.utils.book_append_sheet(ambiguousWb, ambiguousSheet, 'Sheet1');
  const ambiguousFile = workbookToFile(ambiguousWb, 'random_attendance_upload.xlsx');

  const ambigParseResult = await parseModuleImportFile(ambiguousFile, 'attendance');
  assert(
    'Ambiguous Import',
    'Row 1 (P) is valid',
    ambigParseResult.validRows[0].status === 'valid' || ambigParseResult.validRows[0].status === 'duplicate',
    'P row validated successfully'
  );
  assert(
    'Ambiguous Import',
    'Row 2 (L) is flagged as invalid due to ambiguity',
    ambigParseResult.validRows[1].status === 'invalid',
    'Row 2 status marked invalid'
  );
  assert(
    'Ambiguous Import',
    'Row 2 provides explicit ambiguity error message',
    ambigParseResult.validRows[1].errors.some((e) => e.includes('Ambiguous attendance code "L"')),
    `Error reported: "${ambigParseResult.validRows[1].errors.join('; ')}"`
  );

  // -------------------------------------------------------------
  // SUITE 10: BULK OPERATIONS SERVICE (parseFile) TEST
  // -------------------------------------------------------------
  console.log('\n--- 10. BulkOperationsService.parseFile Integration ---');
  const bulkOpResult = await BulkOperationsService.parseFile(
    officialFile,
    'attendance'
  );
  assert(
    'BulkOperationsService',
    'BulkOperationsService parses 4 rows',
    bulkOpResult.validRows.length === 4,
    `BulkOperationsService returned ${bulkOpResult.validRows.length} rows`
  );
  const bulkDanish = bulkOpResult.validRows.find(
    (r) => r.entity?.studentId === 'stu-norm-3'
  );
  assert(
    'BulkOperationsService',
    'BulkOperationsService maps L to Late in official workbook',
    bulkDanish?.entity?.status === 'Late',
    `BulkOperationsService entity status: ${bulkDanish?.entity?.status}`
  );

  // SUMMARY REPORT
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log(`REGRESSION SUITE COMPLETED: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
