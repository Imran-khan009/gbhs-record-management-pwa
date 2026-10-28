import { Student, AttendanceRecord } from '../types/student';
import { getSchoolProfile } from './schoolProfileService';

export interface StudentAttendanceAlert {
  studentId: string;
  studentName: string;
  rollNo: string;
  class: string;
  section: string;
  guardianContact?: string;
  phone?: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  attendancePercentage: number;
  consecutiveAbsences: number;
  isLowAttendance: boolean; // < 75%
  isAtRiskAbsence: boolean; // 3+ consecutive absences
  isAtRisk: boolean; // isLowAttendance || isAtRiskAbsence
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
  alertLevel: 'CRITICAL' | 'WARNING' | 'NORMAL'; // alias for severity
  alertBadgeText: string;
  lastAttendanceDate?: string;
}

/**
 * Clean and normalize Pakistani & international phone numbers for WhatsApp API.
 * e.g., '0300-1234567' -> '923001234567'
 *       '+92 300 1234567' -> '923001234567'
 */
export function cleanPhoneNumberForWhatsApp(phone?: string | null): string {
  if (!phone) return '';
  // Extract all digits
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // If local Pakistani format starting with 03 (e.g. 03001234567, 11 digits)
  if (digits.startsWith('03') && digits.length === 11) {
    digits = '92' + digits.substring(1);
  } else if (digits.startsWith('3') && digits.length === 10) {
    digits = '92' + digits;
  }

  return digits;
}

/**
 * Generate official professional WhatsApp link
 */
export function getWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = cleanPhoneNumberForWhatsApp(phone);
  const encodedText = encodeURIComponent(message);
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
}

/**
 * Generate native SMS link
 */
export function getSmsUrl(phone: string, message: string): string {
  const cleanPhone = cleanPhoneNumberForWhatsApp(phone);
  const encodedText = encodeURIComponent(message);
  return cleanPhone ? `sms:${cleanPhone}?body=${encodedText}` : `sms:?body=${encodedText}`;
}

export interface AbsenteeNoticeOptions {
  studentName: string;
  rollNo: string;
  classLevel: string;
  date?: string;
  absenceCount?: number;
  reason?: string;
}

/**
 * Pre-formatted official notification message for guardians.
 * Supports either an options object or positional parameters.
 */
export function generateAbsenteeWhatsAppMessage(
  studentNameOrOptions: string | AbsenteeNoticeOptions,
  rollNo?: string,
  classLevel?: string,
  date?: string,
  absenceCount?: number,
  reason?: string
): string {
  let name = '';
  let roll = '';
  let cls = '';
  let dt = date;
  let count = absenceCount;
  let rsn = reason;

  if (typeof studentNameOrOptions === 'object') {
    name = studentNameOrOptions.studentName;
    roll = studentNameOrOptions.rollNo;
    cls = studentNameOrOptions.classLevel;
    dt = studentNameOrOptions.date;
    count = studentNameOrOptions.absenceCount;
    rsn = studentNameOrOptions.reason;
  } else {
    name = studentNameOrOptions;
    roll = rollNo || '';
    cls = classLevel || '';
  }

  const dateFormatted = dt || new Date().toISOString().split('T')[0];
  const countText = count && count > 1 ? ` for ${count} consecutive days` : '';
  const reasonText = rsn ? `\n• Stated Reason: ${rsn}` : '';

  const profile = getSchoolProfile();

  return `*${profile.schoolName.toUpperCase()}*
*OFFICIAL ABSENTEE NOTIFICATION*

Respected Guardian,
Assalam-o-Alaikum,

This is to formally notify you that your child *${name}* (Roll No: *${roll}*, *${cls}*) was marked *ABSENT* from school${countText} on *${dateFormatted}*.${reasonText}

Regular attendance is mandatory for academic progress and IT Computer training. Please ensure your child attends school tomorrow or contact the school office to submit a formal leave application.

For verification or queries, please contact the Computer Operator / School Office.

_Principal: ${profile.principalName}_
*${profile.schoolShortName}*
_District: ${profile.district}_`;
}

/**
 * Calculate attendance metrics and smart alerts for students.
 * When `asOfDate` is provided (e.g. '2026-04-30'):
 * 1. Attendance percentage is calculated month-to-date within the month of `asOfDate`,
 *    up to and including `asOfDate`. Records from other months are excluded from the denominator.
 * 2. Consecutive absences reflect the active absence streak as of `asOfDate`,
 *    ignoring any records dated after `asOfDate`.
 */
export function calculateStudentAttendanceAlerts(
  students: Student[],
  attendanceRecords: AttendanceRecord[],
  asOfDate?: string
): Map<string, StudentAttendanceAlert> {
  const alertMap = new Map<string, StudentAttendanceAlert>();
  const selectedMonth = asOfDate ? asOfDate.substring(0, 7) : undefined;

  // Group attendance records by studentId
  const recordsByStudent = new Map<string, AttendanceRecord[]>();
  for (const record of attendanceRecords) {
    const list = recordsByStudent.get(record.studentId) || [];
    list.push(record);
    recordsByStudent.set(record.studentId, list);
  }

  for (const student of students) {
    const records = recordsByStudent.get(student.id) || [];
    // Sort ascending by date
    records.sort((a, b) => a.date.localeCompare(b.date));

    // Records up to and including asOfDate
    const recordsUpToAsOf = asOfDate
      ? records.filter((r) => r.date <= asOfDate)
      : records;

    // Month-to-date records strictly within the month of asOfDate (up to and including asOfDate)
    const monthRecords = selectedMonth
      ? recordsUpToAsOf.filter((r) => r.date.startsWith(selectedMonth))
      : recordsUpToAsOf;

    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;

    for (const r of monthRecords) {
      if (r.status === 'Present') presentDays++;
      else if (r.status === 'Absent') absentDays++;
      else if (r.status === 'Leave' || r.status === 'Late') leaveDays++;
    }

    const totalDays = monthRecords.length;
    const attendancePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

    // Calculate active consecutive absences ending at the most recent record on or before asOfDate
    let consecutiveAbsences = 0;
    for (let i = recordsUpToAsOf.length - 1; i >= 0; i--) {
      if (recordsUpToAsOf[i].status === 'Absent') {
        consecutiveAbsences++;
      } else {
        break;
      }
    }

    const isLowAttendance = totalDays >= 3 && attendancePercentage < 75;
    const isAtRiskAbsence = consecutiveAbsences >= 3;
    const isAtRisk = isLowAttendance || isAtRiskAbsence;

    let severity: 'CRITICAL' | 'WARNING' | 'NORMAL' = 'NORMAL';
    let alertBadgeText = '';

    if (isLowAttendance || isAtRiskAbsence) {
      severity = 'CRITICAL';
      if (isLowAttendance && isAtRiskAbsence) {
        alertBadgeText = `Critical: ${attendancePercentage}% (${consecutiveAbsences}d absent)`;
      } else if (isLowAttendance) {
        alertBadgeText = `Low Att: ${attendancePercentage}%`;
      } else {
        alertBadgeText = `${consecutiveAbsences} Cons. Absences`;
      }
    } else if (totalDays >= 3 && attendancePercentage < 80) {
      severity = 'WARNING';
      alertBadgeText = `Warning: ${attendancePercentage}%`;
    }

    alertMap.set(student.id, {
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      class: student.class,
      section: student.section,
      guardianContact: student.guardianContact,
      phone: student.phone,
      totalDays,
      presentDays,
      absentDays,
      leaveDays,
      attendancePercentage,
      consecutiveAbsences,
      isLowAttendance,
      isAtRiskAbsence,
      isAtRisk,
      severity,
      alertLevel: severity,
      alertBadgeText,
      lastAttendanceDate: recordsUpToAsOf.length > 0 ? recordsUpToAsOf[recordsUpToAsOf.length - 1].date : undefined,
    });
  }

  return alertMap;
}

