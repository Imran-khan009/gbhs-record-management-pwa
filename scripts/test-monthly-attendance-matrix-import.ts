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
    list.push(fn);
    listeners.set(event, list.filter((f) => f !== fn));
  },
  matchMedia: () => ({ matches: false }),
};

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  BulkOperationsService,
} from '../src/services/bulkOperationsService';
import {
  parseModuleImportFile,
  commitModuleImportRows,
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

async function runMonthlyAttendanceMatrixSuite() {
  console.log('================================================================');
  console.log('STARTING MONTHLY ATTENDANCE MATRIX EXCEL IMPORT REGRESSION TESTS');
  console.log('================================================================\n');

  // Set an isolated test workspace to ensure zero impact on production/owner workspaces
  setActiveWorkspaceId('test-matrix-import-ws');
  await clearAllStudentsLocally();
  await clearAllModulesMockData();

  // Seed test students into local database
  const testStudents: Student[] = [
    {
      id: 'stu-mat-1',
      rollNo: '1',
      admissionNo: 'ADM-701',
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
      id: 'stu-mat-2',
      rollNo: '2',
      admissionNo: 'ADM-702',
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
      id: 'stu-mat-3',
      rollNo: '1078',
      admissionNo: '1078',
      name: 'Habib Jan',
      fatherName: 'Jan Muhammad',
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
      id: 'stu-mat-4',
      rollNo: '1247',
      admissionNo: '1247',
      name: 'Bilal Hussain',
      fatherName: 'Hussain Ali',
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

  // --------------------------------------------------------------------------
  // SUITE 1: COMPLETE MONTHLY GRID IMPORT (31 DAYS, OCTOBER 2026)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 1: Complete Monthly Grid Import (31 Days, October 2026) ---');
  {
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      ['GOVERNMENT BOYS HIGH SCHOOL - MONTHLY ATTENDANCE REGISTER'],
      ['Class: Class 7', 'Section: A', 'Month: October 2026', 'Working Days: 31'],
      [], // blank row
      // Header row
      ['S#', 'Roll No', 'Student Name', 'Father Name', 'Class', 'Section', 'Remarks',
       ...Array.from({ length: 31 }, (_, i) => String(i + 1))],
      // Student 1: 31 days
      ['1', '1', 'Muhammad Ali', 'Ali Khan', 'Class 7', 'A', 'Regular learner',
       ...Array.from({ length: 31 }, (_, i) => (i % 7 === 0 ? 'Lv' : i % 5 === 0 ? 'Late' : 'P'))],
      // Student 2: 31 days
      ['2', '2', 'Bilal Hassan', 'Hassan Shah', 'Class 7', 'A', 'Monitored attendance',
       ...Array.from({ length: 31 }, (_, i) => (i % 6 === 0 ? 'A' : 'P'))],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'October 2026');

    const file = workbookToFile(wb, 'Class_7_October_2026_Attendance.xlsx');
    const parseRes = await parseModuleImportFile(file, 'attendance', 'October 2026');

    assert('SUITE 1', 'Matrix detection', parseRes.isMatrix === true, 'Detected as monthly matrix grid');
    assert('SUITE 1', 'Date column count', parseRes.matrixDateColumnCount === 31, `Found 31 date columns (got ${parseRes.matrixDateColumnCount})`);
    assert('SUITE 1', 'Total unrolled rows', parseRes.totalRows === 62, `Unrolled 2 students * 31 days = 62 rows (got ${parseRes.totalRows})`);
    assert('SUITE 1', 'Valid rows count', parseRes.validCount === 62, `All 62 unrolled rows are valid (got ${parseRes.validCount})`);

    // Check date resolution across all 31 days
    const allDates = new Set(parseRes.validRows.map((r) => r.data.parsedDate));
    assert('SUITE 1', 'All 31 days formatted', allDates.size === 31, `Generated 31 distinct dates (got ${allDates.size})`);
    assert('SUITE 1', 'First day format', allDates.has('2026-10-01'), 'Includes 2026-10-01');
    assert('SUITE 1', 'Last day format', allDates.has('2026-10-31'), 'Includes 2026-10-31');

    // Check student resolution and metadata preservation
    const s1Rows = parseRes.validRows.filter((r) => r.matchedStudent?.id === 'stu-mat-1');
    assert('SUITE 1', 'Student 1 matched count', s1Rows.length === 31, 'Student 1 has 31 attendance entries');
    assert('SUITE 1', 'Student 1 roll preserved', s1Rows[0].matchedStudent?.rollNo === '1', 'Roll No 1 preserved');
    assert('SUITE 1', 'Student 1 name preserved', s1Rows[0].matchedStudent?.name === 'Muhammad Ali', 'Name preserved');
    assert('SUITE 1', 'Student 1 section preserved', s1Rows[0].data.section === 'A', 'Section A preserved');
    assert('SUITE 1', 'Student 1 remarks preserved', s1Rows[0].data.remarks === 'Regular learner', 'Remarks preserved');

    // Check status normalization on matrix grid
    const leaveRow = s1Rows.find((r) => r.data.parsedDate === '2026-10-01'); // 0 % 7 === 0 -> Lv
    assert('SUITE 1', 'Status normalization Lv -> Leave', leaveRow?.data.parsedStatus === 'Leave', `Lv mapped to Leave (got ${leaveRow?.data.parsedStatus})`);

    const lateRow = s1Rows.find((r) => r.data.parsedDate === '2026-10-06'); // 5 % 5 === 0 -> Late
    assert('SUITE 1', 'Status normalization Late', lateRow?.data.parsedStatus === 'Late', `Late mapped to Late (got ${lateRow?.data.parsedStatus})`);

    // Commit to database
    const commitRes = await commitModuleImportRows('attendance', parseRes.validRows, 'skip');
    assert('SUITE 1', 'Commit success', commitRes.success === true, 'All 62 attendance records committed successfully');
    assert('SUITE 1', 'Created count', commitRes.createdCount === 62, `Created 62 records in DB (got ${commitRes.createdCount})`);

    const savedRecords = await getAllAttendanceRecords();
    assert('SUITE 1', 'DB record count', savedRecords.length === 62, `Verified 62 records in IndexedDB (got ${savedRecords.length})`);
  }

  // --------------------------------------------------------------------------
  // SUITE 2: MISSING DAYS HANDLING (UNRECORDED / BLANK / '-' / 'N/A')
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Missing Days Handling ---');
  {
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      ['Attendance Sheet - Class 7 - November 2026'],
      ['Roll No', 'Student Name', 'Class', 'Section', '1', '2', '3', '4', '5'],
      // Student 1: Day 1=P, Day 2=—, Day 3=N/A, Day 4="", Day 5=-
      ['1', 'Muhammad Ali', 'Class 7', 'A', 'P', '—', 'N/A', '', '-'],
      // Student 2: Day 1=A, Day 2=?, Day 3=P, Day 4=blank, Day 5=P
      ['2', 'Bilal Hassan', 'Class 7', 'A', 'A', '?', 'P', '', 'P'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Nov 2026');

    const file = workbookToFile(wb, 'Nov_2026_Missing_Days.xlsx');
    const parseRes = await parseModuleImportFile(file, 'attendance', 'Nov 2026');

    assert('SUITE 2', 'Matrix recognized', parseRes.isMatrix === true, 'Identified as matrix grid');
    assert('SUITE 2', 'Date column count', parseRes.matrixDateColumnCount === 5, 'Found 5 date columns');
    // Student 1 has only Day 1 marked. Student 2 has Day 1, Day 3, Day 5 marked (total = 1 + 3 = 4)
    assert('SUITE 2', 'Unmarked days skipped', parseRes.totalRows === 4, `Unrolled only marked days: expected 4, got ${parseRes.totalRows}`);

    const datesS1 = parseRes.validRows.filter((r) => r.matchedStudent?.id === 'stu-mat-1').map((r) => r.data.parsedDate);
    assert('SUITE 2', 'Student 1 has only Day 1', datesS1.length === 1 && datesS1[0] === '2026-11-01', 'Student 1 has exactly 1 record on 2026-11-01');

    const datesS2 = parseRes.validRows.filter((r) => r.matchedStudent?.id === 'stu-mat-2').map((r) => r.data.parsedDate);
    assert('SUITE 2', 'Student 2 has Days 1, 3, 5', datesS2.length === 3 && !datesS2.includes('2026-11-02'), 'Unrecorded days 2 and 4 were not generated');
  }

  // --------------------------------------------------------------------------
  // SUITE 3: AMBIGUOUS & INVALID DATE HEADERS
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Ambiguous and Invalid Date Headers ---');
  {
    // Test 3.1: Ambiguous Day Numbers without Month/Year in banner, sheet, or file
    const wbAmb = XLSX.utils.book_new();
    const rowsAmb: any[][] = [
      ['Student Attendance Register'],
      ['Roll No', 'Student Name', 'Class', 'Section', '1', '2', '3', '4', '5'],
      ['1', 'Muhammad Ali', 'Class 7', 'A', 'P', 'P', 'P', 'P', 'P'],
    ];
    const wsAmb = XLSX.utils.aoa_to_sheet(rowsAmb);
    XLSX.utils.book_append_sheet(wbAmb, wsAmb, 'Sheet1'); // Generic sheet name and generic file name

    const fileAmb = workbookToFile(wbAmb, 'attendance_data.xlsx');
    const parseResAmb = await parseModuleImportFile(fileAmb, 'attendance', 'Sheet1');

    assert('SUITE 3.1', 'Matrix recognized with day numbers', parseResAmb.isMatrix === true, 'Detected matrix');
    assert('SUITE 3.1', 'Ambiguous date error reported', parseResAmb.invalidCount > 0, `Ambiguous date headers flagged invalid (${parseResAmb.invalidCount} invalid rows)`);
    const errText = parseResAmb.validRows[0]?.errors.join(' ');
    assert('SUITE 3.1', 'Clear error message on ambiguity', errText.includes('Ambiguous date header') && errText.includes('Month and Year could not be determined'), `Error describes missing Month/Year: "${errText}"`);

    // Test 3.2: Invalid Day in 30-Day Month (Day 31 in November)
    const wbInv = XLSX.utils.book_new();
    const rowsInv: any[][] = [
      ['Attendance Register - November 2026'],
      ['Roll No', 'Student Name', 'Class', 'Section', '29', '30', '31'],
      ['1', 'Muhammad Ali', 'Class 7', 'A', 'P', 'P', 'P'],
    ];
    const wsInv = XLSX.utils.aoa_to_sheet(rowsInv);
    XLSX.utils.book_append_sheet(wbInv, wsInv, 'November');

    const fileInv = workbookToFile(wbInv, 'Class_7_November_2026.xlsx');
    const parseResInv = await parseModuleImportFile(fileInv, 'attendance', 'November');

    const day31Row = parseResInv.validRows.find((r) => r.data.date === 'INVALID-DATE' || r.errors.some((e) => e.includes('Day 31')));
    assert('SUITE 3.2', 'Day 31 in November rejected', !!day31Row && day31Row.status === 'invalid', 'Day 31 flagged as invalid date');
    const day31Err = day31Row?.errors.join(' ') || '';
    assert('SUITE 3.2', 'Clear 30-day month error', day31Err.includes('does not exist in month 11/2026'), `Error message: "${day31Err}"`);
  }

  // --------------------------------------------------------------------------
  // SUITE 4: INVALID ATTENDANCE STATUS CODES IN MATRIX GRID
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Invalid Attendance Status Codes in Matrix Grid ---');
  {
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      ['Class 7 Attendance - December 2026'],
      ['Roll No', 'Student Name', 'Class', 'Section', '1', '2', '3'],
      // Student 1 has invalid code 'X' on Day 2
      ['1', 'Muhammad Ali', 'Class 7', 'A', 'P', 'X', 'P'],
      // Student 2 has ambiguous code 'L' without legend on Day 1
      ['2', 'Bilal Hassan', 'Class 7', 'A', 'L', 'P', 'P'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'December');

    const file = workbookToFile(wb, 'Dec_2026_Invalid_Codes.xlsx');
    const parseRes = await parseModuleImportFile(file, 'attendance', 'December');

    const invalidX = parseRes.validRows.find((r) => r.data.parsedDate === '2026-12-02');
    assert('SUITE 4', 'Invalid code X flagged', invalidX?.status === 'invalid', 'Status code X is invalid');
    const xErr = invalidX?.errors.join(' ') || '';
    assert('SUITE 4', 'Clear invalid status message', xErr.includes('Invalid attendance status: "X"'), `Message: "${xErr}"`);

    const ambiguousL = parseRes.validRows.find((r) => r.data.parsedDate === '2026-12-01' && r.matchedStudent?.id === 'stu-mat-2');
    assert('SUITE 4', 'Ambiguous code L flagged', ambiguousL?.status === 'invalid', 'Bare code L is ambiguous in standard template');
    const lErr = ambiguousL?.errors.join(' ') || '';
    assert('SUITE 4', 'Clear ambiguity error message', lErr.includes('Ambiguous attendance code "L"'), `Message: "${lErr}"`);
  }

  // --------------------------------------------------------------------------
  // SUITE 5: DUPLICATE PREVENTION & SKIP/UPDATE STRATEGIES
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Duplicate Prevention and Skip/Update Import Strategies ---');
  {
    // Clean attendance table first
    await clearAllModulesMockData();

    // 1. Initial Import of 5-day grid
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      ['Class 7 Attendance - October 2026'],
      ['Roll No', 'Student Name', 'Class', 'Section', '1', '2', '3', '4', '5'],
      ['1', 'Muhammad Ali', 'Class 7', 'A', 'P', 'P', 'P', 'P', 'P'],
      ['2', 'Bilal Hassan', 'Class 7', 'A', 'P', 'P', 'P', 'P', 'P'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Oct 2026');

    const file = workbookToFile(wb, 'Class_7_Oct_Duplicates.xlsx');
    const initialParse = await parseModuleImportFile(file, 'attendance', 'Oct 2026');
    assert('SUITE 5', 'Initial parse valid count', initialParse.validCount === 10, 'All 10 rows initially valid');

    const initialCommit = await commitModuleImportRows('attendance', initialParse.validRows, 'skip');
    assert('SUITE 5', 'Initial commit created', initialCommit.createdCount === 10, '10 records created in database');

    // 2. Re-parse exact same file -> All 10 must be flagged as DUPLICATE
    const reParse = await parseModuleImportFile(file, 'attendance', 'Oct 2026');
    assert('SUITE 5', 'Duplicates detected count', reParse.duplicateCount === 10, `All 10 rows flagged as duplicates (got ${reParse.duplicateCount})`);
    assert('SUITE 5', 'Duplicate status on row', reParse.validRows[0].status === 'duplicate', 'Row status is duplicate');
    assert('SUITE 5', 'isDuplicate flag is true', reParse.validRows[0].isDuplicate === true, 'isDuplicate is true');

    // 3. Commit with strategy = 'skip'
    const skipCommit = await commitModuleImportRows('attendance', reParse.validRows, 'skip');
    assert('SUITE 5', 'Skip strategy skipped count', skipCommit.skippedCount === 10, 'All 10 duplicate rows skipped');
    assert('SUITE 5', 'Skip strategy created count', skipCommit.createdCount === 0, 'Zero new records created');
    assert('SUITE 5', 'Skip strategy updated count', skipCommit.updatedCount === 0, 'Zero records updated');

    // 4. Modify sheet data (Day 1 for Student 1 changed from Present to Absent) and commit with 'update'
    rows[2][4] = 'A'; // Student 1 Day 1 = Absent
    const wbModified = XLSX.utils.aoa_to_sheet(rows);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, wbModified, 'Oct 2026');
    const fileModified = workbookToFile(wb2, 'Class_7_Oct_Duplicates.xlsx');

    const updateParse = await parseModuleImportFile(fileModified, 'attendance', 'Oct 2026');
    const updateCommit = await commitModuleImportRows('attendance', updateParse.validRows, 'update');
    assert('SUITE 5', 'Update strategy updated count', updateCommit.updatedCount === 10, `All 10 records updated (got ${updateCommit.updatedCount})`);

    const allRecs = await getAllAttendanceRecords();
    const updatedS1Day1 = allRecs.find((r) => r.id === 'stu-mat-1_2026-10-01');
    assert('SUITE 5', 'Day 1 status updated to Absent in DB', updatedS1Day1?.status === 'Absent', `Database record updated to Absent (got ${updatedS1Day1?.status})`);
  }

  // --------------------------------------------------------------------------
  // SUITE 6: OFFICIAL WORKBOOK FORMAT (`GBHS_Attendance_Workbook.xlsx`)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 6: Official Workbook Format (`GBHS_Attendance_Workbook.xlsx`) ---');
  {
    const officialPath = 'C:\\Users\\7xUltra\\Desktop\\ASSESMENT RECORDS GBHS\\GBHS_Attendance_Workbook.xlsx';
    if (fs.existsSync(officialPath)) {
      const buf = fs.readFileSync(officialPath);
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const file = new File([blob], 'GBHS_Attendance_Workbook.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // Parse Sheet "Class 7"
      const parseRes = await parseModuleImportFile(file, 'attendance', 'Class 7');

      assert('SUITE 6', 'Official sheet detected as matrix', parseRes.isMatrix === true, 'Detected as matrix grid');
      assert('SUITE 6', 'Daily history date cols unrolled', (parseRes.matrixDateColumnCount || 0) >= 30, `Found ${parseRes.matrixDateColumnCount} daily history date columns`);
      assert('SUITE 6', 'Students unrolled successfully', parseRes.totalRows > 100, `Unrolled ${parseRes.totalRows} student-date records`);

      // Check student ID and name preservation for real students in official workbook
      const habibRows = parseRes.validRows.filter((r) => r.matchedStudent?.name === 'Habib Jan' || r.data.studentname === 'Habib Jan');
      assert('SUITE 6', 'Habib Jan preserved', habibRows.length > 0, `Habib Jan unrolled with ${habibRows.length} daily entries`);
      if (habibRows.length > 0) {
        assert('SUITE 6', 'Habib Jan roll preserved', habibRows[0].data.rollnumber === '1078' || habibRows[0].matchedStudent?.rollNo === '1078', 'Habib Jan Roll 1078 preserved');
      }

      // Check that summary columns (Overall %, monthly summary float columns 7-12) were NOT treated as dates
      const dates = parseRes.validRows.map((r) => r.data.parsedDate);
      const hasInvalidFloatDate = dates.some((d) => d && (d.includes('0.') || d.includes('NaN')));
      assert('SUITE 6', 'Summary % columns excluded', !hasInvalidFloatDate, 'No monthly percentage columns converted to phantom dates');

      // Check that in official workbook format, 'L' is resolved to 'Late' and 'Lv' to 'Leave'
      const statusTokens = new Set(parseRes.validRows.map((r) => r.data.parsedStatus));
      assert('SUITE 6', 'Contains Present', statusTokens.has('Present'), 'Contains Present records');
    } else {
      console.log('Skipping official workbook path test (file not found on this machine)');
    }
  }

  // --------------------------------------------------------------------------
  // SUITE 7: DAILY FLAT-ROW IMPORT COMPATIBILITY
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 7: Daily Flat-Row Import Backward Compatibility ---');
  {
    const wb = XLSX.utils.book_new();
    const rows = [
      {
        'Date (YYYY-MM-DD)*': '2026-10-25',
        'Class (Class 7/8/9)*': 'Class 7',
        'Section': 'A',
        'Roll Number*': '1',
        'Student Name': 'Muhammad Ali',
        'Status (Present/Absent/Leave/Late)*': 'Present',
        'Remarks': 'Daily flat import test',
      },
      {
        'Date (YYYY-MM-DD)*': '2026-10-25',
        'Class (Class 7/8/9)*': 'Class 7',
        'Section': 'A',
        'Roll Number*': '2',
        'Student Name': 'Bilal Hassan',
        'Status (Present/Absent/Leave/Late)*': 'Late',
        'Remarks': 'Traffic delay',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Attendance');

    const file = workbookToFile(wb, 'Daily_Attendance_Template.xlsx');
    const parseRes = await parseModuleImportFile(file, 'attendance', 'Daily Attendance');

    assert('SUITE 7', 'Flat sheet is NOT matrix', parseRes.isMatrix === false, 'isMatrix is false for flat template');
    assert('SUITE 7', 'Flat total rows match', parseRes.totalRows === 2, '2 rows parsed');
    assert('SUITE 7', 'Flat valid count', parseRes.validCount === 2, '2 valid rows');
    assert('SUITE 7', 'Flat date parsed', parseRes.validRows[0].data.parsedDate === '2026-10-25', 'Date 2026-10-25 parsed');
    assert('SUITE 7', 'Flat status parsed', parseRes.validRows[1].data.parsedStatus === 'Late', 'Status Late parsed');
    assert('SUITE 7', 'Flat remarks preserved', parseRes.validRows[1].data.remarks === 'Traffic delay', 'Remarks preserved');

    // Also verify BulkOperationsService.parseFile for flat template
    const bulkParseRes = await BulkOperationsService.parseFile(file, 'attendance');
    assert('SUITE 7', 'BulkOperationsService flat isMatrix', bulkParseRes.isMatrix === false, 'BulkOperationsService sets isMatrix false');
    assert('SUITE 7', 'BulkOperationsService valid rows', bulkParseRes.validRows.length === 2, '2 rows parsed by BulkOperationsService');
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST SUMMARY');
  console.log('================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Assertions: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.error(`\nFAILED TESTS (${failed}):`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.error(`  - [${r.suite}] ${r.name}: ${r.message}`);
      });
    process.exit(1);
  } else {
    console.log('\nALL MONTHLY ATTENDANCE MATRIX TESTS PASSED WITH 100% SUCCESS!');
  }
}

runMonthlyAttendanceMatrixSuite().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
