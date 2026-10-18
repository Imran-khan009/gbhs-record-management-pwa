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
  const [stats, setStats] = useState<SyncStats>(initialStats);

  useEffect(() => {
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

  return {
    ...stats,
    triggerSync,
    retryAll,
  };
}
