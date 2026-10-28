import * as XLSX from 'xlsx';
import { ClassLevel, Section, Student, StudentStatus, AttendanceRecord, AttendanceStatus } from '../types/student';
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
  bulkSaveStudentsLocally,
  getAllAttendanceRecords,
  bulkSaveAttendanceLocally,
  getAllTeachingLogs,
  bulkSaveTeachingLogsLocally,
  getAllPracticalProgress,
  bulkSavePracticalProgressLocally,
  getAllAbsenteeFollowups,
  bulkSaveAbsenteeFollowupsLocally,
  enqueueOutboxOperation,
  setAppState,
} from './db';
import { OutboxOperation } from '../types/sync';
import { syncEngine } from './syncEngine';
import { getWorkspacePermissions } from './permissionService';
import { getSchoolProfile, DEFAULT_CLASSES } from './schoolProfileService';
import { normalizeClass as normalizeClassFn } from './classNormalizationService';
import { validateAttendanceEnrollmentDate } from './recordService';

// -------------------------------------------------------------
// TYPES & INTERFACES
// -------------------------------------------------------------

export type BulkModuleType =
  | 'students'
  | 'attendance'
  | 'teaching_logs'
  | 'practical_progress'
  | 'absentee_followups';

export type BulkModuleTypeAlias =
  | BulkModuleType
  | 'student'
  | 'teaching_log'
  | 'teaching'
  | 'practical'
  | 'absentee'
  | 'absentee_followup';

export interface BulkImportRowValidation {
  rowIndex: number;
  data: Record<string, any>;
  status: 'valid' | 'duplicate' | 'unmatched' | 'invalid';
  isValid: boolean;
  isDuplicate: boolean;
  errors: string[];
  warnings: string[];
  validationNotes: string;
  matchedStudent?: Student;
  resolvedEntityId?: string;
  resolvedDate?: string | null;
  duplicateAction: 'skip' | 'update';
  entity?: any;
}

export interface MatrixCalendarConflict {
  hasConflict: boolean;
  conflictType: 'mismatch' | 'ambiguous' | 'weekday_mismatch';
  message: string;
  sources: {
    explicitTargetMonth?: string;
    filenameMonth?: { month: number; name: string };
    cellMonth?: { month: number; name: string };
    weekdayMonth?: { month: number; name: string };
    resolvedYear?: number;
  };
  weekdayDiscrepancies?: {
    day: number;
    sheetLabel: string;
    expectedWeekday: string;
  }[];
}

export interface MatrixUnrollResult {
  isMatrix: boolean;
  rows: Record<string, any>[];
  detectedMonthYear?: { year: number; month: number };
  detectedClass?: string;
  detectedSection?: string;
  dateColumnCount: number;
  unrolledCount: number;
  matrixErrors: string[];
  detectedFormat?: 'holy_day_matrix' | 'standard_matrix' | 'official_matrix';
  hasHolyDay?: boolean;
  calendarConflict?: MatrixCalendarConflict;
}

export interface BulkParseResult {
  moduleType: BulkModuleType;
  fileName: string;
  sheetName: string;
  allSheets: string[];
  totalRows: number;
  validRows: BulkImportRowValidation[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  isMatrix?: boolean;
  matrixDateColumnCount?: number;
  calendarConflict?: MatrixCalendarConflict;
}

export interface BulkCommitResult {
  success: boolean;
  moduleType: BulkModuleType;
  totalProcessed: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  unmatchedCount: number;
  invalidCount: number;
  failedCount: number;
  errors: string[];
}

export interface BulkTemplateOptions {
  classLevel?: string;
  date?: string;
  students?: Student[];
}

export interface AttendanceStatusContext {
  fileName?: string;
  sheetName?: string;
  legendText?: string;
  templateFormat?: 'official' | 'gbhs_attendance' | 'standard' | 'custom' | 'holy_day_matrix' | string;
  lMeaning?: 'Late' | 'Leave';
  detectedTokens?: Set<string> | string[];
  targetMonth?: string; // e.g. '2026-10'
  targetYear?: number;
  hasHolyDay?: boolean;
}

export interface AttendanceStatusResult {
  status: AttendanceStatus | null;
  raw: string;
  normalizedToken: string;
  isValid: boolean;
  isAmbiguous: boolean;
  isHoliday?: boolean;
  error?: string;
  resolvedByContext?: string;
}

export interface BulkParseOptions {
  sheetName?: string;
  defaultClass?: ClassLevel;
  duplicateStrategy?: 'skip' | 'update';
  autoEnrollMissingStudents?: boolean;
  attendanceContext?: AttendanceStatusContext;
  allowHistoricalBackfill?: boolean;
  onProgress?: (processed: number, total: number) => void;
}

export interface BulkCommitOptions {
  duplicateStrategy?: 'skip' | 'update';
  userEmail?: string;
}

// -------------------------------------------------------------
// BULK OPERATIONS SERVICE IMPLEMENTATION
// -------------------------------------------------------------

export class BulkOperationsService {
  /**
   * Normalizes any input module alias to standard BulkModuleType
   */
  public static normalizeModuleType(mod: BulkModuleTypeAlias): BulkModuleType {
    const s = String(mod || '').toLowerCase().trim();
    if (s === 'student' || s === 'students') return 'students';
    if (s === 'attendance') return 'attendance';
    if (s === 'teaching' || s === 'teaching_log' || s === 'teaching_logs') return 'teaching_logs';
    if (s === 'practical' || s === 'practical_progress') return 'practical_progress';
    if (s === 'absentee' || s === 'absentee_followup' || s === 'absentee_followups') return 'absentee_followups';
    return 'students';
  }

  /**
   * Robust historical and spreadsheet date parser.
   * Handles ISO, UK/PK (DD/MM/YYYY), Hyphen (DD-MM-YYYY), Textual ("2 March 2026"),
   * Excel numeric serial numbers (e.g. 46083), and Date objects.
   * NEVER overrides historical dates or defaults to current date!
   */
  public static parseExcelDate(val: any): string | null {
    if (val === null || val === undefined || val === '') return null;

    // 1. Direct Date Object
    if (val instanceof Date && !isNaN(val.getTime())) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 2. Excel Numeric Serial Date (e.g. 46083 for 2026-03-02)
    if (typeof val === 'number' && !isNaN(val)) {
      try {
        const parsedCode = XLSX.SSF.parse_date_code(val);
        if (parsedCode && parsedCode.y && parsedCode.m && parsedCode.d) {
          const y = String(parsedCode.y);
          const m = String(parsedCode.m).padStart(2, '0');
          const d = String(parsedCode.d).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      } catch {
        // Fallback to UTC epoch calculation
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const jsDate = new Date(excelEpoch.getTime() + val * 86400000);
        if (!isNaN(jsDate.getTime())) {
          return jsDate.toISOString().split('T')[0];
        }
      }
    }

    // 3. String Processing
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return null;

      // Check ISO format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }

      // Check ISO with timestamp YYYY-MM-DDTHH:mm:ss
      if (trimmed.includes('T')) {
        const part = trimmed.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
          return part;
        }
      }

      // Check DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, or MM/DD/YYYY
      const dmyMatch = trimmed.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/);
      if (dmyMatch) {
        const first = parseInt(dmyMatch[1], 10);
        const second = parseInt(dmyMatch[2], 10);
        const y = dmyMatch[3];
        let d = String(first).padStart(2, '0');
        let m = String(second).padStart(2, '0');
        if (first <= 12 && second > 12) {
          // MM/DD/YYYY format
          m = String(first).padStart(2, '0');
          d = String(second).padStart(2, '0');
        }
        return `${y}-${m}-${d}`;
      }

      // Check YYYY/MM/DD or YYYY.MM.DD
      const ymdMatch = trimmed.match(/^(\d{4})[/\-. ](\d{1,2})[/\-. ](\d{1,2})$/);
      if (ymdMatch) {
        const y = ymdMatch[1];
        const m = ymdMatch[2].padStart(2, '0');
        const d = ymdMatch[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
      }

      // Month name dictionary
      const months: Record<string, string> = {
        jan: '01', january: '01',
        feb: '02', february: '02',
        mar: '03', march: '03',
        apr: '04', april: '04',
        may: '05',
        jun: '06', june: '06',
        jul: '07', july: '07',
        aug: '08', august: '08',
        sep: '09', september: '09',
        oct: '10', october: '10',
        nov: '11', november: '11',
        dec: '12', december: '12',
      };

      // Check "2 March 2026" or "02-March-2026" or "2 Mar 2026"
      const textMatch1 = trimmed.match(/^(\d{1,2})[\s\-_]+([A-Za-z]+)[\s\-_]+(\d{4})$/);
      if (textMatch1) {
        const d = textMatch1[1].padStart(2, '0');
        const monthKey = textMatch1[2].toLowerCase();
        const y = textMatch1[3];
        if (months[monthKey]) {
          return `${y}-${months[monthKey]}-${d}`;
        }
      }

      // Check "March 2, 2026" or "March 02 2026"
      const textMatch2 = trimmed.match(/^([A-Za-z]+)[\s\-_]+(\d{1,2}),?[\s\-_]+(\d{4})$/);
      if (textMatch2) {
        const monthKey = textMatch2[1].toLowerCase();
        const d = textMatch2[2].padStart(2, '0');
        const y = textMatch2[3];
        if (months[monthKey]) {
          return `${y}-${months[monthKey]}-${d}`;
        }
      }

      // Fallback: standard JS Date parsing
      const jsParsed = new Date(trimmed);
      if (!isNaN(jsParsed.getTime())) {
        const y = jsParsed.getFullYear();
        const m = String(jsParsed.getMonth() + 1).padStart(2, '0');
        const d = String(jsParsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    return null;
  }

  /**
   * Normalizes class names into standard GBHS ClassLevel (Classes 1 to 10)
   */
  public static normalizeClass(val: any, availableClasses?: string[]): ClassLevel | null {
    return normalizeClassFn(val, availableClasses);
  }

  /**
   * Normalizes section into 'A' or 'B'
   */
  public static normalizeSection(val: any): Section {
    if (!val) return 'A';
    const s = String(val).trim().toUpperCase();
    if (s.includes('B')) return 'B';
    return 'A';
  }

  /**
   * Detailed attendance status parser that preserves context and disambiguates codes like 'L'.
   * Never silently guesses when the meaning of 'L' is unclear.
   */
  public static parseAttendanceStatusWithDetails(
    val: any,
    context?: AttendanceStatusContext | string
  ): AttendanceStatusResult {
    if (val === null || val === undefined) {
      return {
        status: null,
        raw: '',
        normalizedToken: '',
        isValid: false,
        isAmbiguous: false,
        error: 'Attendance status is required',
      };
    }

    const rawStr = String(val).trim();
    if (!rawStr) {
      return {
        status: null,
        raw: '',
        normalizedToken: '',
        isValid: false,
        isAmbiguous: false,
        error: 'Attendance status is required',
      };
    }

    const s = rawStr.toLowerCase();

    // 1. Present (P, Present, Hazir, Yes, Y)
    if (s === 'p' || s === 'present' || s === 'hazir' || s === 'حاضر' || s === 'yes' || s === 'y') {
      return { status: 'Present', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false };
    }

    // 2. Absent (A, Absent, Ghairhazir, No, N)
    if (s === 'a' || s === 'absent' || s === 'ghairhazir' || s === 'غیرحاضر' || s === 'no' || s === 'n') {
      return { status: 'Absent', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false };
    }

    // 3. Late (explicit/unambiguous late codes: T, LT, Late, Der, Tardy)
    if (s === 't' || s === 'lt' || s === 'late' || s === 'der' || s === 'تاخیر' || s === 'tardy') {
      return { status: 'Late', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false };
    }

    // 4. Leave (explicit/unambiguous leave codes: Lv, Leave, Chutti, On Leave)
    if (s === 'lv' || s === 'leave' || s === 'chutti' || s === 'رخصت' || s === 'on leave' || s === 'onleave') {
      return { status: 'Leave', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false };
    }

    // Non-attendance holiday marker (H, Holy Day, Holiday)
    if (s === 'h' || s === 'holy day' || s === 'holyday' || s === 'holiday') {
      return {
        status: null,
        raw: rawStr,
        normalizedToken: s,
        isValid: true,
        isAmbiguous: false,
        isHoliday: true,
      };
    }

    // 5. Ambiguous code: 'l'
    if (s === 'l') {
      // Normalize context
      const ctx: AttendanceStatusContext = typeof context === 'string'
        ? (context.toLowerCase() === 'late' || context.toLowerCase() === 'leave'
            ? { lMeaning: (context.slice(0, 1).toUpperCase() + context.slice(1).toLowerCase()) as 'Late' | 'Leave' }
            : { templateFormat: context })
        : (context || {});

      // 5a. Explicit lMeaning override
      if (ctx.lMeaning === 'Late') {
        return { status: 'Late', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'explicit_lMeaning_late' };
      }
      if (ctx.lMeaning === 'Leave') {
        return { status: 'Leave', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'explicit_lMeaning_leave' };
      }

      // 5b. Template format identification
      const fmt = (ctx.templateFormat || '').toLowerCase();
      if (fmt === 'official' || fmt === 'gbhs_attendance' || fmt === 'gbhs_workbook') {
        return { status: 'Late', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'template_format_official' };
      }
      if (fmt === 'standard' || fmt === 'holy_day_matrix') {
        return { status: 'Leave', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'template_format_' + fmt };
      }

      // 5c. Holy Day matrix signature (hasHolyDay in context or detected tokens)
      if (ctx.hasHolyDay) {
        return { status: 'Leave', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'holy_day_matrix_format' };
      }

      // 5d. Legend text in sheet headers/comments
      const legend = (ctx.legendText || '').toLowerCase();
      if (legend.includes('holy day') || legend.includes('holyday') || legend.includes('apsent')) {
        return { status: 'Leave', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'holy_day_matrix_legend' };
      }
      if (/\b(?:l\s*[:=-]?\s*late|lv\s*[:=-]?\s*leave)\b/i.test(legend)) {
        return { status: 'Late', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'legend_text_late' };
      }
      if (/\bl\s*[:=-]?\s*leave\b/i.test(legend)) {
        return { status: 'Leave', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'legend_text_leave' };
      }

      // 5e. Observed dataset tokens (co-occurrence disambiguation)
      const tokens = Array.isArray(ctx.detectedTokens)
        ? new Set(ctx.detectedTokens.map(t => String(t).trim().toLowerCase()))
        : ctx.detectedTokens instanceof Set
        ? new Set(Array.from(ctx.detectedTokens).map(t => String(t).trim().toLowerCase()))
        : null;

      if (tokens) {
        const hasHolyDayToken = tokens.has('h') || tokens.has('holy day') || tokens.has('holyday') || tokens.has('holiday');
        if (hasHolyDayToken) {
          return { status: 'Leave', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'dataset_detected_holy_day' };
        }
        const hasLv = tokens.has('lv') || tokens.has('leave');
        const hasLtOrT = tokens.has('lt') || tokens.has('t') || tokens.has('late');
        if (hasLv) {
          // Dataset uses Lv/Leave for leave; bare L indicates Late
          return { status: 'Late', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'dataset_detected_lv' };
        }
        if (hasLtOrT && !hasLv) {
          // Dataset uses LT/T for late and does not have Lv; bare L indicates Leave
          return { status: 'Leave', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'dataset_detected_lt_or_t' };
        }
      }

      // 5f. Official attendance workbook signature (file/sheet name)
      // Only match if NOT a monthly holy day matrix file (e.g. not April, March, May monthly files)
      const fn = (ctx.fileName || '').toLowerCase();
      const sn = (ctx.sheetName || '').toLowerCase();
      const isOfficialWorkbook =
        (fn.includes('gbhs') && fn.includes('attendance') && !fn.includes('april') && !fn.includes('march') && !fn.includes('may') && !fn.includes('sheet1')) ||
        fn.includes('attendance_workbook') ||
        sn.includes('attendance detail') ||
        /^attendance\s*(7|8|9|10)(th|h)?$/i.test(sn);

      if (isOfficialWorkbook) {
        return { status: 'Late', raw: rawStr, normalizedToken: s, isValid: true, isAmbiguous: false, resolvedByContext: 'official_workbook_signature' };
      }

      // 5g. Unclear context: NEVER SILENTLY GUESS
      return {
        status: null,
        raw: rawStr,
        normalizedToken: s,
        isValid: false,
        isAmbiguous: true,
        error: 'Ambiguous attendance code "L": In the official attendance workbook format, "L" means Late and "Lv" means Leave, but in other spreadsheets "L" may mean Leave. Please specify the template format or use explicit codes ("Late"/"LT" or "Lv"/"Leave").',
      };
    }

    // 6. Unknown status
    return {
      status: null,
      raw: rawStr,
      normalizedToken: s,
      isValid: false,
      isAmbiguous: false,
      error: `Invalid attendance status: "${rawStr}". Must be Present (P), Absent (A), Late (T, LT, Late), or Leave (Lv, Leave).`,
    };
  }

  /**
   * Normalizes attendance status using optional context.
   * Returns null if invalid or ambiguous without clear context.
   */
  public static normalizeAttendanceStatus(
    val: any,
    context?: AttendanceStatusContext | string
  ): AttendanceStatus | null {
    return this.parseAttendanceStatusWithDetails(val, context).status;
  }

  /**
   * Inspects a worksheet to determine if it is a Monthly Attendance Matrix Grid
   * (where each student occupies one row and attendance dates appear as columns).
   * If detected, unrolls the matrix into individual student-date records.
   * If not a matrix (e.g. flat single-date records), returns { isMatrix: false, rows: [] }.
   */
  public static unrollAttendanceMatrixIfApplicable(
    ws: XLSX.WorkSheet,
    fileName: string,
    sheetName: string,
    defaultClass?: ClassLevel,
    attendanceContext?: AttendanceStatusContext
  ): MatrixUnrollResult {
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!grid || grid.length < 2) {
      return { isMatrix: false, rows: [], dateColumnCount: 0, unrolledCount: 0, matrixErrors: [] };
    }

    // 1. Gather all banner / title text in top rows to help detect Month, Year, Class, Section
    let bannerText = `${fileName} ${sheetName}`;
    const maxHeaderScan = Math.min(grid.length, 15);
    for (let r = 0; r < maxHeaderScan; r++) {
      const row = grid[r];
      if (Array.isArray(row)) {
        for (const cell of row) {
          if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
            bannerText += ' ' + String(cell).trim();
          }
        }
      }
    }

    // 2. Scan for Header Row
    let headerRowIndex = -1;
    let bestHeaderScore = 0;
    for (let r = 0; r < maxHeaderScan; r++) {
      const row = grid[r];
      if (!row || !Array.isArray(row)) continue;
      let studentColScore = 0;
      for (const cell of row) {
        if (cell === null || cell === undefined) continue;
        const s = String(cell).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (
          s === 'roll' || s === 'rollno' || s === 'rollnumber' || s === 'rollregno' ||
          s === 'studentname' || s === 'nameoflearner' || s === 'name' ||
          s === 'admissionno' || s === 'admissionnumber' || s === 'studentid' || s === 'admno' ||
          s === 's' || s === 'sr' || s === 'serial' || s === 'sno' || s === 'srno'
        ) {
          studentColScore += 3;
        } else if (s === 'fathername' || s === 'fathersname' || s === 'class' || s === 'section') {
          studentColScore += 2;
        }
      }
      if (studentColScore > bestHeaderScore && studentColScore >= 3) {
        bestHeaderScore = studentColScore;
        headerRowIndex = r;
      }
    }

    if (headerRowIndex === -1) {
      return { isMatrix: false, rows: [], dateColumnCount: 0, unrolledCount: 0, matrixErrors: [] };
    }

    const headerRow = grid[headerRowIndex];

    // Check if workbook / sheet has Holy Day format signature
    let hasHolyDay = false;
    for (const cell of headerRow) {
      if (cell !== null && cell !== undefined) {
        const str = String(cell).trim();
        const clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (clean === 'holyday' || clean === 'holydays' || clean === 'holiday' || clean === 'holidays' || clean === 'apsent' || /holy\s*day|holiday|apsent/i.test(str)) {
          hasHolyDay = true;
          break;
        }
      }
    }
    if (!hasHolyDay && /holy\s*day|holiday|apsent/i.test(bannerText)) {
      hasHolyDay = true;
    }
    if (!hasHolyDay && ws['!ref']) {
      try {
        const range = XLSX.utils.decode_range(ws['!ref']);
        const maxR = Math.min(range.e.r, 20);
        for (let R = range.s.r; R <= maxR; R++) {
          for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (cell && cell.f && /(?:COUNTIF.*["']H["']|COUNTIF.*["']L["'])/i.test(String(cell.f))) {
              hasHolyDay = true;
              break;
            }
          }
          if (hasHolyDay) break;
        }
      } catch {
        // ignore range decode error
      }
    }
    if (!hasHolyDay) {
      for (let r = headerRowIndex + 1; r < Math.min(grid.length, headerRowIndex + 10); r++) {
        const row = grid[r];
        if (Array.isArray(row)) {
          for (const cell of row) {
            if (String(cell || '').trim().toUpperCase() === 'H') {
              hasHolyDay = true;
              break;
            }
          }
        }
        if (hasHolyDay) break;
      }
    }

    const detectedFormat: 'holy_day_matrix' | 'standard_matrix' | 'official_matrix' =
      hasHolyDay ? 'holy_day_matrix' : 'standard_matrix';

    // 3. Extract student identity columns and candidate day columns from headerRow
    const studentCols: { index: number; role: 'roll' | 'admission' | 'name' | 'father' | 'class' | 'section' | 'remarks' }[] = [];
    const candidateDayCols: { colIndex: number; dayNum: number }[] = [];
    const candidateFullDateCols: number[] = [];

    const SUMMARY_HEADERS = new Set([
      'overall', 'attendance', 'percentage', 'dayswithconfirmedstatus',
      'verifiedeligibledays', 'eligibledays', 'dataverificationstatus',
      'verification', 'statusverification', 'present', 'presentdays',
      'totalpresent', 'totalp', 'absent', 'absentdays', 'totalabsent',
      'totala', 'leave', 'leavedays', 'totalleave', 'totall', 'late',
      'latedays', 'totallate', 'totalt', 'totaldays', 'totalworkingdays',
      'workingdays', 'monthauto', 'keyauto', 'gridcodeauto', 'active',
      'studentstatus', 'lifecyclestatus', 'status',
      'holyday', 'holydays', 'holiday', 'holidays', 'totalholyday',
      'totalholiday', 'totalholydays', 'totalholidays', 'totalh',
      'apsent', 'apsentdays', 'totalapsent', 'psent', 'hl', 'hday', 'holy'
    ]);

    for (let c = 0; c < headerRow.length; c++) {
      const headerVal = headerRow[c];
      if (headerVal === null || headerVal === undefined || String(headerVal).trim() === '') {
        continue;
      }
      const rawStr = String(headerVal).trim();
      const cleanKey = rawStr.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (cleanKey === 'roll' || cleanKey === 'rollno' || cleanKey === 'rollnumber' || cleanKey === 'rollregno') {
        studentCols.push({ index: c, role: 'roll' });
        continue;
      }
      if (cleanKey === 'admissionno' || cleanKey === 'admissionnumber' || cleanKey === 'studentid' || cleanKey === 'admno' || cleanKey === 'regno' || cleanKey === 'grno') {
        studentCols.push({ index: c, role: 'admission' });
        continue;
      }
      if (cleanKey === 'studentname' || cleanKey === 'nameoflearner' || cleanKey === 'name') {
        studentCols.push({ index: c, role: 'name' });
        continue;
      }
      if (cleanKey === 'fathername' || cleanKey === 'fathersname' || cleanKey === 'father') {
        studentCols.push({ index: c, role: 'father' });
        continue;
      }
      if (cleanKey === 'class' || cleanKey === 'grade' || cleanKey === 'standard') {
        studentCols.push({ index: c, role: 'class' });
        continue;
      }
      if (cleanKey === 'section' || cleanKey === 'sec') {
        studentCols.push({ index: c, role: 'section' });
        continue;
      }
      if (cleanKey === 'remarks' || cleanKey === 'note' || cleanKey === 'notes') {
        studentCols.push({ index: c, role: 'remarks' });
        continue;
      }
      if (cleanKey === 's' || cleanKey === 'sr' || cleanKey === 'serial' || cleanKey === 'sno' || cleanKey === 'srno') {
        continue;
      }

      if (typeof headerVal === 'number' && headerVal >= 1 && headerVal <= 31) {
        candidateDayCols.push({ colIndex: c, dayNum: headerVal });
      } else if (typeof headerVal === 'string' && /^(?:d(?:ay)?)?\s*([1-9]|[12]\d|3[01])$/i.test(rawStr)) {
        const num = parseInt(rawStr.replace(/^d(?:ay)?\s*/i, ''), 10);
        if (num >= 1 && num <= 31) {
          candidateDayCols.push({ colIndex: c, dayNum: num });
        }
      } else if (headerVal instanceof Date && !isNaN(headerVal.getTime())) {
        candidateFullDateCols.push(c);
      } else if (typeof headerVal === 'number' && headerVal >= 40000 && headerVal <= 65000) {
        candidateFullDateCols.push(c);
      } else if (typeof headerVal === 'string' && BulkOperationsService.parseExcelDate(headerVal)) {
        candidateFullDateCols.push(c);
      }
    }

    // A matrix must have at least 2 date/day columns. If fewer, it is a flat single-date sheet or non-attendance sheet.
    if ((candidateDayCols.length + candidateFullDateCols.length) < 2) {
      return { isMatrix: false, rows: [], dateColumnCount: 0, unrolledCount: 0, matrixErrors: [] };
    }

    // 4. Scan adjacent rows for Weekday Labels
    const WEEKDAY_NAMES: Record<string, number> = {
      sun: 0, sunday: 0, su: 0, itwar: 0,
      mon: 1, monday: 1, mo: 1, somwar: 1,
      tue: 2, tues: 2, tuesday: 2, tu: 2, mangal: 2,
      wed: 3, wednesday: 3, we: 3, budh: 3,
      thu: 4, thur: 4, thurs: 4, thursday: 4, th: 4, jumeraat: 4,
      fri: 5, friday: 5, fr: 5, jumma: 5, juma: 5,
      sat: 6, saturday: 6, sa: 6, hafta: 6,
    };
    const WEEKDAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES_LIST = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let weekdayRowIndex = -1;
    let bestWeekdayMatchCount = 0;
    const adjacentOffsets = [1, -1, 2, -2];

    for (const offset of adjacentOffsets) {
      const r = headerRowIndex + offset;
      if (r < 0 || r >= grid.length) continue;
      const row = grid[r];
      if (!Array.isArray(row)) continue;
      let matchCount = 0;
      for (const { colIndex } of candidateDayCols) {
        const cell = row[colIndex];
        if (cell !== null && cell !== undefined) {
          const clean = String(cell).trim().toLowerCase().replace(/[^a-z]/g, '');
          if (WEEKDAY_NAMES[clean] !== undefined) {
            matchCount++;
          }
        }
      }
      if (matchCount > bestWeekdayMatchCount && matchCount >= 3) {
        bestWeekdayMatchCount = matchCount;
        weekdayRowIndex = r;
      }
    }

    const dayToWeekdayMap = new Map<number, { weekday: number; rawLabel: string; colIndex: number }>();
    if (weekdayRowIndex !== -1) {
      const row = grid[weekdayRowIndex];
      for (const { colIndex, dayNum } of candidateDayCols) {
        const cell = row[colIndex];
        if (cell !== null && cell !== undefined) {
          const rawLabel = String(cell).trim();
          const clean = rawLabel.toLowerCase().replace(/[^a-z]/g, '');
          if (WEEKDAY_NAMES[clean] !== undefined) {
            dayToWeekdayMap.set(dayNum, {
              weekday: WEEKDAY_NAMES[clean],
              rawLabel,
              colIndex,
            });
          }
        }
      }
    }

    // 5. Extract Month & Year metadata sources
    let explicitYear: number | undefined = attendanceContext?.targetYear;
    let explicitMonth: number | undefined = undefined;

    if (attendanceContext?.targetMonth) {
      const parts = attendanceContext.targetMonth.split(/[-_/]/);
      if (parts.length >= 2) {
        explicitYear = parseInt(parts[0], 10);
        explicitMonth = parseInt(parts[1], 10);
      }
    }

    const MONTH_NAMES: Record<string, number> = {
      january: 1, jan: 1,
      february: 2, feb: 2,
      march: 3, mar: 3,
      april: 4, apr: 4,
      may: 5,
      june: 6, jun: 6,
      july: 7, jul: 7,
      august: 8, aug: 8,
      september: 9, sep: 9, sept: 9,
      october: 10, oct: 10,
      november: 11, nov: 11,
      december: 12, dec: 12,
    };

    // 5a. Check if fileName or sheetName contains a month name
    let monthFromFilename: number | undefined = undefined;
    const nameToScan = `${fileName || ''} ${sheetName || ''}`.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    for (const [mName, mNum] of Object.entries(MONTH_NAMES)) {
      if (new RegExp(`\\b${mName}\\b`, 'i').test(nameToScan)) {
        monthFromFilename = mNum;
        break;
      }
    }

    // 5b. Check cell-level Month and Year key-value pairs in top rows
    let cellMonth: number | undefined = undefined;
    let cellYear: number | undefined = undefined;

    for (let r = 0; r < maxHeaderScan; r++) {
      const row = grid[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell === null || cell === undefined) continue;
        const str = String(cell).trim();

        // Check Year label
        if (/^year\b/i.test(str)) {
          const nextCell = row[c + 1];
          if (typeof nextCell === 'number' && nextCell >= 2020 && nextCell <= 2099) {
            cellYear = nextCell;
          } else if (typeof nextCell === 'string') {
            const ym = nextCell.match(/\b(20\d\d)\b/);
            if (ym) cellYear = parseInt(ym[1], 10);
          }
          const sameM = str.match(/\b(20\d\d)\b/);
          if (sameM && !cellYear) cellYear = parseInt(sameM[1], 10);
        }

        // Check Month label
        if (/^month\b/i.test(str)) {
          const nextCell = row[c + 1];
          if (nextCell !== null && nextCell !== undefined) {
            const cleanM = String(nextCell).trim().toLowerCase().replace(/[^a-z]/g, '');
            if (MONTH_NAMES[cleanM]) {
              cellMonth = MONTH_NAMES[cleanM];
            }
          }
          const sameM = str.replace(/^month\b/i, '').trim().toLowerCase().replace(/[^a-z]/g, '');
          if (MONTH_NAMES[sameM] && !cellMonth) {
            cellMonth = MONTH_NAMES[sameM];
          }
        }
      }
    }

    // 5c. Check generic 4-digit year in top rows if cellYear wasn't found
    let bannerYear: number | undefined = undefined;
    if (!cellYear && !explicitYear) {
      for (let r = 0; r < maxHeaderScan; r++) {
        const row = grid[r];
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          if (typeof cell === 'number' && cell >= 2020 && cell <= 2099) {
            bannerYear = cell;
            break;
          }
          if (typeof cell === 'string') {
            const ym = cell.match(/\b(20\d\d)\b/);
            if (ym) {
              bannerYear = parseInt(ym[1], 10);
              break;
            }
          }
        }
        if (bannerYear) break;
      }
    }

    // Fallback: bannerText regex matches for month/year
    let bannerMonth: number | undefined = undefined;
    if ((!explicitYear && !cellYear && !bannerYear) || (!explicitMonth && !cellMonth && !monthFromFilename)) {
      const monthYearMatches = [
        /\b(20\d\d)[-_/](0?[1-9]|1[0-2])\b/,
        /\b(0?[1-9]|1[0-2])[-_/](20\d\d)\b/,
        /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[\s,._-]+(20\d\d)\b/i,
        /\b(20\d\d)[\s,._-]+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i,
      ];

      for (const rx of monthYearMatches) {
        const m = bannerText.match(rx);
        if (m) {
          if (rx.source.startsWith('\\b(20\\d\\d)[-_/]')) {
            if (!bannerYear) bannerYear = parseInt(m[1], 10);
            if (!bannerMonth) bannerMonth = parseInt(m[2], 10);
          } else if (rx.source.startsWith('\\b(0?[1-9]|1[0-2])[-_/]')) {
            if (!bannerMonth) bannerMonth = parseInt(m[1], 10);
            if (!bannerYear) bannerYear = parseInt(m[2], 10);
          } else if (m[1].toLowerCase() in MONTH_NAMES) {
            if (!bannerMonth) bannerMonth = MONTH_NAMES[m[1].toLowerCase()];
            if (!bannerYear) bannerYear = parseInt(m[2], 10);
          } else if (m[2].toLowerCase() in MONTH_NAMES) {
            if (!bannerYear) bannerYear = parseInt(m[1], 10);
            if (!bannerMonth) bannerMonth = MONTH_NAMES[m[2].toLowerCase()];
          }
          if (bannerYear && bannerMonth) break;
        }
      }
    }

    // Effective candidate year
    const effectiveYear = explicitYear || cellYear || bannerYear || new Date().getFullYear();

    // 5d. Inferred month from weekday row
    let inferredWeekdayMonth: number | undefined = undefined;
    let bestMonthPct = 0;
    if (dayToWeekdayMap.size >= 3) {
      const candidateMatches: { month: number; pct: number; matches: number; total: number }[] = [];
      for (let m = 1; m <= 12; m++) {
        let matches = 0;
        const maxDays = new Date(effectiveYear, m, 0).getDate();
        const validDaysInMonth = Array.from(dayToWeekdayMap.entries()).filter(([d]) => d <= maxDays);
        for (const [dayNum, info] of validDaysInMonth) {
          const actualWeekday = new Date(effectiveYear, m - 1, dayNum).getDay();
          if (actualWeekday === info.weekday) {
            matches++;
          }
        }
        const pct = validDaysInMonth.length > 0 ? matches / validDaysInMonth.length : 0;
        if (pct >= 0.85) {
          candidateMatches.push({ month: m, pct, matches, total: validDaysInMonth.length });
        }
      }

      // If cellMonth or monthFromFilename is among the matching candidate months (>= 85%), favor it
      // to avoid arbitrary calendar collisions with other 31-day months (e.g. July vs April when Day 31 is padding)
      const preferredMonth = cellMonth || monthFromFilename || explicitMonth;
      if (preferredMonth && candidateMatches.some((c) => c.month === preferredMonth)) {
        inferredWeekdayMonth = preferredMonth;
        bestMonthPct = candidateMatches.find((c) => c.month === preferredMonth)!.pct;
      } else if (candidateMatches.length > 0) {
        candidateMatches.sort((a, b) => b.pct - a.pct || b.matches - a.matches);
        inferredWeekdayMonth = candidateMatches[0].month;
        bestMonthPct = candidateMatches[0].pct;
      }
    }

    // Helper to calculate weekday discrepancies
    const getWeekdayDiscrepancies = (y: number, m: number) => {
      const discrepancies: { day: number; sheetLabel: string; expectedWeekday: string }[] = [];
      const maxDays = new Date(y, m, 0).getDate();
      for (const [dayNum, info] of dayToWeekdayMap.entries()) {
        if (dayNum > maxDays) {
          // Check if student data cells in this column contain any actual attendance marks (P, A, L, T, LT)
          let hasActualAttendanceMark = false;
          for (let r = headerRowIndex + 1; r < grid.length; r++) {
            const val = grid[r]?.[info.colIndex];
            if (val !== null && val !== undefined) {
              const s = String(val).trim().toUpperCase();
              if (
                s === 'P' || s === 'A' || s === 'L' || s === 'T' || s === 'LT' || s === 'LV' ||
                s === 'PRESENT' || s === 'ABSENT' || s === 'LATE' || s === 'LEAVE'
              ) {
                hasActualAttendanceMark = true;
                break;
              }
            }
          }
          if (hasActualAttendanceMark) {
            discrepancies.push({
              day: dayNum,
              sheetLabel: info.rawLabel,
              expectedWeekday: `Exceeds max days (${maxDays}) in ${MONTH_NAMES_LIST[m]}`,
            });
          }
        } else {
          const actualWeekday = new Date(y, m - 1, dayNum).getDay();
          if (actualWeekday !== info.weekday) {
            discrepancies.push({
              day: dayNum,
              sheetLabel: info.rawLabel,
              expectedWeekday: WEEKDAY_SHORT_LABELS[actualWeekday],
            });
          }
        }
      }
      return discrepancies;
    };

    // 5e. Calendar Consistency Validation
    // Calendar consistency validation applies when the sheet contains relative day-number columns (1..31)
    // that must be anchored to an explicit or inferred Month & Year.
    // If the sheet's date columns are already fully-qualified calendar dates (Excel serials or YYYY-MM-DD),
    // each column provides its own explicit date and no relative Month/Year resolution is required.
    let calendarConflict: MatrixCalendarConflict | undefined = undefined;
    let detectedMonth: number | undefined = undefined;
    let detectedYear: number | undefined = effectiveYear;

    if (candidateDayCols.length >= 2) {
      if (explicitMonth && explicitYear) {
        // User explicitly resolved targetMonth
        if (dayToWeekdayMap.size >= 3) {
          const disc = getWeekdayDiscrepancies(explicitYear, explicitMonth);
          if (disc.length > 0) {
            const firstDisc = disc[0];
            calendarConflict = {
              hasConflict: true,
              conflictType: 'weekday_mismatch',
              message: `Calendar conflict: The specified month (${MONTH_NAMES_LIST[explicitMonth]} ${explicitYear}) does not match the weekday row in the sheet (Day ${firstDisc.day} is labeled "${firstDisc.sheetLabel}", but ${MONTH_NAMES_LIST[explicitMonth]} ${firstDisc.day}, ${explicitYear} is ${firstDisc.expectedWeekday}).${
                inferredWeekdayMonth ? ` The weekday labels align with ${MONTH_NAMES_LIST[inferredWeekdayMonth]} ${explicitYear}.` : ''
              }`,
              sources: {
                explicitTargetMonth: attendanceContext?.targetMonth,
                filenameMonth: monthFromFilename ? { month: monthFromFilename, name: MONTH_NAMES_LIST[monthFromFilename] } : undefined,
                cellMonth: cellMonth ? { month: cellMonth, name: MONTH_NAMES_LIST[cellMonth] } : undefined,
                weekdayMonth: inferredWeekdayMonth ? { month: inferredWeekdayMonth, name: MONTH_NAMES_LIST[inferredWeekdayMonth] } : undefined,
                resolvedYear: explicitYear,
              },
              weekdayDiscrepancies: disc.slice(0, 5),
            };
          } else {
            detectedMonth = explicitMonth;
            detectedYear = explicitYear;
          }
        } else {
          detectedMonth = explicitMonth;
          detectedYear = explicitYear;
        }
      } else {
        // Automatic detection: compare all available sources
        const sourcesPresent: { name: string; month: number }[] = [];
        if (monthFromFilename) sourcesPresent.push({ name: `filename (${MONTH_NAMES_LIST[monthFromFilename]})`, month: monthFromFilename });
        if (cellMonth) sourcesPresent.push({ name: `sheet header cell (${MONTH_NAMES_LIST[cellMonth]})`, month: cellMonth });
        else if (bannerMonth) sourcesPresent.push({ name: `sheet header (${MONTH_NAMES_LIST[bannerMonth]})`, month: bannerMonth });
        if (inferredWeekdayMonth) sourcesPresent.push({ name: `weekday row (${MONTH_NAMES_LIST[inferredWeekdayMonth]})`, month: inferredWeekdayMonth });

        if (sourcesPresent.length === 0) {
          calendarConflict = {
            hasConflict: true,
            conflictType: 'ambiguous',
            message: 'Ambiguous date header: Month and Year could not be determined from the sheet header, sheet name, file name, or weekday row. Please specify the target month or correct the workbook.',
            sources: {},
          };
        } else {
          const firstM = sourcesPresent[0].month;
          const allAgree = sourcesPresent.every((s) => s.month === firstM);

          if (!allAgree) {
            const disc = monthFromFilename && dayToWeekdayMap.size >= 3 ? getWeekdayDiscrepancies(effectiveYear, monthFromFilename) : [];
            calendarConflict = {
              hasConflict: true,
              conflictType: 'mismatch',
              message: `Calendar conflict detected: ${sourcesPresent.map((s) => s.name).join(' vs ')} in ${effectiveYear}. Import is blocked until the date context is explicitly resolved.`,
              sources: {
                filenameMonth: monthFromFilename ? { month: monthFromFilename, name: MONTH_NAMES_LIST[monthFromFilename] } : undefined,
                cellMonth: (cellMonth || bannerMonth) ? { month: (cellMonth || bannerMonth)!, name: MONTH_NAMES_LIST[(cellMonth || bannerMonth)!] } : undefined,
                weekdayMonth: inferredWeekdayMonth ? { month: inferredWeekdayMonth, name: MONTH_NAMES_LIST[inferredWeekdayMonth] } : undefined,
                resolvedYear: effectiveYear,
              },
              weekdayDiscrepancies: disc.slice(0, 5),
            };
          } else {
            if (dayToWeekdayMap.size >= 3) {
              const disc = getWeekdayDiscrepancies(effectiveYear, firstM);
              if (disc.length > 0) {
                calendarConflict = {
                  hasConflict: true,
                  conflictType: 'weekday_mismatch',
                  message: `Calendar conflict: Sheet headers indicate ${MONTH_NAMES_LIST[firstM]} ${effectiveYear}, but the weekday row does not match (Day ${disc[0].day} is labeled "${disc[0].sheetLabel}", but expected ${disc[0].expectedWeekday}).`,
                  sources: {
                    filenameMonth: monthFromFilename ? { month: monthFromFilename, name: MONTH_NAMES_LIST[monthFromFilename] } : undefined,
                    cellMonth: (cellMonth || bannerMonth) ? { month: (cellMonth || bannerMonth)!, name: MONTH_NAMES_LIST[(cellMonth || bannerMonth)!] } : undefined,
                    weekdayMonth: inferredWeekdayMonth ? { month: inferredWeekdayMonth, name: MONTH_NAMES_LIST[inferredWeekdayMonth] } : undefined,
                    resolvedYear: effectiveYear,
                  },
                  weekdayDiscrepancies: disc.slice(0, 5),
                };
              } else {
                detectedMonth = firstM;
                detectedYear = effectiveYear;
              }
            } else {
              detectedMonth = firstM;
              detectedYear = effectiveYear;
            }
          }
        }
      }
    }

    // 6. Extract Class and Section from banner / sheet name / file name
    let detectedClass: string | undefined = undefined;
    const textForClassMatch = `${fileName} ${sheetName} ${bannerText}`.replace(/_/g, ' ');
    const classMatch = textForClassMatch.match(/\bclass\s*([1-9]|10)\b/i) || textForClassMatch.match(/\b([1-9]|10)th\b/i);
    if (classMatch) {
      detectedClass = `Class ${classMatch[1]}`;
    }

    let detectedSection: string | undefined = undefined;
    const secMatch = textForClassMatch.match(/\b(?:sec|section)\s*([A-Za-z])\b/i) || textForClassMatch.match(/\bclass\s*\d+\s*[-_]?\s*([A-Za-z])\b/i);
    if (secMatch) {
      detectedSection = secMatch[1].toUpperCase();
    }

    const matrixErrors: string[] = [];

    // If calendar conflict was detected, safely unroll invalid rows with error to block import
    if (calendarConflict?.hasConflict) {
      matrixErrors.push(calendarConflict.message);

      const conflictRows: Record<string, any>[] = [];
      for (let r = headerRowIndex + 1; r < grid.length; r++) {
        const row = grid[r];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        let rollNo = '';
        let admissionNo = '';
        let studentName = '';
        let fatherName = '';
        let studentClass = '';
        let studentSection = '';
        let studentRemarks = '';

        for (const sc of studentCols) {
          const val = row[sc.index] !== null && row[sc.index] !== undefined ? String(row[sc.index]).trim() : '';
          if (sc.role === 'roll') rollNo = val;
          else if (sc.role === 'admission') admissionNo = val;
          else if (sc.role === 'name') studentName = val;
          else if (sc.role === 'father') fatherName = val;
          else if (sc.role === 'class') studentClass = val;
          else if (sc.role === 'section') studentSection = val;
          else if (sc.role === 'remarks') studentRemarks = val;
        }

        if (!studentName && !rollNo && !admissionNo) continue;
        const combinedRowStr = (studentName + ' ' + rollNo + ' ' + fatherName).toLowerCase();
        if (
          combinedRowStr.includes('total') ||
          combinedRowStr.includes('average') ||
          combinedRowStr.includes('summary') ||
          combinedRowStr.includes('percentage') ||
          combinedRowStr.includes('example row')
        ) {
          continue;
        }

        const finalClass = studentClass || detectedClass || defaultClass || 'Class 7';
        const finalSection = studentSection || detectedSection || 'A';

        conflictRows.push({
          date: 'INVALID-DATE',
          class: finalClass,
          section: finalSection,
          rollnumber: rollNo,
          rollno: rollNo,
          roll: rollNo,
          admissionnumber: admissionNo,
          admissionno: admissionNo,
          studentid: admissionNo,
          studentname: studentName,
          name: studentName,
          fathername: fatherName,
          status: 'Present',
          remarks: studentRemarks,
          _matrixError: calendarConflict.message,
          _matrixSourceRow: r + 1,
          _matrixSourceCol: candidateDayCols[0]?.colIndex ? candidateDayCols[0].colIndex + 1 : 1,
        });
      }

      return {
        isMatrix: true,
        rows: conflictRows,
        detectedMonthYear: undefined,
        detectedClass,
        detectedSection,
        dateColumnCount: candidateDayCols.length || 30,
        unrolledCount: conflictRows.length,
        matrixErrors,
        detectedFormat,
        hasHolyDay,
        calendarConflict,
      };
    }

    // 7. Inspect Columns: Separate Summary Columns vs Date Columns
    const dateCols: { index: number; rawHeader: any; resolvedDate: string | null; error?: string }[] = [];
    const studentColIndices = new Set(studentCols.map((sc) => sc.index));

    for (let c = 0; c < headerRow.length; c++) {
      if (studentColIndices.has(c)) {
        continue;
      }
      const headerVal = headerRow[c];
      if (headerVal === null || headerVal === undefined || String(headerVal).trim() === '') {
        continue;
      }
      const rawStr = String(headerVal).trim();
      const cleanKey = rawStr.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (cleanKey === 's' || cleanKey === 'sr' || cleanKey === 'serial' || cleanKey === 'sno' || cleanKey === 'srno') {
        // Serial number column - skip
        continue;
      }

      // Check summary / metadata columns
      const isSummaryHeader =
        SUMMARY_HEADERS.has(cleanKey) ||
        /^(?:total\s*)?(?:present|absent|apsent|leave|holy\s*day|holiday|late|working\s*days|percentage|pct|%)/i.test(rawStr) ||
        /(?:holy\s*day|holiday|apsent)/i.test(rawStr);

      if (isSummaryHeader) {
        continue;
      }

      // Check if cells in this column contain formulas starting with =COUNTIF or =SUM
      let hasSummaryFormula = false;
      for (let r = headerRowIndex + 1; r < Math.min(grid.length, headerRowIndex + 6); r++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c });
        const cellObj = ws[cellAddr];
        if (cellObj && cellObj.f && /(?:COUNTIF|SUM|AVERAGE)/i.test(String(cellObj.f))) {
          hasSummaryFormula = true;
          break;
        }
      }
      if (hasSummaryFormula) {
        continue;
      }

      // Check if subheader row (if exists, e.g. row 3 in GBHS workbook) labels this as monthly summary %
      if (headerRowIndex > 0) {
        const subheaderCell = grid[headerRowIndex - 1]?.[c];
        if (subheaderCell && /monthly attendance %|percentage|summary/i.test(String(subheaderCell))) {
          continue;
        }
      }

      // Check data rows below header: if values are floating rates (e.g. 0.82) or percentage strings (e.g. "85%"), treat as summary
      let floatCount = 0;
      let totalSample = 0;
      for (let r = headerRowIndex + 1; r < Math.min(grid.length, headerRowIndex + 6); r++) {
        const val = grid[r]?.[c];
        if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== 'N/A') {
          totalSample++;
          if (typeof val === 'number' && val >= 0 && val <= 1) {
            floatCount++;
          } else if (typeof val === 'string' && /^\d+(\.\d+)?%$/.test(val.trim())) {
            floatCount++;
          }
        }
      }
      if (totalSample > 0 && floatCount >= totalSample * 0.8) {
        // Floating point percentage summary column
        continue;
      }

      // Evaluate candidate date column
      let resolvedDate: string | null = null;
      let dateError: string | undefined = undefined;

      // 5a. Direct JS Date Object (from cellDates: true)
      if (headerVal instanceof Date && !isNaN(headerVal.getTime())) {
        const y = headerVal.getFullYear();
        const m = String(headerVal.getMonth() + 1).padStart(2, '0');
        const d = String(headerVal.getDate()).padStart(2, '0');
        resolvedDate = `${y}-${m}-${d}`;
      }
      // 5b. Excel numeric serial date (e.g. 46146)
      else if (typeof headerVal === 'number' && headerVal >= 40000 && headerVal <= 65000) {
        try {
          const parsed = XLSX.SSF.parse_date_code(headerVal);
          if (parsed && parsed.y && parsed.m && parsed.d) {
            resolvedDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
          }
        } catch {
          dateError = `Invalid Excel date serial header: ${headerVal}`;
        }
      }
      // 5c. Day number (e.g. 1..31 or "1".."31" or "D1".."D31")
      else if (
        (typeof headerVal === 'number' && headerVal >= 1 && headerVal <= 31) ||
        (typeof headerVal === 'string' && /^(?:d(?:ay)?)?\s*([1-9]|[12]\d|3[01])$/i.test(headerVal.trim()))
      ) {
        const match = typeof headerVal === 'number' ? headerVal : parseInt(headerVal.trim().replace(/^d(?:ay)?\s*/i, ''), 10);
        if (detectedYear && detectedMonth) {
          const maxDays = new Date(detectedYear, detectedMonth, 0).getDate();
          if (match >= 1 && match <= maxDays) {
            resolvedDate = `${detectedYear}-${String(detectedMonth).padStart(2, '0')}-${String(match).padStart(2, '0')}`;
          } else {
            // Day exceeds max days in this month (e.g. Day 31 in April, which has 30 days)
            // Check if student data cells in this column contain any actual attendance marks (P, A, L, T, LT)
            let hasActualAttendanceMark = false;
            for (let r = headerRowIndex + 1; r < grid.length; r++) {
              const val = grid[r]?.[c];
              if (val !== null && val !== undefined) {
                const s = String(val).trim().toUpperCase();
                if (s === 'P' || s === 'A' || s === 'L' || s === 'T' || s === 'LT' || s === 'LV' || s === 'PRESENT' || s === 'ABSENT' || s === 'LATE' || s === 'LEAVE') {
                  hasActualAttendanceMark = true;
                  break;
                }
              }
            }
            if (hasActualAttendanceMark) {
              dateError = `Invalid date header: Day ${match} does not exist in month ${detectedMonth}/${detectedYear} (has ${maxDays} days).`;
            } else {
              // Unused/holiday padding column for a 30-day month (e.g. Day 31 marked all 'H' or blank)
              continue;
            }
          }
        } else {
          dateError = `Ambiguous date header: Day "${headerVal}" found, but Month and Year could not be determined from the sheet header, sheet name, or file name.`;
        }
      }
      // 5c. Date string (e.g. "2026-10-01", "01/10/2026", "01-10-2026", "Oct 1, 2026")
      else if (typeof headerVal === 'string') {
        const parsed = BulkOperationsService.parseExcelDate(headerVal);
        if (parsed) {
          resolvedDate = parsed;
        } else {
          // Check if this column contains attendance status marks in student rows
          let hasStatusMarks = false;
          for (let r = headerRowIndex + 1; r < Math.min(grid.length, headerRowIndex + 6); r++) {
            const v = String(grid[r]?.[c] || '').trim().toLowerCase();
            if (v === 'p' || v === 'a' || v === 'l' || v === 'lv' || v === 't' || v === 'lt' || v === 'present' || v === 'absent' || v === 'late' || v === 'leave') {
              hasStatusMarks = true;
              break;
            }
          }
          if (hasStatusMarks) {
            dateError = `Ambiguous or invalid date header: "${rawStr}"`;
          }
        }
      }

      if (resolvedDate || dateError) {
        dateCols.push({ index: c, rawHeader: headerVal, resolvedDate, error: dateError });
        if (dateError) {
          matrixErrors.push(dateError);
        }
      }
    }

    // 6. Verification: Is it a Matrix?
    // It's a matrix if we have at least 2 date columns
    if (dateCols.length < 2) {
      return { isMatrix: false, rows: [], dateColumnCount: 0, unrolledCount: 0, matrixErrors: [] };
    }

    // 7. Unroll each student row across date columns
    const unrolledRows: Record<string, any>[] = [];

    for (let r = headerRowIndex + 1; r < grid.length; r++) {
      const row = grid[r];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      // Extract student metadata
      let rollNo = '';
      let admissionNo = '';
      let studentName = '';
      let fatherName = '';
      let studentClass = '';
      let studentSection = '';
      let studentRemarks = '';

      for (const sc of studentCols) {
        const val = row[sc.index] !== null && row[sc.index] !== undefined ? String(row[sc.index]).trim() : '';
        if (sc.role === 'roll') rollNo = val;
        else if (sc.role === 'admission') admissionNo = val;
        else if (sc.role === 'name') studentName = val;
        else if (sc.role === 'father') fatherName = val;
        else if (sc.role === 'class') studentClass = val;
        else if (sc.role === 'section') studentSection = val;
        else if (sc.role === 'remarks') studentRemarks = val;
      }

      // Check if row has any identity information
      if (!studentName && !rollNo && !admissionNo) {
        continue; // Skip blank or footer rows
      }

      // Check if summary row (e.g. Total, Summary, Average)
      const combinedRowStr = (studentName + ' ' + rollNo + ' ' + fatherName).toLowerCase();
      if (
        combinedRowStr.includes('total') ||
        combinedRowStr.includes('average') ||
        combinedRowStr.includes('summary') ||
        combinedRowStr.includes('percentage') ||
        combinedRowStr.includes('example row')
      ) {
        continue;
      }

      const finalClass = studentClass || detectedClass || defaultClass || 'Class 7';
      const finalSection = studentSection || detectedSection || 'A';

      // Iterate through date columns
      for (const dc of dateCols) {
        const cellVal = row[dc.index];
        const cellStr = cellVal !== null && cellVal !== undefined ? String(cellVal).trim() : '';

        // If date column had a header error, create a row with the matrix error so user sees it in preview
        if (dc.error) {
          unrolledRows.push({
            date: dc.resolvedDate || 'INVALID-DATE',
            class: finalClass,
            section: finalSection,
            rollnumber: rollNo,
            rollno: rollNo,
            roll: rollNo,
            admissionnumber: admissionNo,
            admissionno: admissionNo,
            studentid: admissionNo,
            studentname: studentName,
            name: studentName,
            fathername: fatherName,
            status: cellStr || 'Present',
            remarks: studentRemarks,
            _matrixError: dc.error,
            _matrixSourceRow: r + 1,
            _matrixSourceCol: dc.index + 1,
          });
          continue;
        }

        // Skip blank / unmarked / non-attendance days (weekends, holidays, unrecorded days)
        const upperCellStr = cellStr.toUpperCase();
        if (
          !cellStr ||
          cellStr === '-' ||
          cellStr === '—' ||
          upperCellStr === 'N/A' ||
          cellStr === '?' ||
          upperCellStr === 'H' ||
          upperCellStr === 'HOLY DAY' ||
          upperCellStr === 'HOLIDAY'
        ) {
          continue;
        }

        unrolledRows.push({
          date: dc.resolvedDate,
          class: finalClass,
          section: finalSection,
          rollnumber: rollNo,
          rollno: rollNo,
          roll: rollNo,
          admissionnumber: admissionNo,
          admissionno: admissionNo,
          studentid: admissionNo,
          studentname: studentName,
          name: studentName,
          fathername: fatherName,
          status: cellStr,
          remarks: studentRemarks,
          _matrixSourceRow: r + 1,
          _matrixSourceCol: dc.index + 1,
        });
      }
    }

    return {
      isMatrix: true,
      rows: unrolledRows,
      detectedMonthYear: detectedYear && detectedMonth ? { year: detectedYear, month: detectedMonth } : undefined,
      detectedClass,
      detectedSection,
      dateColumnCount: dateCols.length,
      unrolledCount: unrolledRows.length,
      matrixErrors,
      detectedFormat,
      hasHolyDay,
      calendarConflict,
    };
  }

  /**
   * Normalizes practical skill status
   */
  public static normalizeSkillStatus(val: any): SkillStatus {
    if (!val) return 'Not Started';
    const s = String(val).trim().toLowerCase();
    if (s.includes('proficient') || s === 'expert') return 'Proficient';
    if (s.includes('competent') || s === 'pass' || s === 'good') return 'Competent';
    if (s.includes('improve') || s.includes('remedial') || s.includes('need') || s === 'poor') return 'Needs Improvement';
    return 'Not Started';
  }

  /**
   * Normalizes practical completion status
   */
  public static normalizePracticalCompleted(val: any): PracticalCompletedStatus {
    if (!val) return 'No';
    const s = String(val).trim().toLowerCase();
    if (s === 'yes' || s === 'y' || s === 'completed' || s === 'done') return 'Yes';
    if (s.includes('progress') || s.includes('need') || s.includes('practice')) return 'In Progress';
    return 'No';
  }

  /**
   * Normalizes absentee follow-up status
   */
  public static normalizeFollowupStatus(val: any): FollowupStatus {
    if (!val) return 'Pending Return';
    const s = String(val).trim().toLowerCase();
    if (s.includes('resolve') || s.includes('return')) return 'Resolved / Returned';
    if (s.includes('escalat') || s.includes('principal') || s.includes('management')) return 'Escalated';
    if (s.includes('prolong') || s.includes('long') || s.includes('drop')) return 'Prolonged Leave';
    return 'Pending Return';
  }

  /**
   * Resolves a student from IndexedDB roster using stable matching keys:
   * 1. Admission Number
   * 2. Roll No + Class
   * 3. Student Name + Class
   */
  public static resolveStudent(
    row: Record<string, any>,
    classVal: ClassLevel | null,
    admissionMap: Map<string, Student>,
    rollClassMap: Map<string, Student>,
    nameClassMap: Map<string, Student>
  ): Student | undefined {
    // 1. Admission No
    const adm = String(
      row.admissionno ||
      row.admissionnumber ||
      row.admissionNo ||
      row.admissionNumber ||
      row.admno ||
      row.grno ||
      row.regno ||
      row['admission number'] ||
      row['admission no'] ||
      row['admission_no'] ||
      ''
    ).trim();
    if (adm && admissionMap.has(adm.toLowerCase())) {
      return admissionMap.get(adm.toLowerCase());
    }

    // 2. Roll No + Class
    const roll = String(
      row.rollno ||
      row.rollnumber ||
      row.rollnum ||
      row.roll ||
      row.rollNo ||
      row.rollNumber ||
      row['roll number'] ||
      row['roll no'] ||
      row['roll_no'] ||
      ''
    ).trim();
    if (roll && classVal) {
      const cleanClass = classVal.trim().toLowerCase();
      const key = `${roll}_${cleanClass}`.toLowerCase();
      if (rollClassMap.has(key)) {
        return rollClassMap.get(key);
      }
      const intRoll = parseInt(roll, 10);
      if (!isNaN(intRoll)) {
        const intKey = `${intRoll}_${cleanClass}`.toLowerCase();
        if (rollClassMap.has(intKey)) {
          return rollClassMap.get(intKey);
        }
      }
    }

    // 3. Name + Class
    const name = String(
      row.studentname ||
      row.name ||
      row.nameoflearner ||
      row.studentName ||
      row.learnername ||
      row['student name'] ||
      row['name of learner'] ||
      row['name'] ||
      ''
    ).trim();
    if (name && classVal) {
      const cleanClass = classVal.trim().toLowerCase();
      const key = `${name.toLowerCase()}_${cleanClass}`.toLowerCase();
      if (nameClassMap.has(key)) {
        return nameClassMap.get(key);
      }
    }

    return undefined;
  }

  /**
   * Generates a clean .xlsx template workbook with exact keys and clearly labeled example rows.
   * If real students are provided, pre-populates with the school's actual student roster!
   * If no students are provided, generates clearly labeled example rows with guidance.
   */
  public static generateTemplate(
    moduleInput: BulkModuleTypeAlias,
    options?: BulkTemplateOptions
  ): XLSX.WorkBook {
    const moduleType = this.normalizeModuleType(moduleInput);
    const profile = getSchoolProfile();
    const wb = XLSX.utils.book_new();
    const classFilter = options?.classLevel && !options.classLevel.toLowerCase().startsWith('all')
      ? options.classLevel
      : null;
    const targetStudents = (options?.students || []).filter((s) => !classFilter || s.class === classFilter);

    if (moduleType === 'students') {
      const data = [
        {
          'Roll Number*': '101',
          'Admission Number*': 'ADM-701',
          'Student Name*': 'Muhammad Ali',
          'Father Name': 'Muhammad Yousuf',
          'Class (Class 7/8/9)*': 'Class 7',
          'Section (A/B)*': 'A',
          'Phone Number': '03001234567',
          'Date of Birth (YYYY-MM-DD)': '2012-05-14',
          'Status (Active/Inactive)': 'Active',
          'Remarks': '[EXAMPLE ROW - EDIT OR REPLACE WITH YOUR ROSTER]',
        },
        {
          'Roll Number*': '102',
          'Admission Number*': 'ADM-702',
          'Student Name*': 'Bilal Tariq',
          'Father Name': 'Tariq Mehmood',
          'Class (Class 7/8/9)*': 'Class 7',
          'Section (A/B)*': 'A',
          'Phone Number': '03007654321',
          'Date of Birth (YYYY-MM-DD)': '2012-08-20',
          'Status (Active/Inactive)': 'Active',
          'Remarks': '',
        },
      ];
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 15 },
        { wch: 20 },
        { wch: 24 },
        { wch: 24 },
        { wch: 20 },
        { wch: 16 },
        { wch: 18 },
        { wch: 26 },
        { wch: 24 },
        { wch: 45 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Student Roster');
    } else if (moduleType === 'attendance') {
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
              'Roll Number*': '101',
              'Admission Number': 'ADM-701',
              'Student Name': 'Muhammad Ali',
              'Status (Present/Absent/Leave/Late)*': 'Present',
              'Remarks': '[EXAMPLE ROW - EDIT OR REPLACE WITH YOUR ROSTER]',
            },
            {
              'Date (YYYY-MM-DD)*': targetDate,
              'Class (Class 7/8/9)*': classFilter || 'Class 7',
              'Section': 'A',
              'Roll Number*': '102',
              'Admission Number': 'ADM-702',
              'Student Name': 'Bilal Tariq',
              'Status (Present/Absent/Leave/Late)*': 'Absent',
              'Remarks': 'Informed - fever',
            },
          ];
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 18 },
        { wch: 20 },
        { wch: 10 },
        { wch: 15 },
        { wch: 20 },
        { wch: 24 },
        { wch: 32 },
        { wch: 45 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Attendance');
    } else if (moduleType === 'teaching_logs') {
      const data = [
        {
          'Date (YYYY-MM-DD)*': '2026-10-22',
          'Class (Class 7/8/9)*': 'Class 7',
          'Day': 'Thursday',
          'Subject / Topic*': 'MS Word Document Formatting & Typography',
          'Learning Objectives': 'Understand font styles, sizes, and paragraph alignments',
          'Theory Covered': 'Overview of GUI ribbon and typography settings',
          'Practical Activity': 'Type a 100-word paragraph and apply formatting',
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
        { wch: 20 },
        { wch: 14 },
        { wch: 40 },
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
    } else if (moduleType === 'practical_progress') {
      const data = [
        {
          'Assessment Date (YYYY-MM-DD)*': '2026-10-22',
          'Class (Class 7/8/9)*': 'Class 8',
          'Roll Number*': '101',
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
        { wch: 26 },
        { wch: 20 },
        { wch: 15 },
        { wch: 20 },
        { wch: 24 },
        { wch: 40 },
        { wch: 15 },
        { wch: 32 },
        { wch: 30 },
        { wch: 14 },
        { wch: 22 },
        { wch: 25 },
        { wch: 45 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Practical Tracker');
    } else if (moduleType === 'absentee_followups') {
      const data = [
        {
          'Date of Record (YYYY-MM-DD)*': '2026-10-22',
          'Class (Class 7/8/9)*': 'Class 7',
          'Roll Number*': '102',
          'Admission Number': 'ADM-702',
          'Student Name': 'Bilal Tariq',
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
        { wch: 26 },
        { wch: 20 },
        { wch: 15 },
        { wch: 20 },
        { wch: 24 },
        { wch: 20 },
        { wch: 25 },
        { wch: 25 },
        { wch: 18 },
        { wch: 40 },
        { wch: 28 },
        { wch: 35 },
        { wch: 22 },
        { wch: 45 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Absentee Follow-up');
    }

    return wb;
  }

  /**
   * Generates and downloads clean .xlsx templates with exact keys and labeled example row.
   */
  public static downloadTemplate(
    moduleInput: BulkModuleTypeAlias,
    options?: BulkTemplateOptions
  ): void {
    const moduleType = this.normalizeModuleType(moduleInput);
    const profile = getSchoolProfile();
    const wb = this.generateTemplate(moduleType, options);

    const names: Record<BulkModuleType, string> = {
      students: 'Student_Roster_Template.xlsx',
      attendance: 'Daily_Attendance_Template.xlsx',
      teaching_logs: 'Teaching_Log_Template.xlsx',
      practical_progress: 'Practical_Tracker_Template.xlsx',
      absentee_followups: 'Absentee_Followup_Template.xlsx',
    };

    const classSuffix = options?.classLevel && !options.classLevel.toLowerCase().startsWith('all')
      ? `_${options.classLevel.replace(/\s+/g, '_')}`
      : '';
    const filename = `${profile.emisCode || 'GBHS'}${classSuffix}_${names[moduleType]}`;
    XLSX.writeFile(wb, filename);
  }

  /**
   * Asynchronously fetches the student roster from local IndexedDB and downloads
   * the template pre-populated with real enrolled students.
   */
  public static async downloadTemplateWithRoster(
    moduleInput: BulkModuleTypeAlias,
    options?: BulkTemplateOptions
  ): Promise<void> {
    let students = options?.students;
    if (!students || students.length === 0) {
      try {
        students = await getAllStudents();
      } catch {
        students = [];
      }
    }
    this.downloadTemplate(moduleInput, { ...options, students });
  }

  /**
   * Non-blocking chunked parser that handles large datasets (500+ rows) smoothly without freezing UI.
   */
  public static async parseFile(
    file: File,
    moduleInput: BulkModuleTypeAlias,
    options: BulkParseOptions = {}
  ): Promise<BulkParseResult> {
    const moduleType = this.normalizeModuleType(moduleInput);
    const profile = getSchoolProfile();
    const availableClasses = (profile.classes && profile.classes.length > 0)
      ? profile.classes
      : DEFAULT_CLASSES;

    // 1. Read file asynchronously
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const allSheets = wb.SheetNames;
    if (allSheets.length === 0) {
      throw new Error('Spreadsheet contains no readable sheets.');
    }

    const targetSheetName = options.sheetName && allSheets.includes(options.sheetName)
      ? options.sheetName
      : allSheets[0];

    const ws = wb.Sheets[targetSheetName];
    if (!ws) {
      throw new Error(`Sheet "${targetSheetName}" not found in workbook.`);
    }

    // Convert to JSON objects
    let rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
    let isMatrix = false;
    let matrixDateColumnCount = 0;
    let matrixResult: MatrixUnrollResult | undefined = undefined;

    // Check if attendance sheet is in Monthly Matrix Grid format
    if (moduleType === 'attendance') {
      matrixResult = this.unrollAttendanceMatrixIfApplicable(
        ws,
        file.name,
        targetSheetName,
        options.defaultClass,
        options.attendanceContext
      );
      if (matrixResult.isMatrix) {
        isMatrix = true;
        matrixDateColumnCount = matrixResult.dateColumnCount;
        rawRows = matrixResult.rows;
      }
    }

    const totalRows = rawRows.length;

    // Filter out example rows and completely empty rows
    const nonExampleRows = rawRows.filter((r) => {
      const rowStr = JSON.stringify(r).toUpperCase();
      if (rowStr.includes('EXAMPLE ROW') || rowStr.includes('EDIT OR REPLACE')) {
        return false;
      }
      return Object.values(r).some(
        (v) => v !== null && v !== undefined && String(v).trim() !== ''
      );
    });

    // Build context-aware metadata for attendance module
    let attendanceContext: AttendanceStatusContext | undefined = undefined;
    if (moduleType === 'attendance') {
      const detectedTokens = new Set<string>();
      for (const r of nonExampleRows) {
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
        if (ws && ws['!ref']) {
          const range = XLSX.utils.decode_range(ws['!ref']);
          const maxR = Math.min(range.e.r, 15);
          for (let R = range.s.r; R <= maxR; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
              const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
              const cell = ws[cellAddress];
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
        hasHolyDay: matrixResult?.hasHolyDay,
        ...(matrixResult?.hasHolyDay ? { templateFormat: 'holy_day_matrix', lMeaning: 'Leave' } : {}),
        ...(options.attendanceContext || {}),
      };
    }

    // 2. Pre-fetch DB entities and build O(1) indexed lookup maps
    const [existingStudents, existingAttendance, existingTeaching, existingPractical, existingAbsentee] =
      await Promise.all([
        getAllStudents(),
        getAllAttendanceRecords(),
        getAllTeachingLogs(),
        getAllPracticalProgress(),
        getAllAbsenteeFollowups(),
      ]);

    const admissionMap = new Map<string, Student>();
    const rollClassMap = new Map<string, Student>();
    const nameClassMap = new Map<string, Student>();

    for (const stu of existingStudents) {
      if (stu.admissionNo) {
        admissionMap.set(stu.admissionNo.toLowerCase().trim(), stu);
      }
      if (stu.rollNo && stu.class) {
        const cleanRoll = stu.rollNo.trim();
        const cleanClass = stu.class.trim().toLowerCase();
        const normClass = (this.normalizeClass(stu.class, availableClasses) || stu.class).trim().toLowerCase();
        rollClassMap.set(`${cleanRoll}_${cleanClass}`.toLowerCase(), stu);
        rollClassMap.set(`${cleanRoll}_${normClass}`.toLowerCase(), stu);
        const intRoll = parseInt(cleanRoll, 10);
        if (!isNaN(intRoll)) {
          rollClassMap.set(`${intRoll}_${cleanClass}`.toLowerCase(), stu);
          rollClassMap.set(`${intRoll}_${normClass}`.toLowerCase(), stu);
        }
      }
      if (stu.name && stu.class) {
        const cleanClass = stu.class.trim().toLowerCase();
        const normClass = (this.normalizeClass(stu.class, availableClasses) || stu.class).trim().toLowerCase();
        nameClassMap.set(`${stu.name.trim()}_${cleanClass}`.toLowerCase(), stu);
        nameClassMap.set(`${stu.name.trim()}_${normClass}`.toLowerCase(), stu);
      }
    }

    // Pre-indexed existing records maps for duplicate detection
    const attendanceKeySet = new Set(existingAttendance.map((a) => `${a.studentId}_${a.date}`));
    const teachingKeySet = new Set(existingTeaching.map((t) => `${t.date}_${t.class}_${(t.subjectTopic || '').toLowerCase().trim()}`));
    const practicalKeySet = new Set(existingPractical.map((p) => `${p.studentId}_${(p.skillTask || '').toLowerCase().trim()}_${p.assessmentDate}`));
    const absenteeKeySet = new Set(existingAbsentee.map((a) => `${a.studentId}_${a.date}`));

    const validRows: BulkImportRowValidation[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;
    let unmatchedCount = 0;

    // 3. Process rows with non-blocking microtask yields every 50 rows
    for (let i = 0; i < nonExampleRows.length; i++) {
      if (i > 0 && i % 50 === 0) {
        // Yield to browser main thread so UI stays 100% fluid
        await new Promise((r) => setTimeout(r, 0));
        if (options.onProgress) {
          options.onProgress(i, nonExampleRows.length);
        }
      }

      const raw = nonExampleRows[i];
      const normalizedRow: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) {
        const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        normalizedRow[cleanKey] = v;
        normalizedRow[k.toLowerCase().trim()] = v;
        normalizedRow[k] = v;
      }

      const errors: string[] = [];
      const warnings: string[] = [];
      let isDuplicate = false;
      let matchedStudent: Student | undefined = undefined;
      let resolvedDate: string | null = null;
      let entity: any = undefined;
      let autoEnrollStudent: Student | undefined = undefined;

      // Extract general class & section with flexible aliases
      const classInput =
        normalizedRow.class ||
        normalizedRow.classlevel ||
        normalizedRow.classclass789 ||
        normalizedRow.grade ||
        normalizedRow.standard ||
        normalizedRow.classgrade ||
        normalizedRow['class (class 7/8/9)*'] ||
        normalizedRow['class (class 7/8/9)'] ||
        normalizedRow['class'] ||
        normalizedRow['grade'] ||
        options.defaultClass;
      const classVal = this.normalizeClass(classInput, availableClasses) || (options.defaultClass ? this.normalizeClass(options.defaultClass, availableClasses) : null);
      if (!classVal) {
        errors.push(`Valid Class (Class 1 to Class 10) is required (received "${classInput || 'None'}")`);
      }
      const sectionVal = this.normalizeSection(
        normalizedRow.section || normalizedRow.sectionab || normalizedRow['section (a/b)*']
      );

      // --- MODULE-SPECIFIC PARSING ---
      if (moduleType === 'students') {
        const rollNo = String(
          normalizedRow.rollnumber ||
          normalizedRow.rollno ||
          normalizedRow.roll ||
          normalizedRow['roll number*'] ||
          normalizedRow['roll no*'] ||
          ''
        ).trim();
        const admissionNo = String(
          normalizedRow.admissionnumber ||
          normalizedRow.admissionno ||
          normalizedRow.admno ||
          normalizedRow['admission number*'] ||
          normalizedRow['admission no'] ||
          ''
        ).trim();
        const name = String(
          normalizedRow.studentname ||
          normalizedRow.name ||
          normalizedRow['student name*'] ||
          normalizedRow['student name'] ||
          ''
        ).trim();
        const fatherName = String(
          normalizedRow.fathername ||
          normalizedRow.father ||
          normalizedRow['father name'] ||
          ''
        ).trim();
        const phone = String(
          normalizedRow.phonenumber ||
          normalizedRow.phone ||
          normalizedRow.contact ||
          normalizedRow['phone number'] ||
          ''
        ).trim();
        const dobRaw =
          normalizedRow.dateofbirth ||
          normalizedRow.dob ||
          normalizedRow.dateofbirthyyyymmdd ||
          normalizedRow['date of birth (yyyy-mm-dd)'] ||
          normalizedRow['date of birth'];
        const dob = this.parseExcelDate(dobRaw);
        const rawStatus = String(
          normalizedRow.status ||
          normalizedRow.statusactiveinactive ||
          normalizedRow['status (active/inactive)'] ||
          ''
        ).toLowerCase();
        let statusVal: StudentStatus = 'Active';
        if (rawStatus.includes('withdr') || rawStatus.includes('drop') || rawStatus.includes('left')) {
          statusVal = 'Withdrawn';
        } else if (rawStatus.includes('transf')) {
          statusVal = 'Transferred';
        } else if (rawStatus.includes('inact') || rawStatus.includes('unreg')) {
          statusVal = 'Inactive';
        }

        if (!name) errors.push('Student Name is required');
        if (!rollNo && !admissionNo) errors.push('Either Roll Number or Admission Number is required');

        // Check duplicate in existing roster
        if (admissionNo && admissionMap.has(admissionNo.toLowerCase())) {
          isDuplicate = true;
          matchedStudent = admissionMap.get(admissionNo.toLowerCase());
          warnings.push(`Student with Admission No ${admissionNo} already exists`);
        } else if (rollNo && classVal && rollClassMap.has(`${rollNo}_${classVal}`.toLowerCase())) {
          isDuplicate = true;
          matchedStudent = rollClassMap.get(`${rollNo}_${classVal}`.toLowerCase());
          warnings.push(`Student with Roll No ${rollNo} in ${classVal} already exists`);
        }

        entity = {
          id: matchedStudent?.id || crypto.randomUUID(),
          rollNo,
          admissionNo: admissionNo || `ADM-${rollNo}`,
          name,
          fatherName,
          class: (classVal || (classInput ? String(classInput).trim() : '')) as ClassLevel,
          section: sectionVal,
          phone,
          dateOfBirth: dob || undefined,
          status: statusVal,
          schoolId: profile.emisCode || 'GBHS-MAIN',
          createdBy: 'bulk-import-operator',
          version: (matchedStudent?.version || 0) + 1,
          createdAt: matchedStudent?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Student;
      } else if (moduleType === 'attendance') {
        if (normalizedRow._matrixError) {
          errors.push(normalizedRow._matrixError);
        }

        const rawDate =
          normalizedRow.date ||
          normalizedRow.dateyyyymmdd ||
          normalizedRow.attendancedate ||
          normalizedRow.attdate ||
          normalizedRow.dateofattendance ||
          normalizedRow['date (yyyy-mm-dd)*'] ||
          normalizedRow['date (yyyy-mm-dd)'] ||
          normalizedRow['attendance date'] ||
          normalizedRow['date'];
        resolvedDate = this.parseExcelDate(rawDate);
        if (!resolvedDate) errors.push('Valid Date (YYYY-MM-DD or DD/MM/YYYY) is required');

        matchedStudent = this.resolveStudent(normalizedRow, classVal, admissionMap, rollClassMap, nameClassMap);
        autoEnrollStudent = undefined;

        if (!matchedStudent) {
          const rowName = String(
            normalizedRow.studentname ||
            normalizedRow.name ||
            normalizedRow.nameoflearner ||
            normalizedRow.learnername ||
            normalizedRow['student name*'] ||
            normalizedRow['student name'] ||
            normalizedRow['name of learner'] ||
            normalizedRow['name'] ||
            ''
          ).trim();
          const rowRoll = String(
            normalizedRow.rollnumber ||
            normalizedRow.rollno ||
            normalizedRow.roll ||
            normalizedRow['roll number*'] ||
            normalizedRow['roll number'] ||
            normalizedRow['roll no*'] ||
            normalizedRow['roll no'] ||
            normalizedRow['roll'] ||
            ''
          ).trim();
          const rowAdm = String(
            normalizedRow.admissionnumber ||
            normalizedRow.admissionno ||
            normalizedRow.admno ||
            normalizedRow.regno ||
            normalizedRow.grno ||
            normalizedRow['admission number*'] ||
            normalizedRow['admission number'] ||
            normalizedRow['admission no'] ||
            normalizedRow['adm no'] ||
            ''
          ).trim();

          if (options.autoEnrollMissingStudents === true && (rowName || rowAdm)) {
            const autoId = crypto.randomUUID();
            autoEnrollStudent = {
              id: autoId,
              rollNo: rowRoll || '1',
              admissionNo: rowAdm || `ADM-${(classVal || '').replace(/\D/g, '') || '0'}-${rowRoll || '1'}`,
              name: rowName || `Student ${rowRoll || '1'}`,
              fatherName: String(normalizedRow.fathername || normalizedRow.father || '').trim(),
              class: (classVal || 'Class 1') as ClassLevel,
              section: sectionVal,
              phone: String(normalizedRow.phone || normalizedRow.contact || '').trim(),
              status: 'Active',
              version: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              schoolId: profile.emisCode || 'GBHS-MAIN',
              createdBy: 'auto_enroll_attendance',
            } as Student;

            matchedStudent = autoEnrollStudent;
            if (autoEnrollStudent.admissionNo) admissionMap.set(autoEnrollStudent.admissionNo.toLowerCase(), autoEnrollStudent);
            if (autoEnrollStudent.rollNo && autoEnrollStudent.class) rollClassMap.set(`${autoEnrollStudent.rollNo}_${autoEnrollStudent.class}`.toLowerCase(), autoEnrollStudent);
            if (autoEnrollStudent.name && autoEnrollStudent.class) nameClassMap.set(`${autoEnrollStudent.name}_${autoEnrollStudent.class}`.toLowerCase(), autoEnrollStudent);
            warnings.push(`Auto-enrolling new student: ${autoEnrollStudent.name} into ${classVal} (Roll: ${autoEnrollStudent.rollNo})`);
          } else {
            errors.push('Student not found in active roster (Roll No / Admission No does not match any student)');
          }
        }

        const rawStatus =
          normalizedRow.status ||
          normalizedRow.attendancestatus ||
          normalizedRow.attstatus ||
          normalizedRow.attendance ||
          normalizedRow.statuspresentabsentleavelate ||
          normalizedRow.presence ||
          normalizedRow.hazri ||
          normalizedRow['status (present/absent/leave/late)*'] ||
          normalizedRow['attendance status'] ||
          normalizedRow['attendance'] ||
          normalizedRow['status'];
        const statusResult = this.parseAttendanceStatusWithDetails(rawStatus, attendanceContext);
        if (statusResult.isHoliday) {
          // Non-attendance holiday marker (e.g. H / Holy Day) - skip creating record cleanly
          continue;
        }
        const status = statusResult.status;
        if (!status) {
          if (statusResult.isAmbiguous) {
            errors.push(statusResult.error || 'Ambiguous attendance code "L". Please clarify whether it represents Late or Leave.');
          } else {
            errors.push('Valid Status (Present, Absent, Leave, Late) is required');
          }
        }

        if (matchedStudent && resolvedDate) {
          // Check student enrollment window
          const enrollmentValidation = validateAttendanceEnrollmentDate(matchedStudent, resolvedDate);
          if (enrollmentValidation.isOutsideEnrollment) {
            if (options.allowHistoricalBackfill) {
              warnings.push(`[Historical Backfill Warning] ${enrollmentValidation.message}`);
            } else {
              errors.push(`Enrollment Period Mismatch: ${enrollmentValidation.message} (Enable Historical Backfill option to import).`);
            }
          } else if (matchedStudent.status !== 'Active') {
            warnings.push(`[Historical Backfill] ${enrollmentValidation.message || `${matchedStudent.name} is currently ${matchedStudent.status}, but was enrolled on ${resolvedDate}. Record accepted.`}`);
          }

          if (attendanceKeySet.has(`${matchedStudent.id}_${resolvedDate}`)) {
            isDuplicate = true;
            warnings.push(`Attendance already recorded for ${matchedStudent.name} on ${resolvedDate}`);
          }

          entity = {
            id: `${matchedStudent.id}_${resolvedDate}`,
            studentId: matchedStudent.id,
            studentName: matchedStudent.name,
            rollNo: matchedStudent.rollNo || '',
            date: resolvedDate,
            class: matchedStudent.class,
            section: matchedStudent.section,
            status: status || 'Present',
            remarks: String(normalizedRow.remarks || '').trim() || undefined,
            schoolId: profile.emisCode || 'GBHS-MAIN',
            markedBy: 'bulk-import-operator',
            version: 1,
            updatedAt: new Date().toISOString(),
            _autoEnrollStudent: autoEnrollStudent,
          } as AttendanceRecord & { _autoEnrollStudent?: Student };
        }
      } else if (moduleType === 'teaching_logs') {
        const rawDate =
          normalizedRow.date ||
          normalizedRow.dateyyyymmdd ||
          normalizedRow.teachingdate ||
          normalizedRow['date (yyyy-mm-dd)*'] ||
          normalizedRow['date'];
        resolvedDate = this.parseExcelDate(rawDate);
        if (!resolvedDate) errors.push('Valid Date (YYYY-MM-DD) is required');

        const topic = String(
          normalizedRow.subjecttopic ||
          normalizedRow.topic ||
          normalizedRow.subject ||
          normalizedRow['subject / topic*'] ||
          normalizedRow['subject/topic'] ||
          ''
        ).trim();
        if (!topic) errors.push('Subject / Topic is required');

        if (resolvedDate && topic) {
          const key = `${resolvedDate}_${classVal}_${topic.toLowerCase()}`;
          if (teachingKeySet.has(key)) {
            isDuplicate = true;
            warnings.push(`Teaching log for ${topic} on ${resolvedDate} already exists`);
          }

          entity = {
            id: crypto.randomUUID(),
            date: resolvedDate,
            day: String(normalizedRow.day || '').trim() || 'Scheduled Day',
            class: classVal,
            subjectTopic: topic,
            learningObjectives: String(
              normalizedRow.learningobjectives || normalizedRow['learning objectives'] || ''
            ).trim(),
            theoryCovered: String(
              normalizedRow.theorycovered || normalizedRow['theory covered'] || ''
            ).trim(),
            practicalActivity: String(
              normalizedRow.practicalactivity || normalizedRow['practical activity'] || ''
            ).trim(),
            totalRegistered: existingStudents.filter((s) => s.class === classVal).length,
            studentsPresent: parseInt(normalizedRow.studentspresent || normalizedRow['students present'], 10) || 0,
            studentsCompletingTask: parseInt(
              normalizedRow.studentscompletingtask || normalizedRow['students completing task'],
              10
            ) || 0,
            studentsNeedingHelp: parseInt(
              normalizedRow.studentsneedinghelp || normalizedRow['students needing help'],
              10
            ) || 0,
            teachingMethod: String(
              normalizedRow.teachingmethod || normalizedRow['teaching method'] || ''
            ).trim() || 'Demonstration & Hands-on Lab',
            issueChallenge: String(
              normalizedRow.issueschallenges ||
              normalizedRow.issuechallenge ||
              normalizedRow['issues / challenges'] ||
              ''
            ).trim() || undefined,
            nextLesson: String(
              normalizedRow.nextlessonplan || normalizedRow['next lesson plan'] || ''
            ).trim() || undefined,
            instructorName: String(
              normalizedRow.instructorname || normalizedRow['instructor name'] || ''
            ).trim() || profile.principalName || 'Lead Instructor',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TeachingLogEntry;
        }
      } else if (moduleType === 'practical_progress') {
        const rawDate =
          normalizedRow.assessmentdate ||
          normalizedRow.assessmentdateyyyymmdd ||
          normalizedRow.date ||
          normalizedRow.dateyyyymmdd ||
          normalizedRow['assessment date (yyyy-mm-dd)*'] ||
          normalizedRow['assessment date'];
        resolvedDate = this.parseExcelDate(rawDate);
        if (!resolvedDate) errors.push('Valid Assessment Date (YYYY-MM-DD) is required');

        matchedStudent = this.resolveStudent(normalizedRow, classVal, admissionMap, rollClassMap, nameClassMap);
        if (!matchedStudent) {
          errors.push('Student not found in active roster');
        }

        const taskName = String(
          normalizedRow.practicaltaskskill ||
          normalizedRow['practical task / skill*'] ||
          normalizedRow.skilltask ||
          normalizedRow.taskname ||
          normalizedRow.skill ||
          ''
        ).trim();
        if (!taskName) errors.push('Practical Task / Skill is required');

        const rawScore =
          normalizedRow.score !== undefined && normalizedRow.score !== ''
            ? normalizedRow.score
            : normalizedRow.score0100 !== undefined && normalizedRow.score0100 !== ''
            ? normalizedRow.score0100
            : normalizedRow['score (0-100)'];

        const rawCompleted =
          normalizedRow.practicalcompletedyesnoinprogress ||
          normalizedRow['practical completed (yes/no/in progress)*'] ||
          normalizedRow.practicalcompletedyesno ||
          normalizedRow['practical completed? (yes/no)'] ||
          normalizedRow.practicalcompleted;

        const rawSkillStatus =
          normalizedRow.skillstatusproficientcompetentneedsimprovementnotstarted ||
          normalizedRow['skill status (proficient/competent/needs improvement/not started)*'] ||
          normalizedRow['skill status (proficient/competent/developing/beginning)'] ||
          normalizedRow.skillstatus;

        if (matchedStudent && resolvedDate && taskName) {
          const key = `${matchedStudent.id}_${taskName.toLowerCase()}_${resolvedDate}`;
          if (practicalKeySet.has(key)) {
            isDuplicate = true;
            warnings.push(`Evaluation for ${matchedStudent.name} on ${taskName} already exists`);
          }

          entity = {
            id: crypto.randomUUID(),
            assessmentDate: resolvedDate,
            studentId: matchedStudent.id,
            registrationId: matchedStudent.rollNo || matchedStudent.admissionNo,
            studentName: matchedStudent.name,
            class: matchedStudent.class,
            skillTask: taskName,
            attemptNumber: parseInt(normalizedRow.attemptnumber || normalizedRow['attempt number'], 10) || 1,
            practicalCompleted: this.normalizePracticalCompleted(rawCompleted),
            scoreMarks: rawScore !== undefined && rawScore !== '' ? parseInt(rawScore, 10) : 80,
            skillStatus: this.normalizeSkillStatus(rawSkillStatus),
            weakArea: String(normalizedRow.weakarea || normalizedRow['weak area'] || '').trim() || undefined,
            remedialPracticeRequired: String(
              normalizedRow.remedialpracticerequired || normalizedRow['remedial practice required (yes/no)'] || ''
            ).toLowerCase().includes('yes') ? 'Yes' : 'No',
            instructorRemarks: String(normalizedRow.remarks || '').trim() || undefined,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as PracticalProgressEntry;
        }
      } else if (moduleType === 'absentee_followups') {
        const rawDate =
          normalizedRow.dateofrecord ||
          normalizedRow.dateofrecordyyyymmdd ||
          normalizedRow.date ||
          normalizedRow.dateyyyymmdd ||
          normalizedRow['date of record (yyyy-mm-dd)*'] ||
          normalizedRow['date of record'];
        resolvedDate = this.parseExcelDate(rawDate);
        if (!resolvedDate) errors.push('Valid Date of Record (YYYY-MM-DD) is required');

        matchedStudent = this.resolveStudent(normalizedRow, classVal, admissionMap, rollClassMap, nameClassMap);
        if (!matchedStudent) {
          errors.push('Student not found in active roster');
        }

        const reason = String(
          normalizedRow.followupreason ||
          normalizedRow['follow-up reason*'] ||
          normalizedRow.reason ||
          ''
        ).trim();
        if (!reason) errors.push('Follow-up Reason is required');

        const actionTaken = String(
          normalizedRow.actiontaken ||
          normalizedRow['action taken*'] ||
          normalizedRow.action ||
          ''
        ).trim();
        if (!actionTaken) errors.push('Action Taken is required');

        const expectedReturnRaw =
          normalizedRow.expectedreturndate ||
          normalizedRow.expectedreturndateyyyymmdd ||
          normalizedRow['expected return date (yyyy-mm-dd)'];
        const expectedReturn = this.parseExcelDate(expectedReturnRaw) || undefined;

        const rawFollowupStatus =
          normalizedRow.currentstatuspendingreturnresolvedreturnedescalatedprolongedleave ||
          normalizedRow['current status (pending return/resolved / returned/escalated/prolonged leave)*'] ||
          normalizedRow['status (pending return/resolved/escalated)'] ||
          normalizedRow.currentstatus ||
          normalizedRow.status;

        if (matchedStudent && resolvedDate) {
          const key = `${matchedStudent.id}_${resolvedDate}`;
          if (absenteeKeySet.has(key)) {
            isDuplicate = true;
            warnings.push(`Follow-up record for ${matchedStudent.name} on ${resolvedDate} already exists`);
          }

          entity = {
            id: crypto.randomUUID(),
            date: resolvedDate,
            studentId: matchedStudent.id,
            registrationId: matchedStudent.rollNo || matchedStudent.admissionNo,
            studentName: matchedStudent.name,
            class: matchedStudent.class,
            absenceCount: parseInt(
              normalizedRow.consecutiveabsences || normalizedRow['consecutive absences'] || '1',
              10
            ) || 1,
            followupReason: reason,
            actionTaken,
            contactPerson: String(
              normalizedRow.contactperson || normalizedRow['contact person'] || ''
            ).trim() || 'Guardian',
            responseReceived: String(
              normalizedRow.responsereceived || normalizedRow['response received'] || ''
            ).trim(),
            expectedReturnDate: expectedReturn,
            followupDate: resolvedDate,
            currentStatus: this.normalizeFollowupStatus(rawFollowupStatus),
            managementReferral: String(
              normalizedRow.managementreferral || normalizedRow['management referral (yes/no)'] || ''
            ).toLowerCase().includes('yes') ? 'Yes' : 'No',
            remarks: String(normalizedRow.remarks || '').trim() || undefined,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as AbsenteeFollowupEntry;
        }
      }

      // Determine Row Status
      let status: 'valid' | 'duplicate' | 'unmatched' | 'invalid' = 'valid';
      if (errors.length > 0) {
        const hasDataErrors = errors.some((e) => !e.includes('Student not found'));
        if (!hasDataErrors && errors.some((e) => e.includes('Student not found'))) {
          status = 'unmatched';
          unmatchedCount++;
        } else {
          status = 'invalid';
          invalidCount++;
        }
      } else if (isDuplicate) {
        status = 'duplicate';
        duplicateCount++;
      } else {
        status = 'valid';
        validCount++;
      }

      // Consolidate validation notes for UI preview
      let validationNotes = '';
      if (errors.length > 0) {
        validationNotes = `Error: ${errors.join('; ')}`;
      } else if (autoEnrollStudent) {
        validationNotes = `Auto-Enroll: ${autoEnrollStudent.name} (Roll ${autoEnrollStudent.rollNo}) will be enrolled in ${autoEnrollStudent.class}`;
      } else if (isDuplicate) {
        validationNotes = `Duplicate: ${warnings.join('; ')}`;
      } else if (warnings.length > 0) {
        validationNotes = matchedStudent
          ? `Matched: ${matchedStudent.name} (Roll ${matchedStudent.rollNo || 'N/A'}, ${matchedStudent.class}) — ${warnings.join('; ')}`
          : warnings.join('; ');
      } else if (matchedStudent) {
        validationNotes = `Matched: ${matchedStudent.name} (Roll ${matchedStudent.rollNo || 'N/A'}, ${matchedStudent.class})`;
      } else if (resolvedDate) {
        validationNotes = `Valid date: ${resolvedDate}`;
      } else {
        validationNotes = 'Ready for import';
      }

      validRows.push({
        rowIndex: i + 1,
        data: raw,
        status,
        isValid: errors.length === 0,
        isDuplicate,
        errors,
        warnings,
        validationNotes,
        matchedStudent,
        resolvedDate,
        duplicateAction: options.duplicateStrategy || 'skip',
        entity,
      });
    }

    return {
      moduleType,
      fileName: file.name,
      sheetName: targetSheetName,
      allSheets,
      totalRows: nonExampleRows.length,
      validRows,
      validCount,
      invalidCount,
      duplicateCount,
      unmatchedCount,
      isMatrix,
      matrixDateColumnCount,
      calendarConflict: matrixResult?.calendarConflict,
    };
  }

  /**
   * Commits approved rows instantly to IndexedDB and enqueues Outbox operations for Supabase sync.
   * Dispatches zero-refresh custom events so UI tables & counters update immediately!
   */
  public static async commit(
    moduleInput: BulkModuleTypeAlias,
    rows: BulkImportRowValidation[],
    options: BulkCommitOptions = {}
  ): Promise<BulkCommitResult> {
    const moduleType = this.normalizeModuleType(moduleInput);
    const sessionUser = syncEngine.getSession()?.user;
    if (sessionUser) {
      const permissions = getWorkspacePermissions(sessionUser);
      if (permissions.isReadOnly) {
        throw new Error('Permission denied: Read-only accounts cannot import records.');
      }
    }

    const userEmail = options.userEmail || sessionUser?.email || 'operator@gbhs.edu.pk';
    const strategy = options.duplicateStrategy || 'skip';

    const result: BulkCommitResult = {
      success: true,
      moduleType,
      totalProcessed: rows.length,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      unmatchedCount: 0,
      invalidCount: 0,
      failedCount: 0,
      errors: [],
    };

    const outboxBatch: OutboxOperation[] = [];

    // Filter rows eligible for commit
    const eligibleRows = rows.filter((r) => {
      if (!r.isValid || !r.entity) {
        if (r.status === 'unmatched') result.unmatchedCount++;
        else result.invalidCount++;
        return false;
      }
      if (r.isDuplicate && strategy === 'skip') {
        result.skippedCount++;
        return false;
      }
      return true;
    });

    if (eligibleRows.length === 0) {
      return result;
    }

    // Persist any auto-enrolled missing students first so foreign key references match
    const autoStudents: Student[] = [];
    const seenAutoIds = new Set<string>();
    for (const r of eligibleRows) {
      const autoStu = (r.entity as any)?._autoEnrollStudent as Student | undefined;
      if (autoStu && !seenAutoIds.has(autoStu.id)) {
        seenAutoIds.add(autoStu.id);
        autoStudents.push(autoStu);
      }
    }
    if (autoStudents.length > 0) {
      await bulkSaveStudentsLocally(autoStudents);
      for (const stu of autoStudents) {
        outboxBatch.push({
          opId: crypto.randomUUID(),
          operationType: 'CREATE',
          entityType: 'student',
          entityId: stu.id,
          payload: stu,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: 1,
        });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gbhs_students_changed'));
      }
    }

    // --- EXECUTE PERSISTENCE PER MODULE ---
    if (moduleType === 'students') {
      const entities: Student[] = eligibleRows.map((r) => r.entity as Student);
      await bulkSaveStudentsLocally(entities);

      for (const stu of entities) {
        const isUp = eligibleRows.find((r) => r.entity.id === stu.id)?.isDuplicate;
        if (isUp) result.updatedCount++;
        else result.createdCount++;

        outboxBatch.push({
          opId: crypto.randomUUID(),
          operationType: isUp ? 'UPDATE' : 'CREATE',
          entityType: 'student',
          entityId: stu.id,
          payload: stu,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: stu.version || 1,
        });
      }
    } else if (moduleType === 'attendance') {
      const entities: AttendanceRecord[] = eligibleRows.map((r) => r.entity as AttendanceRecord);
      await bulkSaveAttendanceLocally(entities);

      for (const att of entities) {
        const isUp = eligibleRows.find((r) => r.entity.id === att.id)?.isDuplicate;
        if (isUp) result.updatedCount++;
        else result.createdCount++;

        outboxBatch.push({
          opId: crypto.randomUUID(),
          operationType: isUp ? 'UPDATE' : 'CREATE',
          entityType: 'attendance',
          entityId: att.id,
          payload: att,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: att.version || 1,
        });
      }
    } else if (moduleType === 'teaching_logs') {
      const entities: TeachingLogEntry[] = eligibleRows.map((r) => r.entity as TeachingLogEntry);
      await bulkSaveTeachingLogsLocally(entities);

      for (const log of entities) {
        result.createdCount++;
        outboxBatch.push({
          opId: crypto.randomUUID(),
          operationType: 'CREATE',
          entityType: 'teaching_log',
          entityId: log.id,
          payload: log,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: log.version || 1,
        });
      }
    } else if (moduleType === 'practical_progress') {
      const entities: PracticalProgressEntry[] = eligibleRows.map((r) => r.entity as PracticalProgressEntry);
      await bulkSavePracticalProgressLocally(entities);

      for (const prac of entities) {
        result.createdCount++;
        outboxBatch.push({
          opId: crypto.randomUUID(),
          operationType: 'CREATE',
          entityType: 'practical_progress',
          entityId: prac.id,
          payload: prac,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: prac.version || 1,
        });
      }
    } else if (moduleType === 'absentee_followups') {
      const entities: AbsenteeFollowupEntry[] = eligibleRows.map((r) => r.entity as AbsenteeFollowupEntry);
      await bulkSaveAbsenteeFollowupsLocally(entities);

      for (const abs of entities) {
        result.createdCount++;
        outboxBatch.push({
          opId: crypto.randomUUID(),
          operationType: 'CREATE',
          entityType: 'absentee_followup',
          entityId: abs.id,
          payload: abs,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: abs.version || 1,
        });
      }
    }

    // Enqueue Outbox batch
    for (const op of outboxBatch) {
      await enqueueOutboxOperation(op);
    }

    // Trigger Cloud Sync in background
    syncEngine.processQueue().catch((err) => {
      console.warn('[BulkOperationsService] Background sync non-blocking error:', err);
    });

    // -------------------------------------------------------------
    // ZERO-REFRESH REACTIVITY TRIGGER
    // -------------------------------------------------------------
    if (typeof window !== 'undefined') {
      // 1. Module-specific record imported event
      window.dispatchEvent(
        new CustomEvent('gbhs_records_imported', {
          detail: {
            moduleType,
            count: result.createdCount + result.updatedCount,
            timestamp: Date.now(),
          },
        })
      );

      // 2. Specific domain events for all mounted components
      if (moduleType === 'students') {
        window.dispatchEvent(new CustomEvent('gbhs_students_changed'));
      } else if (moduleType === 'attendance') {
        window.dispatchEvent(new CustomEvent('gbhs_attendance_changed'));
      } else if (moduleType === 'teaching_logs') {
        window.dispatchEvent(new CustomEvent('gbhs_teaching_changed'));
      } else if (moduleType === 'practical_progress') {
        window.dispatchEvent(new CustomEvent('gbhs_practical_changed'));
      } else if (moduleType === 'absentee_followups') {
        window.dispatchEvent(new CustomEvent('gbhs_absentee_changed'));
      }

      // 3. General dashboard reload notification
      window.dispatchEvent(new CustomEvent('gbhs_dashboard_refresh'));
    }

    return result;
  }
}
