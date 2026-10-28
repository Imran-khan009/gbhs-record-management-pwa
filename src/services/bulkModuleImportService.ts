import * as XLSX from 'xlsx';
import { ClassLevel, Student, AttendanceRecord, AttendanceStatus } from '../types/student';
import {
  TeachingLogEntry,
  PracticalProgressEntry,
  AbsenteeFollowupEntry,
  SkillStatus,
  PracticalCompletedStatus,
  FollowupStatus,
} from '../types/modules';
import {
  getAllStudents,
  getAllAttendanceRecords,
  bulkSaveAttendanceLocally,
  saveTeachingLogLocally,
  getAllTeachingLogs,
  savePracticalProgressLocally,
  getAllPracticalProgress,
  saveAbsenteeFollowupLocally,
  getAllAbsenteeFollowups,
  enqueueOutboxOperation,
} from './db';
import { OutboxOperation } from '../types/sync';
import { syncEngine } from './syncEngine';
import { getWorkspacePermissions } from './permissionService';
import { getSchoolProfile } from './schoolProfileService';
import {
  BulkOperationsService,
  AttendanceStatusContext,
  AttendanceStatusResult,
  MatrixUnrollResult,
  MatrixCalendarConflict,
} from './bulkOperationsService';
import { normalizeClass } from './classNormalizationService';

export { BulkOperationsService };
export type { AttendanceStatusContext, AttendanceStatusResult, MatrixUnrollResult, MatrixCalendarConflict };

export type ModuleType = 'attendance' | 'teaching_log' | 'practical' | 'absentee';

export interface ModuleImportRowValidation {
  rowIndex: number;
  data: Record<string, any>;
  status: 'valid' | 'duplicate' | 'unmatched' | 'invalid';
  isDuplicate: boolean;
  errors: string[];
  warnings: string[];
  matchedStudent?: Student;
  resolvedEntityId?: string;
  duplicateAction: 'skip' | 'update';
}

export interface ModuleImportParseResult {
  moduleType: ModuleType;
  fileName: string;
  sheetName: string;
  allSheets: string[];
  totalRows: number;
  validRows: ModuleImportRowValidation[];
  validCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  invalidCount: number;
  isMatrix?: boolean;
  matrixDateColumnCount?: number;
  calendarConflict?: MatrixCalendarConflict;
}

export interface ModuleCommitResult {
  success: boolean;
  moduleType: ModuleType;
  totalProcessed: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  unmatchedCount: number;
  invalidCount: number;
  failedCount: number;
  errors: string[];
}

// -------------------------------------------------------------
// HELPER NORMALIZERS
// -------------------------------------------------------------

function cleanString(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function normalizeHeaderKey(key: string): string {
  return cleanString(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function parseFlexibleDate(val: any): string | null {
  return BulkOperationsService.parseExcelDate(val);
}

export function normalizeClassLevel(val: any, availableClasses?: string[]): ClassLevel | null {
  return normalizeClass(val, availableClasses);
}

export function parseAttendanceStatusWithDetails(
  val: any,
  context?: AttendanceStatusContext | string
): AttendanceStatusResult {
  return BulkOperationsService.parseAttendanceStatusWithDetails(val, context);
}

export function normalizeAttendanceStatus(
  val: any,
  context?: AttendanceStatusContext | string
): AttendanceStatus | null {
  return BulkOperationsService.normalizeAttendanceStatus(val, context);
}

export function normalizeSkillStatus(val: any): SkillStatus {
  const s = cleanString(val).toLowerCase();
  if (s.includes('proficient') || s === 'expert') return 'Proficient';
  if (s.includes('competent') || s === 'pass' || s === 'good') return 'Competent';
  if (s.includes('improve') || s.includes('remedial') || s.includes('need') || s === 'poor') return 'Needs Improvement';
  return 'Not Started';
}

export function normalizePracticalCompleted(val: any): PracticalCompletedStatus {
  const s = cleanString(val).toLowerCase();
  if (s === 'yes' || s === 'y' || s === 'completed' || s === 'done') return 'Yes';
  if (s.includes('progress') || s.includes('need') || s.includes('practice')) return 'In Progress';
  return 'No';
}

export function normalizeFollowupStatus(val: any): FollowupStatus {
  const s = cleanString(val).toLowerCase();
  if (s.includes('resolve') || s.includes('return')) return 'Resolved / Returned';
  if (s.includes('escalat') || s.includes('principal') || s.includes('management')) return 'Escalated';
  if (s.includes('prolong') || s.includes('long') || s.includes('drop')) return 'Prolonged Leave';
  return 'Pending Return';
}

// -------------------------------------------------------------
// TEMPLATE DOWNLOAD GENERATORS (A. DOWNLOADABLE TEMPLATES)
// -------------------------------------------------------------

export function generateModuleTemplateWorkbook(
  moduleType: ModuleType,
  options?: { classLevel?: string; date?: string; students?: Student[] }
): XLSX.WorkBook {
  const profile = getSchoolProfile();
  const wb = XLSX.utils.book_new();
  const classFilter = options?.classLevel && !options.classLevel.toLowerCase().startsWith('all')
    ? options.classLevel
    : null;
  const targetStudents = (options?.students || []).filter((s) => !classFilter || s.class === classFilter);

  if (moduleType === 'attendance') {
    const targetDate = options?.date || new Date().toISOString().split('T')[0];
    const data = targetStudents.length > 0
      ? targetStudents.map((s) => ({
          'Date (YYYY-MM-DD)*': targetDate,
          'Class (Class 7/8/9)*': s.class,
          'Section': s.section || 'A',
          'Roll Number*': s.rollNo,
          'Admission Number': s.admissionNo || '',
          'Student Name': s.name,
          'Status (Present/Absent/Leave/Late)*': 'Present',
          'Remarks': '',
        }))
      : [
          {
            'Date (YYYY-MM-DD)*': targetDate,
            'Class (Class 7/8/9)*': classFilter || 'Class 7',
            'Section': 'A',
            'Roll Number*': '1',
            'Admission Number': 'ADM-701',
            'Student Name': 'Muhammad Ali',
            'Status (Present/Absent/Leave/Late)*': 'Present',
            'Remarks': '[EXAMPLE ROW - EDIT OR REPLACE WITH YOUR ROSTER]',
          },
          {
            'Date (YYYY-MM-DD)*': targetDate,
            'Class (Class 7/8/9)*': classFilter || 'Class 7',
            'Section': 'A',
            'Roll Number*': '2',
            'Admission Number': 'ADM-702',
            'Student Name': 'Zayan Ahmed',
            'Status (Present/Absent/Leave/Late)*': 'Absent',
            'Remarks': 'Informed - fever',
          },
          {
            'Date (YYYY-MM-DD)*': targetDate,
            'Class (Class 7/8/9)*': classFilter || 'Class 8',
            'Section': 'A',
            'Roll Number*': '1',
            'Admission Number': 'ADM-801',
            'Student Name': 'Hamza Khan',
            'Status (Present/Absent/Leave/Late)*': 'Present',
            'Remarks': '',
          },
        ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 18 },
      { wch: 10 },
      { wch: 15 },
      { wch: 18 },
      { wch: 22 },
      { wch: 28 },
      { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Attendance');
  } else if (moduleType === 'teaching_log') {
    const data = [
      {
        'Date (YYYY-MM-DD)*': '2026-10-22',
        'Class (Class 7/8/9)*': 'Class 7',
        'Day': 'Thursday',
        'Subject / Topic*': 'Introduction to MS Word Ribbon & File Operations',
        'Learning Objectives': 'Understand document creation, formatting toolbar, and saving files',
        'Theory Covered': 'Overview of GUI, title bar, quick access toolbar, status bar',
        'Practical Activity': 'Type a 100-word paragraph and apply bold, italics, font sizing',
        'Students Present': 28,
        'Students Completing Task': 25,
        'Students Needing Help': 3,
        'Teaching Method': 'Demonstration & Hands-on Lab',
        'Issues / Challenges': 'Power fluctuated briefly during period 3',
        'Next Lesson Plan': 'Table formatting and bulleted lists in MS Word',
        'Instructor Name': profile.principalName || 'Lead Instructor',
        'Remarks': '[EXAMPLE ROW - EDIT OR REPLACE WITH YOUR LOGS]',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 35 },
      { wch: 40 },
      { wch: 35 },
      { wch: 35 },
      { wch: 16 },
      { wch: 22 },
      { wch: 20 },
      { wch: 25 },
      { wch: 28 },
      { wch: 28 },
      { wch: 20 },
      { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Teaching Log');
  } else if (moduleType === 'practical') {
    const data = [
      {
        'Assessment Date (YYYY-MM-DD)*': '2026-10-22',
        'Class (Class 7/8/9)*': 'Class 8',
        'Roll Number*': '1',
        'Admission Number': 'ADM-801',
        'Student Name': 'Hamza Khan',
        'Practical Task / Skill*': 'Typing Speed 30 WPM with 95% Accuracy',
        'Attempt Number': 1,
        'Practical Completed (Yes/No/In Progress)*': 'Yes',
        'Skill Status (Proficient/Competent/Needs Improvement/Not Started)*': 'Proficient',
        'Score (0-100)': 88,
        'Weak Area': 'Number row reach',
        'Remedial Practice Required (Yes/No)': 'No',
        'Remarks': '[EXAMPLE ROW - EDIT OR REPLACE WITH YOUR ROSTER]',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 24 },
      { wch: 18 },
      { wch: 15 },
      { wch: 18 },
      { wch: 22 },
      { wch: 35 },
      { wch: 14 },
      { wch: 32 },
      { wch: 28 },
      { wch: 14 },
      { wch: 20 },
      { wch: 25 },
      { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Practical Tracker');
  } else if (moduleType === 'absentee') {
    const data = [
      {
        'Date of Record (YYYY-MM-DD)*': '2026-10-22',
        'Class (Class 7/8/9)*': 'Class 7',
        'Roll Number*': '2',
        'Admission Number': 'ADM-702',
        'Student Name': 'Zayan Ahmed',
        'Consecutive Absences': 3,
        'Follow-up Reason*': 'Illness / Medical',
        'Action Taken*': 'Phone Call to Guardian',
        'Contact Person': 'Father',
        'Response Received': 'Recovering from fever, will return on Monday',
        'Expected Return Date (YYYY-MM-DD)': '2026-10-26',
        'Current Status (Pending Return/Resolved / Returned/Escalated/Prolonged Leave)*': 'Pending Return',
        'Management Referral (Yes/No)': 'No',
        'Remarks': '[EXAMPLE ROW - EDIT OR REPLACE WITH YOUR ROSTER]',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 22 },
      { wch: 18 },
      { wch: 15 },
      { wch: 18 },
      { wch: 22 },
      { wch: 20 },
      { wch: 24 },
      { wch: 24 },
      { wch: 16 },
      { wch: 35 },
      { wch: 28 },
      { wch: 30 },
      { wch: 25 },
      { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Absentee Follow-up');
  }

  return wb;
}

export function downloadAttendanceTemplate(options?: { classLevel?: string; date?: string; students?: Student[] }): void {
  const profile = getSchoolProfile();
  const schoolName = profile.schoolShortName || profile.schoolName;
  const wb = generateModuleTemplateWorkbook('attendance', options);
  const prefix = schoolName.replace(/[^a-zA-Z0-9]/g, '_');
  const classSuffix = options?.classLevel && !options.classLevel.toLowerCase().startsWith('all')
    ? `_${options.classLevel.replace(/\s+/g, '_')}`
    : '';
  XLSX.writeFile(wb, `${prefix}${classSuffix}_Attendance_Import_Template.xlsx`);
}

export function downloadTeachingLogTemplate(options?: { classLevel?: string; date?: string }): void {
  const profile = getSchoolProfile();
  const schoolName = profile.schoolShortName || profile.schoolName;
  const wb = generateModuleTemplateWorkbook('teaching_log', options);
  const prefix = schoolName.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `${prefix}_Teaching_Log_Template.xlsx`);
}

export function downloadPracticalTrackerTemplate(options?: { classLevel?: string; date?: string; students?: Student[] }): void {
  const profile = getSchoolProfile();
  const schoolName = profile.schoolShortName || profile.schoolName;
  const wb = generateModuleTemplateWorkbook('practical', options);
  const prefix = schoolName.replace(/[^a-zA-Z0-9]/g, '_');
  const classSuffix = options?.classLevel && !options.classLevel.toLowerCase().startsWith('all')
    ? `_${options.classLevel.replace(/\s+/g, '_')}`
    : '';
  XLSX.writeFile(wb, `${prefix}${classSuffix}_Practical_Tracker_Template.xlsx`);
}

export function downloadAbsenteeFollowupTemplate(options?: { classLevel?: string; date?: string; students?: Student[] }): void {
  const profile = getSchoolProfile();
  const schoolName = profile.schoolShortName || profile.schoolName;
  const wb = generateModuleTemplateWorkbook('absentee', options);
  const prefix = schoolName.replace(/[^a-zA-Z0-9]/g, '_');
  const classSuffix = options?.classLevel && !options.classLevel.toLowerCase().startsWith('all')
    ? `_${options.classLevel.replace(/\s+/g, '_')}`
    : '';
  XLSX.writeFile(wb, `${prefix}${classSuffix}_Absentee_Followup_Template.xlsx`);
}

// -------------------------------------------------------------
// STUDENT RESOLUTION (STABLE MATCHING WITHOUT FABRICATING STUDENTS)
// -------------------------------------------------------------

function resolveStudent(
  row: Record<string, any>,
  targetClass: ClassLevel | null,
  allStudents: Student[]
): { student?: Student; unmatchedReason?: string } {
  const rollNo = cleanString(
    row.rollno ||
    row.rollNo ||
    row.rollnumber ||
    row.rollnumber1 ||
    row.rollnum ||
    row.roll ||
    row['roll number'] ||
    row['roll number*'] ||
    row['roll no'] ||
    row['roll no*']
  );
  const admissionNo = cleanString(
    row.admissionno ||
    row.admissionNo ||
    row.admissionnumber ||
    row.admno ||
    row.regno ||
    row.studentid ||
    row['admission number'] ||
    row['admission number*'] ||
    row['admission no'] ||
    row.grno
  );
  const name = cleanString(
    row.studentname ||
    row.name ||
    row.studentName ||
    row.nameoflearner ||
    row['student name'] ||
    row['student name*'] ||
    row['name of learner']
  );

  // 1. Try matching by unique admission number
  if (admissionNo) {
    const match = allStudents.find(
      (s) => cleanString(s.admissionNo).toLowerCase() === admissionNo.toLowerCase()
    );
    if (match) return { student: match };
  }

  // 2. Try matching by Roll Number + Class
  if (rollNo && targetClass) {
    const match = allStudents.find(
      (s) => s.class === targetClass && cleanString(s.rollNo).toLowerCase() === rollNo.toLowerCase()
    );
    if (match) return { student: match };
  }

  // 3. Fallback matching: Name + Class
  if (name && targetClass) {
    const matches = allStudents.filter(
      (s) => s.class === targetClass && s.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (matches.length === 1) {
      return { student: matches[0] };
    }
    if (matches.length > 1) {
      return {
        unmatchedReason: `Multiple students named "${name}" found in ${targetClass}. Provide Roll Number or Admission Number to resolve.`,
      };
    }
  }

  return {
    unmatchedReason: `No existing student found in ${targetClass || 'class'} for Roll No "${rollNo || 'N/A'}", Admission No "${admissionNo || 'N/A'}", Name "${name || 'N/A'}". System will not create placeholder students.`,
  };
}

// -------------------------------------------------------------
// PARSE MODULE IMPORT FILE (EXCEL / CSV)
// -------------------------------------------------------------

export async function parseModuleImportFile(
  file: File,
  moduleType: ModuleType,
  sheetNameOption?: string,
  options?: { targetMonth?: string; targetYear?: number }
): Promise<ModuleImportParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const allSheets = workbook.SheetNames;
  const targetSheetName = sheetNameOption && allSheets.includes(sheetNameOption) ? sheetNameOption : allSheets[0];
  const worksheet = workbook.Sheets[targetSheetName];

  if (!worksheet) {
    throw new Error(`Sheet "${targetSheetName}" not found in workbook.`);
  }

  // Convert sheet to JSON array with header detection
  let rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false,
  });
  let isMatrix = false;
  let matrixDateColumnCount = 0;
  let unrollResult: import('./bulkOperationsService').MatrixUnrollResult | undefined = undefined;

  if (moduleType === 'attendance') {
    unrollResult = BulkOperationsService.unrollAttendanceMatrixIfApplicable(
      worksheet,
      file.name,
      targetSheetName,
      undefined,
      options ? { targetMonth: options.targetMonth, targetYear: options.targetYear } : undefined
    );
    if (unrollResult.isMatrix) {
      isMatrix = true;
      matrixDateColumnCount = unrollResult.dateColumnCount;
      rawRows = unrollResult.rows;
    }
  }

  const profile = getSchoolProfile();
  const availableClasses = profile.classes || ['Class 7', 'Class 8', 'Class 9'];

  // Load existing records for duplicate detection and student resolution
  const [students, existingAttendance, existingLogs, existingPracticals, existingFollowups] = await Promise.all([
    getAllStudents(),
    getAllAttendanceRecords(),
    getAllTeachingLogs(),
    getAllPracticalProgress(),
    getAllAbsenteeFollowups(),
  ]);

  const validatedRows: ModuleImportRowValidation[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let unmatchedCount = 0;
  let invalidCount = 0;

  // Build context-aware metadata for attendance module if applicable
  let attendanceContext: AttendanceStatusContext | undefined = undefined;
  if (moduleType === 'attendance') {
    const detectedTokens = new Set<string>();
    for (const r of rawRows) {
      let rawStatus: any = undefined;
      for (const [k, v] of Object.entries(r)) {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (
          cleanK === 'attendancestatus' ||
          cleanK === 'status' ||
          cleanK === 'attstatus' ||
          cleanK === 'attendance' ||
          cleanK === 'statuspresentabsentleavelate' ||
          cleanK === 'presence' ||
          cleanK === 'hazri'
        ) {
          rawStatus = v;
          break;
        }
      }
      if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== '') {
        detectedTokens.add(String(rawStatus).trim().toLowerCase());
      }
    }

    let legendText = '';
    try {
      if (worksheet && worksheet['!ref']) {
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const maxR = Math.min(range.e.r, 15);
        for (let R = range.s.r; R <= maxR; R++) {
          for (let C = range.s.c; C <= range.e.c; C++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = worksheet[cellAddress];
            if (cell && cell.v) {
              const strVal = String(cell.v);
              if (/grid codes|late|leave|p present|a absent/i.test(strVal)) {
                legendText += ' ' + strVal;
              }
            }
          }
        }
      }
    } catch {
      // Ignore cell inspection errors
    }

    attendanceContext = {
      fileName: file.name,
      sheetName: targetSheetName,
      legendText: legendText.trim(),
      detectedTokens,
      hasHolyDay: unrollResult?.hasHolyDay,
      ...(unrollResult?.hasHolyDay ? { templateFormat: 'holy_day_matrix', lMeaning: 'Leave' } : {}),
    };
  }

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    // Map raw headers to normalized keys
    const row: Record<string, any> = {};
    for (const [key, val] of Object.entries(raw)) {
      const normKey = normalizeHeaderKey(key);
      row[normKey] = val;
      // also preserve original keys
      row[key] = val;
    }

    // Check if example row
    const remarksStr = cleanString(row.remarks || row.note || row.notes || '');
    const nameStr = cleanString(row.studentname || row.nameoflearner || row.name || '');
    if (remarksStr.includes('[EXAMPLE') || remarksStr.includes('DO NOT EDIT') || nameStr.includes('[EXAMPLE')) {
      continue; // Skip template example rows cleanly
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    let isDuplicate = false;
    let status: 'valid' | 'duplicate' | 'unmatched' | 'invalid' = 'valid';
    let matchedStudent: Student | undefined;
    let resolvedEntityId: string | undefined;
    let studentUnmatchedError: string | null = null;

    // Check matrix extraction errors
    if (row._matrixError) {
      errors.push(String(row._matrixError));
    }

    // 1. DATE NORMALIZATION
    const rawDate =
      row.date ||
      row.dateyyyymmdd ||
      row.attendancedate ||
      row.attdate ||
      row.dateofattendance ||
      row.assessmentdate ||
      row.assessmentdateyyyymmdd ||
      row.dateofrecord ||
      row.dateofrecordyyyymmdd ||
      row['date (yyyy-mm-dd)*'] ||
      row['date (yyyy-mm-dd)'] ||
      row['date'] ||
      row['assessment date (yyyy-mm-dd)*'] ||
      row['date of record (yyyy-mm-dd)*'];
    const parsedDate = parseFlexibleDate(rawDate);
    if (!parsedDate) {
      errors.push(`Invalid or missing date: "${rawDate || 'EMPTY'}"`);
    }

    // 2. CLASS NORMALIZATION
    const rawClass =
      row.class ||
      row.classclass789 ||
      row['class (class 7/8/9)*'] ||
      row['class (class 7/8/9)'] ||
      row['class'] ||
      row.grade;
    const parsedClass = normalizeClassLevel(rawClass, availableClasses);
    if (!parsedClass) {
      errors.push(`Invalid or missing class: "${rawClass || 'EMPTY'}". Must be Class 1 to 10.`);
    }

    // 3. MODULE SPECIFIC VALIDATION
    let parsedAttendanceStatus: AttendanceStatus | null = null;
    if (moduleType === 'attendance') {
      const rawStatus =
        row.attendancestatus ||
        row.status ||
        row.statuspresentabsentleavelate ||
        row.attstatus ||
        row['status (present/absent/leave/late)*'] ||
        row['status (present/absent/leave/late)'] ||
        row['attendance status'] ||
        row['status'];
      const statusResult = BulkOperationsService.parseAttendanceStatusWithDetails(rawStatus, attendanceContext);
      if (statusResult.isHoliday) {
        // Non-attendance holiday marker (e.g. H / Holy Day) - skip creating record cleanly
        continue;
      }
      parsedAttendanceStatus = statusResult.status;
      if (!parsedAttendanceStatus) {
        if (statusResult.isAmbiguous) {
          errors.push(statusResult.error || 'Ambiguous attendance code "L". Please clarify whether it represents Late or Leave.');
        } else {
          errors.push(`Invalid attendance status: "${rawStatus || 'EMPTY'}". Must be Present, Absent, Leave, or Late.`);
        }
      }

      // Student Resolution
      const hasStudentId = Boolean(
        cleanString(row.studentname || row.name || row.studentName || row.nameoflearner || row['student name'] || row['student name*'] || row['name of learner']) ||
        cleanString(row.rollno || row.rollNo || row.rollnumber || row.rollnumber1 || row.rollnum || row.roll || row['roll number'] || row['roll number*'] || row['roll no'] || row['roll no*']) ||
        cleanString(row.admissionno || row.admissionNo || row.admissionnumber || row.admno || row.regno || row.studentid || row['admission number'] || row['admission number*'] || row['admission no'] || row.grno)
      );
      if (!hasStudentId) {
        errors.push('Student identification (Name, Roll No, or Admission No) is required.');
      } else {
        const resolution = resolveStudent(row, parsedClass, students);
        if (!resolution.student) {
          status = 'unmatched';
          studentUnmatchedError = resolution.unmatchedReason || 'Student not found in local registry.';
          errors.push(studentUnmatchedError);
        } else {
          matchedStudent = resolution.student;
          resolvedEntityId = `${matchedStudent.id}_${parsedDate}`;

          // Duplicate Check
          const existingRec = existingAttendance.find((a) => a.id === resolvedEntityId);
          if (existingRec) {
            isDuplicate = true;
            status = 'duplicate';
            warnings.push(`Attendance record already exists for ${matchedStudent.name} on ${parsedDate} (Current: ${existingRec.status}).`);
          }
        }
      }
    } else if (moduleType === 'teaching_log') {
      const subjectTopic = cleanString(row.subjecttopic || row['subject / topic*'] || row.topic || row.subject);
      if (!subjectTopic || subjectTopic.length < 3) {
        errors.push('Subject / Topic is required (at least 3 characters).');
      }

      // Duplicate Check: same date, class, and topic
      const existing = existingLogs.find(
        (l) => l.date === parsedDate && l.class === parsedClass && l.subjectTopic.toLowerCase().trim() === subjectTopic.toLowerCase()
      );
      if (existing) {
        isDuplicate = true;
        status = 'duplicate';
        resolvedEntityId = existing.id;
        warnings.push(`Teaching log already exists for ${parsedClass} on ${parsedDate} with matching topic.`);
      }
    } else if (moduleType === 'practical') {
      const skillTask = cleanString(row.practicaltaskskill || row['practical task / skill*'] || row.skilltask || row.task);
      if (!skillTask || skillTask.length < 3) {
        errors.push('Practical Task / Skill is required.');
      }

      // Student Resolution
      const hasStudentId = Boolean(
        cleanString(row.studentname || row.name || row.studentName || row.nameoflearner || row['student name'] || row['student name*'] || row['name of learner']) ||
        cleanString(row.rollno || row.rollNo || row.rollnumber || row.rollnumber1 || row.rollnum || row.roll || row['roll number'] || row['roll number*'] || row['roll no'] || row['roll no*']) ||
        cleanString(row.admissionno || row.admissionNo || row.admissionnumber || row.admno || row.regno || row.studentid || row['admission number'] || row['admission number*'] || row['admission no'] || row.grno)
      );
      if (!hasStudentId) {
        errors.push('Student identification (Name, Roll No, or Admission No) is required.');
      } else {
        const resolution = resolveStudent(row, parsedClass, students);
        if (!resolution.student) {
          status = 'unmatched';
          studentUnmatchedError = resolution.unmatchedReason || 'Student not found in local registry.';
          errors.push(studentUnmatchedError);
        } else {
          matchedStudent = resolution.student;

          // Duplicate Check: same student, same date, same task
          const existing = existingPracticals.find(
            (p) =>
              p.assessmentDate === parsedDate &&
              (p.studentId === matchedStudent?.id || p.registrationId === matchedStudent?.rollNo) &&
              p.skillTask.toLowerCase().trim() === skillTask.toLowerCase()
          );
          if (existing) {
            isDuplicate = true;
            status = 'duplicate';
            resolvedEntityId = existing.id;
            warnings.push(`Practical progress already logged for ${matchedStudent.name} on ${parsedDate} for this skill.`);
          }
        }
      }
    } else if (moduleType === 'absentee') {
      const followupReason = cleanString(row.followupreason || row['follow-up reason*'] || row.reason);
      const actionTaken = cleanString(row.actiontaken || row['action taken*'] || row.action);

      if (!followupReason) errors.push('Follow-up Reason is required.');
      if (!actionTaken) errors.push('Action Taken is required.');

      // Student Resolution
      const hasStudentId = Boolean(
        cleanString(row.studentname || row.name || row.studentName || row.nameoflearner || row['student name'] || row['student name*'] || row['name of learner']) ||
        cleanString(row.rollno || row.rollNo || row.rollnumber || row.rollnumber1 || row.rollnum || row.roll || row['roll number'] || row['roll number*'] || row['roll no'] || row['roll no*']) ||
        cleanString(row.admissionno || row.admissionNo || row.admissionnumber || row.admno || row.regno || row.studentid || row['admission number'] || row['admission number*'] || row['admission no'] || row.grno)
      );
      if (!hasStudentId) {
        errors.push('Student identification (Name, Roll No, or Admission No) is required.');
      } else {
        const resolution = resolveStudent(row, parsedClass, students);
        if (!resolution.student) {
          status = 'unmatched';
          studentUnmatchedError = resolution.unmatchedReason || 'Student not found in local registry.';
          errors.push(studentUnmatchedError);
        } else {
          matchedStudent = resolution.student;

          // Duplicate Check: same student, same date
          const existing = existingFollowups.find(
            (f) =>
              f.date === parsedDate &&
              (f.studentId === matchedStudent?.id || f.registrationId === matchedStudent?.rollNo)
          );
          if (existing) {
            isDuplicate = true;
            status = 'duplicate';
            resolvedEntityId = existing.id;
            warnings.push(`Follow-up already logged for ${matchedStudent.name} on ${parsedDate}.`);
          }
        }
      }
    }

    const hasStructuralOrDataErrors = studentUnmatchedError
      ? errors.some((e) => e !== studentUnmatchedError)
      : errors.length > 0;

    if (hasStructuralOrDataErrors) {
      status = 'invalid';
      invalidCount++;
    } else if (studentUnmatchedError) {
      status = 'unmatched';
      unmatchedCount++;
    } else if (isDuplicate) {
      status = 'duplicate';
      duplicateCount++;
    } else {
      status = 'valid';
      validCount++;
    }

    validatedRows.push({
      rowIndex: i + 2, // 1-based index including header
      data: {
        ...raw,
        ...row,
        parsedDate,
        parsedClass,
        parsedStatus: parsedAttendanceStatus,
        attendanceContext,
      },
      status,
      isDuplicate,
      errors,
      warnings,
      matchedStudent,
      resolvedEntityId,
      duplicateAction: 'skip',
    });
  }

  return {
    moduleType,
    fileName: file.name,
    sheetName: targetSheetName,
    allSheets,
    totalRows: rawRows.length,
    validRows: validatedRows,
    validCount,
    duplicateCount,
    unmatchedCount,
    invalidCount,
    isMatrix,
    matrixDateColumnCount,
    calendarConflict: unrollResult?.calendarConflict,
  };
}

// -------------------------------------------------------------
// COMMIT MODULE IMPORT ROWS (LOCAL FIRST + OUTBOX + SYNC)
// -------------------------------------------------------------

export async function commitModuleImportRows(
  moduleType: ModuleType,
  rowsToCommit: ModuleImportRowValidation[],
  duplicateStrategy: 'skip' | 'update' = 'skip',
  userEmail: string = 'operator@gbhs.edu.pk'
): Promise<ModuleCommitResult> {
  const session = syncEngine.getSession();
  if (session?.user) {
    const permissions = getWorkspacePermissions(session.user);
    if (permissions.isReadOnly) {
      throw new Error('Permission denied: Read-only team members cannot bulk-import records.');
    }
  }

  const profile = getSchoolProfile();
  const schoolId = profile.emisCode || 'GBHS-MAIN';
  const now = new Date().toISOString();

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let unmatchedCount = 0;
  let invalidCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  const existingAttendance = moduleType === 'attendance' ? await getAllAttendanceRecords() : [];
  const attendanceBatch: AttendanceRecord[] = [];

  for (const rowVal of rowsToCommit) {
    if (rowVal.status === 'invalid') {
      invalidCount++;
      continue;
    }
    if (rowVal.status === 'unmatched') {
      unmatchedCount++;
      continue;
    }
    if (rowVal.isDuplicate && duplicateStrategy === 'skip') {
      skippedCount++;
      continue;
    }

    const { data, matchedStudent, resolvedEntityId, isDuplicate } = rowVal;
    const date = data.parsedDate;
    const cls = data.parsedClass;

    try {
      if (moduleType === 'attendance' && matchedStudent) {
        const targetId = resolvedEntityId || `${matchedStudent.id}_${date}`;
        const existingRec = isDuplicate
          ? existingAttendance.find((a) => a.id === targetId || (a.studentId === matchedStudent.id && a.date === date))
          : undefined;

        const candidateStatuses = [
          data['Status (Present/Absent/Leave/Late)*'],
          data['Status'],
          data['Attendance Status'],
          data['attendance status'],
          data['attendance status*'],
          data['status (present/absent/leave/late)*'],
          data['status (present/absent/leave/late)'],
          data['att status'],
          data.attendancestatus,
          data.status,
          data.attstatus,
          data.attendance,
          data.statuspresentabsentleavelate,
        ];

        // When updating a duplicate, prioritize any candidate status that differs from existing record
        const changedStatus = isDuplicate && existingRec?.status
          ? candidateStatuses.find((s) => {
              if (!s) return false;
              const norm = BulkOperationsService.normalizeAttendanceStatus(s, data.attendanceContext);
              return norm && norm !== existingRec.status;
            })
          : undefined;

        const rawStatus = changedStatus || candidateStatuses.find((s) => Boolean(s));

        const normalizedFromRaw = rawStatus
          ? BulkOperationsService.normalizeAttendanceStatus(rawStatus, data.attendanceContext)
          : null;

        const status = normalizedFromRaw || data.parsedStatus || 'Present';

        const candidateRemarks = [
          data.Remarks,
          data.remarks,
          data.note,
          data.Note,
          data.notes,
          data.Notes,
          data.comment,
          data.Comment,
        ];

        // When updating a duplicate, prioritize any candidate remarks that differ from existing record
        const changedRemark = isDuplicate && existingRec?.remarks
          ? candidateRemarks.find((r) => r !== undefined && r !== null && cleanString(r) !== '' && cleanString(r) !== cleanString(existingRec.remarks))
          : undefined;

        const rawRemarks = changedRemark !== undefined
          ? cleanString(changedRemark)
          : cleanString(candidateRemarks.find((r) => r !== undefined && r !== null && cleanString(r) !== '') || '');

        const recId = existingRec?.id || targetId;
        const studentId = existingRec?.studentId || matchedStudent.id;
        const recordDate = existingRec?.date || date;
        const recOwnerId = existingRec?.owner_id || existingRec?.ownerId || (session?.user as any)?.workspaceOwnerId || session?.user?.id;
        const recVersion = existingRec ? (existingRec.version || 1) + 1 : (isDuplicate ? 2 : 1);
        const remarks = rawRemarks || (isDuplicate ? (existingRec?.remarks || undefined) : undefined);

        const rec: AttendanceRecord = {
          id: recId,
          studentId,
          studentName: matchedStudent.name || existingRec?.studentName || 'Student',
          rollNo: matchedStudent.rollNo || existingRec?.rollNo || '',
          class: cls || existingRec?.class || 'Class 7',
          section: matchedStudent.section || data.section || existingRec?.section || 'A',
          date: recordDate,
          status,
          remarks,
          version: recVersion,
          updatedAt: now,
          schoolId: existingRec?.schoolId || schoolId,
          markedBy: userEmail,
          owner_id: recOwnerId,
          ownerId: recOwnerId,
        };

        attendanceBatch.push(rec);

        const op: OutboxOperation = {
          opId: crypto.randomUUID(),
          entityId: rec.id,
          entityType: 'attendance',
          operationType: isDuplicate ? 'UPDATE' : 'CREATE',
          payload: rec,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: rec.version,
        };
        await enqueueOutboxOperation(op);

        if (isDuplicate) updatedCount++;
        else createdCount++;
      } else if (moduleType === 'teaching_log') {
        const id = (isDuplicate && resolvedEntityId) ? resolvedEntityId : crypto.randomUUID();
        const entry: TeachingLogEntry = {
          id,
          date,
          day: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
          class: cls,
          subjectTopic: cleanString(data.subjecttopic || data['subject / topic*'] || data.topic),
          learningObjectives: cleanString(data.learningobjectives || data['learning objectives']),
          theoryCovered: cleanString(data.theorycovered || data['theory covered']),
          practicalActivity: cleanString(data.practicalactivity || data['practical activity']),
          totalRegistered: Number(data.totalregistered) || 0,
          studentsPresent: Number(data.studentspresent || data['students present']) || 0,
          studentsCompletingTask: Number(data.studentscompletingtask || data['students completing task']) || 0,
          studentsNeedingHelp: Number(data.studentsneedinghelp || data['students needing help']) || 0,
          teachingMethod: cleanString(data.teachingmethod || data['teaching method']) || 'Demonstration & Hands-on Lab',
          issueChallenge: cleanString(data.issuechallenge || data.issueschallenges || data['issues / challenges']),
          nextLesson: cleanString(data.nextlesson || data.nextlessonplan || data['next lesson plan']),
          instructorName: cleanString(data.instructorname || data['instructor name']) || profile.principalName || 'Lead Instructor',
          version: isDuplicate ? 2 : 1,
          createdAt: now,
          updatedAt: now,
        };

        await saveTeachingLogLocally(entry);

        const op: OutboxOperation = {
          opId: crypto.randomUUID(),
          entityId: id,
          entityType: 'teaching_log',
          operationType: isDuplicate ? 'UPDATE' : 'CREATE',
          payload: entry,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: entry.version,
        };
        await enqueueOutboxOperation(op);

        if (isDuplicate) updatedCount++;
        else createdCount++;
      } else if (moduleType === 'practical' && matchedStudent) {
        const id = (isDuplicate && resolvedEntityId) ? resolvedEntityId : crypto.randomUUID();
        const rawScore = data.score0100 || data.score || data['score (0-100)'];
        const scoreMarks = rawScore !== '' && rawScore !== undefined ? Number(rawScore) : undefined;

        const entry: PracticalProgressEntry = {
          id,
          studentId: matchedStudent.id,
          studentName: matchedStudent.name,
          registrationId: matchedStudent.rollNo || matchedStudent.admissionNo || '—',
          class: cls,
          skillTask: cleanString(data.practicaltaskskill || data['practical task / skill*'] || data.skilltask),
          attemptNumber: Number(data.attemptnumber || data['attempt number']) || 1,
          practicalCompleted: normalizePracticalCompleted(data.practicalcompleted || data['practical completed (completed/incomplete/needs practice)*']),
          skillStatus: normalizeSkillStatus(data.skillstatus || data['skill status (proficient/developing/needs remedial)*']),
          scoreMarks: scoreMarks !== undefined && !isNaN(scoreMarks) ? scoreMarks : 0,
          weakArea: cleanString(data.weakarea || data['weak area']),
          remedialPracticeRequired: cleanString(data.remedialpracticerequired || data['remedial practice required (yes/no)']).toLowerCase().startsWith('y') ? 'Yes' : 'No',
          assessmentDate: date,
          version: isDuplicate ? 2 : 1,
          createdAt: now,
          updatedAt: now,
        };

        await savePracticalProgressLocally(entry);

        const op: OutboxOperation = {
          opId: crypto.randomUUID(),
          entityId: id,
          entityType: 'practical_progress',
          operationType: isDuplicate ? 'UPDATE' : 'CREATE',
          payload: entry,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: entry.version,
        };
        await enqueueOutboxOperation(op);

        if (isDuplicate) updatedCount++;
        else createdCount++;
      } else if (moduleType === 'absentee' && matchedStudent) {
        const id = (isDuplicate && resolvedEntityId) ? resolvedEntityId : crypto.randomUUID();
        const entry: AbsenteeFollowupEntry = {
          id,
          studentId: matchedStudent.id,
          studentName: matchedStudent.name,
          registrationId: matchedStudent.rollNo || matchedStudent.admissionNo || '—',
          class: cls,
          date,
          absenceCount: Number(data.consecutiveabsences || data.absencecount) || 3,
          followupReason: cleanString(data.followupreason || data['follow-up reason*'] || data.reason) || 'Uninformed Absence',
          actionTaken: cleanString(data.actiontaken || data['action taken*'] || data.action) || 'Phone Call to Guardian',
          contactPerson: cleanString(data.contactperson || data['contact person']) || 'Father',
          responseReceived: cleanString(data.responsereceived || data['response received']) || 'No direct answer',
          expectedReturnDate: cleanString(data.expectedreturndate || data['expected return date (yyyy-mm-dd)']) || undefined,
          followupDate: date,
          currentStatus: normalizeFollowupStatus(data.currentstatus || data['current status (pending return/resolved / returned/escalated to principal/dropped out)*']),
          managementReferral: cleanString(data.managementreferral || data['management referral (yes/no)']).toLowerCase().startsWith('y') ? 'Yes' : 'No',
          remarks: cleanString(data.remarks || data.note),
          version: isDuplicate ? 2 : 1,
          createdAt: now,
          updatedAt: now,
        };

        await saveAbsenteeFollowupLocally(entry);

        const op: OutboxOperation = {
          opId: crypto.randomUUID(),
          entityId: id,
          entityType: 'absentee_followup',
          operationType: isDuplicate ? 'UPDATE' : 'CREATE',
          payload: entry,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: entry.version,
        };
        await enqueueOutboxOperation(op);

        if (isDuplicate) updatedCount++;
        else createdCount++;
      }
    } catch (rowErr: any) {
      failedCount++;
      errors.push(`Row ${rowVal.rowIndex}: ${rowErr.message || 'Failed to save record.'}`);
    }
  }

  // Batch save attendance in single indexeddb transaction
  if (attendanceBatch.length > 0) {
    await bulkSaveAttendanceLocally(attendanceBatch);
  }

  // Trigger sync queue in background
  syncEngine.processQueue();

  return {
    success: failedCount === 0,
    moduleType,
    totalProcessed: rowsToCommit.length,
    createdCount,
    updatedCount,
    skippedCount,
    unmatchedCount,
    invalidCount,
    failedCount,
    errors,
  };
}
