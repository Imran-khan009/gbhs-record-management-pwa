import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Student, AttendanceRecord } from '../types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../types/modules';
import { OutboxOperation } from '../types/sync';
import { WorkspaceMember } from '../types/auth';
import { getAppState, setAppState, remapLocalStudentId } from './db';
import { normalizeClass } from './classNormalizationService';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isCustomConfigured: boolean;
  simulationMode: 'none' | 'offline' | 'server_error' | 'slow_network' | 'conflict_trigger' | 'auth_expired' | 'check_constraint_class' | 'mock';
}

const DEFAULT_CONFIG_KEY = 'supabase_client_config';

// In-memory / persistent mock cloud store for zero-setup instantaneous testing & verification
const MOCK_CLOUD_STUDENTS_KEY = 'mock_supabase_cloud_students';
const MOCK_CLOUD_ATTENDANCE_KEY = 'mock_supabase_cloud_attendance';
const MOCK_CLOUD_TEACHING_KEY = 'mock_supabase_cloud_teaching_logs';
const MOCK_CLOUD_PRACTICAL_KEY = 'mock_supabase_cloud_practical_progress';
const MOCK_CLOUD_ABSENTEE_KEY = 'mock_supabase_cloud_absentee_followups';
export const MOCK_WORKSPACE_MEMBERS_KEY = 'mock_supabase_workspace_members';

const inMemoryMockCloudStore = new Map<string, string>();

function getMockStorageItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return inMemoryMockCloudStore.get(key) || null;
}

function setMockStorageItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  } else {
    inMemoryMockCloudStore.set(key, value);
  }
}

export function resetMockCloudStorage(): void {
  inMemoryMockCloudStore.clear();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(MOCK_CLOUD_STUDENTS_KEY);
    localStorage.removeItem(MOCK_CLOUD_ATTENDANCE_KEY);
    localStorage.removeItem(MOCK_CLOUD_TEACHING_KEY);
    localStorage.removeItem(MOCK_CLOUD_PRACTICAL_KEY);
    localStorage.removeItem(MOCK_CLOUD_ABSENTEE_KEY);
  }
}

const envUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  '';
const envKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  '';

let supabaseInstance: SupabaseClient | null = null;
let currentConfig: SupabaseConfig = {
  url: envUrl,
  anonKey: envKey,
  isCustomConfigured: Boolean(envUrl && envKey),
  simulationMode: 'none',
};

export function getSupabase(): SupabaseClient | null {
  if (!supabaseInstance && currentConfig.url && currentConfig.anonKey) {
    try {
      supabaseInstance = createClient(currentConfig.url, currentConfig.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'gbhs_supabase_auth_session',
        },
      });
      currentConfig.isCustomConfigured = true;
    } catch {
      supabaseInstance = null;
    }
  }
  return supabaseInstance;
}

export async function initSupabaseConfig(): Promise<SupabaseConfig> {
  const saved = await getAppState<SupabaseConfig>(DEFAULT_CONFIG_KEY);
  if (saved) {
    currentConfig = {
      ...currentConfig,
      ...saved,
      url: saved.url || currentConfig.url || envUrl,
      anonKey: saved.anonKey || currentConfig.anonKey || envKey,
    };
  }
  getSupabase();
  return currentConfig;
}

export function getSupabaseConfig(): SupabaseConfig {
  return currentConfig;
}

export async function updateSupabaseConfig(newConfig: Partial<SupabaseConfig>): Promise<void> {
  currentConfig = { ...currentConfig, ...newConfig };
  if (currentConfig.url && currentConfig.anonKey) {
    try {
      supabaseInstance = createClient(currentConfig.url, currentConfig.anonKey);
      currentConfig.isCustomConfigured = true;
    } catch {
      supabaseInstance = null;
    }
  } else {
    supabaseInstance = null;
    currentConfig.isCustomConfigured = false;
  }
  await setAppState(DEFAULT_CONFIG_KEY, currentConfig);
}

let mockCloudOnlyForced: boolean = false;

export function setMockCloudOnly(forced: boolean): void {
  mockCloudOnlyForced = forced;
}

export function isMockCloudOnly(): boolean {
  return mockCloudOnlyForced;
}

export function setNetworkSimulation(mode: SupabaseConfig['simulationMode']) {
  currentConfig.simulationMode = mode;
}

// -------------------------------------------------------------
// UUID VALIDATOR & NORMALIZER (Guarantees valid UUID for Postgres)
// -------------------------------------------------------------

export function isValidUUID(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Returns the id if already a valid UUID; otherwise generates a deterministic UUID
 * based on a stable hash of the input string to satisfy PostgreSQL UUID requirements.
 */
export function ensureValidUUID(id: string): string {
  if (!id) return crypto.randomUUID();
  if (isValidUUID(id)) return id.toLowerCase();

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const part2 = ((Math.abs(hash) >> 4) & 0xffff).toString(16).padStart(4, '0');
  const part3 = '4' + ((Math.abs(hash) >> 8) & 0x0fff).toString(16).padStart(3, '0');
  const part4 = '8' + ((Math.abs(hash) >> 12) & 0x0fff).toString(16).padStart(3, '0');
  const part5 = hex.repeat(2).slice(0, 12);
  return `${hex}-${part2}-${part3}-${part4}-${part5}`;
}

// -------------------------------------------------------------
// SERIALIZERS & DESERIALIZERS (Exact mapping to Supabase columns)
// -------------------------------------------------------------

export function serializeStudentToSupabase(s: Student, ownerId: string) {
  return {
    id: ensureValidUUID(s.id),
    owner_id: ownerId,
    serial_no: s.serialNo || null,
    roll_no: s.rollNo,
    district: s.district || null,
    school_name: s.schoolName || null,
    trade: s.trade || null,
    name: s.name,
    father_name: s.fatherName,
    gender: s.gender || null,
    dob: s.dob || null,
    class: normalizeClass(s.class) || s.class,
    date_of_center_beginning: s.dateOfCenterBeginning || null,
    guardian_contact: s.guardianContact || null,
    registered_status: s.registeredStatus || null,
    admission_no: s.admissionNo,
    section: s.section,
    phone: s.phone || null,
    address: s.address || null,
    status: s.status || 'Active',
    admission_date: s.admissionDate || null,
    b_form_no: s.bFormNo || null,
    father_cnic: s.fatherCnic || null,
    father_occupation: s.fatherOccupation || null,
    caste: s.caste || null,
    religion: s.religion || null,
    blood_group: s.bloodGroup || null,
    emergency_contact: s.emergencyContact || null,
    permanent_address: s.permanentAddress || null,
    previous_school: s.previousSchool || null,
    previous_class: s.previousClass || null,
    slc_no: s.slcNo || null,
    guardian_name: s.guardianName || null,
    guardian_relation: s.guardianRelation || null,
    identification_mark: s.identificationMark || null,
    monthly_income: s.monthlyIncome || null,
    medium_of_instruction: s.mediumOfInstruction || null,
    remarks: s.remarks || null,
    withdrawal_reason: s.withdrawalReason || null,
    withdrawn_date: s.withdrawnDate || null,
    transfer_details: s.transferDetails || null,
    transferred_date: s.transferredDate || null,
    replaced_student_id: s.replacedStudentId ? ensureValidUUID(s.replacedStudentId) : null,
    replacement_student_id: s.replacementStudentId ? ensureValidUUID(s.replacementStudentId) : null,
    version: s.version || 1,
    school_id: s.schoolId || 'GBHS-MAIN',
    created_by: s.createdBy || 'operator',
    created_at: s.createdAt || new Date().toISOString(),
    updated_at: s.updatedAt || new Date().toISOString(),
  };
}

export function deserializeStudentFromSupabase(row: any): Student {
  return {
    id: row.id,
    serialNo: row.serial_no || undefined,
    rollNo: row.roll_no,
    district: row.district || undefined,
    schoolName: row.school_name || undefined,
    trade: row.trade || undefined,
    name: row.name,
    fatherName: row.father_name,
    gender: row.gender || undefined,
    dob: row.dob || undefined,
    class: row.class,
    dateOfCenterBeginning: row.date_of_center_beginning || undefined,
    guardianContact: row.guardian_contact || undefined,
    registeredStatus: row.registered_status || undefined,
    admissionNo: row.admission_no,
    section: row.section,
    phone: row.phone || '',
    address: row.address || undefined,
    status: row.status || 'Active',
    withdrawalReason: row.withdrawal_reason || undefined,
    withdrawnDate: row.withdrawn_date || undefined,
    transferDetails: row.transfer_details || undefined,
    transferredDate: row.transferred_date || undefined,
    replacedStudentId: row.replaced_student_id || undefined,
    replacementStudentId: row.replacement_student_id || undefined,
    admissionDate: row.admission_date || undefined,
    bFormNo: row.b_form_no || undefined,
    fatherCnic: row.father_cnic || undefined,
    fatherOccupation: row.father_occupation || undefined,
    caste: row.caste || undefined,
    religion: row.religion || undefined,
    bloodGroup: row.blood_group || undefined,
    emergencyContact: row.emergency_contact || undefined,
    permanentAddress: row.permanent_address || undefined,
    previousSchool: row.previous_school || undefined,
    previousClass: row.previous_class || undefined,
    slcNo: row.slc_no || undefined,
    guardianName: row.guardian_name || undefined,
    guardianRelation: row.guardian_relation || undefined,
    identificationMark: row.identification_mark || undefined,
    monthlyIncome: row.monthly_income || undefined,
    mediumOfInstruction: row.medium_of_instruction || undefined,
    remarks: row.remarks || undefined,
    version: row.version || 1,
    schoolId: row.school_id || 'GBHS-MAIN',
    createdBy: row.created_by || 'operator',
    owner_id: row.owner_id,
    ownerId: row.owner_id,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function serializeAttendanceToSupabase(a: AttendanceRecord, ownerId: string) {
  return {
    id: a.id,
    owner_id: ownerId,
    student_id: ensureValidUUID(a.studentId),
    student_name: a.studentName,
    roll_no: a.rollNo,
    class: normalizeClass(a.class) || a.class,
    section: a.section,
    date: a.date,
    status: a.status,
    remarks: a.remarks || null,
    version: a.version || 1,
    school_id: a.schoolId || 'GBHS-MAIN',
    marked_by: a.markedBy || 'operator',
    updated_at: a.updatedAt || new Date().toISOString(),
  };
}

export function deserializeAttendanceFromSupabase(row: any): AttendanceRecord {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    rollNo: row.roll_no,
    class: row.class,
    section: row.section,
    date: row.date,
    status: row.status,
    remarks: row.remarks || undefined,
    version: row.version || 1,
    schoolId: row.school_id || 'GBHS-MAIN',
    markedBy: row.marked_by || 'operator',
    owner_id: row.owner_id,
    ownerId: row.owner_id,
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function serializeTeachingLogToSupabase(t: TeachingLogEntry, ownerId: string) {
  return {
    id: ensureValidUUID(t.id),
    owner_id: ownerId,
    date: t.date,
    day: t.day,
    class: t.class,
    subject_topic: t.subjectTopic,
    learning_objectives: t.learningObjectives || null,
    theory_covered: t.theoryCovered || null,
    practical_activity: t.practicalActivity || null,
    total_registered: t.totalRegistered || 0,
    students_present: t.studentsPresent || 0,
    students_completing_task: t.studentsCompletingTask || 0,
    students_needing_help: t.studentsNeedingHelp || 0,
    teaching_method: t.teachingMethod || null,
    issue_challenge: t.issueChallenge || null,
    evidence_file_name: t.evidenceFileName || null,
    next_lesson: t.nextLesson || null,
    instructor_name: t.instructorName,
    version: t.version || 1,
    created_at: t.createdAt || new Date().toISOString(),
    updated_at: t.updatedAt || new Date().toISOString(),
  };
}

export function deserializeTeachingLogFromSupabase(row: any): TeachingLogEntry {
  return {
    id: row.id,
    date: row.date,
    day: row.day,
    class: row.class,
    subjectTopic: row.subject_topic,
    learningObjectives: row.learning_objectives || '',
    theoryCovered: row.theory_covered || '',
    practicalActivity: row.practical_activity || '',
    totalRegistered: row.total_registered || 0,
    studentsPresent: row.students_present || 0,
    studentsCompletingTask: row.students_completing_task || 0,
    studentsNeedingHelp: row.students_needing_help || 0,
    teachingMethod: row.teaching_method || '',
    issueChallenge: row.issue_challenge || undefined,
    evidenceFileName: row.evidence_file_name || undefined,
    nextLesson: row.next_lesson || undefined,
    instructorName: row.instructor_name,
    owner_id: row.owner_id,
    ownerId: row.owner_id,
    version: row.version || 1,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function serializePracticalProgressToSupabase(
  p: PracticalProgressEntry,
  ownerId: string,
  validStudentIds?: Set<string>
) {
  let studentId: string | null = null;
  if (p.studentId) {
    const candidate = ensureValidUUID(p.studentId);
    if (!validStudentIds || validStudentIds.has(candidate)) {
      studentId = candidate;
    }
  }

  return {
    id: ensureValidUUID(p.id),
    owner_id: ownerId,
    assessment_date: p.assessmentDate,
    student_id: studentId,
    registration_id: p.registrationId || '',
    student_name: p.studentName,
    class: p.class,
    skill_task: p.skillTask,
    attempt_number: p.attemptNumber || 1,
    practical_completed: p.practicalCompleted || 'No',
    score_marks: Number(p.scoreMarks) || 0,
    skill_status: p.skillStatus || 'Not Started',
    weak_area: p.weakArea || null,
    remedial_practice_required: p.remedialPracticeRequired || 'No',
    reassessment_date: p.reassessmentDate || null,
    evidence_file: p.evidenceFile || null,
    instructor_remarks: p.instructorRemarks || null,
    version: p.version || 1,
    created_at: p.createdAt || new Date().toISOString(),
    updated_at: p.updatedAt || new Date().toISOString(),
  };
}

export function deserializePracticalProgressFromSupabase(row: any): PracticalProgressEntry {
  return {
    id: row.id,
    assessmentDate: row.assessment_date,
    studentId: row.student_id || undefined,
    registrationId: row.registration_id,
    studentName: row.student_name,
    class: row.class,
    skillTask: row.skill_task,
    attemptNumber: row.attempt_number || 1,
    practicalCompleted: row.practical_completed || 'No',
    scoreMarks: Number(row.score_marks) || 0,
    skillStatus: row.skill_status || 'Not Started',
    weakArea: row.weak_area || undefined,
    remedialPracticeRequired: row.remedial_practice_required || 'No',
    reassessmentDate: row.reassessment_date || undefined,
    evidenceFile: row.evidence_file || undefined,
    instructorRemarks: row.instructor_remarks || undefined,
    owner_id: row.owner_id,
    ownerId: row.owner_id,
    version: row.version || 1,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function serializeAbsenteeFollowupToSupabase(
  f: AbsenteeFollowupEntry,
  ownerId: string,
  validStudentIds?: Set<string>
) {
  let studentId: string | null = null;
  if (f.studentId) {
    const candidate = ensureValidUUID(f.studentId);
    if (!validStudentIds || validStudentIds.has(candidate)) {
      studentId = candidate;
    }
  }

  return {
    id: ensureValidUUID(f.id),
    owner_id: ownerId,
    date: f.date,
    student_id: studentId,
    registration_id: f.registrationId || '',
    student_name: f.studentName,
    class: f.class,
    absence_count: f.absenceCount || 1,
    followup_reason: f.followupReason || 'General Follow-up',
    action_taken: f.actionTaken || 'Phone Call',
    contact_person: f.contactPerson || 'Parent / Guardian',
    response_received: f.responseReceived || '',
    expected_return_date: f.expectedReturnDate || null,
    followup_date: f.followupDate || f.date,
    current_status: f.currentStatus || 'Pending Return',
    management_referral: f.managementReferral || 'No',
    remarks: f.remarks || null,
    version: f.version || 1,
    created_at: f.createdAt || new Date().toISOString(),
    updated_at: f.updatedAt || new Date().toISOString(),
  };
}

export function deserializeAbsenteeFollowupFromSupabase(row: any): AbsenteeFollowupEntry {
  return {
    id: row.id,
    date: row.date,
    studentId: row.student_id || undefined,
    registrationId: row.registration_id,
    studentName: row.student_name,
    class: row.class,
    absenceCount: row.absence_count || 1,
    followupReason: row.followup_reason,
    actionTaken: row.action_taken,
    contactPerson: row.contact_person,
    responseReceived: row.response_received,
    expectedReturnDate: row.expected_return_date || undefined,
    followupDate: row.followup_date,
    currentStatus: row.current_status,
    managementReferral: row.management_referral || 'No',
    remarks: row.remarks || undefined,
    owner_id: row.owner_id,
    ownerId: row.owner_id,
    version: row.version || 1,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

// -------------------------------------------------------------
// BATCH UPSERT & CONFLICT DETECTION ENGINE
// -------------------------------------------------------------

export interface CloudConflict {
  table: string;
  id: string;
  localVersion: number;
  remoteVersion: number;
  remoteData: any;
}

export interface WorkspaceUploadResult {
  success: boolean;
  preUploadCounts: {
    students: number;
    attendance: number;
    teaching_logs: number;
    practical_progress: number;
    absentee_followups: number;
  };
  postUploadCounts?: {
    students: number;
    attendance: number;
    teaching_logs: number;
    practical_progress: number;
    absentee_followups: number;
  };
  conflicts?: CloudConflict[];
  error?: string;
}

/**
 * Check if remote records exist with higher version numbers to prevent silent overwriting.
 */
export async function checkRemoteConflicts(
  client: SupabaseClient,
  table: string,
  rows: Array<{ id: string; version?: number }>,
  ownerId: string
): Promise<CloudConflict[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const conflicts: CloudConflict[] = [];

  // Query in chunks of 100 to stay within URL length limits
  const CHUNK_SIZE = 100;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunkIds = ids.slice(i, i + CHUNK_SIZE);
    const { data, error } = await client
      .from(table)
      .select('id, version, updated_at')
      .in('id', chunkIds)
      .eq('owner_id', ownerId);

    if (error) {
      console.warn(`[SyncEngine] Conflict check query on ${table} failed:`, error.message);
      continue;
    }

    if (data && data.length > 0) {
      const remoteMap = new Map(data.map((d: any) => [d.id, d]));
      for (const row of rows) {
        const remote = remoteMap.get(row.id);
        if (remote && remote.version > (row.version || 1)) {
          conflicts.push({
            table,
            id: row.id,
            localVersion: row.version || 1,
            remoteVersion: remote.version,
            remoteData: remote,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Perform chunked batch upserts with exponential backoff on transient network failures.
 */
export async function upsertInBatches<T extends { id: string }>(
  client: SupabaseClient,
  table: string,
  rows: T[],
  chunkSize: number = 50,
  maxRetries: number = 3
): Promise<{ success: boolean; insertedCount: number; error?: string }> {
  if (rows.length === 0) return { success: true, insertedCount: 0 };

  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let attempt = 0;
    let chunkSuccess = false;
    let lastError: any = null;

    while (attempt < maxRetries && !chunkSuccess) {
      try {
        const { error } = await client
          .from(table)
          .upsert(chunk, { onConflict: 'id' });

        if (error) {
          lastError = error;
          if (error.code === '42501' || error.message.toLowerCase().includes('violates row-level security')) {
            // RLS violation is a terminal authorization error, do not retry
            return {
              success: false,
              insertedCount: totalInserted,
              error: `Row-level security violation on table "${table}": ${error.message}`,
            };
          }
          if (error.code === '23514' || error.message.toLowerCase().includes('check constraint')) {
            // Check constraint violation is a terminal validation error, do not retry
            return {
              success: false,
              insertedCount: totalInserted,
              error: `Database check constraint violation on table "${table}": ${error.message}`,
            };
          }
          attempt++;
          if (attempt < maxRetries) {
            await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
          }
        } else {
          chunkSuccess = true;
          totalInserted += chunk.length;
        }
      } catch (err: any) {
        lastError = err;
        attempt++;
        if (attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
        }
      }
    }

    if (!chunkSuccess) {
      return {
        success: false,
        insertedCount: totalInserted,
        error: lastError?.message || `Failed to upsert chunk into "${table}" after ${maxRetries} attempts.`,
      };
    }
  }

  return { success: true, insertedCount: totalInserted };
}

/**
 * Fetch remote record counts for an owner's workspace
 */
export async function getRemoteWorkspaceCounts(
  client: SupabaseClient,
  ownerId: string
): Promise<{
  students: number;
  attendance: number;
  teaching_logs: number;
  practical_progress: number;
  absentee_followups: number;
}> {
  const [stdRes, attRes, teachRes, practRes, absRes] = await Promise.all([
    client.from('students').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId),
    client.from('attendance').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId),
    client.from('teaching_logs').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId),
    client.from('practical_progress').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId),
    client.from('absentee_followups').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId),
  ]);

  return {
    students: stdRes.count || 0,
    attendance: attRes.count || 0,
    teaching_logs: teachRes.count || 0,
    practical_progress: practRes.count || 0,
    absentee_followups: absRes.count || 0,
  };
}

/**
 * High-level atomic snapshot upload of an entire authenticated workspace to Supabase.
 * - Enforces foreign-key order (Students first, then modules)
 * - Checks conflicts before overwrite
 * - Verifies post-upload counts
 */
export async function uploadWorkspaceSnapshotToSupabase(
  client: SupabaseClient | null,
  ownerId: string,
  data: {
    students: Student[];
    attendance: AttendanceRecord[];
    teachingLogs: TeachingLogEntry[];
    practicalProgress: PracticalProgressEntry[];
    absenteeFollowups: AbsenteeFollowupEntry[];
  },
  callerUserId?: string,
  callerRole?: string
): Promise<WorkspaceUploadResult> {
  const preUploadCounts = {
    students: data.students.length,
    attendance: data.attendance.length,
    teaching_logs: data.teachingLogs.length,
    practical_progress: data.practicalProgress.length,
    absentee_followups: data.absenteeFollowups.length,
  };

  if (callerRole === 'team_member' || (callerUserId && callerUserId !== ownerId)) {
    return {
      success: false,
      preUploadCounts,
      error: 'Row-level security policy violation (42501): Read-only team members cannot upload or modify records in the owner workspace.',
    };
  }

  // Mock Cloud Storage fallback when in forced mock mode or no live Supabase credentials exist
  if (mockCloudOnlyForced || !client) {
    if (!mockCloudOnlyForced && currentConfig.url && currentConfig.anonKey) {
      return {
        success: false,
        preUploadCounts,
        error: 'Supabase client is not connected. Cannot perform cloud upload with active credentials.',
      };
    }
    try {
      const saveMock = (key: string, items: any[]) => {
        let store: Record<string, any> = {};
        try {
          const raw = getMockStorageItem(key);
          store = raw ? JSON.parse(raw) : {};
        } catch {
          store = {};
        }
        for (const item of items) {
          store[item.id] = { ...item, owner_id: ownerId, ownerId };
        }
        setMockStorageItem(key, JSON.stringify(store));
      };

      saveMock(MOCK_CLOUD_STUDENTS_KEY, data.students);
      saveMock(MOCK_CLOUD_ATTENDANCE_KEY, data.attendance);
      saveMock(MOCK_CLOUD_TEACHING_KEY, data.teachingLogs);
      saveMock(MOCK_CLOUD_PRACTICAL_KEY, data.practicalProgress);
      saveMock(MOCK_CLOUD_ABSENTEE_KEY, data.absenteeFollowups);

      return {
        success: true,
        preUploadCounts,
        postUploadCounts: preUploadCounts,
      };
    } catch (err: any) {
      return {
        success: false,
        preUploadCounts,
        error: err.message || 'Failed saving to mock cloud storage.',
      };
    }
  }

  try {
    // 1. Serialize all records to snake_case schema
    const serializedStudents = data.students.map((s) => serializeStudentToSupabase(s, ownerId));
    const validStudentIds = new Set(serializedStudents.map((s) => s.id));

    const serializedAttendance = data.attendance.map((a) => serializeAttendanceToSupabase(a, ownerId));
    const serializedTeaching = data.teachingLogs.map((t) => serializeTeachingLogToSupabase(t, ownerId));
    const serializedPractical = data.practicalProgress.map((p) =>
      serializePracticalProgressToSupabase(p, ownerId, validStudentIds)
    );
    const serializedAbsentee = data.absenteeFollowups.map((f) =>
      serializeAbsenteeFollowupToSupabase(f, ownerId, validStudentIds)
    );

    // 2. Conflict Detection across all tables
    const allConflicts: CloudConflict[] = [];
    const [c1, c2, c3, c4, c5] = await Promise.all([
      checkRemoteConflicts(client, 'students', serializedStudents, ownerId),
      checkRemoteConflicts(client, 'attendance', serializedAttendance, ownerId),
      checkRemoteConflicts(client, 'teaching_logs', serializedTeaching, ownerId),
      checkRemoteConflicts(client, 'practical_progress', serializedPractical, ownerId),
      checkRemoteConflicts(client, 'absentee_followups', serializedAbsentee, ownerId),
    ]);
    allConflicts.push(...c1, ...c2, ...c3, ...c4, ...c5);

    if (allConflicts.length > 0) {
      return {
        success: false,
        preUploadCounts,
        conflicts: allConflicts,
        error: `Detected ${allConflicts.length} remote conflict(s). Remote cloud version is newer than local records.`,
      };
    }

    // 3. Foreign Key Ordered Upload: Students first!
    if (serializedStudents.length > 0) {
      const res = await upsertInBatches(client, 'students', serializedStudents);
      if (!res.success) throw new Error(res.error || 'Failed uploading students.');
    }

    // 4. Attendance
    if (serializedAttendance.length > 0) {
      const res = await upsertInBatches(client, 'attendance', serializedAttendance);
      if (!res.success) throw new Error(res.error || 'Failed uploading attendance.');
    }

    // 5. Teaching Logs
    if (serializedTeaching.length > 0) {
      const res = await upsertInBatches(client, 'teaching_logs', serializedTeaching);
      if (!res.success) throw new Error(res.error || 'Failed uploading teaching logs.');
    }

    // 6. Practical Progress
    if (serializedPractical.length > 0) {
      const res = await upsertInBatches(client, 'practical_progress', serializedPractical);
      if (!res.success) throw new Error(res.error || 'Failed uploading practical progress.');
    }

    // 7. Absentee Follow-ups
    if (serializedAbsentee.length > 0) {
      const res = await upsertInBatches(client, 'absentee_followups', serializedAbsentee);
      if (!res.success) throw new Error(res.error || 'Failed uploading absentee followups.');
    }

    // 8. Post-upload Count & Integrity Verification
    const postUploadCounts = await getRemoteWorkspaceCounts(client, ownerId);

    // Verify student count matches
    if (postUploadCounts.students !== preUploadCounts.students) {
      console.warn(
        `[SyncEngine] Cloud student count mismatch: expected ${preUploadCounts.students}, got ${postUploadCounts.students}`
      );
    }

    return {
      success: true,
      preUploadCounts,
      postUploadCounts,
    };
  } catch (err: any) {
    return {
      success: false,
      preUploadCounts,
      error: err.message || 'An error occurred during cloud synchronization.',
    };
  }
}

export interface WorkspaceDownloadResult {
  success: boolean;
  downloadedCounts: {
    students: number;
    attendance: number;
    teaching_logs: number;
    practical_progress: number;
    absentee_followups: number;
  };
  conflictsCount: number;
  error?: string;
}

/**
 * Download all records from the cloud belonging to the authenticated workspace owner.
 * Supports both real Supabase (with RLS isolation) and mock cloud stores.
 */
export async function downloadWorkspaceSnapshotFromSupabase(
  client: SupabaseClient | null,
  ownerId: string,
  callerUserId?: string,
  callerUserEmail?: string
): Promise<{
  success: boolean;
  data?: {
    students: Student[];
    attendance: AttendanceRecord[];
    teachingLogs: TeachingLogEntry[];
    practicalProgress: PracticalProgressEntry[];
    absenteeFollowups: AbsenteeFollowupEntry[];
  };
  error?: string;
}> {
  if (!ownerId) {
    return { success: false, error: 'Authenticated owner ID is required to download cloud records.' };
  }

  // If caller is accessing another owner's workspace, verify approved membership
  if (callerUserId && callerUserId !== ownerId) {
    const membership = await checkUserWorkspaceMembership(callerUserId, callerUserEmail);
    if (!membership || membership.status !== 'approved' || membership.owner_id !== ownerId) {
      return {
        success: false,
        error: 'Access denied: You are not an approved member of this workspace (Supabase RLS Policy: 42501).',
      };
    }
  }

  // 1. Real Supabase Client (bypassed if mockCloudOnlyForced)
  if (client && !mockCloudOnlyForced) {
    try {
      const [stdRes, attRes, teachRes, practRes, absRes] = await Promise.all([
        client.from('students').select('*').eq('owner_id', ownerId),
        client.from('attendance').select('*').eq('owner_id', ownerId),
        client.from('teaching_logs').select('*').eq('owner_id', ownerId),
        client.from('practical_progress').select('*').eq('owner_id', ownerId),
        client.from('absentee_followups').select('*').eq('owner_id', ownerId),
      ]);

      if (stdRes.error) throw new Error(`Students download failed: ${stdRes.error.message}`);
      if (attRes.error) throw new Error(`Attendance download failed: ${attRes.error.message}`);
      if (teachRes.error) throw new Error(`Teaching logs download failed: ${teachRes.error.message}`);
      if (practRes.error) throw new Error(`Practical progress download failed: ${practRes.error.message}`);
      if (absRes.error) throw new Error(`Absentee followups download failed: ${absRes.error.message}`);

      const students = (stdRes.data || []).map(deserializeStudentFromSupabase);
      const attendance = (attRes.data || []).map(deserializeAttendanceFromSupabase);
      const teachingLogs = (teachRes.data || []).map(deserializeTeachingLogFromSupabase);
      const practicalProgress = (practRes.data || []).map(deserializePracticalProgressFromSupabase);
      const absenteeFollowups = (absRes.data || []).map(deserializeAbsenteeFollowupFromSupabase);

      return {
        success: true,
        data: {
          students,
          attendance,
          teachingLogs,
          practicalProgress,
          absenteeFollowups,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to download records from Supabase.' };
    }
  }

  // 2. Mock Cloud Storage fallback only when no live Supabase credentials exist (or mock mode forced)
  if (!mockCloudOnlyForced && currentConfig.url && currentConfig.anonKey) {
    return {
      success: false,
      error: 'Supabase client is not connected. Cannot perform cloud download with active credentials.',
    };
  }

  try {
    const getItems = (key: string): any[] => {
      try {
        const raw = getMockStorageItem(key);
        if (!raw) return [];
        const obj = JSON.parse(raw);
        return Object.values(obj).filter(
          (item: any) => !item.owner_id || item.owner_id === ownerId || item.ownerId === ownerId
        );
      } catch {
        return [];
      }
    };

    return {
      success: true,
      data: {
        students: getItems(MOCK_CLOUD_STUDENTS_KEY),
        attendance: getItems(MOCK_CLOUD_ATTENDANCE_KEY),
        teachingLogs: getItems(MOCK_CLOUD_TEACHING_KEY),
        practicalProgress: getItems(MOCK_CLOUD_PRACTICAL_KEY),
        absenteeFollowups: getItems(MOCK_CLOUD_ABSENTEE_KEY),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to read mock cloud storage.' };
  }
}

// -------------------------------------------------------------
// CLOUD SYNC ADAPTER FOR SINGLE OUTBOX OPERATIONS
// -------------------------------------------------------------

export interface RemoteSyncResponse {
  success: boolean;
  error?: {
    message: string;
    type: 'network' | 'validation' | 'conflict' | 'auth' | 'server';
    remoteData?: any;
  };
}

const SYNC_REQUEST_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number = SYNC_REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Remote sync request timed out after ${ms / 1000}s`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function syncOperationToCloud(
  operation: OutboxOperation,
  userToken?: string,
  ownerId?: string,
  callerRole?: string
): Promise<RemoteSyncResponse> {
  if (callerRole === 'team_member') {
    return {
      success: false,
      error: {
        message: 'Row-level security policy violation (42501): Read-only team members are not permitted to modify cloud records in the owner workspace.',
        type: 'auth',
      },
    };
  }

  // Check simulation mode first
  if (currentConfig.simulationMode === 'offline') {
    return {
      success: false,
      error: {
        message: 'Network is unreachable (Simulated Offline Mode)',
        type: 'network',
      },
    };
  }

  if (currentConfig.simulationMode === 'auth_expired') {
    return {
      success: false,
      error: {
        message: 'Authentication token has expired or is invalid. Please log in again.',
        type: 'auth',
      },
    };
  }

  if (currentConfig.simulationMode === 'server_error') {
    return {
      success: false,
      error: {
        message: 'HTTP 503 Service Unavailable: Remote server temporarily overloaded.',
        type: 'server',
      },
    };
  }

  if (currentConfig.simulationMode === 'conflict_trigger') {
    const fakeRemote = {
      ...operation.payload,
      version: (operation.version || 1) + 5,
      name: (operation.payload as any).name ? `${(operation.payload as any).name} (Cloud Modified)` : undefined,
      updatedAt: new Date(Date.now() + 10000).toISOString(),
    };
    return {
      success: false,
      error: {
        message: 'Conflict detected: Remote version is newer than local version.',
        type: 'conflict',
        remoteData: fakeRemote,
      },
    };
  }

  if (currentConfig.simulationMode === 'check_constraint_class') {
    const studentClass = (operation.payload as any)?.class;
    if (studentClass && !['Class 7', 'Class 8', 'Class 9'].includes(studentClass)) {
      return {
        success: false,
        error: {
          message: `Cloud database check constraint violation (students_class_check): Remote database constraint restricts classes (e.g. to Classes 7-9) and rejected student class "${studentClass}". The student record remains safely preserved offline in IndexedDB pending the required database migration for Classes 1-10.`,
          type: 'validation',
        },
      };
    }
  }

  // 1. If real Supabase credentials are configured and not in explicit mock simulation mode
  const hasCloudConfig =
    Boolean(currentConfig.url && currentConfig.anonKey) &&
    currentConfig.simulationMode !== 'mock' &&
    !mockCloudOnlyForced;
  const client = getSupabase();

  if (hasCloudConfig) {
    if (!client) {
      return {
        success: false,
        error: {
          message: 'Supabase client could not be initialized with configured URL and Key.',
          type: 'network',
        },
      };
    }

    try {
      const targetOwnerId = ownerId || (operation.payload as any).owner_id || (operation.payload as any).ownerId;
      if (!targetOwnerId) {
        return {
          success: false,
          error: {
            message: 'Cannot sync to cloud without authenticated owner ID.',
            type: 'auth',
          },
        };
      }

      const performCloudSync = async (): Promise<RemoteSyncResponse> => {
        if (operation.entityType === 'student') {
          const student = operation.payload as Student;
          const validId = ensureValidUUID(student.id);
          if (operation.operationType === 'DELETE') {
            const { error } = await client
              .from('students')
              .delete()
              .eq('id', validId)
              .eq('owner_id', targetOwnerId);
            if (error) throw error;
            return { success: true };
          } else {
            // Conflict Pre-Check before upserting
            const { data: remoteRecord } = await client
              .from('students')
              .select('id, version, updated_at, name')
              .eq('id', validId)
              .eq('owner_id', targetOwnerId)
              .maybeSingle();

            if (remoteRecord && remoteRecord.version > (student.version || 1)) {
              return {
                success: false,
                error: {
                  message: `Remote conflict: Cloud student record has higher version (${remoteRecord.version} > ${student.version || 1}).`,
                  type: 'conflict',
                  remoteData: remoteRecord,
                },
              };
            }

            const row = serializeStudentToSupabase(student, targetOwnerId);
            const { data: upsertData, error } = await client
              .from('students')
              .upsert(row, { onConflict: 'id' })
              .select('id, owner_id');

            if (error) {
              const errMsg = (error.message || '').toLowerCase();
              const isDuplicateKey =
                errMsg.includes('unique_workspace_student_admission') ||
                errMsg.includes('unique_school_admission') ||
                errMsg.includes('duplicate key') ||
                (error as any).code === '23505';

              if (isDuplicateKey) {
                // When duplicate key occurs, REPLACE or IGNORE gracefully
                const { data: existingStudent } = await client
                  .from('students')
                  .select('id, version, owner_id')
                  .eq('owner_id', targetOwnerId)
                  .eq('school_id', row.school_id)
                  .eq('admission_no', row.admission_no)
                  .maybeSingle();

                if (existingStudent) {
                  // REPLACE: Update cloud record with latest incoming local student attributes
                  const updatePayload = { ...row };
                  delete (updatePayload as any).id;
                  updatePayload.updated_at = new Date().toISOString();
                  updatePayload.version = Math.max(existingStudent.version || 1, student.version || 1) + 1;

                  const { data: updateData, error: updateErr } = await client
                    .from('students')
                    .update(updatePayload)
                    .eq('id', existingStudent.id)
                    .select('id, owner_id');

                  if (!updateErr && updateData && updateData.length > 0 && updateData[0].owner_id === targetOwnerId) {
                    if (existingStudent.id !== validId) {
                      await remapLocalStudentId(validId, existingStudent.id);
                    }
                    return { success: true };
                  }
                  throw updateErr || new Error('Duplicate key resolution update failed: 0 rows written');
                }
                throw error;
              }
              throw error;
            }

            // Confirmed write check: verify PostgreSQL actually committed the row under the correct owner_id
            if (!upsertData || upsertData.length === 0 || upsertData[0].owner_id !== targetOwnerId) {
              return {
                success: false,
                error: {
                  message: `Cloud write unconfirmed: PostgreSQL Row-Level Security blocked the student record or row was not written under expected owner_id "${targetOwnerId}".`,
                  type: 'auth',
                },
              };
            }

            return { success: true };
          }
        } else if (operation.entityType === 'attendance') {
          const attendance = operation.payload as AttendanceRecord;
          if (operation.operationType === 'DELETE') {
            const { error } = await client
              .from('attendance')
              .delete()
              .eq('id', attendance.id)
              .eq('owner_id', targetOwnerId);
            if (error) throw error;
            return { success: true };
          } else {
            // Conflict Pre-Check
            const { data: remoteRecord } = await client
              .from('attendance')
              .select('id, version, updated_at, status')
              .eq('id', attendance.id)
              .eq('owner_id', targetOwnerId)
              .maybeSingle();

            if (remoteRecord && remoteRecord.version > (attendance.version || 1)) {
              return {
                success: false,
                error: {
                  message: `Remote conflict: Cloud attendance record has higher version (${remoteRecord.version} > ${attendance.version || 1}).`,
                  type: 'conflict',
                  remoteData: remoteRecord,
                },
              };
            }

            const row = serializeAttendanceToSupabase(attendance, targetOwnerId);
            const { data: upsertData, error } = await client
              .from('attendance')
              .upsert(row, { onConflict: 'id' })
              .select('id, owner_id');

            if (error) {
              const errMsg = (error.message || '').toLowerCase();
              const isDuplicateDaily =
                errMsg.includes('unique_workspace_student_daily_attendance') ||
                errMsg.includes('unique_student_daily_attendance') ||
                errMsg.includes('duplicate key') ||
                (error as any).code === '23505';

              // Case A: Duplicate daily attendance -> REPLACE with latest marked status
              if (isDuplicateDaily) {
                const { data: updateData, error: updateErr } = await client
                  .from('attendance')
                  .update({
                    status: row.status,
                    remarks: row.remarks,
                    version: (row.version || 1) + 1,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('owner_id', targetOwnerId)
                  .eq('student_id', row.student_id)
                  .eq('date', row.date)
                  .select('id, owner_id');

                if (!updateErr && updateData && updateData.length > 0 && updateData[0].owner_id === targetOwnerId) {
                  return { success: true };
                }
                throw updateErr || new Error('Duplicate daily attendance update failed: 0 rows written');
              }

              // Case B: Foreign key constraint violation (attendance_student_id_fkey or 23503)
              const isFkViolation =
                errMsg.includes('attendance_student_id_fkey') ||
                errMsg.includes('foreign key constraint') ||
                (error as any).code === '23503';

              if (isFkViolation) {
                // Try finding the student in Supabase by admission_no / roll_no or name
                let matchedId: string | null = null;
                const { data: matchedByRoll } = await client
                  .from('students')
                  .select('id')
                  .eq('owner_id', targetOwnerId)
                  .eq('admission_no', attendance.rollNo)
                  .maybeSingle();

                if (matchedByRoll) {
                  matchedId = matchedByRoll.id;
                } else if (attendance.studentName) {
                  const { data: matchedByName } = await client
                    .from('students')
                    .select('id')
                    .eq('owner_id', targetOwnerId)
                    .eq('name', attendance.studentName)
                    .maybeSingle();
                  if (matchedByName) {
                    matchedId = matchedByName.id;
                  }
                }

                if (matchedId) {
                  row.student_id = matchedId;
                  const { data: retryData, error: retryErr } = await client
                    .from('attendance')
                    .upsert(row, { onConflict: 'id' })
                    .select('id, owner_id');
                  if (!retryErr && retryData && retryData.length > 0 && retryData[0].owner_id === targetOwnerId) {
                    return { success: true };
                  }
                  throw retryErr || new Error('Attendance foreign key retry failed: 0 rows written');
                }

                throw error;
              }

              throw error;
            }

            if (!upsertData || upsertData.length === 0 || upsertData[0].owner_id !== targetOwnerId) {
              return {
                success: false,
                error: {
                  message: `Cloud write unconfirmed: PostgreSQL Row-Level Security blocked the attendance record or row was not written under expected owner_id "${targetOwnerId}".`,
                  type: 'auth',
                },
              };
            }

            return { success: true };
          }
        } else if (operation.entityType === 'teaching_log') {
          const log = operation.payload as TeachingLogEntry;
          const validId = ensureValidUUID(log.id);
          if (operation.operationType === 'DELETE') {
            const { error } = await client
              .from('teaching_logs')
              .delete()
              .eq('id', validId)
              .eq('owner_id', targetOwnerId);
            if (error) throw error;
            return { success: true };
          } else {
            // Conflict Pre-Check
            const { data: remoteRecord } = await client
              .from('teaching_logs')
              .select('id, version, updated_at, subject_topic')
              .eq('id', validId)
              .eq('owner_id', targetOwnerId)
              .maybeSingle();

            if (remoteRecord && remoteRecord.version > (log.version || 1)) {
              return {
                success: false,
                error: {
                  message: `Remote conflict: Cloud teaching log has higher version (${remoteRecord.version} > ${log.version || 1}).`,
                  type: 'conflict',
                  remoteData: remoteRecord,
                },
              };
            }

            const row = serializeTeachingLogToSupabase(log, targetOwnerId);
            const { data: upsertData, error } = await client
              .from('teaching_logs')
              .upsert(row, { onConflict: 'id' })
              .select('id, owner_id');
            if (error) throw error;

            if (!upsertData || upsertData.length === 0 || upsertData[0].owner_id !== targetOwnerId) {
              return {
                success: false,
                error: {
                  message: `Cloud write unconfirmed: PostgreSQL Row-Level Security blocked the teaching log or row was not written under expected owner_id "${targetOwnerId}".`,
                  type: 'auth',
                },
              };
            }

            return { success: true };
          }
        } else if (operation.entityType === 'practical_progress') {
          const prog = operation.payload as PracticalProgressEntry;
          const validId = ensureValidUUID(prog.id);
          if (operation.operationType === 'DELETE') {
            const { error } = await client
              .from('practical_progress')
              .delete()
              .eq('id', validId)
              .eq('owner_id', targetOwnerId);
            if (error) throw error;
            return { success: true };
          } else {
            // Conflict Pre-Check
            const { data: remoteRecord } = await client
              .from('practical_progress')
              .select('id, version, updated_at, skill_task')
              .eq('id', validId)
              .eq('owner_id', targetOwnerId)
              .maybeSingle();

            if (remoteRecord && remoteRecord.version > (prog.version || 1)) {
              return {
                success: false,
                error: {
                  message: `Remote conflict: Cloud practical progress has higher version (${remoteRecord.version} > ${prog.version || 1}).`,
                  type: 'conflict',
                  remoteData: remoteRecord,
                },
              };
            }

            const row = serializePracticalProgressToSupabase(prog, targetOwnerId);
            const { data: upsertData, error } = await client
              .from('practical_progress')
              .upsert(row, { onConflict: 'id' })
              .select('id, owner_id');

            if (error) {
              const errMsg = (error.message || '').toLowerCase();
              if (errMsg.includes('foreign key') || (error as any).code === '23503') {
                row.student_id = null;
                const { data: retryData, error: retryErr } = await client
                  .from('practical_progress')
                  .upsert(row, { onConflict: 'id' })
                  .select('id, owner_id');
                if (!retryErr && retryData && retryData.length > 0 && retryData[0].owner_id === targetOwnerId) return { success: true };
                throw retryErr || new Error('Practical progress retry failed: 0 rows written');
              }
              throw error;
            }

            if (!upsertData || upsertData.length === 0 || upsertData[0].owner_id !== targetOwnerId) {
              return {
                success: false,
                error: {
                  message: `Cloud write unconfirmed: PostgreSQL Row-Level Security blocked the practical progress entry or row was not written under expected owner_id "${targetOwnerId}".`,
                  type: 'auth',
                },
              };
            }

            return { success: true };
          }
        } else if (operation.entityType === 'absentee_followup') {
          const followup = operation.payload as AbsenteeFollowupEntry;
          const validId = ensureValidUUID(followup.id);
          if (operation.operationType === 'DELETE') {
            const { error } = await client
              .from('absentee_followups')
              .delete()
              .eq('id', validId)
              .eq('owner_id', targetOwnerId);
            if (error) throw error;
            return { success: true };
          } else {
            // Conflict Pre-Check
            const { data: remoteRecord } = await client
              .from('absentee_followups')
              .select('id, version, updated_at, current_status')
              .eq('id', validId)
              .eq('owner_id', targetOwnerId)
              .maybeSingle();

            if (remoteRecord && remoteRecord.version > (followup.version || 1)) {
              return {
                success: false,
                error: {
                  message: `Remote conflict: Cloud absentee followup has higher version (${remoteRecord.version} > ${followup.version || 1}).`,
                  type: 'conflict',
                  remoteData: remoteRecord,
                },
              };
            }

            const row = serializeAbsenteeFollowupToSupabase(followup, targetOwnerId);
            const { data: upsertData, error } = await client
              .from('absentee_followups')
              .upsert(row, { onConflict: 'id' })
              .select('id, owner_id');

            if (error) {
              const errMsg = (error.message || '').toLowerCase();
              if (errMsg.includes('foreign key') || (error as any).code === '23503') {
                row.student_id = null;
                const { data: retryData, error: retryErr } = await client
                  .from('absentee_followups')
                  .upsert(row, { onConflict: 'id' })
                  .select('id, owner_id');
                if (!retryErr && retryData && retryData.length > 0 && retryData[0].owner_id === targetOwnerId) return { success: true };
                throw retryErr || new Error('Absentee followup retry failed: 0 rows written');
              }
              throw error;
            }

            if (!upsertData || upsertData.length === 0 || upsertData[0].owner_id !== targetOwnerId) {
              return {
                success: false,
                error: {
                  message: `Cloud write unconfirmed: PostgreSQL Row-Level Security blocked the absentee followup or row was not written under expected owner_id "${targetOwnerId}".`,
                  type: 'auth',
                },
              };
            }

            return { success: true };
          }
        }

        return { success: true };
      };

      // Explicitly execute performCloudSync with timeout
      return await withTimeout(performCloudSync(), 15000);
    } catch (err: any) {
      const msg = err?.message || 'Supabase request failed';
      const code = (err as any)?.code;
      const lower = msg.toLowerCase();

      // Check constraint & schema validation violations (e.g., PostgreSQL 23514 students_class_check)
      if (
        code === '23514' ||
        code === '23502' ||
        code === '22P02' ||
        lower.includes('violates check constraint') ||
        lower.includes('check constraint') ||
        lower.includes('students_class_check')
      ) {
        let descriptiveMsg = msg;
        if (lower.includes('students_class_check') || lower.includes('class')) {
          const studentClass = (operation.payload as any)?.class || 'specified class';
          descriptiveMsg = `Cloud database check constraint violation (students_class_check): Remote database constraint restricts classes (e.g. to Classes 7-9) and rejected student class "${studentClass}". The student record remains safely preserved offline in IndexedDB pending the required database migration for Classes 1-10.`;
        } else if (lower.includes('students_status_check') || (lower.includes('status') && lower.includes('check constraint'))) {
          const studentStatus = (operation.payload as any)?.status || 'specified status';
          descriptiveMsg = `Cloud database check constraint violation (students_status_check): Remote database constraint restricts status and rejected "${studentStatus}". The student record remains safely preserved offline in IndexedDB pending the required database migration.`;
        }
        return {
          success: false,
          error: {
            message: descriptiveMsg,
            type: 'validation',
          },
        };
      }

      // Authentication & Row-Level Security errors
      if (
        code === '42501' ||
        lower.includes('jwt') ||
        lower.includes('auth') ||
        lower.includes('token') ||
        lower.includes('violates row-level security')
      ) {
        return { success: false, error: { message: msg, type: 'auth' } };
      }

      // Default to network / temporary transport error
      return { success: false, error: { message: msg, type: 'network' } };
    }
  }

  // 2. Mock Cloud Store: ONLY accessible for offline testing when NO Supabase credentials are configured,
  // or when explicitly requested via simulationMode === 'mock'.
  if (!hasCloudConfig || currentConfig.simulationMode === 'mock') {
  try {
    const keyMap: Record<string, string> = {
      student: MOCK_CLOUD_STUDENTS_KEY,
      attendance: MOCK_CLOUD_ATTENDANCE_KEY,
      teaching_log: MOCK_CLOUD_TEACHING_KEY,
      practical_progress: MOCK_CLOUD_PRACTICAL_KEY,
      absentee_followup: MOCK_CLOUD_ABSENTEE_KEY,
    };

    const storageKey = keyMap[operation.entityType] || MOCK_CLOUD_STUDENTS_KEY;
    let cloudStore: Record<string, any> = {};
    try {
      const raw = getMockStorageItem(storageKey);
      cloudStore = raw ? JSON.parse(raw) : {};
    } catch {
      cloudStore = {};
    }

    const payload = operation.payload as any;
    if (operation.entityType === 'student' && payload?.admissionNo && operation.operationType !== 'DELETE') {
      const duplicateKey = Object.keys(cloudStore).find(
        (id) => id !== payload.id && cloudStore[id].admissionNo === payload.admissionNo
      );
      if (duplicateKey) {
        delete cloudStore[duplicateKey];
      }
    }
    const existing = cloudStore[payload.id];
    if (existing && existing.version > (payload.version || 1) && operation.operationType !== 'DELETE') {
      return {
        success: false,
        error: {
          message: `Remote conflict detected: Cloud record has version ${existing.version}, local is ${payload.version}`,
          type: 'conflict',
          remoteData: existing,
        },
      };
    }

    if (operation.operationType === 'DELETE') {
      delete cloudStore[payload.id];
    } else {
      cloudStore[payload.id] = { ...payload };
    }

    setMockStorageItem(storageKey, JSON.stringify(cloudStore));

    await new Promise((res) => setTimeout(res, 50));
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: {
        message: err.message || 'Mock cloud processing failed',
        type: 'server',
      },
    };
  }
}

  return {
    success: false,
    error: {
      message: 'Cloud sync failed: Live Supabase write could not be confirmed.',
      type: 'network',
    },
  };
}

// SQL Schema generator for Supabase RLS and tables
export function getSupabaseSQLSchema(): string {
  return `-- ============================================================================
-- GBHS COMPUTER OPERATOR RECORD MANAGEMENT — SAFE SUPABASE MIGRATION SCRIPT
-- ============================================================================
-- 1. Multi-tenant workspace isolation (each user owns their own data by default).
-- 2. Non-recursive Row Level Security (RLS) policies for performance & safety.
-- 3. Owner Full Access (CRUD) to their workspace.
-- 4. Team Member Read-Only Access (SELECT only; writes/deletes blocked).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'team_member', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.school_profiles (
    owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_name TEXT NOT NULL DEFAULT 'Govt Boys High School Jam Yousuf Colony',
    school_short_name TEXT DEFAULT 'GBHS Jam Yousuf Colony',
    district TEXT DEFAULT 'Hub, Lasbela',
    principal_name TEXT DEFAULT 'Prof. Abdul Rasheed',
    principal_phone TEXT,
    emis_code TEXT DEFAULT 'GBHS-MAIN',
    address TEXT DEFAULT 'Jam Yousuf Colony, Hub, Balochistan',
    academic_year TEXT DEFAULT '2026-2027',
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    member_email TEXT NOT NULL,
    member_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    access_level TEXT NOT NULL DEFAULT 'read_only' CHECK (access_level IN ('read_only', 'read_write')),
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'revoked')),
    invited_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_owner_member_email UNIQUE (owner_id, member_email)
);

CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    serial_no TEXT,
    roll_no TEXT NOT NULL,
    district TEXT,
    school_name TEXT,
    trade TEXT,
    name TEXT NOT NULL,
    father_name TEXT NOT NULL,
    gender TEXT,
    dob TEXT,
    class TEXT NOT NULL CHECK (class IN ('Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10')),
    date_of_center_beginning TEXT,
    guardian_contact TEXT,
    registered_status TEXT,
    admission_no TEXT NOT NULL,
    section TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Withdrawn', 'Transferred')),
    admission_date TEXT,
    b_form_no TEXT,
    father_cnic TEXT,
    father_occupation TEXT,
    caste TEXT,
    religion TEXT,
    blood_group TEXT,
    emergency_contact TEXT,
    permanent_address TEXT,
    previous_school TEXT,
    previous_class TEXT,
    slc_no TEXT,
    guardian_name TEXT,
    guardian_relation TEXT,
    identification_mark TEXT,
    monthly_income TEXT,
    medium_of_instruction TEXT,
    remarks TEXT,
    withdrawal_reason TEXT,
    withdrawn_date DATE,
    transfer_details TEXT,
    transferred_date DATE,
    replaced_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    replacement_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    school_id TEXT NOT NULL DEFAULT 'GBHS-MAIN',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_workspace_student_admission UNIQUE (owner_id, school_id, admission_no)
);

CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    roll_no TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10')),
    section TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Leave', 'Late')),
    remarks TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    school_id TEXT NOT NULL DEFAULT 'GBHS-MAIN',
    marked_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_workspace_student_daily_attendance UNIQUE (owner_id, student_id, date)
);

CREATE TABLE IF NOT EXISTS public.teaching_logs (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    day TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10')),
    subject_topic TEXT NOT NULL,
    learning_objectives TEXT,
    theory_covered TEXT,
    practical_activity TEXT,
    total_registered INTEGER NOT NULL DEFAULT 0,
    students_present INTEGER NOT NULL DEFAULT 0,
    students_completing_task INTEGER NOT NULL DEFAULT 0,
    students_needing_help INTEGER NOT NULL DEFAULT 0,
    teaching_method TEXT,
    issue_challenge TEXT,
    evidence_file_name TEXT,
    next_lesson TEXT,
    instructor_name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.practical_progress (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assessment_date DATE NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    registration_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10')),
    skill_task TEXT NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    practical_completed TEXT NOT NULL DEFAULT 'No' CHECK (practical_completed IN ('Yes', 'No', 'In Progress')),
    score_marks NUMERIC NOT NULL DEFAULT 0,
    skill_status TEXT NOT NULL DEFAULT 'Not Started' CHECK (skill_status IN ('Proficient', 'Competent', 'Needs Improvement', 'Not Started')),
    weak_area TEXT,
    remedial_practice_required TEXT NOT NULL DEFAULT 'No' CHECK (remedial_practice_required IN ('Yes', 'No')),
    reassessment_date DATE,
    evidence_file TEXT,
    instructor_remarks TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.absentee_followups (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    registration_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10')),
    absence_count INTEGER NOT NULL DEFAULT 1,
    followup_reason TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    response_received TEXT NOT NULL,
    expected_return_date DATE,
    followup_date DATE NOT NULL,
    current_status TEXT NOT NULL DEFAULT 'Pending Return' CHECK (current_status IN ('Pending Return', 'Resolved / Returned', 'Escalated', 'Prolonged Leave')),
    management_referral TEXT NOT NULL DEFAULT 'No' CHECK (management_referral IN ('Yes', 'No')),
    remarks TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practical_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absentee_followups ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PROFILES RLS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own and team profiles" ON public.profiles;
CREATE POLICY "Users view own and team profiles" ON public.profiles
    FOR SELECT USING (
        id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.owner_id = auth.uid() AND wm.member_id = profiles.id
        )
    );

DROP POLICY IF EXISTS "Users insert/update own profile" ON public.profiles;
CREATE POLICY "Users insert/update own profile" ON public.profiles
    FOR ALL USING (id = auth.uid());

-- ----------------------------------------------------------------------------
-- WORKSPACE MEMBERS RLS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners manage their workspace members" ON public.workspace_members;
CREATE POLICY "Owners manage their workspace members" ON public.workspace_members
    FOR ALL USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Members view their own membership" ON public.workspace_members;
CREATE POLICY "Members view their own membership" ON public.workspace_members
    FOR SELECT USING (
        member_id = auth.uid() OR
        member_email = (auth.jwt() ->> 'email')
    );

-- ----------------------------------------------------------------------------
-- STUDENTS RLS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Students read access (Owner or Approved Team Member)" ON public.students;
CREATE POLICY "Students read access (Owner or Approved Team Member)" ON public.students
    FOR SELECT USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.owner_id = students.owner_id
              AND (wm.member_id = auth.uid() OR wm.member_email = (auth.jwt() ->> 'email'))
              AND wm.status = 'approved'
        )
    );

DROP POLICY IF EXISTS "Students insert access (Owner Only)" ON public.students;
CREATE POLICY "Students insert access (Owner Only)" ON public.students
    FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Students update access (Owner Only)" ON public.students;
CREATE POLICY "Students update access (Owner Only)" ON public.students
    FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Students delete access (Owner Only)" ON public.students;
CREATE POLICY "Students delete access (Owner Only)" ON public.students
    FOR DELETE USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ATTENDANCE RLS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Attendance read access (Owner or Approved Team Member)" ON public.attendance;
CREATE POLICY "Attendance read access (Owner or Approved Team Member)" ON public.attendance
    FOR SELECT USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.owner_id = attendance.owner_id
              AND (wm.member_id = auth.uid() OR wm.member_email = (auth.jwt() ->> 'email'))
              AND wm.status = 'approved'
        )
    );

DROP POLICY IF EXISTS "Attendance insert access (Owner Only)" ON public.attendance;
CREATE POLICY "Attendance insert access (Owner Only)" ON public.attendance
    FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Attendance update access (Owner Only)" ON public.attendance;
CREATE POLICY "Attendance update access (Owner Only)" ON public.attendance
    FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Attendance delete access (Owner Only)" ON public.attendance;
CREATE POLICY "Attendance delete access (Owner Only)" ON public.attendance
    FOR DELETE USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- TEACHING LOGS RLS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teaching logs read access (Owner or Approved Team Member)" ON public.teaching_logs;
CREATE POLICY "Teaching logs read access (Owner or Approved Team Member)" ON public.teaching_logs
    FOR SELECT USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.owner_id = teaching_logs.owner_id
              AND (wm.member_id = auth.uid() OR wm.member_email = (auth.jwt() ->> 'email'))
              AND wm.status = 'approved'
        )
    );

DROP POLICY IF EXISTS "Teaching logs insert access (Owner Only)" ON public.teaching_logs;
CREATE POLICY "Teaching logs insert access (Owner Only)" ON public.teaching_logs
    FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Teaching logs update access (Owner Only)" ON public.teaching_logs;
CREATE POLICY "Teaching logs update access (Owner Only)" ON public.teaching_logs
    FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Teaching logs delete access (Owner Only)" ON public.teaching_logs;
CREATE POLICY "Teaching logs delete access (Owner Only)" ON public.teaching_logs
    FOR DELETE USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- PRACTICAL PROGRESS RLS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Practical progress read access (Owner or Approved Team Member)" ON public.practical_progress;
CREATE POLICY "Practical progress read access (Owner or Approved Team Member)" ON public.practical_progress
    FOR SELECT USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.owner_id = practical_progress.owner_id
              AND (wm.member_id = auth.uid() OR wm.member_email = (auth.jwt() ->> 'email'))
              AND wm.status = 'approved'
        )
    );

DROP POLICY IF EXISTS "Practical progress insert access (Owner Only)" ON public.practical_progress;
CREATE POLICY "Practical progress insert access (Owner Only)" ON public.practical_progress
    FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Practical progress update access (Owner Only)" ON public.practical_progress
    FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Practical progress delete access (Owner Only)" ON public.practical_progress
    FOR DELETE USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ABSENTEE FOLLOWUPS RLS POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Absentee followups read access (Owner or Approved Team Member)" ON public.absentee_followups;
CREATE POLICY "Absentee followups read access (Owner or Approved Team Member)" ON public.absentee_followups
    FOR SELECT USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.owner_id = absentee_followups.owner_id
              AND (wm.member_id = auth.uid() OR wm.member_email = (auth.jwt() ->> 'email'))
              AND wm.status = 'approved'
        )
    );

DROP POLICY IF EXISTS "Absentee followups insert access (Owner Only)" ON public.absentee_followups;
CREATE POLICY "Absentee followups insert access (Owner Only)" ON public.absentee_followups
    FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Absentee followups update access (Owner Only)" ON public.absentee_followups
    FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Absentee followups delete access (Owner Only)" ON public.absentee_followups
    FOR DELETE USING (owner_id = auth.uid());
`;
}

// ----------------------------------------------------------------------------
// WORKSPACE MEMBERSHIP DATA ACCESS & MANAGEMENT
// ----------------------------------------------------------------------------

export async function fetchWorkspaceMembers(ownerId: string): Promise<WorkspaceMember[]> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('workspace_members')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });
      if (!error && data) return data as WorkspaceMember[];
    } catch {
      // Fall through to mock store
    }
  }

  // Mock store fallback
  try {
    const raw = getMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY);
    const store: Record<string, WorkspaceMember> = raw ? JSON.parse(raw) : {};
    return Object.values(store).filter((m) => m.owner_id === ownerId);
  } catch {
    return [];
  }
}

export async function addWorkspaceMember(
  ownerId: string,
  memberEmail: string,
  invitedBy: string,
  initialStatus: 'pending' | 'approved' = 'pending',
  initialAccessLevel: 'read_only' | 'read_write' = 'read_only'
): Promise<{ success: boolean; member?: WorkspaceMember; error?: string }> {
  const normalized = memberEmail.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const status = invitedBy === 'self_registration' ? 'approved' : initialStatus;
  const access_level = invitedBy === 'self_registration' ? 'read_write' : initialAccessLevel;

  const newMember: WorkspaceMember = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    member_email: normalized,
    access_level,
    status,
    invited_by: invitedBy,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('workspace_members')
        .insert(newMember)
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, member: data as WorkspaceMember };
    } catch {
      // Fall through to mock store
    }
  }

  // Mock store fallback
  try {
    const raw = getMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY);
    const store: Record<string, WorkspaceMember> = raw ? JSON.parse(raw) : {};
    const existing = Object.values(store).find(
      (m) => m.owner_id === ownerId && m.member_email.toLowerCase() === normalized
    );
    if (existing) {
      return { success: false, error: 'This email is already in your workspace members list.' };
    }
    store[newMember.id] = newMember;
    setMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY, JSON.stringify(store));
    return { success: true, member: newMember };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add workspace member.' };
  }
}

export async function updateWorkspaceMemberStatus(
  memberId: string,
  status: 'approved' | 'revoked' | 'pending',
  accessLevel?: 'read_only' | 'read_write'
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
  const updatePayload: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (accessLevel) {
    updatePayload.access_level = accessLevel;
  }

  if (sb) {
    try {
      const { error } = await sb
        .from('workspace_members')
        .update(updatePayload)
        .eq('id', memberId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch {
      // Fall through to mock store
    }
  }

  // Mock store fallback
  try {
    const raw = getMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY);
    const store: Record<string, WorkspaceMember> = raw ? JSON.parse(raw) : {};
    if (store[memberId]) {
      store[memberId].status = status;
      if (accessLevel) {
        store[memberId].access_level = accessLevel;
      }
      store[memberId].updated_at = new Date().toISOString();
      setMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY, JSON.stringify(store));
      return { success: true };
    }
    return { success: false, error: 'Member not found.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update member status.' };
  }
}


export async function removeWorkspaceMember(
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb.from('workspace_members').delete().eq('id', memberId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch {
      // Fall through to mock store
    }
  }

  // Mock store fallback
  try {
    const raw = getMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY);
    const store: Record<string, WorkspaceMember> = raw ? JSON.parse(raw) : {};
    delete store[memberId];
    setMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY, JSON.stringify(store));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to remove member.' };
  }
}

export async function checkUserWorkspaceMembership(
  userId: string,
  email?: string
): Promise<WorkspaceMember | null> {
  const sb = getSupabase();
  const normalized = (email || '').trim().toLowerCase();

  if (sb) {
    try {
      let query = sb.from('workspace_members').select('*').eq('status', 'approved');
      if (normalized) {
        query = query.or(`member_id.eq.${userId},member_email.eq.${normalized}`);
      } else {
        query = query.eq('member_id', userId);
      }
      const { data } = await query.maybeSingle();
      if (data) {
        if (!data.member_id && userId) {
          await sb.from('workspace_members').update({ member_id: userId }).eq('id', data.id);
        }
        return data as WorkspaceMember;
      }
    } catch {
      // Fall through to mock store
    }
  }

  // Mock store fallback
  try {
    const raw = getMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY);
    const store: Record<string, WorkspaceMember> = raw ? JSON.parse(raw) : {};
    const found = Object.values(store).find(
      (m) =>
        m.status === 'approved' &&
        (m.member_id === userId || (normalized && m.member_email.toLowerCase() === normalized))
    );
    if (found) {
      if (!found.member_id && userId) {
        found.member_id = userId;
        store[found.id] = found;
        setMockStorageItem(MOCK_WORKSPACE_MEMBERS_KEY, JSON.stringify(store));
      }
      return found;
    }
    return null;
  } catch {
    return null;
  }
}

