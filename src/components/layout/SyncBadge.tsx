import React from 'react';
import { useSync } from '../../hooks/useSync';
import {
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
          badgeClass: 'bg-[#2B352E] text-[#9BAE9C] border-[#3D4A41]',
          dotClass: 'bg-[#9BAE9C]',
        };
      case 'Syncing':
        return {
          icon: <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#D97745]" />,
          label: 'Syncing...',
          badgeClass: 'bg-[#D97745]/15 text-[#E48B5D] border-[#D97745]/30',
          dotClass: 'bg-[#D97745] animate-pulse',
        };
      case 'Conflict needs review':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
          label: `Conflict (${conflictedCount})`,
          badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          dotClass: 'bg-amber-400 animate-ping',
        };
      case 'Authentication required':
        return {
          icon: <Lock className="w-3.5 h-3.5 text-rose-400" />,
          label: 'Auth Required',
          badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
          dotClass: 'bg-rose-400',
        };
      case 'Sync failed':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
          label: `Failed (${failedCount})`,
          badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
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
      disabled={!onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 ${
        onClick ? 'hover:opacity-90 active:scale-95 cursor-pointer' : 'cursor-default'
      } ${config.badgeClass}`}
      title={onClick ? 'Click to view Outbox and Sync Details' : `Workspace Synchronization: ${config.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      {config.icon}
      <span className="hidden xs:inline">{config.label}</span>
    </button>
  );
};
