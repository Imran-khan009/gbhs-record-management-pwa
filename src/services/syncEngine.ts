import {
  getOutboxOperations,
  updateOutboxOperation,
  removeOutboxOperation,
  clearAllFailedOutboxOperations,
  saveConflict,
  getAllConflicts,
  getUnresolvedConflicts,
  markConflictResolved,
  clearAllConflicts,
  saveStudentLocally,
  saveAttendanceLocally,
  saveTeachingLogLocally,
  savePracticalProgressLocally,
  saveAbsenteeFollowupLocally,
  getPendingOutboxOperations,
  getAppState,
  setAppState,
  clearSyncedOutboxOperations,
  getStudentById,
  getAttendanceRecord,
  getAllStudents,
  getAllAttendanceRecords,
  getAllTeachingLogs,
  getAllPracticalProgress,
  getAllAbsenteeFollowups,
} from './db';
import { OutboxOperation, SyncStats, SyncOverallStatus, ConflictItem } from '../types/sync';
import {
  syncOperationToCloud,
  uploadWorkspaceSnapshotToSupabase,
  downloadWorkspaceSnapshotFromSupabase,
  WorkspaceUploadResult,
  WorkspaceDownloadResult,
  getSupabase,
} from './supabase';
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
  private watchdogTimer: any = null;
  private cachedStats: SyncStats = {
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    conflictedCount: 0,
    syncedCount: 0,
    lastSyncedAt: null,
    overallStatus: 'Synced',
    lastError: null,
  };

  private readonly BASE_BACKOFF_MS = 1000;
  private readonly MAX_BACKOFF_MS = 30000;
  private readonly MAX_AUTO_RETRIES = 5;

  constructor() {
    this.setupNetworkListeners();
    this.loadLastSyncTime();
    this.recoverOrphanedSyncingOps().then(() => this.notifyListeners());
  }

  public async recoverOrphanedSyncingOps(): Promise<number> {
    try {
      const allOps = await getOutboxOperations();
      const now = Date.now();
      let recovered = 0;
      for (const op of allOps) {
        if (op.status === 'syncing') {
          // If engine is not currently processing or op has been in 'syncing' for > 12s
          if (!this.isProcessing || (op.lastAttemptAt && now - op.lastAttemptAt > 12000)) {
            op.status = 'pending';
            await updateOutboxOperation(op);
            recovered++;
          }
        }
      }
      return recovered;
    } catch {
      return 0;
    }
  }

  private async loadLastSyncTime() {
    const savedTime = await getAppState<string>('last_synced_at');
    if (savedTime) {
      this.lastSyncedAt = savedTime;
    }
  }

  private startAutoSyncInterval() {
    if (this.autoSyncTimer) return;
    this.autoSyncTimer = setInterval(() => {
      if (this.isOnline && this.activeSession && !this.isProcessing) {
        this.processQueue();
      }
    }, 30000);
    if (this.autoSyncTimer && typeof (this.autoSyncTimer as any).unref === 'function') {
      (this.autoSyncTimer as any).unref();
    }
  }

  public stopAutoSyncInterval() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  public setSession(session: AuthSession | null) {
    this.activeSession = session;
    if (session) {
      this.startAutoSyncInterval();
      if (this.isOnline) {
        this.processQueue();
      }
    } else {
      this.stopAutoSyncInterval();
      this.lastSyncedAt = null;
      this.lastError = null;
      this.isProcessing = false;
      this.cachedStats = {
        pendingCount: 0,
        syncingCount: 0,
        failedCount: 0,
        conflictedCount: 0,
        syncedCount: 0,
        lastSyncedAt: null,
        overallStatus: 'Offline',
        lastError: null,
      };
    }
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

  public getCachedStats(): SyncStats {
    return { ...this.cachedStats };
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
    this.cachedStats = stats;
    for (const listener of this.listeners) {
      try {
        listener(stats);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    }
  }

  public async getStats(): Promise<SyncStats> {
    if (!this.activeSession) {
      const emptyStats: SyncStats = {
        pendingCount: 0,
        syncingCount: 0,
        failedCount: 0,
        conflictedCount: 0,
        syncedCount: 0,
        lastSyncedAt: this.lastSyncedAt,
        overallStatus: 'Offline',
        lastError: null,
      };
      this.cachedStats = emptyStats;
      return emptyStats;
    }

    let allOps: OutboxOperation[] = [];
    let unresolvedConflicts: ConflictItem[] = [];

    try {
      allOps = await getOutboxOperations();
      unresolvedConflicts = await getUnresolvedConflicts();
    } catch {
      const fallbackStats: SyncStats = {
        pendingCount: 0,
        syncingCount: 0,
        failedCount: 0,
        conflictedCount: 0,
        syncedCount: 0,
        lastSyncedAt: this.lastSyncedAt,
        overallStatus: 'Offline',
        lastError: null,
      };
      this.cachedStats = fallbackStats;
      return fallbackStats;
    }

    // Auto-heal stranded 'syncing' operations if the engine is not actively processing
    if (!this.isProcessing) {
      const strandedSyncing = allOps.filter((o) => o.status === 'syncing' && !o.isLegacy);
      if (strandedSyncing.length > 0) {
        for (const op of strandedSyncing) {
          op.status = 'pending';
          await updateOutboxOperation(op);
        }
        allOps = await getOutboxOperations();
      }
    }

    const pending = allOps.filter((o) => o.status === 'pending' && !o.isLegacy);
    const syncing = allOps.filter((o) => o.status === 'syncing' && !o.isLegacy);
    const failed = allOps.filter((o) => o.status === 'failed' && !o.isLegacy);
    const synced = allOps.filter((o) => o.status === 'synced' && !o.isLegacy);
    const conflicts = allOps.filter((o) => o.status === 'conflict' && !o.isLegacy);

    let overallStatus: SyncOverallStatus = 'Synced';

    if (!this.isOnline) {
      overallStatus = 'Offline';
    } else if (unresolvedConflicts.length > 0 || conflicts.length > 0) {
      overallStatus = 'Conflict needs review';
    } else if (this.activeSession && Date.now() > this.activeSession.expiresAt) {
      overallStatus = 'Authentication required';
    } else if (this.isProcessing || syncing.length > 0) {
      overallStatus = 'Syncing';
    } else if (failed.length > 0) {
      overallStatus = 'Sync failed';
    } else if (pending.length > 0) {
      overallStatus = 'Local changes pending';
    } else {
      overallStatus = 'Synced';
    }

    const stats: SyncStats = {
      pendingCount: pending.length,
      syncingCount: syncing.length,
      failedCount: failed.length,
      conflictedCount: unresolvedConflicts.length + conflicts.length,
      syncedCount: synced.length,
      lastSyncedAt: this.lastSyncedAt,
      overallStatus,
      lastError: this.lastError,
    };
    this.cachedStats = stats;
    return stats;
  }

  /**
   * Main Queue Processor:
   * - Preserves order for operations affecting the same record.
   * - Idempotent retries.
   * - Handles backoff and conflict isolation.
   * - Strictly excludes legacy outbox operations from replay.
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

    // Recover any orphaned syncing operations prior to queue execution
    await this.recoverOrphanedSyncingOps();

    this.isProcessing = true;
    this.notifyListeners();

    // 25-second safety watchdog to clear queue lock if network promise hangs
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(async () => {
      if (this.isProcessing) {
        console.warn('[SyncEngine Watchdog] Queue execution exceeded 25s. Force releasing sync lock.');
        this.isProcessing = false;
        await this.recoverOrphanedSyncingOps();
        this.lastError = 'Sync operation took too long and was safely recovered.';
        this.notifyListeners();
      }
    }, 25000);

    try {
      const allOps = await getOutboxOperations();
      const now = Date.now();

      // Filter eligible operations: strictly exclude legacy archived outbox operations
      const eligible = allOps.filter((op) => {
        if (op.status === 'synced' || op.status === 'conflict' || op.status === 'legacy_archived' || op.isLegacy) return false;
        if (op.status === 'pending' || op.status === 'syncing') return true;
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

          try {
            // Mark syncing
            op.status = 'syncing';
            op.lastAttemptAt = Date.now();
            await updateOutboxOperation(op);
            this.notifyListeners();

            const ownerId = this.activeSession?.user.workspaceOwnerId || this.activeSession?.user.id;
            const callerRole = this.activeSession?.user.workspaceRole;
            const result = await syncOperationToCloud(op, this.activeSession?.token, ownerId, callerRole);

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
          } catch (opErr: any) {
            // Defensive recovery: NEVER leave op in 'syncing' state on error
            op.status = 'failed';
            op.errorMessage = opErr.message || 'Sync operation failed unexpectedly';
            op.errorType = 'network';
            op.nextRetryAt = Date.now() + 5000;
            await updateOutboxOperation(op);
            break;
          }
        }
      }

      // Check remaining
      const stats = await this.getStats();
      if (stats.pendingCount === 0 && stats.failedCount === 0 && stats.conflictedCount === 0) {
        this.lastSyncedAt = new Date().toISOString();
        await setAppState('last_synced_at', this.lastSyncedAt);
        this.lastError = null;
      }
    } catch (e: any) {
      this.lastError = e.message || 'Sync failed unexpectedly';
    } finally {
      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = null;
      }
      this.isProcessing = false;
      this.notifyListeners();
    }
  }

  /**
   * Manual retry of all failed operations (bypasses backoff timer)
   */
  public async retryAllFailed(): Promise<void> {
    await this.recoverOrphanedSyncingOps();
    const allOps = await getOutboxOperations();
    for (const op of allOps) {
      if (op.status === 'failed' || op.status === 'syncing') {
        op.status = 'pending';
        op.nextRetryAt = undefined;
        await updateOutboxOperation(op);
      }
    }
    await this.processQueue();
  }

  public async retryFailedOperations(): Promise<void> {
    await this.retryAllFailed();
  }

  /**
   * Retry single specific operation (works for failed, syncing, or pending operations)
   */
  public async retryOperation(opId: string): Promise<void> {
    const allOps = await getOutboxOperations();
    const op = allOps.find((o) => o.opId === opId);
    if (op) {
      op.status = 'pending';
      op.nextRetryAt = undefined;
      op.retryCount = 0;
      op.errorMessage = undefined;
      op.errorType = undefined;
      await updateOutboxOperation(op);
      this.notifyListeners();
      await this.processQueue();
    }
  }

  /**
   * Safely re-sync a specific operation (works for failed, syncing, or falsely synced operations).
   * Does NOT duplicate, re-enroll, or delete any local data.
   */
  public async resyncOperation(opId: string): Promise<{ success: boolean; message: string }> {
    const allOps = await getOutboxOperations();
    const op = allOps.find((o) => o.opId === opId);
    if (!op) {
      return { success: false, message: `Operation "${opId}" not found in outbox.` };
    }

    op.status = 'pending';
    op.nextRetryAt = undefined;
    op.retryCount = 0;
    op.errorMessage = undefined;
    op.errorType = undefined;
    await updateOutboxOperation(op);
    this.notifyListeners();
    await this.processQueue();
    return { success: true, message: `Operation "${opId}" requeued and processed.` };
  }

  /**
   * Verify all outbox operations currently marked 'synced' against Supabase.
   * If any operation was prematurely marked 'synced' but the row does not actually exist
   * in Supabase under the workspace's owner_id, it safely resets the operation status to 'pending'
   * and triggers processQueue().
   * Does NOT duplicate, re-enroll, or delete any local records.
   */
  public async verifyAndReconcileSyncedOperations(): Promise<{
    checkedCount: number;
    unconfirmedCount: number;
    requeuedCount: number;
    details: Array<{ opId: string; entityId: string; entityType: string; reason: string }>;
  }> {
    const ownerId = this.activeSession?.user.workspaceOwnerId || this.activeSession?.user.id;
    if (!ownerId) {
      throw new Error('Authentication required before verifying cloud records.');
    }

    const allOps = await getOutboxOperations();
    const syncedOps = allOps.filter((o) => o.status === 'synced' && !o.isLegacy);

    const result = {
      checkedCount: syncedOps.length,
      unconfirmedCount: 0,
      requeuedCount: 0,
      details: [] as Array<{ opId: string; entityId: string; entityType: string; reason: string }>,
    };

    if (syncedOps.length === 0) {
      return result;
    }

    const client = getSupabase();
    if (!client || !this.isOnline) {
      return result;
    }

    const tableMap: Record<string, string> = {
      student: 'students',
      attendance: 'attendance',
      teaching_log: 'teaching_logs',
      practical_progress: 'practical_progress',
      absentee_followup: 'absentee_followups',
    };

    const opsToRequeue: OutboxOperation[] = [];

    for (const op of syncedOps) {
      if (op.operationType === 'DELETE') continue;

      const tableName = tableMap[op.entityType];
      if (!tableName) continue;

      try {
        const validId = op.entityId;
        const { data, error }: { data: any; error: any } = await client
          .from(tableName)
          .select('id, owner_id')
          .eq('id', validId)
          .eq('owner_id', ownerId)
          .maybeSingle();

        if (error) {
          continue;
        }

        if (!data || data.owner_id !== ownerId) {
          result.unconfirmedCount++;
          result.details.push({
            opId: op.opId,
            entityId: op.entityId,
            entityType: op.entityType,
            reason: `Record "${op.entityId}" is marked 'synced' locally but missing in Supabase under owner "${ownerId}".`,
          });

          op.status = 'pending';
          op.retryCount = 0;
          op.nextRetryAt = undefined;
          op.errorMessage = 'Requeued by cloud verification: Row was missing from Supabase.';
          op.errorType = undefined;
          await updateOutboxOperation(op);
          opsToRequeue.push(op);
        }
      } catch (err: any) {
        console.warn(`[SyncEngine] Verification error for op ${op.opId}:`, err);
      }
    }

    result.requeuedCount = opsToRequeue.length;

    if (opsToRequeue.length > 0) {
      this.notifyListeners();
      await this.processQueue();
    }

    return result;
  }


  /**
   * Resolve conflict:
   * - 'keep_local': Re-queues local op with bumped version so it overwrites remote.
   * - 'keep_remote': Overwrites local IndexedDB with remote version and marks op synced.
   * - 'merge': Merges local & remote, updates local IndexedDB, and queues an UPDATE op with higher version.
   */
  public async resolveConflict(
    conflict: ConflictItem,
    resolution: 'keep_local' | 'keep_remote' | 'merge' | 'discard' | 'ignore',
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
      } else if (conflict.entityType === 'attendance') {
        await saveAttendanceLocally(conflict.remoteData);
      } else if (conflict.entityType === 'teaching_log') {
        await saveTeachingLogLocally(conflict.remoteData);
      } else if (conflict.entityType === 'practical_progress') {
        await savePracticalProgressLocally(conflict.remoteData);
      } else if (conflict.entityType === 'absentee_followup') {
        await saveAbsenteeFollowupLocally(conflict.remoteData);
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
      } else if (conflict.entityType === 'attendance') {
        await saveAttendanceLocally(mergedData);
      } else if (conflict.entityType === 'teaching_log') {
        await saveTeachingLogLocally(mergedData);
      } else if (conflict.entityType === 'practical_progress') {
        await savePracticalProgressLocally(mergedData);
      } else if (conflict.entityType === 'absentee_followup') {
        await saveAbsenteeFollowupLocally(mergedData);
      }
      if (op) {
        op.payload = mergedData;
        op.status = 'pending';
        op.retryCount = 0;
        await updateOutboxOperation(op);
      }
    } else if (resolution === 'discard' || (resolution as any) === 'ignore') {
      // Discard this operation from outbox queue
      if (op) {
        await removeOutboxOperation(op.opId);
      }
    }

    await markConflictResolved(conflict.id, resolution, conflict);
    this.notifyListeners();
    await this.processQueue();
  }

  /**
   * Discard (trash) a single failed or stuck outbox operation.
   */
  public async discardOperation(opId: string): Promise<void> {
    await removeOutboxOperation(opId);
    const allConflicts = await getAllConflicts();
    const related = allConflicts.find((c) => c.opId === opId);
    if (related) {
      await markConflictResolved(related.id, 'discard', related);
    }
    this.notifyListeners();
  }

  /**
   * Ignore / Mark an operation as safely synced so it stops failing or retrying.
   */
  public async ignoreOperation(opId: string): Promise<void> {
    const allOps = await getOutboxOperations();
    const op = allOps.find((o) => o.opId === opId);
    if (op) {
      op.status = 'synced';
      op.errorMessage = undefined;
      op.errorType = undefined;
      await updateOutboxOperation(op);
    }
    const allConflicts = await getAllConflicts();
    const related = allConflicts.find((c) => c.opId === opId);
    if (related) {
      await markConflictResolved(related.id, 'ignore', related);
    }
    this.notifyListeners();
  }

  /**
   * Discard (trash) all failed or conflicted outbox operations at once.
   */
  public async discardAllFailed(): Promise<number> {
    const cleared = await clearAllFailedOutboxOperations();
    const unresolved = await getUnresolvedConflicts();
    for (const c of unresolved) {
      await markConflictResolved(c.id, 'discard', c);
    }
    this.lastError = null;
    this.notifyListeners();
    return cleared;
  }

  /**
   * Automatically resolve and clean up duplicate key / foreign key errors:
   * Replaces, ignores or cleans stuck duplicate operations so queue becomes completely healthy.
   */
  public async autoResolveDuplicates(): Promise<{ resolved: number }> {
    const allOps = await getOutboxOperations();
    let resolvedCount = 0;

    for (const op of allOps) {
      const errMsg = (op.errorMessage || '').toLowerCase();
      const isDuplicateOrFk =
        errMsg.includes('unique') ||
        errMsg.includes('duplicate') ||
        errMsg.includes('foreign key') ||
        errMsg.includes('violates');

      if (isDuplicateOrFk || (op.status === 'failed' && op.retryCount >= 4)) {
        await removeOutboxOperation(op.opId);
        resolvedCount++;
      }
    }

    const unresolved = await getUnresolvedConflicts();
    for (const c of unresolved) {
      await markConflictResolved(c.id, 'keep_local', c);
      resolvedCount++;
    }

    this.lastError = null;
    this.notifyListeners();
    await this.processQueue();
    return { resolved: resolvedCount };
  }

  /**
   * Batch resolve all open conflicts with a single resolution strategy.
   */
  public async resolveAllConflicts(resolution: 'keep_local' | 'keep_remote' | 'discard'): Promise<number> {
    const unresolved = await getUnresolvedConflicts();
    for (const c of unresolved) {
      await this.resolveConflict(c, resolution as any);
    }
    return unresolved.length;
  }

  /**
   * Clear synced records from outbox to keep IndexedDB lean
   */
  public async clearCompletedOutbox(): Promise<number> {
    const count = await clearSyncedOutboxOperations();
    this.notifyListeners();
    return count;
  }

  /**
   * Upload all current records in the active owner workspace to Supabase.
   * Uses an idempotent upsert strategy with conflict detection and post-upload verification.
   * Legacy outbox operations (1,012 ops) are strictly excluded from cloud upload.
   */
  public async uploadActiveWorkspaceToCloud(targetOwnerId?: string): Promise<WorkspaceUploadResult> {
    const ownerId = targetOwnerId || this.activeSession?.user.workspaceOwnerId || this.activeSession?.user.id;
    if (!ownerId) {
      return {
        success: false,
        preUploadCounts: { students: 0, attendance: 0, teaching_logs: 0, practical_progress: 0, absentee_followups: 0 },
        error: 'Authenticated owner ID is required before syncing workspace to cloud.',
      };
    }

    const supabase = getSupabase();
    this.isProcessing = true;
    this.notifyListeners();

    try {
      const [students, attendance, teachingLogs, practicalProgress, absenteeFollowups] = await Promise.all([
        getAllStudents(),
        getAllAttendanceRecords(),
        getAllTeachingLogs(),
        getAllPracticalProgress(),
        getAllAbsenteeFollowups(),
      ]);

      const result = await uploadWorkspaceSnapshotToSupabase(
        supabase,
        ownerId,
        {
          students,
          attendance,
          teachingLogs,
          practicalProgress,
          absenteeFollowups,
        },
        this.activeSession?.user.id,
        this.activeSession?.user.workspaceRole
      );

      if (result.success) {
        this.lastSyncedAt = new Date().toISOString();
        await setAppState('last_synced_at', this.lastSyncedAt);
        this.lastError = null;
      } else {
        this.lastError = result.error || 'Cloud sync failed.';
      }

      return result;
    } catch (err: any) {
      this.lastError = err.message || 'Unexpected cloud sync error';
      return {
        success: false,
        preUploadCounts: { students: 0, attendance: 0, teaching_logs: 0, practical_progress: 0, absentee_followups: 0 },
        error: this.lastError || undefined,
      };
    } finally {
      this.isProcessing = false;
      this.notifyListeners();
    }
  }

  /**
   * Download authorized cloud changes for the active owner workspace.
   * Safely reconciles against local IndexedDB records:
   * - Preserves pending local outbox operations from being overwritten.
   * - Flags conflicts if remote record has a higher version than an unsynced local edit.
   * - Inserts or updates records when remote is newer and no pending edits exist.
   */
  public async downloadActiveWorkspaceFromCloud(targetOwnerId?: string): Promise<WorkspaceDownloadResult> {
    const ownerId = targetOwnerId || this.activeSession?.user.workspaceOwnerId || this.activeSession?.user.id;
    if (!ownerId) {
      return {
        success: false,
        downloadedCounts: { students: 0, attendance: 0, teaching_logs: 0, practical_progress: 0, absentee_followups: 0 },
        conflictsCount: 0,
        error: 'Authenticated owner ID is required before downloading workspace from cloud.',
      };
    }

    const supabase = getSupabase();
    this.isProcessing = true;
    this.notifyListeners();

    try {
      const res = await downloadWorkspaceSnapshotFromSupabase(
        supabase,
        ownerId,
        this.activeSession?.user.id,
        this.activeSession?.user.email
      );
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to download cloud snapshot.');
      }

      const { students, attendance, teachingLogs, practicalProgress, absenteeFollowups } = res.data;

      // Map pending operations to safeguard unsynced local edits
      const pendingOps = await getPendingOutboxOperations();
      const pendingMap = new Map<string, OutboxOperation>();
      for (const op of pendingOps) {
        pendingMap.set(op.entityId, op);
      }

      let conflictsCount = 0;
      let downloadedStudents = 0;
      let downloadedAttendance = 0;
      let downloadedTeachingLogs = 0;
      let downloadedPracticalProgress = 0;
      let downloadedAbsenteeFollowups = 0;

      // 1. Students
      for (const s of students) {
        const local = await getStudentById(s.id);
        const pendingOp = pendingMap.get(s.id);
        if (pendingOp) {
          if (s.version > (local?.version || 1)) {
            conflictsCount++;
            await saveConflict({
              id: `conflict_dl_${s.id}_${Date.now()}`,
              opId: pendingOp.opId,
              entityId: s.id,
              entityType: 'student',
              localData: local || pendingOp.payload,
              remoteData: s,
              detectedAt: Date.now(),
              resolved: false,
            });
          }
        } else {
          if (!local || s.version >= (local.version || 1)) {
            await saveStudentLocally(s);
            downloadedStudents++;
          }
        }
      }

      // 2. Attendance
      for (const a of attendance) {
        const local = await getAttendanceRecord(a.id);
        const pendingOp = pendingMap.get(a.id);
        if (pendingOp) {
          if (a.version > (local?.version || 1)) {
            conflictsCount++;
            await saveConflict({
              id: `conflict_dl_${a.id}_${Date.now()}`,
              opId: pendingOp.opId,
              entityId: a.id,
              entityType: 'attendance',
              localData: local || pendingOp.payload,
              remoteData: a,
              detectedAt: Date.now(),
              resolved: false,
            });
          }
        } else {
          if (!local || a.version >= (local.version || 1)) {
            await saveAttendanceLocally(a);
            downloadedAttendance++;
          }
        }
      }

      // 3. Teaching Logs
      const localTeachingLogs = await getAllTeachingLogs();
      const localTeachingMap = new Map(localTeachingLogs.map((l) => [l.id, l]));
      for (const t of teachingLogs) {
        const local = localTeachingMap.get(t.id);
        const pendingOp = pendingMap.get(t.id);
        if (pendingOp) {
          if (t.version > (local?.version || 1)) {
            conflictsCount++;
            await saveConflict({
              id: `conflict_dl_${t.id}_${Date.now()}`,
              opId: pendingOp.opId,
              entityId: t.id,
              entityType: 'teaching_log',
              localData: local || pendingOp.payload,
              remoteData: t,
              detectedAt: Date.now(),
              resolved: false,
            });
          }
        } else {
          if (!local || t.version >= (local.version || 1)) {
            await saveTeachingLogLocally(t);
            downloadedTeachingLogs++;
          }
        }
      }

      // 4. Practical Progress
      const localPractical = await getAllPracticalProgress();
      const localPracticalMap = new Map(localPractical.map((p) => [p.id, p]));
      for (const p of practicalProgress) {
        const local = localPracticalMap.get(p.id);
        const pendingOp = pendingMap.get(p.id);
        if (pendingOp) {
          if (p.version > (local?.version || 1)) {
            conflictsCount++;
            await saveConflict({
              id: `conflict_dl_${p.id}_${Date.now()}`,
              opId: pendingOp.opId,
              entityId: p.id,
              entityType: 'practical_progress',
              localData: local || pendingOp.payload,
              remoteData: p,
              detectedAt: Date.now(),
              resolved: false,
            });
          }
        } else {
          if (!local || p.version >= (local.version || 1)) {
            await savePracticalProgressLocally(p);
            downloadedPracticalProgress++;
          }
        }
      }

      // 5. Absentee Followups
      const localFollowups = await getAllAbsenteeFollowups();
      const localFollowupMap = new Map(localFollowups.map((f) => [f.id, f]));
      for (const f of absenteeFollowups) {
        const local = localFollowupMap.get(f.id);
        const pendingOp = pendingMap.get(f.id);
        if (pendingOp) {
          if (f.version > (local?.version || 1)) {
            conflictsCount++;
            await saveConflict({
              id: `conflict_dl_${f.id}_${Date.now()}`,
              opId: pendingOp.opId,
              entityId: f.id,
              entityType: 'absentee_followup',
              localData: local || pendingOp.payload,
              remoteData: f,
              detectedAt: Date.now(),
              resolved: false,
            });
          }
        } else {
          if (!local || f.version >= (local.version || 1)) {
            await saveAbsenteeFollowupLocally(f);
            downloadedAbsenteeFollowups++;
          }
        }
      }

      this.lastSyncedAt = new Date().toISOString();
      await setAppState('last_synced_at', this.lastSyncedAt);
      this.lastError = null;

      return {
        success: true,
        downloadedCounts: {
          students: downloadedStudents,
          attendance: downloadedAttendance,
          teaching_logs: downloadedTeachingLogs,
          practical_progress: downloadedPracticalProgress,
          absentee_followups: downloadedAbsenteeFollowups,
        },
        conflictsCount,
      };
    } catch (err: any) {
      this.lastError = err.message || 'Failed to download workspace from cloud.';
      return {
        success: false,
        downloadedCounts: { students: 0, attendance: 0, teaching_logs: 0, practical_progress: 0, absentee_followups: 0 },
        conflictsCount: 0,
        error: this.lastError || undefined,
      };
    } finally {
      this.isProcessing = false;
      this.notifyListeners();
    }
  }
}

export const syncEngine = new SyncEngine();
