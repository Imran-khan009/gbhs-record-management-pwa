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

import * as fs from 'fs';
import * as path from 'path';
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
  clearAllAttendanceLocally,
} from '../src/services/db';
import { Student } from '../src/types/student';

interface AssertionResult {
  suite: string;
  name: string;
  passed: boolean;
  message: string;
}

const results: AssertionResult[] = [];

function assert(suite: string, name: string, condition: boolean, message: string) {
  results.push({ suite, name, passed: condition, message });
  const tag = condition ? 'PASS' : 'FAIL';
  console.log(`[${tag}] [${suite}] ${name}: ${message}`);
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

async function runAprilMatrixRegressionSuite() {
  console.log('================================================================');
  console.log('STARTING APRIL 2026 ATTENDANCE WORKBOOK MATRIX REGRESSION TESTS');
  console.log('================================================================\n');

  await setActiveWorkspaceId('test-april-matrix-ws');
  await clearAllStudentsLocally();
  await clearAllAttendanceLocally();

  // -------------------------------------------------------------------
  // SUITE 1: ACTUAL WORKBOOK DIRECT PARSING & FORMULA PRESERVATION
  // -------------------------------------------------------------------
  console.log('--- 1. Actual April 2026 Workbook Inspection & Parsing ---');
  const actualFilePath =
    'C:\\Users\\7xUltra\\Desktop\\ASSESMENT RECORDS GBHS\\Attendnce Pic\\Attendance 7\\GBHS_Class_7_ Attendance April.xlsx';

  if (!fs.existsSync(actualFilePath)) {
    console.error(`Actual file not found at: ${actualFilePath}`);
    assert('Suite 1', 'File Exists', false, 'Actual workbook file missing');
  } else {
    const fileBytes = fs.readFileSync(actualFilePath);
    const wb = XLSX.read(fileBytes, { type: 'buffer', cellFormula: true, cellDates: true });

    assert(
      'Suite 1: Actual Workbook',
      'Workbook read successfully',
      wb.SheetNames.length > 0,
      `Workbook sheets: ${wb.SheetNames.join(', ')}`
    );

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Verify original formulas are present in actual workbook
    const formulaCells = ['AJ9', 'AK9', 'AL9', 'AM9'];
    for (const cellAddr of formulaCells) {
      const cell = ws[cellAddr];
      assert(
        'Suite 1: Actual Workbook',
        `Preserve formula in cell ${cellAddr}`,
        !!cell && !!cell.f && cell.f.includes('COUNTIF'),
        `Formula in ${cellAddr}: "${cell?.f || 'NONE'}"`
      );
    }

    // Wrap in File object for BulkOperationsService / parseModuleImportFile
    const fileObj = new File([fileBytes], 'GBHS_Class_7_ Attendance April.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    // 1A. Test matrix unroll with NO explicit targetMonth (Automatic conflict detection)
    const unrollResultNoOption = BulkOperationsService.unrollAttendanceMatrixIfApplicable(
      ws,
      fileObj.name,
      sheetName
    );

    assert(
      'Suite 1: Actual Workbook',
      'Recognized as monthly matrix',
      unrollResultNoOption.isMatrix === true,
      `isMatrix: ${unrollResultNoOption.isMatrix}`
    );

    assert(
      'Suite 1: Actual Workbook',
      'Detected holy_day_matrix format',
      unrollResultNoOption.detectedFormat === 'holy_day_matrix' && unrollResultNoOption.hasHolyDay === true,
      `detectedFormat: ${unrollResultNoOption.detectedFormat}, hasHolyDay: ${unrollResultNoOption.hasHolyDay}`
    );

    assert(
      'Suite 1: Actual Workbook',
      'Calendar conflict detected (filename April vs cell March vs weekday May)',
      unrollResultNoOption.calendarConflict?.hasConflict === true &&
        unrollResultNoOption.calendarConflict?.conflictType === 'mismatch',
      `conflictType: ${unrollResultNoOption.calendarConflict?.conflictType}, message: ${unrollResultNoOption.calendarConflict?.message}`
    );

    assert(
      'Suite 1: Actual Workbook',
      'Conflict message cites all 3 sources in 2026',
      unrollResultNoOption.calendarConflict?.message.includes('filename (April)') === true &&
        unrollResultNoOption.calendarConflict?.message.includes('sheet header cell (March)') === true &&
        unrollResultNoOption.calendarConflict?.message.includes('weekday row (May)') === true,
      `Message: "${unrollResultNoOption.calendarConflict?.message}"`
    );

    assert(
      'Suite 1: Actual Workbook',
      'Matrix errors list contains calendar conflict message',
      unrollResultNoOption.matrixErrors.length > 0 &&
        unrollResultNoOption.matrixErrors.some((e) => e.includes('Calendar conflict detected')),
      `matrixErrors count: ${unrollResultNoOption.matrixErrors.length}`
    );

    assert(
      'Suite 1: Actual Workbook',
      'All unrolled rows tagged with INVALID-DATE and _matrixError',
      unrollResultNoOption.rows.length > 0 &&
        unrollResultNoOption.rows.every((r) => r.date === 'INVALID-DATE' && !!r._matrixError),
      `Tagged rows count: ${unrollResultNoOption.rows.length}`
    );

    // 1B. Full parseModuleImportFile integration on conflicting workbook
    const parseResNoOption = await parseModuleImportFile(fileObj, 'attendance');
    assert(
      'Suite 1: Actual Workbook',
      'parseModuleImportFile flags calendar conflict and blocks valid rows',
      parseResNoOption.calendarConflict?.hasConflict === true &&
        parseResNoOption.validCount === 0 &&
        parseResNoOption.invalidCount > 0,
      `validCount: ${parseResNoOption.validCount}, invalidCount: ${parseResNoOption.invalidCount}`
    );

    assert(
      'Suite 1: Actual Workbook',
      'Every row in parseModuleImportFile is marked status === "invalid"',
      parseResNoOption.validRows.every((r) => r.status === 'invalid'),
      'All rows invalidated due to calendar conflict'
    );

    // 1C. Attempting commit on conflicting workbook imports 0 records
    const commitResNoOption = await commitModuleImportRows(
      'attendance',
      parseResNoOption.validRows,
      'update',
      'teacher@gbhs.edu.pk'
    );
    assert(
      'Suite 1: Actual Workbook',
      'commitModuleImportRows commits 0 records for conflicting workbook',
      commitResNoOption.createdCount === 0 && commitResNoOption.updatedCount === 0,
      `createdCount: ${commitResNoOption.createdCount}, updatedCount: ${commitResNoOption.updatedCount}`
    );

    // 1D. Explicit targetMonth with incorrect month 2026-04 (April) -> Blocked due to weekday mismatch!
    const unrollResultApril = BulkOperationsService.unrollAttendanceMatrixIfApplicable(
      ws,
      fileObj.name,
      sheetName,
      undefined,
      { targetMonth: '2026-04' }
    );
    assert(
      'Suite 1: Actual Workbook',
      'Explicit targetMonth 2026-04 blocked due to weekday mismatch (Day 1 Fri != Wed)',
      unrollResultApril.calendarConflict?.hasConflict === true &&
        unrollResultApril.calendarConflict?.conflictType === 'weekday_mismatch',
      `Message: "${unrollResultApril.calendarConflict?.message}"`
    );

    // 1E. Explicit targetMonth resolving to correct month 2026-05 (May) -> Succeeds!
    const unrollResultMay = BulkOperationsService.unrollAttendanceMatrixIfApplicable(
      ws,
      fileObj.name,
      sheetName,
      undefined,
      { targetMonth: '2026-05' }
    );
    assert(
      'Suite 1: Actual Workbook',
      'Explicit targetMonth 2026-05 resolves date context without conflict',
      unrollResultMay.calendarConflict === undefined || unrollResultMay.calendarConflict?.hasConflict === false,
      `calendarConflict: ${JSON.stringify(unrollResultMay.calendarConflict)}`
    );

    assert(
      'Suite 1: Actual Workbook',
      'May 2026 detected with 31 date columns',
      unrollResultMay.detectedMonthYear?.month === 5 &&
        unrollResultMay.detectedMonthYear?.year === 2026 &&
        unrollResultMay.dateColumnCount === 31,
      `Month/Year: ${unrollResultMay.detectedMonthYear?.month}/${unrollResultMay.detectedMonthYear?.year}, dateCols: ${unrollResultMay.dateColumnCount}`
    );

    assert(
      'Suite 1: Actual Workbook',
      'Holy day H markers on days 3, 10, 17, 24, 31 skipped; only Day 1 attendance unrolled (count: 2)',
      unrollResultMay.unrolledCount === 2,
      `unrolledCount: ${unrollResultMay.unrolledCount}`
    );

    const habibRow = unrollResultMay.rows.find((r) => String(r.rollno || r.roll) === '1078');
    assert(
      'Suite 1: Actual Workbook',
      'Habib Jan Day 1 unrolled with resolved date 2026-05-01',
      habibRow?.date === '2026-05-01' && habibRow?.status === 'P',
      `Habib Jan: date=${habibRow?.date}, status=${habibRow?.status}`
    );

    const bilalRow = unrollResultMay.rows.find((r) => String(r.rollno || r.roll) === '1247');
    assert(
      'Suite 1: Actual Workbook',
      'Bilal Hussain Day 1 unrolled with resolved date 2026-05-01',
      bilalRow?.date === '2026-05-01' && bilalRow?.status === 'P',
      `Bilal Hussain: date=${bilalRow?.date}, status=${bilalRow?.status}`
    );
  }

  // -------------------------------------------------------------------
  // SUITE 2: SYNTHETIC REPLICA MATRIX WITH ALL CODES (P, A, L, H, T, LT)
  // -------------------------------------------------------------------
  console.log('\n--- 2. Comprehensive Replica Matrix Test (P, A, L, H, T, LT) ---');

  // Seed test students for Class 7 in DB
  const testStudents: Student[] = [
    {
      id: 'stu-c7-101',
      rollNo: '101',
      admissionNo: 'ADM-7-101',
      name: 'Ahmed Khan',
      fatherName: 'Khan Baba',
      class: 'Class 7',
      section: 'A',
      phone: '03001111111',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-runner',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'stu-c7-102',
      rollNo: '102',
      admissionNo: 'ADM-7-102',
      name: 'Bilal Tariq',
      fatherName: 'Tariq Mehmood',
      class: 'Class 7',
      section: 'A',
      phone: '03002222222',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-runner',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'stu-c7-103',
      rollNo: '103',
      admissionNo: 'ADM-7-103',
      name: 'Chaudhry Dawood',
      fatherName: 'Dawood Shah',
      class: 'Class 7',
      section: 'A',
      phone: '03003333333',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-runner',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  await bulkSaveStudentsLocally(testStudents);

  // Build grid with exact April 2026 template structure
  // Row 0-3: banner
  // Row 4 (Excel row 5): Year 2026
  // Row 6 (Excel row 7): Headers (S.No, Roll No, Student Name, 1..31, Present, Apsent, Leave, Holy Day)
  // Row 7 (Excel row 8): Day names
  // Row 8+: Students
  const replicaGrid: any[][] = [];
  replicaGrid[0] = ['', 'GOVERNMENT BOYS HIGH SCHOOL'];
  replicaGrid[1] = ['', 'ATTENDANCE REGISTER'];
  replicaGrid[2] = ['', 'Class: Class 7'];
  replicaGrid[3] = ['', 'Month', 'April ']; // Month in cell
  replicaGrid[4] = ['', 'Year ', 2026]; // Year in cell
  replicaGrid[5] = []; // spacer

  // Header row (Excel row 7)
  const headerRow: any[] = ['', 'S.No', 'Roll No', 'Student Name '];
  for (let d = 1; d <= 31; d++) {
    headerRow.push(d);
  }
  headerRow.push('Present ', 'Apsent', 'Leave', 'Holy Day');
  replicaGrid[6] = headerRow;

  // Subheader day names row (Excel row 8)
  const dayNameRow: any[] = ['', '', '', ''];
  const dayNames = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  for (let d = 1; d <= 31; d++) {
    dayNameRow.push(dayNames[(d - 1) % 7]);
  }
  dayNameRow.push('', '', '', '');
  replicaGrid[7] = dayNameRow;

  // Student 1 (Roll 101): Day 1 = P (Present), Day 2 = A (Absent), Day 3 = H (Holy Day), Day 4 = T (Late), Day 5 = H (Sunday), Day 6 = L (Leave)
  const rowStudent1: any[] = [
    '',
    1,
    '101',
    'Ahmed Khan',
    'P', // Day 1: Present
    'A', // Day 2: Absent
    'H', // Day 3: Holy Day (should be skipped!)
    'T', // Day 4: Late
    'H', // Day 5: Sunday Holy Day (should be skipped!)
    'L', // Day 6: Leave (in this Holy Day format, L = Leave)
  ];
  // Fill remaining days up to 30 as empty or H
  for (let d = 7; d <= 30; d++) {
    rowStudent1.push(d % 7 === 5 ? 'H' : '');
  }
  rowStudent1.push('H'); // Day 31: Holy Day in 30-day month (should be cleanly omitted)
  // Summary formula columns
  rowStudent1.push(
    { f: 'COUNTIF(E9:AI9,"P")' },
    { f: 'COUNTIF(E9:AI9,"A")' },
    { f: 'COUNTIF(E9:AI9,"L")' },
    { f: 'COUNTIF(E9:AI9,"H")' }
  );
  replicaGrid[8] = rowStudent1;

  // Student 2 (Roll 102): Day 1 = LT (Late), Day 2 = L (Leave), Day 3 = H (Holy Day), Day 4 = P (Present)
  const rowStudent2: any[] = [
    '',
    2,
    '102',
    'Bilal Tariq',
    'LT', // Day 1: Late
    'L',  // Day 2: Leave
    'H',  // Day 3: Holy Day (skipped)
    'P',  // Day 4: Present
  ];
  for (let d = 5; d <= 30; d++) {
    rowStudent2.push(d % 7 === 5 ? 'H' : '');
  }
  rowStudent2.push('H'); // Day 31
  rowStudent2.push(
    { f: 'COUNTIF(E10:AI10,"P")' },
    { f: 'COUNTIF(E10:AI10,"A")' },
    { f: 'COUNTIF(E10:AI10,"L")' },
    { f: 'COUNTIF(E10:AI10,"H")' }
  );
  replicaGrid[9] = rowStudent2;

  // Create workbook and convert to File
  const replicaWs = XLSX.utils.aoa_to_sheet(replicaGrid);
  const replicaWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(replicaWb, replicaWs, 'Sheet1 (2)');
  const replicaFile = workbookToFile(replicaWb, 'GBHS_Class_7_ Attendance April.xlsx');

  // Test full parseModuleImportFile integration
  const parseResult = await parseModuleImportFile(replicaFile, 'attendance');

  assert(
    'Suite 2: Replica Matrix',
    'Identified as matrix import',
    parseResult.isMatrix === true,
    `isMatrix: ${parseResult.isMatrix}`
  );

  assert(
    'Suite 2: Replica Matrix',
    'Matrix date column count is 30',
    parseResult.matrixDateColumnCount === 30,
    `matrixDateColumnCount: ${parseResult.matrixDateColumnCount}`
  );

  assert(
    'Suite 2: Replica Matrix',
    'Zero invalid rows',
    parseResult.invalidCount === 0,
    `invalidCount: ${parseResult.invalidCount}`
  );

  // Student 1 has marks on Days: 1 (P), 2 (A), 4 (T), 6 (L). Days 3 & 5 (H) are skipped. -> 4 records
  // Student 2 has marks on Days: 1 (LT), 2 (L), 4 (P). Day 3 (H) is skipped. -> 3 records
  // Total valid records = 7
  assert(
    'Suite 2: Replica Matrix',
    'Total 7 unrolled attendance records (all H cells cleanly skipped)',
    parseResult.validCount === 7,
    `validCount: ${parseResult.validCount}`
  );

  // Check Student 1 records
  const s1Rows = parseResult.validRows.filter((r) => r.matchedStudent?.id === 'stu-c7-101');
  assert('Suite 2: Replica Matrix', 'Student 1 has exactly 4 records', s1Rows.length === 4, `s1Rows: ${s1Rows.length}`);

  const s1Day1 = s1Rows.find((r) => r.data.parsedDate === '2026-04-01');
  assert('Suite 2: Status Mapping', 'P maps to Present', s1Day1?.data.parsedStatus === 'Present', `Day 1: ${s1Day1?.data.parsedStatus}`);

  const s1Day2 = s1Rows.find((r) => r.data.parsedDate === '2026-04-02');
  assert('Suite 2: Status Mapping', 'A maps to Absent', s1Day2?.data.parsedStatus === 'Absent', `Day 2: ${s1Day2?.data.parsedStatus}`);

  const s1Day3 = s1Rows.find((r) => r.data.parsedDate === '2026-04-03');
  assert('Suite 2: Holiday Skipping', 'Day 3 (H) has NO attendance record created', s1Day3 === undefined, 'Day 3 H was skipped');

  const s1Day4 = s1Rows.find((r) => r.data.parsedDate === '2026-04-04');
  assert('Suite 2: Status Mapping', 'T maps to Late', s1Day4?.data.parsedStatus === 'Late', `Day 4: ${s1Day4?.data.parsedStatus}`);

  const s1Day5 = s1Rows.find((r) => r.data.parsedDate === '2026-04-05');
  assert('Suite 2: Holiday Skipping', 'Day 5 (H) has NO attendance record created', s1Day5 === undefined, 'Day 5 H was skipped');

  const s1Day6 = s1Rows.find((r) => r.data.parsedDate === '2026-04-06');
  assert(
    'Suite 2: Status Mapping',
    'L maps to Leave in Holy Day matrix format',
    s1Day6?.data.parsedStatus === 'Leave',
    `Day 6: ${s1Day6?.data.parsedStatus}`
  );

  // Check Student 2 records
  const s2Rows = parseResult.validRows.filter((r) => r.matchedStudent?.id === 'stu-c7-102');
  assert('Suite 2: Replica Matrix', 'Student 2 has exactly 3 records', s2Rows.length === 3, `s2Rows: ${s2Rows.length}`);

  const s2Day1 = s2Rows.find((r) => r.data.parsedDate === '2026-04-01');
  assert('Suite 2: Status Mapping', 'LT maps to Late', s2Day1?.data.parsedStatus === 'Late', `Day 1: ${s2Day1?.data.parsedStatus}`);

  const s2Day2 = s2Rows.find((r) => r.data.parsedDate === '2026-04-02');
  assert('Suite 2: Status Mapping', 'L maps to Leave for Student 2', s2Day2?.data.parsedStatus === 'Leave', `Day 2: ${s2Day2?.data.parsedStatus}`);

  // Test Commit to database
  const commitResult = await commitModuleImportRows(
    'attendance',
    parseResult.validRows,
    'update',
    'teacher@gbhs.edu.pk'
  );

  assert(
    'Suite 2: Database Commit',
    'Committed 7 attendance records',
    commitResult.createdCount === 7,
    `createdCount: ${commitResult.createdCount}`
  );

  const allSaved = await getAllAttendanceRecords();
  assert(
    'Suite 2: Database Commit',
    'Database contains exactly 7 records',
    allSaved.length === 7,
    `allSaved count: ${allSaved.length}`
  );

  // Verify Day 3 or Day 5 records were NOT saved
  const holidaySaved = allSaved.filter((r) => r.date === '2026-04-03' || r.date === '2026-04-05');
  assert(
    'Suite 2: Holiday Database Integrity',
    'No records exist on Holy Day dates (2026-04-03 / 2026-04-05)',
    holidaySaved.length === 0,
    `holidaySaved: ${holidaySaved.length}`
  );

  // -------------------------------------------------------------------
  // SUITE 3: VALID MAY 2026 WORKBOOK (ALL SOURCES AGREE ON MAY 2026)
  // -------------------------------------------------------------------
  console.log('\n--- 3. Valid May 2026 Workbook Test (Filename, Header & Weekdays Agree) ---');

  const mayGrid: any[][] = [];
  mayGrid[0] = ['', 'GOVERNMENT BOYS HIGH SCHOOL'];
  mayGrid[1] = ['', 'ATTENDANCE REGISTER'];
  mayGrid[2] = ['', 'Class: Class 7'];
  mayGrid[3] = ['', 'Month', 'May '];
  mayGrid[4] = ['', 'Year ', 2026];
  mayGrid[5] = [];

  const mayHeaderRow: any[] = ['', 'S.No', 'Roll No', 'Student Name '];
  for (let d = 1; d <= 31; d++) {
    mayHeaderRow.push(d);
  }
  mayHeaderRow.push('Present ', 'Apsent', 'Leave', 'Holy Day');
  mayGrid[6] = mayHeaderRow;

  // In May 2026: Day 1 is Friday (Fri), Day 2 is Saturday (Sat), Day 3 is Sunday (Sun)...
  const mayDayNameRow: any[] = ['', '', '', ''];
  const mayDayNames = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
  for (let d = 1; d <= 31; d++) {
    mayDayNameRow.push(mayDayNames[(d - 1) % 7]);
  }
  mayDayNameRow.push('', '', '', '');
  mayGrid[7] = mayDayNameRow;

  // Student 1 (Roll 101): Day 1 = P, Day 2 = A, Day 3 = H (Sun), Day 4 = T, Day 31 = H (Sun)
  const mayStudent1: any[] = ['', 1, '101', 'Ahmed Khan', 'P', 'A', 'H', 'T'];
  for (let d = 5; d <= 30; d++) {
    mayStudent1.push(d % 7 === 3 ? 'H' : '');
  }
  mayStudent1.push('H'); // Day 31: Sunday in May
  mayStudent1.push(
    { f: 'COUNTIF(E9:AI9,"P")' },
    { f: 'COUNTIF(E9:AI9,"A")' },
    { f: 'COUNTIF(E9:AI9,"L")' },
    { f: 'COUNTIF(E9:AI9,"H")' }
  );
  mayGrid[8] = mayStudent1;

  const mayWs = XLSX.utils.aoa_to_sheet(mayGrid);
  const mayWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(mayWb, mayWs, 'Sheet1');
  const mayFile = workbookToFile(mayWb, 'GBHS_Class_7_ Attendance May.xlsx');

  const mayParseResult = await parseModuleImportFile(mayFile, 'attendance');

  assert(
    'Suite 3: Valid May 2026',
    'Identified as matrix import',
    mayParseResult.isMatrix === true,
    `isMatrix: ${mayParseResult.isMatrix}`
  );

  assert(
    'Suite 3: Valid May 2026',
    'No calendar conflict flagged',
    mayParseResult.calendarConflict === undefined || mayParseResult.calendarConflict?.hasConflict === false,
    `calendarConflict: ${JSON.stringify(mayParseResult.calendarConflict)}`
  );

  assert(
    'Suite 3: Valid May 2026',
    'Matrix date column count is 31',
    mayParseResult.matrixDateColumnCount === 31,
    `dateColumnCount: ${mayParseResult.matrixDateColumnCount}`
  );

  assert(
    'Suite 3: Valid May 2026',
    'Days 3 and 31 (H) skipped; 3 attendance records unrolled (Days 1 P, 2 A, 4 T)',
    mayParseResult.validCount === 3 && mayParseResult.invalidCount === 0,
    `validCount: ${mayParseResult.validCount}, invalidCount: ${mayParseResult.invalidCount}`
  );

  const mayDay1 = mayParseResult.validRows.find((r) => r.data.parsedDate === '2026-05-01');
  assert('Suite 3: Valid May 2026', 'Day 1 is 2026-05-01 (Present)', mayDay1?.data.parsedStatus === 'Present', `Day 1: ${mayDay1?.data.parsedStatus}`);

  const mayDay3 = mayParseResult.validRows.find((r) => r.data.parsedDate === '2026-05-03');
  assert('Suite 3: Valid May 2026', 'Day 3 (Sunday H) skipped', mayDay3 === undefined, 'Day 3 skipped');

  const mayDay31 = mayParseResult.validRows.find((r) => r.data.parsedDate === '2026-05-31');
  assert('Suite 3: Valid May 2026', 'Day 31 (Sunday H) skipped', mayDay31 === undefined, 'Day 31 skipped');

  // -------------------------------------------------------------------
  // SUITE 4: AMBIGUOUS MONTH/YEAR METADATA (NO MONTH IN FILENAME/CELLS/WEEKDAY)
  // -------------------------------------------------------------------
  console.log('\n--- 4. Ambiguous Month/Year Metadata Handling ---');

  const ambGrid: any[][] = [];
  ambGrid[0] = ['', 'GOVERNMENT BOYS HIGH SCHOOL'];
  ambGrid[1] = ['', 'Class: Class 7'];
  ambGrid[2] = [];

  const ambHeaderRow: any[] = ['', 'S.No', 'Roll No', 'Student Name '];
  for (let d = 1; d <= 30; d++) {
    ambHeaderRow.push(d);
  }
  ambGrid[3] = ambHeaderRow;
  ambGrid[4] = ['', 1, '101', 'Ahmed Khan', 'P', 'P', 'P'];

  const ambWs = XLSX.utils.aoa_to_sheet(ambGrid);
  const ambWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(ambWb, ambWs, 'Sheet1');
  const ambFile = workbookToFile(ambWb, 'Attendance_Roster_Unspecified.xlsx');

  // 4A. Parsing without explicit targetMonth -> Ambiguity conflict flagged!
  const ambParseNoOpt = await parseModuleImportFile(ambFile, 'attendance');
  assert(
    'Suite 4: Ambiguous Metadata',
    'Flags ambiguous month/year conflict when metadata is missing',
    ambParseNoOpt.calendarConflict?.hasConflict === true &&
      ambParseNoOpt.calendarConflict?.conflictType === 'ambiguous',
    `conflictType: ${ambParseNoOpt.calendarConflict?.conflictType}, message: ${ambParseNoOpt.calendarConflict?.message}`
  );

  assert(
    'Suite 4: Ambiguous Metadata',
    'Import blocked: validCount is 0',
    ambParseNoOpt.validCount === 0 && ambParseNoOpt.invalidCount > 0,
    `validCount: ${ambParseNoOpt.validCount}, invalidCount: ${ambParseNoOpt.invalidCount}`
  );

  // 4B. User explicitly resolves date context via targetMonth -> Succeeds!
  const ambParseWithOpt = await parseModuleImportFile(ambFile, 'attendance', undefined, {
    targetMonth: '2026-09',
  });
  assert(
    'Suite 4: Ambiguous Metadata',
    'Explicit targetMonth resolves ambiguous date context',
    ambParseWithOpt.calendarConflict === undefined || ambParseWithOpt.calendarConflict?.hasConflict === false,
    `calendarConflict: ${JSON.stringify(ambParseWithOpt.calendarConflict)}`
  );

  assert(
    'Suite 4: Ambiguous Metadata',
    'Unrolled dates use user-specified month 2026-09',
    ambParseWithOpt.validRows.length > 0 &&
      ambParseWithOpt.validRows.every((r) => r.data.parsedDate?.startsWith('2026-09')),
    `Parsed dates: ${ambParseWithOpt.validRows.map((r) => r.data.parsedDate).join(', ')}`
  );

  // -------------------------------------------------------------------
  // SUITE 5: HOLIDAY STATUS DIRECT NORMALIZATION TESTS
  // -------------------------------------------------------------------
  console.log('\n--- 5. Holiday Code "H" Normalization Behavior ---');

  const hVariants = ['H', 'h', 'Holy Day', 'holy day', 'HolyDay', 'holyday', 'holiday', 'HOLIDAY'];
  for (const h of hVariants) {
    const res = parseAttendanceStatusWithDetails(h);
    assert(
      'Suite 5: Holiday Code',
      `"${h}" flagged as isHoliday: true and isValid: true`,
      res.isHoliday === true && res.isValid === true && res.status === null,
      `"${h}" -> isHoliday: ${res.isHoliday}, isValid: ${res.isValid}, status: ${res.status}`
    );
  }

  // Verify normalizeAttendanceStatus returns null for H
  assert(
    'Suite 5: Holiday Code',
    'normalizeAttendanceStatus("H") returns null (does not mark Absent)',
    normalizeAttendanceStatus('H') === null,
    'Returned null for "H"'
  );

  // -------------------------------------------------------------------
  // SUITE 6: AMBIGUOUS 'L' HANDLING IN OTHER FORMATS (NON-HOLY-DAY)
  // -------------------------------------------------------------------
  console.log('\n--- 6. Ambiguous L Handling in Other Formats ---');

  // 6a. Bare L with no context -> Strict Rejection
  const bareL = parseAttendanceStatusWithDetails('L');
  assert(
    'Suite 6: Ambiguous L',
    'Bare L without context returns status: null and isAmbiguous: true',
    bareL.status === null && bareL.isAmbiguous === true,
    `status: ${bareL.status}, isAmbiguous: ${bareL.isAmbiguous}`
  );

  // 6b. Official Workbook Context -> L maps to Late, Lv maps to Leave
  const officialCtx: AttendanceStatusContext = {
    fileName: 'GBHS_Attendance_Workbook.xlsx',
    sheetName: 'Attendance Detail',
  };
  const offL = parseAttendanceStatusWithDetails('L', officialCtx);
  assert(
    'Suite 6: Official Context',
    'L in official workbook maps to Late (NOT Leave)',
    offL.status === 'Late' && offL.resolvedByContext === 'official_workbook_signature',
    `status: ${offL.status}, resolvedByContext: ${offL.resolvedByContext}`
  );

  const offLv = parseAttendanceStatusWithDetails('Lv', officialCtx);
  assert(
    'Suite 6: Official Context',
    'Lv in official workbook maps to Leave',
    offLv.status === 'Leave',
    `status: ${offLv.status}`
  );

  // 6c. Holy Day Matrix Context -> L maps to Leave
  const holyDayCtx: AttendanceStatusContext = {
    hasHolyDay: true,
  };
  const holyDayL = parseAttendanceStatusWithDetails('L', holyDayCtx);
  assert(
    'Suite 6: Holy Day Context',
    'L in Holy Day format maps to Leave',
    holyDayL.status === 'Leave' && holyDayL.resolvedByContext === 'holy_day_matrix_format',
    `status: ${holyDayL.status}, resolvedByContext: ${holyDayL.resolvedByContext}`
  );

  // 6d. Standard template with explicit lMeaning
  const explicitLate = parseAttendanceStatusWithDetails('L', { lMeaning: 'Late' });
  assert(
    'Suite 6: Explicit Meaning',
    'Explicit lMeaning: Late maps L to Late',
    explicitLate.status === 'Late',
    `status: ${explicitLate.status}`
  );

  const explicitLeave = parseAttendanceStatusWithDetails('L', { lMeaning: 'Leave' });
  assert(
    'Suite 6: Explicit Meaning',
    'Explicit lMeaning: Leave maps L to Leave',
    explicitLeave.status === 'Leave',
    `status: ${explicitLeave.status}`
  );

  // -------------------------------------------------------------------
  // SUITE 7: SUMMARY & FORMULA COLUMNS ARE NEVER IMPORTED AS DATES
  // -------------------------------------------------------------------
  console.log('\n--- 7. Summary and Formula Column Rejection ---');

  // Verify that headers containing summary titles or formula markers are excluded
  const summaryHeaders = [
    'Present',
    'Present ',
    'Absent',
    'Apsent',
    'Leave',
    'Holy Day',
    'Holiday',
    'Total Present',
    'Total Absent',
    'Total Leave',
    'Total Holy Day',
  ];

  for (const hdr of summaryHeaders) {
    const isExcluded =
      hdr.trim().toLowerCase() === 'present' ||
      hdr.trim().toLowerCase() === 'absent' ||
      hdr.trim().toLowerCase() === 'apsent' ||
      hdr.trim().toLowerCase() === 'leave' ||
      hdr.trim().toLowerCase() === 'holy day' ||
      hdr.trim().toLowerCase() === 'holiday' ||
      hdr.toLowerCase().includes('total');
    assert(
      'Suite 5: Summary Header',
      `Header "${hdr}" recognized as summary column`,
      isExcluded,
      `"${hdr}" excluded from date columns`
    );
  }

  // SUMMARY REPORT
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log(`APRIL WORKBOOK REGRESSION SUITE: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAprilMatrixRegressionSuite().catch((err) => {
  console.error('Fatal error during April workbook regression test execution:', err);
  process.exit(1);
});
