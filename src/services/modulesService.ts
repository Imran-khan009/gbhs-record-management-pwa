import * as XLSX from 'xlsx';
import { ClassLevel } from '../types/student';
import {
  TeachingLogEntry,
  PracticalProgressEntry,
  AbsenteeFollowupEntry,
} from '../types/modules';
import { getSchoolProfile } from './schoolProfileService';
import {
  getAllTeachingLogs,
  getTeachingLogsByClass,
  saveTeachingLogLocally,
  deleteTeachingLogLocally,
  bulkSaveTeachingLogsLocally,
  getAllPracticalProgress,
  getPracticalProgressByClass,
  savePracticalProgressLocally,
  deletePracticalProgressLocally,
  bulkSavePracticalProgressLocally,
  getAllAbsenteeFollowups,
  getAbsenteeFollowupsByClass,
  saveAbsenteeFollowupLocally,
  deleteAbsenteeFollowupLocally,
  getDB,
  clearAllAttendanceLocally,
  clearAllTeachingLogsLocally,
  clearAllPracticalProgressLocally,
  clearAllAbsenteeFollowupsLocally,
  enqueueOutboxOperation,
  getAppState,
  setAppState,
} from './db';
import { OutboxOperation } from '../types/sync';
import { syncEngine } from './syncEngine';
import { getWorkspacePermissions } from './permissionService';

// -------------------------------------------------------------
// TEACHING LOG SERVICE
// -------------------------------------------------------------

export async function fetchTeachingLogs(classLevel?: ClassLevel | 'All'): Promise<TeachingLogEntry[]> {
  if (!classLevel || classLevel === 'All') {
    return getAllTeachingLogs();
  }
  return getTeachingLogsByClass(classLevel);
}

export async function createTeachingLog(
  data: Omit<TeachingLogEntry, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
  authorEmail?: string
): Promise<{ success: boolean; entry?: TeachingLogEntry; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot create teaching logs.' };
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const entry: TeachingLogEntry = {
      ...data,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await saveTeachingLogLocally(entry);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'teaching_log',
      operationType: 'CREATE',
      payload: entry,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: 1,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true, entry };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save teaching log.' };
  }
}

export async function updateTeachingLog(
  id: string,
  updates: Partial<Omit<TeachingLogEntry, 'id' | 'createdAt'>>,
  authorEmail?: string
): Promise<{ success: boolean; entry?: TeachingLogEntry; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot edit teaching logs.' };
    }

    const all = await getAllTeachingLogs();
    const current = all.find((e) => e.id === id);
    if (!current) return { success: false, error: 'Teaching log not found.' };

    const updated: TeachingLogEntry = {
      ...current,
      ...updates,
      version: (current.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveTeachingLogLocally(updated);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'teaching_log',
      operationType: 'UPDATE',
      payload: updated,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: updated.version,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true, entry: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update teaching log.' };
  }
}

export async function deleteTeachingLog(
  id: string,
  authorEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot delete teaching logs.' };
    }

    const all = await getAllTeachingLogs();
    const current = all.find((e) => e.id === id);
    await deleteTeachingLogLocally(id);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'teaching_log',
      operationType: 'DELETE',
      payload: { id },
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: current?.version || 1,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete teaching log.' };
  }
}

export function exportTeachingLogsToExcel(logs: TeachingLogEntry[], selectedClass: string = 'All'): void {
  const permissions = getWorkspacePermissions(syncEngine.getSession()?.user);
  if (!permissions.canExport) {
    throw new Error('Permission denied: User cannot export teaching logs.');
  }

  const exportRows = logs.map((l) => ({
    Date: l.date,
    Day: l.day,
    Class: l.class,
    'Subject/Topic': l.subjectTopic,
    'Learning Objectives': l.learningObjectives,
    'Theory Covered': l.theoryCovered,
    'Practical Activity': l.practicalActivity,
    'Total Registered': l.totalRegistered,
    'Students Present': l.studentsPresent,
    'Students Completing Task': l.studentsCompletingTask,
    'Students Needing Help': l.studentsNeedingHelp,
    'Teaching Method': l.teachingMethod,
    'Issue/Challenge': l.issueChallenge || '',
    'Evidence File Name': l.evidenceFileName || '',
    'Next Lesson': l.nextLesson || '',
    'Instructor Name': l.instructorName,
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Teaching Log');
  ws['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 30 },
    { wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 22 },
    { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 26 }, { wch: 20 },
  ];
  const profile = getSchoolProfile();
  const filePrefix = (profile.schoolShortName && profile.schoolShortName !== 'GBHS Jam Yousuf Colony')
    ? profile.schoolShortName.replace(/[^a-zA-Z0-9]/g, '_')
    : 'GBHS';
  XLSX.writeFile(wb, `${filePrefix}_Teaching_Log_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// -------------------------------------------------------------
// PRACTICAL PROGRESS SERVICE
// -------------------------------------------------------------

export async function fetchPracticalProgress(classLevel?: ClassLevel | 'All'): Promise<PracticalProgressEntry[]> {
  if (!classLevel || classLevel === 'All') {
    return getAllPracticalProgress();
  }
  return getPracticalProgressByClass(classLevel);
}

export async function createPracticalProgress(
  data: Omit<PracticalProgressEntry, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
  authorEmail?: string
): Promise<{ success: boolean; entry?: PracticalProgressEntry; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot record practical progress.' };
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const entry: PracticalProgressEntry = {
      ...data,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await savePracticalProgressLocally(entry);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'practical_progress',
      operationType: 'CREATE',
      payload: entry,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: 1,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true, entry };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record practical progress.' };
  }
}

export async function updatePracticalProgress(
  id: string,
  updates: Partial<Omit<PracticalProgressEntry, 'id' | 'createdAt'>>,
  authorEmail?: string
): Promise<{ success: boolean; entry?: PracticalProgressEntry; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot edit practical progress.' };
    }

    const all = await getAllPracticalProgress();
    const current = all.find((e) => e.id === id);
    if (!current) return { success: false, error: 'Practical progress entry not found.' };

    const updated: PracticalProgressEntry = {
      ...current,
      ...updates,
      version: (current.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    await savePracticalProgressLocally(updated);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'practical_progress',
      operationType: 'UPDATE',
      payload: updated,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: updated.version,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true, entry: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update practical progress.' };
  }
}

export async function deletePracticalProgress(
  id: string,
  authorEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot delete practical progress.' };
    }

    const all = await getAllPracticalProgress();
    const current = all.find((e) => e.id === id);
    await deletePracticalProgressLocally(id);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'practical_progress',
      operationType: 'DELETE',
      payload: { id },
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: current?.version || 1,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete practical progress entry.' };
  }
}

export function exportPracticalProgressToExcel(records: PracticalProgressEntry[], selectedClass: string = 'All'): void {
  const permissions = getWorkspacePermissions(syncEngine.getSession()?.user);
  if (!permissions.canExport) {
    throw new Error('Permission denied: User cannot export practical progress.');
  }

  const exportRows = records.map((r) => ({
    'Assessment Date': r.assessmentDate,
    'Registration ID': r.registrationId,
    'Student Name': r.studentName,
    Class: r.class,
    'Skill/Practical Task': r.skillTask,
    'Attempt Number': r.attemptNumber,
    'Practical Completed': r.practicalCompleted,
    'Score/Marks': r.scoreMarks,
    'Skill Status': r.skillStatus,
    'Weak Area': r.weakArea || '',
    'Remedial Practice Required': r.remedialPracticeRequired,
    'Reassessment Date': r.reassessmentDate || '',
    'Evidence File': r.evidenceFile || '',
    'Instructor Remarks': r.instructorRemarks || '',
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Practical Progress');
  ws['!cols'] = [
    { wch: 15 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 26 },
    { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 24 },
    { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 26 },
  ];
  const profile = getSchoolProfile();
  const filePrefix = (profile.schoolShortName && profile.schoolShortName !== 'GBHS Jam Yousuf Colony')
    ? profile.schoolShortName.replace(/[^a-zA-Z0-9]/g, '_')
    : 'GBHS';
  XLSX.writeFile(wb, `${filePrefix}_Practical_Progress_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// -------------------------------------------------------------
// ABSENTEE FOLLOW-UP SERVICE
// -------------------------------------------------------------

export async function fetchAbsenteeFollowups(classLevel?: ClassLevel | 'All'): Promise<AbsenteeFollowupEntry[]> {
  if (!classLevel || classLevel === 'All') {
    return getAllAbsenteeFollowups();
  }
  return getAbsenteeFollowupsByClass(classLevel);
}

export async function createAbsenteeFollowup(
  data: Omit<AbsenteeFollowupEntry, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
  authorEmail?: string
): Promise<{ success: boolean; entry?: AbsenteeFollowupEntry; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot create absentee follow-ups.' };
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const entry: AbsenteeFollowupEntry = {
      ...data,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await saveAbsenteeFollowupLocally(entry);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'absentee_followup',
      operationType: 'CREATE',
      payload: entry,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: 1,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true, entry };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record absentee follow-up.' };
  }
}

export async function updateAbsenteeFollowup(
  id: string,
  updates: Partial<Omit<AbsenteeFollowupEntry, 'id' | 'createdAt'>>,
  authorEmail?: string
): Promise<{ success: boolean; entry?: AbsenteeFollowupEntry; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot edit absentee follow-ups.' };
    }

    const all = await getAllAbsenteeFollowups();
    const current = all.find((e) => e.id === id);
    if (!current) return { success: false, error: 'Follow-up record not found.' };

    const updated: AbsenteeFollowupEntry = {
      ...current,
      ...updates,
      version: (current.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveAbsenteeFollowupLocally(updated);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'absentee_followup',
      operationType: 'UPDATE',
      payload: updated,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: updated.version,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true, entry: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update follow-up record.' };
  }
}

export async function deleteAbsenteeFollowup(
  id: string,
  authorEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = syncEngine.getSession();
    const permissions = getWorkspacePermissions(session?.user);
    if (permissions.isReadOnly) {
      return { success: false, error: 'Permission denied: Read-only team members cannot delete absentee follow-ups.' };
    }

    const all = await getAllAbsenteeFollowups();
    const current = all.find((e) => e.id === id);
    await deleteAbsenteeFollowupLocally(id);

    const userEmail = authorEmail || syncEngine.getSession()?.user.email || 'operator@gbhs.edu.pk';
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: id,
      entityType: 'absentee_followup',
      operationType: 'DELETE',
      payload: { id },
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail,
      version: current?.version || 1,
    };
    await enqueueOutboxOperation(op);
    syncEngine.processQueue();

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete follow-up record.' };
  }
}

export function exportAbsenteeFollowupsToExcel(records: AbsenteeFollowupEntry[], selectedClass: string = 'All'): void {
  const permissions = getWorkspacePermissions(syncEngine.getSession()?.user);
  if (!permissions.canExport) {
    throw new Error('Permission denied: User cannot export absentee follow-ups.');
  }

  const exportRows = records.map((r) => ({
    Date: r.date,
    'Registration ID': r.registrationId,
    'Student Name': r.studentName,
    Class: r.class,
    'Absence Count': r.absenceCount,
    'Follow-up Reason': r.followupReason,
    'Action Taken': r.actionTaken,
    'Contact Person': r.contactPerson,
    'Response Received': r.responseReceived,
    'Expected Return Date': r.expectedReturnDate || '',
    'Follow-up Date': r.followupDate,
    'Current Status': r.currentStatus,
    'Management Referral': r.managementReferral,
    Remarks: r.remarks || '',
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Absentee Follow-up');
  ws['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 15 },
    { wch: 24 }, { wch: 24 }, { wch: 20 }, { wch: 30 }, { wch: 18 },
    { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 26 },
  ];
  const profile = getSchoolProfile();
  const filePrefix = (profile.schoolShortName && profile.schoolShortName !== 'GBHS Jam Yousuf Colony')
    ? profile.schoolShortName.replace(/[^a-zA-Z0-9]/g, '_')
    : 'GBHS';
  XLSX.writeFile(wb, `${filePrefix}_Absentee_Followups_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// -------------------------------------------------------------
// SEED INITIAL SCHOOL DATA IF EMPTY
// -------------------------------------------------------------

export async function seedModuleDataIfEmpty(): Promise<void> {
  // Mock data seeding has been completely disabled.
  // Modules start completely empty and clean, waiting for real entries or pulling from imported Excel rosters.
  await setAppState('modules_seeded_v1', true);
  await setAppState('auto_seed_disabled', true);
}

/**
 * Permanently clears all mock / sample data from:
 * 1. Attendance module
 * 2. Teaching logs module
 * 3. Practical progress module
 * 4. Absentee follow-up module
 * Also purges any outbox operations associated with these entities to prevent sync of dead mock data,
 * and clears mock cloud storage fallback keys.
 */
export async function clearAllModulesMockData(): Promise<{
  attendanceCleared: boolean;
  teachingLogsCleared: boolean;
  practicalProgressCleared: boolean;
  absenteeFollowupsCleared: boolean;
}> {
  // Clear local stores
  await clearAllAttendanceLocally();
  await clearAllTeachingLogsLocally();
  await clearAllPracticalProgressLocally();
  await clearAllAbsenteeFollowupsLocally();

  // Clear outbox queue items for these modules so deleted mock data does not try to sync
  try {
    const db = await getDB();
    const tx = db.transaction('outbox', 'readwrite');
    let cursor = await tx.store.openCursor();
    while (cursor) {
      const op = cursor.value;
      if (
        op.entityType === 'attendance' ||
        op.entityType === 'teaching_log' ||
        op.entityType === 'practical_progress' ||
        op.entityType === 'absentee_followup'
      ) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch (err) {
    console.warn('Could not purge outbox operations during mock data clear:', err);
  }

  // Clear mock cloud stores if in browser
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem('mock_supabase_cloud_attendance');
      window.localStorage.removeItem('mock_supabase_cloud_teaching_logs');
      window.localStorage.removeItem('mock_supabase_cloud_practical_progress');
      window.localStorage.removeItem('mock_supabase_cloud_absentee_followups');
    } catch {
      // ignore localStorage errors
    }
  }

  await setAppState('modules_seeded_v1', true);
  await setAppState('auto_seed_disabled', true);
  await setAppState('modules_mock_cleared_v1', true);

  return {
    attendanceCleared: true,
    teachingLogsCleared: true,
    practicalProgressCleared: true,
    absenteeFollowupsCleared: true,
  };
}
