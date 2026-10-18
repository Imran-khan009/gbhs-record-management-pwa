import React, { useState } from 'react';
import { ConflictItem } from '../../types/sync';
import { syncEngine } from '../../services/syncEngine';
import {
  X,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle,
  Download,
  Upload,
  Split,
} from 'lucide-react';

interface ConflictResolverModalProps {
  conflict: ConflictItem | null;
  onClose: () => void;
  onResolved: () => void;
}

export const ConflictResolverModal: React.FC<ConflictResolverModalProps> = ({
  conflict,
  onClose,
  onResolved,
}) => {
  if (!conflict) return null;

  const [mergeName, setMergeName] = useState(
    conflict.localData?.name || conflict.remoteData?.name || ''
  );
  const [mergeStatus, setMergeStatus] = useState(
    conflict.localData?.status || conflict.remoteData?.status || 'Active'
  );
  const [isMerging, setIsMerging] = useState(false);

  const handleKeepLocal = async () => {
    await syncEngine.resolveConflict(conflict, 'keep_local');
    onResolved();
    onClose();
  };

  const handleKeepRemote = async () => {
    await syncEngine.resolveConflict(conflict, 'keep_remote');
    onResolved();
    onClose();
  };

  const handleMerge = async () => {
    const merged = {
      ...conflict.remoteData,
      ...conflict.localData,
      name: mergeName,
      status: mergeStatus,
      version: Math.max(conflict.localData?.version || 1, conflict.remoteData?.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    await syncEngine.resolveConflict(conflict, 'merge', merged);
    onResolved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-base font-bold text-white">Resolve Data Conflict</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-xs text-slate-300">
            The {conflict.entityType} record was modified both locally and on the cloud. Please inspect the differences
            and choose how to resolve the discrepancy.
          </p>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Local Version */}
            <div className="bg-slate-850 border border-sky-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-sky-400 font-bold text-xs uppercase">
                <span className="flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Local Changes (Device)
                </span>
                <span className="font-mono text-[10px]">v{conflict.localData?.version || 1}</span>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">Name / Label:</span>
                  <span className="font-semibold text-white">
                    {conflict.localData?.name || conflict.localData?.studentName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Status:</span>
                  <span className="font-semibold text-sky-300">{conflict.localData?.status || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Class & Roll:</span>
                  <span className="text-slate-300">
                    {conflict.localData?.class} Roll #{conflict.localData?.rollNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Last Modified:</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {conflict.localData?.updatedAt ? new Date(conflict.localData.updatedAt).toLocaleTimeString() : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Remote Version */}
            <div className="bg-slate-850 border border-purple-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-purple-400 font-bold text-xs uppercase">
                <span className="flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Remote Version (Cloud)
                </span>
                <span className="font-mono text-[10px]">v{conflict.remoteData?.version || 1}</span>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">Name / Label:</span>
                  <span className="font-semibold text-white">
                    {conflict.remoteData?.name || conflict.remoteData?.studentName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Status:</span>
                  <span className="font-semibold text-purple-300">{conflict.remoteData?.status || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Class & Roll:</span>
                  <span className="text-slate-300">
                    {conflict.remoteData?.class} Roll #{conflict.remoteData?.rollNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Last Modified:</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {conflict.remoteData?.updatedAt ? new Date(conflict.remoteData.updatedAt).toLocaleTimeString() : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Merge option fields if user toggles */}
          {isMerging && (
            <div className="bg-slate-850 border border-slate-700 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Split className="w-4 h-4 text-sky-400" />
                <span>Customize Merged Values</span>
              </h4>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Student / Label Name</label>
                <input
                  type="text"
                  value={mergeName}
                  onChange={(e) => setMergeName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          )}

          {/* Decision Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              onClick={handleKeepLocal}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-sky-950/60 border border-sky-800/80 hover:bg-sky-900/60 text-sky-200 transition cursor-pointer"
            >
              <Upload className="w-5 h-5 text-sky-400 mb-1" />
              <span className="text-xs font-bold">Keep Local Version</span>
              <span className="text-[10px] text-sky-400/80 mt-0.5">Overwrites Cloud</span>
            </button>

            <button
              onClick={handleKeepRemote}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-purple-950/60 border border-purple-800/80 hover:bg-purple-900/60 text-purple-200 transition cursor-pointer"
            >
              <Download className="w-5 h-5 text-purple-400 mb-1" />
              <span className="text-xs font-bold">Keep Remote Version</span>
              <span className="text-[10px] text-purple-400/80 mt-0.5">Accept Cloud Value</span>
            </button>

            {!isMerging ? (
              <button
                onClick={() => setIsMerging(true)}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-200 transition cursor-pointer"
              >
                <Split className="w-5 h-5 text-emerald-400 mb-1" />
                <span className="text-xs font-bold">Merge Where Safe</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Customize Combined</span>
              </button>
            ) : (
              <button
                onClick={handleMerge}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 hover:bg-emerald-900/60 text-emerald-200 transition cursor-pointer"
              >
                <CheckCircle className="w-5 h-5 text-emerald-400 mb-1" />
                <span className="text-xs font-bold">Confirm Merge</span>
                <span className="text-[10px] text-emerald-400/80 mt-0.5">Save Combined</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
