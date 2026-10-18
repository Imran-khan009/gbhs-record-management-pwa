import { Student, AttendanceRecord } from './student';

export type SyncOverallStatus =
  | 'Offline'
  | 'Local changes pending'
  | 'Syncing'
  | 'Synced'
  | 'Sync failed'
  | 'Conflict needs review'
  | 'Authentication required';

export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE';
export type EntityType = 'student' | 'attendance';

export interface OutboxOperation {
  opId: string; // Unique operation UUID
  entityId: string; // Stable ID of the student or attendance record
  entityType: EntityType;
  operationType: OperationType;
  payload: Student | AttendanceRecord | { id: string };
  timestamp: number; // millisecond timestamp of operation
  status: 'pending' | 'syncing' | 'failed' | 'conflict' | 'synced';
  retryCount: number;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  errorMessage?: string;
  errorType?: 'network' | 'validation' | 'conflict' | 'auth' | 'server';
  userEmail: string;
  version: number; // Snapshot of entity version when operation was queued
}

export interface ConflictItem {
  id: string; // Conflict ID
  opId: string; // Outbox operation ID
  entityId: string;
  entityType: EntityType;
  localData: any;
  remoteData: any;
  detectedAt: number;
  resolved: boolean;
  resolutionType?: 'keep_local' | 'keep_remote' | 'merge';
}

export interface SyncStats {
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  conflictedCount: number;
  syncedCount: number;
  lastSyncedAt: string | null;
  overallStatus: SyncOverallStatus;
  lastError: string | null;
}
