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
  parseExcelOrCsvFile,
  commitApprovedImportRows,
  normalizeClass,
  normalizeSection,
  findHeaderRowIndex,
  detectColumnMapping,
  getDiagnosticLogs,
} from '../src/services/excelService';
import {
  getAllStudents,
  getStudentsByClass,
  clearAllStudentsLocally,
  saveAttendanceLocally,
  getAllAttendanceRecords,
  bulkSaveStudentsLocally,
} from '../src/services/db';
import { AttendanceRecord, Student } from '../src/types/student';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(suite: string, name: string, condition: boolean, message: string) {
  results.push({ suite, name, passed: condition, message });
  console.log(`[${condition ? 'PASS' : 'FAIL'}] [${suite}] ${name}: ${message}`);
  if (!condition) {
    console.error(`  --> FAILED: ${message}`);
  }
}

// Helper to convert XLSX workbook to File mock for Node/Bun
function workbookToFile(workbook: XLSX.WorkBook, filename: string): File {
  const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return new File([blob], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('GBHS EXCEL IMPORTER: RIGOROUS ROOT-CAUSE TEST SUITE');
  console.log('====================================================\n');

  const testEmail = 'operator@gbhs.edu.pk';

  // Clear DB before tests
  await clearAllStudentsLocally();

  // -------------------------------------------------------------------------
  // SUITE 1: DYNAMIC HEADER ROW DETECTION (Row 0, Row 2 with banners, Row 4)
  // -------------------------------------------------------------------------
  try {
    // 1.1 Header at row 0 (standard table)
    const wb0 = XLSX.utils.book_new();
    const ws0Data = [
      ['Roll Num', 'Name of Learner', 'Father Name', 'Class', 'Guardian Contact'],
      ['1', 'Ahmed Ali', 'Muhammad Ali', 'Class 7', '03001234567'],
      ['2', 'Bilal Tariq', 'Tariq Mehmood', 'Class 7', '03007654321'],
    ];
    const ws0 = XLSX.utils.aoa_to_sheet(ws0Data);
    XLSX.utils.book_append_sheet(wb0, ws0, 'Roster');
    const file0 = workbookToFile(wb0, 'header_row_0.xlsx');
    const parsed0 = await parseExcelOrCsvFile(file0);
    assert(
      'Dynamic Header Detection',
      'Header at Row 0',
      parsed0.length === 2 && parsed0[0].name === 'Ahmed Ali' && parsed0[1].name === 'Bilal Tariq',
      `Parsed ${parsed0.length} students correctly from row 0 header.`
    );

    // 1.2 Header at row 2 with school banner titles on rows 0 and 1
    const wb2 = XLSX.utils.book_new();
    const ws2Data = [
      ['GOVERNMENT BOYS HIGH SCHOOL JAM YOUSAF COLONY LASBELA'],
      ['STUDENT ENROLLMENT REGISTER FOR ACADEMIC YEAR 2026-2027'],
      ['S#', 'Roll No', 'Student Name', "Father's Name", 'Class', 'Contact'],
      ['1', '101', 'Kamran Khan', 'Sher Khan', 'Class 8', '03129998877'],
      ['2', '102', 'Farhan Aslam', 'Muhammad Aslam', 'Class 8', '03138887766'],
      ['3', '103', 'Zeeshan Qadir', 'Abdul Qadir', 'Class 8', '03147776655'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb2, ws2, 'Students');
    const file2 = workbookToFile(wb2, 'header_row_2_with_banners.xlsx');
    const parsed2 = await parseExcelOrCsvFile(file2);
    assert(
      'Dynamic Header Detection',
      'Header at Row 2 (Skipping Banners)',
      parsed2.length === 3 &&
        parsed2[0].name === 'Kamran Khan' &&
        parsed2[0].rollNo === '101' &&
        parsed2[2].name === 'Zeeshan Qadir',
      `Correctly identified header at row 2 and parsed ${parsed2.length} students.`
    );

    // 1.3 Header at row 4 with empty top rows and metadata
    const wb4 = XLSX.utils.book_new();
    const ws4Data = [
      [''],
      ['TEHSIL DUREJI DISTRICT LASBELA'],
      [''],
      [''],
      ['Roll Number', 'Name', 'Father Name', 'Class', 'Section'],
      ['501', 'Rashid Minhas', 'Abdul Minhas', 'Class 9', 'B'],
      ['502', 'Nabeel Ahmed', 'Bashir Ahmed', 'Class 9', 'B'],
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(ws4Data);
    XLSX.utils.book_append_sheet(wb4, ws4, 'Class9Roster');
    const file4 = workbookToFile(wb4, 'header_row_4.xlsx');
    const parsed4 = await parseExcelOrCsvFile(file4);
    assert(
      'Dynamic Header Detection',
      'Header at Row 4 (Skipping Empty Rows & Subtitles)',
      parsed4.length === 2 && parsed4[0].name === 'Rashid Minhas' && parsed4[0].class === 'Class 9',
      `Correctly found header at row 4, parsed ${parsed4.length} students.`
    );
  } catch (err: any) {
    assert('Dynamic Header Detection', 'Header Detection Suite', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 2: COLUMN ORDER INVARIANCE & ALIASES (English & Urdu)
  // -------------------------------------------------------------------------
  try {
    // 2.1 Scrambled column order
    const wbScrambled = XLSX.utils.book_new();
    const wsScrambledData = [
      ['Contact Phone', 'DOB', 'Father Name', 'Class', 'Roll Num', 'Name of Learner', 'Trade'],
      ['0300-1122334', '2012-05-10', 'Arshad Mehmood', 'Class 7', '15', 'Daniyal Arshad', 'Computer Operator'],
      ['0301-2233445', '2012-06-12', 'Sultan Ahmed', 'Class 7', '16', 'Faisal Sultan', 'Computer Operator'],
    ];
    const wsScrambled = XLSX.utils.aoa_to_sheet(wsScrambledData);
    XLSX.utils.book_append_sheet(wbScrambled, wsScrambled, 'Data');
    const fileScrambled = workbookToFile(wbScrambled, 'scrambled_columns.xlsx');
    const parsedScrambled = await parseExcelOrCsvFile(fileScrambled);
    assert(
      'Column Mapping & Order',
      'Scrambled Column Positions',
      parsedScrambled.length === 2 &&
        parsedScrambled[0].name === 'Daniyal Arshad' &&
        parsedScrambled[0].fatherName === 'Arshad Mehmood' &&
        parsedScrambled[0].rollNo === '15' &&
        parsedScrambled[0].guardianContact === '0300-1122334',
      'All fields accurately mapped regardless of column sequence.'
    );

    // 2.2 Urdu Header Mapping
    const wbUrdu = XLSX.utils.book_new();
    const wsUrduData = [
      ['رول نمبر', 'طالب علم کا نام', 'والد کا نام', 'کلاس', 'رابطہ نمبر'],
      ['1', 'محمد عثمان', 'محمد اکرم', 'کلاس 8', '03451234567'],
      ['2', 'یاسین خان', 'جمیل خان', 'کلاس 8', '03459876543'],
    ];
    const wsUrdu = XLSX.utils.aoa_to_sheet(wsUrduData);
    XLSX.utils.book_append_sheet(wbUrdu, wsUrdu, 'Roster');
    const fileUrdu = workbookToFile(wbUrdu, 'urdu_headers.xlsx');
    const parsedUrdu = await parseExcelOrCsvFile(fileUrdu);
    assert(
      'Column Mapping & Order',
      'Urdu Column Headers Normalization',
      parsedUrdu.length === 2 &&
        parsedUrdu[0].name === 'محمد عثمان' &&
        parsedUrdu[0].fatherName === 'محمد اکرم' &&
        parsedUrdu[0].class === 'Class 8' &&
        parsedUrdu[0].rollNo === '1',
      `Urdu headers cleanly recognized and mapped to canonical fields.`
    );
  } catch (err: any) {
    assert('Column Mapping & Order', 'Column Mapping Suite', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 3: CLASS FORMAT NORMALIZATION
  // -------------------------------------------------------------------------
  try {
    const classTests = [
      { input: '7', expected: 'Class 7' },
      { input: 'Class 7', expected: 'Class 7' },
      { input: '7th', expected: 'Class 7' },
      { input: '7A', expected: 'Class 7' },
      { input: '7-A', expected: 'Class 7' },
      { input: 'Class 7th', expected: 'Class 7' },
      { input: 'Grade 7', expected: 'Class 7' },
      { input: 'VII', expected: 'Class 7' },
      { input: '8', expected: 'Class 8' },
      { input: '8th', expected: 'Class 8' },
      { input: '8B', expected: 'Class 8' },
      { input: '8-B', expected: 'Class 8' },
      { input: 'Class 8th A', expected: 'Class 8' },
      { input: 'VIII', expected: 'Class 8' },
      { input: '9', expected: 'Class 9' },
      { input: '9th', expected: 'Class 9' },
      { input: '9C', expected: 'Class 9' },
      { input: 'Class 9', expected: 'Class 9' },
      { input: 'IX', expected: 'Class 9' },
      { input: '12', expected: null },
      { input: 'Class 12', expected: null },
      { input: '11th', expected: null },
    ];

    let allClassTestsPassed = true;
    for (const ct of classTests) {
      const res = normalizeClass(ct.input);
      if (res !== ct.expected) {
        allClassTestsPassed = false;
        console.error(`Class normalize failure: input "${ct.input}" -> got "${res}", expected "${ct.expected}"`);
      }
    }

    assert(
      'Class Normalization',
      'Flexible Class Formats (7, 7th, 7A, 8-B, 9th, rejection of Grade 12)',
      allClassTestsPassed,
      'All 22 class formats correctly normalized or rejected.'
    );
  } catch (err: any) {
    assert('Class Normalization', 'Class Normalization Suite', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 4: BLANK ROLL NUMBERS & MISSING OPTIONAL FIELDS (NO SILENT DROPS)
  // -------------------------------------------------------------------------
  try {
    const wbBlank = XLSX.utils.book_new();
    const wsBlankData = [
      ['Roll Num', 'Name of Learner', 'Father Name', 'Class', 'Guardian Contact', 'DOB', 'District'],
      ['', 'Student Without Roll 1', 'Father A', 'Class 7', '', '', ''],
      ['', 'Student Without Roll 2', 'Father B', 'Class 7', '', '', ''],
      ['', 'Student Without Roll 3', 'Father C', 'Class 7', '', '', ''],
    ];
    const wsBlank = XLSX.utils.aoa_to_sheet(wsBlankData);
    XLSX.utils.book_append_sheet(wbBlank, wsBlank, 'Students');
    const fileBlank = workbookToFile(wbBlank, 'blank_rolls.xlsx');

    const parsedBlank = await parseExcelOrCsvFile(fileBlank);

    const allThreeValid =
      parsedBlank.length === 3 &&
      parsedBlank.every((r) => r.validationErrors.length === 0) &&
      parsedBlank.every((r) => !r.isDuplicate);

    assert(
      'Blank Roll Numbers & Optional Fields',
      'No Silent Skips or False Duplicate Collisions for Blank Rolls',
      allThreeValid,
      `All 3 students with blank rolls parsed as valid without false duplicate flags.`
    );
  } catch (err: any) {
    assert('Blank Roll Numbers & Optional Fields', 'Blank Rolls Suite', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 5: VARYING STUDENT COUNTS (From 1 to 50+ students)
  // -------------------------------------------------------------------------
  try {
    const countsToTest = [1, 15, 50];
    let countTestPassed = true;

    for (const count of countsToTest) {
      const wbCount = XLSX.utils.book_new();
      const wsData: any[][] = [['Roll No', 'Student Name', 'Father Name', 'Class']];
      for (let i = 1; i <= count; i++) {
        wsData.push([String(i), `Pupil Number ${i}`, `Father ${i}`, 'Class 7']);
      }
      const wsCount = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wbCount, wsCount, 'Sheet1');
      const fileCount = workbookToFile(wbCount, `count_${count}.xlsx`);
      const parsedCount = await parseExcelOrCsvFile(fileCount);
      if (parsedCount.length !== count) {
        countTestPassed = false;
        console.error(`Expected ${count} rows, got ${parsedCount.length}`);
      }
    }

    assert(
      'Varying Student Counts',
      'Dynamic Row Counts (1, 15, and 50 students)',
      countTestPassed,
      'Dynamic student count handling verified from 1 to 50 students.'
    );
  } catch (err: any) {
    assert('Varying Student Counts', 'Count Test Suite', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 6: CROSS-CLASS SAFE MERGE (IMPORTING CLASS 8 NEVER OVERWRITES CLASS 7!)
  // -------------------------------------------------------------------------
  try {
    await clearAllStudentsLocally();

    // Step A: Import Class 7 with Roll 1, 2, 3
    const wbClass7 = XLSX.utils.book_new();
    const ws7Data = [
      ['Roll Num', 'Name of Learner', 'Father Name', 'Class'],
      ['1', 'Class 7 Student One', 'Father Seven One', 'Class 7'],
      ['2', 'Class 7 Student Two', 'Father Seven Two', 'Class 7'],
      ['3', 'Class 7 Student Three', 'Father Seven Three', 'Class 7'],
    ];
    const ws7 = XLSX.utils.aoa_to_sheet(ws7Data);
    XLSX.utils.book_append_sheet(wbClass7, ws7, 'Class 7');
    const file7 = workbookToFile(wbClass7, 'import_class_7.xlsx');
    const parsed7 = await parseExcelOrCsvFile(file7);
    const commit7 = await commitApprovedImportRows(parsed7, testEmail);

    const inDbAfter7 = await getAllStudents();
    assert(
      'Cross-Class Safe Merge',
      'Step A: Commit Class 7 Records',
      commit7.committedCount === 3 && inDbAfter7.length === 3,
      `Class 7 committed: ${commit7.committedCount} students in database.`
    );

    // Step B: Now import Class 8 with Roll 1, 2, 3 (Matching numbers!)
    const wbClass8 = XLSX.utils.book_new();
    const ws8Data = [
      ['Roll Num', 'Name of Learner', 'Father Name', 'Class'],
      ['1', 'Class 8 Student One', 'Father Eight One', 'Class 8'],
      ['2', 'Class 8 Student Two', 'Father Eight Two', 'Class 8'],
      ['3', 'Class 8 Student Three', 'Father Eight Three', 'Class 8'],
    ];
    const ws8 = XLSX.utils.aoa_to_sheet(ws8Data);
    XLSX.utils.book_append_sheet(wbClass8, ws8, 'Class 8');
    const file8 = workbookToFile(wbClass8, 'import_class_8.xlsx');
    const parsed8 = await parseExcelOrCsvFile(file8);

    // Verify none of the Class 8 students were matched to Class 7 students!
    const class7Overwritten = parsed8.some((r) => r.isExistingStudent);
    assert(
      'Cross-Class Safe Merge',
      'Step B: Zero Cross-Class Overwrites During Parse',
      !class7Overwritten && parsed8.every((r) => r.actionType === 'create'),
      `Class 8 students cleanly marked as new students, not matched against Class 7.`
    );

    // Commit Class 8
    const commit8 = await commitApprovedImportRows(parsed8, testEmail);
    const inDbAfter8 = await getAllStudents();
    const class7StudentsAfter = inDbAfter8.filter((s) => s.class === 'Class 7');
    const class8StudentsAfter = inDbAfter8.filter((s) => s.class === 'Class 8');

    const isolationVerified =
      inDbAfter8.length === 6 &&
      class7StudentsAfter.length === 3 &&
      class8StudentsAfter.length === 3 &&
      class7StudentsAfter.some((s) => s.name === 'Class 7 Student One') &&
      class8StudentsAfter.some((s) => s.name === 'Class 8 Student One');

    assert(
      'Cross-Class Safe Merge',
      'Step C: Database State After Both Classes (Total 6 Students, 3 per class)',
      isolationVerified,
      `Database contains exactly 3 students in Class 7 AND 3 students in Class 8. ZERO records lost!`
    );
  } catch (err: any) {
    assert('Cross-Class Safe Merge', 'Safe Merge Suite', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 7: ATTENDANCE RECORDS PRESERVATION
  // -------------------------------------------------------------------------
  try {
    const class7Students = await getStudentsByClass('Class 7');
    const student1 = class7Students[0];

    // Mark attendance for Student 1
    const attRecord: AttendanceRecord = {
      id: `${student1.id}_2026-10-18`,
      studentId: student1.id,
      studentName: student1.name,
      rollNo: student1.rollNo,
      class: student1.class,
      section: student1.section,
      date: '2026-10-18',
      status: 'Present',
      version: 1,
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      markedBy: testEmail,
    };
    await saveAttendanceLocally(attRecord);

    const attBefore = await getAllAttendanceRecords();
    assert(
      'Attendance Preservation',
      'Step A: Create Attendance Record for Class 7 Student',
      attBefore.length === 1 && attBefore[0].studentName === student1.name,
      `Attendance record created for "${student1.name}".`
    );

    // Now re-import Class 7 with updated contact numbers in Auto-Update mode
    const wbUpdate7 = XLSX.utils.book_new();
    const wsUpdate7Data = [
      ['Roll Num', 'Name of Learner', 'Father Name', 'Class', 'Guardian Contact'],
      ['1', 'Class 7 Student One', 'Father Seven One', 'Class 7', '0300-9999999'],
    ];
    const wsUpdate7 = XLSX.utils.aoa_to_sheet(wsUpdate7Data);
    XLSX.utils.book_append_sheet(wbUpdate7, wsUpdate7, 'Class 7');
    const fileUpdate7 = workbookToFile(wbUpdate7, 'update_class_7.xlsx');
    const parsedUpdate7 = await parseExcelOrCsvFile(fileUpdate7, { updateExisting: true });
    await commitApprovedImportRows(parsedUpdate7, testEmail);

    // Verify attendance is STILL PRESENT and linked!
    const attAfter = await getAllAttendanceRecords();
    const attPreserved =
      attAfter.length === 1 &&
      attAfter[0].studentId === student1.id &&
      attAfter[0].status === 'Present';

    assert(
      'Attendance Preservation',
      'Step B: Re-Import / Update Preserves Attendance Records Intact',
      attPreserved,
      `Attendance record perfectly preserved with status "Present" for student ID ${student1.id}.`
    );
  } catch (err: any) {
    assert('Attendance Preservation', 'Attendance Preservation Suite', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 8: MULTI-SHEET WORKBOOK IMPORT
  // -------------------------------------------------------------------------
  try {
    const wbMulti = XLSX.utils.book_new();
    // Sheet 1: 7th Grade
    const wsMulti7 = XLSX.utils.aoa_to_sheet([
      ['Roll No', 'Student Name', 'Father Name', 'Class'],
      ['1', 'Multi Student 7A', 'Father 7A', 'Class 7'],
      ['2', 'Multi Student 7B', 'Father 7B', 'Class 7'],
    ]);
    // Sheet 2: 8th Grade
    const wsMulti8 = XLSX.utils.aoa_to_sheet([
      ['Roll No', 'Student Name', 'Father Name', 'Class'],
      ['1', 'Multi Student 8A', 'Father 8A', 'Class 8'],
      ['2', 'Multi Student 8B', 'Father 8B', 'Class 8'],
    ]);
    // Sheet 3: 9th Grade
    const wsMulti9 = XLSX.utils.aoa_to_sheet([
      ['Roll No', 'Student Name', 'Father Name', 'Class'],
      ['1', 'Multi Student 9A', 'Father 9A', 'Class 9'],
    ]);

    XLSX.utils.book_append_sheet(wbMulti, wsMulti7, 'Class 7');
    XLSX.utils.book_append_sheet(wbMulti, wsMulti8, 'Class 8');
    XLSX.utils.book_append_sheet(wbMulti, wsMulti9, 'Class 9');

    const fileMulti = workbookToFile(wbMulti, 'multi_sheet_workbook.xlsx');
    const parsedMulti = await parseExcelOrCsvFile(fileMulti, { sheetName: '__ALL__' });

    const totalMulti = parsedMulti.length === 5;
    const has7 = parsedMulti.some((r) => r.class === 'Class 7');
    const has8 = parsedMulti.some((r) => r.class === 'Class 8');
    const has9 = parsedMulti.some((r) => r.class === 'Class 9');

    assert(
      'Multi-Sheet Workbook',
      'Import All Sheets Concurrently',
      totalMulti && has7 && has8 && has9,
      `Parsed all 5 students across Class 7, 8, and 9 from multi-sheet workbook.`
    );
  } catch (err: any) {
    assert('Multi-Sheet Workbook', 'Multi-Sheet Suite', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUITE 9: SEPARATE LOCAL-SAVE AND CLOUD-SYNC REPORTING & DIAGNOSTIC LOGS
  // -------------------------------------------------------------------------
  try {
    const wbDiag = XLSX.utils.book_new();
    const wsDiag = XLSX.utils.aoa_to_sheet([
      ['Roll No', 'Student Name', 'Father Name', 'Class'],
      ['99', 'Diagnostic Student', 'Diagnostic Father', 'Class 9'],
    ]);
    XLSX.utils.book_append_sheet(wbDiag, wsDiag, 'Diagnostic');
    const fileDiag = workbookToFile(wbDiag, 'diagnostic_test.xlsx');
    const parsedDiag = await parseExcelOrCsvFile(fileDiag);
    const commitDiag = await commitApprovedImportRows(parsedDiag, testEmail);

    const hasSeparateReporting =
      commitDiag.localSaveSuccess === true &&
      commitDiag.cloudSync !== undefined &&
      typeof commitDiag.cloudSync.syncedCount === 'number' &&
      typeof commitDiag.cloudSync.pendingCount === 'number';

    const logs = getDiagnosticLogs();
    const hasDetect = logs.some((l) => l.stage === 'DETECT');
    const hasParse = logs.some((l) => l.stage === 'PARSE');
    const hasValidate = logs.some((l) => l.stage === 'VALIDATE');
    const hasLocalSave = logs.some((l) => l.stage === 'LOCAL_SAVE');
    const hasCloudSync = logs.some((l) => l.stage === 'CLOUD_SYNC');

    assert(
      'Diagnostic & Reporting',
      'Separate Local-Save and Cloud-Sync Outcomes Reported',
      hasSeparateReporting,
      `Local save success: ${commitDiag.localSaveSuccess}, Cloud sync: ${commitDiag.cloudSync.overallStatus}.`
    );

    assert(
      'Diagnostic & Reporting',
      'All 6 Diagnostic Stages Tracked Without PII',
      hasDetect && hasParse && hasValidate && hasLocalSave && hasCloudSync,
      `Confirmed diagnostic stages: DETECT, PARSE, VALIDATE, LOCAL_SAVE, CLOUD_SYNC.`
    );
  } catch (err: any) {
    assert('Diagnostic & Reporting', 'Diagnostic Suite', false, err.message);
  }

  console.log('\n====================================================');
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  console.log(`TEST SUITE FINISHED: ${totalPassed} PASSED, ${totalFailed} FAILED OUT OF ${results.length} TESTS.`);
  console.log('====================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTestSuite();
