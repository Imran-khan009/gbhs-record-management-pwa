import { openDB, deleteDB, DBSchema, IDBPDatabase } from 'idb';
import { Student, AttendanceRecord } from '../types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../types/modules';
import { OutboxOperation, ConflictItem } from '../types/sync';
import { AuthSession } from '../types/auth';

interface GBHSDB extends DBSchema {
  students: {
    key: string;
    value: Student;
    indexes: {
      'by-admissionNo': string;
      'by-class': string;
      'by-status': string;
    };
  };
  attendance: {
    key: string;
    value: AttendanceRecord;
    indexes: {
      'by-date': string;
      'by-class': string;
      'by-studentId': string;
      'by-date-class': [string, string];
    };
  };
  teaching_logs: {
    key: string;
    value: TeachingLogEntry;
    indexes: {
      'by-class': string;
      'by-date': string;
      'by-date-class': [string, string];
    };
  };
  practical_progress: {
    key: string;
    value: PracticalProgressEntry;
    indexes: {
      'by-class': string;
      'by-studentId': string;
      'by-date': string;
    };
  };
  absentee_followups: {
    key: string;
    value: AbsenteeFollowupEntry;
    indexes: {
      'by-class': string;
      'by-studentId': string;
      'by-date': string;
      'by-status': string;
    };
  };
  outbox: {
    key: string;
    value: OutboxOperation;
    indexes: {
      'by-status': string;
      'by-timestamp': number;
      'by-entityId': string;
    };
  };
  conflicts: {
    key: string;
    value: ConflictItem;
    indexes: {
      'by-resolved': number; // 0 for false, 1 for true
      'by-entityId': string;
    };
  };
  app_state: {
    key: string;
    value: any;
  };
}

export const LEGACY_DB_NAME = 'gbhs_operator_db_v1';
export const DB_VERSION = 2;

let currentWorkspaceId: string | null = null;
const dbInstances = new Map<string, Promise<IDBPDatabase<GBHSDB>>>();

/**
 * Sanitize workspace ID for safe IndexedDB database name
 */
export function sanitizeWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

/**
 * Return the isolated IndexedDB database name for a specific workspace owner
 */
export function getWorkspaceDatabaseName(workspaceId: string): string {
  return `gbhs_workspace_${sanitizeWorkspaceId(workspaceId)}`;
}

/**
 * Set the currently active workspace ID.
 * When set, all domain operations route strictly to gbhs_workspace_<id>.
 * When null (logged out), domain operations default to the unassigned database or require explicit workspace.
 */
export function setActiveWorkspaceId(workspaceId: string | null): void {
  currentWorkspaceId = workspaceId ? workspaceId.trim() : null;
}

/**
 * Get the currently active workspace ID
 */
export function getActiveWorkspaceId(): string | null {
  return currentWorkspaceId;
}

/**
 * Get the database name for the currently active workspace.
 * Fails closed if no authenticated workspace session is active.
 */
export function getActiveDatabaseName(): string {
  if (currentWorkspaceId) {
    return getWorkspaceDatabaseName(currentWorkspaceId);
  }
  throw new Error('No active workspace: cannot access workspace database without an active authenticated session.');
}

/**
 * Safely clear in-memory cached state, close open database connections, and reset active workspace.
 */
export async function clearWorkspaceCachedState(): Promise<void> {
  await closeDB();
  setActiveWorkspaceId(null);
}

/**
 * Open or retrieve the cached IDBPDatabase connection for the active workspace (or specified target).
 */
export async function getDB(targetDbName?: string): Promise<IDBPDatabase<GBHSDB>> {
  const dbName = targetDbName || getActiveDatabaseName();
  let instancePromise = dbInstances.get(dbName);

  if (!instancePromise) {
    instancePromise = openDB<GBHSDB>(dbName, DB_VERSION, {
      upgrade(db) {
        // 1. Students store
        if (!db.objectStoreNames.contains('students')) {
          const studentStore = db.createObjectStore('students', { keyPath: 'id' });
          studentStore.createIndex('by-admissionNo', 'admissionNo', { unique: false });
          studentStore.createIndex('by-class', 'class', { unique: false });
          studentStore.createIndex('by-status', 'status', { unique: false });
        }

        // 2. Attendance store
        if (!db.objectStoreNames.contains('attendance')) {
          const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id' });
          attendanceStore.createIndex('by-date', 'date', { unique: false });
          attendanceStore.createIndex('by-class', 'class', { unique: false });
          attendanceStore.createIndex('by-studentId', 'studentId', { unique: false });
          attendanceStore.createIndex('by-date-class', ['date', 'class'], { unique: false });
        }

        // 3. Teaching logs store
        if (!db.objectStoreNames.contains('teaching_logs')) {
          const teachingStore = db.createObjectStore('teaching_logs', { keyPath: 'id' });
          teachingStore.createIndex('by-class', 'class', { unique: false });
          teachingStore.createIndex('by-date', 'date', { unique: false });
          teachingStore.createIndex('by-date-class', ['date', 'class'], { unique: false });
        }

        // 4. Practical progress store
        if (!db.objectStoreNames.contains('practical_progress')) {
          const progressStore = db.createObjectStore('practical_progress', { keyPath: 'id' });
          progressStore.createIndex('by-class', 'class', { unique: false });
          progressStore.createIndex('by-studentId', 'studentId', { unique: false });
          progressStore.createIndex('by-date', 'assessmentDate', { unique: false });
        }

        // 5. Absentee follow-ups store
        if (!db.objectStoreNames.contains('absentee_followups')) {
          const followupStore = db.createObjectStore('absentee_followups', { keyPath: 'id' });
          followupStore.createIndex('by-class', 'class', { unique: false });
          followupStore.createIndex('by-studentId', 'studentId', { unique: false });
          followupStore.createIndex('by-date', 'date', { unique: false });
          followupStore.createIndex('by-status', 'currentStatus', { unique: false });
        }

        // 6. Outbox queue
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'opId' });
          outboxStore.createIndex('by-status', 'status', { unique: false });
          outboxStore.createIndex('by-timestamp', 'timestamp', { unique: false });
          outboxStore.createIndex('by-entityId', 'entityId', { unique: false });
        }

        // 7. Conflicts store
        if (!db.objectStoreNames.contains('conflicts')) {
          const conflictStore = db.createObjectStore('conflicts', { keyPath: 'id' });
          conflictStore.createIndex('by-resolved', 'resolved', { unique: false });
          conflictStore.createIndex('by-entityId', 'entityId', { unique: false });
        }

        // 8. App State store
        if (!db.objectStoreNames.contains('app_state')) {
          db.createObjectStore('app_state', { keyPath: 'key' });
        }
      },
    });

    dbInstances.set(dbName, instancePromise);
  }

  return instancePromise;
}

/**
 * Safely close open IndexedDB database connection(s)
 */
export async function closeDB(targetDbName?: string): Promise<void> {
  if (targetDbName) {
    const promise = dbInstances.get(targetDbName);
    dbInstances.delete(targetDbName);
    if (promise) {
      try {
        const db = await promise;
        db.close();
      } catch {
        // Ignore close error
      }
    }
  } else {
    const entries = Array.from(dbInstances.entries());
    dbInstances.clear();
    for (const [, promise] of entries) {
      try {
        const db = await promise;
        db.close();
      } catch {
        // Ignore close error
      }
    }
  }
}

/**
 * Safely delete an entire workspace database by workspace ID
 */
export async function deleteWorkspaceDatabase(workspaceId: string): Promise<void> {
  const dbName = getWorkspaceDatabaseName(workspaceId);
  await closeDB(dbName);
  try {
    await deleteDB(dbName);
  } catch {
    // Ignore delete error
  }
}

/**
 * Clear all stores in the currently active database
 */
export async function clearAllCurrentDatabaseStores(): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot clear database stores: No active workspace.');
  }
  const db = await getDB();
  const stores = [
    'students',
    'attendance',
    'teaching_logs',
    'practical_progress',
    'absentee_followups',
    'outbox',
    'conflicts',
    'app_state',
  ] as const;

  for (const store of stores) {
    if (db.objectStoreNames.contains(store)) {
      try {
        const tx = db.transaction(store, 'readwrite');
        await tx.store.clear();
        await tx.done;
      } catch {
        // Ignore store clear error
      }
    }
  }
}

// -------------------------------------------------------------
// STUDENT REPOSITORY
// -------------------------------------------------------------

export async function getAllStudents(): Promise<Student[]> {
  if (!currentWorkspaceId) return [];
  const db = await getDB();
  return db.getAll('students');
}

export async function getStudentsByClass(classLevel: string): Promise<Student[]> {
  if (!currentWorkspaceId) return [];
  const db = await getDB();
  const clean = (classLevel || '').trim().toLowerCase();
  if (!clean || clean === 'all' || clean === 'all class' || clean === 'all classes') {
    return getAllStudents();
  }
  const allStudents = await db.getAll('students');
  const targetNorm = clean.replace(/\s+/g, ' ');
  return allStudents.filter((s) => {
    if (!s.class) return false;
    return s.class.trim().toLowerCase().replace(/\s+/g, ' ') === targetNorm;
  });
}

export async function getStudentById(id: string): Promise<Student | undefined> {
  if (!currentWorkspaceId) return undefined;
  const db = await getDB();
  return db.get('students', id);
}

export async function findStudentByAdmissionNo(admissionNo: string): Promise<Student | undefined> {
  if (!currentWorkspaceId) return undefined;
  const db = await getDB();
  const tx = db.transaction('students', 'readonly');
  const index = tx.store.index('by-admissionNo');
  return index.get(admissionNo.trim());
}

export async function saveStudentLocally(student: Student): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot save student: No active workspace.');
  }
  const db = await getDB();
  if (!student.owner_id) {
    student.owner_id = currentWorkspaceId;
    student.ownerId = currentWorkspaceId;
  }
  await db.put('students', student);
}

export async function deleteStudentLocally(id: string): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot delete student: No active workspace.');
  }
  const db = await getDB();
  await db.delete('students', id);
}

export async function bulkSaveStudentsLocally(students: Student[]): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot bulk save students: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('students', 'readwrite');
  for (const s of students) {
    if (!s.owner_id) {
      s.owner_id = currentWorkspaceId;
      s.ownerId = currentWorkspaceId;
    }
    await tx.store.put(s);
  }
  await tx.done;
}

export async function clearAllStudentsLocally(): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot clear students: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('students', 'readwrite');
  await tx.objectStore('students').clear();
  await tx.done;
}

export async function clearAllStudentsAndHistoryLocally(
  includeTeachingLogs = false
): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot clear workspace records: No active workspace.');
  }
  const db = await getDB();
  type WorkspaceStore = 'students' | 'attendance' | 'practical_progress' | 'absentee_followups' | 'teaching_logs';
  const storeNames: WorkspaceStore[] = [
    'students',
    'attendance',
    'practical_progress',
    'absentee_followups',
  ];
  if (includeTeachingLogs) {
    storeNames.push('teaching_logs');
  }
  const tx = db.transaction(storeNames, 'readwrite');
  for (const store of storeNames) {
    await tx.objectStore(store).clear();
  }
  await tx.done;
}

export async function clearStudentsByClassLocally(classLevel: string): Promise<number> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot clear students by class: No active workspace.');
  }
  const db = await getDB();
  const clean = (classLevel || '').trim().toLowerCase();
  if (!clean) return 0;
  const targetNorm = clean.replace(/\s+/g, ' ');
  const allStudents = await db.getAll('students');
  const toDelete = allStudents.filter(
    (s) => s.class && s.class.trim().toLowerCase().replace(/\s+/g, ' ') === targetNorm
  );
  if (toDelete.length === 0) return 0;
  const tx = db.transaction('students', 'readwrite');
  for (const s of toDelete) {
    await tx.objectStore('students').delete(s.id);
  }
  await tx.done;
  return toDelete.length;
}

// -------------------------------------------------------------
// ATTENDANCE REPOSITORY
// -------------------------------------------------------------

export async function getAttendanceByDateAndClass(date: string, classLevel: string): Promise<AttendanceRecord[]> {
  if (!currentWorkspaceId) return [];
  const clean = (classLevel || '').trim().toLowerCase();
  const all = await getAllAttendanceRecords();
  if (!clean || clean === 'all' || clean === 'all class' || clean === 'all classes') {
    return all.filter((a) => a.date === date);
  }
  const targetNorm = clean.replace(/\s+/g, ' ');
  return all.filter(
    (a) => a.date === date && a.class && a.class.trim().toLowerCase().replace(/\s+/g, ' ') === targetNorm
  );
}

export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
  if (!currentWorkspaceId) return [];
  const db = await getDB();
  return db.getAll('attendance');
}

export async function getAttendanceRecord(id: string): Promise<AttendanceRecord | undefined> {
  if (!currentWorkspaceId) return undefined;
  const db = await getDB();
  return db.get('attendance', id);
}

export async function saveAttendanceLocally(record: AttendanceRecord): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot save attendance: No active workspace.');
  }
  const db = await getDB();
  if (!record.owner_id) {
    record.owner_id = currentWorkspaceId;
    record.ownerId = currentWorkspaceId;
  }
  await db.put('attendance', record);
}

export async function bulkSaveAttendanceLocally(records: AttendanceRecord[]): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot bulk save attendance: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('attendance', 'readwrite');
  for (const r of records) {
    if (!r.owner_id) {
      r.owner_id = currentWorkspaceId;
      r.ownerId = currentWorkspaceId;
    }
    await tx.store.put(r);
  }
  await tx.done;
}

export async function clearAllAttendanceLocally(): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot clear attendance: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('attendance', 'readwrite');
  await tx.objectStore('attendance').clear();
  await tx.done;
}

// -------------------------------------------------------------
// OUTBOX QUEUE REPOSITORY
// -------------------------------------------------------------

export async function enqueueOutboxOperation(op: OutboxOperation): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot enqueue outbox operation: No active workspace.');
  }
  const db = await getDB();
  await db.put('outbox', op);
}

export async function getOutboxOperations(): Promise<OutboxOperation[]> {
  if (!currentWorkspaceId) return [];
  const db = await getDB();
  const all = await db.getAll('outbox');
  // Sort chronologically
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getPendingOutboxOperations(): Promise<OutboxOperation[]> {
  if (!currentWorkspaceId) return [];
  const ops = await getOutboxOperations();
  return ops.filter(
    (op) =>
      (op.status === 'pending' || op.status === 'failed') &&
      !op.isLegacy
  );
}

export async function updateOutboxOperation(op: OutboxOperation): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot update outbox operation: No active workspace.');
  }
  const db = await getDB();
  await db.put('outbox', op);
}

export async function removeOutboxOperation(opId: string): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot remove outbox operation: No active workspace.');
  }
  const db = await getDB();
  await db.delete('outbox', opId);
}

export async function clearSyncedOutboxOperations(): Promise<number> {
  if (!currentWorkspaceId) return 0;
  const db = await getDB();
  const tx = db.transaction('outbox', 'readwrite');
  let cursor = await tx.store.openCursor();
  let cleared = 0;
  while (cursor) {
    if (cursor.value.status === 'synced') {
      await cursor.delete();
      cleared++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return cleared;
}

export async function clearAllFailedOutboxOperations(): Promise<number> {
  if (!currentWorkspaceId) return 0;
  const db = await getDB();
  const tx = db.transaction('outbox', 'readwrite');
  let cursor = await tx.store.openCursor();
  let cleared = 0;
  while (cursor) {
    if (cursor.value.status === 'failed' || cursor.value.status === 'conflict') {
      await cursor.delete();
      cleared++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return cleared;
}

export async function remapLocalStudentId(oldId: string, newId: string): Promise<void> {
  if (!oldId || !newId || oldId === newId || !currentWorkspaceId) return;
  const db = await getDB();
  const tx = db.transaction(
    ['students', 'attendance', 'practical_progress', 'absentee_followups', 'outbox'],
    'readwrite'
  );

  // 1. Students store
  const student = await tx.objectStore('students').get(oldId);
  if (student) {
    await tx.objectStore('students').delete(oldId);
    student.id = newId;
    await tx.objectStore('students').put(student);
  }

  // 2. Attendance store
  const attIndex = tx.objectStore('attendance').index('by-studentId');
  let cursor = await attIndex.openCursor(oldId);
  while (cursor) {
    const record = cursor.value;
    record.studentId = newId;
    await cursor.update(record);
    cursor = await cursor.continue();
  }

  // 3. Practical progress store
  const progIndex = tx.objectStore('practical_progress').index('by-studentId');
  let progCursor = await progIndex.openCursor(oldId);
  while (progCursor) {
    const record = progCursor.value;
    record.studentId = newId;
    await progCursor.update(record);
    progCursor = await progCursor.continue();
  }

  // 4. Absentee followups store
  const followupIndex = tx.objectStore('absentee_followups').index('by-studentId');
  let followupCursor = await followupIndex.openCursor(oldId);
  while (followupCursor) {
    const record = followupCursor.value;
    record.studentId = newId;
    await followupCursor.update(record);
    followupCursor = await followupCursor.continue();
  }

  // 5. Outbox store
  let outboxCursor = await tx.objectStore('outbox').openCursor();
  while (outboxCursor) {
    const op = outboxCursor.value;
    let modified = false;
    if (op.entityId === oldId) {
      op.entityId = newId;
      modified = true;
    }
    if (op.payload && (op.payload as any).id === oldId) {
      (op.payload as any).id = newId;
      modified = true;
    }
    if (op.payload && (op.payload as any).studentId === oldId) {
      (op.payload as any).studentId = newId;
      modified = true;
    }
    if (modified) {
      await outboxCursor.update(op);
    }
    outboxCursor = await outboxCursor.continue();
  }

  await tx.done;
}

// -------------------------------------------------------------
// CONFLICTS REPOSITORY
// -------------------------------------------------------------

export async function saveConflict(conflict: ConflictItem): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot save conflict: No active workspace.');
  }
  const db = await getDB();
  await db.put('conflicts', conflict);
}

export async function getAllConflicts(): Promise<ConflictItem[]> {
  if (!currentWorkspaceId) return [];
  const db = await getDB();
  return db.getAll('conflicts');
}

export async function getUnresolvedConflicts(): Promise<ConflictItem[]> {
  if (!currentWorkspaceId) return [];
  const all = await getAllConflicts();
  return all.filter((c) => !c.resolved);
}

export async function markConflictResolved(
  id: string,
  resolutionType: 'keep_local' | 'keep_remote' | 'merge' | 'discard' | 'ignore',
  fallbackConflict?: ConflictItem
): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot resolve conflict: No active workspace.');
  }
  const db = await getDB();
  let conflict = await db.get('conflicts', id);
  if (!conflict && fallbackConflict) {
    conflict = { ...fallbackConflict };
  }
  if (conflict) {
    conflict.resolved = true;
    conflict.resolutionType = resolutionType as any;
    await db.put('conflicts', conflict);
  }
}

export async function removeConflict(id: string): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot remove conflict: No active workspace.');
  }
  const db = await getDB();
  await db.delete('conflicts', id);
}

export async function clearAllConflicts(): Promise<number> {
  if (!currentWorkspaceId) return 0;
  const db = await getDB();
  const tx = db.transaction('conflicts', 'readwrite');
  let cursor = await tx.store.openCursor();
  let count = 0;
  while (cursor) {
    await cursor.delete();
    count++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return count;
}

// -------------------------------------------------------------
// APP STATE (Session, Metadata, Last Sync, Legacy Migration)
// -------------------------------------------------------------

const GLOBAL_APP_STATE_KEYS = new Set([
  'gbhs_active_session',
  'supabase_config',
  'legacy_migration_manifest',
]);

function isGlobalKey(key: string): boolean {
  return GLOBAL_APP_STATE_KEYS.has(key) || key.startsWith('legacy_');
}

export async function setAppState<T>(key: string, value: T): Promise<void> {
  if (!isGlobalKey(key) && !currentWorkspaceId) {
    throw new Error(`Cannot write app_state for key "${key}": No active workspace.`);
  }
  const db = isGlobalKey(key) ? await getDB(LEGACY_DB_NAME) : await getDB();
  await db.put('app_state', { key, value });
}

export async function getAppState<T>(key: string): Promise<T | null> {
  if (!isGlobalKey(key) && !currentWorkspaceId) {
    return null;
  }
  const db = isGlobalKey(key) ? await getDB(LEGACY_DB_NAME) : await getDB();
  const item = await db.get('app_state', key);
  return item ? (item.value as T) : null;
}

export async function removeAppState(key: string): Promise<void> {
  try {
    if (!isGlobalKey(key) && !currentWorkspaceId) {
      return;
    }
    const db = isGlobalKey(key) ? await getDB(LEGACY_DB_NAME) : await getDB();
    await db.delete('app_state', key);
  } catch (err: any) {
    if (err?.name === 'InvalidStateError' || err?.message?.includes('InvalidStateError')) {
      return;
    }
    throw err;
  }
}

// -------------------------------------------------------------
// TEACHING LOG REPOSITORY
// -------------------------------------------------------------

export async function getAllTeachingLogs(): Promise<TeachingLogEntry[]> {
  if (!currentWorkspaceId) return [];
  const db = await getDB();
  const all = await db.getAll('teaching_logs');
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getTeachingLogsByClass(classLevel: string): Promise<TeachingLogEntry[]> {
  if (!currentWorkspaceId) return [];
  const clean = (classLevel || '').trim().toLowerCase();
  const all = await getAllTeachingLogs();
  if (!clean || clean === 'all' || clean === 'all class' || clean === 'all classes') {
    return all;
  }
  const targetNorm = clean.replace(/\s+/g, ' ');
  return all.filter(
    (item) => item.class && item.class.trim().toLowerCase().replace(/\s+/g, ' ') === targetNorm
  );
}

export async function saveTeachingLogLocally(entry: TeachingLogEntry): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot save teaching log: No active workspace.');
  }
  const db = await getDB();
  if (!entry.owner_id) {
    entry.owner_id = currentWorkspaceId;
    entry.ownerId = currentWorkspaceId;
  }
  await db.put('teaching_logs', entry);
}

export async function deleteTeachingLogLocally(id: string): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot delete teaching log: No active workspace.');
  }
  const db = await getDB();
  await db.delete('teaching_logs', id);
}

export async function bulkSaveTeachingLogsLocally(entries: TeachingLogEntry[]): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot bulk save teaching logs: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('teaching_logs', 'readwrite');
  for (const e of entries) {
    if (!e.owner_id) {
      e.owner_id = currentWorkspaceId;
      e.ownerId = currentWorkspaceId;
    }
    await tx.store.put(e);
  }
  await tx.done;
}

export async function clearAllTeachingLogsLocally(): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot clear teaching logs: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('teaching_logs', 'readwrite');
  await tx.objectStore('teaching_logs').clear();
  await tx.done;
}

// -------------------------------------------------------------
// PRACTICAL PROGRESS REPOSITORY
// -------------------------------------------------------------

export async function getAllPracticalProgress(): Promise<PracticalProgressEntry[]> {
  if (!currentWorkspaceId) return [];
  const db = await getDB();
  const all = await db.getAll('practical_progress');
  return all.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
}

export async function getPracticalProgressByClass(classLevel: string): Promise<PracticalProgressEntry[]> {
  if (!currentWorkspaceId) return [];
  const clean = (classLevel || '').trim().toLowerCase();
  const all = await getAllPracticalProgress();
  if (!clean || clean === 'all' || clean === 'all class' || clean === 'all classes') {
    return all;
  }
  const targetNorm = clean.replace(/\s+/g, ' ');
  return all.filter(
    (item) => item.class && item.class.trim().toLowerCase().replace(/\s+/g, ' ') === targetNorm
  );
}

export async function savePracticalProgressLocally(entry: PracticalProgressEntry): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot save practical progress: No active workspace.');
  }
  const db = await getDB();
  if (!entry.owner_id) {
    entry.owner_id = currentWorkspaceId;
    entry.ownerId = currentWorkspaceId;
  }
  await db.put('practical_progress', entry);
}

export async function deletePracticalProgressLocally(id: string): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot delete practical progress: No active workspace.');
  }
  const db = await getDB();
  await db.delete('practical_progress', id);
}

export async function bulkSavePracticalProgressLocally(entries: PracticalProgressEntry[]): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot bulk save practical progress: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('practical_progress', 'readwrite');
  for (const e of entries) {
    if (!e.owner_id) {
      e.owner_id = currentWorkspaceId;
      e.ownerId = currentWorkspaceId;
    }
    await tx.store.put(e);
  }
  await tx.done;
}

export async function clearAllPracticalProgressLocally(): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot clear practical progress: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('practical_progress', 'readwrite');
  await tx.objectStore('practical_progress').clear();
  await tx.done;
}

// -------------------------------------------------------------
// ABSENTEE FOLLOW-UP REPOSITORY
// -------------------------------------------------------------

export async function getAllAbsenteeFollowups(): Promise<AbsenteeFollowupEntry[]> {
  if (!currentWorkspaceId) return [];
  const db = await getDB();
  const all = await db.getAll('absentee_followups');
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getAbsenteeFollowupsByClass(classLevel: string): Promise<AbsenteeFollowupEntry[]> {
  if (!currentWorkspaceId) return [];
  const clean = (classLevel || '').trim().toLowerCase();
  const all = await getAllAbsenteeFollowups();
  if (!clean || clean === 'all' || clean === 'all class' || clean === 'all classes') {
    return all;
  }
  const targetNorm = clean.replace(/\s+/g, ' ');
  return all.filter(
    (item) => item.class && item.class.trim().toLowerCase().replace(/\s+/g, ' ') === targetNorm
  );
}

export async function saveAbsenteeFollowupLocally(entry: AbsenteeFollowupEntry): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot save absentee followup: No active workspace.');
  }
  const db = await getDB();
  if (!entry.owner_id) {
    entry.owner_id = currentWorkspaceId;
    entry.ownerId = currentWorkspaceId;
  }
  await db.put('absentee_followups', entry);
}

export async function deleteAbsenteeFollowupLocally(id: string): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot delete absentee followup: No active workspace.');
  }
  const db = await getDB();
  await db.delete('absentee_followups', id);
}

export async function bulkSaveAbsenteeFollowupsLocally(entries: AbsenteeFollowupEntry[]): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot bulk save absentee followups: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('absentee_followups', 'readwrite');
  for (const e of entries) {
    if (!e.owner_id) {
      e.owner_id = currentWorkspaceId;
      e.ownerId = currentWorkspaceId;
    }
    await tx.store.put(e);
  }
  await tx.done;
}

export async function clearAllAbsenteeFollowupsLocally(): Promise<void> {
  if (!currentWorkspaceId) {
    throw new Error('Cannot clear absentee followups: No active workspace.');
  }
  const db = await getDB();
  const tx = db.transaction('absentee_followups', 'readwrite');
  await tx.objectStore('absentee_followups').clear();
  await tx.done;
}

// -------------------------------------------------------------
// LEGACY RECORD INSPECTION, LINKING & ROLLBACK PROTECTION
// -------------------------------------------------------------

export interface LegacyMigrationManifest {
  migratedAt: string;
  sourceDb: string;
  targetDb: string;
  targetOwnerId: string;
  targetEmail: string;
  counts: {
    students: number;
    attendance: number;
    teaching_logs: number;
    practical_progress: number;
    absentee_followups: number;
    outbox: number;
    conflicts: number;
  };
}

export interface LegacyDataInspection {
  hasLegacyData: boolean;
  totalRecords: number;
  counts: {
    students: number;
    attendance: number;
    teaching_logs: number;
    practical_progress: number;
    absentee_followups: number;
    outbox: number;
  };
  isAlreadyLinked: boolean;
  isDismissedForOwner: boolean;
  manifest?: LegacyMigrationManifest;
}

/**
 * Inspect the unpartitioned legacy database (gbhs_operator_db_v1)
 * Strictly read-only without modifying, deleting, or moving any data.
 */
export async function inspectLegacyRecords(currentOwnerId?: string): Promise<LegacyDataInspection> {
  const legacyDb = await getDB(LEGACY_DB_NAME);
  const [students, attendance, teaching_logs, practical_progress, absentee_followups, outbox] =
    await Promise.all([
      legacyDb.count('students'),
      legacyDb.count('attendance'),
      legacyDb.count('teaching_logs'),
      legacyDb.count('practical_progress'),
      legacyDb.count('absentee_followups'),
      legacyDb.count('outbox'),
    ]);

  const totalRecords =
    students + attendance + teaching_logs + practical_progress + absentee_followups + outbox;
  const manifest = await getAppState<LegacyMigrationManifest>('legacy_migration_manifest');

  let isDismissedForOwner = false;
  if (currentOwnerId) {
    const dismissed = await getAppState<boolean>(
      `legacy_linking_dismissed_${sanitizeWorkspaceId(currentOwnerId)}`
    );
    isDismissedForOwner = Boolean(dismissed);
  }

  const isAlreadyLinked = Boolean(manifest && currentOwnerId && manifest.targetOwnerId === currentOwnerId);

  return {
    hasLegacyData: totalRecords > 0,
    totalRecords,
    counts: {
      students,
      attendance,
      teaching_logs,
      practical_progress,
      absentee_followups,
      outbox,
    },
    isAlreadyLinked,
    isDismissedForOwner,
    manifest: manifest || undefined,
  };
}

/**
 * Safely copy legacy local records into the authenticated owner's workspace.
 * Existing records in gbhs_operator_db_v1 remain 100% intact as a permanent local rollback archive.
 */
export async function linkAndMigrateLegacyRecordsToWorkspace(
  targetOwnerId: string,
  targetEmail: string
): Promise<{ success: boolean; manifest?: LegacyMigrationManifest; error?: string }> {
  if (!targetOwnerId || !targetEmail) {
    return {
      success: false,
      error: 'Target owner ID and email are required to link legacy records.',
    };
  }

  try {
    const legacyDb = await getDB(LEGACY_DB_NAME);
    const targetDbName = getWorkspaceDatabaseName(targetOwnerId);
    const targetDb = await getDB(targetDbName);

    // 1. Read all legacy records non-destructively
    const [students, attendance, teachingLogs, practicalProgress, absenteeFollowups, outbox, conflicts] =
      await Promise.all([
        legacyDb.getAll('students'),
        legacyDb.getAll('attendance'),
        legacyDb.getAll('teaching_logs'),
        legacyDb.getAll('practical_progress'),
        legacyDb.getAll('absentee_followups'),
        legacyDb.getAll('outbox'),
        legacyDb.getAll('conflicts'),
      ]);

    const nowIso = new Date().toISOString();

    // 2. Clone and stamp owner_id
    const taggedStudents = students.map((s) => ({
      ...s,
      owner_id: targetOwnerId,
      ownerId: targetOwnerId,
      updatedAt: nowIso,
    }));

    // Build student lookup maps for relationship resolution
    const studentIdByRoll = new Map<string, string>();
    const studentIdByAdm = new Map<string, string>();
    for (const s of taggedStudents) {
      if (s.rollNo) studentIdByRoll.set(s.rollNo.trim(), s.id);
      if (s.admissionNo) studentIdByAdm.set(s.admissionNo.trim(), s.id);
    }

    const taggedAttendance = attendance.map((a) => {
      const resolvedStudentId = a.studentId || studentIdByRoll.get(a.rollNo?.trim()) || a.studentId;
      return {
        ...a,
        studentId: resolvedStudentId,
        owner_id: targetOwnerId,
        ownerId: targetOwnerId,
        updatedAt: nowIso,
      };
    });

    const taggedTeachingLogs = teachingLogs.map((t) => ({
      ...t,
      owner_id: targetOwnerId,
      ownerId: targetOwnerId,
      updatedAt: nowIso,
    }));

    const taggedPracticalProgress = practicalProgress.map((p) => {
      const resolvedStudentId = p.studentId || studentIdByRoll.get(p.registrationId?.trim()) || studentIdByAdm.get(p.registrationId?.trim()) || p.studentId;
      return {
        ...p,
        studentId: resolvedStudentId,
        owner_id: targetOwnerId,
        ownerId: targetOwnerId,
        updatedAt: nowIso,
      };
    });

    const taggedAbsenteeFollowups = absenteeFollowups.map((f) => {
      const resolvedStudentId = f.studentId || studentIdByRoll.get(f.registrationId?.trim()) || studentIdByAdm.get(f.registrationId?.trim()) || f.studentId;
      return {
        ...f,
        studentId: resolvedStudentId,
        owner_id: targetOwnerId,
        ownerId: targetOwnerId,
        updatedAt: nowIso,
      };
    });

    // Tag legacy outbox as archived and excluded so it is never replayed or uploaded to cloud
    const taggedOutbox = outbox.map((op) => ({
      ...op,
      status: 'legacy_archived' as const,
      isLegacy: true,
      userEmail: targetEmail,
      payload: op.payload
        ? { ...op.payload, owner_id: targetOwnerId, ownerId: targetOwnerId }
        : op.payload,
    }));

    // 3. Populate target workspace database
    if (taggedStudents.length > 0) {
      const tx = targetDb.transaction('students', 'readwrite');
      for (const s of taggedStudents) await tx.store.put(s);
      await tx.done;
    }

    if (taggedAttendance.length > 0) {
      const tx = targetDb.transaction('attendance', 'readwrite');
      for (const a of taggedAttendance) await tx.store.put(a);
      await tx.done;
    }

    if (taggedTeachingLogs.length > 0) {
      const tx = targetDb.transaction('teaching_logs', 'readwrite');
      for (const t of taggedTeachingLogs) await tx.store.put(t);
      await tx.done;
    }

    if (taggedPracticalProgress.length > 0) {
      const tx = targetDb.transaction('practical_progress', 'readwrite');
      for (const p of taggedPracticalProgress) await tx.store.put(p);
      await tx.done;
    }

    if (taggedAbsenteeFollowups.length > 0) {
      const tx = targetDb.transaction('absentee_followups', 'readwrite');
      for (const f of taggedAbsenteeFollowups) await tx.store.put(f);
      await tx.done;
    }

    if (taggedOutbox.length > 0) {
      const tx = targetDb.transaction('outbox', 'readwrite');
      for (const o of taggedOutbox) await tx.store.put(o);
      await tx.done;
    }

    if (conflicts.length > 0) {
      const tx = targetDb.transaction('conflicts', 'readwrite');
      for (const c of conflicts) await tx.store.put(c);
      await tx.done;
    }

    // 4. Save manifest in global app_state
    const manifest: LegacyMigrationManifest = {
      migratedAt: nowIso,
      sourceDb: LEGACY_DB_NAME,
      targetDb: targetDbName,
      targetOwnerId,
      targetEmail,
      counts: {
        students: taggedStudents.length,
        attendance: taggedAttendance.length,
        teaching_logs: taggedTeachingLogs.length,
        practical_progress: taggedPracticalProgress.length,
        absentee_followups: taggedAbsenteeFollowups.length,
        outbox: taggedOutbox.length,
        conflicts: conflicts.length,
      },
    };

    await setAppState('legacy_migration_manifest', manifest);

    return { success: true, manifest };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to link legacy records.' };
  }
}

/**
 * Revert workspace linking back to empty state.
 * Legacy records in gbhs_operator_db_v1 were never touched and remain completely safe.
 */
export async function rollbackLegacyMigration(
  targetOwnerId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const targetDbName = getWorkspaceDatabaseName(targetOwnerId);
    const targetDb = await getDB(targetDbName);

    const stores: Array<
      | 'students'
      | 'attendance'
      | 'teaching_logs'
      | 'practical_progress'
      | 'absentee_followups'
      | 'outbox'
      | 'conflicts'
    > = [
      'students',
      'attendance',
      'teaching_logs',
      'practical_progress',
      'absentee_followups',
      'outbox',
      'conflicts',
    ];

    for (const store of stores) {
      const tx = targetDb.transaction(store, 'readwrite');
      await tx.store.clear();
      await tx.done;
    }

    await removeAppState('legacy_migration_manifest');

    return {
      success: true,
      message:
        'Workspace rolled back successfully. Legacy local archive remains 100% intact and untouched.',
    };
  } catch (err: any) {
    return { success: false, message: '', error: err.message || 'Failed to rollback migration.' };
  }
}

/**
 * Dismiss legacy records linking prompt for a specific owner account
 */
export async function dismissLegacyLinkingForOwner(ownerId: string): Promise<void> {
  await setAppState(`legacy_linking_dismissed_${sanitizeWorkspaceId(ownerId)}`, true);
}

