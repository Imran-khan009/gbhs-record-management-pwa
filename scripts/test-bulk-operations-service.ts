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

// Mock window and CustomEvent for reactivity verification
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
import {
  BulkOperationsService,
  BulkModuleType,
} from '../src/services/bulkOperationsService';
import {
  bulkSaveStudentsLocally,
  getAllStudents,
  clearAllStudentsLocally,
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

const results: TestResult[] = [];

function assert(suite: string, name: string, condition: boolean, message: string) {
  results.push({ suite, name, passed: condition, message });
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`[${status}] [${suite}] ${name}: ${message}`);
  if (!condition) {
    console.error(`       ASSERTION FAILED: ${message}`);
  }
}

// Helper to create mock File object in bun / node
function createMockExcelFile(workbook: XLSX.WorkBook, filename = 'test.xlsx'): File {
  const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return new File([blob], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('RUNNING TEST SUITE: BulkOperationsService Integration');
  console.log('====================================================\n');

  // -----------------------------------------------------------------
  // 0. Seed Student Master Roster
  // -----------------------------------------------------------------
  await clearAllStudentsLocally();
  const testStudents: Student[] = [
    {
      id: 'stu-alpha-001',
      rollNo: '101',
      admissionNo: 'ADM-101',
      name: 'Muhammad Tariq',
      fatherName: 'Tariq Mehmood',
      class: 'Class 9',
      section: 'A',
      phone: '03001234567',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'operator@gbhs.edu.pk',
      version: 1,
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    },
    {
      id: 'stu-alpha-002',
      rollNo: '102',
      admissionNo: 'ADM-102',
      name: 'Bilal Khan',
      fatherName: 'Asad Khan',
      class: 'Class 9',
      section: 'A',
      phone: '03007654321',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'operator@gbhs.edu.pk',
      version: 1,
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    },
    {
      id: 'stu-alpha-003',
      rollNo: '201',
      admissionNo: 'ADM-201',
      name: 'Zain Abbas',
      fatherName: 'Abbas Ali',
      class: 'Class 8',
      section: 'B',
      phone: '03112233445',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'operator@gbhs.edu.pk',
      version: 1,
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    },
  ];

  await bulkSaveStudentsLocally(testStudents);
  const seeded = await getAllStudents();
  assert('Setup', 'Seed Isolated Students', seeded.length === 3, `Expected 3 test students, found ${seeded.length}`);

  // -----------------------------------------------------------------
  // 1. Module Type Normalization & Aliases
  // -----------------------------------------------------------------
  console.log('\n--- 1. Module Type Normalization ---');
  assert('Aliases', 'Normalize students', BulkOperationsService.normalizeModuleType('students') === 'students', 'students ok');
  assert('Aliases', 'Normalize student alias', BulkOperationsService.normalizeModuleType('student') === 'students', 'student alias ok');
  assert('Aliases', 'Normalize attendance', BulkOperationsService.normalizeModuleType('attendance') === 'attendance', 'attendance ok');
  assert('Aliases', 'Normalize teaching_log alias', BulkOperationsService.normalizeModuleType('teaching_log') === 'teaching_logs', 'teaching_log alias ok');
  assert('Aliases', 'Normalize teaching alias', BulkOperationsService.normalizeModuleType('teaching') === 'teaching_logs', 'teaching alias ok');
  assert('Aliases', 'Normalize practical alias', BulkOperationsService.normalizeModuleType('practical') === 'practical_progress', 'practical alias ok');
  assert('Aliases', 'Normalize practical_progress', BulkOperationsService.normalizeModuleType('practical_progress') === 'practical_progress', 'practical_progress ok');
  assert('Aliases', 'Normalize absentee alias', BulkOperationsService.normalizeModuleType('absentee') === 'absentee_followups', 'absentee alias ok');
  assert('Aliases', 'Normalize absentee_followup alias', BulkOperationsService.normalizeModuleType('absentee_followup') === 'absentee_followups', 'absentee_followup alias ok');

  // -----------------------------------------------------------------
  // 2. Historical Date Handling via parseExcelDate()
  // -----------------------------------------------------------------
  console.log('\n--- 2. Historical Date Handling ---');
  // Backfills from early March 2026
  assert(
    'Dates',
    'Textual: 2 March 2026',
    BulkOperationsService.parseExcelDate('2 March 2026') === '2026-03-02',
    `"2 March 2026" should resolve to 2026-03-02, got ${BulkOperationsService.parseExcelDate('2 March 2026')}`
  );
  assert(
    'Dates',
    'Textual: March 2, 2026',
    BulkOperationsService.parseExcelDate('March 2, 2026') === '2026-03-02',
    `"March 2, 2026" should resolve to 2026-03-02, got ${BulkOperationsService.parseExcelDate('March 2, 2026')}`
  );
  assert(
    'Dates',
    'UK Slash: 02/03/2026',
    BulkOperationsService.parseExcelDate('02/03/2026') === '2026-03-02',
    `"02/03/2026" should resolve to 2026-03-02, got ${BulkOperationsService.parseExcelDate('02/03/2026')}`
  );
  assert(
    'Dates',
    'ISO: 2026-03-02',
    BulkOperationsService.parseExcelDate('2026-03-02') === '2026-03-02',
    `"2026-03-02" should resolve to 2026-03-02`
  );
  assert(
    'Dates',
    'Excel Numeric Serial: 46083 (2026-03-02)',
    BulkOperationsService.parseExcelDate(46083) === '2026-03-02',
    `Serial 46083 should resolve to 2026-03-02, got ${BulkOperationsService.parseExcelDate(46083)}`
  );
  assert(
    'Dates',
    'Preserve historical year (2025-11-15)',
    BulkOperationsService.parseExcelDate('15/11/2025') === '2025-11-15',
    `Historical date 15/11/2025 preserved exactly, got ${BulkOperationsService.parseExcelDate('15/11/2025')}`
  );
  assert(
    'Dates',
    'Invalid dates return null (no fallback to today)',
    BulkOperationsService.parseExcelDate('not-a-date') === null,
    'Invalid date string returns null'
  );

  // -----------------------------------------------------------------
  // 3. Template Generation & Header Keys Matching
  // -----------------------------------------------------------------
  console.log('\n--- 3. Template Generation & Structure Matching ---');
  const modules: BulkModuleType[] = [
    'students',
    'attendance',
    'teaching_logs',
    'practical_progress',
    'absentee_followups',
  ];

  for (const mod of modules) {
    const wb = BulkOperationsService.generateTemplate(mod);
    assert('Templates', `Generate ${mod} template`, wb.SheetNames.length >= 1, `Workbook created with sheets: ${wb.SheetNames.join(', ')}`);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet);
    assert('Templates', `${mod} contains sample row`, jsonRows.length > 0, `Found ${jsonRows.length} rows`);
    const hasExample = JSON.stringify(jsonRows[0]).includes('[EXAMPLE');
    assert('Templates', `${mod} sample row marked with [EXAMPLE]`, hasExample, 'Sample row is clearly marked as example');
  }

  // -----------------------------------------------------------------
  // 4. Large Dataset Performance (500+ rows)
  // -----------------------------------------------------------------
  console.log('\n--- 4. Unlimited Rows & Non-Blocking Performance ---');
  const largeAttendanceRows: any[] = [];
  // Generate 600 rows alternating between test students
  for (let i = 1; i <= 600; i++) {
    const stu = testStudents[i % 3];
    // historical dates across March 2026
    const day = (i % 28) + 1;
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    largeAttendanceRows.push({
      'Date (YYYY-MM-DD)*': `2026-03-${dayStr}`,
      'Class (Class 7/8/9)*': stu.class,
      'Roll No*': stu.rollNo,
      'Student Name': stu.name,
      'Status (Present/Absent/Leave/Late)*': i % 10 === 0 ? 'Absent' : 'Present',
      'Remarks': `Day ${day} session ${i}`,
    });
  }

  const largeWb = XLSX.utils.book_new();
  const largeSheet = XLSX.utils.json_to_sheet(largeAttendanceRows);
  XLSX.utils.book_append_sheet(largeWb, largeSheet, 'Daily Attendance');
  const largeFile = createMockExcelFile(largeWb, 'large_attendance_600.xlsx');

  let progressCalls = 0;
  const startMs = Date.now();
  const largeParseResult = await BulkOperationsService.parseFile(largeFile, 'attendance', {
    onProgress: (p, total) => {
      progressCalls++;
    },
  });
  const durationMs = Date.now() - startMs;

  assert(
    'Performance',
    'Parse 600 rows smoothly',
    largeParseResult.totalRows === 600 && largeParseResult.validCount === 600,
    `Parsed ${largeParseResult.totalRows} rows (${largeParseResult.validCount} valid) in ${durationMs}ms`
  );
  assert(
    'Performance',
    'Yield to main thread onProgress triggered',
    progressCalls >= 11,
    `onProgress triggered ${progressCalls} times (yielded every 50 rows)`
  );

  // -----------------------------------------------------------------
  // 5. Verification Across All 5 Core Modules
  // -----------------------------------------------------------------
  console.log('\n--- 5. All 5 Core Modules Parsing & Validation Notes ---');

  // 5.1 Students Roster
  const studentRows = [
    {
      'Admission No': 'ADM-999',
      'Roll No*': '99',
      'Student Name*': 'Hamza Rafique',
      'Father Name': 'Rafique Ahmed',
      'Class (Class 7/8/9)*': 'Class 9',
      'Section': 'A',
      'Phone': '03009998877',
      'Date of Birth': '2 March 2012',
      'Status': 'Active',
    },
    {
      // Missing name -> invalid
      'Admission No': 'ADM-998',
      'Roll No*': '98',
      'Student Name*': '',
      'Class (Class 7/8/9)*': 'Class 9',
    },
    {
      // Duplicate of Tariq
      'Admission No': 'ADM-101',
      'Roll No*': '101',
      'Student Name*': 'Muhammad Tariq',
      'Class (Class 7/8/9)*': 'Class 9',
    },
  ];
  const stuWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(stuWb, XLSX.utils.json_to_sheet(studentRows), 'Students');
  const stuResult = await BulkOperationsService.parseFile(createMockExcelFile(stuWb), 'students');

  assert('Students', 'Parsed 3 rows', stuResult.totalRows === 3, `Total: ${stuResult.totalRows}`);
  assert('Students', '1 valid new student', stuResult.validCount === 1, `Valid: ${stuResult.validCount}`);
  assert('Students', '1 invalid row identified', stuResult.invalidCount === 1, `Invalid: ${stuResult.invalidCount}`);
  assert('Students', '1 duplicate row identified', stuResult.duplicateCount === 1, `Duplicate: ${stuResult.duplicateCount}`);
  assert(
    'Students',
    'Validation notes describe missing name',
    stuResult.validRows[1].validationNotes.includes('Student Name is required'),
    stuResult.validRows[1].validationNotes
  );

  // 5.2 Daily Attendance
  const attRows = [
    {
      'Date (YYYY-MM-DD)*': '2 March 2026',
      'Class (Class 7/8/9)*': 'Class 9',
      'Roll No*': '101',
      'Student Name': 'Muhammad Tariq',
      'Status (Present/Absent/Leave/Late)*': 'Present',
    },
    {
      // Unmatched student
      'Date (YYYY-MM-DD)*': '2 March 2026',
      'Class (Class 7/8/9)*': 'Class 9',
      'Roll No*': '99999',
      'Status (Present/Absent/Leave/Late)*': 'Present',
    },
  ];
  const attWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(attWb, XLSX.utils.json_to_sheet(attRows), 'Attendance');
  const attResult = await BulkOperationsService.parseFile(createMockExcelFile(attWb), 'attendance');

  assert('Attendance', 'Row 1 matched Tariq with historical date', attResult.validRows[0].resolvedDate === '2026-03-02', 'Resolved date 2026-03-02');
  assert('Attendance', 'Row 2 flagged as unmatched', attResult.validRows[1].status === 'unmatched', 'Unmatched status');
  assert('Attendance', 'Unmatched validation note present', attResult.validRows[1].validationNotes.includes('Error'), attResult.validRows[1].validationNotes);

  // 5.3 Curriculum Teaching Logs
  const teachingRows = [
    {
      'Date (YYYY-MM-DD)*': '2 March 2026',
      'Class (Class 7/8/9)*': 'Class 9',
      'Subject / Topic*': 'Introduction to Python Functions',
      'Learning Objectives': 'Understand def and return parameters',
      'Theory Covered': 'Function syntax and scope',
      'Practical Activity': 'Coding calculator functions in IDE',
      'Students Present': 38,
      'Students Completing Task': 35,
      'Students Needing Help': 3,
      'Teaching Method': 'Hands-on Lab Demonstration',
      'Instructor Name': 'Engr. Imran Khan',
    },
  ];
  const teachWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(teachWb, XLSX.utils.json_to_sheet(teachingRows), 'Teaching Log');
  const teachResult = await BulkOperationsService.parseFile(createMockExcelFile(teachWb), 'teaching_logs');

  assert('Teaching Logs', 'Valid teaching log row', teachResult.validCount === 1, 'Teaching log parsed as valid');
  assert('Teaching Logs', 'Exact historical date stored', teachResult.validRows[0].resolvedDate === '2026-03-02', 'Date matches 2026-03-02');
  assert('Teaching Logs', 'Topic assigned correctly', teachResult.validRows[0].entity?.subjectTopic === 'Introduction to Python Functions', 'Topic matches');

  // 5.4 Practical Lab Tracker
  const practicalRows = [
    {
      'Assessment Date (YYYY-MM-DD)*': '2 March 2026',
      'Class (Class 7/8/9)*': 'Class 9',
      'Roll No*': '102',
      'Student Name': 'Bilal Khan',
      'Practical Task / Skill*': 'Breadboard Circuit Wiring',
      'Score (0-100)': 88,
      'Skill Status (Proficient/Competent/Developing/Beginning)': 'Proficient',
      'Practical Completed? (Yes/No)': 'Yes',
      'Remarks': 'Excellent circuit troubleshooting',
    },
  ];
  const pracWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pracWb, XLSX.utils.json_to_sheet(practicalRows), 'Practical Tracker');
  const pracResult = await BulkOperationsService.parseFile(createMockExcelFile(pracWb), 'practical_progress');

  assert('Practical Tracker', 'Valid practical entry', pracResult.validCount === 1, 'Practical row parsed as valid');
  assert('Practical Tracker', 'Student matched to Bilal Khan', pracResult.validRows[0].matchedStudent?.name === 'Bilal Khan', 'Student matched');
  assert('Practical Tracker', 'Score preserved as 88', pracResult.validRows[0].entity?.scoreMarks === 88, 'Score 88');

  // 5.5 Absentee Follow-ups
  const absenteeRows = [
    {
      'Date of Record (YYYY-MM-DD)*': '2 March 2026',
      'Class (Class 7/8/9)*': 'Class 8',
      'Roll No*': '201',
      'Student Name': 'Zain Abbas',
      'Follow-up Reason*': 'Continuous 3-day absence without prior leave',
      'Action Taken*': 'Phone call placed to father',
      'Guardian Response': 'Father stated student had fever, will return Wednesday',
      'Status (Pending Return/Resolved/Escalated)': 'Pending Return',
    },
  ];
  const absWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(absWb, XLSX.utils.json_to_sheet(absenteeRows), 'Absentee Follow-up');
  const absResult = await BulkOperationsService.parseFile(createMockExcelFile(absWb), 'absentee_followups');

  assert('Absentee Follow-up', 'Valid absentee entry', absResult.validCount === 1, 'Absentee row parsed as valid');
  assert('Absentee Follow-up', 'Matched student Zain Abbas', absResult.validRows[0].matchedStudent?.name === 'Zain Abbas', 'Student matched');
  assert('Absentee Follow-up', 'Historical date preserved', absResult.validRows[0].resolvedDate === '2026-03-02', 'Date matches 2026-03-02');

  // -----------------------------------------------------------------
  // 6. Zero-Refresh Reactivity & Persistence Commits
  // -----------------------------------------------------------------
  console.log('\n--- 6. Zero-Refresh Reactivity & Outbox Persistence ---');

  dispatchedEvents.length = 0; // reset event log

  // Commit Students
  const stuCommit = await BulkOperationsService.commit('students', [stuResult.validRows[0]]);
  assert('Commit', 'Students commit created 1 student', stuCommit.createdCount === 1, `Created: ${stuCommit.createdCount}`);

  // Commit Attendance
  const attCommit = await BulkOperationsService.commit('attendance', [attResult.validRows[0]]);
  assert('Commit', 'Attendance commit created 1 record', attCommit.createdCount === 1, `Created: ${attCommit.createdCount}`);

  // Commit Teaching Logs
  const teachCommit = await BulkOperationsService.commit('teaching_logs', [teachResult.validRows[0]]);
  assert('Commit', 'Teaching log commit created 1 record', teachCommit.createdCount === 1, `Created: ${teachCommit.createdCount}`);

  // Commit Practical Tracker
  const pracCommit = await BulkOperationsService.commit('practical_progress', [pracResult.validRows[0]]);
  assert('Commit', 'Practical commit created 1 record', pracCommit.createdCount === 1, `Created: ${pracCommit.createdCount}`);

  // Commit Absentee Follow-ups
  const absCommit = await BulkOperationsService.commit('absentee_followups', [absResult.validRows[0]]);
  assert('Commit', 'Absentee commit created 1 record', absCommit.createdCount === 1, `Created: ${absCommit.createdCount}`);

  // Verify Local IndexedDB persistence
  const savedStudents = await getAllStudents();
  assert('Persistence', 'Student saved in IndexedDB', savedStudents.some((s) => s.name === 'Hamza Rafique'), 'Hamza Rafique found in DB');

  const savedAttendance = await getAllAttendanceRecords();
  assert('Persistence', 'Attendance saved in IndexedDB on historical date', savedAttendance.some((a) => a.date === '2026-03-02' && a.studentName === 'Muhammad Tariq'), 'Tariq attendance found on 2026-03-02');

  const savedTeaching = await getAllTeachingLogs();
  assert('Persistence', 'Teaching log saved in IndexedDB', savedTeaching.some((t) => t.date === '2026-03-02' && t.subjectTopic.includes('Python Functions')), 'Teaching log found in DB');

  const savedPractical = await getAllPracticalProgress();
  assert('Persistence', 'Practical entry saved in IndexedDB', savedPractical.some((p) => p.assessmentDate === '2026-03-02' && p.skillTask.includes('Breadboard')), 'Practical entry found in DB');

  const savedAbsentee = await getAllAbsenteeFollowups();
  assert('Persistence', 'Absentee follow-up saved in IndexedDB', savedAbsentee.some((a) => a.date === '2026-03-02' && a.studentName === 'Zain Abbas'), 'Absentee follow-up found in DB');

  // Verify Outbox Operations
  const outbox = await getOutboxOperations();
  assert('Outbox', 'Outbox operations queued', outbox.length >= 5, `Outbox has ${outbox.length} pending operations`);
  assert('Outbox', 'Student op queued with version', outbox.some((o) => o.entityType === 'student' && o.version >= 1), 'Student op found');
  assert('Outbox', 'Attendance op queued', outbox.some((o) => o.entityType === 'attendance'), 'Attendance op found');
  assert('Outbox', 'Teaching log op queued', outbox.some((o) => o.entityType === 'teaching_log'), 'Teaching op found');
  assert('Outbox', 'Practical op queued', outbox.some((o) => o.entityType === 'practical_progress'), 'Practical op found');
  assert('Outbox', 'Absentee op queued', outbox.some((o) => o.entityType === 'absentee_followup'), 'Absentee op found');

  // Verify Dispatched Window Events for Zero-Refresh UI
  const eventTypes = dispatchedEvents.map((e) => e.type);
  assert('Reactivity', 'Dispatched gbhs_records_imported', eventTypes.includes('gbhs_records_imported'), 'gbhs_records_imported dispatched');
  assert('Reactivity', 'Dispatched gbhs_students_changed', eventTypes.includes('gbhs_students_changed'), 'gbhs_students_changed dispatched');
  assert('Reactivity', 'Dispatched gbhs_attendance_changed', eventTypes.includes('gbhs_attendance_changed'), 'gbhs_attendance_changed dispatched');
  assert('Reactivity', 'Dispatched gbhs_teaching_changed', eventTypes.includes('gbhs_teaching_changed'), 'gbhs_teaching_changed dispatched');
  assert('Reactivity', 'Dispatched gbhs_practical_changed', eventTypes.includes('gbhs_practical_changed'), 'gbhs_practical_changed dispatched');
  assert('Reactivity', 'Dispatched gbhs_absentee_changed', eventTypes.includes('gbhs_absentee_changed'), 'gbhs_absentee_changed dispatched');
  assert('Reactivity', 'Dispatched gbhs_dashboard_refresh', eventTypes.includes('gbhs_dashboard_refresh'), 'gbhs_dashboard_refresh dispatched');

  // Summary
  console.log('\n====================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
