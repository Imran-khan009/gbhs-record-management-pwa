import * as path from 'path';
import * as xlsx from 'xlsx';
import { calculateStudentAttendanceAlerts, StudentAttendanceAlert } from '../src/services/alertService';
import { BulkOperationsService } from '../src/services/bulkOperationsService';
import { Student, AttendanceRecord, Section, AttendanceStatus } from '../src/types/student';

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
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

async function runRegressionSuite() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   SMART ATTENDANCE ALERT - ISOLATED REGRESSION TEST SUITE            ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  // Load Book1.xlsx fixture
  const fixturePath = 'C:\\Users\\7xUltra\\Desktop\\ASSESMENT RECORDS GBHS\\Attendnce Pic\\Attendance 7\\CLASS 7 ATTENDANCE\\Book1.xlsx';
  console.log(`${CYAN}Loading workbook fixture:${RESET} ${fixturePath}`);

  const wb = xlsx.readFile(fixturePath);
  const sheetName = 'Sheet1 (2)';
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet ${sheetName} not found in workbook.`);
  }

  function makeMockStudent(
    base: Partial<Student> & { id: string; name: string; rollNo: string; class: string; section: Section; admissionNo: string }
  ): Student {
    const now = new Date().toISOString();
    return {
      fatherName: 'Father of ' + base.name,
      phone: '03000000000',
      guardianContact: '03000000000',
      status: 'Active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      schoolId: 'gbhs-main',
      createdBy: 'system',
      ...base,
    };
  }

  function makeMockAttendance(base: {
    id: string;
    studentId: string;
    studentName: string;
    rollNo: string;
    class: string;
    section: Section;
    date: string;
    status: AttendanceStatus;
  }): AttendanceRecord {
    const now = new Date().toISOString();
    return {
      version: 1,
      updatedAt: now,
      schoolId: 'gbhs-main',
      markedBy: 'system',
      ...base,
    };
  }

  // Define isolated Class 7 students (25 students matching Book1.xlsx exact rolls & names)
  const students: Student[] = [
    makeMockStudent({ id: 'c7-1', name: 'Habib Jan', rollNo: '1078', class: 'Class 7', section: 'A', admissionNo: '1078' }),
    makeMockStudent({ id: 'c7-2', name: 'Bilal Hussain', rollNo: '1247', class: 'Class 7', section: 'A', admissionNo: '1247' }),
    makeMockStudent({ id: 'c7-3', name: 'Faisal', rollNo: '1286', class: 'Class 7', section: 'A', admissionNo: '1286' }),
    makeMockStudent({ id: 'c7-4', name: 'Siraj Akhter', rollNo: '1302', class: 'Class 7', section: 'A', admissionNo: '1302' }),
    makeMockStudent({ id: 'c7-5', name: 'Muhammad Siraj', rollNo: '1305', class: 'Class 7', section: 'A', admissionNo: '1305' }),
    makeMockStudent({ id: 'c7-6', name: 'Sarfaraz', rollNo: '1369', class: 'Class 7', section: 'A', admissionNo: '1369' }),
    makeMockStudent({ id: 'c7-7', name: 'Muhammad Hussain', rollNo: '1403', class: 'Class 7', section: 'A', admissionNo: '1403' }),
    makeMockStudent({ id: 'c7-8', name: 'Adeel', rollNo: '1406', class: 'Class 7', section: 'A', admissionNo: '1406' }),
    makeMockStudent({ id: 'c7-9', name: 'Ghulam Safder', rollNo: '1409', class: 'Class 7', section: 'A', admissionNo: '1409' }),
    makeMockStudent({ id: 'c7-10', name: 'Nadir Ali', rollNo: '3473', class: 'Class 7', section: 'A', admissionNo: '3473' }),
    makeMockStudent({ id: 'c7-11', name: 'Muhammad Imran', rollNo: '3796', class: 'Class 7', section: 'A', admissionNo: '3796' }),
    makeMockStudent({ id: 'c7-12', name: 'Abul Qadeer', rollNo: '4097', class: 'Class 7', section: 'A', admissionNo: '4097' }),
    makeMockStudent({ id: 'c7-13', name: 'Muhammad Bilal', rollNo: '5040', class: 'Class 7', section: 'A', admissionNo: '5040' }),
    makeMockStudent({ id: 'c7-14', name: 'Muhammad Salim', rollNo: '5053', class: 'Class 7', section: 'B', admissionNo: '5053' }),
    makeMockStudent({ id: 'c7-15', name: 'Shahzaib', rollNo: '5064', class: 'Class 7', section: 'B', admissionNo: '5064' }),
    makeMockStudent({ id: 'c7-16', name: 'Faizan Ali', rollNo: '5375', class: 'Class 7', section: 'B', admissionNo: '5375' }),
    makeMockStudent({ id: 'c7-17', name: 'Ejaz Ali', rollNo: '5669', class: 'Class 7', section: 'B', admissionNo: '5669' }),
    makeMockStudent({ id: 'c7-18', name: 'Hakim Ali', rollNo: '5944', class: 'Class 7', section: 'B', admissionNo: '5944' }),
    makeMockStudent({ id: 'c7-19', name: 'Madad Ali', rollNo: '5996', class: 'Class 7', section: 'B', admissionNo: '5996' }),
    makeMockStudent({ id: 'c7-20', name: 'Muhammad Haneef', rollNo: '6127', class: 'Class 7', section: 'B', admissionNo: '6127' }),
    makeMockStudent({ id: 'c7-21', name: 'Shehbaz Akhter', rollNo: '6357', class: 'Class 7', section: 'B', admissionNo: '6357' }),
    makeMockStudent({ id: 'c7-22', name: 'Amjad', rollNo: '6487', class: 'Class 7', section: 'B', admissionNo: '6487' }),
    makeMockStudent({ id: 'c7-23', name: 'Zubair Ahmed', rollNo: '6495', class: 'Class 7', section: 'B', admissionNo: '6495' }),
    makeMockStudent({ id: 'c7-24', name: 'Hamid Ali', rollNo: '6499', class: 'Class 7', section: 'B', admissionNo: '6499' }),
    makeMockStudent({ id: 'c7-25', name: 'Qabeer Ahmed', rollNo: '', class: 'Class 7', section: 'B', admissionNo: 'TEMP-C7-NR1' }),
  ];

  // Unroll the attendance matrix using the application's actual unroller
  const unrolled = BulkOperationsService.unrollAttendanceMatrixIfApplicable(
    ws,
    'Book1.xlsx',
    'Sheet1 (2)',
    'Class 7'
  );

  console.log(`Unrolled ${unrolled.rows.length} matrix rows across 30 days.`);

  // Map unrolled rows to AttendanceRecord domain objects
  // Note: Holy Day ('H') cells are skipped automatically by unroller (excluded from denominator).
  const attendanceRecords: AttendanceRecord[] = [];
  for (const rec of unrolled.rows) {
    const student = students.find((s) => (rec.rollno && s.rollNo === rec.rollno) || s.name.toLowerCase() === (rec.name || '').toLowerCase());
    if (!student) continue;

    const normalizedStatus = BulkOperationsService.normalizeAttendanceStatus(rec.status, {
      fileName: 'Book1.xlsx',
      sheetName: 'Sheet1 (2)',
      templateFormat: 'holy_day_matrix',
      hasHolyDay: true,
      lMeaning: 'Leave',
    }) as any;

    attendanceRecords.push(
      makeMockAttendance({
        id: `att-${student.id}-${rec.date}`,
        studentId: student.id,
        studentName: student.name,
        rollNo: student.rollNo,
        class: student.class,
        section: student.section,
        date: rec.date,
        status: normalizedStatus || 'Present',
      })
    );
  }

  console.log(`Mapped ${attendanceRecords.length} student attendance records (excluding 4 H Sundays).\n`);

  // ==========================================================================
  // SECTION 1: Month-to-date calculation as of April 30, 2026
  // ==========================================================================
  console.log(`${BOLD}Test Section 1: April 2026 Full-Month Smart Alert Audit (as of 2026-04-30)${RESET}`);

  const april30Alerts = calculateStudentAttendanceAlerts(students, attendanceRecords, '2026-04-30');

  // Verify total working days for all students is 26 (30 calendar days - 4 Sunday Holy Days)
  const all26Days = Array.from(april30Alerts.values()).every((a) => a.totalDays === 26);
  assert(all26Days, 'All 25 students have exactly 26 working days in denominator (Sundays excluded)');

  // Verify the 12 expected students below 75% attendance
  const expectedLowAttStudents = [
    { name: 'Habib Jan', expectedPct: 65 },
    { name: 'Faisal', expectedPct: 58 },
    { name: 'Muhammad Imran', expectedPct: 42 },
    { name: 'Abul Qadeer', expectedPct: 42 },
    { name: 'Muhammad Bilal', expectedPct: 38 },
    { name: 'Muhammad Salim', expectedPct: 46 },
    { name: 'Shahzaib', expectedPct: 31 },
    { name: 'Faizan Ali', expectedPct: 38 },
    { name: 'Ejaz Ali', expectedPct: 54 },
    { name: 'Hakim Ali', expectedPct: 31 },
    { name: 'Madad Ali', expectedPct: 73 },
    { name: 'Hamid Ali', expectedPct: 73 },
  ];

  let lowAttMatches = 0;
  for (const exp of expectedLowAttStudents) {
    const student = students.find((s) => s.name === exp.name)!;
    const alert = april30Alerts.get(student.id)!;
    if (alert.isLowAttendance && alert.attendancePercentage === exp.expectedPct) {
      lowAttMatches++;
    }
  }
  assert(lowAttMatches === 12, `Exactly 12 students verified below 75% attendance (${lowAttMatches}/12 matched)`);

  // Count total low attendance flags
  const totalLowAttCount = Array.from(april30Alerts.values()).filter((a) => a.isLowAttendance).length;
  assert(totalLowAttCount === 12, `Total low attendance count is exactly 12 (actual: ${totalLowAttCount})`);

  // ==========================================================================
  // SECTION 2: Investigation of Nadir Ali (Active Absence Streak)
  // ==========================================================================
  console.log(`\n${BOLD}Test Section 2: Nadir Ali (Roll 3473) Continuing Absence Streak${RESET}`);
  const nadir = students.find((s) => s.rollNo === '3473')!;
  const nadirAlert = april30Alerts.get(nadir.id)!;

  assert(nadirAlert.attendancePercentage === 77, `Nadir Ali attendance percentage is 77% (>= 75%)`);
  assert(!nadirAlert.isLowAttendance, `Nadir Ali isLowAttendance is false`);
  assert(nadirAlert.consecutiveAbsences === 4, `Nadir Ali has 4 active consecutive absences on April 30 (D27-D30)`);
  assert(nadirAlert.isAtRiskAbsence === true, `Nadir Ali isAtRiskAbsence is true (>= 3 threshold)`);
  assert(nadirAlert.isAtRisk === true, `Nadir Ali is marked At-Risk overall`);
  assert(nadirAlert.alertBadgeText === '4 Cons. Absences', `Nadir Ali badge text is '4 Cons. Absences' (actual: '${nadirAlert.alertBadgeText}')`);

  // Total At-Risk Count for Class 7 = 12 (low attendance) + 1 (Nadir Ali) = 13 students
  const totalAtRiskCount = Array.from(april30Alerts.values()).filter((a) => a.isAtRisk).length;
  assert(totalAtRiskCount === 13, `Total At-Risk count is exactly 13 students (12 low att + Nadir Ali)`);

  // ==========================================================================
  // SECTION 3: Investigation of Ghulam Safder (Absences followed by Present)
  // ==========================================================================
  console.log(`\n${BOLD}Test Section 3: Ghulam Safder (Roll 1409) Dynamic As-Of-Date Behavior${RESET}`);
  const ghulam = students.find((s) => s.rollNo === '1409')!;

  // 1. As of April 30 (Day 30 was Present after Days 27, 28, 29 Absent)
  const ghulamApr30 = april30Alerts.get(ghulam.id)!;
  assert(ghulamApr30.attendancePercentage === 81, `Ghulam Safder attendance is 81% as of April 30`);
  assert(ghulamApr30.consecutiveAbsences === 0, `Ghulam Safder consecutiveAbsences is 0 on April 30 (Present on D30 resets active streak)`);
  assert(!ghulamApr30.isAtRisk, `Ghulam Safder is NOT at-risk on April 30`);

  // 2. As of April 29 (Days 27, 28, 29 Absent, April 30 has NOT occurred yet)
  const april29Alerts = calculateStudentAttendanceAlerts(students, attendanceRecords, '2026-04-29');
  const ghulamApr29 = april29Alerts.get(ghulam.id)!;
  assert(ghulamApr29.totalDays === 25, `Ghulam Safder totalDays as of April 29 is 25 days`);
  assert(ghulamApr29.consecutiveAbsences === 3, `Ghulam Safder consecutiveAbsences is 3 as of April 29 (D27, D28, D29)`);
  assert(ghulamApr29.isAtRiskAbsence === true, `Ghulam Safder isAtRiskAbsence is true as of April 29`);
  assert(ghulamApr29.alertBadgeText === '3 Cons. Absences', `Ghulam Safder badge is '3 Cons. Absences' on April 29`);

  // ==========================================================================
  // SECTION 4: Section Filtering & Display Count Alignment
  // ==========================================================================
  console.log(`\n${BOLD}Test Section 4: Section Filtering Consistency${RESET}`);

  // Class 7 Section A (Students 1..13):
  // At-risk students in Section A:
  // Habib Jan (65%), Faisal (58%), Nadir Ali (4 cons), Muhammad Imran (42%), Abul Qadeer (42%), Muhammad Bilal (38%)
  // Total in Sec A = 6
  const secACount = Array.from(april30Alerts.values()).filter(
    (a) => a.class === 'Class 7' && a.section === 'A' && (a.isLowAttendance || a.isAtRiskAbsence)
  ).length;

  // Class 7 Section B (Students 14..25):
  // At-risk students in Section B:
  // Salim (46%), Shahzaib (31%), Faizan Ali (38%), Ejaz Ali (54%), Hakim Ali (31%), Madad Ali (73%), Hamid Ali (73%)
  // Total in Sec B = 7
  const secBCount = Array.from(april30Alerts.values()).filter(
    (a) => a.class === 'Class 7' && a.section === 'B' && (a.isLowAttendance || a.isAtRiskAbsence)
  ).length;

  assert(secACount === 6, `Section A has exactly 6 at-risk students (actual: ${secACount})`);
  assert(secBCount === 7, `Section B has exactly 7 at-risk students (actual: ${secBCount})`);
  assert(secACount + secBCount === 13, `Section A (6) + Section B (7) equals Total At-Risk (13)`);

  // Test UI filter function replication
  function getFilteredStudents(sec: string, showAtRiskOnly: boolean) {
    return students
      .filter((s) => sec === 'All' || s.section === sec)
      .filter((s) => {
        if (!showAtRiskOnly) return true;
        const alert = april30Alerts.get(s.id);
        return alert && (alert.isLowAttendance || alert.isAtRiskAbsence);
      });
  }

  const filteredSecA = getFilteredStudents('A', true);
  assert(filteredSecA.length === secACount, `Filtered list for Section A matches secACount (${filteredSecA.length} === ${secACount})`);

  const filteredSecB = getFilteredStudents('B', true);
  assert(filteredSecB.length === secBCount, `Filtered list for Section B matches secBCount (${filteredSecB.length} === ${secBCount})`);

  const filteredAll = getFilteredStudents('All', true);
  assert(filteredAll.length === 13, `Filtered list for 'All' matches total atRiskCount (${filteredAll.length} === 13)`);

  // ==========================================================================
  // SECTION 5: Blank Roll Number Handling & Sorting (Qabeer Ahmed)
  // ==========================================================================
  console.log(`\n${BOLD}Test Section 5: Blank Roll Numbers (Qabeer Ahmed)${RESET}`);
  const qabeer = students.find((s) => s.name === 'Qabeer Ahmed')!;
  const qabeerAlert = april30Alerts.get(qabeer.id)!;

  assert(qabeer.rollNo === '', `Qabeer Ahmed has blank roll number`);
  assert(qabeerAlert.totalDays === 26, `Qabeer Ahmed attendance records resolved correctly by identity (totalDays: 26)`);
  assert(qabeerAlert.attendancePercentage === 81, `Qabeer Ahmed attendance is 81% (P=21, A=5)`);
  assert(!qabeerAlert.isAtRisk, `Qabeer Ahmed is not at-risk`);

  // Test custom sorting placing blank roll numbers after numeric roll numbers
  const sortedStudents = [...students].sort((a, b) => {
    const rollA = a.rollNo && !isNaN(parseInt(a.rollNo, 10)) ? parseInt(a.rollNo, 10) : null;
    const rollB = b.rollNo && !isNaN(parseInt(b.rollNo, 10)) ? parseInt(b.rollNo, 10) : null;
    if (rollA !== null && rollB !== null) return rollA - rollB;
    if (rollA !== null && rollB === null) return -1;
    if (rollA === null && rollB !== null) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const firstStudent = sortedStudents[0];
  const lastStudent = sortedStudents[sortedStudents.length - 1];

  assert(firstStudent.rollNo === '1078' && firstStudent.name === 'Habib Jan', `First sorted student is Roll 1078 (Habib Jan)`);
  assert(lastStudent.name === 'Qabeer Ahmed' && lastStudent.rollNo === '', `Blank-roll student (Qabeer Ahmed) is placed after all numeric roll numbers`);

  // ==========================================================================
  // SECTION 6: Multi-Month Historical Isolation (No Distortion)
  // ==========================================================================
  console.log(`\n${BOLD}Test Section 6: Multi-Month Isolation Verification${RESET}`);

  // Create synthetic records for Habib Jan in March 2026 (30 Present days) and May 2026 (15 Absent days)
  const multiMonthRecords: AttendanceRecord[] = [...attendanceRecords];

  for (let d = 1; d <= 30; d++) {
    const dayStr = d < 10 ? `0${d}` : `${d}`;
    multiMonthRecords.push(
      makeMockAttendance({
        id: `att-march-${d}`,
        studentId: 'c7-1',
        studentName: 'Habib Jan',
        rollNo: '1078',
        class: 'Class 7',
        section: 'A',
        date: `2026-03-${dayStr}`,
        status: 'Present',
      })
    );
  }

  for (let d = 1; d <= 15; d++) {
    const dayStr = d < 10 ? `0${d}` : `${d}`;
    multiMonthRecords.push(
      makeMockAttendance({
        id: `att-may-${d}`,
        studentId: 'c7-1',
        studentName: 'Habib Jan',
        rollNo: '1078',
        class: 'Class 7',
        section: 'A',
        date: `2026-05-${dayStr}`,
        status: 'Absent',
      })
    );
  }

  // Calculate alerts as of April 30, 2026 with multi-month data present
  const isolatedAprilAlerts = calculateStudentAttendanceAlerts(students, multiMonthRecords, '2026-04-30');
  const habibApril = isolatedAprilAlerts.get('c7-1')!;

  assert(habibApril.totalDays === 26, `Habib Jan April totalDays is strictly 26 (March & May excluded from denominator)`);
  assert(habibApril.presentDays === 17, `Habib Jan April presentDays is strictly 17 (March presents excluded)`);
  assert(habibApril.attendancePercentage === 65, `Habib Jan April percentage remains exactly 65% despite 30 March presents and 15 May absents`);

  // Calculate alerts as of March 31, 2026
  const marchAlerts = calculateStudentAttendanceAlerts(students, multiMonthRecords, '2026-03-31');
  const habibMarch = marchAlerts.get('c7-1')!;
  assert(habibMarch.totalDays === 30, `Habib Jan March totalDays is strictly 30`);
  assert(habibMarch.attendancePercentage === 100, `Habib Jan March percentage is 100%`);

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log(`\n${BOLD}======================================================================${RESET}`);
  console.log(`${BOLD}REGRESSION TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)${RESET}`);
  console.log(`${BOLD}======================================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error(`${RED}Test suite crashed:${RESET}`, err);
  process.exit(1);
});
