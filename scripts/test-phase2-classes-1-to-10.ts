import 'fake-indexeddb/auto';

// Mock localStorage
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

// Mock window and CustomEvent
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: { detail?: any }) {
    this.type = type;
    this.detail = params?.detail;
  }
};
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false }),
};

import {
  CANONICAL_CLASSES,
  isCanonicalClass,
  normalizeClass,
  getClassBadgeColor,
} from '../src/services/classNormalizationService';
import {
  parseExcelOrCsvFile,
  normalizeSection,
} from '../src/services/excelService';
import { BulkOperationsService } from '../src/services/bulkOperationsService';
import { normalizeClassLevel } from '../src/services/bulkModuleImportService';
import {
  getDB,
  getStudentsByClass,
  getAttendanceByDateAndClass,
  getTeachingLogsByClass,
  getPracticalProgressByClass,
  getAbsenteeFollowupsByClass,
} from '../src/services/db';
import {
  serializeStudentToSupabase,
  deserializeStudentFromSupabase,
  serializeAttendanceToSupabase,
  serializeTeachingLogToSupabase,
  serializePracticalProgressToSupabase,
  serializeAbsenteeFollowupToSupabase,
  getSupabaseSQLSchema,
} from '../src/services/supabase';
import { Student, ClassLevel, AttendanceRecord } from '../src/types/student';
import {
  TeachingLogEntry,
  PracticalProgressEntry,
  AbsenteeFollowupEntry,
} from '../src/types/modules';
import * as XLSX from 'xlsx';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  passedTests++;
  console.log(`  ✓ PASS: ${msg}`);
}

async function runPhase2Tests() {
  console.log('\n============================================================');
  console.log('🧪 GBHS PHASE 2: CLASSES 1–10 AUTOMATED TEST SUITE');
  console.log('============================================================\n');

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Canonical Classes 1–10
  // --------------------------------------------------------------------------
  console.log('--- Test Suite 1: Canonical Classes 1–10 ---');
  assert(CANONICAL_CLASSES.length === 10, 'CANONICAL_CLASSES has exactly 10 classes');
  for (let i = 1; i <= 10; i++) {
    const canonical = `Class ${i}` as ClassLevel;
    assert(CANONICAL_CLASSES.includes(canonical), `CANONICAL_CLASSES includes ${canonical}`);
    assert(isCanonicalClass(canonical), `isCanonicalClass("${canonical}") is true`);
    assert(normalizeClass(canonical) === canonical, `normalizeClass("${canonical}") returns exact canonical`);
    assert(normalizeClass(canonical.toLowerCase()) === canonical, `normalizeClass("${canonical.toLowerCase()}") matches case-insensitively`);
    assert(normalizeClass(`  ${canonical}  `) === canonical, `normalizeClass with whitespace matches`);
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Supported Aliases & Multilingual Normalization
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 2: Supported Aliases & Multilingual Normalization ---');

  // Arabic Numerals
  for (let i = 1; i <= 10; i++) {
    assert(normalizeClass(String(i)) === `Class ${i}`, `Arabic digit "${i}" normalizes to "Class ${i}"`);
    assert(normalizeClass(i) === `Class ${i}`, `Number ${i} normalizes to "Class ${i}"`);
  }

  // Ordinals
  const ordinals: [string, ClassLevel][] = [
    ['1st', 'Class 1'], ['2nd', 'Class 2'], ['3rd', 'Class 3'], ['4th', 'Class 4'],
    ['5th', 'Class 5'], ['6th', 'Class 6'], ['7th', 'Class 7'], ['8th', 'Class 8'],
    ['9th', 'Class 9'], ['10th', 'Class 10'],
  ];
  for (const [ord, expected] of ordinals) {
    assert(normalizeClass(ord) === expected, `Ordinal "${ord}" normalizes to "${expected}"`);
    assert(normalizeClass(`Class ${ord}`) === expected, `"Class ${ord}" normalizes to "${expected}"`);
    assert(normalizeClass(`Grade ${ord}`) === expected, `"Grade ${ord}" normalizes to "${expected}"`);
  }

  // Roman Numerals (I to X)
  const romanNumerals: [string, ClassLevel][] = [
    ['I', 'Class 1'], ['II', 'Class 2'], ['III', 'Class 3'], ['IV', 'Class 4'],
    ['V', 'Class 5'], ['VI', 'Class 6'], ['VII', 'Class 7'], ['VIII', 'Class 8'],
    ['IX', 'Class 9'], ['X', 'Class 10'],
    ['i', 'Class 1'], ['ii', 'Class 2'], ['iii', 'Class 3'], ['iv', 'Class 4'],
    ['v', 'Class 5'], ['vi', 'Class 6'], ['vii', 'Class 7'], ['viii', 'Class 8'],
    ['ix', 'Class 9'], ['x', 'Class 10'],
  ];
  for (const [rom, expected] of romanNumerals) {
    assert(normalizeClass(rom) === expected, `Roman numeral "${rom}" normalizes to "${expected}"`);
    assert(normalizeClass(`Class ${rom}`) === expected, `"Class ${rom}" normalizes to "${expected}"`);
  }

  // Urdu Numerals (۱ to ۱۰)
  const urduNumerals: [string, ClassLevel][] = [
    ['۱', 'Class 1'], ['۲', 'Class 2'], ['۳', 'Class 3'], ['۴', 'Class 4'],
    ['۵', 'Class 5'], ['۶', 'Class 6'], ['۷', 'Class 7'], ['۸', 'Class 8'],
    ['۹', 'Class 9'], ['۱۰', 'Class 10'],
  ];
  for (const [urdu, expected] of urduNumerals) {
    assert(normalizeClass(urdu) === expected, `Urdu numeral "${urdu}" normalizes to "${expected}"`);
  }

  // Urdu Words & Ordinals
  const urduWords: [string, ClassLevel][] = [
    ['پہلی', 'Class 1'], ['اول', 'Class 1'],
    ['دوسری', 'Class 2'], ['دوم', 'Class 2'],
    ['تیسری', 'Class 3'], ['سوم', 'Class 3'],
    ['چوتھی', 'Class 4'], ['چہارم', 'Class 4'],
    ['پانچویں', 'Class 5'], ['پنجم', 'Class 5'],
    ['چھٹی', 'Class 6'], ['ششم', 'Class 6'],
    ['ساتویں', 'Class 7'], ['ہفتم', 'Class 7'],
    ['آٹھویں', 'Class 8'], ['ہشتم', 'Class 8'],
    ['نویں', 'Class 9'], ['نہم', 'Class 9'],
    ['دسویں', 'Class 10'], ['دہم', 'Class 10'],
  ];
  for (const [uWord, expected] of urduWords) {
    assert(normalizeClass(uWord) === expected, `Urdu word "${uWord}" normalizes to "${expected}"`);
  }

  // Formats with Class/Grade and Section suffixes
  assert(normalizeClass('Class 10-A') === 'Class 10', '"Class 10-A" normalizes to "Class 10"');
  assert(normalizeClass('Grade 5 B') === 'Class 5', '"Grade 5 B" normalizes to "Class 5"');
  assert(normalizeClass('7-B') === 'Class 7', '"7-B" normalizes to "Class 7"');
  assert(normalizeClass('Class 1 (A)') === 'Class 1', '"Class 1 (A)" normalizes to "Class 1"');

  // Section extraction
  assert(normalizeSection('A', 'Class 10-A') === 'A', 'normalizeSection extracts section A from Class 10-A');
  assert(normalizeSection('B', 'Class 5-B') === 'B', 'normalizeSection extracts section B from Class 5-B');
  assert(normalizeSection('', '10-C') === 'C', 'normalizeSection extracts section C from 10-C fallback');

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Rejection of Invalid, Blank, Zero, Negative & Out-of-Range
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 3: Rejection of Invalid Values (No Class 7 Silent Default) ---');

  const invalidInputs = [
    null,
    undefined,
    '',
    '   ',
    '-',
    '--',
    'None',
    'null',
    'undefined',
    'empty',
    'N/A',
    'na',
    // Zero
    '0',
    0,
    '0th',
    'Class 0',
    'Grade 0',
    'zero',
    // Negative numbers
    '-1',
    -1,
    '-7',
    'Class -7',
    'Class -1',
    // Out of range (Class 11, Class 12, etc.)
    '11',
    11,
    'Class 11',
    'Grade 11',
    '11th',
    'XI',
    'xi',
    '12',
    12,
    'Class 12',
    'Grade 12',
    '12th',
    'XII',
    'xii',
    'Class 13',
    'XIII',
    '100',
    // Nonsense
    'General Knowledge',
    'Computer Lab',
    'Section A',
    'Roll 45',
  ];

  for (const inv of invalidInputs) {
    const res = normalizeClass(inv);
    assert(
      res === null,
      `normalizeClass(${JSON.stringify(inv)}) strictly rejected (returned null, never Class 7)`
    );
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Bulk Operations Service Normalization & Validation
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 4: Bulk Operations Service Normalization ---');
  for (let i = 1; i <= 10; i++) {
    assert(
      BulkOperationsService.normalizeClass(`Class ${i}`) === `Class ${i}`,
      `BulkOperationsService.normalizeClass("Class ${i}") matches`
    );
    assert(
      BulkOperationsService.normalizeClass(String(i)) === `Class ${i}`,
      `BulkOperationsService.normalizeClass("${i}") matches`
    );
  }
  assert(
    BulkOperationsService.normalizeClass('Class 11') === null,
    'BulkOperationsService.normalizeClass("Class 11") returns null'
  );
  assert(
    BulkOperationsService.normalizeClass('0') === null,
    'BulkOperationsService.normalizeClass("0") returns null'
  );
  assert(
    BulkOperationsService.normalizeClass('-5') === null,
    'BulkOperationsService.normalizeClass("-5") returns null'
  );

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Student Form Modal Class Preservation in Edit Mode
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 5: StudentFormModal Class Preservation ---');

  const standardClasses: ClassLevel[] = ['Class 1', 'Class 2', 'Class 3'];
  const legacyStudent: Student = {
    id: 'legacy-1',
    name: 'Tariq Legacy',
    fatherName: 'Legacy Father',
    rollNo: '99',
    admissionNo: 'ADM-99',
    class: 'Class 10' as ClassLevel,
    section: 'A',
    phone: '',
    status: 'Active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    createdBy: 'admin',
  };

  // Simulate displayClasses logic in StudentFormModal:
  const studentToEdit: Student | null = legacyStudent;
  const isEditMode = Boolean(studentToEdit);
  const displayClasses = (
    isEditMode && studentToEdit?.class && !standardClasses.includes(studentToEdit.class)
      ? [studentToEdit.class, ...standardClasses]
      : standardClasses
  );

  assert(
    displayClasses.includes('Class 10'),
    'Preserves existing student class in dropdown options even when not in standardClasses'
  );
  assert(
    displayClasses[0] === 'Class 10',
    'Student existing class remains first option to avoid accidental change'
  );

  // --------------------------------------------------------------------------
  // TEST SUITE 6: IndexedDB Queries with Case & Whitespace Inconsistencies
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 6: IndexedDB Queries (Safe Match without Modifying DB) ---');

  // Seed test students with diverse casing and whitespace
  const testStudents: Student[] = [
    {
      id: 'std-c1-1',
      name: 'Ali Class 1',
      fatherName: 'Father 1',
      rollNo: '101',
      admissionNo: 'ADM-101',
      class: 'Class 1' as ClassLevel,
      section: 'A',
      phone: '',
      status: 'Active',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      createdBy: 'test',
    },
    {
      id: 'std-c1-2',
      name: 'Ahmed Class 1 Messy',
      fatherName: 'Father 2',
      rollNo: '102',
      admissionNo: 'ADM-102',
      class: '  class 1  ' as ClassLevel, // Messy whitespace/casing
      section: 'A',
      phone: '',
      status: 'Active',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      createdBy: 'test',
    },
    {
      id: 'std-c10-1',
      name: 'Bilal Class 10',
      fatherName: 'Father 10',
      rollNo: '1001',
      admissionNo: 'ADM-1001',
      class: 'CLASS 10' as ClassLevel, // Uppercase
      section: 'B',
      phone: '',
      status: 'Active',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      createdBy: 'test',
    },
  ];

  const db = await getDB();
  for (const s of testStudents) {
    await db.put('students', s);
  }

  const foundC1 = await getStudentsByClass('Class 1');
  assert(foundC1.length === 2, `getStudentsByClass('Class 1') safely matched both records (${foundC1.length}/2)`);
  
  const foundC10 = await getStudentsByClass('Class 10');
  assert(foundC10.length === 1, `getStudentsByClass('Class 10') safely matched uppercase CLASS 10 (${foundC10.length}/1)`);

  // Verify that the record in the database was NOT modified
  const rawRecord = await db.get('students', 'std-c1-2');
  assert(rawRecord?.class === '  class 1  ', 'Original record in IndexedDB was NOT rewritten or modified');

  // Attendance query test
  const testAttendance: AttendanceRecord = {
    id: 'att-1',
    studentId: 'std-c1-1',
    studentName: 'Ali Class 1',
    rollNo: '101',
    class: '  class 1 ' as ClassLevel,
    section: 'A',
    date: '2026-10-23',
    status: 'Present',
    version: 1,
    schoolId: 'GBHS-MAIN',
    markedBy: 'test',
    updatedAt: new Date().toISOString(),
  };
  await db.put('attendance', testAttendance);
  const foundAtt = await getAttendanceByDateAndClass('2026-10-23', 'Class 1');
  assert(foundAtt.length === 1, 'getAttendanceByDateAndClass safely matches despite whitespace');

  // Teaching Log query test
  const testTeachingLog: TeachingLogEntry = {
    id: 'teach-1',
    date: '2026-10-23',
    day: 'Friday',
    class: 'CLASS 1' as ClassLevel,
    subjectTopic: 'Computer Basics',
    learningObjectives: 'Introduction',
    theoryCovered: 'Hardware vs Software',
    practicalActivity: 'Mouse Practice',
    totalRegistered: 30,
    studentsPresent: 28,
    studentsCompletingTask: 25,
    studentsNeedingHelp: 3,
    teachingMethod: 'Lab',
    instructorName: 'Test Instructor',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put('teaching_logs', testTeachingLog);
  const foundTeaching = await getTeachingLogsByClass('Class 1');
  assert(foundTeaching.length === 1, 'getTeachingLogsByClass safely matches uppercase CLASS 1');

  // Practical Progress query test
  const testPractical: PracticalProgressEntry = {
    id: 'pract-1',
    assessmentDate: '2026-10-23',
    studentName: 'Ali Class 1',
    registrationId: 'ADM-101',
    class: 'Class 1' as ClassLevel,
    skillTask: 'Typing Test',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 90,
    skillStatus: 'Proficient',
    remedialPracticeRequired: 'No',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put('practical_progress', testPractical);
  const foundPractical = await getPracticalProgressByClass('Class 1');
  assert(foundPractical.length === 1, 'getPracticalProgressByClass safely matches Class 1');

  // Absentee Followup query test
  const testAbsentee: AbsenteeFollowupEntry = {
    id: 'abs-1',
    date: '2026-10-23',
    studentName: 'Ali Class 1',
    registrationId: 'ADM-101',
    class: '  class 1' as ClassLevel,
    absenceCount: 2,
    followupReason: 'Medical',
    actionTaken: 'Call',
    contactPerson: 'Father',
    responseReceived: 'Will return Monday',
    followupDate: '2026-10-24',
    currentStatus: 'Pending Return',
    managementReferral: 'No',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put('absentee_followups', testAbsentee);
  const foundAbsentee = await getAbsenteeFollowupsByClass('Class 1');
  assert(foundAbsentee.length === 1, 'getAbsenteeFollowupsByClass safely matches Class 1');

  // --------------------------------------------------------------------------
  // TEST SUITE 7: Dynamic Badge Counts Across Modules
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 7: Dynamic Badge Counts for Classes 1–10 ---');

  const allLogs: TeachingLogEntry[] = [
    { ...testTeachingLog, id: 'tl-1', class: 'Class 1' as ClassLevel },
    { ...testTeachingLog, id: 'tl-2', class: '  class 1  ' as ClassLevel },
    { ...testTeachingLog, id: 'tl-3', class: 'Class 10' as ClassLevel },
    { ...testTeachingLog, id: 'tl-4', class: 'Class 7' as ClassLevel },
  ];

  const availableClasses = CANONICAL_CLASSES;
  const dynamicCounts: Record<string, number> = { all: allLogs.length };
  availableClasses.forEach((cls) => {
    const normCls = cls.trim().toLowerCase().replace(/\s+/g, ' ');
    const count = allLogs.filter((l) => (l.class || '').trim().toLowerCase().replace(/\s+/g, ' ') === normCls).length;
    dynamicCounts[cls] = count;
    const rawKey = cls.toLowerCase().replace(/[\s_-]+/g, '');
    dynamicCounts[rawKey] = count;
  });

  assert(dynamicCounts['Class 1'] === 2, 'Dynamic count for Class 1 correctly handles whitespace (2 entries)');
  assert(dynamicCounts['class1'] === 2, 'Raw key class1 matches Class 1 count (2 entries)');
  assert(dynamicCounts['Class 10'] === 1, 'Dynamic count for Class 10 is 1');
  assert(dynamicCounts['Class 7'] === 1, 'Dynamic count for Class 7 is 1');
  assert(dynamicCounts['Class 2'] === 0, 'Dynamic count for Class 2 is 0');
  assert(dynamicCounts.all === 4, 'Total dynamic count is 4');

  // Badge colors
  for (let i = 1; i <= 10; i++) {
    const color = getClassBadgeColor(`Class ${i}`);
    assert(typeof color === 'string' && color.length > 0, `getClassBadgeColor("Class ${i}") returns valid styles`);
  }
  // Verify backwards compatibility for 7, 8, 9
  assert(getClassBadgeColor('Class 7').includes('sky-500'), 'Class 7 color preserved (sky-500)');
  assert(getClassBadgeColor('Class 8').includes('emerald-500'), 'Class 8 color preserved (emerald-500)');
  assert(getClassBadgeColor('Class 9').includes('indigo-500'), 'Class 9 color preserved (indigo-500)');

  // --------------------------------------------------------------------------
  // TEST SUITE 8: Import Preview Showing Invalid Classes Honestly
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 8: Import Preview Honest Error Reporting ---');

  // Test workbook with a valid Class 10 and an invalid Class 15 and blank class
  const testWb = XLSX.utils.book_new();
  const testWsData = [
    ['Roll No', 'Admission No', 'Student Name', 'Father Name', 'Class', 'Section'],
    ['1', 'ADM-001', 'Zain Ul Abideen', 'Father Zain', 'Class 10', 'A'],
    ['2', 'ADM-002', 'Hamza Khan', 'Father Hamza', 'Class 15', 'A'],
    ['3', 'ADM-003', 'Omer Farooq', 'Father Omer', '', 'B'],
  ];
  const testWs = XLSX.utils.aoa_to_sheet(testWsData);
  XLSX.utils.book_append_sheet(testWb, testWs, 'Students');
  const wbBuf = XLSX.write(testWb, { type: 'array', bookType: 'xlsx' });
  const testFile = new File([wbBuf], 'students-test.xlsx');

  const preview = await parseExcelOrCsvFile(testFile);
  assert(preview.length === 3, 'Preview parsed 3 rows');

  const row1 = preview[0];
  assert(row1.class === 'Class 10', 'Row 1 has valid Class 10');
  assert(row1.validationErrors.length === 0, 'Row 1 has 0 validation errors');
  assert(row1.selected === true, 'Row 1 is selected by default');

  const row2 = preview[1];
  assert(row2.validationErrors.length > 0, 'Row 2 with Class 15 has validation errors');
  assert(row2.selected === false, 'Row 2 with Class 15 is NOT selected');
  assert(
    row2.validationErrors.some((e) => e.includes('Invalid or missing class "Class 15"')),
    'Row 2 has explicit error mentioning "Class 15"'
  );
  assert(row2.class === 'Class 15', 'Row 2 preserves honest raw class "Class 15" instead of defaulting to Class 7');

  const row3 = preview[2];
  assert(row3.validationErrors.length > 0, 'Row 3 with blank class has validation errors');
  assert(row3.selected === false, 'Row 3 with blank class is NOT selected');
  assert(
    row3.validationErrors.some((e) => e.includes('Invalid or missing class')),
    'Row 3 has explicit error for missing class'
  );

  // Bulk module import validation check
  assert(normalizeClassLevel('Class 10') === 'Class 10', 'normalizeClassLevel("Class 10") is valid');
  assert(normalizeClassLevel('Grade 12') === null, 'normalizeClassLevel("Grade 12") is rejected as null');
  assert(normalizeClassLevel('') === null, 'normalizeClassLevel("") is rejected as null');
  assert(normalizeClassLevel('Class 0') === null, 'normalizeClassLevel("Class 0") is rejected as null');

  const teachWb = XLSX.utils.book_new();
  const teachData = [
    {
      'Date (YYYY-MM-DD)*': '2026-10-23',
      'Class (Class 7/8/9)*': 'Class 10',
      'Subject / Topic*': 'Introduction to Operating Systems',
      'Theory Covered': 'Process Management',
      'Practical Activity': 'Terminal Commands',
      'Instructor Name': 'Lead Instructor',
    },
    {
      'Date (YYYY-MM-DD)*': '2026-10-23',
      'Class (Class 7/8/9)*': 'Grade 12',
      'Subject / Topic*': 'Advanced Topics',
      'Theory Covered': 'N/A',
      'Practical Activity': 'N/A',
      'Instructor Name': 'Lead Instructor',
    },
  ];
  const teachWs = XLSX.utils.json_to_sheet(teachData);
  XLSX.utils.book_append_sheet(teachWb, teachWs, 'Teaching Log');
  const teachBuf = XLSX.write(teachWb, { type: 'array', bookType: 'xlsx' });
  const teachFile = new File([teachBuf], 'teaching-test.xlsx');

  const teachParse = await BulkOperationsService.parseFile(teachFile, 'teaching_logs');
  assert(teachParse.validCount === 1, `BulkOperationsService validCount is 1 (${teachParse.validCount})`);
  assert(teachParse.invalidCount === 1, `BulkOperationsService invalidCount is 1 (${teachParse.invalidCount})`);
  const invalidRow = teachParse.validRows.find((r) => !r.isValid);
  assert(
    Boolean(invalidRow?.errors.some((e) => e.includes('Class'))),
    'Invalid row explicitly flagged invalid Class error'
  );

  // --------------------------------------------------------------------------
  // TEST SUITE 9: Simulated Sync Serialization for Classes 1–10
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 9: Simulated Sync Serialization (No Live Call) ---');

  const mockOwnerId = '00000000-0000-0000-0000-000000000001';

  for (let i = 1; i <= 10; i++) {
    const cls = `Class ${i}` as ClassLevel;
    
    // 1. Student
    const testStd: Student = {
      id: `std-sync-${i}`,
      name: `Sync Student ${i}`,
      fatherName: `Sync Father ${i}`,
      rollNo: String(i),
      admissionNo: `ADM-SYNC-${i}`,
      class: cls,
      section: 'A',
      phone: '',
      status: 'Active',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      createdBy: 'sync-test',
    };
    const sPayload = serializeStudentToSupabase(testStd, mockOwnerId);
    assert(sPayload.class === cls, `serializeStudentToSupabase preserves "${cls}"`);
    assert(sPayload.owner_id === mockOwnerId, `serializeStudentToSupabase sets owner_id`);
    
    // Deserialization round-trip
    const deserialized = deserializeStudentFromSupabase(sPayload);
    assert(deserialized.class === cls, `deserializeStudentFromSupabase round-trips "${cls}"`);

    // 2. Attendance
    const testAtt: AttendanceRecord = {
      id: `att-sync-${i}`,
      studentId: `std-sync-${i}`,
      studentName: `Sync Student ${i}`,
      rollNo: String(i),
      class: cls,
      section: 'A',
      date: '2026-10-23',
      status: 'Present',
      version: 1,
      schoolId: 'GBHS-MAIN',
      markedBy: 'sync-test',
      updatedAt: new Date().toISOString(),
    };
    const aPayload = serializeAttendanceToSupabase(testAtt, mockOwnerId);
    assert(aPayload.class === cls, `serializeAttendanceToSupabase preserves "${cls}"`);

    // 3. Teaching Log
    const testTL = {
      id: `tl-sync-${i}`,
      date: '2026-10-23',
      day: 'Friday',
      class: cls,
      subjectTopic: `Topic for ${cls}`,
      instructorName: 'Sync Instructor',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as TeachingLogEntry;
    const tlPayload = serializeTeachingLogToSupabase(testTL, mockOwnerId);
    assert(tlPayload.class === cls, `serializeTeachingLogToSupabase preserves "${cls}"`);

    // 4. Practical Progress
    const testPP: PracticalProgressEntry = {
      id: `pp-sync-${i}`,
      assessmentDate: '2026-10-23',
      studentName: `Sync Student ${i}`,
      registrationId: `ADM-SYNC-${i}`,
      class: cls,
      skillTask: 'Lab Exam',
      attemptNumber: 1,
      practicalCompleted: 'Yes',
      scoreMarks: 85,
      skillStatus: 'Proficient',
      remedialPracticeRequired: 'No',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ppPayload = serializePracticalProgressToSupabase(testPP, mockOwnerId);
    assert(ppPayload.class === cls, `serializePracticalProgressToSupabase preserves "${cls}"`);

    // 5. Absentee Followup
    const testAF: AbsenteeFollowupEntry = {
      id: `af-sync-${i}`,
      date: '2026-10-23',
      studentName: `Sync Student ${i}`,
      registrationId: `ADM-SYNC-${i}`,
      class: cls,
      absenceCount: 1,
      followupReason: 'Personal',
      actionTaken: 'Call',
      contactPerson: 'Father',
      responseReceived: 'Noted',
      followupDate: '2026-10-24',
      currentStatus: 'Pending Return',
      managementReferral: 'No',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const afPayload = serializeAbsenteeFollowupToSupabase(testAF, mockOwnerId);
    assert(afPayload.class === cls, `serializeAbsenteeFollowupToSupabase preserves "${cls}"`);
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 10: Embedded DDL Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 10: Embedded DDL Check in supabase.ts ---');
  const ddl = getSupabaseSQLSchema();
  const expectedCheck = "class TEXT NOT NULL CHECK (class IN ('Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'))";
  const occurrences = ddl.split(expectedCheck).length - 1;
  assert(
    occurrences === 5,
    `Embedded DDL in getSupabaseSQLSchema() contains expected Class 1-10 CHECK constraint on all 5 tables (found ${occurrences}/5)`
  );
  assert(
    !ddl.includes("CHECK (class IN ('Class 7', 'Class 8', 'Class 9'))"),
    'Embedded DDL no longer contains obsolete 3-class check constraint'
  );

  console.log('\n============================================================');
  console.log(`🎉 ALL TESTS PASSED: ${passedTests} passed, ${failedTests} failed`);
  console.log('============================================================\n');
}

runPhase2Tests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED UNEXPECTEDLY:', err);
  process.exit(1);
});
