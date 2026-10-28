import { Student, AttendanceRecord } from './student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from './modules';
import { OutboxOperation, ConflictItem } from './sync';

export interface StoreCounts {
  students: number;
  attendance: number;
  teaching_logs: number;
  practical_progress: number;
  absentee_followups: number;
  outbox: number;
  conflicts: number;
  app_state: number;
}

export interface BackupMetadata {
  exportDate: string; // ISO 8601 string
  timestamp: number; // millisecond timestamp
  databaseName: string; // gbhs_operator_db_v1 or gbhs_workspace_<id>
  databaseVersion: number; // 2
  storeNames: string[];
  totalRecords: number;
  countsPerStore: StoreCounts;
  pendingOutboxCount: number;
  appName: string;
  appVersion: string;
  workspaceId?: string; // Optional workspace owner ID for workspace isolation
  ownerEmail?: string; // Optional workspace owner email
}

export interface DatabaseBackup {
  metadata: BackupMetadata;
  stores: {
    students: Student[];
    attendance: AttendanceRecord[];
    teaching_logs: TeachingLogEntry[];
    practical_progress: PracticalProgressEntry[];
    absentee_followups: AbsenteeFollowupEntry[];
    outbox: OutboxOperation[];
    conflicts: ConflictItem[];
    app_state: Array<{ key: string; value: any }>;
  };
}

export interface BackupVerificationResult {
  verified: boolean;
  countsBefore: StoreCounts;
  countsAfter: StoreCounts;
  exportedCounts: StoreCounts;
  mismatches: string[];
}

export interface BackupValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  backup?: DatabaseBackup;
  summary?: BackupPreviewSummary;
}

export interface BackupPreviewSummary {
  appName: string;
  appVersion: string;
  exportDate: string;
  databaseName: string;
  workspaceId?: string;
  ownerEmail?: string;
  totalRecords: number;
  countsPerStore: StoreCounts;
  pendingOutboxCount: number;
  targetWorkspaceId: string;
  targetDatabaseName: string;
  targetStoreCounts: StoreCounts;
  currentPendingOutboxCount: number;
}

export interface RestoreExecutionResult {
  success: boolean;
  restoredCounts: StoreCounts;
  totalRecords: number;
  targetDatabaseName: string;
  targetWorkspaceId: string;
  error?: string;
  rolledBack?: boolean;
}
