import React, { useState } from 'react';
import {
  ShieldAlert,
  Database,
  ArrowRight,
  Download,
  CheckCircle2,
  AlertCircle,
  FolderPlus,
  RefreshCw,
  Archive,
} from 'lucide-react';
import {
  LegacyDataInspection,
  linkAndMigrateLegacyRecordsToWorkspace,
  dismissLegacyLinkingForOwner,
  LEGACY_DB_NAME,
} from '../../services/db';
import { downloadLocalBackup } from '../../services/backupService';

interface LegacyDataLinkingModalProps {
  isOpen: boolean;
  ownerEmail: string;
  ownerId: string;
  inspection: LegacyDataInspection;
  onLinkSuccess: () => void;
  onDismiss: () => void;
}

export const LegacyDataLinkingModal: React.FC<LegacyDataLinkingModalProps> = ({
  isOpen,
  ownerEmail,
  ownerId,
  inspection,
  onLinkSuccess,
  onDismiss,
}) => {
  const [isLinking, setIsLinking] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadBackupFirst = async () => {
    setIsBackingUp(true);
    setErrorMessage(null);
    try {
      const res = await downloadLocalBackup(LEGACY_DB_NAME);
      if (res.success) {
        setBackupSuccessMessage(
          `Backup file "${res.filename}" downloaded successfully (${res.totalRecords} records preserved).`
        );
      } else {
        setErrorMessage(res.error || 'Failed to download backup.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error triggering backup download.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleConfirmLinking = async () => {
    setIsLinking(true);
    setErrorMessage(null);
    try {
      const res = await linkAndMigrateLegacyRecordsToWorkspace(ownerId, ownerEmail);
      if (res.success) {
        onLinkSuccess();
      } else {
        setErrorMessage(res.error || 'Failed to link records.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred during linking.');
    } finally {
      setIsLinking(false);
    }
  };

  const handleStartWithEmptyWorkspace = async () => {
    try {
      await dismissLegacyLinkingForOwner(ownerId);
      onDismiss();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error dismissing linking prompt.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-amber-500/10 via-slate-800/50 to-slate-800/30 border-b border-amber-500/20 flex items-start gap-4">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl flex-shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-1">
              Account Isolation Check
            </span>
            <h2 className="text-lg font-bold text-slate-100">
              Existing Local Records Detected
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Local unassigned records were found on this device from before account isolation was enabled.
            </p>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-300">
          {/* Target Account Info */}
          <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Target Owner Account
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sky-400 text-base">{ownerEmail}</span>
                <div className="text-xs font-mono text-slate-400 mt-0.5">
                  Workspace Owner ID: {ownerId}
                </div>
              </div>
              <span className="px-2.5 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-medium rounded-full">
                Authenticated
              </span>
            </div>
          </div>

          {/* Breakdown Table */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Existing Records Found Locally</span>
              <span className="text-amber-400 font-semibold">{inspection.totalRecords} total items</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-400">Students</span>
                <p className="text-lg font-bold text-slate-100">{inspection.counts.students}</p>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-400">Attendance</span>
                <p className="text-lg font-bold text-slate-100">{inspection.counts.attendance}</p>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-400">Teaching Logs</span>
                <p className="text-lg font-bold text-slate-100">{inspection.counts.teaching_logs}</p>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-400">Practical Progress</span>
                <p className="text-lg font-bold text-slate-100">{inspection.counts.practical_progress}</p>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-400">Absentee Followups</span>
                <p className="text-lg font-bold text-slate-100">{inspection.counts.absentee_followups}</p>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-400">Pending Outbox</span>
                <p className="text-lg font-bold text-slate-100">{inspection.counts.outbox}</p>
              </div>
            </div>
          </div>

          {/* Non-Destructive Protection Notice */}
          <div className="p-3.5 bg-sky-950/30 border border-sky-800/40 rounded-xl flex items-start gap-3 text-xs text-sky-200">
            <Archive className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-sky-300">Zero Deletion Guarantee:</span>
              <p className="text-slate-300 mt-0.5 leading-relaxed">
                Your original local database (<code className="text-sky-300">gbhs_operator_db_v1</code>) remains 100% intact as a permanent offline rollback archive. Linking will safely copy and assign ownership of these records into your isolated account workspace.
              </p>
            </div>
          </div>

          {/* Success / Error Banners */}
          {backupSuccessMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{backupSuccessMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDownloadBackupFirst}
            disabled={isBackingUp || isLinking}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800/70 hover:bg-slate-800 text-slate-200 text-xs font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isBackingUp ? (
              <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
            ) : (
              <Download className="w-4 h-4 text-slate-400" />
            )}
            <span>Download Backup First (.json)</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleStartWithEmptyWorkspace}
              disabled={isLinking}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition disabled:opacity-50"
            >
              Start Empty
            </button>

            <button
              type="button"
              onClick={handleConfirmLinking}
              disabled={isLinking}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg shadow-sky-600/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLinking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Linking Records...</span>
                </>
              ) : (
                <>
                  <span>Link to My Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
