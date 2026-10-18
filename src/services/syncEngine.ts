import {
  getOutboxOperations,
  updateOutboxOperation,
  saveConflict,
  getUnresolvedConflicts,
  markConflictResolved,
  saveStudentLocally,
  saveAttendanceLocally,
  getAppState,
  setAppState,
  clearSyncedOutboxOperations,
  getStudentById,
  getAttendanceRecord,
} from './db';
import { OutboxOperation, SyncStats, SyncOverallStatus, ConflictItem } from '../types/sync';
import { syncOperationToCloud } from './supabase';
import { AuthSession } from '../types/auth';

type SyncListener = (stats: SyncStats) => void;

class SyncEngine {
  private isProcessing = false;
  private listeners: Set<SyncListener> = new Set();
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private activeSession: AuthSession | null = null;
  private autoSyncTimer: any = null;

  private readonly BASE_BACKOFF_MS = 1000;
  private readonly MAX_BACKOFF_MS = 30000;
  private readonly MAX_AUTO_RETRIES = 5;

  constructor() {
    this.setupNetworkListeners();
    this.loadLastSyncTime();
  }

  private async loadLastSyncTime() {
    const savedTime = await getAppState<string>('last_synced_at');
    if (savedTime) {
      this.lastSyncedAt = savedTime;
    }
  }

  public setSession(session: AuthSession | null) {
    this.activeSession = session;
    this.notifyListeners();
  }

  public getSession(): AuthSession | null {
    return this.activeSession;
  }

  public setOnlineStatus(online: boolean) {
    this.isOnline = online;
    this.notifyListeners();
    if (online) {
      this.processQueue();
    }
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notifyListeners();
        this.processQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyListeners();
      });
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.getStats().then((stats) => listener(stats));
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notifyListeners() {
    const stats = await this.getStats();
    for (const listener of this.listeners) {
      try {
        listener(stats);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    }
  }

  public async getStats(): Promise<SyncStats> {
    const allOps = await getOutboxOperations();
    const unresolvedConflicts = await getUnresolvedConflicts();

    const pending = allOps.filter((o) => o.status === 'pending');
    const syncing = allOps.filter((o) => o.status === 'syncing');
    const failed = allOps.filter((o) => o.status === 'failed');
    const synced = allOps.filter((o) => o.status === 'synced');
    const conflicts = allOps.filter((o) => o.status === 'conflict');

    let overallStatus: SyncOverallStatus = 'Synced';

    if (!this.isOnline) {
      overallStatus = 'Offline';
    } else if (unresolvedConflicts.length > 0 || conflicts.length > 0) {
      overallStatus = 'Conflict needs review';
    } else if (this.activeSession && Date.now() > this.activeSession.expiresAt) {
      overallStatus = 'Authentication required';
    } else if (syncing.length > 0 || this.isProcessing) {
      overallStatus = 'Syncing';
    } else if (failed.length > 0) {
      overallStatus = 'Sync failed';
    } else if (pending.length > 0) {
      overallStatus = 'Local changes pending';
    } else {
      overallStatus = 'Synced';
    }

    return {
      pendingCount: pending.length,
      syncingCount: syncing.length,
      failedCount: failed.length,
      conflictedCount: unresolvedConflicts.length + conflicts.length,
      syncedCount: synced.length,
      lastSyncedAt: this.lastSyncedAt,
      overallStatus,
      lastError: this.lastError,
    };
  }

  /**
   * Main Queue Processor:
   * - Preserves order for operations affecting the same record.
   * - Idempotent retries.
   * - Handles backoff and conflict isolation.
   */
  public async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.isOnline) {
      this.notifyListeners();
      return;
    }

    // Require active trusted session to sync remotely
    if (!this.activeSession) {
      this.lastError = 'Authentication required before syncing to cloud.';
      this.notifyListeners();
      return;
    }

    // Check session expiry
    if (Date.now() > this.activeSession.expiresAt) {
      this.lastError = 'Session expired. Please re-authenticate to upload local changes.';
      this.notifyListeners();
      return;
    }

    this.isProcessing = true;
    this.notifyListeners();

    try {
      const allOps = await getOutboxOperations();
      const now = Date.now();

      // Filter eligible operations (pending or failed with expired backoff)
      const eligible = allOps.filter((op) => {
        if (op.status === 'synced' || op.status === 'conflict') return false;
        if (op.status === 'pending') return true;
        if (op.status === 'failed') {
          // If permanent validation or auth error, do not auto-retry indefinitely
          if (op.errorType === 'validation' || op.errorType === 'auth') return false;
          // Check exponential backoff window
          if (op.nextRetryAt && now < op.nextRetryAt) return false;
          // Exceeded max auto retries without manual trigger
          if (op.retryCount >= this.MAX_AUTO_RETRIES) return false;
          return true;
        }
        return false;
      });

      // Group by entityId to guarantee sequential execution per entity
      const entityMap = new Map<string, OutboxOperation[]>();
      for (const op of eligible) {
        const list = entityMap.get(op.entityId) || [];
        list.push(op);
        entityMap.set(op.entityId, list);
      }

      // Process in chronological order
      for (const [entityId, ops] of entityMap.entries()) {
        ops.sort((a, b) => a.timestamp - b.timestamp);

        for (const op of ops) {
          // Double check online state
          if (!this.isOnline) break;

          // Mark syncing
          op.status = 'syncing';
          op.lastAttemptAt = Date.now();
          await updateOutboxOperation(op);
          this.notifyListeners();

          const result = await syncOperationToCloud(op, this.activeSession?.token);

          if (result.success) {
            op.status = 'synced';
            op.errorMessage = undefined;
            op.errorType = undefined;
            await updateOutboxOperation(op);
            this.lastError = null;
          } else {
            const err = result.error!;
            this.lastError = err.message;

            if (err.type === 'conflict') {
              // Create conflict record for user review
              op.status = 'conflict';
              op.errorMessage = err.message;
              op.errorType = 'conflict';
              await updateOutboxOperation(op);

              const conflictItem: ConflictItem = {
                id: `conflict_${op.opId}`,
                opId: op.opId,
                entityId: op.entityId,
                entityType: op.entityType,
                localData: op.payload,
                remoteData: err.remoteData,
                detectedAt: Date.now(),
                resolved: false,
              };
              await saveConflict(conflictItem);
              break; // Stop further ops on this entity until conflict resolved
            } else if (err.type === 'auth') {
              op.status = 'failed';
              op.errorMessage = err.message;
              op.errorType = 'auth';
              await updateOutboxOperation(op);
              break; // Stop sync queue if token invalid
            } else if (err.type === 'validation') {
              op.status = 'failed';
              op.errorMessage = err.message;
              op.errorType = 'validation';
              await updateOutboxOperation(op);
              break;
            } else {
              // Network or temporary server failure: apply exponential backoff
              op.retryCount += 1;
              const delay = Math.min(
                this.BASE_BACKOFF_MS * Math.pow(2, op.retryCount),
                this.MAX_BACKOFF_MS
              );
              op.status = 'failed';
              op.errorMessage = err.message;
              op.errorType = 'network';
              op.nextRetryAt = Date.now() + delay;
              await updateOutboxOperation(op);
              break; // Stop processing further ops on this entity for backoff window
            }
          }
        }
      }

      // Check remaining
      const stats = await this.getStats();
      if (stats.pendingCount === 0 && stats.failedCount === 0 && stats.conflictedCount === 0) {
        this.lastSyncedAt = new Date().toISOString();
        await setAppState('last_synced_at', this.lastSyncedAt);
      }
    } catch (e: any) {
      this.lastError = e.message || 'Sync failed unexpectedly';
    } finally {
      this.isProcessing = false;
      this.notifyListeners();
    }
  }

  /**
   * Manual retry of all failed operations (bypasses backoff timer)
   */
  public async retryAllFailed(): Promise<void> {
    const allOps = await getOutboxOperations();
    for (const op of allOps) {
      if (op.status === 'failed') {
        op.status = 'pending';
        op.nextRetryAt = undefined;
        await updateOutboxOperation(op);
      }
    }
    await this.processQueue();
  }

  /**
   * Retry single specific operation
   */
  public async retryOperation(opId: string): Promise<void> {
    const allOps = await getOutboxOperations();
    const op = allOps.find((o) => o.opId === opId);
    if (op) {
      op.status = 'pending';
      op.nextRetryAt = undefined;
      await updateOutboxOperation(op);
      await this.processQueue();
    }
  }

  /**
   * Resolve conflict:
   * - 'keep_local': Re-queues local op with bumped version so it overwrites remote.
   * - 'keep_remote': Overwrites local IndexedDB with remote version and marks op synced.
   * - 'merge': Merges local & remote, updates local IndexedDB, and queues an UPDATE op with higher version.
   */
  public async resolveConflict(
    conflict: ConflictItem,
    resolution: 'keep_local' | 'keep_remote' | 'merge',
    mergedData?: any
  ): Promise<void> {
    const allOps = await getOutboxOperations();
    const op = allOps.find((o) => o.opId === conflict.opId);

    if (resolution === 'keep_local') {
      if (op) {
        // Bump version above remote
        const remoteVer = conflict.remoteData?.version || 1;
        (op.payload as any).version = remoteVer + 1;
        (op.payload as any).updatedAt = new Date().toISOString();
        op.status = 'pending';
        op.retryCount = 0;
        op.errorMessage = undefined;
        await updateOutboxOperation(op);
      }
    } else if (resolution === 'keep_remote') {
      // Apply remote data to local DB
      if (conflict.entityType === 'student') {
        await saveStudentLocally(conflict.remoteData);
      } else {
        await saveAttendanceLocally(conflict.remoteData);
      }
      if (op) {
        op.status = 'synced';
        op.errorMessage = undefined;
        await updateOutboxOperation(op);
      }
    } else if (resolution === 'merge' && mergedData) {
      // Save merged to local DB
      if (conflict.entityType === 'student') {
        await saveStudentLocally(mergedData);
      } else {
        await saveAttendanceLocally(mergedData);
      }
      if (op) {
        op.payload = mergedData;
        op.status = 'pending';
        op.retryCount = 0;
        await updateOutboxOperation(op);
      }
    }

    await markConflictResolved(conflict.id, resolution, conflict);
    this.notifyListeners();
    await this.processQueue();
  }

  /**
   * Clear synced records from outbox to keep IndexedDB lean
   */
  public async clearCompletedOutbox(): Promise<number> {
    const count = await clearSyncedOutboxOperations();
    this.notifyListeners();
    return count;
  }
}

export const syncEngine = new SyncEngine();
