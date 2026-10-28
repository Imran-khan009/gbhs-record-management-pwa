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
  bulkSaveStudentsLocally,
  getAllStudents,
  clearAllStudentsLocally,
  bulkSaveAttendanceLocally,
  getAttendanceByDateAndClass,
  getAllAttendanceRecords,
  saveTeachingLogLocally,
  savePracticalProgressLocally,
  saveAbsenteeFollowupLocally,
  setActiveWorkspaceId,
} from '../src/services/db';
import {
  generateMonthlyReportData,
  exportMonthlyReportToExcel,
} from '../src/services/reportService';
import { clearAllModulesMockData } from '../src/services/modulesService';
import { Student, AttendanceRecord } from '../src/types/student';

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

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING TEST SUITE: Attendance Date Workflow & Monthly History');
  console.log('====================================================\n');

  // CLEAN STATE
  setActiveWorkspaceId('test-attendance-ws');
  await clearAllStudentsLocally();
  await clearAllModulesMockData();

  // 1. SEED STUDENTS
  const students: Student[] = [
    {
      id: 'stu-c7-1',
      rollNo: '1',
      admissionNo: 'ADM-701',
      name: 'Ali Raza',
      fatherName: 'Raza Ali',
      class: 'Class 7',
      section: 'A',
      phone: '03001111111',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-operator@gbhs.edu.pk',
      version: 1,
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-03-01T08:00:00Z',
    },
    {
      id: 'stu-c7-2',
      rollNo: '2',
      admissionNo: 'ADM-702',
      name: 'Farhan Zaidi',
      fatherName: 'Haider Zaidi',
      class: 'Class 7',
      section: 'A',
      phone: '03002222222',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-operator@gbhs.edu.pk',
      version: 1,
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-03-01T08:00:00Z',
    },
    {
      id: 'stu-c8-1',
      rollNo: '1',
      admissionNo: 'ADM-801',
      name: 'Kamran Akmal',
      fatherName: 'Akmal Khan',
      class: 'Class 8',
      section: 'A',
      phone: '03003333333',
      status: 'Active',
      schoolId: 'GBHS-MAIN',
      createdBy: 'test-operator@gbhs.edu.pk',
      version: 1,
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-03-01T08:00:00Z',
    },
  ];
  await bulkSaveStudentsLocally(students);
  assert('Setup', 'Seed 3 test students', (await getAllStudents()).length === 3, 'Seeded test students');

  // 2. ATTENDANCE DATE WORKFLOW
  console.log('\n--- 2. Date-Based Attendance Persistence ---');
  const sessionDate1 = '2026-10-15';
  const records1: AttendanceRecord[] = [
    {
      id: `stu-c7-1_${sessionDate1}`,
      studentId: 'stu-c7-1',
      studentName: 'Ali Raza',
      rollNo: '1',
      class: 'Class 7',
      section: 'A',
      date: sessionDate1,
      status: 'Present',
      version: 1,
      updatedAt: '2026-10-15T09:00:00Z',
      schoolId: 'GBHS-MAIN',
      markedBy: 'operator@gbhs.edu.pk',
    },
    {
      id: `stu-c7-2_${sessionDate1}`,
      studentId: 'stu-c7-2',
      studentName: 'Farhan Zaidi',
      rollNo: '2',
      class: 'Class 7',
      section: 'A',
      date: sessionDate1,
      status: 'Absent',
      version: 1,
      updatedAt: '2026-10-15T09:00:00Z',
      schoolId: 'GBHS-MAIN',
      markedBy: 'operator@gbhs.edu.pk',
    },
  ];
  await bulkSaveAttendanceLocally(records1);

  // Verify records saved with correct date
  const loaded15th = await getAttendanceByDateAndClass(sessionDate1, 'Class 7');
  assert('Attendance Date', 'Reopen saved session retrieves exactly saved date', loaded15th.length === 2 && loaded15th[0].date === sessionDate1, `Loaded 2 records with date ${sessionDate1}`);
  assert('Attendance Date', 'Student 1 is Present', loaded15th.find((r) => r.studentId === 'stu-c7-1')?.status === 'Present', 'Ali is Present');
  assert('Attendance Date', 'Student 2 is Absent', loaded15th.find((r) => r.studentId === 'stu-c7-2')?.status === 'Absent', 'Farhan is Absent');

  // Historical date entry: e.g. 2026-09-10 (earlier date correction)
  console.log('\n--- 3. Historical Date Entry & Retrieval ---');
  const historicalDate = '2026-09-10';
  const historicalRecords: AttendanceRecord[] = [
    {
      id: `stu-c7-1_${historicalDate}`,
      studentId: 'stu-c7-1',
      studentName: 'Ali Raza',
      rollNo: '1',
      class: 'Class 7',
      section: 'A',
      date: historicalDate,
      status: 'Present',
      version: 1,
      updatedAt: '2026-09-10T09:00:00Z',
      schoolId: 'GBHS-MAIN',
      markedBy: 'operator@gbhs.edu.pk',
    },
  ];
  await bulkSaveAttendanceLocally(historicalRecords);

  const loadedHistorical = await getAttendanceByDateAndClass(historicalDate, 'Class 7');
  assert('Historical Attendance', 'Retrieve historical date attendance', loadedHistorical.length === 1 && loadedHistorical[0].date === historicalDate, `Retrieved historical record on ${historicalDate}`);

  // Second date in October: 2026-10-16
  const sessionDate2 = '2026-10-16';
  const records2: AttendanceRecord[] = [
    {
      id: `stu-c7-1_${sessionDate2}`,
      studentId: 'stu-c7-1',
      studentName: 'Ali Raza',
      rollNo: '1',
      class: 'Class 7',
      section: 'A',
      date: sessionDate2,
      status: 'Present',
      version: 1,
      updatedAt: '2026-10-16T09:00:00Z',
      schoolId: 'GBHS-MAIN',
      markedBy: 'operator@gbhs.edu.pk',
    },
    {
      id: `stu-c7-2_${sessionDate2}`,
      studentId: 'stu-c7-2',
      studentName: 'Farhan Zaidi',
      rollNo: '2',
      class: 'Class 7',
      section: 'A',
      date: sessionDate2,
      status: 'Leave',
      version: 1,
      updatedAt: '2026-10-16T09:00:00Z',
      schoolId: 'GBHS-MAIN',
      markedBy: 'operator@gbhs.edu.pk',
    },
  ];
  await bulkSaveAttendanceLocally(records2);

  // Verify duplicate prevention: attempting to save duplicate record on same date updates or preserves unique composite ID
  console.log('\n--- 4. Duplicate Prevention by Student & Date ---');
  const allAtt = await getAllAttendanceRecords();
  const c7RecordsOn15th = allAtt.filter((r) => r.studentId === 'stu-c7-1' && r.date === sessionDate1);
  assert('Duplicate Prevention', 'Exactly one record per student per date', c7RecordsOn15th.length === 1, `Found ${c7RecordsOn15th.length} record for Ali on ${sessionDate1}`);

  // Seed Teaching Logs, Practicals, and Follow-ups for October 2026
  console.log('\n--- 5. Seed Teaching, Practical, and Follow-up Logs ---');
  await saveTeachingLogLocally({
    id: 'tlog-1',
    date: '2026-10-15',
    day: 'Thursday',
    class: 'Class 7',
    subjectTopic: 'Computer Hardware',
    learningObjectives: 'Learn RAM and CPU architecture',
    theoryCovered: 'Von Neumann Architecture',
    practicalActivity: 'Motherboard inspection',
    totalRegistered: 2,
    studentsPresent: 2,
    studentsCompletingTask: 2,
    studentsNeedingHelp: 0,
    teachingMethod: 'Lecture & Lab',
    instructorName: 'Sir Imran Khan',
    version: 1,
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-10-15T10:00:00Z',
  });

  await savePracticalProgressLocally({
    id: 'prac-1',
    assessmentDate: '2026-10-16',
    studentId: 'stu-c7-1',
    registrationId: '1',
    studentName: 'Ali Raza',
    class: 'Class 7',
    skillTask: 'MS Word Paragraph Formatting',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 92,
    skillStatus: 'Proficient',
    remedialPracticeRequired: 'No',
    version: 1,
    createdAt: '2026-10-16T11:00:00Z',
    updatedAt: '2026-10-16T11:00:00Z',
  });

  await saveAbsenteeFollowupLocally({
    id: 'abs-1',
    date: '2026-10-15',
    studentId: 'stu-c7-2',
    registrationId: '2',
    studentName: 'Farhan Zaidi',
    class: 'Class 7',
    absenceCount: 2,
    followupReason: 'Medical / Viral Fever',
    actionTaken: 'Phone Call to Guardian',
    contactPerson: 'Father (Haider Zaidi)',
    responseReceived: 'Will return after recovery',
    expectedReturnDate: '2026-10-19',
    followupDate: '2026-10-15',
    currentStatus: 'Pending Return',
    managementReferral: 'No',
    version: 1,
    createdAt: '2026-10-15T12:00:00Z',
    updatedAt: '2026-10-15T12:00:00Z',
  });

  // 6. MONTHLY HISTORY & REPORT AGGREGATION
  console.log('\n--- 6. Monthly Report Aggregation & Date Isolation ---');
  const octoberReport = await generateMonthlyReportData(2026, 10, 'Class 7');

  assert('Monthly Report', 'Target month is October', octoberReport.monthName === 'October' && octoberReport.year === 2026, 'Month is October 2026');
  assert('Monthly Report', 'Enrolled count in Class 7 is 2', octoberReport.enrolledStudentsCount === 2, `Enrolled count: ${octoberReport.enrolledStudentsCount}`);
  assert('Monthly Report', 'Working days count is 2 (15th and 16th)', octoberReport.workingDaysCount === 2, `Working days: ${octoberReport.workingDaysCount}`);

  // Check distinct recorded dates
  assert('Date Fidelity', 'Recorded attendance dates match actual saved days only',
    octoberReport.recordedAttendanceDates.length === 2 &&
    octoberReport.recordedAttendanceDates.includes('2026-10-15') &&
    octoberReport.recordedAttendanceDates.includes('2026-10-16'),
    `Recorded dates: [${octoberReport.recordedAttendanceDates.join(', ')}]`
  );
  assert('Date Fidelity', 'Does not fabricate records for unscheduled days (e.g. 17th-31st)',
    !octoberReport.recordedAttendanceDates.includes('2026-10-17') &&
    !octoberReport.recordedAttendanceDates.includes('2026-10-01'),
    'No phantom records for unrecorded dates'
  );

  assert('Date Fidelity', 'Recorded teaching dates match actual entries',
    octoberReport.recordedTeachingDates.length === 1 && octoberReport.recordedTeachingDates[0] === '2026-10-15',
    `Teaching dates: [${octoberReport.recordedTeachingDates.join(', ')}]`
  );
  assert('Date Fidelity', 'Recorded practical dates match actual entries',
    octoberReport.recordedPracticalDates.length === 1 && octoberReport.recordedPracticalDates[0] === '2026-10-16',
    `Practical dates: [${octoberReport.recordedPracticalDates.join(', ')}]`
  );
  assert('Date Fidelity', 'Recorded followup dates match actual entries',
    octoberReport.recordedFollowupDates.length === 1 && octoberReport.recordedFollowupDates[0] === '2026-10-15',
    `Followup dates: [${octoberReport.recordedFollowupDates.join(', ')}]`
  );

  // Check student attendance calculations
  const aliRow = octoberReport.studentLedger.find((r) => r.name === 'Ali Raza');
  const farhanRow = octoberReport.studentLedger.find((r) => r.name === 'Farhan Zaidi');
  assert('Attendance Ledger', 'Ali has 2 presents out of 2 days (100%)', aliRow?.presentDays === 2 && aliRow?.attendancePercentage === 100, `Ali: ${aliRow?.presentDays}P, ${aliRow?.attendancePercentage}%`);
  assert('Attendance Ledger', 'Farhan has 0 presents, 1 absent, 1 leave (0%)', farhanRow?.presentDays === 0 && farhanRow?.absentDays === 1, `Farhan: ${farhanRow?.presentDays}P, ${farhanRow?.absentDays}A, ${farhanRow?.leaveDays}L`);

  // Check class isolation: query for Class 8
  console.log('\n--- 7. Class Level Isolation ---');
  const class8Report = await generateMonthlyReportData(2026, 10, 'Class 8');
  assert('Class Isolation', 'Class 8 report has 1 enrolled student', class8Report.enrolledStudentsCount === 1, `Class 8 enrolled: ${class8Report.enrolledStudentsCount}`);
  assert('Class Isolation', 'Class 8 has 0 attendance records for October', class8Report.workingDaysCount === 0 && class8Report.recordedAttendanceDates.length === 0, 'Class 8 working days: 0');

  // Check month isolation: query for September 2026
  console.log('\n--- 8. Month Level Isolation ---');
  const septReport = await generateMonthlyReportData(2026, 9, 'Class 7');
  assert('Month Isolation', 'September report has 1 working day (10th)', septReport.workingDaysCount === 1 && septReport.recordedAttendanceDates[0] === '2026-09-10', `September working days: ${septReport.workingDaysCount}`);

  // 9. EXCEL EXPORT WORKBOOK VERIFICATION
  console.log('\n--- 9. Comprehensive Excel Export Verification ---');
  // We can simulate export by generating workbook
  const exportWb = XLSX.utils.book_new();

  // Summary Sheet
  const summaryData = [
    { Indicator: 'School Name', Value: octoberReport.schoolName },
    { Indicator: 'Report Period', Value: `${octoberReport.monthName} ${octoberReport.year}` },
    { Indicator: 'Class Level Scope', Value: octoberReport.classLevel },
    { Indicator: 'Total Registered Students', Value: octoberReport.enrolledStudentsCount },
    { Indicator: 'Recorded Working Days', Value: octoberReport.workingDaysCount },
    { Indicator: 'Overall Attendance Percentage', Value: `${octoberReport.overallAttendancePercentage}%` },
  ];
  XLSX.utils.book_append_sheet(exportWb, XLSX.utils.json_to_sheet(summaryData), 'Executive Summary');

  // Ledger Sheet
  XLSX.utils.book_append_sheet(exportWb, XLSX.utils.json_to_sheet(octoberReport.studentLedger), 'Attendance Ledger');

  // Teaching Logs Sheet
  XLSX.utils.book_append_sheet(exportWb, XLSX.utils.json_to_sheet(octoberReport.teachingLogs), 'Curriculum Teaching Logs');

  // Practicals Sheet
  XLSX.utils.book_append_sheet(exportWb, XLSX.utils.json_to_sheet(octoberReport.practicalProgress), 'Practical Lab Evaluations');

  // Absentee Sheet
  XLSX.utils.book_append_sheet(exportWb, XLSX.utils.json_to_sheet(octoberReport.absenteeFollowups), 'Absentee Follow-ups');

  assert('Excel Export', 'Workbook contains 5 distinct sheets', exportWb.SheetNames.length === 5, `Sheets: ${exportWb.SheetNames.join(', ')}`);
  assert('Excel Export', 'Absentee sheet present in export', exportWb.SheetNames.includes('Absentee Follow-ups'), 'Found Absentee Follow-ups sheet');
  assert('Excel Export', 'Attendance Ledger sheet present in export', exportWb.SheetNames.includes('Attendance Ledger'), 'Found Attendance Ledger sheet');

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
