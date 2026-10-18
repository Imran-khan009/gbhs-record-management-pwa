import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { SyncBadge } from './SyncBadge';
import { PWAInstallButton } from './PWAInstallButton';
import {
  School,
  LayoutDashboard,
  Users,
  CalendarCheck,
  FileSpreadsheet,
  RefreshCw,
  FlaskConical,
  LogOut,
  Sliders,
  WifiOff,
  UserCheck,
  BookOpen,
  Award,
  UserX,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'students'
  | 'attendance'
  | 'teaching'
  | 'practical'
  | 'absentee'
  | 'import'
  | 'sync'
  | 'tests'
  | 'settings';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSyncDetails: () => void;
  onLogoutClick: () => void;
  onOpenSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSyncDetails,
  onLogoutClick,
  onOpenSettings,
}) => {
  const { session } = useAuth();
  const isOnline = useOnlineStatus();

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100">
      {/* Top Banner if Offline or Auth Required */}
      {!isOnline && (
        <div className="bg-amber-600/90 text-amber-50 px-4 py-1 text-xs font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          <span>Offline Mode Active — Changes are securely saved to local IndexedDB and queued in Outbox.</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & School Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-950/50">
              <School className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base text-white tracking-tight">GBHS RECORD SYSTEM</span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                  Classes 7-9
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">Govt Boys High School • Computer Operator Console</p>
            </div>
          </div>

          {/* Navigation Links for Desktop */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('students')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'students'
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Students</span>
            </button>

            <button
              onClick={() => setActiveTab('attendance')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'attendance'
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Attendance</span>
            </button>

            <button
              onClick={() => setActiveTab('teaching')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'teaching'
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-400" />
              <span>Teaching Log</span>
            </button>

            <button
              onClick={() => setActiveTab('practical')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'practical'
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span>Practical Tracker</span>
            </button>

            <button
              onClick={() => setActiveTab('absentee')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'absentee'
                  ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <UserX className="w-3.5 h-3.5 text-amber-400" />
              <span>Absentee Follow-up</span>
            </button>

            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'import'
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel Import</span>
            </button>

            <button
              onClick={() => setActiveTab('sync')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'sync'
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync Center</span>
            </button>

            <button
              onClick={() => setActiveTab('tests')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'tests'
                  ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                  : 'text-purple-300 hover:bg-purple-950/40 hover:text-purple-200'
              }`}
              title="Test offline saving, reconnection, conflicts, backoff, and Excel import"
            >
              <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
              <span>Test Suite</span>
            </button>
          </nav>

          {/* Right Area: Sync Badge, PWA Install, Operator, Settings, Logout */}
          <div className="flex items-center gap-2.5">
            <SyncBadge onClick={onOpenSyncDetails} />
            <PWAInstallButton />

            {/* Settings button */}
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              title="Supabase Settings & Configuration"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Operator details */}
            {session && (
              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800 text-xs">
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-400">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
                <div className="leading-tight">
                  <p className="font-medium text-slate-200 max-w-[120px] truncate">{session.user.fullName}</p>
                  <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{session.user.email}</p>
                </div>
              </div>
            )}

            {/* Logout button */}
            <button
              onClick={onLogoutClick}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
              title="Logout Operator"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="md:hidden border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around text-[11px] overflow-x-auto bg-slate-900">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 ${
            activeTab === 'dashboard' ? 'text-sky-400 bg-slate-800' : 'text-slate-400'
          }`}
        >
          <LayoutDashboard className="w-3 h-3" /> Dashboard
        </button>
        <button
          onClick={() => setActiveTab('students')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 ${
            activeTab === 'students' ? 'text-sky-400 bg-slate-800' : 'text-slate-400'
          }`}
        >
          <Users className="w-3 h-3" /> Students
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 shrink-0 ${
            activeTab === 'attendance' ? 'text-sky-400 bg-slate-800' : 'text-slate-400'
          }`}
        >
          <CalendarCheck className="w-3 h-3" /> Attendance
        </button>
        <button
          onClick={() => setActiveTab('teaching')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 shrink-0 ${
            activeTab === 'teaching' ? 'text-sky-400 bg-slate-800' : 'text-slate-400'
          }`}
        >
          <BookOpen className="w-3 h-3" /> Teaching
        </button>
        <button
          onClick={() => setActiveTab('practical')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 shrink-0 ${
            activeTab === 'practical' ? 'text-emerald-400 bg-slate-800' : 'text-slate-400'
          }`}
        >
          <Award className="w-3 h-3" /> Practical
        </button>
        <button
          onClick={() => setActiveTab('absentee')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 shrink-0 ${
            activeTab === 'absentee' ? 'text-amber-400 bg-slate-800' : 'text-slate-400'
          }`}
        >
          <UserX className="w-3 h-3" /> Absentee
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 shrink-0 ${
            activeTab === 'import' ? 'text-sky-400 bg-slate-800' : 'text-slate-400'
          }`}
        >
          <FileSpreadsheet className="w-3 h-3" /> Import
        </button>
        <button
          onClick={() => setActiveTab('sync')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 ${
            activeTab === 'sync' ? 'text-sky-400 bg-slate-800' : 'text-slate-400'
          }`}
        >
          <RefreshCw className="w-3 h-3" /> Sync
        </button>
        <button
          onClick={() => setActiveTab('tests')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 ${
            activeTab === 'tests' ? 'text-purple-400 bg-purple-950/40' : 'text-purple-300'
          }`}
        >
          <FlaskConical className="w-3 h-3" /> Tests
        </button>
      </div>
    </header>
  );
};
