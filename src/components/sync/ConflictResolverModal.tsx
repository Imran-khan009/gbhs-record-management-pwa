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
  Trash2,
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

  const handleTrash = async () => {
    await syncEngine.resolveConflict(conflict, 'discard');
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
      <div className="w-full max-w-2xl bg-[#202822] border border-[#3A473E] rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3A473E] bg-[#2B352E]">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-5 h-5 text-[#D97745]" />
            <h3 className="text-base font-bold text-white">Resolve Data Conflict</h3>
          </div>
          <button
            onClick={onClose}
            className="btn-interactive text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#202822] transition cursor-pointer"
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
            <div className="bg-[#2B352E] border border-[#D97745]/40 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#3A473E] text-[#D97745] font-bold text-xs uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Local Changes (Device)
                </span>
                <span className="font-mono text-[10px]">v{conflict.localData?.version || 1}</span>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Name / Label:</span>
                  <span className="font-semibold text-white">
                    {conflict.localData?.name || conflict.localData?.studentName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Status:</span>
                  <span className="font-semibold text-[#D97745]">{conflict.localData?.status || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Class & Roll:</span>
                  <span className="text-slate-300">
                    {conflict.localData?.class} Roll #{conflict.localData?.rollNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Last Modified:</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {conflict.localData?.updatedAt ? new Date(conflict.localData.updatedAt).toLocaleTimeString() : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Remote Version */}
            <div className="bg-[#2B352E] border border-[#9BAE9C]/40 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#3A473E] text-[#9BAE9C] font-bold text-xs uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Remote Version (Cloud)
                </span>
                <span className="font-mono text-[10px]">v{conflict.remoteData?.version || 1}</span>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Name / Label:</span>
                  <span className="font-semibold text-white">
                    {conflict.remoteData?.name || conflict.remoteData?.studentName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Status:</span>
                  <span className="font-semibold text-[#9BAE9C]">{conflict.remoteData?.status || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Class & Roll:</span>
                  <span className="text-slate-300">
                    {conflict.remoteData?.class} Roll #{conflict.remoteData?.rollNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Last Modified:</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {conflict.remoteData?.updatedAt ? new Date(conflict.remoteData.updatedAt).toLocaleTimeString() : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Merge option fields if user toggles */}
          {isMerging && (
            <div className="bg-[#2B352E] border border-[#3A473E] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Split className="w-4 h-4 text-[#D97745]" />
                <span>Customize Merged Values</span>
              </h4>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Student / Label Name</label>
                <input
                  type="text"
                  value={mergeName}
                  onChange={(e) => setMergeName(e.target.value)}
                  className="w-full bg-[#202822] border border-[#3A473E] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#D97745]"
                />
              </div>
            </div>
          )}

          {/* Decision Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2">
            <button
              onClick={handleKeepLocal}
              className="btn-interactive flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#D97745]/15 border border-[#D97745]/40 hover:bg-[#D97745]/25 text-[#D97745] transition cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#D97745] mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold">Keep Local</span>
              <span className="text-[9px] text-[#D97745]/80 mt-0.5">Overwrites Cloud</span>
            </button>

            <button
              onClick={handleKeepRemote}
              className="btn-interactive flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#9BAE9C]/15 border border-[#9BAE9C]/40 hover:bg-[#9BAE9C]/25 text-[#9BAE9C] transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#9BAE9C] mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold">Keep Remote</span>
              <span className="text-[9px] text-[#9BAE9C]/80 mt-0.5">Accept Cloud</span>
            </button>

            <button
              onClick={handleTrash}
              className="btn-interactive flex flex-col items-center justify-center p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 hover:bg-rose-900/50 text-rose-300 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold">Trash / Ignore</span>
              <span className="text-[9px] text-rose-400/80 mt-0.5">Discard Conflict</span>
            </button>

            {!isMerging ? (
              <button
                onClick={() => setIsMerging(true)}
                className="btn-interactive flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#202822] border border-[#3A473E] hover:bg-[#2B352E] text-slate-200 transition cursor-pointer"
              >
                <Split className="w-4 h-4 text-[#9BAE9C] mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Merge</span>
                <span className="text-[9px] text-slate-400 mt-0.5">Customize</span>
              </button>
            ) : (
              <button
                onClick={handleMerge}
                className="btn-interactive flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#D97745] hover:bg-[#c26535] text-white transition shadow-sm cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 text-white mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Confirm</span>
                <span className="text-[9px] text-white/80 mt-0.5">Save</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
