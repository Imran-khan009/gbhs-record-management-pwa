import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar, ActiveTab } from './components/layout/Navbar';
import { DashboardView } from './components/dashboard/DashboardView';
import { StudentManagementView } from './components/students/StudentManagementView';
import { AttendanceView } from './components/attendance/AttendanceView';
import { ExcelImportModal } from './components/import/ExcelImportModal';
import { SyncDetailsModal } from './components/sync/SyncDetailsModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { LogoutConfirmModal } from './components/auth/LogoutConfirmModal';
import { StudentFormModal } from './components/students/StudentFormModal';
import { InteractiveTestSuiteModal } from './components/testing/InteractiveTestSuiteModal';
import { AuthView } from './components/auth/AuthView';
import { TeachingLogView } from './components/teaching/TeachingLogView';
import { PracticalProgressView } from './components/practical/PracticalProgressView';
import { AbsenteeFollowupView } from './components/absentee/AbsenteeFollowupView';
import { seedInitialSampleDataIfEmpty, sanitizeCorruptedStudents } from './services/recordService';
import { seedModuleDataIfEmpty } from './services/modulesService';
import { initSupabaseConfig } from './services/supabase';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSync } from './hooks/useSync';
import { School, WifiOff, RefreshCw } from 'lucide-react';

function MainApp() {
  const { session, isLoading, logout } = useAuth();
  const isOnline = useOnlineStatus();
  const { overallStatus } = useSync();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isNewStudentModalOpen, setIsNewStudentModalOpen] = useState(false);

  const [studentsVersion, setStudentsVersion] = useState(0);

  // Initialize Supabase config, sanitize corrupted imports, and seed initial data if empty
  useEffect(() => {
    async function init() {
      await initSupabaseConfig();
      const cleaned = await sanitizeCorruptedStudents();
      if (cleaned > 0) {
        setStudentsVersion((v) => v + 1);
      }
      if (session?.user.email) {
        await seedInitialSampleDataIfEmpty(session.user.email);
        await seedModuleDataIfEmpty();
      }
    }
    init();
  }, [session?.user.email]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-12 h-12 rounded-2xl bg-sky-600/20 text-sky-400 flex items-center justify-center animate-pulse mb-3">
          <School className="w-6 h-6" />
        </div>
        <p className="text-xs font-mono">Initializing GBHS Operator Database...</p>
      </div>
    );
  }

  if (!session) {
    return <AuthView />;
  }

  const handleSeedData = async () => {
    if (session.user.email) {
      await seedInitialSampleDataIfEmpty(session.user.email, true);
      setStudentsVersion((v) => v + 1);
      setActiveTab('students');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSyncDetails={() => setIsSyncModalOpen(true)}
        onLogoutClick={() => setIsLogoutModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            onNavigate={(tab) => {
              if (tab === 'import') setIsImportModalOpen(true);
              else if (tab === 'sync') setIsSyncModalOpen(true);
              else setActiveTab(tab);
            }}
            onOpenNewStudentModal={() => setIsNewStudentModalOpen(true)}
            onOpenSyncDetails={() => setIsSyncModalOpen(true)}
            onOpenImport={() => setIsImportModalOpen(true)}
            refreshKey={studentsVersion}
          />
        )}

        {activeTab === 'students' && (
          <StudentManagementView
            onOpenImport={() => setIsImportModalOpen(true)}
            onSeedData={handleSeedData}
            refreshKey={studentsVersion}
          />
        )}

        {activeTab === 'attendance' && <AttendanceView />}

        {activeTab === 'teaching' && <TeachingLogView />}

        {activeTab === 'practical' && <PracticalProgressView />}

        {activeTab === 'absentee' && <AbsenteeFollowupView />}

        {activeTab === 'import' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Excel Import Station</h2>
                <p className="text-xs text-slate-400">Click below to open the spreadsheet import modal.</p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Open Excel Importer
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
              <p className="text-xs text-slate-300">
                You can import Class 7, 8, and 9 students directly with full validation and duplicate checking.
              </p>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="mt-4 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition cursor-pointer"
              >
                Launch Import Modal
              </button>
            </div>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Synchronization Center</h2>
                <p className="text-xs text-slate-400">Monitor outbox operations, failed retries, and data conflicts.</p>
              </div>
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Open Detailed Outbox Modal
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
              <p className="text-xs text-slate-300">
                Current sync status: <strong className="text-sky-400">{overallStatus}</strong>
              </p>
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="mt-4 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition cursor-pointer"
              >
                Manage Outbox & Conflicts
              </button>
            </div>
          </div>
        )}

        {activeTab === 'tests' && <InteractiveTestSuiteModal />}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">System Settings</h2>
                <p className="text-xs text-slate-400">Manage Supabase cloud connection and testing modes.</p>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Open Settings Panel
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Floating Offline Notification if disconnected */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600/90 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-white shadow-xl border border-amber-500">
          <WifiOff className="w-4 h-4 animate-pulse" />
          <span>Offline Mode — All changes safely recorded to IndexedDB outbox.</span>
        </div>
      )}

      {/* Modals */}
      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          setStudentsVersion((v) => v + 1);
          setActiveTab('dashboard');
        }}
      />

      <SyncDetailsModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      <StudentFormModal
        isOpen={isNewStudentModalOpen}
        onClose={() => setIsNewStudentModalOpen(false)}
        onSaved={() => {
          setStudentsVersion((v) => v + 1);
          setActiveTab('students');
        }}
      />

      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirmLogout={async (forceClear) => {
          await logout(forceClear);
          setIsLogoutModalOpen(false);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
