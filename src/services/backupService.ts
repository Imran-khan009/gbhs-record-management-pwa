import { getDB, getWorkspaceDatabaseName } from './db';
import {
  DatabaseBackup,
  BackupMetadata,
  StoreCounts,
  BackupVerificationResult,
  BackupValidationResult,
  BackupPreviewSummary,
  RestoreExecutionResult,
} from '../types/backup';
import { syncEngine } from './syncEngine';
import { getWorkspacePermissions } from './permissionService';

export const DB_NAME = 'gbhs_operator_db_v1';
export const DB_VERSION = 2;
export const APP_NAME = 'GBHS Computer Operator Record Management';
export const APP_VERSION = '2.0.0';

export const STORE_NAMES = [
  'students',
  'attendance',
  'teaching_logs',
  'practical_progress',
  'absentee_followups',
  'outbox',
  'conflicts',
  'app_state',
] as const;

/**
 * Safely retrieve current record counts for all 8 IndexedDB stores.
 * Strictly non-destructive read-only operation.
 */
export async function getStoreCounts(targetDbName?: string): Promise<StoreCounts> {
  const db = await getDB(targetDbName);
  const [
    students,
    attendance,
    teaching_logs,
    practical_progress,
    absentee_followups,
    outbox,
    conflicts,
    app_state,
  ] = await Promise.all([
    db.count('students'),
    db.count('attendance'),
    db.count('teaching_logs'),
    db.count('practical_progress'),
    db.count('absentee_followups'),
    db.count('outbox'),
    db.count('conflicts'),
    db.count('app_state'),
  ]);

  return {
    students,
    attendance,
    teaching_logs,
    practical_progress,
    absentee_followups,
    outbox,
    conflicts,
    app_state,
  };
}

/**
 * Sanitize app_state entries to ensure no authentication tokens,
 * passwords, or cryptographic secrets are included in the export.
 */
function sanitizeAppState(
  entries: Array<{ key: string; value: any }>
): Array<{ key: string; value: any }> {
  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;

    const key = entry.key;
    let value = entry.value;

    // Sanitize session credentials
    if (key === 'gbhs_active_session' && typeof value === 'object' && value !== null) {
      value = {
        ...value,
        token: '[REDACTED_SECURITY_TOKEN]',
        refreshToken: '[REDACTED_REFRESH_TOKEN]',
      };
    }

    // Sanitize any other potential secret keys
    if (
      typeof key === 'string' &&
      (key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('apikey') ||
        key.toLowerCase().includes('anonkey'))
    ) {
      value = '[REDACTED_CREDENTIAL]';
    }

    return { key, value };
  });
}

/**
 * Generate a safe, read-only backup of the active workspace database.
 * Verifies non-destructive execution by comparing store counts
 * before and after data reading.
 */
export async function createBackupData(targetDbName?: string): Promise<{
  backup: DatabaseBackup;
  verification: BackupVerificationResult;
}> {
  const session = syncEngine.getSession();
  if (session?.user) {
    const permissions = getWorkspacePermissions(session.user);
    if (!permissions.isOwner || permissions.isReadOnly) {
      throw new Error('Permission denied: Read-only team members cannot export database backups.');
    }
  }

  const db = await getDB(targetDbName);

  // 1. Capture store counts before reading
  const countsBefore = await getStoreCounts(targetDbName);

  // 2. Read all store records without mutating database
  const [
    students,
    attendance,
    teaching_logs,
    practical_progress,
    absentee_followups,
    outbox,
    conflicts,
    rawAppState,
  ] = await Promise.all([
    db.getAll('students'),
    db.getAll('attendance'),
    db.getAll('teaching_logs'),
    db.getAll('practical_progress'),
    db.getAll('absentee_followups'),
    db.getAll('outbox'),
    db.getAll('conflicts'),
    db.getAll('app_state'),
  ]);

  // 3. Capture store counts after reading to verify zero data loss or mutation
  const countsAfter = await getStoreCounts(targetDbName);

  // 4. Sanitize app_state to remove sensitive tokens and passwords
  const sanitizedAppState = sanitizeAppState(rawAppState);

  const exportedCounts: StoreCounts = {
    students: students.length,
    attendance: attendance.length,
    teaching_logs: teaching_logs.length,
    practical_progress: practical_progress.length,
    absentee_followups: absentee_followups.length,
    outbox: outbox.length,
    conflicts: conflicts.length,
    app_state: sanitizedAppState.length,
  };

  // 5. Compare counts before and after
  const mismatches: string[] = [];
  for (const storeName of STORE_NAMES) {
    if (countsBefore[storeName] !== countsAfter[storeName]) {
      mismatches.push(
        `Store "${storeName}" count changed during export (before: ${countsBefore[storeName]}, after: ${countsAfter[storeName]})`
      );
    }
    if (countsBefore[storeName] !== exportedCounts[storeName]) {
      mismatches.push(
        `Store "${storeName}" export count mismatch (database: ${countsBefore[storeName]}, exported: ${exportedCounts[storeName]})`
      );
    }
  }

  const verified = mismatches.length === 0;

  // Calculate pending unsynced outbox count
  const pendingOutboxCount = outbox.filter(
    (op) => op.status === 'pending' || op.status === 'failed' || op.status === 'syncing'
  ).length;

  const totalRecords =
    students.length +
    attendance.length +
    teaching_logs.length +
    practical_progress.length +
    absentee_followups.length +
    outbox.length +
    conflicts.length +
    sanitizedAppState.length;

  const workspaceId = session?.user?.workspaceOwnerId || session?.user?.id;
  const ownerEmail = session?.user?.email;

  const metadata: BackupMetadata = {
    exportDate: new Date().toISOString(),
    timestamp: Date.now(),
    databaseName: db.name || DB_NAME,
    databaseVersion: db.version || DB_VERSION,
    storeNames: [...STORE_NAMES],
    totalRecords,
    countsPerStore: exportedCounts,
    pendingOutboxCount,
    appName: APP_NAME,
    appVersion: APP_VERSION,
    workspaceId,
    ownerEmail,
  };

  const backup: DatabaseBackup = {
    metadata,
    stores: {
      students,
      attendance,
      teaching_logs,
      practical_progress,
      absentee_followups,
      outbox,
      conflicts,
      app_state: sanitizedAppState,
    },
  };

  const verification: BackupVerificationResult = {
    verified,
    countsBefore,
    countsAfter,
    exportedCounts,
    mismatches,
  };

  return { backup, verification };
}

/**
 * Serialize backup to a verified JSON string and formatted filename.
 */
export async function exportBackupToJSON(targetDbName?: string): Promise<{
  jsonString: string;
  filename: string;
  verification: BackupVerificationResult;
  metadata: BackupMetadata;
}> {
  const { backup, verification } = await createBackupData(targetDbName);

  if (!verification.verified) {
    throw new Error(
      `Backup verification failed due to store count discrepancies: ${verification.mismatches.join('; ')}`
    );
  }

  const jsonString = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `gbhs-backup-${dateStr}.json`;

  return {
    jsonString,
    filename,
    verification,
    metadata: backup.metadata,
  };
}

/**
 * User-triggered browser file download for the local backup.
 * Safely creates a Blob URL, triggers download, and cleans up.
 */
export async function downloadLocalBackup(targetDbName?: string): Promise<{
  success: boolean;
  filename: string;
  totalRecords: number;
  verification: BackupVerificationResult;
  error?: string;
}> {
  try {
    const permissions = getWorkspacePermissions(syncEngine.getSession()?.user);
    if (permissions.isReadOnly) {
      return {
        success: false,
        filename: '',
        totalRecords: 0,
        verification: {
          verified: false,
          countsBefore: {} as StoreCounts,
          countsAfter: {} as StoreCounts,
          exportedCounts: {} as StoreCounts,
          mismatches: ['Permission denied: Read-only team members cannot export database backups.'],
        },
        error: 'Permission denied: Read-only team members cannot export database backups.',
      };
    }

    const { jsonString, filename, verification, metadata } = await exportBackupToJSON(targetDbName);

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    return {
      success: true,
      filename,
      totalRecords: metadata.totalRecords,
      verification,
    };
  } catch (err: any) {
    return {
      success: false,
      filename: '',
      totalRecords: 0,
      verification: {
        verified: false,
        countsBefore: {} as StoreCounts,
        countsAfter: {} as StoreCounts,
        exportedCounts: {} as StoreCounts,
        mismatches: [err.message || 'Unknown export error'],
      },
      error: err.message || 'Failed to generate local database backup.',
    };
  }
}

/**
 * Validate a backup JSON string prior to restoration.
 * Verifies application identity, metadata completeness, store presence,
 * record shapes, counts, relational integrity, and workspace ownership.
 */
export async function validateBackupJSON(
  jsonString: string,
  targetWorkspaceId: string,
  targetDbName?: string
): Promise<BackupValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. JSON Parse validation
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    return {
      isValid: false,
      errors: [`Invalid JSON file format: ${err.message || 'Syntax error'}`],
      warnings: [],
    };
  }

  // 2. Root Structure validation
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      isValid: false,
      errors: ['Invalid backup structure: Root must be a JSON object containing "metadata" and "stores".'],
      warnings: [],
    };
  }

  const { metadata, stores } = parsed;

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    errors.push('Missing or invalid "metadata" object in backup.');
  }
  if (!stores || typeof stores !== 'object' || Array.isArray(stores)) {
    errors.push('Missing or invalid "stores" object in backup.');
  }

  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  // 3. Application Identity & Version validation
  if (metadata.appName !== APP_NAME) {
    errors.push(
      `Incompatible application identity: Expected appName "${APP_NAME}", but found "${metadata.appName || 'unknown'}".`
    );
  }
  if (!metadata.appVersion || typeof metadata.appVersion !== 'string') {
    errors.push('Missing or invalid "appVersion" in backup metadata.');
  }

  // 4. Stores Presence & Names validation
  const requiredStoreSet = new Set<string>(STORE_NAMES);
  const actualStoreKeys = Object.keys(stores);

  for (const storeName of STORE_NAMES) {
    if (!stores[storeName] || !Array.isArray(stores[storeName])) {
      errors.push(`Missing or invalid store in backup: "${storeName}" must be an array.`);
    }
  }

  for (const storeKey of actualStoreKeys) {
    if (!requiredStoreSet.has(storeKey)) {
      errors.push(`Unexpected extra store "${storeKey}" found in backup file.`);
    }
  }

  // Check metadata.storeNames
  if (!Array.isArray(metadata.storeNames)) {
    errors.push('Missing or invalid "storeNames" array in backup metadata.');
  } else {
    for (const storeName of STORE_NAMES) {
      if (!metadata.storeNames.includes(storeName)) {
        errors.push(`Store "${storeName}" is missing from metadata.storeNames list.`);
      }
    }
    for (const name of metadata.storeNames) {
      if (!requiredStoreSet.has(name)) {
        errors.push(`Unexpected extra store "${name}" listed in metadata.storeNames.`);
      }
    }
  }

  // 5. Store Counts validation
  if (!metadata.countsPerStore || typeof metadata.countsPerStore !== 'object') {
    errors.push('Missing or invalid "countsPerStore" in backup metadata.');
  } else {
    let actualTotal = 0;
    for (const storeName of STORE_NAMES) {
      const declaredCount = metadata.countsPerStore[storeName];
      const actualCount = Array.isArray(stores[storeName]) ? stores[storeName].length : -1;
      if (declaredCount !== actualCount) {
        errors.push(
          `Record count mismatch for store "${storeName}": metadata declared ${declaredCount}, but found ${actualCount} records.`
        );
      }
      if (actualCount >= 0) {
        actualTotal += actualCount;
      }
    }

    if (typeof metadata.totalRecords !== 'number' || metadata.totalRecords !== actualTotal) {
      errors.push(
        `Total records mismatch: metadata declared ${metadata.totalRecords}, but actual sum of store records is ${actualTotal}.`
      );
    }
  }

  // 6. Record Structure validation
  if (Array.isArray(stores.students)) {
    for (let i = 0; i < stores.students.length; i++) {
      const s = stores.students[i];
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id.trim() || typeof s.name !== 'string') {
        errors.push(`Invalid student record at index ${i}: missing valid string "id" or "name".`);
        break;
      }
    }
  }

  if (Array.isArray(stores.attendance)) {
    for (let i = 0; i < stores.attendance.length; i++) {
      const a = stores.attendance[i];
      if (!a || typeof a !== 'object' || typeof a.id !== 'string' || typeof a.studentId !== 'string' || typeof a.date !== 'string') {
        errors.push(`Invalid attendance record at index ${i}: missing valid "id", "studentId", or "date".`);
        break;
      }
    }
  }

  if (Array.isArray(stores.teaching_logs)) {
    for (let i = 0; i < stores.teaching_logs.length; i++) {
      const t = stores.teaching_logs[i];
      if (!t || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.class !== 'string') {
        errors.push(`Invalid teaching log record at index ${i}: missing valid "id" or "class".`);
        break;
      }
    }
  }

  if (Array.isArray(stores.practical_progress)) {
    for (let i = 0; i < stores.practical_progress.length; i++) {
      const p = stores.practical_progress[i];
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.studentId !== 'string') {
        errors.push(`Invalid practical record at index ${i}: missing valid "id" or "studentId".`);
        break;
      }
    }
  }

  if (Array.isArray(stores.absentee_followups)) {
    for (let i = 0; i < stores.absentee_followups.length; i++) {
      const f = stores.absentee_followups[i];
      if (!f || typeof f !== 'object' || typeof f.id !== 'string' || typeof f.studentId !== 'string') {
        errors.push(`Invalid absentee follow-up record at index ${i}: missing valid "id" or "studentId".`);
        break;
      }
    }
  }

  if (Array.isArray(stores.outbox)) {
    for (let i = 0; i < stores.outbox.length; i++) {
      const o = stores.outbox[i];
      if (!o || typeof o !== 'object' || typeof o.opId !== 'string') {
        errors.push(`Invalid outbox operation at index ${i}: missing valid "opId".`);
        break;
      }
    }
  }

  if (Array.isArray(stores.conflicts)) {
    for (let i = 0; i < stores.conflicts.length; i++) {
      const c = stores.conflicts[i];
      if (!c || typeof c !== 'object' || typeof c.id !== 'string') {
        errors.push(`Invalid conflict record at index ${i}: missing valid "id".`);
        break;
      }
    }
  }

  if (Array.isArray(stores.app_state)) {
    for (let i = 0; i < stores.app_state.length; i++) {
      const st = stores.app_state[i];
      if (!st || typeof st !== 'object' || typeof st.key !== 'string') {
        errors.push(`Invalid app_state entry at index ${i}: missing valid string "key".`);
        break;
      }
    }
  }

  // 7. Relational Integrity validation
  const studentIds = new Set<string>();
  if (Array.isArray(stores.students)) {
    for (const s of stores.students) {
      if (s?.id) studentIds.add(s.id);
    }
  }

  if (Array.isArray(stores.attendance)) {
    for (const a of stores.attendance) {
      if (a?.studentId && !studentIds.has(a.studentId)) {
        errors.push(
          `Invalid relationship: Attendance record "${a.id}" references unknown student ID "${a.studentId}".`
        );
        break;
      }
    }
  }

  if (Array.isArray(stores.practical_progress)) {
    for (const p of stores.practical_progress) {
      if (p?.studentId && !studentIds.has(p.studentId)) {
        errors.push(
          `Invalid relationship: Practical progress record "${p.id}" references unknown student ID "${p.studentId}".`
        );
        break;
      }
    }
  }

  if (Array.isArray(stores.absentee_followups)) {
    for (const f of stores.absentee_followups) {
      if (f?.studentId && !studentIds.has(f.studentId)) {
        errors.push(
          `Invalid relationship: Absentee follow-up record "${f.id}" references unknown student ID "${f.studentId}".`
        );
        break;
      }
    }
  }

  // 8. Workspace Ownership & Isolation validation
  const targetDb = targetDbName || getWorkspaceDatabaseName(targetWorkspaceId);

  // If backup specifies workspaceId, it must match current workspace
  if (metadata.workspaceId && metadata.workspaceId !== targetWorkspaceId) {
    errors.push(
      `Workspace mismatch: Backup belongs to workspace "${metadata.workspaceId}", but the currently authenticated workspace is "${targetWorkspaceId}". Restoration rejected.`
    );
  }

  // If backup database name is an isolated workspace db, verify it matches target database
  if (
    metadata.databaseName &&
    metadata.databaseName.startsWith('gbhs_workspace_') &&
    metadata.databaseName !== targetDb
  ) {
    errors.push(
      `Database mismatch: Backup was exported from database "${metadata.databaseName}", but target database is "${targetDb}". Restoration rejected.`
    );
  }

  // Verify individual student ownership if stamped
  if (Array.isArray(stores.students)) {
    for (const s of stores.students) {
      const recordOwner = s?.owner_id || s?.ownerId;
      if (recordOwner && recordOwner !== targetWorkspaceId) {
        errors.push(
          `Workspace ownership violation: Student record "${s.name}" (${s.id}) belongs to owner "${recordOwner}", not current workspace "${targetWorkspaceId}".`
        );
        break;
      }
    }
  }

  // 9. Warnings & Current Database Inspection
  let targetStoreCounts: StoreCounts = {
    students: 0,
    attendance: 0,
    teaching_logs: 0,
    practical_progress: 0,
    absentee_followups: 0,
    outbox: 0,
    conflicts: 0,
    app_state: 0,
  };
  let currentPendingOutboxCount = 0;

  try {
    targetStoreCounts = await getStoreCounts(targetDb);
    const db = await getDB(targetDb);
    const currentOutbox = await db.getAll('outbox');
    currentPendingOutboxCount = currentOutbox.filter(
      (op) => op.status === 'pending' || op.status === 'failed' || op.status === 'syncing'
    ).length;
    if (currentPendingOutboxCount > 0) {
      warnings.push(
        `Current workspace has ${currentPendingOutboxCount} pending unsynced changes that will be replaced by restoration.`
      );
    }
  } catch {
    // If targetDb does not exist yet, default counts are 0
  }

  // Explain pending outbox operations in the backup
  const backupPendingOutboxCount = Array.isArray(stores.outbox)
    ? stores.outbox.filter(
        (op: any) => op?.status === 'pending' || op?.status === 'failed' || op?.status === 'syncing'
      ).length
    : 0;

  if (backupPendingOutboxCount > 0) {
    warnings.push(
      `Backup contains ${backupPendingOutboxCount} unsynced pending outbox operations. These will be safely archived upon restore and will not be replayed to cloud sync.`
    );
  }

  const isValid = errors.length === 0;

  let summary: BackupPreviewSummary | undefined;
  if (isValid) {
    summary = {
      appName: metadata.appName,
      appVersion: metadata.appVersion,
      exportDate: metadata.exportDate,
      databaseName: metadata.databaseName,
      workspaceId: metadata.workspaceId,
      ownerEmail: metadata.ownerEmail,
      totalRecords: metadata.totalRecords,
      countsPerStore: metadata.countsPerStore,
      pendingOutboxCount: backupPendingOutboxCount,
      targetWorkspaceId,
      targetDatabaseName: targetDb,
      targetStoreCounts,
      currentPendingOutboxCount,
    };
  }

  return {
    isValid,
    errors,
    warnings,
    backup: isValid ? (parsed as DatabaseBackup) : undefined,
    summary,
  };
}

/**
 * Restore a verified backup into the target workspace database.
 * Uses an atomic multi-store IndexedDB transaction with an automatic
 * in-memory staging snapshot and rollback strategy if any error occurs.
 */
export async function restoreBackupData(
  backup: DatabaseBackup,
  targetWorkspaceId: string,
  targetDbName?: string
): Promise<RestoreExecutionResult> {
  const permissions = getWorkspacePermissions(syncEngine.getSession()?.user);
  if (!permissions.isOwner || permissions.isReadOnly) {
    throw new Error('Permission denied: Only the authorized Workspace Owner can restore database backups.');
  }

  if (!targetWorkspaceId || !targetWorkspaceId.trim()) {
    throw new Error('Target workspace ID is required for safe restoration.');
  }

  const currentSession = syncEngine.getSession();
  const activeWsId = currentSession?.user?.workspaceOwnerId || currentSession?.user?.id;
  if (activeWsId && activeWsId !== targetWorkspaceId) {
    throw new Error(
      `Workspace mismatch: Cannot restore into workspace "${targetWorkspaceId}" while active workspace is "${activeWsId}".`
    );
  }

  const targetDb = targetDbName || getWorkspaceDatabaseName(targetWorkspaceId);
  const db = await getDB(targetDb);

  // 1. Snapshot all current store records in memory for atomic staging and rollback
  const snapshotBefore: Record<string, any[]> = {
    students: await db.getAll('students'),
    attendance: await db.getAll('attendance'),
    teaching_logs: await db.getAll('teaching_logs'),
    practical_progress: await db.getAll('practical_progress'),
    absentee_followups: await db.getAll('absentee_followups'),
    outbox: await db.getAll('outbox'),
    conflicts: await db.getAll('conflicts'),
    app_state: await db.getAll('app_state'),
  };

  // 2. Prepare sanitized outbox operations:
  // Stale pending/failed/syncing operations are converted to 'legacy_archived' with isLegacy: true
  // so they are safely preserved locally, never auto-replayed, and never falsely marked as synced.
  const sanitizedOutbox = backup.stores.outbox.map((op) => {
    if (op.status === 'pending' || op.status === 'syncing' || op.status === 'failed') {
      return {
        ...op,
        status: 'legacy_archived' as const,
        isLegacy: true,
      };
    }
    return op;
  });

  // 3. Prepare sanitized app_state:
  // Do NOT restore auth tokens, passwords, or active session from backup.
  // Preserve current live session in app_state if present.
  let currentSessionState = snapshotBefore.app_state.find(
    (entry) => entry && entry.key === 'gbhs_active_session'
  );
  if (!currentSessionState && currentSession) {
    currentSessionState = { key: 'gbhs_active_session', value: currentSession };
  }
  const currentSupabaseConfig = snapshotBefore.app_state.find(
    (entry) => entry && entry.key === 'supabase_config'
  );

  const sanitizedAppState = backup.stores.app_state.filter((entry) => {
    if (!entry || typeof entry !== 'object' || !entry.key) return false;
    const key = String(entry.key).toLowerCase();
    // Drop sensitive credentials or redacted placeholders from backup
    if (
      key === 'gbhs_active_session' ||
      key.includes('token') ||
      key.includes('password') ||
      key.includes('secret') ||
      key.includes('apikey') ||
      key.includes('anonkey')
    ) {
      return false;
    }
    if (typeof entry.value === 'string' && entry.value.includes('[REDACTED_')) {
      return false;
    }
    return true;
  });

  // Re-inject live session and live Supabase config so authentication is never wiped
  if (currentSessionState) {
    sanitizedAppState.push(currentSessionState);
  }
  if (currentSupabaseConfig) {
    sanitizedAppState.push(currentSupabaseConfig);
  }

  // 4. Execute atomic multi-store transaction
  try {
    const tx = db.transaction(
      [
        'students',
        'attendance',
        'teaching_logs',
        'practical_progress',
        'absentee_followups',
        'outbox',
        'conflicts',
        'app_state',
      ],
      'readwrite'
    );

    // Clear all stores
    for (const storeName of STORE_NAMES) {
      await tx.objectStore(storeName).clear();
    }

    // Populate validated stores
    for (const student of backup.stores.students) {
      await tx.objectStore('students').put(student);
    }
    for (const record of backup.stores.attendance) {
      await tx.objectStore('attendance').put(record);
    }
    for (const log of backup.stores.teaching_logs) {
      await tx.objectStore('teaching_logs').put(log);
    }
    for (const practical of backup.stores.practical_progress) {
      await tx.objectStore('practical_progress').put(practical);
    }
    for (const followup of backup.stores.absentee_followups) {
      await tx.objectStore('absentee_followups').put(followup);
    }
    for (const op of sanitizedOutbox) {
      await tx.objectStore('outbox').put(op);
    }
    for (const conflict of backup.stores.conflicts) {
      await tx.objectStore('conflicts').put(conflict);
    }
    for (const stateEntry of sanitizedAppState) {
      await tx.objectStore('app_state').put(stateEntry);
    }

    await tx.done;
  } catch (txErr: any) {
    console.error('Database restore transaction failed! Initiating rollback to pre-restore snapshot...', txErr);
    try {
      await rollbackToSnapshot(db, snapshotBefore);
    } catch (rbErr: any) {
      console.error('Critical rollback error:', rbErr);
    }
    return {
      success: false,
      restoredCounts: {} as StoreCounts,
      totalRecords: 0,
      targetDatabaseName: targetDb,
      targetWorkspaceId,
      error: `Restoration transaction failed and was rolled back: ${txErr.message || 'IndexedDB transaction error'}`,
      rolledBack: true,
    };
  }

  // 5. Post-Restoration Verification
  const countsAfter = await getStoreCounts(targetDb);
  const totalRecords =
    countsAfter.students +
    countsAfter.attendance +
    countsAfter.teaching_logs +
    countsAfter.practical_progress +
    countsAfter.absentee_followups +
    countsAfter.outbox +
    countsAfter.conflicts +
    countsAfter.app_state;

  return {
    success: true,
    restoredCounts: countsAfter,
    totalRecords,
    targetDatabaseName: targetDb,
    targetWorkspaceId,
  };
}

/**
 * Safely restores all stores to the pre-restore in-memory snapshot.
 */
async function rollbackToSnapshot(db: any, snapshot: Record<string, any[]>): Promise<void> {
  const rollbackTx = db.transaction(
    [
      'students',
      'attendance',
      'teaching_logs',
      'practical_progress',
      'absentee_followups',
      'outbox',
      'conflicts',
      'app_state',
    ],
    'readwrite'
  );

  for (const storeName of STORE_NAMES) {
    await rollbackTx.objectStore(storeName).clear();
    for (const record of snapshot[storeName] || []) {
      await rollbackTx.objectStore(storeName).put(record);
    }
  }

  await rollbackTx.done;
}
