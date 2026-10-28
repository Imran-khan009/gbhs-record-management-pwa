import * as XLSX from 'xlsx';
import { getAllStudents, getAllAttendanceRecords } from './db';
import { fetchTeachingLogs, fetchPracticalProgress, fetchAbsenteeFollowups } from './modulesService';
import { Student, AttendanceRecord } from '../types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../types/modules';
import { getSchoolProfile } from './schoolProfileService';
import { compareStudentsByRoll } from './recordService';

export interface StudentMonthlyLedgerRow {
  studentId: string;
  serialNo?: string;
  rollNo: string;
  name: string;
  fatherName: string;
  class: string;
  section: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  attendancePercentage: number;
  status: 'Good (>=80%)' | 'At Risk (75-79%)' | 'Critical (<75%)';
}

export interface MonthlyReportData {
  monthName: string;
  monthIndex: number; // 1-12
  year: number;
  classLevel: string; // 'All' | 'Class 7' | 'Class 8' | 'Class 9'
  schoolName: string;
  district?: string;
  principalName?: string;
  emisCode?: string;
  logoUrl?: string;
  operatorName?: string;
  generatedDate: string;
  
  // High-Level KPIs
  enrolledStudentsCount: number;
  workingDaysCount: number;
  totalAttendanceMarks: number;
  totalPresents: number;
  totalAbsents: number;
  totalLeaves: number;
  overallAttendancePercentage: number;
  
  // Curriculum & Teaching KPIs
  teachingSessionsCount: number;
  totalTeachingHours: number;
  modulesCovered: string[];
  recentTopics: string[];
  
  // Practical Lab KPIs
  practicalsConductedCount: number;
  practicalsCompletedCount: number;
  
  // Outreach KPIs
  followupsCount: number;
  followupsResolvedCount: number;
  lowAttendanceStudentsCount: number; // < 75%

  // Detailed rows
  studentLedger: StudentMonthlyLedgerRow[];
  teachingLogs: TeachingLogEntry[];
  practicalProgress: PracticalProgressEntry[];
  absenteeFollowups: AbsenteeFollowupEntry[];

  // Distinct recorded dates where records actually exist
  recordedAttendanceDates: string[];
  recordedTeachingDates: string[];
  recordedPracticalDates: string[];
  recordedFollowupDates: string[];
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export interface MonthlyReportQueryOptions {
  year: number;
  monthIndex: number; // 1 to 12
  classLevel?: string;
}

/**
 * Aggregates all records for a specific month, year, and class level.
 * Supports either an options object or positional parameters: (year, monthIndex, classLevel).
 */
export async function generateMonthlyReportData(
  yearOrOptions: number | MonthlyReportQueryOptions,
  monthIndex?: number, // 1 to 12
  classLevel: string = 'All'
): Promise<MonthlyReportData> {
  let year: number;
  let targetMonth: number;
  let targetClass = classLevel;

  if (typeof yearOrOptions === 'object') {
    year = yearOrOptions.year;
    targetMonth = yearOrOptions.monthIndex;
    targetClass = yearOrOptions.classLevel || 'All';
  } else {
    year = yearOrOptions;
    targetMonth = monthIndex || 1;
    targetClass = classLevel || 'All';
  }

  const [allStudents, allAttendance, allLogs, allPracticals, allFollowups] = await Promise.all([
    getAllStudents(),
    getAllAttendanceRecords(),
    fetchTeachingLogs('All'),
    fetchPracticalProgress('All'),
    fetchAbsenteeFollowups('All'),
  ]);

  // Filter students by class
  const filteredStudents = allStudents.filter((s) => {
    if (targetClass !== 'All' && s.class !== targetClass) return false;
    return true;
  });

  // Zero-padded month string e.g. "2026-10"
  const monthPrefix = `${year}-${String(targetMonth).padStart(2, '0')}`;

  // Filter records within that month
  const monthAttendance = allAttendance.filter((a) => {
    if (!a.date.startsWith(monthPrefix)) return false;
    if (targetClass !== 'All' && a.class !== targetClass) return false;
    return true;
  });

  const monthTeachingLogs = allLogs.filter((l) => {
    if (!l.date.startsWith(monthPrefix)) return false;
    if (targetClass !== 'All' && l.class !== targetClass) return false;
    return true;
  });

  const monthPracticals = allPracticals.filter((p) => {
    if (!p.assessmentDate.startsWith(monthPrefix)) return false;
    if (targetClass !== 'All' && p.class !== targetClass) return false;
    return true;
  });

  const monthFollowups = allFollowups.filter((f) => {
    if (!f.date.startsWith(monthPrefix)) return false;
    if (targetClass !== 'All' && f.class !== targetClass) return false;
    return true;
  });


  // Calculate distinct working days in this month
  const workingDaysSet = new Set<string>();
  for (const a of monthAttendance) {
    workingDaysSet.add(a.date);
  }
  const workingDaysCount = workingDaysSet.size;

  // Group attendance by student
  const studentAttMap = new Map<string, AttendanceRecord[]>();
  for (const a of monthAttendance) {
    const list = studentAttMap.get(a.studentId) || [];
    list.push(a);
    studentAttMap.set(a.studentId, list);
  }

  let totalPresents = 0;
  let totalAbsents = 0;
  let totalLeaves = 0;
  let lowAttendanceStudentsCount = 0;

  const studentLedger: StudentMonthlyLedgerRow[] = filteredStudents.map((s) => {
    const records = studentAttMap.get(s.id) || [];
    let presents = 0;
    let absents = 0;
    let leaves = 0;

    for (const r of records) {
      if (r.status === 'Present') presents++;
      else if (r.status === 'Absent') absents++;
      else if (r.status === 'Leave' || r.status === 'Late') leaves++;
    }

    totalPresents += presents;
    totalAbsents += absents;
    totalLeaves += leaves;

    const daysCount = records.length;
    const pct = daysCount > 0 ? Math.round((presents / daysCount) * 100) : 100;

    let status: 'Good (>=80%)' | 'At Risk (75-79%)' | 'Critical (<75%)' = 'Good (>=80%)';
    if (daysCount >= 3 && pct < 75) {
      status = 'Critical (<75%)';
      lowAttendanceStudentsCount++;
    } else if (daysCount >= 3 && pct < 80) {
      status = 'At Risk (75-79%)';
    }

    return {
      studentId: s.id,
      serialNo: s.serialNo,
      rollNo: s.rollNo,
      name: s.name,
      fatherName: s.fatherName,
      class: s.class,
      section: s.section,
      totalDays: daysCount,
      presentDays: presents,
      absentDays: absents,
      leaveDays: leaves,
      attendancePercentage: pct,
      status,
    };
  });

  // Sort ledger by class, then rollNo (numeric roll numbers first, then blank/non-numeric by name)
  studentLedger.sort(compareStudentsByRoll);

  const totalAttendanceMarks = totalPresents + totalAbsents + totalLeaves;
  const overallAttendancePercentage =
    totalAttendanceMarks > 0 ? Math.round((totalPresents / totalAttendanceMarks) * 100) : 0;

  // Teaching metrics
  const modulesCovered = Array.from(new Set(monthTeachingLogs.map((l) => l.subjectTopic))).filter(Boolean);
  const totalTeachingHours = monthTeachingLogs.length; // Each session logged corresponds to a scheduled class period
  const recentTopics = monthTeachingLogs.map((l) => l.subjectTopic).slice(0, 10);

  // Practical metrics
  const practicalsCompletedCount = monthPracticals.filter((p) => p.practicalCompleted === 'Yes').length;
  const followupsResolvedCount = monthFollowups.filter((f) => f.currentStatus === 'Resolved / Returned').length;
  const profile = getSchoolProfile();

  return {
    monthName: MONTH_NAMES[targetMonth - 1] || 'Unknown',
    monthIndex: targetMonth,
    year,
    classLevel: targetClass,
    schoolName: profile.schoolName,
    district: profile.district,
    principalName: profile.principalName,
    emisCode: profile.emisCode,
    logoUrl: profile.logoUrl,
    operatorName: profile.updatedBy || 'Authorized Operator',
    generatedDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    enrolledStudentsCount: filteredStudents.length,
    workingDaysCount,
    totalAttendanceMarks,
    totalPresents,
    totalAbsents,
    totalLeaves,
    overallAttendancePercentage,
    teachingSessionsCount: monthTeachingLogs.length,
    totalTeachingHours,
    modulesCovered,
    recentTopics,
    practicalsConductedCount: monthPracticals.length,
    practicalsCompletedCount,
    followupsCount: monthFollowups.length,
    followupsResolvedCount,
    lowAttendanceStudentsCount,
    studentLedger,
    teachingLogs: monthTeachingLogs,
    practicalProgress: monthPracticals,
    absenteeFollowups: monthFollowups,
    recordedAttendanceDates: Array.from(new Set(monthAttendance.map((a) => a.date))).sort(),
    recordedTeachingDates: Array.from(new Set(monthTeachingLogs.map((l) => l.date))).sort(),
    recordedPracticalDates: Array.from(new Set(monthPracticals.map((p) => p.assessmentDate))).sort(),
    recordedFollowupDates: Array.from(new Set(monthFollowups.map((f) => f.date))).sort(),
  };
}

/**
 * Export Comprehensive Monthly Summary Workbook (.xlsx)
 */
export function exportMonthlyReportToExcel(report: MonthlyReportData): void {
  const wb = XLSX.utils.book_new();
  const profile = getSchoolProfile();
  const displaySchoolName = (report.schoolName || profile.schoolName).toUpperCase();
  const displayDistrict = report.district || profile.district;
  const displayPrincipal = report.principalName || profile.principalName;

  // 1. Overview Sheet
  const summaryRows = [
    [displaySchoolName, ''],
    ['MONTHLY ADMINISTRATIVE & PERFORMANCE SUMMARY REPORT', ''],
    ['District / Division:', displayDistrict],
    ['Principal / Headmaster:', displayPrincipal],
    ['Scope / Class Level:', report.classLevel === 'All' ? `All Classes (${profile.classes && profile.classes.length > 0 ? profile.classes.join(', ') : 'All Grades'})` : report.classLevel],
    ['Report Month & Year:', `${report.monthName} ${report.year}`],
    ['Generated Date:', report.generatedDate],
    ['Authorized Operator:', report.operatorName || profile.updatedBy || 'Authorized Operator'],
    ['', ''],
    ['--- KEY PERFORMANCE INDICATORS ---', ''],
    ['Total Enrolled Students:', report.enrolledStudentsCount],
    ['Total School Days Recorded:', report.workingDaysCount],
    ['Total Attendance Markings:', report.totalAttendanceMarks],
    ['Total Presents Logged:', report.totalPresents],
    ['Total Absents Logged:', report.totalAbsents],
    ['Total Leaves / Late:', report.totalLeaves],
    ['Monthly Attendance Percentage:', `${report.overallAttendancePercentage}%`],
    ['At-Risk / Low Attendance Students (<75%):', report.lowAttendanceStudentsCount],
    ['', ''],
    ['--- CURRICULUM & VOCATIONAL LAB PROGRESS ---', ''],
    ['Curriculum Lectures Conducted:', report.teachingSessionsCount],
    ['Total Teaching Hours:', `${report.totalTeachingHours} Hours`],
    ['Curriculum Modules Active:', report.modulesCovered.join(', ') || 'General IT'],
    ['Practical Lab Tasks Evaluated:', report.practicalsConductedCount],
    ['Practical Tasks Completed:', report.practicalsCompletedCount],
    ['Absentee Outreach Cases:', report.followupsCount],
    ['Absentee Cases Resolved / Returned:', report.followupsResolvedCount],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 38 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // 2. Student Attendance Ledger Sheet
  const ledgerData = report.studentLedger.map((row) => ({
    'Roll Num': row.rollNo,
    'Student Name': row.name,
    "Father's Name": row.fatherName,
    Class: row.class,
    Section: row.section,
    'Days Recorded': row.totalDays,
    Presents: row.presentDays,
    Absents: row.absentDays,
    'Leaves / Late': row.leaveDays,
    'Attendance %': `${row.attendancePercentage}%`,
    'Attendance Status': row.status,
  }));

  const wsLedger = XLSX.utils.json_to_sheet(ledgerData);
  wsLedger['!cols'] = [
    { wch: 10 },
    { wch: 24 },
    { wch: 22 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Attendance Ledger');

  // 3. Teaching Curriculum Sheet
  if (report.teachingLogs.length > 0) {
    const teachingData = report.teachingLogs.map((l) => ({
      Date: l.date,
      Day: l.day,
      Class: l.class,
      'Subject / Topic': l.subjectTopic,
      'Learning Objectives': l.learningObjectives,
      'Theory Covered': l.theoryCovered,
      'Practical Activity': l.practicalActivity,
      'Students Present': l.studentsPresent,
      'Completed Task': l.studentsCompletingTask,
      'Teaching Method': l.teachingMethod,
      Instructor: l.instructorName,
    }));
    const wsTeaching = XLSX.utils.json_to_sheet(teachingData);
    wsTeaching['!cols'] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 28 },
      { wch: 32 },
      { wch: 32 },
      { wch: 32 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsTeaching, 'Teaching Logs');
  }

  // 4. Practical Labs Sheet
  if (report.practicalProgress.length > 0) {
    const practicalData = report.practicalProgress.map((p) => ({
      Date: p.assessmentDate,
      Class: p.class,
      'Roll / Reg ID': p.registrationId,
      'Student Name': p.studentName,
      'Skill / Task': p.skillTask,
      'Attempt #': p.attemptNumber,
      'Practical Completed': p.practicalCompleted,
      'Skill Status': p.skillStatus,
      Score: p.scoreMarks != null ? `${p.scoreMarks}/100` : 'N/A',
      'Weak Area': p.weakArea || 'None',
      'Remedial Practice': p.remedialPracticeRequired,
    }));
    const wsPract = XLSX.utils.json_to_sheet(practicalData);
    wsPract['!cols'] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 24 },
      { wch: 28 },
      { wch: 10 },
      { wch: 18 },
      { wch: 16 },
      { wch: 12 },
      { wch: 20 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, wsPract, 'Practical Labs');
  }

  // 5. Absentee Outreach & Follow-ups Sheet
  if (report.absenteeFollowups.length > 0) {
    const followupData = report.absenteeFollowups.map((f) => ({
      Date: f.date,
      Class: f.class,
      'Roll / Reg ID': f.registrationId,
      'Student Name': f.studentName,
      'Absences': f.absenceCount,
      'Reason': f.followupReason,
      'Action Taken': f.actionTaken,
      'Contact Person': f.contactPerson,
      'Response Received': f.responseReceived,
      'Expected Return': f.expectedReturnDate || 'N/A',
      'Current Status': f.currentStatus,
      'Principal Referral': f.managementReferral,
      'Remarks': f.remarks || '',
    }));
    const wsFollowup = XLSX.utils.json_to_sheet(followupData);
    wsFollowup['!cols'] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 22 },
      { wch: 10 },
      { wch: 20 },
      { wch: 22 },
      { wch: 16 },
      { wch: 30 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, wsFollowup, 'Absentee Follow-ups');
  }

  // Generate File Name
  const classTag = report.classLevel === 'All' ? 'All-Classes' : report.classLevel.replace(/\s+/g, '-');
  const filePrefix = (profile.schoolShortName && profile.schoolShortName !== 'GBHS Jam Yousuf Colony')
    ? profile.schoolShortName.replace(/[^a-zA-Z0-9]/g, '_')
    : 'GBHS';
  const filename = `${filePrefix}_Monthly_Report_${report.monthName}_${report.year}_${classTag}.xlsx`;

  XLSX.writeFile(wb, filename);
}
