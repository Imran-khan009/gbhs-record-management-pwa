import { Student, AttendanceRecord, ClassLevel, Section, StudentStatus, AttendanceStatus } from '../types/student';
import {
  getAllStudents,
  getStudentById,
  findStudentByAdmissionNo,
  saveStudentLocally,
  deleteStudentLocally,
  bulkSaveStudentsLocally,
  clearAllStudentsLocally,
  clearStudentsByClassLocally,
  saveAttendanceLocally,
  bulkSaveAttendanceLocally,
  getAttendanceByDateAndClass,
  getAllAttendanceRecords,
  enqueueOutboxOperation,
  getAppState,
  setAppState,
  getAllPracticalProgress,
  getAllAbsenteeFollowups,
  getAllTeachingLogs,
  getDB,
} from './db';
import { OutboxOperation } from '../types/sync';
import { syncEngine } from './syncEngine';
import { getWorkspacePermissions } from './permissionService';
import { normalizeClass } from './classNormalizationService';

const DEFAULT_SCHOOL_ID = 'GBHS-MAIN';

export async function createStudent(
  data: Omit<Student, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'schoolId' | 'createdBy'>,
  userEmail: string
): Promise<{ success: boolean; student?: Student; error?: string }> {
  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    return {
      success: false,
      error: 'Permission denied: Read-only team members cannot add student records.',
    };
  }

  // Check duplicate admission number locally
  const existing = await findStudentByAdmissionNo(data.admissionNo);
  if (existing) {
    return {
      success: false,
      error: `Admission No "${data.admissionNo}" is already assigned to student "${existing.name}" (${existing.class} - ${existing.section}).`,
    };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const workspaceOwnerId = session?.user.workspaceOwnerId || session?.user.id;
  const normalizedClass = (data.class ? normalizeClass(data.class) : null) || data.class;

  const newStudent: Student = {
    ...data,
    class: normalizedClass,
    id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    schoolId: DEFAULT_SCHOOL_ID,
    createdBy: userEmail,
    owner_id: workspaceOwnerId,
    ownerId: workspaceOwnerId,
  };

  // 1. Save locally in IndexedDB
  await saveStudentLocally(newStudent);

  // 2. Enqueue in Outbox queue
  const op: OutboxOperation = {
    opId: crypto.randomUUID(),
    entityId: id,
    entityType: 'student',
    operationType: 'CREATE',
    payload: newStudent,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    userEmail,
    version: 1,
  };
  await enqueueOutboxOperation(op);

  // 3. Trigger sync process
  syncEngine.processQueue();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: newStudent }));
  }

  return { success: true, student: newStudent };
}

export async function updateStudent(
  id: string,
  updates: Partial<Omit<Student, 'id' | 'createdAt' | 'schoolId' | 'createdBy'>>,
  userEmail: string
): Promise<{ success: boolean; student?: Student; error?: string }> {
  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    return {
      success: false,
      error: 'Permission denied: Read-only team members cannot edit student records.',
    };
  }

  const current = await getStudentById(id);
  if (!current) {
    return { success: false, error: 'Student record not found in local database.' };
  }

  // Check admission number conflict if changed
  if (updates.admissionNo && updates.admissionNo !== current.admissionNo) {
    const existing = await findStudentByAdmissionNo(updates.admissionNo);
    if (existing && existing.id !== id) {
      return {
        success: false,
        error: `Admission No "${updates.admissionNo}" is already in use by "${existing.name}".`,
      };
    }
  }

  if (updates.class) {
    updates.class = (normalizeClass(updates.class) || updates.class) as ClassLevel;
  }

  const now = new Date().toISOString();
  const updatedStudent: Student = {
    ...current,
    ...updates,
    version: current.version + 1,
    updatedAt: now,
  };

  await saveStudentLocally(updatedStudent);

  const op: OutboxOperation = {
    opId: crypto.randomUUID(),
    entityId: id,
    entityType: 'student',
    operationType: 'UPDATE',
    payload: updatedStudent,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    userEmail,
    version: updatedStudent.version,
  };
  await enqueueOutboxOperation(op);

  syncEngine.processQueue();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: updatedStudent }));
  }

  return { success: true, student: updatedStudent };
}

export async function updateStudentStatus(
  id: string,
  status: StudentStatus,
  reasonOrDetails: string | undefined,
  userEmail: string
): Promise<{ success: boolean; student?: Student; error?: string }> {
  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    return {
      success: false,
      error: 'Permission denied: Read-only team members cannot update student status.',
    };
  }

  const current = await getStudentById(id);
  if (!current) {
    return { success: false, error: 'Student record not found in local database.' };
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const updates: Partial<Student> = {
    status,
    registeredStatus: status === 'Active' ? 'Registerd' : status,
    updatedAt: now,
    version: current.version + 1,
  };

  if (status === 'Withdrawn') {
    updates.withdrawalReason = reasonOrDetails || current.withdrawalReason || 'Withdrawn';
    updates.withdrawnDate = today;
  } else if (status === 'Transferred') {
    updates.transferDetails = reasonOrDetails || current.transferDetails || 'Transferred';
    updates.transferredDate = today;
  } else if (status === 'Active') {
    if (current.status === 'Withdrawn' || current.status === 'Transferred') {
      updates.remarks = current.remarks
        ? `${current.remarks} | Reactivated on ${today}`
        : `Reactivated on ${today}`;
    }
  }

  const updatedStudent: Student = {
    ...current,
    ...updates,
  };

  await saveStudentLocally(updatedStudent);

  const op: OutboxOperation = {
    opId: crypto.randomUUID(),
    entityId: id,
    entityType: 'student',
    operationType: 'UPDATE',
    payload: updatedStudent,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    userEmail,
    version: updatedStudent.version,
  };
  await enqueueOutboxOperation(op);

  syncEngine.processQueue();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: updatedStudent }));
  }

  return { success: true, student: updatedStudent };
}

export async function withdrawStudent(
  id: string,
  reason: string,
  userEmail: string
): Promise<{ success: boolean; student?: Student; error?: string }> {
  return updateStudentStatus(id, 'Withdrawn', reason, userEmail);
}

export async function transferStudent(
  id: string,
  destination: string,
  userEmail: string
): Promise<{ success: boolean; student?: Student; error?: string }> {
  return updateStudentStatus(id, 'Transferred', destination, userEmail);
}

export async function reactivateStudent(
  id: string,
  userEmail: string
): Promise<{ success: boolean; student?: Student; error?: string }> {
  return updateStudentStatus(id, 'Active', undefined, userEmail);
}

export async function replaceStudent(
  withdrawnStudentId: string,
  newStudentData: Omit<Student, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'schoolId' | 'createdBy'>,
  userEmail: string
): Promise<{
  success: boolean;
  withdrawnStudent?: Student;
  replacementStudent?: Student;
  error?: string;
}> {
  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    return {
      success: false,
      error: 'Permission denied: Read-only team members cannot replace student records.',
    };
  }

  const current = await getStudentById(withdrawnStudentId);
  if (!current) {
    return { success: false, error: 'Target student to replace was not found.' };
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const newStudentId = crypto.randomUUID();

  // Ensure unique admission number for replacement student
  let newAdmissionNo = newStudentData.admissionNo;
  if (!newAdmissionNo || newAdmissionNo === current.admissionNo) {
    newAdmissionNo = `${current.admissionNo}-R`;
  }

  const workspaceOwnerId = session?.user.workspaceOwnerId || session?.user.id;
  const normalizedClass = (newStudentData.class ? normalizeClass(newStudentData.class) : null) || newStudentData.class;

  const replacementStudent: Student = {
    ...newStudentData,
    id: newStudentId,
    admissionNo: newAdmissionNo,
    class: normalizedClass,
    status: 'Active',
    registeredStatus: 'Registerd',
    replacedStudentId: current.id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    schoolId: current.schoolId || DEFAULT_SCHOOL_ID,
    createdBy: userEmail,
    owner_id: workspaceOwnerId,
    ownerId: workspaceOwnerId,
  };

  const updatedWithdrawnStudent: Student = {
    ...current,
    status: 'Withdrawn',
    registeredStatus: 'Withdrawn',
    withdrawalReason: current.withdrawalReason || `Replaced by ${replacementStudent.name} (Roll #${replacementStudent.rollNo})`,
    withdrawnDate: current.withdrawnDate || today,
    replacementStudentId: newStudentId,
    version: current.version + 1,
    updatedAt: now,
  };

  // 1. Save both locally in IndexedDB
  await saveStudentLocally(updatedWithdrawnStudent);
  await saveStudentLocally(replacementStudent);

  // 2. Queue outbox operations for both
  await enqueueOutboxOperation({
    opId: crypto.randomUUID(),
    entityId: updatedWithdrawnStudent.id,
    entityType: 'student',
    operationType: 'UPDATE',
    payload: updatedWithdrawnStudent,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    userEmail,
    version: updatedWithdrawnStudent.version,
  });

  await enqueueOutboxOperation({
    opId: crypto.randomUUID(),
    entityId: replacementStudent.id,
    entityType: 'student',
    operationType: 'CREATE',
    payload: replacementStudent,
    timestamp: Date.now() + 1,
    status: 'pending',
    retryCount: 0,
    userEmail,
    version: 1,
  });

  syncEngine.processQueue();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: replacementStudent }));
  }

  return {
    success: true,
    withdrawnStudent: updatedWithdrawnStudent,
    replacementStudent,
  };
}

export async function deleteStudent(
  id: string,
  userEmail: string,
  options?: { forcePermanent?: boolean; reason?: string }
): Promise<{ success: boolean; error?: string; softDeleted?: boolean }> {
  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    return {
      success: false,
      error: 'Permission denied: Read-only team members cannot delete or withdraw student records.',
    };
  }

  const current = await getStudentById(id);
  if (!current) {
    return { success: false, error: 'Student record not found.' };
  }

  // Check if student has attendance records
  const allAtt = await getAllAttendanceRecords();
  const studentAtt = allAtt.filter((a) => a.studentId === id);
  const hasHistory = studentAtt.length > 0;

  // Never permanently delete students through normal workflows; preserve all historical records
  if (!options?.forcePermanent || hasHistory) {
    const res = await updateStudentStatus(
      id,
      'Withdrawn',
      options?.reason || 'Withdrawn via student management',
      userEmail
    );
    return { success: res.success, error: res.error, softDeleted: true };
  }

  // Only if forcePermanent is explicitly requested AND student has zero history
  await deleteStudentLocally(id);

  const op: OutboxOperation = {
    opId: crypto.randomUUID(),
    entityId: id,
    entityType: 'student',
    operationType: 'DELETE',
    payload: { id },
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    userEmail,
    version: current.version,
  };
  await enqueueOutboxOperation(op);

  syncEngine.processQueue();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: { id } }));
  }

  return { success: true, softDeleted: false };
}

// -------------------------------------------------------------
// ATTENDANCE OPERATIONS & ENROLLMENT PERIOD VALIDATION
// -------------------------------------------------------------

export interface AttendanceEnrollmentValidation {
  isValid: boolean;
  isOutsideEnrollment: boolean;
  type?: 'before_enrollment' | 'after_withdrawal' | 'after_transfer';
  warningType?: 'before_enrollment' | 'after_withdrawal' | 'after_transfer' | 'none';
  message?: string;
  reason?: string;
  details?: string;
  isHistoricalEnrollment?: boolean;
}

/**
 * Validates whether an attendance date falls within a student's active enrollment window.
 * Respects center beginning / admission date, withdrawal date, and transfer date.
 */
export function validateAttendanceEnrollmentDate(
  student: Student,
  date: string
): AttendanceEnrollmentValidation {
  const enrollmentDate = student.dateOfCenterBeginning || student.admissionDate;
  if (enrollmentDate && date < enrollmentDate) {
    const msg = `Date ${date} is prior to enrollment date (${enrollmentDate}) for ${student.name}.`;
    return {
      isValid: false,
      isOutsideEnrollment: true,
      type: 'before_enrollment',
      warningType: 'before_enrollment',
      message: msg,
      reason: msg,
      details: `Student began center enrollment on ${enrollmentDate}. Selected date is prior to enrollment.`,
    };
  }

  if (student.status === 'Withdrawn' && student.withdrawnDate && date > student.withdrawnDate) {
    const msg = `Date ${date} is after withdrawal date (${student.withdrawnDate}) for ${student.name}.`;
    return {
      isValid: false,
      isOutsideEnrollment: true,
      type: 'after_withdrawal',
      warningType: 'after_withdrawal',
      message: msg,
      reason: msg,
      details: `Student officially withdrew on ${student.withdrawnDate}. Historical backfill can proceed if confirmed.`,
    };
  }

  if (student.status === 'Transferred' && student.transferredDate && date > student.transferredDate) {
    const msg = `Date ${date} is after transfer date (${student.transferredDate}) for ${student.name}.`;
    return {
      isValid: false,
      isOutsideEnrollment: true,
      type: 'after_transfer',
      warningType: 'after_transfer',
      message: msg,
      reason: msg,
      details: `Student officially transferred out on ${student.transferredDate}. Historical backfill can proceed if confirmed.`,
    };
  }

  const isHistorical = student.status !== 'Active';
  const msg = isHistorical
    ? `${student.name} is currently ${student.status}, but date ${date} is within their active enrollment window.`
    : undefined;
  return {
    isValid: true,
    isOutsideEnrollment: false,
    warningType: 'none',
    isHistoricalEnrollment: isHistorical,
    message: msg,
    reason: msg,
    details: isHistorical ? `Date ${date} is within student enrollment window.` : undefined,
  };
}

export async function markSingleAttendance(
  student: Student,
  date: string,
  status: AttendanceStatus,
  remarks: string | undefined,
  userEmail: string
): Promise<AttendanceRecord> {
  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    throw new Error('Permission denied: Read-only team members cannot mark attendance.');
  }

  const compositeId = `${student.id}_${date}`;
  const now = new Date().toISOString();

  const record: AttendanceRecord = {
    id: compositeId,
    studentId: student.id,
    studentName: student.name,
    rollNo: student.rollNo,
    class: student.class,
    section: student.section,
    date,
    status,
    remarks,
    version: 1,
    updatedAt: now,
    schoolId: DEFAULT_SCHOOL_ID,
    markedBy: userEmail,
  };

  await saveAttendanceLocally(record);

  const op: OutboxOperation = {
    opId: crypto.randomUUID(),
    entityId: compositeId,
    entityType: 'attendance',
    operationType: 'UPDATE',
    payload: record,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    userEmail,
    version: 1,
  };
  await enqueueOutboxOperation(op);

  syncEngine.processQueue();

  return record;
}

export async function saveBulkAttendance(
  records: AttendanceRecord[],
  userEmail: string
): Promise<void> {
  if (records.length === 0) return;

  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    throw new Error('Permission denied: Read-only team members cannot modify attendance.');
  }

  await bulkSaveAttendanceLocally(records);

  for (const record of records) {
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: record.id,
      entityType: 'attendance',
      operationType: 'UPDATE',
      payload: record,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: record.version,
    };
    await enqueueOutboxOperation(op);
  }

  syncEngine.processQueue();
}

// -------------------------------------------------------------
// PURGE / RESET ALL STUDENT DATA (For fresh spreadsheet imports)
// -------------------------------------------------------------

export interface DeleteAllStudentsOptions {
  /**
   * If true, explicitly authorizes purging student records along with their linked historical records
   * rather than leaving them orphaned.
   * Requires confirmationPhrase === CONFIRM_PURGE_PHRASE.
   */
  confirmPurgeHistory?: boolean;
  /**
   * Confirmation phrase required when confirmPurgeHistory is true.
   */
  confirmationPhrase?: string;
  /**
   * Explicit scope of historical records to purge if confirmPurgeHistory is true.
   * Defaults to: { attendance: true, practicalProgress: true, absenteeFollowups: true, teachingLogs: false }
   */
  purgeScope?: {
    attendance?: boolean;
    practicalProgress?: boolean;
    absenteeFollowups?: boolean;
    teachingLogs?: boolean;
  };
}

export const CONFIRM_PURGE_PHRASE = 'CONFIRM_PURGE_STUDENTS_AND_HISTORY';

export interface StudentHistorySummary {
  attendanceCount: number;
  practicalCount: number;
  absenteeFollowupCount: number;
  teachingLogCount: number;
  totalHistoricalRecords: number;
  hasHistory: boolean;
  summaryText: string;
}

/**
 * Inspect linked historical records for students in the active workspace.
 */
export async function getLinkedHistorySummary(): Promise<StudentHistorySummary> {
  const [attendance, practicals, followups, teachingLogs] = await Promise.all([
    getAllAttendanceRecords(),
    getAllPracticalProgress(),
    getAllAbsenteeFollowups(),
    getAllTeachingLogs(),
  ]);

  const attendanceCount = attendance.length;
  const practicalCount = practicals.length;
  const absenteeFollowupCount = followups.length;
  const teachingLogCount = teachingLogs.length;
  const totalHistoricalRecords =
    attendanceCount + practicalCount + absenteeFollowupCount + teachingLogCount;
  const hasHistory = totalHistoricalRecords > 0;

  const parts: string[] = [];
  if (attendanceCount > 0) parts.push(`${attendanceCount} attendance record(s)`);
  if (practicalCount > 0) parts.push(`${practicalCount} practical assessment(s)`);
  if (absenteeFollowupCount > 0) parts.push(`${absenteeFollowupCount} absentee follow-up(s)`);
  if (teachingLogCount > 0) parts.push(`${teachingLogCount} curriculum teaching log(s)`);

  const summaryText = parts.length > 0 ? parts.join(', ') : 'No linked historical records';

  return {
    attendanceCount,
    practicalCount,
    absenteeFollowupCount,
    teachingLogCount,
    totalHistoricalRecords,
    hasHistory,
    summaryText,
  };
}

/**
 * Safely delete all student records in the active workspace.
 * 
 * SAFEGUARD:
 * If any linked historical records (attendance, practicals, absentee follow-ups, or teaching logs) exist,
 * this function strictly BLOCKS destructive deletion and throws an error explaining why,
 * preventing orphaned records and silent data loss.
 * 
 * If a full purge is explicitly intended by an authorized Workspace Owner, it requires
 * confirmPurgeHistory: true and the exact confirmation phrase "CONFIRM_PURGE_STUDENTS_AND_HISTORY".
 */
export async function deleteAllStudentsData(
  userEmail: string,
  options?: DeleteAllStudentsOptions
): Promise<number> {
  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    throw new Error('Permission denied: Read-only team members cannot delete or purge student data.');
  }

  const allStudents = await getAllStudents();
  const count = allStudents.length;

  if (count === 0) {
    return 0;
  }

  // Check for linked historical records across attendance, practicals, follow-ups, and teaching logs
  const history = await getLinkedHistorySummary();

  if (history.hasHistory && !options?.confirmPurgeHistory) {
    throw new Error(
      `Cannot delete all students: Destructive deletion blocked because ${history.summaryText} exist in this workspace. Bulk student deletion is blocked to prevent orphaned records and data loss. Please withdraw inactive students individually via Student Management or archive historical records before purging.`
    );
  }

  if (history.hasHistory && options?.confirmPurgeHistory) {
    // Purging historical records requires Workspace Owner authorization
    if (!permissions.isOwner) {
      throw new Error('Permission denied: Only the Workspace Owner can authorize a full historical data purge.');
    }

    if (options.confirmationPhrase !== CONFIRM_PURGE_PHRASE) {
      throw new Error(
        `Destructive purge confirmation failed: Invalid confirmation phrase. Expected "${CONFIRM_PURGE_PHRASE}".`
      );
    }

    // Execute scoped purge: clear students AND linked historical records, enqueuing outbox deletion ops for all
    const purgeAttendance = options.purgeScope?.attendance !== false;
    const purgePracticals = options.purgeScope?.practicalProgress !== false;
    const purgeFollowups = options.purgeScope?.absenteeFollowups !== false;
    const purgeTeachingLogs = options.purgeScope?.teachingLogs === true;

    const [attendanceRecords, practicalRecords, followupRecords, teachingLogRecords] = await Promise.all([
      purgeAttendance ? getAllAttendanceRecords() : Promise.resolve([]),
      purgePracticals ? getAllPracticalProgress() : Promise.resolve([]),
      purgeFollowups ? getAllAbsenteeFollowups() : Promise.resolve([]),
      purgeTeachingLogs ? getAllTeachingLogs() : Promise.resolve([]),
    ]);

    // Atomic transaction in IndexedDB to clear selected stores
    const db = await getDB();
    type WorkspaceStore = 'students' | 'attendance' | 'practical_progress' | 'absentee_followups' | 'teaching_logs';
    const storesToClear: WorkspaceStore[] = ['students'];
    if (purgeAttendance) storesToClear.push('attendance');
    if (purgePracticals) storesToClear.push('practical_progress');
    if (purgeFollowups) storesToClear.push('absentee_followups');
    if (purgeTeachingLogs) storesToClear.push('teaching_logs');

    const tx = db.transaction(storesToClear, 'readwrite');
    for (const storeName of storesToClear) {
      await tx.objectStore(storeName).clear();
    }
    await tx.done;

    // Enqueue deletion ops for outbox synchronization so cloud Supabase is updated without leaving orphans
    for (const s of allStudents) {
      await enqueueOutboxOperation({
        opId: crypto.randomUUID(),
        entityId: s.id,
        entityType: 'student',
        operationType: 'DELETE',
        payload: { id: s.id },
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
        userEmail,
        version: s.version,
      });
    }

    if (purgeAttendance) {
      for (const a of attendanceRecords) {
        await enqueueOutboxOperation({
          opId: crypto.randomUUID(),
          entityId: a.id,
          entityType: 'attendance',
          operationType: 'DELETE',
          payload: { id: a.id },
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: a.version,
        });
      }
    }

    if (purgePracticals) {
      for (const p of practicalRecords) {
        await enqueueOutboxOperation({
          opId: crypto.randomUUID(),
          entityId: p.id,
          entityType: 'practical_progress',
          operationType: 'DELETE',
          payload: { id: p.id },
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: p.version,
        });
      }
    }

    if (purgeFollowups) {
      for (const f of followupRecords) {
        await enqueueOutboxOperation({
          opId: crypto.randomUUID(),
          entityId: f.id,
          entityType: 'absentee_followup',
          operationType: 'DELETE',
          payload: { id: f.id },
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: f.version,
        });
      }
    }

    if (purgeTeachingLogs) {
      for (const t of teachingLogRecords) {
        await enqueueOutboxOperation({
          opId: crypto.randomUUID(),
          entityId: t.id,
          entityType: 'teaching_log',
          operationType: 'DELETE',
          payload: { id: t.id },
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          userEmail,
          version: t.version,
        });
      }
    }

    await setAppState('auto_seed_disabled', true);
    syncEngine.processQueue();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: { count: 0 } }));
      window.dispatchEvent(new CustomEvent('gbhs_records_imported', { detail: { action: 'purge' } }));
    }

    return count;
  }

  // Safe path: Students have zero linked historical records (e.g. unassessed roster or freshly imported students)
  await clearAllStudentsLocally();

  for (const s of allStudents) {
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: s.id,
      entityType: 'student',
      operationType: 'DELETE',
      payload: { id: s.id },
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: s.version,
    };
    await enqueueOutboxOperation(op);
  }

  await setAppState('auto_seed_disabled', true);
  syncEngine.processQueue();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: { count: 0 } }));
  }

  return count;
}

export async function deleteStudentsByClassData(
  classLevel: string,
  userEmail: string,
  options?: DeleteAllStudentsOptions
): Promise<number> {
  const session = syncEngine.getSession();
  const permissions = getWorkspacePermissions(session?.user);
  if (permissions.isReadOnly) {
    throw new Error('Permission denied: Read-only team members cannot delete student data.');
  }

  const allStudents = await getAllStudents();
  const classStudents = allStudents.filter((s) => s.class === classLevel);
  const count = classStudents.length;

  if (count === 0) return 0;

  // Check for linked history specifically for this class
  const classStudentIds = new Set(classStudents.map((s) => s.id));
  const [allAtt, allPracticals, allFollowups, allTeachingLogs] = await Promise.all([
    getAllAttendanceRecords(),
    getAllPracticalProgress(),
    getAllAbsenteeFollowups(),
    getAllTeachingLogs(),
  ]);

  const classAtt = allAtt.filter((a) => classStudentIds.has(a.studentId));
  const classPracticals = allPracticals.filter(
    (p) => p.class === classLevel || (p.studentId && classStudentIds.has(p.studentId))
  );
  const classFollowups = allFollowups.filter(
    (f) => f.class === classLevel || (f.studentId && classStudentIds.has(f.studentId))
  );
  const classTeachingLogs = allTeachingLogs.filter((t) => t.class === classLevel);

  const totalClassHistory =
    classAtt.length + classPracticals.length + classFollowups.length + classTeachingLogs.length;

  if (totalClassHistory > 0 && !options?.confirmPurgeHistory) {
    const reasons: string[] = [];
    if (classAtt.length > 0) reasons.push(`${classAtt.length} attendance record(s)`);
    if (classPracticals.length > 0) reasons.push(`${classPracticals.length} practical assessment(s)`);
    if (classFollowups.length > 0) reasons.push(`${classFollowups.length} absentee follow-up(s)`);
    if (classTeachingLogs.length > 0) reasons.push(`${classTeachingLogs.length} curriculum teaching log(s)`);

    throw new Error(
      `Cannot delete students of ${classLevel}: Destructive deletion blocked because ${reasons.join(', ')} exist for this class. Deleting students would orphan historical records. Please withdraw inactive students individually or archive class records first.`
    );
  }

  if (totalClassHistory > 0 && options?.confirmPurgeHistory) {
    if (!permissions.isOwner) {
      throw new Error('Permission denied: Only the Workspace Owner can authorize a class historical data purge.');
    }
    if (options.confirmationPhrase !== CONFIRM_PURGE_PHRASE) {
      throw new Error(
        `Destructive purge confirmation failed: Invalid confirmation phrase. Expected "${CONFIRM_PURGE_PHRASE}".`
      );
    }
    // Delete class records and enqueue outbox delete ops
    const db = await getDB();
    const tx = db.transaction(
      ['students', 'attendance', 'practical_progress', 'absentee_followups'],
      'readwrite'
    );
    for (const s of classStudents) {
      await tx.objectStore('students').delete(s.id);
    }
    for (const a of classAtt) {
      await tx.objectStore('attendance').delete(a.id);
    }
    for (const p of classPracticals) {
      await tx.objectStore('practical_progress').delete(p.id);
    }
    for (const f of classFollowups) {
      await tx.objectStore('absentee_followups').delete(f.id);
    }
    await tx.done;

    // Enqueue outbox ops for all deleted class records
    for (const s of classStudents) {
      await enqueueOutboxOperation({
        opId: crypto.randomUUID(),
        entityId: s.id,
        entityType: 'student',
        operationType: 'DELETE',
        payload: { id: s.id },
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
        userEmail,
        version: s.version,
      });
    }
    for (const a of classAtt) {
      await enqueueOutboxOperation({
        opId: crypto.randomUUID(),
        entityId: a.id,
        entityType: 'attendance',
        operationType: 'DELETE',
        payload: { id: a.id },
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
        userEmail,
        version: a.version,
      });
    }
    for (const p of classPracticals) {
      await enqueueOutboxOperation({
        opId: crypto.randomUUID(),
        entityId: p.id,
        entityType: 'practical_progress',
        operationType: 'DELETE',
        payload: { id: p.id },
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
        userEmail,
        version: p.version,
      });
    }
    for (const f of classFollowups) {
      await enqueueOutboxOperation({
        opId: crypto.randomUUID(),
        entityId: f.id,
        entityType: 'absentee_followup',
        operationType: 'DELETE',
        payload: { id: f.id },
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
        userEmail,
        version: f.version,
      });
    }

    syncEngine.processQueue();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: { classLevel } }));
    }
    return count;
  }

  // Safe path: Class has zero linked historical records
  await clearStudentsByClassLocally(classLevel);

  for (const s of classStudents) {
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: s.id,
      entityType: 'student',
      operationType: 'DELETE',
      payload: { id: s.id },
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: s.version,
    };
    await enqueueOutboxOperation(op);
  }

  syncEngine.processQueue();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: { classLevel } }));
  }
  return count;
}

/**
 * Automatically purges corrupted student records from previous faulty imports
 * where the School Name was accidentally stored as the Student Name.
 */
export async function sanitizeCorruptedStudents(): Promise<number> {
  const allStudents = await getAllStudents();
  const corrupted = allStudents.filter((s) => {
    const up = s.name.toUpperCase().trim();
    return (
      up.startsWith('GBHS') ||
      up.startsWith('GOVT') ||
      up.startsWith('GOVERNMENT') ||
      up.includes('HIGH SCHOOL') ||
      up.includes('JAM YOUSF') ||
      up.includes('JAM YOUSUF') ||
      up.includes('COLONY')
    );
  });

  if (corrupted.length === 0) return 0;

  for (const c of corrupted) {
    await deleteStudentLocally(c.id);
  }

  // Ensure auto seed is not triggered for corrupted cleanups
  await setAppState('auto_seed_disabled', true);
  return corrupted.length;
}

// -------------------------------------------------------------
// SEED INITIAL DEFAULT HIGH SCHOOL RECORDS
// -------------------------------------------------------------

export async function seedInitialSampleDataIfEmpty(userEmail: string, force: boolean = false): Promise<boolean> {
  if (!force) {
    const isAutoSeedDisabled = await getAppState<boolean>('auto_seed_disabled');
    if (isAutoSeedDisabled) return false;
  }

  const existing = await getAllStudents();
  if (existing.length > 0) return false;

  // If force-seeded, re-enable
  if (force) {
    await setAppState('auto_seed_disabled', false);
  }

  const now = new Date().toISOString();
  const sampleStudents: Student[] = [
    // Class 7
    {
      id: crypto.randomUUID(),
      admissionNo: 'GBHS-701',
      rollNo: '1',
      name: 'Muhammad Ali',
      fatherName: 'Tariq Mehmood',
      class: 'Class 7',
      section: 'A',
      phone: '0300-1234567',
      dob: '2012-04-12',
      address: 'Main Bazar, Model Town',
      status: 'Active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      createdBy: userEmail,
    },
    {
      id: crypto.randomUUID(),
      admissionNo: 'GBHS-702',
      rollNo: '2',
      name: 'Zayan Ahmed',
      fatherName: 'Bashir Ahmed',
      class: 'Class 7',
      section: 'A',
      phone: '0312-9876543',
      dob: '2012-08-25',
      address: 'Street 4, Sector B',
      status: 'Active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      createdBy: userEmail,
    },
    {
      id: crypto.randomUUID(),
      admissionNo: 'GBHS-703',
      rollNo: '3',
      name: 'Usman Farooq',
      fatherName: 'Farooq Azam',
      class: 'Class 7',
      section: 'B',
      phone: '0333-5551234',
      dob: '2012-01-19',
      address: 'Railway Colony',
      status: 'Active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      createdBy: userEmail,
    },
    // Class 8
    {
      id: crypto.randomUUID(),
      admissionNo: 'GBHS-801',
      rollNo: '1',
      name: 'Hamza Khan',
      fatherName: 'Abdul Rehman',
      class: 'Class 8',
      section: 'A',
      phone: '0301-4448888',
      dob: '2011-06-15',
      address: 'Near Civil Hospital',
      status: 'Active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      createdBy: userEmail,
    },
    {
      id: crypto.randomUUID(),
      admissionNo: 'GBHS-802',
      rollNo: '2',
      name: 'Bilal Hussain',
      fatherName: 'Ghulam Hussain',
      class: 'Class 8',
      section: 'B',
      phone: '0321-7772222',
      dob: '2011-09-03',
      address: 'Gulshan Colony',
      status: 'Active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      createdBy: userEmail,
    },
    // Class 9
    {
      id: crypto.randomUUID(),
      admissionNo: 'GBHS-901',
      rollNo: '1',
      name: 'Saad Ur Rehman',
      fatherName: 'Khalid Mehmood',
      class: 'Class 9',
      section: 'A',
      phone: '0345-3339999',
      dob: '2010-02-14',
      address: 'Officer Colony',
      status: 'Active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      createdBy: userEmail,
    },
    {
      id: crypto.randomUUID(),
      admissionNo: 'GBHS-902',
      rollNo: '2',
      name: 'Ahmad Raza',
      fatherName: 'Muhammad Raza',
      class: 'Class 9',
      section: 'A',
      phone: '0302-6661111',
      dob: '2010-11-20',
      address: 'Cantt View',
      status: 'Active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      createdBy: userEmail,
    },
  ];

  await bulkSaveStudentsLocally(sampleStudents);

  // Queue initial creation in outbox
  for (const student of sampleStudents) {
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: student.id,
      entityType: 'student',
      operationType: 'CREATE',
      payload: student,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: 1,
    };
    await enqueueOutboxOperation(op);
  }

  syncEngine.processQueue();
  return true;
}

/**
 * Safely parse a roll number value.
 * Returns positive integer for valid numeric strings or numbers, or null for blank/non-numeric.
 */
export function parseRollNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || !/^\d+$/.test(s)) return null;
  const num = parseInt(s, 10);
  return Number.isFinite(num) ? num : null;
}

/**
 * Consistent student comparator across Student Management, Dashboard, and Reports:
 * 1. Groups by class (ascending localeCompare) if classes differ.
 * 2. Students with numeric roll numbers appear first, in ascending numeric order.
 * 3. Students with blank or non-numeric roll numbers appear after numeric roll numbers.
 * 4. When roll numbers are tied, blank, or non-numeric, sorts alphabetically by student name.
 */
export function compareStudentsByRoll<
  T extends { rollNo?: string | null; name?: string | null; class?: string | null }
>(a: T, b: T): number {
  const classA = a.class || '';
  const classB = b.class || '';
  if (classA !== classB) {
    return classA.localeCompare(classB);
  }

  const rollA = parseRollNumber(a.rollNo);
  const rollB = parseRollNumber(b.rollNo);

  if (rollA !== null && rollB !== null) {
    if (rollA !== rollB) return rollA - rollB;
    return (a.name || '').localeCompare(b.name || '');
  }
  if (rollA !== null && rollB === null) return -1;
  if (rollA === null && rollB !== null) return 1;

  return (a.name || '').localeCompare(b.name || '');
}

