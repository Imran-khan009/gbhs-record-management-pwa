import { openDB, DBSchema, IDBPDatabase } from 'idb';
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

const DB_NAME = 'gbhs_operator_db_v1';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<GBHSDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<GBHSDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GBHSDB>(DB_NAME, DB_VERSION, {
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
  }
  return dbPromise;
}

// -------------------------------------------------------------
// STUDENT REPOSITORY
// -------------------------------------------------------------

export async function getAllStudents(): Promise<Student[]> {
  const db = await getDB();
  return db.getAll('students');
}

export async function getStudentsByClass(classLevel: string): Promise<Student[]> {
  const db = await getDB();
  const tx = db.transaction('students', 'readonly');
  const index = tx.store.index('by-class');
  return index.getAll(classLevel);
}

export async function getStudentById(id: string): Promise<Student | undefined> {
  const db = await getDB();
  return db.get('students', id);
}

export async function findStudentByAdmissionNo(admissionNo: string): Promise<Student | undefined> {
  const db = await getDB();
  const tx = db.transaction('students', 'readonly');
  const index = tx.store.index('by-admissionNo');
  return index.get(admissionNo.trim());
}

export async function saveStudentLocally(student: Student): Promise<void> {
  const db = await getDB();
  await db.put('students', student);
}

export async function deleteStudentLocally(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('students', id);
}

export async function bulkSaveStudentsLocally(students: Student[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('students', 'readwrite');
  for (const s of students) {
    await tx.store.put(s);
  }
  await tx.done;
}

export async function clearAllStudentsLocally(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['students', 'attendance'], 'readwrite');
  await tx.objectStore('students').clear();
  await tx.objectStore('attendance').clear();
  await tx.done;
}

export async function clearStudentsByClassLocally(classLevel: string): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('students', 'readwrite');
  const studentIndex = tx.objectStore('students').index('by-class');
  const students = await studentIndex.getAll(classLevel);
  for (const s of students) {
    await tx.objectStore('students').delete(s.id);
  }
  await tx.done;
  return students.length;
}

// -------------------------------------------------------------
// ATTENDANCE REPOSITORY
// -------------------------------------------------------------

export async function getAttendanceByDateAndClass(date: string, classLevel: string): Promise<AttendanceRecord[]> {
  const db = await getDB();
  const tx = db.transaction('attendance', 'readonly');
  const index = tx.store.index('by-date-class');
  return index.getAll([date, classLevel]);
}

export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
  const db = await getDB();
  return db.getAll('attendance');
}

export async function getAttendanceRecord(id: string): Promise<AttendanceRecord | undefined> {
  const db = await getDB();
  return db.get('attendance', id);
}

export async function saveAttendanceLocally(record: AttendanceRecord): Promise<void> {
  const db = await getDB();
  await db.put('attendance', record);
}

export async function bulkSaveAttendanceLocally(records: AttendanceRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('attendance', 'readwrite');
  for (const r of records) {
    await tx.store.put(r);
  }
  await tx.done;
}

// -------------------------------------------------------------
// OUTBOX QUEUE REPOSITORY
// -------------------------------------------------------------

export async function enqueueOutboxOperation(op: OutboxOperation): Promise<void> {
  const db = await getDB();
  await db.put('outbox', op);
}

export async function getOutboxOperations(): Promise<OutboxOperation[]> {
  const db = await getDB();
  const all = await db.getAll('outbox');
  // Sort chronologically
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getPendingOutboxOperations(): Promise<OutboxOperation[]> {
  const ops = await getOutboxOperations();
  return ops.filter((op) => op.status === 'pending' || op.status === 'failed');
}

export async function updateOutboxOperation(op: OutboxOperation): Promise<void> {
  const db = await getDB();
  await db.put('outbox', op);
}

export async function removeOutboxOperation(opId: string): Promise<void> {
  const db = await getDB();
  await db.delete('outbox', opId);
}

export async function clearSyncedOutboxOperations(): Promise<number> {
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

// -------------------------------------------------------------
// CONFLICTS REPOSITORY
// -------------------------------------------------------------

export async function saveConflict(conflict: ConflictItem): Promise<void> {
  const db = await getDB();
  await db.put('conflicts', conflict);
}

export async function getAllConflicts(): Promise<ConflictItem[]> {
  const db = await getDB();
  return db.getAll('conflicts');
}

export async function getUnresolvedConflicts(): Promise<ConflictItem[]> {
  const all = await getAllConflicts();
  return all.filter((c) => !c.resolved);
}

export async function markConflictResolved(
  id: string,
  resolutionType: 'keep_local' | 'keep_remote' | 'merge',
  fallbackConflict?: ConflictItem
): Promise<void> {
  const db = await getDB();
  let conflict = await db.get('conflicts', id);
  if (!conflict && fallbackConflict) {
    conflict = { ...fallbackConflict };
  }
  if (conflict) {
    conflict.resolved = true;
    conflict.resolutionType = resolutionType;
    await db.put('conflicts', conflict);
  }
}

// -------------------------------------------------------------
// APP STATE (Session, Metadata, Last Sync)
// -------------------------------------------------------------

export async function setAppState<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('app_state', { key, value });
}

export async function getAppState<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const item = await db.get('app_state', key);
  return item ? (item.value as T) : null;
}

export async function removeAppState(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('app_state', key);
}

// -------------------------------------------------------------
// TEACHING LOG REPOSITORY
// -------------------------------------------------------------

export async function getAllTeachingLogs(): Promise<TeachingLogEntry[]> {
  const db = await getDB();
  const all = await db.getAll('teaching_logs');
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getTeachingLogsByClass(classLevel: string): Promise<TeachingLogEntry[]> {
  const db = await getDB();
  const tx = db.transaction('teaching_logs', 'readonly');
  const index = tx.store.index('by-class');
  const items = await index.getAll(classLevel);
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveTeachingLogLocally(entry: TeachingLogEntry): Promise<void> {
  const db = await getDB();
  await db.put('teaching_logs', entry);
}

export async function deleteTeachingLogLocally(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('teaching_logs', id);
}

export async function bulkSaveTeachingLogsLocally(entries: TeachingLogEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('teaching_logs', 'readwrite');
  for (const e of entries) {
    await tx.store.put(e);
  }
  await tx.done;
}

// -------------------------------------------------------------
// PRACTICAL PROGRESS REPOSITORY
// -------------------------------------------------------------

export async function getAllPracticalProgress(): Promise<PracticalProgressEntry[]> {
  const db = await getDB();
  const all = await db.getAll('practical_progress');
  return all.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
}

export async function getPracticalProgressByClass(classLevel: string): Promise<PracticalProgressEntry[]> {
  const db = await getDB();
  const tx = db.transaction('practical_progress', 'readonly');
  const index = tx.store.index('by-class');
  const items = await index.getAll(classLevel);
  return items.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
}

export async function savePracticalProgressLocally(entry: PracticalProgressEntry): Promise<void> {
  const db = await getDB();
  await db.put('practical_progress', entry);
}

export async function deletePracticalProgressLocally(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('practical_progress', id);
}

export async function bulkSavePracticalProgressLocally(entries: PracticalProgressEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('practical_progress', 'readwrite');
  for (const e of entries) {
    await tx.store.put(e);
  }
  await tx.done;
}

// -------------------------------------------------------------
// ABSENTEE FOLLOW-UP REPOSITORY
// -------------------------------------------------------------

export async function getAllAbsenteeFollowups(): Promise<AbsenteeFollowupEntry[]> {
  const db = await getDB();
  const all = await db.getAll('absentee_followups');
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getAbsenteeFollowupsByClass(classLevel: string): Promise<AbsenteeFollowupEntry[]> {
  const db = await getDB();
  const tx = db.transaction('absentee_followups', 'readonly');
  const index = tx.store.index('by-class');
  const items = await index.getAll(classLevel);
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveAbsenteeFollowupLocally(entry: AbsenteeFollowupEntry): Promise<void> {
  const db = await getDB();
  await db.put('absentee_followups', entry);
}

export async function deleteAbsenteeFollowupLocally(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('absentee_followups', id);
}

export async function bulkSaveAbsenteeFollowupsLocally(entries: AbsenteeFollowupEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('absentee_followups', 'readwrite');
  for (const e of entries) {
    await tx.store.put(e);
  }
  await tx.done;
}
