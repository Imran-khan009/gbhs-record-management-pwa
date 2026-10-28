/**
 * Isolated Regression Test: Roll-Number Sorting Consistency
 * 
 * Verifies:
 * 1. Consistent sorting rules across Student Management, Dashboard, and Reports:
 *    - Students with numeric roll numbers appear first, in ascending numeric order (Roll 1, 2, 3, etc.).
 *    - Students with blank or non-numeric roll numbers appear after numeric roll numbers.
 *    - When both roll numbers are blank or non-numeric, sort alphabetically by student name.
 * 2. Students with Roll 1, 2, and 3 appear before students with blank roll numbers, specifically including Qabeer Ahmed.
 * 3. Actual roll numbers, student IDs, class/section fields, and report calculations are preserved without placeholder roll numbers.
 * 4. Static verification that old flawed parseInt(... || '0') sorting has been removed from all 3 target files.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseRollNumber, compareStudentsByRoll } from '../src/services/recordService';
import { Student } from '../src/types/student';
import { StudentMonthlyLedgerRow } from '../src/services/reportService';

// ANSI terminal colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗${RESET} ${BOLD}${testName}${RESET}`);
    if (detail) console.error(`    ${RED}Detail: ${detail}${RESET}`);
  }
}

console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
console.log(`${BOLD}${CYAN}   ROLL-NUMBER SORTING CONSISTENCY - ISOLATED REGRESSION TEST SUITE   ${RESET}`);
console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

// ============================================================================
// SECTION 1: parseRollNumber Unit Tests
// ============================================================================
console.log(`${BOLD}[SECTION 1] parseRollNumber Unit Tests${RESET}`);

assert(parseRollNumber('1') === 1, 'Parses "1" as numeric 1');
assert(parseRollNumber('2') === 2, 'Parses "2" as numeric 2');
assert(parseRollNumber('3') === 3, 'Parses "3" as numeric 3');
assert(parseRollNumber('10') === 10, 'Parses "10" as numeric 10');
assert(parseRollNumber(' 05 ') === 5, 'Parses " 05 " with whitespace and leading zero as 5');
assert(parseRollNumber(42) === 42, 'Parses numeric literal 42 as 42');

assert(parseRollNumber('') === null, 'Returns null for empty string ""');
assert(parseRollNumber('   ') === null, 'Returns null for whitespace string "   "');
assert(parseRollNumber(null) === null, 'Returns null for null');
assert(parseRollNumber(undefined) === null, 'Returns null for undefined');
assert(parseRollNumber('N/A') === null, 'Returns null for non-numeric "N/A"');
assert(parseRollNumber('R-1') === null, 'Returns null for non-numeric "R-1"');
assert(parseRollNumber('Pending') === null, 'Returns null for non-numeric "Pending"');
assert(parseRollNumber('3A') === null, 'Returns null for alphanumeric "3A"');

// ============================================================================
// SECTION 2: Core Sorting Rules Verification (Roll 1, 2, 3 vs Blank / Qabeer)
// ============================================================================
console.log(`\n${BOLD}[SECTION 2] Core Sorting Rules (Roll 1, 2, 3 before Blank / Qabeer Ahmed)${RESET}`);

const mockRoster: Array<{ id: string; name: string; rollNo: string; class: string }> = [
  { id: 's-blank-qabeer', name: 'Qabeer Ahmed', rollNo: '', class: 'Class 7' },
  { id: 's-roll-3', name: 'Zohaib Hassan', rollNo: '3', class: 'Class 7' },
  { id: 's-roll-1', name: 'Nadir Ali', rollNo: '1', class: 'Class 7' },
  { id: 's-blank-babar', name: 'Babar Ali', rollNo: '', class: 'Class 7' },
  { id: 's-roll-2', name: 'Muhammad Imran', rollNo: '2', class: 'Class 7' },
  { id: 's-roll-10', name: 'Danish Ali', rollNo: '10', class: 'Class 7' },
  { id: 's-nonnumeric', name: 'Yasir Khan', rollNo: 'N/A', class: 'Class 7' },
];

const sortedRoster = [...mockRoster].sort(compareStudentsByRoll);

assert(sortedRoster[0].name === 'Nadir Ali' && sortedRoster[0].rollNo === '1', 'Position 0 is Roll 1 (Nadir Ali)');
assert(sortedRoster[1].name === 'Muhammad Imran' && sortedRoster[1].rollNo === '2', 'Position 1 is Roll 2 (Muhammad Imran)');
assert(sortedRoster[2].name === 'Zohaib Hassan' && sortedRoster[2].rollNo === '3', 'Position 2 is Roll 3 (Zohaib Hassan)');
assert(sortedRoster[3].name === 'Danish Ali' && sortedRoster[3].rollNo === '10', 'Position 3 is Roll 10 (Danish Ali) - numeric ascending');

// Verify that all numeric roll students appear before blank and non-numeric students
const roll1Index = sortedRoster.findIndex((s) => s.rollNo === '1');
const roll2Index = sortedRoster.findIndex((s) => s.rollNo === '2');
const roll3Index = sortedRoster.findIndex((s) => s.rollNo === '3');
const qabeerIndex = sortedRoster.findIndex((s) => s.name === 'Qabeer Ahmed');
const babarIndex = sortedRoster.findIndex((s) => s.name === 'Babar Ali');
const yasirIndex = sortedRoster.findIndex((s) => s.name === 'Yasir Khan');

assert(roll1Index < qabeerIndex, 'Student with Roll 1 appears before Qabeer Ahmed (blank roll)');
assert(roll2Index < qabeerIndex, 'Student with Roll 2 appears before Qabeer Ahmed (blank roll)');
assert(roll3Index < qabeerIndex, 'Student with Roll 3 appears before Qabeer Ahmed (blank roll)');
assert(babarIndex < qabeerIndex, 'Blank roll students sort alphabetically by name: Babar Ali before Qabeer Ahmed');
assert(qabeerIndex < yasirIndex, 'Blank/non-numeric students sort alphabetically: Qabeer Ahmed before Yasir Khan ("N/A")');

// Verify actual roll values and IDs are untouched
const qabeerEntry = sortedRoster.find((s) => s.name === 'Qabeer Ahmed')!;
assert(qabeerEntry.rollNo === '', 'Qabeer Ahmed actual rollNo remains empty string (no placeholder assigned)');
assert(qabeerEntry.id === 's-blank-qabeer', 'Qabeer Ahmed ID is preserved intact');

// ============================================================================
// SECTION 3: Class Boundaries and Multi-Class Isolation
// ============================================================================
console.log(`\n${BOLD}[SECTION 3] Multi-Class Sorting Isolation${RESET}`);

const multiClassRoster = [
  { id: 'c8-blank', name: 'Qabeer Ahmed', rollNo: '', class: 'Class 8' },
  { id: 'c8-1', name: 'Pervaiz Ali', rollNo: '1', class: 'Class 8' },
  { id: 'c7-blank', name: 'Qabeer Ahmed', rollNo: '', class: 'Class 7' },
  { id: 'c7-2', name: 'Muhammad Imran', rollNo: '2', class: 'Class 7' },
  { id: 'c7-1', name: 'Nadir Ali', rollNo: '1', class: 'Class 7' },
  { id: 'c7-3', name: 'Amanullah', rollNo: '3', class: 'Class 7' },
];

const sortedMultiClass = [...multiClassRoster].sort(compareStudentsByRoll);

assert(sortedMultiClass[0].class === 'Class 7' && sortedMultiClass[0].rollNo === '1', 'Class 7 Roll 1 is first');
assert(sortedMultiClass[1].class === 'Class 7' && sortedMultiClass[1].rollNo === '2', 'Class 7 Roll 2 is second');
assert(sortedMultiClass[2].class === 'Class 7' && sortedMultiClass[2].rollNo === '3', 'Class 7 Roll 3 is third');
assert(sortedMultiClass[3].class === 'Class 7' && sortedMultiClass[3].name === 'Qabeer Ahmed', 'Class 7 Qabeer Ahmed (blank roll) is fourth, after Roll 1, 2, 3');
assert(sortedMultiClass[4].class === 'Class 8' && sortedMultiClass[4].rollNo === '1', 'Class 8 Roll 1 follows Class 7');
assert(sortedMultiClass[5].class === 'Class 8' && sortedMultiClass[5].name === 'Qabeer Ahmed', 'Class 8 Qabeer Ahmed (blank roll) is after Class 8 Roll 1');

// ============================================================================
// SECTION 4: StudentMonthlyLedgerRow Compatibility in Report Service
// ============================================================================
console.log(`\n${BOLD}[SECTION 4] Report Service StudentMonthlyLedgerRow Sorting${RESET}`);

const mockLedger: StudentMonthlyLedgerRow[] = [
  {
    studentId: 'id-qabeer',
    rollNo: '',
    name: 'Qabeer Ahmed',
    fatherName: 'Abdullah',
    class: 'Class 7',
    section: 'A',
    totalDays: 26,
    presentDays: 21,
    absentDays: 5,
    leaveDays: 0,
    attendancePercentage: 81,
    status: 'Good (>=80%)',
  },
  {
    studentId: 'id-roll-3',
    rollNo: '3',
    name: 'Amanullah',
    fatherName: 'Shafi Muhammad',
    class: 'Class 7',
    section: 'A',
    totalDays: 26,
    presentDays: 24,
    absentDays: 2,
    leaveDays: 0,
    attendancePercentage: 92,
    status: 'Good (>=80%)',
  },
  {
    studentId: 'id-roll-1',
    rollNo: '1',
    name: 'Nadir Ali',
    fatherName: 'Mehrullah',
    class: 'Class 7',
    section: 'A',
    totalDays: 26,
    presentDays: 25,
    absentDays: 1,
    leaveDays: 0,
    attendancePercentage: 96,
    status: 'Good (>=80%)',
  },
  {
    studentId: 'id-roll-2',
    rollNo: '2',
    name: 'Muhammad Imran',
    fatherName: 'Abdul Gani',
    class: 'Class 7',
    section: 'A',
    totalDays: 26,
    presentDays: 20,
    absentDays: 6,
    leaveDays: 0,
    attendancePercentage: 77,
    status: 'At Risk (75-79%)',
  },
];

mockLedger.sort(compareStudentsByRoll);

assert(mockLedger[0].rollNo === '1' && mockLedger[0].name === 'Nadir Ali', 'Ledger row 0 is Roll 1');
assert(mockLedger[1].rollNo === '2' && mockLedger[1].name === 'Muhammad Imran', 'Ledger row 1 is Roll 2');
assert(mockLedger[2].rollNo === '3' && mockLedger[2].name === 'Amanullah', 'Ledger row 2 is Roll 3');
assert(mockLedger[3].rollNo === '' && mockLedger[3].name === 'Qabeer Ahmed', 'Ledger row 3 is blank-roll Qabeer Ahmed (after Roll 1, 2, 3)');
assert(mockLedger[3].attendancePercentage === 81, 'Ledger row attendance calculation (81%) preserved');
assert(mockLedger[3].studentId === 'id-qabeer', 'Ledger student ID preserved');

// ============================================================================
// SECTION 5: Source Code Audit - Flawed parseInt(... || '0') Removed
// ============================================================================
console.log(`\n${BOLD}[SECTION 5] Source Code Static Audit${RESET}`);

const studentMgmtPath = resolve(process.cwd(), 'src/components/students/StudentManagementView.tsx');
const dashboardPath = resolve(process.cwd(), 'src/components/dashboard/DashboardView.tsx');
const reportServicePath = resolve(process.cwd(), 'src/services/reportService.ts');

const studentMgmtSrc = readFileSync(studentMgmtPath, 'utf-8');
const dashboardSrc = readFileSync(dashboardPath, 'utf-8');
const reportServiceSrc = readFileSync(reportServicePath, 'utf-8');

assert(
  studentMgmtSrc.includes('compareStudentsByRoll') && !studentMgmtSrc.includes("parseInt(a.rollNo || '0'"),
  'StudentManagementView imports and uses compareStudentsByRoll; old parseInt(a.rollNo || \'0\') removed'
);

assert(
  dashboardSrc.includes('compareStudentsByRoll') && !dashboardSrc.includes("parseInt(a.rollNo || '0'"),
  'DashboardView imports and uses compareStudentsByRoll; old parseInt(a.rollNo || \'0\') removed'
);

assert(
  reportServiceSrc.includes('compareStudentsByRoll') && !reportServiceSrc.includes('parseInt(a.rollNo) || 0'),
  'reportService imports and uses compareStudentsByRoll; old parseInt(a.rollNo) || 0 removed'
);

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`\n${BOLD}======================================================================${RESET}`);
console.log(`${BOLD}REGRESSION TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)${RESET}`);
console.log(`${BOLD}======================================================================${RESET}\n`);

if (failedTests > 0) {
  process.exit(1);
}
