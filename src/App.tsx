import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar, ActiveTab } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { StudentManagementView } from './components/students/StudentManagementView';
import { AttendanceView } from './components/attendance/AttendanceView';
import { ExcelImportModal } from './components/import/ExcelImportModal';
import { SyncDetailsModal } from './components/sync/SyncDetailsModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { LogoutConfirmModal } from './components/auth/LogoutConfirmModal';
import { LegacyDataLinkingModal } from './components/auth/LegacyDataLinkingModal';
import { StudentFormModal } from './components/students/StudentFormModal';
import { InteractiveTestSuiteModal } from './components/testing/InteractiveTestSuiteModal';
import { AuthView } from './components/auth/AuthView';
import { TeachingLogView } from './components/teaching/TeachingLogView';
import { PracticalProgressView } from './components/practical/PracticalProgressView';
import { AbsenteeFollowupView } from './components/absentee/AbsenteeFollowupView';
import { seedInitialSampleDataIfEmpty, sanitizeCorruptedStudents } from './services/recordService';
import { clearAllModulesMockData } from './services/modulesService';
import { backfillHistoricalDataForOwner } from './services/historicalBackfillService';
import { inspectLegacyRecords, LegacyDataInspection, getAppState, setAppState } from './services/db';
import { initSupabaseConfig } from './services/supabase';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSync } from './hooks/useSync';
import { getWorkspacePermissions, isMasterOwnerEmail } from './services/permissionService';
import { School, WifiOff, Calendar, BookOpen, Award, UserX, FileSpreadsheet, FileText, Download, Upload, ArrowRight, Users } from 'lucide-react';
import { ModuleImportModal } from './components/import/ModuleImportModal';
import { MonthlyReportModal } from './components/reports/MonthlyReportModal';
import {
  ModuleType,
  downloadAttendanceTemplate,
  downloadTeachingLogTemplate,
  downloadPracticalTrackerTemplate,
  downloadAbsenteeFollowupTemplate,
} from './services/bulkModuleImportService';

function MainApp() {
  const { session, isLoading, logout } = useAuth();
  const isOnline = useOnlineStatus();
  const { overallStatus } = useSync();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isModuleImportModalOpen, setIsModuleImportModalOpen] = useState(false);
  const [moduleImportInitialType, setModuleImportInitialType] = useState<ModuleType>('attendance');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isNewStudentModalOpen, setIsNewStudentModalOpen] = useState(false);
  const [isMonthlyReportModalOpen, setIsMonthlyReportModalOpen] = useState(false);
  const [legacyInspection, setLegacyInspection] = useState<LegacyDataInspection | null>(null);
  const [isLegacyLinkingModalOpen, setIsLegacyLinkingModalOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    try {
      const savedPinned = localStorage.getItem('gbhs_sidebar_pinned');
      if (savedPinned !== null) {
        return savedPinned === 'true';
      }
      const savedCollapsed = localStorage.getItem('gbhs_sidebar_collapsed');
      return savedCollapsed === 'false';
    } catch {
      return false;
    }
  });

  const [studentsVersion, setStudentsVersion] = useState(0);

  const permissions = getWorkspacePermissions(session?.user);
  const isMasterOwner = isMasterOwnerEmail(session?.user?.email);

  // Initialize Supabase config, sanitize corrupted imports, and check for unlinked legacy records
  useEffect(() => {
    async function init() {
      await initSupabaseConfig();
      if (!session?.user?.id) {
        return;
      }

      const cleaned = await sanitizeCorruptedStudents();
      if (cleaned > 0) {
        setStudentsVersion((v) => v + 1);
      }

      // Master Owner: restore historical backfill (March 2, 2026 to October 20, 2026 covering Modules 1 to 4)
      if (isMasterOwner && session?.user?.id && session?.user?.email) {
        const isBackfilled = await getAppState<boolean>('owner_historical_backfilled_v2');
        if (!isBackfilled) {
          try {
            await backfillHistoricalDataForOwner(session.user.email, session.user.id);
            setStudentsVersion((v) => v + 1);
          } catch (err) {
            console.error('Error during historical backfill for owner:', err);
          }
        }

        // Check for unlinked legacy records in gbhs_operator_db_v1 ONLY for the designated Master Owner
        try {
          const inspection = await inspectLegacyRecords(session.user.id);
          if (
            inspection.hasLegacyData &&
            !inspection.isAlreadyLinked &&
            !inspection.isDismissedForOwner
          ) {
            setLegacyInspection(inspection);
            setIsLegacyLinkingModalOpen(true);
          }
        } catch (err) {
          console.error('Error inspecting legacy local records:', err);
        }
      } else if (session?.user?.id && !isMasterOwner) {
        // Non-owner accounts / new users: ensure their workspace remains clean, fresh, and empty
        await setAppState('auto_seed_disabled', true);
        await setAppState('modules_seeded_v1', true);
      }
    }
    init();
  }, [session?.user?.id, session?.user?.email, isMasterOwner]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#202822] flex flex-col items-center justify-center text-[#9BAE9C]">
        <div className="w-12 h-12 rounded-2xl bg-[#D97745]/15 text-[#D97745] flex items-center justify-center animate-pulse mb-3 border border-[#D97745]/30">
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
      if (isMasterOwner && session.user.id) {
        await backfillHistoricalDataForOwner(session.user.email, session.user.id, true);
      } else {
        await seedInitialSampleDataIfEmpty(session.user.email, true);
      }
      setStudentsVersion((v) => v + 1);
      setActiveTab('students');
    }
  };

  return (
    <div className="min-h-screen bg-[#202822] text-[#F6F3EA] flex font-sans transition-colors duration-150">
      {/* Slim SaaS Sidebar (Fixed Viewport Desktop Rail + Mobile Drawer) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSyncDetails={() => permissions.isOwner && setIsSyncModalOpen(true)}
        onLogoutClick={() => setIsLogoutModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenReports={() => setIsMonthlyReportModalOpen(true)}
        isMobileOpen={isMobileNavOpen}
        setIsMobileOpen={setIsMobileNavOpen}
        isPinned={isSidebarPinned}
        onPinChange={setIsSidebarPinned}
      />

      {/* Main Content Column: Fixed sidebar offset with smooth layout transition */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden transition-[padding] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isSidebarPinned ? 'lg:pl-60' : 'lg:pl-[68px]'
        }`}
      >
        {/* Top Refined Header */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSyncDetails={() => permissions.isOwner && setIsSyncModalOpen(true)}
          onLogoutClick={() => setIsLogoutModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onToggleMobileNav={() => setIsMobileNavOpen((prev) => !prev)}
        />

        {/* Main View Area with Instantaneous Subtle Module View Transition */}
        <main key={activeTab} className="flex-1 max-w-[1720px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 module-view-transition">
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

        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#3D4A41]">
              <div>
                <h2 className="text-xl font-bold text-[#F6F3EA] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#D97745]" />
                  <span>Official Monthly Administrative & Performance Reports</span>
                </h2>
                <p className="text-xs text-[#9BAE9C] mt-0.5">
                  Generate comprehensive school performance summaries, monthly attendance ledgers, curriculum teaching logs, and practical evaluations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMonthlyReportModalOpen(true)}
                className="btn-interactive inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white shadow-sm cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Launch Report Console</span>
              </button>
            </div>

            {/* Reports Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Monthly Attendance Ledger */}
              <div className="bg-[#2B352E] border border-[#3D4A41] hover:border-[#D97745]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#D97745]/15 border border-[#D97745]/30 text-[#D97745] flex items-center justify-center">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#F6F3EA]">Attendance & Absence Roster</h3>
                      <span className="text-[10px] text-[#D97745] font-mono font-medium">Monthly Ledger</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#9BAE9C]">
                    Calculates student-by-student presence, absence, leave rates, and flags at-risk students below 75% threshold.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#3D4A41]/80 mt-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsMonthlyReportModalOpen(true)}
                    className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#C56837] text-white transition-colors cursor-pointer"
                  >
                    <span>View Ledger</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card 2: Curriculum Delivery & Lab Skills */}
              <div className="bg-[#2B352E] border border-[#3D4A41] hover:border-[#D97745]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#9BAE9C]/15 border border-[#9BAE9C]/30 text-[#9BAE9C] flex items-center justify-center">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#F6F3EA]">Instruction & Lab Progress</h3>
                      <span className="text-[10px] text-[#9BAE9C] font-mono font-medium">Curriculum Audit</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#9BAE9C]">
                    Aggregates conducted lecture periods, teaching hours, hands-on lab evaluations, and student competencies.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#3D4A41]/80 mt-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsMonthlyReportModalOpen(true)}
                    className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#202822] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] transition-colors cursor-pointer"
                  >
                    <span>View Analytics</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card 3: Outreach & Administrative Summary */}
              <div className="bg-[#2B352E] border border-[#3D4A41] hover:border-[#D97745]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#D97745]/15 border border-[#D97745]/30 text-[#D97745] flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#F6F3EA]">Export Official Excel</h3>
                      <span className="text-[10px] text-[#D97745] font-mono font-medium">Principal & District Copy</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#9BAE9C]">
                    One-click export of verified, formatted multi-sheet Excel reports with official school emblem header.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#3D4A41]/80 mt-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsMonthlyReportModalOpen(true)}
                    className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#C56837] text-white transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Generate Excel</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'import' && permissions.canImport && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  <span>Data & Spreadsheet Import Center</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Download standardized Excel/CSV templates and bulk import records across all 5 management modules.
                </p>
              </div>
            </div>

            {/* Import Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Student Master Roster */}
              <div className="bg-[#2B352E] border border-[#3A473E] hover:border-[#9BAE9C]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#D97745]/10 border border-[#D97745]/25 text-[#D97745] flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Student Master Roster</h3>
                      <span className="text-[10px] text-[#9BAE9C] font-mono font-medium">Core Enrollment</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">
                    Import official school admission register with roll numbers, guardian contacts, and class assignments.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#3A473E] mt-4 flex items-center justify-end">
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] text-white transition shadow-sm cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Launch Importer</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Daily Attendance */}
              <div className="bg-[#2B352E] border border-[#3A473E] hover:border-[#9BAE9C]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#9BAE9C]/15 border border-[#9BAE9C]/25 text-[#9BAE9C] flex items-center justify-center">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Attendance Records</h3>
                      <span className="text-[10px] text-[#9BAE9C] font-mono font-medium">Daily Register</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">
                    Bulk upload daily attendance by admission number or roll number. Resolves students without dummy creation.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#3A473E] mt-4 flex items-center justify-between gap-2">
                  <button
                    onClick={() => downloadAttendanceTemplate()}
                    className="btn-interactive flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#202822] hover:bg-[#2B352E] text-slate-200 border border-[#3A473E] transition cursor-pointer"
                    title="Download attendance template"
                  >
                    <Download className="w-3.5 h-3.5 text-[#9BAE9C]" />
                    <span>Template</span>
                  </button>
                  <button
                    onClick={() => {
                      setModuleImportInitialType('attendance');
                      setIsModuleImportModalOpen(true);
                    }}
                    className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] text-white transition shadow-sm cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Bulk Import</span>
                  </button>
                </div>
              </div>

              {/* Card 3: Teaching Log */}
              <div className="bg-[#2B352E] border border-[#3A473E] hover:border-[#9BAE9C]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#D97745]/10 border border-[#D97745]/25 text-[#D97745] flex items-center justify-center">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Curriculum Teaching Log</h3>
                      <span className="text-[10px] text-[#D97745] font-mono font-medium">Instruction Sessions</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">
                    Bulk import lesson delivery logs, periods, curriculum units, student attendance numbers, and notes.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#3A473E] mt-4 flex items-center justify-between gap-2">
                  <button
                    onClick={() => downloadTeachingLogTemplate()}
                    className="btn-interactive flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#202822] hover:bg-[#2B352E] text-slate-200 border border-[#3A473E] transition cursor-pointer"
                    title="Download teaching log template"
                  >
                    <Download className="w-3.5 h-3.5 text-[#9BAE9C]" />
                    <span>Template</span>
                  </button>
                  <button
                    onClick={() => {
                      setModuleImportInitialType('teaching_log');
                      setIsModuleImportModalOpen(true);
                    }}
                    className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] text-white transition shadow-sm cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Bulk Import</span>
                  </button>
                </div>
              </div>

              {/* Card 4: Practical Tracker */}
              <div className="bg-[#2B352E] border border-[#3A473E] hover:border-[#9BAE9C]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#9BAE9C]/15 border border-[#9BAE9C]/25 text-[#9BAE9C] flex items-center justify-center">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Practical Lab Tracker</h3>
                      <span className="text-[10px] text-[#9BAE9C] font-mono font-medium">Lab Skills Assessment</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">
                    Import hands-on computer lab evaluations, skill tasks, attempt numbers, scores, and completion grades.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#3A473E] mt-4 flex items-center justify-between gap-2">
                  <button
                    onClick={() => downloadPracticalTrackerTemplate()}
                    className="btn-interactive flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#202822] hover:bg-[#2B352E] text-slate-200 border border-[#3A473E] transition cursor-pointer"
                    title="Download practical tracker template"
                  >
                    <Download className="w-3.5 h-3.5 text-[#9BAE9C]" />
                    <span>Template</span>
                  </button>
                  <button
                    onClick={() => {
                      setModuleImportInitialType('practical');
                      setIsModuleImportModalOpen(true);
                    }}
                    className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] text-white transition shadow-sm cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Bulk Import</span>
                  </button>
                </div>
              </div>

              {/* Card 5: Absentee Follow-up */}
              <div className="bg-[#2B352E] border border-[#3A473E] hover:border-[#9BAE9C]/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#D97745]/10 border border-[#D97745]/25 text-[#D97745] flex items-center justify-center">
                      <UserX className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Absentee Outreach</h3>
                      <span className="text-[10px] text-[#D97745] font-mono font-medium">Guardian Follow-ups</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">
                    Import communication logs with parents, absence causes, commitments, return dates, and referrals.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#3A473E] mt-4 flex items-center justify-between gap-2">
                  <button
                    onClick={() => downloadAbsenteeFollowupTemplate()}
                    className="btn-interactive flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#202822] hover:bg-[#2B352E] text-slate-200 border border-[#3A473E] transition cursor-pointer"
                    title="Download absentee follow-up template"
                  >
                    <Download className="w-3.5 h-3.5 text-[#9BAE9C]" />
                    <span>Template</span>
                  </button>
                  <button
                    onClick={() => {
                      setModuleImportInitialType('absentee');
                      setIsModuleImportModalOpen(true);
                    }}
                    className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] text-white transition shadow-sm cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Bulk Import</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sync' && permissions.isOwner && !permissions.isStaff && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#3A473E]">
              <div>
                <h2 className="text-xl font-bold text-white">Synchronization Center</h2>
                <p className="text-xs text-slate-300">Monitor outbox operations, failed retries, and data conflicts.</p>
              </div>
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="btn-interactive bg-[#D97745] hover:bg-[#c26535] text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-sm cursor-pointer"
              >
                Open Detailed Outbox Modal
              </button>
            </div>
            <div className="bg-[#2B352E] border border-[#3A473E] rounded-2xl p-8 text-center">
              <p className="text-xs text-slate-300">
                Current sync status: <strong className="text-[#D97745]">{overallStatus}</strong>
              </p>
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="btn-interactive mt-4 bg-[#D97745] hover:bg-[#c26535] text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition shadow-md cursor-pointer"
              >
                Manage Outbox & Conflicts
              </button>
            </div>
          </div>
        )}

        {activeTab === 'tests' && permissions.isOwner && !permissions.isStaff && <InteractiveTestSuiteModal />}

        {activeTab === 'settings' && permissions.isOwner && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#3A473E]">
              <div>
                <h2 className="text-xl font-bold text-white">System Settings</h2>
                <p className="text-xs text-slate-300">Manage Supabase cloud connection, institution setup, and testing modes.</p>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="btn-interactive bg-[#D97745] hover:bg-[#c26535] text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-sm cursor-pointer"
              >
                Open Settings Panel
              </button>
            </div>
          </div>
        )}
      </main>
      </div>

      {/* Floating Offline Notification if disconnected */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-[#2B352E]/95 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-amber-300 shadow-xl border border-amber-600/40">
          <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
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

      <ModuleImportModal
        isOpen={isModuleImportModalOpen}
        initialModuleType={moduleImportInitialType}
        onClose={() => setIsModuleImportModalOpen(false)}
        onImportComplete={() => {
          setStudentsVersion((v) => v + 1);
        }}
      />

      <SyncDetailsModal
        isOpen={isSyncModalOpen && permissions.isOwner}
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

      <MonthlyReportModal
        isOpen={isMonthlyReportModalOpen}
        onClose={() => setIsMonthlyReportModalOpen(false)}
      />

      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirmLogout={async (forceClear) => {
          await logout(forceClear);
          setIsLogoutModalOpen(false);
        }}
      />

      {legacyInspection && isMasterOwner && session?.user && (
        <LegacyDataLinkingModal
          isOpen={isLegacyLinkingModalOpen}
          ownerEmail={session.user.email}
          ownerId={session.user.id}
          inspection={legacyInspection}
          onLinkSuccess={() => {
            setStudentsVersion((v) => v + 1);
            setIsLegacyLinkingModalOpen(false);
          }}
          onDismiss={() => {
            setIsLegacyLinkingModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
