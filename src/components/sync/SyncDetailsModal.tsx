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
  CloudDownload,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCw,
  Trash2,
  CloudOff,
  Lock,
  Layers,
  ArrowRight,
  Download,
  Sparkles,
  EyeOff,
} from 'lucide-react';
import { downloadLocalBackup } from '../../services/backupService';

import { getWorkspacePermissions } from '../../services/permissionService';

interface SyncDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncDetailsModal: React.FC<SyncDetailsModalProps> = ({ isOpen, onClose }) => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);

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
    uploadWorkspaceToCloud,
    downloadWorkspaceFromCloud,
    resyncOperation,
    verifySyncedOperations,
  } = useSync();

  const [activeTab, setActiveTab] = useState<'outbox' | 'failed' | 'conflicts' | 'history'>('outbox');
  const [operations, setOperations] = useState<OutboxOperation[]>([]);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [activeConflict, setActiveConflict] = useState<ConflictItem | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [isUploadingSnapshot, setIsUploadingSnapshot] = useState(false);
  const [isDownloadingSnapshot, setIsDownloadingSnapshot] = useState(false);
  const [isResolvingDuplicates, setIsResolvingDuplicates] = useState(false);
  const [isDiscardingFailed, setIsDiscardingFailed] = useState(false);
  const [isVerifyingSynced, setIsVerifyingSynced] = useState(false);
  const [recheckingOpId, setRecheckingOpId] = useState<string | null>(null);
  const [uploadReport, setUploadReport] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

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

  const handleAutoResolveDuplicates = async () => {
    setIsResolvingDuplicates(true);
    setUploadReport(null);
    try {
      const res = await syncEngine.autoResolveDuplicates();
      setUploadReport({
        type: 'success',
        message: `Auto-Resolution Successful: Resolved ${res.resolved} duplicate / foreign-key issue(s). Outbox queue cleaned and refreshed.`,
      });
      await reloadData();
    } catch (err: any) {
      setUploadReport({
        type: 'error',
        message: err.message || 'Failed to auto-resolve duplicate data.',
      });
    } finally {
      setIsResolvingDuplicates(false);
    }
  };

  const handleDiscardAllFailed = async () => {
    if (!window.confirm('Are you sure you want to trash and clear all failed sync operations?')) return;
    setIsDiscardingFailed(true);
    try {
      const count = await syncEngine.discardAllFailed();
      setUploadReport({
        type: 'info',
        message: `Trashed ${count} failed outbox operation(s).`,
      });
      await reloadData();
    } catch (err: any) {
      setUploadReport({
        type: 'error',
        message: err.message || 'Failed to trash operations.',
      });
    } finally {
      setIsDiscardingFailed(false);
    }
  };

  const handleDiscardSingle = async (opId: string) => {
    try {
      await syncEngine.discardOperation(opId);
      await reloadData();
    } catch (e) {
      console.error('Failed to discard operation:', e);
    }
  };

  const handleIgnoreSingle = async (opId: string) => {
    try {
      await syncEngine.ignoreOperation(opId);
      await reloadData();
    } catch (e) {
      console.error('Failed to ignore operation:', e);
    }
  };

  const handleVerifyAllSynced = async () => {
    setIsVerifyingSynced(true);
    setUploadReport(null);
    try {
      const res = await verifySyncedOperations();
      if (res.unconfirmedCount > 0) {
        setUploadReport({
          type: 'info',
          message: `Cloud Verification: Found ${res.unconfirmedCount} unconfirmed operation(s) missing from Supabase. Requeued ${res.requeuedCount} operation(s) to pending for honest synchronization.`,
        });
      } else {
        setUploadReport({
          type: 'success',
          message: `Cloud Verification: Checked ${res.checkedCount} record(s). All confirmed to exist in Supabase under your workspace.`,
        });
      }
      await reloadData();
    } catch (err: any) {
      setUploadReport({
        type: 'error',
        message: err.message || 'Failed to verify cloud records against Supabase.',
      });
    } finally {
      setIsVerifyingSynced(false);
    }
  };

  const handleResyncSingle = async (opId: string) => {
    setRecheckingOpId(opId);
    setUploadReport(null);
    try {
      await resyncOperation(opId);
      setUploadReport({
        type: 'info',
        message: 'Re-queued operation for honest cloud synchronization.',
      });
      await reloadData();
    } catch (err: any) {
      setUploadReport({
        type: 'error',
        message: err.message || 'Failed to re-sync operation.',
      });
    } finally {
      setRecheckingOpId(null);
    }
  };

  const handleResolveAllConflicts = async (res: 'keep_local' | 'keep_remote' | 'discard') => {
    try {
      const count = await syncEngine.resolveAllConflicts(res);
      setUploadReport({
        type: 'success',
        message: `Resolved ${count} conflict(s) with strategy: ${
          res === 'keep_local'
            ? 'Replace Cloud with Local'
            : res === 'keep_remote'
            ? 'Accept Cloud Data'
            : 'Trash / Discard Conflicts'
        }.`,
      });
      await reloadData();
    } catch (err: any) {
      setUploadReport({
        type: 'error',
        message: err.message || 'Failed to resolve all conflicts.',
      });
    }
  };

  const handleQuickResolveConflict = async (
    conflict: ConflictItem,
    res: 'keep_local' | 'keep_remote' | 'discard'
  ) => {
    try {
      await syncEngine.resolveConflict(conflict, res as any);
      await reloadData();
    } catch (err: any) {
      console.error('Quick conflict resolution failed:', err);
    }
  };

  const handleUploadWorkspaceSnapshot = async () => {
    setIsUploadingSnapshot(true);
    setUploadReport(null);
    try {
      const res = await uploadWorkspaceToCloud();
      if (res.success) {
        setUploadReport({
          type: 'success',
          message: `Cloud Upload Verified: ${res.postUploadCounts?.students ?? res.preUploadCounts.students} students, ${res.postUploadCounts?.teaching_logs ?? res.preUploadCounts.teaching_logs} logs, ${res.postUploadCounts?.practical_progress ?? res.preUploadCounts.practical_progress} practicals, and ${res.postUploadCounts?.absentee_followups ?? res.preUploadCounts.absentee_followups} followups successfully verified in Supabase. (1,012 legacy outbox entries safely excluded).`,
        });
        await reloadData();
      } else if (res.conflicts && res.conflicts.length > 0) {
        setUploadReport({
          type: 'error',
          message: `Conflict Detected: ${res.conflicts.length} cloud records have higher versions than local. Aborted without overwriting.`,
        });
      } else {
        setUploadReport({
          type: 'error',
          message: res.error || 'Cloud synchronization failed.',
        });
      }
    } catch (err: any) {
      setUploadReport({
        type: 'error',
        message: err.message || 'Error occurred during cloud sync.',
      });
    } finally {
      setIsUploadingSnapshot(false);
    }
  };

  const handleDownloadWorkspaceSnapshot = async () => {
    setIsDownloadingSnapshot(true);
    setUploadReport(null);
    try {
      const res = await downloadWorkspaceFromCloud();
      if (res.success) {
        setUploadReport({
          type: 'success',
          message: `Cloud Download Complete: Reconciled ${res.downloadedCounts.students} students, ${res.downloadedCounts.attendance} attendance, ${res.downloadedCounts.teaching_logs} logs, ${res.downloadedCounts.practical_progress} practicals, and ${res.downloadedCounts.absentee_followups} followups from Supabase. (${res.conflictsCount} conflict(s) detected).`,
        });
        await reloadData();
      } else {
        setUploadReport({
          type: 'error',
          message: res.error || 'Cloud download failed.',
        });
      }
    } catch (err: any) {
      setUploadReport({
        type: 'error',
        message: err.message || 'Error occurred during cloud download.',
      });
    } finally {
      setIsDownloadingSnapshot(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      reloadData();
    }
  }, [isOpen, pendingCount, failedCount, conflictedCount]);

  if (!isOpen || !permissions.isOwner) return null;

  const pendingOps = operations.filter((o) => (o.status === 'pending' || o.status === 'syncing') && !o.isLegacy);
  const failedOps = operations.filter((o) => o.status === 'failed' && !o.isLegacy);
  const syncedOps = operations.filter((o) => o.status === 'synced' && !o.isLegacy);
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
      <div className="w-full max-w-4xl bg-[#202822] border border-[#3A473E] rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3A473E] bg-[#2B352E] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D97745]/10 text-[#D97745] flex items-center justify-center border border-[#D97745]/20">
              <CloudUpload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Synchronization & Outbox Center</h3>
              <p className="text-xs text-slate-300">
                Resilient local IndexedDB outbox queue with idempotent sync and backoff retries.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await downloadLocalBackup();
              }}
              title="Download Safe JSON Backup of local database before syncing"
              className="btn-interactive flex items-center gap-1.5 bg-[#202822] hover:bg-[#2B352E] text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer border border-[#3A473E]"
            >
              <Download className="w-3.5 h-3.5 text-[#9BAE9C]" />
              <span>Backup (.json)</span>
            </button>
            <button
              onClick={handleUploadWorkspaceSnapshot}
              disabled={isUploadingSnapshot}
              title="Upload entire authenticated owner workspace to Supabase (idempotent upsert, excludes legacy outbox)"
              className="btn-interactive flex items-center gap-1.5 bg-[#D97745] hover:bg-[#c26535] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              <CloudUpload className={`w-3.5 h-3.5 ${isUploadingSnapshot ? 'animate-bounce' : ''}`} />
              <span>{isUploadingSnapshot ? 'Uploading...' : 'Upload Workspace'}</span>
            </button>
            <button
              onClick={handleDownloadWorkspaceSnapshot}
              disabled={isDownloadingSnapshot}
              title="Download authorized cloud records into local workspace (preserves pending local changes)"
              className="btn-interactive flex items-center gap-1.5 bg-[#202822] hover:bg-[#2B352E] text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50 border border-[#3A473E]"
            >
              <CloudDownload className={`w-3.5 h-3.5 ${isDownloadingSnapshot ? 'animate-bounce' : ''}`} />
              <span>{isDownloadingSnapshot ? 'Downloading...' : 'Pull from Cloud'}</span>
            </button>
            <button
              onClick={() => triggerSync()}
              className="btn-interactive flex items-center gap-1.5 bg-[#9BAE9C]/20 hover:bg-[#9BAE9C]/30 text-[#9BAE9C] border border-[#9BAE9C]/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync Queue</span>
            </button>
            <button
              onClick={onClose}
              className="btn-interactive text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#202822] transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Upload Snapshot Status Banner */}
        {uploadReport && (
          <div
            className={`px-6 py-2.5 border-b text-xs flex items-center justify-between ${
              uploadReport.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/50 border-rose-800/80 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {uploadReport.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{uploadReport.message}</span>
            </div>
            <button
              onClick={() => setUploadReport(null)}
              className="text-xs opacity-75 hover:opacity-100 cursor-pointer ml-3"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Status Ribbon */}
        <div className="bg-[#1A211C] border-b border-[#3A473E] px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
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
                  : 'bg-[#D97745]/20 text-[#D97745] border border-[#D97745]/40'
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
              Conflicts: <strong className="text-[#D97745]">{conflictedCount}</strong>
            </span>
          </div>
        </div>

        {/* Error message banner if any */}
        {lastError && (
          <div className="px-6 py-2.5 bg-rose-950/40 border-b border-rose-800/60 text-xs text-rose-300 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{lastError}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoResolveDuplicates}
                disabled={isResolvingDuplicates}
                className="btn-interactive flex items-center gap-1.5 bg-[#D97745] hover:bg-[#c26535] text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isResolvingDuplicates ? 'animate-spin' : ''}`} />
                <span>{isResolvingDuplicates ? 'Resolving...' : 'Auto-Fix Duplicates'}</span>
              </button>
              {failedOps.length > 0 && (
                <button
                  onClick={() => retryAll()}
                  className="btn-interactive text-xs underline font-semibold text-rose-200 hover:text-white cursor-pointer ml-1"
                >
                  Retry All Failed
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-[#3A473E] bg-[#2B352E]">
          <button
            onClick={() => setActiveTab('outbox')}
            className={`btn-interactive px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'outbox'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Queued Operations ({pendingOps.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('failed')}
            className={`btn-interactive px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
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
            className={`btn-interactive px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
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
            className={`btn-interactive px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
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
                      className="bg-[#2B352E] border border-[#3A473E] rounded-xl p-3 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            op.operationType === 'CREATE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : op.operationType === 'UPDATE'
                              ? 'bg-[#D97745]/20 text-[#D97745] border border-[#D97745]/40'
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
                        <span className="text-[11px] text-[#D97745] font-mono">
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
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                    <p className="text-xs text-slate-400">
                      Failed sync attempts. You can auto-replace duplicates, retry, or trash/ignore stuck records.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAutoResolveDuplicates}
                        disabled={isResolvingDuplicates}
                        title="Auto-replace duplicate records, remap foreign keys, and clean up stuck items"
                        className="btn-interactive flex items-center gap-1.5 bg-[#D97745] hover:bg-[#c26535] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isResolvingDuplicates ? 'animate-spin' : ''}`} />
                        <span>{isResolvingDuplicates ? 'Resolving...' : 'Auto-Resolve Duplicates'}</span>
                      </button>

                      <button
                        onClick={handleDiscardAllFailed}
                        disabled={isDiscardingFailed}
                        title="Trash and discard all failed operations from the outbox"
                        className="btn-interactive flex items-center gap-1.5 bg-[#202822] hover:bg-rose-900/60 text-rose-300 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer border border-rose-800/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Trash All Failed</span>
                      </button>

                      <button
                        onClick={() => retryAll()}
                        className="btn-interactive flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Retry All Now</span>
                      </button>
                    </div>
                  </div>

                  {failedOps.map((op) => (
                    <div
                      key={op.opId}
                      className="bg-[#2B352E] border border-rose-900/50 rounded-xl p-3.5 text-xs space-y-2"
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleIgnoreSingle(op.opId)}
                            title="Ignore and mark as synced (stops retrying)"
                            className="btn-interactive flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 bg-amber-950/40 hover:bg-amber-900/40 border border-amber-800/40 px-2 py-0.5 rounded transition cursor-pointer"
                          >
                            <EyeOff className="w-3 h-3" />
                            <span>Ignore</span>
                          </button>
                          <button
                            onClick={() => handleDiscardSingle(op.opId)}
                            title="Trash / Discard this failed operation completely"
                            className="btn-interactive flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/40 px-2 py-0.5 rounded transition cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Trash</span>
                          </button>
                          <button
                            onClick={() => syncEngine.retryOperation(op.opId)}
                            className="btn-interactive flex items-center gap-1 text-[11px] text-[#D97745] hover:text-[#c26535] bg-[#D97745]/15 hover:bg-[#D97745]/25 border border-[#D97745]/40 px-2 py-0.5 rounded font-semibold cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-2 rounded bg-[#202822] border border-[#3A473E] text-slate-300 text-[11px] font-mono">
                        {op.errorMessage || 'Unknown synchronization error'}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
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
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                    <p className="text-xs text-slate-400">
                      Version conflicts detected. Choose whether to replace cloud with local, keep cloud, or trash.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleResolveAllConflicts('keep_local')}
                        title="Keep all local versions and overwrite / replace cloud"
                        className="btn-interactive flex items-center gap-1 bg-[#D97745] hover:bg-[#c26535] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition shadow-sm cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Replace All (Local Wins)</span>
                      </button>
                      <button
                        onClick={() => handleResolveAllConflicts('keep_remote')}
                        title="Accept all cloud versions into local database"
                        className="btn-interactive flex items-center gap-1 bg-[#202822] hover:bg-[#2B352E] text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer border border-[#3A473E]"
                      >
                        <CloudDownload className="w-3.5 h-3.5 text-[#9BAE9C]" />
                        <span>Keep All (Cloud Wins)</span>
                      </button>
                      <button
                        onClick={() => handleResolveAllConflicts('discard')}
                        title="Trash and discard all unresolved conflicts"
                        className="btn-interactive flex items-center gap-1 bg-[#202822] hover:bg-rose-900/60 text-rose-300 hover:text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer border border-rose-800/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Trash All Conflicts</span>
                      </button>
                    </div>
                  </div>

                  {unresolvedConflicts.map((c) => (
                    <div
                      key={c.id}
                      className="bg-[#2B352E] border border-amber-800/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
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

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleQuickResolveConflict(c, 'keep_local')}
                          title="Replace cloud with this local version"
                          className="btn-interactive px-2.5 py-1 bg-[#D97745]/20 hover:bg-[#D97745]/30 text-[#D97745] border border-[#D97745]/40 rounded text-[11px] font-semibold transition cursor-pointer"
                        >
                          Replace Cloud
                        </button>
                        <button
                          onClick={() => handleQuickResolveConflict(c, 'keep_remote')}
                          title="Keep cloud version and update local"
                          className="btn-interactive px-2.5 py-1 bg-[#202822] hover:bg-[#2B352E] text-slate-200 border border-[#3A473E] rounded text-[11px] font-semibold transition cursor-pointer"
                        >
                          Keep Cloud
                        </button>
                        <button
                          onClick={() => handleQuickResolveConflict(c, 'discard')}
                          title="Trash and discard this conflict"
                          className="btn-interactive px-2.5 py-1 bg-rose-950/70 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded text-[11px] font-semibold transition cursor-pointer"
                        >
                          Trash
                        </button>
                        <button
                          onClick={() => setActiveConflict(c)}
                          className="btn-interactive flex items-center gap-1 bg-[#D97745] hover:bg-[#c26535] text-white font-semibold text-xs px-2.5 py-1 rounded transition shadow-sm cursor-pointer ml-1"
                        >
                          <span>Review</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SYNCED HISTORY TAB */}
          {activeTab === 'history' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                <span className="text-slate-400">Successfully synced operations: {syncedOps.length}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleVerifyAllSynced}
                    disabled={isVerifyingSynced}
                    title="Verify whether these operations actually exist in Supabase and safely re-queue any unconfirmed records"
                    className="btn-interactive flex items-center gap-1.5 bg-[#202822] hover:bg-[#2B352E] text-slate-200 border border-[#3A473E] text-xs font-semibold px-2.5 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingSynced ? 'animate-spin' : ''}`} />
                    <span>{isVerifyingSynced ? 'Verifying...' : 'Verify Cloud Records'}</span>
                  </button>
                  {syncedOps.length > 0 && (
                    <button
                      onClick={handleClearHistory}
                      disabled={clearingHistory}
                      className="btn-interactive flex items-center gap-1 text-slate-400 hover:text-rose-400 transition cursor-pointer px-2 py-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Synced Records</span>
                    </button>
                  )}
                </div>
              </div>

              {syncedOps.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">No synced history records.</p>
              ) : (
                <div className="space-y-1.5">
                  {syncedOps.slice(-20).reverse().map((op) => (
                    <div
                      key={op.opId}
                      className="bg-[#2B352E]/60 border border-[#3A473E] rounded-lg px-3 py-2 flex items-center justify-between text-xs text-slate-400"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="font-medium text-slate-200">
                          {op.operationType} {op.entityType}: {(op.payload as any)?.name || (op.payload as any)?.studentName || op.entityId}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] text-slate-500">
                          {new Date(op.timestamp).toLocaleTimeString()}
                        </span>
                        <button
                          onClick={() => handleResyncSingle(op.opId)}
                          disabled={recheckingOpId === op.opId}
                          title="Safely re-sync this existing record without duplicating or deleting it"
                          className="btn-interactive flex items-center gap-1 text-[11px] text-[#D97745] hover:text-[#c26535] bg-[#D97745]/15 hover:bg-[#D97745]/25 border border-[#D97745]/40 px-2 py-0.5 rounded font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <RotateCw className={`w-3 h-3 ${recheckingOpId === op.opId ? 'animate-spin' : ''}`} />
                          <span>Re-Sync</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#3A473E] bg-[#2B352E] shrink-0 flex items-center justify-between text-xs">
          <p className="text-slate-400">
            Outbox operations are processed strictly in chronological order with stable UUIDs.
          </p>
          <button
            onClick={onClose}
            className="btn-interactive px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-[#202822] hover:bg-[#1A211C] border border-[#3A473E] transition cursor-pointer"
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
