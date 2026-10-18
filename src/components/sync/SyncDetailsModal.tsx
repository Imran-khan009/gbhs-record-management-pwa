import React, { useState, useEffect } from 'react';
import { useSync } from '../../hooks/useSync';
import { useAuth } from '../../context/AuthContext';
import { OutboxOperation, ConflictItem } from '../../types/sync';
import { getOutboxOperations, getAllConflicts } from '../../services/db';
import { syncEngine } from '../../services/syncEngine';
import { ConflictResolverModal } from './ConflictResolverModal';
import {
  X,
  RefreshCw,
  CloudUpload,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCw,
  Trash2,
  CloudOff,
  Lock,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface SyncDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncDetailsModal: React.FC<SyncDetailsModalProps> = ({ isOpen, onClose }) => {
  const { session } = useAuth();
  const {
    overallStatus,
    pendingCount,
    failedCount,
    conflictedCount,
    syncedCount,
    lastSyncedAt,
    lastError,
    triggerSync,
    retryAll,
  } = useSync();

  const [activeTab, setActiveTab] = useState<'outbox' | 'failed' | 'conflicts' | 'history'>('outbox');
  const [operations, setOperations] = useState<OutboxOperation[]>([]);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [activeConflict, setActiveConflict] = useState<ConflictItem | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);

  const reloadData = async () => {
    try {
      const ops = await getOutboxOperations();
      setOperations(ops);

      const confs = await getAllConflicts();
      setConflicts(confs);
    } catch (e) {
      console.error('Failed to load sync details:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      reloadData();
    }
  }, [isOpen, pendingCount, failedCount, conflictedCount]);

  if (!isOpen) return null;

  const pendingOps = operations.filter((o) => o.status === 'pending' || o.status === 'syncing');
  const failedOps = operations.filter((o) => o.status === 'failed');
  const syncedOps = operations.filter((o) => o.status === 'synced');
  const unresolvedConflicts = conflicts.filter((c) => !c.resolved);

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      await syncEngine.clearCompletedOutbox();
      await reloadData();
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <CloudUpload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Synchronization & Outbox Center</h3>
              <p className="text-xs text-slate-400">
                Resilient local IndexedDB outbox queue with idempotent sync and backoff retries.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => triggerSync()}
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync Now</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Ribbon */}
        <div className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-medium">Status:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                overallStatus === 'Synced'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : overallStatus === 'Offline'
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : overallStatus === 'Conflict needs review'
                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                  : overallStatus === 'Authentication required'
                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                  : overallStatus === 'Sync failed'
                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                  : 'bg-sky-950 text-sky-400 border border-sky-800'
              }`}
            >
              {overallStatus}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">
              Last Sync:{' '}
              <strong className="text-slate-200">
                {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Never'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-slate-400">
              Pending: <strong className="text-amber-400">{pendingCount}</strong>
            </span>
            <span className="text-slate-400">
              Failed: <strong className="text-rose-400">{failedCount}</strong>
            </span>
            <span className="text-slate-400">
              Conflicts: <strong className="text-amber-400">{conflictedCount}</strong>
            </span>
          </div>
        </div>

        {/* Error message banner if any */}
        {lastError && (
          <div className="px-6 py-2.5 bg-rose-950/40 border-b border-rose-800/60 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{lastError}</span>
            </div>
            {failedOps.length > 0 && (
              <button
                onClick={() => retryAll()}
                className="text-xs underline font-semibold text-rose-200 hover:text-white cursor-pointer"
              >
                Retry All Failed
              </button>
            )}
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-800 bg-slate-900">
          <button
            onClick={() => setActiveTab('outbox')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'outbox'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Queued Operations ({pendingOps.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('failed')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'failed'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Failed / Retrying ({failedOps.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('conflicts')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'conflicts'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Conflicts ({unresolvedConflicts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Synced History ({syncedOps.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {/* QUEUED TAB */}
          {activeTab === 'outbox' && (
            <div>
              {pendingOps.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Outbox queue is empty. All local changes are synced.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingOps.map((op) => (
                    <div
                      key={op.opId}
                      className="bg-slate-850 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            op.operationType === 'CREATE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : op.operationType === 'UPDATE'
                              ? 'bg-sky-950 text-sky-400 border border-sky-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {op.operationType}
                        </span>
                        <div>
                          <p className="font-semibold text-white">
                            {op.entityType.toUpperCase()}: {(op.payload as any)?.name || (op.payload as any)?.studentName || op.entityId}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">
                            OpID: {op.opId.substring(0, 8)}... • EntityID: {op.entityId.substring(0, 12)}...
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-sky-400 font-mono">
                          {op.status === 'syncing' ? 'Syncing...' : 'Pending in Outbox'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(op.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FAILED TAB */}
          {activeTab === 'failed' && (
            <div>
              {failedOps.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Zero failed operations.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => retryAll()}
                      className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Retry All Now</span>
                    </button>
                  </div>

                  {failedOps.map((op) => (
                    <div
                      key={op.opId}
                      className="bg-slate-850 border border-rose-900/50 rounded-xl p-3.5 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-rose-400 uppercase text-[10px] px-1.5 py-0.5 rounded bg-rose-950 border border-rose-800">
                            {op.operationType} {op.entityType}
                          </span>
                          <span className="font-semibold text-white">
                            {(op.payload as any)?.name || (op.payload as any)?.studentName || op.entityId}
                          </span>
                        </div>
                        <button
                          onClick={() => syncEngine.retryOperation(op.opId)}
                          className="text-xs text-sky-400 hover:text-sky-300 font-semibold underline cursor-pointer"
                        >
                          Retry Single
                        </button>
                      </div>

                      <div className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-mono">
                        {op.errorMessage || 'Unknown synchronization error'}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                        <span>Retries Attempted: {op.retryCount}</span>
                        {op.nextRetryAt && (
                          <span>
                            Next Auto-Retry:{' '}
                            {Math.max(0, Math.round((op.nextRetryAt - Date.now()) / 1000))}s
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CONFLICTS TAB */}
          {activeTab === 'conflicts' && (
            <div>
              {unresolvedConflicts.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Zero unresolved data conflicts.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unresolvedConflicts.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-850 border border-amber-800/60 rounded-xl p-4 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <h4 className="font-bold text-white capitalize">
                            {c.entityType} Version Divergence
                          </h4>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">
                          Local: <strong>{c.localData?.name || c.localData?.studentName}</strong> (v{c.localData?.version})
                          {' vs '}
                          Cloud: <strong>{c.remoteData?.name || c.remoteData?.studentName}</strong> (v{c.remoteData?.version})
                        </p>
                      </div>

                      <button
                        onClick={() => setActiveConflict(c)}
                        className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        <span>Review & Resolve</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SYNCED HISTORY TAB */}
          {activeTab === 'history' && (
            <div>
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="text-slate-400">Successfully synced operations: {syncedOps.length}</span>
                {syncedOps.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    disabled={clearingHistory}
                    className="flex items-center gap-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Synced Records</span>
                  </button>
                )}
              </div>

              {syncedOps.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">No synced history records.</p>
              ) : (
                <div className="space-y-1.5">
                  {syncedOps.slice(-20).reverse().map((op) => (
                    <div
                      key={op.opId}
                      className="bg-slate-850/60 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-slate-400"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-medium text-slate-200">
                          {op.operationType} {op.entityType}: {(op.payload as any)?.name || (op.payload as any)?.studentName || op.entityId}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">
                        {new Date(op.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-850 shrink-0 flex items-center justify-between text-xs">
          <p className="text-slate-400">
            Outbox operations are processed strictly in chronological order with stable UUIDs.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Conflict Diff Resolver Modal */}
      <ConflictResolverModal
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onResolved={reloadData}
      />
    </div>
  );
};
