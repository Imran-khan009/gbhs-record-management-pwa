import React, { useState, useEffect } from 'react';
import { checkUnsyncedChangesBeforeLogout } from '../../services/authService';
import { AlertTriangle, LogOut, X, CloudUpload } from 'lucide-react';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLogout: (forceClear: boolean) => void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirmLogout,
}) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      checkUnsyncedChangesBeforeLogout().then((count) => {
        setPendingCount(count);
        setLoading(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
        <div className="w-12 h-12 rounded-2xl bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <h3 className="text-base font-bold text-white">Log Out Operator Session?</h3>

        {pendingCount > 0 ? (
          <div className="mt-3 p-3.5 rounded-xl bg-amber-950/40 border border-amber-800 text-xs text-amber-200 space-y-2">
            <p className="font-semibold flex items-center gap-1.5 text-amber-300">
              <CloudUpload className="w-4 h-4 shrink-0" />
              <span>Warning: {pendingCount} unsynced operations in Outbox!</span>
            </p>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              You have local student or attendance records that have not completed synchronization to the cloud. Logging
              out will preserve your queue safely for when you log in again.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            All local changes are fully synchronized with the cloud. Are you sure you want to log out of this device?
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 mt-6">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirmLogout(false)}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Confirm Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};
