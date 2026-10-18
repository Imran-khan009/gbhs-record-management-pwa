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
  enqueueOutboxOperation,
  getAppState,
  setAppState,
} from './db';
import { OutboxOperation } from '../types/sync';
import { syncEngine } from './syncEngine';

const DEFAULT_SCHOOL_ID = 'GBHS-MAIN';

export async function createStudent(
  data: Omit<Student, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'schoolId' | 'createdBy'>,
  userEmail: string
): Promise<{ success: boolean; student?: Student; error?: string }> {
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

  const newStudent: Student = {
    ...data,
    id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    schoolId: DEFAULT_SCHOOL_ID,
    createdBy: userEmail,
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

  return { success: true, student: newStudent };
}

export async function updateStudent(
  id: string,
  updates: Partial<Omit<Student, 'id' | 'createdAt' | 'schoolId' | 'createdBy'>>,
  userEmail: string
): Promise<{ success: boolean; student?: Student; error?: string }> {
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

  return { success: true, student: updatedStudent };
}

export async function deleteStudent(
  id: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getStudentById(id);
  if (!current) {
    return { success: false, error: 'Student record not found.' };
  }

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

  return { success: true };
}

// -------------------------------------------------------------
// ATTENDANCE OPERATIONS
// -------------------------------------------------------------

export async function markSingleAttendance(
  student: Student,
  date: string,
  status: AttendanceStatus,
  remarks: string | undefined,
  userEmail: string
): Promise<AttendanceRecord> {
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

export async function deleteAllStudentsData(userEmail: string): Promise<number> {
  const allStudents = await getAllStudents();
  const count = allStudents.length;

  // Clear students and attendance locally from IndexedDB
  await clearAllStudentsLocally();

  // Enqueue deletion ops for outbox synchronization
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

  // Prevent auto-seeding sample students automatically
  await setAppState('auto_seed_disabled', true);

  syncEngine.processQueue();
  return count;
}

export async function deleteStudentsByClassData(classLevel: string, userEmail: string): Promise<number> {
  const allStudents = await getAllStudents();
  const classStudents = allStudents.filter((s) => s.class === classLevel);
  const count = classStudents.length;

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

  // Pre-seed today's attendance for Class 7
  const today = new Date().toISOString().split('T')[0];
  const initialAttendance: AttendanceRecord[] = [
    {
      id: `${sampleStudents[0].id}_${today}`,
      studentId: sampleStudents[0].id,
      studentName: sampleStudents[0].name,
      rollNo: sampleStudents[0].rollNo,
      class: 'Class 7',
      section: 'A',
      date: today,
      status: 'Present',
      version: 1,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      markedBy: userEmail,
    },
    {
      id: `${sampleStudents[1].id}_${today}`,
      studentId: sampleStudents[1].id,
      studentName: sampleStudents[1].name,
      rollNo: sampleStudents[1].rollNo,
      class: 'Class 7',
      section: 'A',
      date: today,
      status: 'Present',
      version: 1,
      updatedAt: now,
      schoolId: DEFAULT_SCHOOL_ID,
      markedBy: userEmail,
    },
  ];

  await bulkSaveAttendanceLocally(initialAttendance);

  for (const att of initialAttendance) {
    const op: OutboxOperation = {
      opId: crypto.randomUUID(),
      entityId: att.id,
      entityType: 'attendance',
      operationType: 'UPDATE',
      payload: att,
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
