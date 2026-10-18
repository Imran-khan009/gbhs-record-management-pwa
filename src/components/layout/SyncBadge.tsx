import React from 'react';
import { useSync } from '../../hooks/useSync';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Clock,
} from 'lucide-react';

interface SyncBadgeProps {
  onClick?: () => void;
}

export const SyncBadge: React.FC<SyncBadgeProps> = ({ onClick }) => {
  const { overallStatus, pendingCount, failedCount, conflictedCount } = useSync();

  const getBadgeConfig = () => {
    switch (overallStatus) {
      case 'Offline':
        return {
          icon: <CloudOff className="w-3.5 h-3.5" />,
          label: 'Offline',
          badgeClass: 'bg-slate-700/80 text-slate-200 border-slate-600',
          dotClass: 'bg-slate-400',
        };
      case 'Syncing':
        return {
          icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
          label: 'Syncing...',
          badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
          dotClass: 'bg-sky-400 animate-pulse',
        };
      case 'Conflict needs review':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
          label: `Conflict (${conflictedCount})`,
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          dotClass: 'bg-amber-400 animate-ping',
        };
      case 'Authentication required':
        return {
          icon: <Lock className="w-3.5 h-3.5 text-rose-400" />,
          label: 'Auth Required',
          badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          dotClass: 'bg-rose-400',
        };
      case 'Sync failed':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
          label: `Failed (${failedCount})`,
          badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          dotClass: 'bg-rose-500',
        };
      case 'Local changes pending':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-amber-400" />,
          label: `Pending (${pendingCount})`,
          badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
          dotClass: 'bg-amber-400',
        };
      case 'Synced':
      default:
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
          label: 'Synced',
          badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
          dotClass: 'bg-emerald-400',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition hover:opacity-90 active:scale-95 cursor-pointer ${config.badgeClass}`}
      title="Click to view Outbox and Sync Details"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      {config.icon}
      <span>{config.label}</span>
    </button>
  );
};
