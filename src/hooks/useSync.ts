import { useEffect, useState } from 'react';
import { SyncStats } from '../types/sync';
import { syncEngine } from '../services/syncEngine';

const initialStats: SyncStats = {
  pendingCount: 0,
  syncingCount: 0,
  failedCount: 0,
  conflictedCount: 0,
  syncedCount: 0,
  lastSyncedAt: null,
  overallStatus: 'Synced',
  lastError: null,
};

export function useSync() {
  const [stats, setStats] = useState<SyncStats>(() => syncEngine.getCachedStats());

  useEffect(() => {
    syncEngine.getStats().then((fresh) => {
      setStats(fresh);
    });

    const unsubscribe = syncEngine.subscribe((newStats) => {
      setStats(newStats);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const triggerSync = async () => {
    await syncEngine.processQueue();
  };

  const retryAll = async () => {
    await syncEngine.retryAllFailed();
  };

  const uploadWorkspaceToCloud = async (ownerId?: string) => {
    return syncEngine.uploadActiveWorkspaceToCloud(ownerId);
  };

  const downloadWorkspaceFromCloud = async (ownerId?: string) => {
    return syncEngine.downloadActiveWorkspaceFromCloud(ownerId);
  };

  const resyncOperation = async (opId: string) => {
    return syncEngine.resyncOperation(opId);
  };

  const verifySyncedOperations = async () => {
    return syncEngine.verifyAndReconcileSyncedOperations();
  };

  return {
    ...stats,
    triggerSync,
    retryAll,
    uploadWorkspaceToCloud,
    downloadWorkspaceFromCloud,
    resyncOperation,
    verifySyncedOperations,
  };
}
