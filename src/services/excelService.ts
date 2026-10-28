import * as XLSX from 'xlsx';
import { ClassLevel, Section, Student, StudentImportRow, StudentStatus, AttendanceRecord } from '../types/student';
import {
  getAllStudents,
  getAllAttendanceRecords,
  getStudentById,
  findStudentByAdmissionNo,
  bulkSaveStudentsLocally,
  clearStudentsByClassLocally,
  enqueueOutboxOperation,
  setAppState,
} from './db';
import { OutboxOperation } from '../types/sync';
import { syncEngine } from './syncEngine';
import { getWorkspacePermissions } from './permissionService';
import { getSchoolProfile } from './schoolProfileService';
import { normalizeClass, CANONICAL_CLASSES, isCanonicalClass } from './classNormalizationService';

export { normalizeClass, CANONICAL_CLASSES, isCanonicalClass };

const DEFAULT_SCHOOL_ID = 'GBHS-MAIN';

// -------------------------------------------------------------
// DIAGNOSTIC LOGGING INTERFACES & STORE
// -------------------------------------------------------------

export interface DiagnosticLog {
  stage: 'DETECT' | 'PARSE' | 'VALIDATE' | 'EXCLUDE' | 'LOCAL_SAVE' | 'CLOUD_SYNC';
  message: string;
  count?: number;
  details?: Record<string, any>;
  timestamp: string;
}

const diagnosticLogStore: DiagnosticLog[] = [];

export function addDiagnosticLog(
  stage: DiagnosticLog['stage'],
  message: string,
  count?: number,
  details?: Record<string, any>
): DiagnosticLog {
  const log: DiagnosticLog = {
    stage,
    message,
    count,
    details,
    timestamp: new Date().toLocaleTimeString(),
  };
  diagnosticLogStore.push(log);
  // Keep last 100 logs
  if (diagnosticLogStore.length > 100) {
    diagnosticLogStore.shift();
  }
  // Safe console diagnostic log without student PII
  console.log(`[Import Diagnostic] [${stage}] ${message}${count !== undefined ? ` (Count: ${count})` : ''}`);
  return log;
}

export function getDiagnosticLogs(): DiagnosticLog[] {
  return [...diagnosticLogStore];
}

export function clearDiagnosticLogs(): void {
  diagnosticLogStore.length = 0;
}

// -------------------------------------------------------------
// CANONICAL FIELD DEFINITIONS & COMPREHENSIVE ALIASES
// -------------------------------------------------------------

export interface CanonicalFieldDef {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const CANONICAL_STUDENT_FIELDS: CanonicalFieldDef[] = [
  { key: 'name', label: 'Student Name (Name of Learner)', required: true, description: 'Learner full name' },
  { key: 'fatherName', label: "Father's Name (Walid)", required: false, description: "Father's name" },
  { key: 'class', label: 'Class / Grade', required: false, description: 'Class level (Class 1 to 10)' },
  { key: 'rollNo', label: 'Roll Number (Roll Num)', required: false, description: 'Class roll number' },
  { key: 'admissionNo', label: 'Admission / Reg / GR No', required: false, description: 'Official admission or register ID' },
  { key: 'section', label: 'Section (A, B, C)', required: false, description: 'Class section' },
  { key: 'guardianContact', label: 'Guardian Contact / Phone', required: false, description: 'Mobile or emergency contact' },
  { key: 'gender', label: 'Gender (Male / Female)', required: false, description: 'Student gender' },
  { key: 'dob', label: 'Date of Birth (DOB)', required: false, description: 'Date of birth' },
  { key: 'dateOfCenterBeginning', label: 'Date of Center Beginning', required: false, description: 'Admission or center start date' },
  { key: 'registeredStatus', label: 'Registered Status', required: false, description: 'Registerd or Unregisterd' },
  { key: 'district', label: 'District', required: false, description: 'District name (e.g. Lasbela)' },
  { key: 'schoolName', label: 'School Name', required: false, description: 'Center / School name' },
  { key: 'trade', label: 'Trade / Course', required: false, description: 'Vocational trade (e.g. Computer Operator)' },
  { key: 'bFormNo', label: 'B-Form / CNIC', required: false, description: 'Child B-Form or CNIC' },
  { key: 'fatherCnic', label: 'Father CNIC', required: false, description: "Father's CNIC number" },
  { key: 'address', label: 'Present Address', required: false, description: 'Residential address' },
  { key: 'serialNo', label: 'S# / Serial Number', required: false, description: 'Register sequence number' },
  { key: 'remarks', label: 'Remarks / Notes', required: false, description: 'Additional notes' },
];

export const FIELD_ALIASES: Record<string, string[]> = {
  name: [
    'nameoflearner',
    'learnername',
    'studentname',
    'nameofstudent',
    'studentsname',
    'candidatename',
    'studentfullname',
    'fullname',
    'talibilm',
    'talibeilm',
    'طالبعلمکانام',
    'نامطالبعلم',
    'طالبعلم',
    'نام',
    'naam',
    'student',
    'learner',
    'name',
  ],
  fatherName: [
    'fathername',
    'fathersname',
    'fname',
    'walid',
    'walidnaam',
    'walidkanaam',
    'fatherfullname',
    'parentname',
    'guardianname',
    'والدکانام',
    'والد',
    'ولدیت',
    'ناموالد',
  ],
  class: [
    'class',
    'grade',
    'standard',
    'darja',
    'classlevel',
    'group',
    'جماعت',
    'کلاس',
  ],
  rollNo: [
    'rollnum',
    'rollno',
    'rollnumber',
    'officialrollno',
    'registrationidofficialrollno',
    'rno',
    'r.no',
    'roll',
    'رولنمبر',
    'رول',
  ],
  admissionNo: [
    'admissionno',
    'admissionnumber',
    'admno',
    'registrationid',
    'registrationno',
    'regno',
    'grno',
    'grnumber',
    'gr',
    'studentid',
    'id',
    'داخلہنمبر',
    'داخلہ',
    'رجسٹریشننمبر',
  ],
  section: [
    'section',
    'sec',
    'secno',
    'سیکشن',
  ],
  guardianContact: [
    'guardiancontact',
    'guardianphone',
    'guardiancell',
    'guardianmobile',
    'contactphone',
    'phonenumber',
    'mobileno',
    'cellno',
    'phone',
    'cell',
    'mobile',
    'contact',
    'whatsapp',
    'rabta',
    'رابطہنمبر',
    'فون',
    'موبائل',
  ],
  gender: [
    'gender',
    'sex',
    'jins',
    'جنس',
  ],
  dob: [
    'dob',
    'dateofbirth',
    'birthdate',
    'tareekhpaidaish',
    'd.o.b',
    'bdate',
    'birth',
    'تاریخپیدائش',
  ],
  registeredStatus: [
    'registerd',
    'registered',
    'registeredstatus',
    'status',
    'state',
    'registrationstatus',
    'اندراجکیحیثیت',
    'حیثیت',
  ],
  dateOfCenterBeginning: [
    'dateofcenterbeginning',
    'centerbeginning',
    'centerdate',
    'dateofadmission',
    'admissiondate',
    'doa',
    'enrollmentdate',
    'تاریخداخلہ',
  ],
  district: [
    'district',
    'dist',
    'tehsil',
    'city',
    'ضلع',
  ],
  schoolName: [
    'schoolname',
    'school',
    'nameofschool',
    'markaz',
    'center',
    'schoolcenter',
    'centerschool',
    'سکول',
    'سکولکانام',
  ],
  trade: [
    'trade',
    'course',
    'subject',
    'skill',
    'discipline',
    'ٹریڈ',
    'شعبہ',
  ],
  bFormNo: [
    'bform',
    'bformno',
    'bayform',
    'bayformno',
    'childcnic',
    'cnic',
    'formb',
    'بےفارم',
    'شناختی',
  ],
  fatherCnic: [
    'fathercnic',
    'fcnic',
    'fatherscnic',
    'walidcnic',
    'والدکاشناختی',
  ],
  address: [
    'address',
    'presentaddress',
    'homeaddress',
    'residence',
    'currentaddress',
    'پتہ',
  ],
  serialNo: [
    's#',
    'sno',
    's.no',
    'srno',
    'sr.no',
    'serialno',
    'serialnum',
    'sr#',
    'sources',
    'شمار',
    'نمبرشمار',
  ],
  remarks: [
    'remarks',
    'notes',
    'comments',
    'تفصیل',
  ],
};

export interface ColumnMappingInfo {
  headers: string[];
  mapping: Record<string, string>; // originalHeader -> canonicalKey
  confidenceMap: Record<string, 'high' | 'medium' | 'unmapped'>;
  isConfident: boolean;
  unmappedHeaders: string[];
  missingRequired: string[];
}

export interface ParseExcelOptions {
  updateExisting?: boolean; // When true, existing records are flagged for auto-update
  replaceAll?: boolean; // When true, existing DB records are wiped for the imported classes only
  defaultClass?: ClassLevel; // Default class level if sheet does not specify
  sheetName?: string; // Optional target sheet name in multi-sheet workbook or '__ALL__'
  headerRowIndex?: number; // Optional manually selected header row (0-indexed)
  customColumnMapping?: Record<string, string>; // Optional user-confirmed column mapping (originalHeader -> canonicalKey)
}

export interface CommitImportOptions {
  updateExisting?: boolean;
  replaceAll?: boolean;
}

export interface CommitImportResult {
  committedCount: number;
  updatedCount: number;
  createdCount: number;
  skippedCount: number;
  localSaveSuccess: boolean;
  cloudSync: {
    syncedCount: number;
    pendingCount: number;
    failedCount: number;
    overallStatus: string;
    error?: string;
  };
  diagnostics: DiagnosticLog[];
}

// -------------------------------------------------------------
// NORMALIZATION HELPERS
// -------------------------------------------------------------

/**
 * Unicode-aware string cleaner for header normalization
 */
export function cleanStr(s: any): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}



/**
 * Normalizes section from cell value or extracts from combined class-section strings (e.g. "8-B", "7A", "10-B")
 */
export function normalizeSection(raw: any, fallbackClassStr?: any): Section {
  if (raw) {
    const str = String(raw).trim().toUpperCase();
    if (str === 'A' || str === 'B' || str === 'C') return str as Section;
    if (str.includes('A') || str === 'SEC A' || str === 'SEC-A' || str === 'SECTION A') return 'A';
    if (str.includes('B') || str === 'SEC B' || str === 'SEC-B' || str === 'SECTION B') return 'B';
    if (str.includes('C') || str === 'SEC C' || str === 'SEC-C' || str === 'SECTION C') return 'C';
  }

  // Fallback: extract section letter from class cell if present (e.g. "7-A", "8 B", "9th C", "7A", "10-B", "1-A")
  if (fallbackClassStr) {
    const match = String(fallbackClassStr).match(/(?:class|grade)?\s*(?:10|[1-9])(?:th)?\s*[-_\s/:]*([A-Za-z])/i);
    if (match) {
      const sec = match[1].toUpperCase();
      if (sec === 'A' || sec === 'B' || sec === 'C') return sec as Section;
    }
  }

  return 'A'; // Standard default section
}

/**
 * Normalizes phone numbers commonly found in Pakistani school sheets:
 * Converts 10-digit mobile numbers starting with '3' into standard 11-digit format starting with '03'.
 * Cleans out placeholder text like "Nill", "-", "NA".
 */
export function normalizePhone(raw: any): string {
  if (!raw) return '';
  const str = String(raw).trim();
  const lower = str.toLowerCase();
  if (
    lower === 'nill' ||
    lower === 'nil' ||
    lower === 'none' ||
    lower === '-' ||
    lower === '--' ||
    lower === 'na' ||
    lower === 'n/a'
  ) {
    return '';
  }
  const digits = str.replace(/[^\d]/g, '');
  if (digits.length === 10 && digits.startsWith('3')) {
    return '0' + digits;
  }
  if (digits.length >= 7) {
    return str;
  }
  return '';
}

/**
 * Normalizes Excel date representations (numbers, serials, strings) into YYYY-MM-DD format.
 */
export function formatExcelDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') {
    // Excel base date is Dec 30 1899
    const utcDays = Math.floor(val - 25569);
    const dateInfo = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dateInfo.getTime())) {
      const y = dateInfo.getUTCFullYear();
      const m = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dateInfo.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(val).trim();
  if (!str) return '';

  // Check if purely numeric string from Excel serial date (e.g. "41250")
  if (/^\d{5}$/.test(str)) {
    const num = parseInt(str, 10);
    const utcDays = Math.floor(num - 25569);
    const dateInfo = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dateInfo.getTime())) {
      const y = dateInfo.getUTCFullYear();
      const m = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dateInfo.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // Handle MM/DD/YYYY or M/D/YYYY
  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const m = mdyMatch[1].padStart(2, '0');
    const d = mdyMatch[2].padStart(2, '0');
    const y = mdyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Handle standard DD/MM/YYYY or DD-MM-YYYY format common in Pakistan
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Text dates like "2-Mar-26", "2-Mar-2026"
  const textDate = new Date(str);
  if (!isNaN(textDate.getTime()) && textDate.getFullYear() > 1990 && textDate.getFullYear() < 2050) {
    const y = textDate.getFullYear();
    const m = String(textDate.getMonth() + 1).padStart(2, '0');
    const d = String(textDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return str;
}

/**
 * Checks if a string represents an empty or placeholder-like cell value
 */
export function isPlaceholderStr(val: any): boolean {
  if (val === null || val === undefined) return true;
  const str = String(val).trim().toLowerCase();
  return (
    str === '' ||
    str === 'nill' ||
    str === 'nil' ||
    str === 'none' ||
    str === '-' ||
    str === '--' ||
    str === 'na' ||
    str === 'n/a' ||
    str === 'null' ||
    str === 'undefined'
  );
}

/**
 * Base starting roll number index for temporary placeholder generation
 */
export function getInitialTempRollCounter(classLevel: ClassLevel): number {
  if (classLevel === 'Class 7') return 700;
  if (classLevel === 'Class 8') return 800;
  if (classLevel === 'Class 9') return 900;
  return 100;
}

/**
 * Intelligently identifies if a sheet in an Excel workbook represents a Student Roster.
 */
export function isMasterStudentSheetName(sheetName: string, worksheet?: XLSX.WorkSheet): boolean {
  const cleanName = cleanStr(sheetName);
  const nonStudentKeywords = [
    'attendance',
    'teaching',
    'practical',
    'followup',
    'follow',
    'absentee',
    'starthere',
    'instruction',
    'instructions',
    'guide',
    'help',
    'readme',
    'summary',
    'plan',
  ];

  if (nonStudentKeywords.some((kw) => cleanName.includes(kw))) {
    return false;
  }

  if (
    cleanName.includes('master') ||
    cleanName.includes('student') ||
    cleanName.includes('learner') ||
    cleanName.includes('roster') ||
    cleanName.includes('admission')
  ) {
    return true;
  }

  if (normalizeClass(sheetName) !== null) {
    return true;
  }

  // Inspect headers in worksheet if provided
  if (worksheet) {
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const rowStr = JSON.stringify(rows[i] || []).toLowerCase();
      if (
        (rowStr.includes('student') || rowStr.includes('learner') || rowStr.includes('name')) &&
        (rowStr.includes('father') || rowStr.includes('roll') || rowStr.includes('class') || rowStr.includes('adm')) &&
        !rowStr.includes('marked by') &&
        !rowStr.includes('time in') &&
        !rowStr.includes('practical activity') &&
        !rowStr.includes('theory covered')
      ) {
        return true;
      }
    }
  }

  return false;
}

// -------------------------------------------------------------
// DYNAMIC HEADER ROW DETECTION & COLUMN MAPPING ENGINE
// -------------------------------------------------------------

/**
 * Scans worksheet rows dynamically to locate the table header row.
 * Handles top banner titles, empty rows, metadata tables, and headers in any language.
 */
export function findHeaderRowIndex(worksheet: XLSX.WorkSheet): number {
  const allRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (allRows.length === 0) return 0;

  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(allRows.length, 35); i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;

    const nonBlankCells = row.map((c) => String(c || '').trim()).filter((c) => c !== '');
    if (nonBlankCells.length < 2) {
      // Single cell or title banner across merged cells - skip
      continue;
    }

    let matchedAliasesCount = 0;
    const seenFields = new Set<string>();

    for (const cell of nonBlankCells) {
      const cleanCell = cleanStr(cell);
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (!seenFields.has(field)) {
          if (aliases.some((a) => cleanStr(a) === cleanCell || (cleanCell.length >= 4 && cleanCell.includes(cleanStr(a))))) {
            matchedAliasesCount++;
            seenFields.add(field);
            break;
          }
        }
      }
    }

    let score = matchedAliasesCount * 10;
    if (seenFields.has('name')) score += 20;
    if (seenFields.has('fatherName')) score += 10;
    if (seenFields.has('class')) score += 10;
    if (seenFields.has('rollNo') || seenFields.has('serialNo')) score += 10;

    // Check if the row below contains data cells
    if (i + 1 < allRows.length && Array.isArray(allRows[i + 1])) {
      const nextRowCells = allRows[i + 1].filter((c) => String(c || '').trim() !== '');
      if (nextRowCells.length >= nonBlankCells.length * 0.5) {
        score += 8;
      }
    }

    if (score > bestScore && matchedAliasesCount >= 2) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Inspects a worksheet to detect raw headers and propose dynamic column mapping.
 */
export function detectColumnMapping(headers: string[]): ColumnMappingInfo {
  const mapping: Record<string, string> = {};
  const confidenceMap: Record<string, 'high' | 'medium' | 'unmapped'> = {};
  const assignedFields = new Set<string>();

  for (const h of headers) {
    const cleanHeader = cleanStr(h);
    if (!cleanHeader) {
      confidenceMap[h] = 'unmapped';
      continue;
    }

    let matchedField: string | null = null;
    let confidence: 'high' | 'medium' | 'unmapped' = 'unmapped';

    // 1. Exact clean match with aliases
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (!assignedFields.has(field)) {
        if (aliases.some((a) => cleanStr(a) === cleanHeader)) {
          matchedField = field;
          confidence = 'high';
          break;
        }
      }
    }

    // 2. Substring match if high-confidence exact match not found
    if (!matchedField) {
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (!assignedFields.has(field)) {
          for (const alias of aliases) {
            const cleanAlias = cleanStr(alias);
            if (cleanAlias.length >= 4 && cleanHeader.includes(cleanAlias)) {
              // Ensure we don't accidentally map father name to student name
              if (field === 'name' && (cleanHeader.includes('father') || cleanHeader.includes('walid') || cleanHeader.includes('parent'))) {
                continue;
              }
              if (field === 'rollNo' && (cleanHeader.includes('enrollment') || cleanHeader.includes('date'))) {
                continue;
              }
              matchedField = field;
              confidence = 'medium';
              break;
            }
          }
          if (matchedField) break;
        }
      }
    }

    if (matchedField) {
      mapping[h] = matchedField;
      confidenceMap[h] = confidence;
      assignedFields.add(matchedField);
    } else {
      confidenceMap[h] = 'unmapped';
    }
  }

  const unmappedHeaders = headers.filter((h) => !mapping[h]);
  const missingRequired: string[] = [];
  if (!assignedFields.has('name')) {
    missingRequired.push('name');
  }

  // Is confident if required fields are mapped with high or medium confidence
  const isConfident = missingRequired.length === 0;

  return {
    headers,
    mapping,
    confidenceMap,
    isConfident,
    unmappedHeaders,
    missingRequired,
  };
}

/**
 * Returns complete sheet details and column inspection from an Excel file
 */
export async function getExcelSheetDetails(file: File): Promise<{
  allSheets: string[];
  masterSheets: string[];
}> {
  try {
    const dataBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(dataBuffer, { type: 'array' });
    const allSheets = workbook.SheetNames || [];
    const masterSheets = allSheets.filter((s) => isMasterStudentSheetName(s, workbook.Sheets[s]));
    return { allSheets, masterSheets };
  } catch (err) {
    console.error('Failed to read sheet details:', err);
    return { allSheets: [], masterSheets: [] };
  }
}

/**
 * Retrieves list of sheet names from an Excel file
 */
export async function getExcelSheetNames(file: File): Promise<string[]> {
  try {
    const dataBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(dataBuffer, { type: 'array' });
    return workbook.SheetNames || [];
  } catch (err) {
    console.error('Failed to read sheet names:', err);
    return [];
  }
}

/**
 * Inspects a specific sheet in a file to detect header row and column mapping
 */
export async function inspectExcelFile(
  file: File,
  sheetName?: string
): Promise<{
  allSheets: string[];
  masterSheets: string[];
  activeSheet: string;
  detectedHeaderRow: number;
  headers: string[];
  sampleRows: Record<string, any>[];
  columnMappingInfo: ColumnMappingInfo;
}> {
  const dataBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(dataBuffer, { type: 'array', codepage: 65001 });
  const allSheets = workbook.SheetNames || [];
  const masterSheets = allSheets.filter((s) => isMasterStudentSheetName(s, workbook.Sheets[s]));

  const activeSheet =
    sheetName && sheetName !== '__ALL__' && workbook.Sheets[sheetName]
      ? sheetName
      : masterSheets.length > 0
      ? masterSheets[0]
      : allSheets[0];

  const worksheet = workbook.Sheets[activeSheet];
  if (!worksheet) {
    throw new Error(`Sheet "${activeSheet}" not found in workbook.`);
  }

  const detectedHeaderRow = findHeaderRowIndex(worksheet);
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const rawHeaderRow = rawRows[detectedHeaderRow] || [];
  const headers = rawHeaderRow.map((c: any, idx: number) => String(c || '').trim() || `Column_${idx + 1}`);

  const sampleRows = (XLSX.utils.sheet_to_json(worksheet, {
    range: detectedHeaderRow,
    defval: '',
  }) as Record<string, any>[]).slice(0, 5);

  const columnMappingInfo = detectColumnMapping(headers);

  return {
    allSheets,
    masterSheets,
    activeSheet,
    detectedHeaderRow,
    headers,
    sampleRows,
    columnMappingInfo,
  };
}

// -------------------------------------------------------------
// MAIN PARSER: READS ANY COMPATIBLE EXCEL OR CSV SPREADSHEET
// -------------------------------------------------------------

/**
 * Parse an Excel (.xlsx, .xls) or CSV file with dynamic header detection,
 * interactive column mapping, safe multi-class isolation, and comprehensive duplicate detection.
 */
export async function parseExcelOrCsvFile(
  file: File,
  options: ParseExcelOptions = { updateExisting: true, replaceAll: false }
): Promise<StudentImportRow[]> {
  clearDiagnosticLogs();

  const existingStudents = options.replaceAll ? [] : await getAllStudents();

  addDiagnosticLog(
    'DETECT',
    `Database loaded with ${existingStudents.length} existing student record(s) across all classes.`,
    existingStudents.length
  );

  const dataBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(dataBuffer, { type: 'array', codepage: 65001 });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('Spreadsheet contains no sheets.');
  }

  const detectedMasterSheets = sheetNames.filter((s) =>
    isMasterStudentSheetName(s, workbook.Sheets[s])
  );

  let targetSheetNames: string[] = [];
  if (options.sheetName && options.sheetName !== '__ALL__') {
    targetSheetNames = [options.sheetName];
  } else if (options.sheetName === '__ALL__') {
    targetSheetNames = detectedMasterSheets.length > 0 ? detectedMasterSheets : sheetNames;
  } else {
    targetSheetNames = detectedMasterSheets.length > 0 ? detectedMasterSheets : sheetNames;
  }

  addDiagnosticLog(
    'DETECT',
    `Targeting ${targetSheetNames.length} sheet(s) in workbook: [${targetSheetNames.join(', ')}]`,
    targetSheetNames.length
  );

  const parsedRows: StudentImportRow[] = [];
  let overallRowCounter = 0;

  // Track spreadsheet internal identifiers to avoid duplicate rows inside the file
  const seenSpreadsheetAdmissions = new Set<string>();
  const seenSpreadsheetClassRolls = new Set<string>();

  for (const sName of targetSheetNames) {
    const worksheet = workbook.Sheets[sName];
    if (!worksheet) continue;

    // 1. Dynamic header row detection
    const headerRowIndex =
      options.headerRowIndex !== undefined ? options.headerRowIndex : findHeaderRowIndex(worksheet);

    const sheetRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const rawHeaderRow = sheetRows[headerRowIndex] || [];
    const headers = rawHeaderRow.map((c: any, idx: number) => String(c || '').trim() || `Column_${idx + 1}`);

    // 2. Column mapping resolution (custom user mapping or automatic alias detection)
    const activeMapping =
      options.customColumnMapping && Object.keys(options.customColumnMapping).length > 0
        ? options.customColumnMapping
        : detectColumnMapping(headers).mapping;

    // Invert mapping: canonicalKey -> originalHeader
    const fieldToHeader: Record<string, string> = {};
    for (const [origHeader, canonicalKey] of Object.entries(activeMapping)) {
      if (canonicalKey && canonicalKey !== '__IGNORE__') {
        fieldToHeader[canonicalKey] = origHeader;
      }
    }

    // Convert worksheet to objects
    const rawDataRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
      range: headerRowIndex,
      defval: '',
    });

    addDiagnosticLog(
      'PARSE',
      `Sheet "${sName}": Detected header row at index ${headerRowIndex}. Found ${rawDataRows.length} raw data row(s).`,
      rawDataRows.length
    );

    for (let index = 0; index < rawDataRows.length; index++) {
      const row = rawDataRows[index];

      // Skip completely empty rows
      const hasAnyValue = Object.values(row).some((v) => String(v || '').trim() !== '');
      if (!hasAnyValue) continue;

      overallRowCounter++;

      const getVal = (canonicalKey: string): string => {
        const header = fieldToHeader[canonicalKey];
        if (header && row[header] !== undefined && row[header] !== null) {
          return String(row[header]).trim();
        }
        // Fallback: check if row has key matching canonicalKey directly
        if (row[canonicalKey] !== undefined && row[canonicalKey] !== null) {
          return String(row[canonicalKey]).trim();
        }
        return '';
      };

      // Extract Student Name
      let rawName = getVal('name');
      if (rawName) {
        const up = rawName.toUpperCase();
        if (
          up.startsWith('GBHS') ||
          up.startsWith('GOVT') ||
          up.startsWith('GOVERNMENT') ||
          up.includes('HIGH SCHOOL')
        ) {
          rawName = '';
        }
      }

      // Extract Class
      const rawClass = getVal('class');
      const defaultCls = options.defaultClass ? normalizeClass(options.defaultClass) : null;
      const classLevel =
        normalizeClass(rawClass) ||
        normalizeClass(sName) ||
        normalizeClass(file.name) ||
        defaultCls ||
        null;

      // Extract Section
      const rawSec = getVal('section');
      const section = normalizeSection(rawSec, rawClass);

      // Extract Father Name
      const rawFather = getVal('fatherName');

      // Extract Roll Number (can be blank without being treated as an error)
      const rawRoll = getVal('rollNo');
      let rollNo = '';
      let isBlankRoll = false;

      if (!rawRoll || isPlaceholderStr(rawRoll)) {
        rollNo = '';
        isBlankRoll = true;
      } else {
        rollNo = rawRoll.trim();
        isBlankRoll = false;
      }

      // Extract Admission No
      const rawAdm = getVal('admissionNo');
      let admissionNo = '';
      let isAutoAdmission = false;

      if (rawAdm && !isPlaceholderStr(rawAdm)) {
        admissionNo = rawAdm.trim();
        isAutoAdmission = false;
      } else {
        isAutoAdmission = true;
        const clsCode = classLevel ? classLevel.replace('Class ', '') : 'G';
        const rollPart = rollNo ? rollNo.padStart(3, '0') : `R${overallRowCounter}`;
        admissionNo = `ADM-${clsCode}${section}-${rollPart}`;
      }

      // Demographics & Optional Fields
      const district = getVal('district') || 'Lasbela';
      const schoolName = getVal('schoolName') || 'GBHS Jam Yousf Colony';
      const trade = getVal('trade') || 'Computer Operator';
      const rawSerial = getVal('serialNo');
      const serialNo = rawSerial || String(overallRowCounter);

      const rawPhone = normalizePhone(getVal('guardianContact'));
      const guardianContact = rawPhone || '';
      const phone = guardianContact;

      const dob = formatExcelDate(getVal('dob'));
      const dateOfCenterBeginning = formatExcelDate(getVal('dateOfCenterBeginning'));
      const admissionDate = dateOfCenterBeginning;

      const rawGender = getVal('gender').toLowerCase();
      const gender: 'Male' | 'Female' | 'Other' =
        rawGender === 'female' || rawGender === 'f' || rawGender === 'girl' ? 'Female' : 'Male';

      const rawStatus = getVal('registeredStatus').toLowerCase();
      let status: StudentStatus = 'Active';
      let registeredStatus = 'Registerd';
      if (rawStatus.includes('withdr') || rawStatus.includes('drop') || rawStatus.includes('left')) {
        status = 'Withdrawn';
        registeredStatus = 'Withdrawn';
      } else if (rawStatus.includes('transf')) {
        status = 'Transferred';
        registeredStatus = 'Transferred';
      } else if (rawStatus.includes('unreg') || rawStatus.includes('inact')) {
        status = 'Inactive';
        registeredStatus = 'Unregisterd';
      }

      const bFormNo = getVal('bFormNo') || undefined;
      const fatherCnic = getVal('fatherCnic') || undefined;
      const address = getVal('address') || undefined;
      const remarks = getVal('remarks') || undefined;

      // Validation Errors
      const validationErrors: string[] = [];
      if (!rawName || isPlaceholderStr(rawName)) {
        validationErrors.push('Student Name is required.');
      }
      if (!classLevel) {
        validationErrors.push(`Invalid or missing class "${rawClass || 'None'}". GBHS requires Class 1 to 10.`);
      }

      // Safe Merge & Scoped Duplicate Detection
      let isDuplicate = false;
      let duplicateReason: string | undefined = undefined;
      let isExistingStudent = false;
      let existingStudentId: string | undefined = undefined;
      let actionType: 'create' | 'update' = 'create';
      let isAmbiguousMatch = false;

      // CRITICAL SAFE MERGE RULE:
      // Only match against existing students in the SAME CLASS!
      // Importing Class 8 or 9 will NEVER match or overwrite a Class 7 student!
      if (!options.replaceAll && classLevel) {
        const existingInSameClass = existingStudents.filter((s) => s.class === classLevel);

        let matchedExisting: Student | undefined = undefined;

        // 1. Explicit admission number match in same class
        if (!isAutoAdmission && admissionNo) {
          const lowerAdm = admissionNo.toLowerCase().trim();
          matchedExisting = existingInSameClass.find(
            (s) => s.admissionNo.toLowerCase().trim() === lowerAdm
          );
        }

        // 2. Class + Section + Roll Number match (ONLY if roll number is non-blank)
        if (!matchedExisting && rollNo && !isBlankRoll) {
          matchedExisting = existingInSameClass.find(
            (s) => s.section === section && s.rollNo.trim() === rollNo
          );
        }

        // 3. Name + Father Name exact match in the SAME class
        if (
          !matchedExisting &&
          rawName &&
          rawFather &&
          rawFather !== '-' &&
          !isPlaceholderStr(rawFather)
        ) {
          const normName = rawName.toLowerCase().trim();
          const normFather = rawFather.toLowerCase().trim();
          matchedExisting = existingInSameClass.find(
            (s) =>
              s.name.toLowerCase().trim() === normName &&
              s.fatherName.toLowerCase().trim() === normFather
          );
        }

        // 4. Ambiguous duplicate match detection
        if (!matchedExisting && rawName) {
          const normName = rawName.toLowerCase().trim();
          const sameNameStudents = existingInSameClass.filter(
            (s) => s.name.toLowerCase().trim() === normName
          );
          if (sameNameStudents.length > 0) {
            isAmbiguousMatch = true;
            duplicateReason = `Student with name "${rawName}" already exists in ${classLevel}. Please verify if this is an update or new student.`;
          }
        }

        if (matchedExisting) {
          if (options.updateExisting !== false) {
            isExistingStudent = true;
            existingStudentId = matchedExisting.id;
            actionType = 'update';
            duplicateReason = `Matched student "${matchedExisting.name}" in ${classLevel}. Will update details.`;
          } else {
            isDuplicate = true;
            duplicateReason = `Student "${matchedExisting.name}" already in database for ${classLevel}. Skipped in Append-Only mode.`;
          }
        }
      }

      // Check duplicate within the same sheet
      if (!isExistingStudent && classLevel) {
        if (!isAutoAdmission && admissionNo) {
          const admKey = `${classLevel}_${admissionNo.toLowerCase()}`;
          if (seenSpreadsheetAdmissions.has(admKey)) {
            isDuplicate = true;
            duplicateReason = `Admission No "${admissionNo}" repeated in sheet.`;
          } else {
            seenSpreadsheetAdmissions.add(admKey);
          }
        }

        // Only check roll number repetition if roll number is NOT blank!
        if (!isDuplicate && rollNo && !isBlankRoll) {
          const rollKey = `${classLevel}_${section}_${rollNo.toLowerCase()}`;
          if (seenSpreadsheetClassRolls.has(rollKey)) {
            isDuplicate = true;
            duplicateReason = `Roll No "${rollNo}" repeated for ${classLevel} - ${section} in sheet.`;
          } else {
            seenSpreadsheetClassRolls.add(rollKey);
          }
        }
      }

      const isValid = validationErrors.length === 0;
      const selected = isValid && (!isDuplicate || actionType === 'update');

      let exclusionReason: string | undefined = undefined;
      if (!isValid) {
        exclusionReason = `Validation Error: ${validationErrors.join('; ')}`;
      } else if (isDuplicate && actionType !== 'update') {
        exclusionReason = duplicateReason || 'Duplicate record detected and excluded.';
      } else if (!selected) {
        exclusionReason = 'Row excluded / unselected.';
      }

      parsedRows.push({
        rowNumber: overallRowCounter,
        serialNo,
        rollNo,
        district,
        schoolName,
        trade,
        name: rawName,
        fatherName: rawFather || '-',
        gender,
        dob: dob || undefined,
        class: (classLevel || (rawClass ? String(rawClass).trim() : '')) as ClassLevel,
        dateOfCenterBeginning: dateOfCenterBeginning || undefined,
        guardianContact,
        registeredStatus,

        hasPlaceholderRoll: false,
        hasPlaceholderContact: !rawPhone,
        isBlankRoll,
        isAmbiguousMatch,

        admissionNo,
        section,
        phone,
        address,
        status,
        admissionDate,
        bFormNo,
        fatherCnic,
        remarks,

        validationErrors,
        isDuplicate,
        duplicateReason,
        isExistingStudent,
        existingStudentId,
        actionType,
        selected,
        exclusionReason,
      });
    }
  }

  const validCount = parsedRows.filter((r) => r.validationErrors.length === 0).length;
  const updateCount = parsedRows.filter((r) => r.actionType === 'update').length;
  const createCount = parsedRows.filter((r) => r.actionType === 'create' && r.validationErrors.length === 0).length;
  const invalidCount = parsedRows.filter((r) => r.validationErrors.length > 0).length;
  const duplicateCount = parsedRows.filter((r) => r.isDuplicate && r.actionType !== 'update').length;

  addDiagnosticLog(
    'VALIDATE',
    `Validated ${parsedRows.length} total row(s): ${validCount} valid (${createCount} new, ${updateCount} to update), ${invalidCount} invalid, ${duplicateCount} duplicate(s).`,
    validCount,
    { validCount, updateCount, createCount, invalidCount, duplicateCount }
  );

  return parsedRows;
}

// -------------------------------------------------------------
// TRANSACTIONAL COMMIT: MERGES RECORDS SAFELY & REPORTS RESULTS
// -------------------------------------------------------------

/**
 * Commits approved import rows to local IndexedDB, enqueues to outbox,
 * triggers cloud sync, and reports local-save and cloud-sync results separately.
 */
export async function commitApprovedImportRows(
  rows: StudentImportRow[],
  userEmail: string,
  options: CommitImportOptions = { updateExisting: true, replaceAll: false }
): Promise<CommitImportResult> {
  const sessionUser = syncEngine.getSession()?.user;
  if (sessionUser) {
    const permissions = getWorkspacePermissions(sessionUser);
    if (permissions.isReadOnly) {
      throw new Error('Permission denied: Read-only team members cannot import data.');
    }
  }

  const toCommit = rows.filter((r) => r.selected && r.validationErrors.length === 0);

  if (toCommit.length === 0) {
    addDiagnosticLog('EXCLUDE', 'Zero valid rows selected for commit.', 0);
    return {
      committedCount: 0,
      updatedCount: 0,
      createdCount: 0,
      skippedCount: rows.length,
      localSaveSuccess: true,
      cloudSync: {
        syncedCount: 0,
        pendingCount: 0,
        failedCount: 0,
        overallStatus: 'Synced',
      },
      diagnostics: getDiagnosticLogs(),
    };
  }

  const outboxOpsToQueue: OutboxOperation[] = [];

  // Safe Class-Scoped Replace:
  // ONLY clear students belonging to the specific classes being committed!
  // NEVER clear other classes, and NEVER delete attendance records!
  if (options.replaceAll) {
    const targetClasses = new Set<string>(toCommit.map((r) => r.class));
    const existing = await getAllStudents();
    for (const oldStudent of existing) {
      if (targetClasses.has(oldStudent.class)) {
        outboxOpsToQueue.push({
          opId: crypto.randomUUID(),
          entityId: oldStudent.id,
          entityType: 'student',
          operationType: 'DELETE',
          payload: { id: oldStudent.id },
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: oldStudent.version,
        });
      }
    }
    for (const cls of targetClasses) {
      await clearStudentsByClassLocally(cls);
    }
  }

  const now = new Date().toISOString();
  const studentsToSave: Student[] = [];
  let updatedCount = 0;
  let createdCount = 0;

  for (const row of toCommit) {
    let targetExistingId = row.existingStudentId;
    if (!options.replaceAll && options.updateExisting !== false && !targetExistingId) {
      const match = await findStudentByAdmissionNo(row.admissionNo);
      // Ensure match belongs to the same class
      if (match && match.class === row.class) {
        targetExistingId = match.id;
      }
    }

    if (!options.replaceAll && options.updateExisting !== false && targetExistingId) {
      // Update existing student record while preserving student ID (and linked attendance)
      const current = await getStudentById(targetExistingId);
      const student: Student = {
        id: targetExistingId,
        serialNo: row.serialNo || current?.serialNo || String(studentsToSave.length + 1),
        rollNo: row.rollNo || current?.rollNo || '',
        district: row.district || current?.district || 'Lasbela',
        schoolName: row.schoolName || current?.schoolName || 'GBHS Jam Yousf Colony',
        trade: row.trade || current?.trade || 'Computer Operator',
        name: row.name || current?.name || '',
        fatherName: row.fatherName || current?.fatherName || '',
        gender: row.gender || current?.gender || 'Male',
        dob: row.dob || current?.dob,
        class: row.class || current?.class || 'Class 7',
        dateOfCenterBeginning: row.dateOfCenterBeginning || current?.dateOfCenterBeginning || row.admissionDate || current?.admissionDate,
        guardianContact: row.guardianContact || row.phone || current?.guardianContact || current?.phone || '',
        registeredStatus: row.registeredStatus || current?.registeredStatus || 'Registerd',

        admissionNo: row.admissionNo || current?.admissionNo || `ADM-${row.rollNo}`,
        section: row.section || current?.section || 'A',
        phone: row.guardianContact || row.phone || current?.phone || '',
        address: row.address || current?.address,
        status: row.status || (row.registeredStatus === 'Unregisterd' ? 'Inactive' : (current?.status || 'Active')),

        admissionDate: row.dateOfCenterBeginning || row.admissionDate || current?.admissionDate,
        bFormNo: row.bFormNo || current?.bFormNo,
        fatherCnic: row.fatherCnic || current?.fatherCnic,
        fatherOccupation: current?.fatherOccupation,
        caste: current?.caste,
        religion: current?.religion || 'Islam',
        bloodGroup: current?.bloodGroup,
        emergencyContact: current?.emergencyContact,
        permanentAddress: current?.permanentAddress,
        previousSchool: current?.previousSchool,
        previousClass: current?.previousClass,
        slcNo: current?.slcNo,
        guardianName: current?.guardianName,
        guardianRelation: current?.guardianRelation,
        identificationMark: current?.identificationMark,
        monthlyIncome: current?.monthlyIncome,
        mediumOfInstruction: current?.mediumOfInstruction || 'Urdu',
        remarks: row.remarks || current?.remarks,

        version: (current?.version || 1) + 1,
        createdAt: current?.createdAt || now,
        updatedAt: now,
        schoolId: current?.schoolId || DEFAULT_SCHOOL_ID,
        createdBy: current?.createdBy || userEmail,
      };

      studentsToSave.push(student);
      updatedCount++;

      outboxOpsToQueue.push({
        opId: crypto.randomUUID(),
        entityId: student.id,
        entityType: 'student',
        operationType: 'UPDATE',
        payload: student,
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
        userEmail,
        version: student.version,
      });
    } else {
      // Create new student
      const id = crypto.randomUUID();
      const student: Student = {
        id,
        serialNo: row.serialNo || String(studentsToSave.length + 1),
        rollNo: row.rollNo || '',
        district: row.district || 'Lasbela',
        schoolName: row.schoolName || 'GBHS Jam Yousf Colony',
        trade: row.trade || 'Computer Operator',
        name: row.name,
        fatherName: row.fatherName || '-',
        gender: row.gender || 'Male',
        dob: row.dob,
        class: row.class,
        dateOfCenterBeginning: row.dateOfCenterBeginning || row.admissionDate,
        guardianContact: row.guardianContact || row.phone || '',
        registeredStatus: row.registeredStatus || 'Registerd',

        admissionNo: row.admissionNo,
        section: row.section || 'A',
        phone: row.guardianContact || row.phone || '',
        address: row.address,
        status: row.registeredStatus === 'Unregisterd' ? 'Inactive' : (row.status || 'Active'),

        admissionDate: row.dateOfCenterBeginning || row.admissionDate,
        bFormNo: row.bFormNo,
        fatherCnic: row.fatherCnic,
        religion: 'Islam',
        mediumOfInstruction: 'Urdu',
        remarks: row.remarks,

        version: 1,
        createdAt: now,
        updatedAt: now,
        schoolId: DEFAULT_SCHOOL_ID,
        createdBy: userEmail,
      };

      studentsToSave.push(student);
      createdCount++;

      outboxOpsToQueue.push({
        opId: crypto.randomUUID(),
        entityId: id,
        entityType: 'student',
        operationType: 'CREATE',
        payload: student,
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
        userEmail,
        version: 1,
      });
    }
  }

  // 1. Bulk Save to IndexedDB
  await bulkSaveStudentsLocally(studentsToSave);

  addDiagnosticLog(
    'LOCAL_SAVE',
    `Successfully saved ${studentsToSave.length} student record(s) to IndexedDB (${createdCount} created, ${updatedCount} updated).`,
    studentsToSave.length
  );

  // 2. Queue in Outbox
  for (const op of outboxOpsToQueue) {
    await enqueueOutboxOperation(op);
  }

  // 3. Mark auto-seed disabled
  await setAppState('auto_seed_disabled', true);

  // 4. Trigger cloud sync and retrieve separate sync outcome
  syncEngine.processQueue();
  const syncStats = await syncEngine.getStats();

  addDiagnosticLog(
    'CLOUD_SYNC',
    `Cloud sync triggered: ${syncStats.overallStatus} (${syncStats.syncedCount} synced, ${syncStats.pendingCount} pending/offline).`,
    syncStats.syncedCount
  );

  return {
    committedCount: studentsToSave.length,
    updatedCount,
    createdCount,
    skippedCount: rows.length - studentsToSave.length,
    localSaveSuccess: true,
    cloudSync: {
      syncedCount: syncStats.syncedCount,
      pendingCount: syncStats.pendingCount,
      failedCount: syncStats.failedCount,
      overallStatus: syncStats.overallStatus,
      error: syncStats.lastError || undefined,
    },
    diagnostics: getDiagnosticLogs(),
  };
}

// -------------------------------------------------------------
// SAMPLE TEMPLATE DOWNLOAD
// -------------------------------------------------------------

export function downloadSampleExcelTemplate(): void {
  const sampleData = [
    {
      'S#': 1,
      'Roll Num': '1',
      'District': 'Lasbela',
      'School Name': 'GBHS Jam Yousf Colony',
      'Trade': 'Computer Operator',
      'Name of Learner': 'Muhammad Ali',
      'Father Name': 'Tariq Mehmood',
      'Gender': 'Male',
      'DOB': '2012-04-12',
      'Class': 'Class 7',
      'Date of Center Beginning': '2026-03-01',
      'Guardian Contact': '0300-1234567',
      'Registerd': 'Registerd',
    },
    {
      'S#': 2,
      'Roll Num': '2',
      'District': 'Lasbela',
      'School Name': 'GBHS Jam Yousf Colony',
      'Trade': 'Computer Operator',
      'Name of Learner': 'Zayan Ahmed',
      'Father Name': 'Bashir Ahmed',
      'Gender': 'Male',
      'DOB': '2012-08-25',
      'Class': 'Class 7',
      'Date of Center Beginning': '2026-03-01',
      'Guardian Contact': '0312-9876543',
      'Registerd': 'Registerd',
    },
    {
      'S#': 3,
      'Roll Num': '1',
      'District': 'Lasbela',
      'School Name': 'GBHS Jam Yousf Colony',
      'Trade': 'Computer Operator',
      'Name of Learner': 'Hamza Khan',
      'Father Name': 'Abdul Rehman',
      'Gender': 'Male',
      'DOB': '2011-06-15',
      'Class': 'Class 8',
      'Date of Center Beginning': '2026-03-01',
      'Guardian Contact': '0301-4448888',
      'Registerd': 'Registerd',
    },
    {
      'S#': 4,
      'Roll Num': '1',
      'District': 'Lasbela',
      'School Name': 'GBHS Jam Yousf Colony',
      'Trade': 'Computer Operator',
      'Name of Learner': 'Bilal Hussain',
      'Father Name': 'Muhammad Hussain',
      'Gender': 'Male',
      'DOB': '2010-09-08',
      'Class': 'Class 9',
      'Date of Center Beginning': '2026-03-01',
      'Guardian Contact': '0345-2223344',
      'Registerd': 'Registerd',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 10 },
    { wch: 14 },
    { wch: 26 },
    { wch: 20 },
    { wch: 22 },
    { wch: 22 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
  ];

  XLSX.writeFile(workbook, 'GBHS_Student_Import_Template.xlsx');
}

// -------------------------------------------------------------
// EXPORT TO EXCEL
// -------------------------------------------------------------

export function exportStudentsToExcel(
  students: Student[],
  filters?: {
    selectedClass?: string;
    selectedSection?: string;
    selectedStatus?: string;
    searchQuery?: string;
  }
): { success: boolean; filename?: string; count?: number; error?: string } {
  try {
    const permissions = getWorkspacePermissions(syncEngine.getSession()?.user);
    if (!permissions.canExport) {
      return { success: false, error: 'Permission denied: User is not permitted to export student records.' };
    }

    if (students.length === 0) {
      return { success: false, error: 'No student records to export.' };
    }

    const exportRows = students.map((s, idx) => ({
      'S#': s.serialNo || idx + 1,
      'Roll No': s.rollNo,
      'Roll Num': s.rollNo,
      'Admission No': s.admissionNo,
      'Student Name': s.name,
      'Name of Learner': s.name,
      "Father's Name": s.fatherName,
      'Father Name': s.fatherName,
      'Class': s.class,
      'Section': s.section || 'A',
      'Status': s.status || 'Active',
      'Registerd': s.registeredStatus || (s.status === 'Active' ? 'Registerd' : 'Unregisterd'),
      'Contact Phone': s.guardianContact || s.phone || '',
      'Guardian Contact': s.guardianContact || s.phone || '',
      'DOB': s.dob || '',
      'District': s.district || 'Lasbela',
      'School Name': s.schoolName || 'GBHS Jam Yousf Colony',
      'Trade': s.trade || 'Computer Operator',
      'Date of Center Beginning': s.dateOfCenterBeginning || s.admissionDate || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();

    const sheetTitle =
      filters?.selectedClass && filters.selectedClass !== 'All'
        ? `${filters.selectedClass}`
        : 'All Students';

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);

    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 26 },
      { wch: 20 },
      { wch: 24 },
    ];

    const profile = getSchoolProfile();
    const schoolPrefix = (profile.schoolShortName && profile.schoolShortName !== 'GBHS Jam Yousuf Colony')
      ? profile.schoolShortName.replace(/[^a-zA-Z0-9]/g, '_')
      : 'GBHS';
    const dateStr = new Date().toISOString().split('T')[0];
    let filename: string;

    if (filters?.selectedClass && filters.selectedClass !== 'All') {
      const clsStr = filters.selectedClass.replace(/\s+/g, '_');
      if (filters.selectedSection && filters.selectedSection !== 'All') {
        filename = `${schoolPrefix}_${clsStr}_Sec_${filters.selectedSection}_Students_${dateStr}.xlsx`;
      } else {
        filename = `${schoolPrefix}_${clsStr}_Students_${dateStr}.xlsx`;
      }
    } else {
      filename = `${schoolPrefix}_All_Classes_Students_${dateStr}.xlsx`;
    }

    XLSX.writeFile(workbook, filename);

    return { success: true, filename, count: students.length };
  } catch (err: any) {
    return { success: false, error: err.message || 'Export to Excel failed.' };
  }
}

// -------------------------------------------------------------
// ATTENDANCE MATRIX & REGISTER EXPORT SERVICE
// -------------------------------------------------------------

export interface AttendanceExportOptions {
  selectedClass?: ClassLevel | 'All';
  selectedSection?: Section | 'All';
  date?: string; // Single date (YYYY-MM-DD)
  startDate?: string; // Start date of range (YYYY-MM-DD)
  endDate?: string; // End date of range (YYYY-MM-DD)
  format?: 'xlsx' | 'csv';
}

export interface AttendanceExportResult {
  success: boolean;
  filename?: string;
  count?: number;
  error?: string;
  matrixRows?: Record<string, any>[];
  registerRows?: Record<string, any>[];
  workbook?: XLSX.WorkBook;
}

export async function exportAttendanceToExcel(
  options: AttendanceExportOptions = {}
): Promise<AttendanceExportResult> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (!permissions.canExport) {
      return { success: false, error: 'Permission denied: User is not permitted to export attendance records.' };
    }

    const {
      selectedClass = 'All',
      selectedSection = 'All',
      date,
      startDate,
      endDate,
      format = 'xlsx',
    } = options;

    // 1. Fetch all students and all attendance records concurrently
    const [allStudents, allAttendance] = await Promise.all([
      getAllStudents(),
      getAllAttendanceRecords(),
    ]);

    // 2. Filter attendance records by class, section, and date / date range
    const filteredAttendance = allAttendance.filter((r) => {
      if (selectedClass !== 'All' && r.class !== selectedClass) return false;
      if (selectedSection !== 'All' && r.section !== selectedSection) return false;
      if (startDate && endDate) {
        return r.date >= startDate && r.date <= endDate;
      }
      if (date) {
        return r.date === date;
      }
      return true;
    });

    // 3. Build lookup maps for students
    const studentMap = new Map<string, Student>();
    for (const s of allStudents) {
      studentMap.set(s.id, s);
    }

    // 4. Identify all students who should be included in the export matrix:
    // - All currently Active students matching the selected class and section
    // - PLUS all Inactive, Withdrawn, and Transferred students who have historical attendance records in filteredAttendance
    // - PLUS any student who appears in filteredAttendance even if missing from allStudents (synthesized safely)
    const exportStudentMap = new Map<string, Student>();

    // 4a. Add currently active students in this class/section
    for (const s of allStudents) {
      if (s.status === 'Active') {
        if (selectedClass === 'All' || s.class === selectedClass) {
          if (selectedSection === 'All' || s.section === selectedSection) {
            exportStudentMap.set(s.id, s);
          }
        }
      }
    }

    // 4b. Add any student with historical attendance in filteredAttendance
    for (const rec of filteredAttendance) {
      if (!exportStudentMap.has(rec.studentId)) {
        const existingStudent = studentMap.get(rec.studentId);
        if (existingStudent) {
          exportStudentMap.set(rec.studentId, existingStudent);
        } else {
          // Synthesize student entry from historical attendance record
          exportStudentMap.set(rec.studentId, {
            id: rec.studentId,
            admissionNo: rec.studentId,
            rollNo: rec.rollNo,
            name: rec.studentName,
            fatherName: '',
            phone: '',
            class: rec.class,
            section: (rec.section as any) || 'A',
            status: 'Withdrawn',
            schoolId: rec.schoolId || 'GBHS-MAIN',
            createdBy: rec.markedBy || 'system',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    const exportStudents = Array.from(exportStudentMap.values()).sort((a, b) => {
      const classCompare = (a.class || '').localeCompare(b.class || '');
      if (classCompare !== 0) return classCompare;
      return parseInt(a.rollNo || '0', 10) - parseInt(b.rollNo || '0', 10);
    });

    if (exportStudents.length === 0) {
      return { success: false, error: 'No students or attendance records found to export.' };
    }

    // 5. Determine list of dates to show in the matrix
    let distinctDates = Array.from(new Set(filteredAttendance.map((r) => r.date))).sort();
    if (distinctDates.length === 0) {
      if (date) {
        distinctDates = [date];
      } else if (startDate && endDate) {
        distinctDates = [startDate];
      }
    }

    // 6. Index attendance by `${studentId}_${date}`
    const attendanceIndex = new Map<string, AttendanceRecord>();
    for (const rec of filteredAttendance) {
      attendanceIndex.set(`${rec.studentId}_${rec.date}`, rec);
    }

    // 7. Build Attendance Matrix Rows
    const matrixRows = exportStudents.map((student, idx) => {
      let presentCount = 0;
      let absentCount = 0;
      let leaveCount = 0;
      let lateCount = 0;

      const row: Record<string, any> = {
        'S#': idx + 1,
        'Roll No': student.rollNo,
        'Student Name': student.name,
        "Father's Name": student.fatherName,
        'Class': student.class,
        'Section': student.section || 'A',
        'Student Status': student.status || 'Active',
      };

      for (const d of distinctDates) {
        const key = `${student.id}_${d}`;
        const rec = attendanceIndex.get(key);
        if (!rec) {
          row[d] = '-';
        } else {
          switch (rec.status) {
            case 'Present':
              row[d] = 'P';
              presentCount++;
              break;
            case 'Absent':
              row[d] = 'A';
              absentCount++;
              break;
            case 'Leave':
              row[d] = 'L';
              leaveCount++;
              break;
            case 'Late':
              row[d] = 'T';
              lateCount++;
              break;
            default:
              row[d] = '-';
          }
        }
      }

      const totalEvalDays = distinctDates.length;
      const rate = totalEvalDays > 0
        ? Math.round(((presentCount + lateCount * 0.5) / totalEvalDays) * 100)
        : 0;

      row['Total Days'] = totalEvalDays;
      row['Present (P)'] = presentCount;
      row['Absent (A)'] = absentCount;
      row['Leave (L)'] = leaveCount;
      row['Late (T)'] = lateCount;
      row['Attendance %'] = `${rate}%`;

      return row;
    });

    // 7. Build Detailed Register Rows
    const registerRows = filteredAttendance
      .sort((a, b) => b.date.localeCompare(a.date) || parseInt(a.rollNo || '0', 10) - parseInt(b.rollNo || '0', 10))
      .map((r, idx) => {
        const student = studentMap.get(r.studentId) || exportStudentMap.get(r.studentId);
        return {
          'S#': idx + 1,
          'Date': r.date,
          'Class': r.class,
          'Section': r.section,
          'Roll No': r.rollNo,
          'Student Name': r.studentName,
          'Student Status': student?.status || 'Active',
          'Status': r.status,
          'Remarks': r.remarks || '',
          'Marked By': r.markedBy || 'Staff Operator',
        };
      });

    // If no filtered attendance records exist yet for this specific date, create placeholder entries for active students
    if (registerRows.length === 0 && date) {
      exportStudents
        .filter((s) => s.status === 'Active')
        .forEach((student, idx) => {
          registerRows.push({
            'S#': idx + 1,
            'Date': date,
            'Class': student.class,
            'Section': student.section || 'A',
            'Roll No': student.rollNo,
            'Student Name': student.name,
            'Student Status': student.status || 'Active',
            'Status': 'Unmarked' as any,
            'Remarks': '',
            'Marked By': '-',
          });
        });
    }

    const clsStr = selectedClass.replace(/\s+/g, '_');
    const secStr = selectedSection !== 'All' ? `_Sec_${selectedSection}` : '';
    const dateRangeStr = startDate && endDate
      ? `${startDate}_to_${endDate}`
      : date || new Date().toISOString().split('T')[0];

    const profile = getSchoolProfile();
    const schoolPrefix = (profile.schoolShortName && profile.schoolShortName !== 'GBHS Jam Yousuf Colony')
      ? profile.schoolShortName.replace(/[^a-zA-Z0-9]/g, '_')
      : 'GBHS';
    const baseFilename = `${schoolPrefix}_Attendance_${clsStr}${secStr}_${dateRangeStr}`;

    // Handle CSV Format
    if (format === 'csv') {
      const csvSheet = XLSX.utils.json_to_sheet(matrixRows);
      const csvContent = XLSX.utils.sheet_to_csv(csvSheet);
      const filename = `${baseFilename}.csv`;

      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      return {
        success: true,
        filename,
        count: filteredAttendance.length,
        matrixRows,
        registerRows,
      };
    }

    // Handle XLSX Format (Default)
    const workbook = XLSX.utils.book_new();

    const matrixSheet = XLSX.utils.json_to_sheet(matrixRows);
    XLSX.utils.book_append_sheet(workbook, matrixSheet, 'Attendance Matrix');

    const registerSheet = XLSX.utils.json_to_sheet(registerRows);
    XLSX.utils.book_append_sheet(workbook, registerSheet, 'Daily Register');

    // Column widths for Matrix Sheet
    const matrixCols: any[] = [
      { wch: 6 },  // S#
      { wch: 10 }, // Roll No
      { wch: 22 }, // Name
      { wch: 22 }, // Father Name
      { wch: 10 }, // Class
      { wch: 10 }, // Section
      { wch: 14 }, // Student Status
    ];
    // Dynamic date column widths
    distinctDates.forEach(() => matrixCols.push({ wch: 12 }));
    // Summary columns
    matrixCols.push(
      { wch: 12 }, // Total Days
      { wch: 14 }, // Present (P)
      { wch: 14 }, // Absent (A)
      { wch: 12 }, // Leave (L)
      { wch: 12 }, // Late (T)
      { wch: 14 }  // Attendance %
    );
    matrixSheet['!cols'] = matrixCols;

    // Column widths for Register Sheet
    registerSheet['!cols'] = [
      { wch: 6 },  // S#
      { wch: 12 }, // Date
      { wch: 10 }, // Class
      { wch: 10 }, // Section
      { wch: 10 }, // Roll No
      { wch: 22 }, // Student Name
      { wch: 14 }, // Student Status
      { wch: 12 }, // Status
      { wch: 24 }, // Remarks
      { wch: 20 }, // Marked By
    ];

    const filename = `${baseFilename}.xlsx`;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      XLSX.writeFile(workbook, filename);
    } else {
      try {
        XLSX.writeFile(workbook, filename);
      } catch {
        // Safe fallback for testing/headless environments
      }
    }

    return {
      success: true,
      filename,
      count: filteredAttendance.length,
      matrixRows,
      registerRows,
      workbook,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to export attendance sheet.' };
  }
}

