import React, { useEffect, useState } from 'react';
import { Student, AttendanceRecord, ClassLevel } from '../../types/student';
import { getAllStudents, getAllAttendanceRecords, getOutboxOperations } from '../../services/db';
import { sanitizeCorruptedStudents, compareStudentsByRoll } from '../../services/recordService';
import { useSync } from '../../hooks/useSync';
import { useAuth } from '../../context/AuthContext';
import { useSchoolProfile, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';
import { OutboxOperation } from '../../types/sync';
import {
  Users,
  CalendarCheck,
  CloudUpload,
  FileSpreadsheet,
  PlusCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Search,
  ArrowRight,
  BookOpen,
  Award,
  UserX,
  MessageCircle,
} from 'lucide-react';
import { ActiveTab } from '../layout/Navbar';
import { ClassTabs } from '../common/ClassTabs';
import { calculateStudentAttendanceAlerts, StudentAttendanceAlert } from '../../services/alertService';
import { StudentDetailModal } from '../students/StudentDetailModal';
import { WhatsAppAlertModal } from '../absentee/WhatsAppAlertModal';
import { MonthlyReportModal } from '../reports/MonthlyReportModal';
import { getWorkspacePermissions } from '../../services/permissionService';

interface DashboardViewProps {
  onNavigate: (tab: ActiveTab) => void;
  onOpenNewStudentModal: () => void;
  onOpenSyncDetails: () => void;
  onOpenImport?: () => void;
  refreshKey?: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenNewStudentModal,
  onOpenSyncDetails,
  onOpenImport,
  refreshKey,
}) => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);
  const { profile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);
  const { overallStatus, pendingCount, failedCount, conflictedCount, lastSyncedAt, triggerSync } = useSync();

  const [students, setStudents] = useState<Student[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [recentOutbox, setRecentOutbox] = useState<OutboxOperation[]>([]);
  const [, setLoading] = useState(true);
  const [corruptedCleanedCount, setCorruptedCleanedCount] = useState<number>(0);

  // Smart Alerts & History Modals state
  const [alertsMap, setAlertsMap] = useState<Map<string, StudentAttendanceAlert>>(new Map());
  const [isMonthlyReportOpen, setIsMonthlyReportOpen] = useState(false);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);
  const [whatsAppAlertStudent, setWhatsAppAlertStudent] = useState<Student | null>(null);

  // Filters for Dashboard Student Roster
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<ClassLevel | 'All'>('All');

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    async function loadData() {
      try {
        // Automatically purge any stale corrupted students where School Name was saved as Student Name
        const cleaned = await sanitizeCorruptedStudents();
        if (cleaned > 0) {
          setCorruptedCleanedCount(cleaned);
        }

        const studentList = await getAllStudents();

        // Strict defensive guard: Never render a school title as a student name
        const cleanStudents = studentList.filter((s) => {
          const up = (s.name || '').toUpperCase().trim();
          return (
            !up.startsWith('GBHS') &&
            !up.startsWith('GOVT') &&
            !up.startsWith('GOVERNMENT') &&
            !up.includes('HIGH SCHOOL') &&
            !up.includes('JAM YOUSF') &&
            !up.includes('JAM YOUSUF') &&
            !up.includes('COLONY')
          );
        });

        setStudents(cleanStudents);

        // Load all attendance records to calculate comprehensive smart alerts and today's markings across all classes
        const allAtt = await getAllAttendanceRecords();
        const todayRecords = allAtt.filter((a) => a.date === todayStr);
        setTodayAttendance(todayRecords);

        const alerts = calculateStudentAttendanceAlerts(cleanStudents, allAtt, todayStr);
        setAlertsMap(alerts);

        const ops = await getOutboxOperations();
        setRecentOutbox(ops.slice(-5).reverse());
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();

    const handleReactivity = () => {
      loadData();
    };
    window.addEventListener('gbhs_records_imported', handleReactivity);
    window.addEventListener('gbhs_students_changed', handleReactivity);
    window.addEventListener('gbhs_attendance_changed', handleReactivity);
    window.addEventListener('gbhs_dashboard_refresh', handleReactivity);
    return () => {
      window.removeEventListener('gbhs_records_imported', handleReactivity);
      window.removeEventListener('gbhs_students_changed', handleReactivity);
      window.removeEventListener('gbhs_attendance_changed', handleReactivity);
      window.removeEventListener('gbhs_dashboard_refresh', handleReactivity);
    };
  }, [todayStr, pendingCount, refreshKey]);

  // Dynamic class categories based on active school profile and enrolled learners
  const configuredClasses = sortClasses(sanitizeClasses(profile.classes));
  const enrolledClassNames = Array.from(new Set(students.map((s) => s.class).filter(Boolean)));
  const displayClasses = sortClasses(Array.from(new Set([...configuredClasses, ...enrolledClassNames])));

  const dynamicClassesTotalLabel = displayClasses
    .map((c) => c.replace(/^Class\s*/i, ''))
    .join(', ');

  const dynamicClassesFullLabel = displayClasses.join(', ');
  const operatorDisplayName = session?.user?.fullName || session?.user?.email || 'Authorized Operator';

  const classCountsMap: Record<string, number> = {};
  displayClasses.forEach((cls) => {
    classCountsMap[cls] = students.filter((s) => s.class === cls).length;
  });

  const presentCount = todayAttendance.filter((a) => a.status === 'Present').length;
  const absentCount = todayAttendance.filter((a) => a.status === 'Absent').length;
  const leaveCount = todayAttendance.filter((a) => a.status === 'Leave').length;
  const lateCount = todayAttendance.filter((a) => a.status === 'Late').length;

  const totalMarked = todayAttendance.length;
  const presentPct = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

  // Filter students for the dashboard table
  const filteredStudents = students
    .filter((s) => {
      if (selectedClass !== 'All' && s.class !== selectedClass) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          s.name.toLowerCase().includes(q) ||
          s.fatherName.toLowerCase().includes(q) ||
          s.rollNo.toLowerCase().includes(q) ||
          s.admissionNo.toLowerCase().includes(q) ||
          (s.section && `section ${s.section}`.toLowerCase().includes(q)) ||
          (s.section && `sec ${s.section}`.toLowerCase().includes(q)) ||
          (s.bFormNo && s.bFormNo.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort(compareStudentsByRoll);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* =========================================================================
          SECTION 1: HERO BANNER WITH SCHOOL CREST, OPERATOR & PRIMARY ACTIONS
          ========================================================================= */}
      <div className="rounded-2xl border border-[#3D4A41] bg-[#2B352E] p-4 sm:p-6 shadow-sm transition-all duration-150">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5">
          {/* Left: Emblem Crest & Identification */}
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden border-2 border-[#3D4A41] ring-2 ring-[#D97745]/25 shrink-0 bg-[#202822] flex items-center justify-center shadow-inner">
              <img
                src={profile.logoUrl || '/custom-logo.jpg'}
                alt={profile.schoolShortName || profile.schoolName}
                className="w-full h-full object-cover rounded-2xl"
                onError={(e) => {
                  (e.currentTarget as any).src = '/custom-logo.jpg';
                }}
              />
            </div>

            <div className="min-w-0 flex-1">
              {/* Dynamic Header & Console Title */}
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#D97745]">
                <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#D97745]" />
                <span className="truncate">
                  {profile.schoolShortName || profile.schoolName}{' '}
                  {profile.consoleTitle ? profile.consoleTitle.toUpperCase() : 'COMPUTER OPERATOR WORKSPACE'}
                </span>
              </div>

              <h1 className="text-lg sm:text-2xl font-black text-[#F6F3EA] mt-0.5 tracking-tight truncate">
                Class Record Management
              </h1>

              {/* Dynamic Operator Row */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-[#9BAE9C] mt-1">
                <span className="hidden xs:inline">Authorized Operator:</span>
                <span className="text-[#F6F3EA] font-semibold truncate max-w-[150px] xs:max-w-none">{operatorDisplayName}</span>
                {session?.user?.fullName && session?.user?.email && (
                  <span className="text-[11px] text-[#9BAE9C] hidden md:inline">
                    ({session.user.email})
                  </span>
                )}

                {/* Role Tier Badges */}
                {permissions.tier === 'master_owner' ? (
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#D97745]/20 text-[#E48B5D] border border-[#D97745]/40 whitespace-nowrap">
                    Master Owner
                  </span>
                ) : permissions.tier === 'approved_staff' ? (
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                    Approved Staff (Read-Only)
                  </span>
                ) : (
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#9BAE9C]/20 text-[#B4C4B5] border border-[#9BAE9C]/40 whitespace-nowrap">
                    Personal User
                  </span>
                )}

                {/* Custom Operator Title for Master Owner */}
                {permissions.tier === 'master_owner' && profile.operatorTitle && (
                  <span className="text-xs text-[#E48B5D] font-medium hidden lg:inline">
                    • {profile.operatorTitle}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Focused Primary Action Controls (Thumb-friendly on mobile) */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-2.5 pt-2 lg:pt-0 shrink-0">
            <button
              type="button"
              onClick={onOpenNewStudentModal}
              className="btn-interactive group flex items-center justify-center gap-1.5 sm:gap-2 bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white text-xs font-semibold px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs cursor-pointer min-h-[42px]"
            >
              <PlusCircle className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
              <span>Enroll Student</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="btn-interactive group flex items-center justify-center gap-1.5 sm:gap-2 bg-[#202822] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#9BAE9C]/50 text-xs font-semibold px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs cursor-pointer min-h-[42px]"
            >
              <CalendarCheck className="w-4 h-4 text-[#D97745] shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span>Mark Attendance</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: DYNAMIC SAAS KPI CARDS GRID (ALL ACTIVE CLASSES)
          ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3.5">
        {/* Total Students KPI Card */}
        <div
          onClick={() => onNavigate('students')}
          className="btn-interactive bg-[#2B352E] border border-[#3D4A41] hover:border-[#D97745]/50 hover:bg-[#344038]/50 rounded-xl p-3.5 sm:p-4 group cursor-pointer shadow-xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#9BAE9C]">Total Enrolled</span>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#D97745]/15 border border-[#D97745]/30 text-[#D97745] flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-2xl font-black text-[#F6F3EA] tracking-tight">{students.length}</span>
              <span className="text-[11px] sm:text-xs text-[#9BAE9C] font-medium">Students</span>
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-center justify-between text-[10px] sm:text-[11px] text-[#9BAE9C] border-t border-[#3D4A41]/70 pt-2">
            <span className="truncate">{dynamicClassesTotalLabel} total</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#9BAE9C] group-hover:translate-x-1 transition-transform duration-200 shrink-0" />
          </div>
        </div>

        {/* Dynamic Class KPI Cards */}
        {displayClasses.map((className, idx) => {
          const count = students.filter((s) => s.class === className).length;
          const badgeStyles = [
            'bg-[#D97745]/15 text-[#D97745] border-[#D97745]/30',
            'bg-[#9BAE9C]/15 text-[#9BAE9C] border-[#9BAE9C]/30',
            'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
            'bg-[#B4C4B5]/15 text-[#B4C4B5] border-[#B4C4B5]/30',
            'bg-amber-500/15 text-amber-400 border-amber-500/30',
          ];
          const badgeClass = badgeStyles[idx % badgeStyles.length];
          const gradeNum = className.replace(/^Class\s*/i, '');

          return (
            <div
              key={className}
              onClick={() => onNavigate('students')}
              className="btn-interactive bg-[#2B352E] border border-[#3D4A41] hover:border-[#9BAE9C]/60 hover:bg-[#344038]/50 rounded-xl p-3.5 sm:p-4 group cursor-pointer shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#9BAE9C] truncate">{className}</span>
                  <span className={`text-[9px] sm:text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border shrink-0 ${badgeClass}`}>
                    {/^\d+$/.test(gradeNum) ? `Grade ${gradeNum}` : className}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5 sm:gap-2">
                  <span className="text-xl sm:text-2xl font-black text-[#F6F3EA] tracking-tight">{count}</span>
                  <span className="text-[11px] sm:text-xs text-[#9BAE9C] font-medium">Students</span>
                </div>
              </div>
              <div className="mt-2.5 sm:mt-3 flex items-center justify-between text-[10px] sm:text-[11px] text-[#9BAE9C] border-t border-[#3D4A41]/70 pt-2">
                <span>Active Roster</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#9BAE9C] group-hover:translate-x-1 transition-transform duration-200 shrink-0" />
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================================================================
          SECTION 3: SMART ATTENDANCE ALERTS (<75% / CONSECUTIVE UNEXCUSED ABSENCES)
          ========================================================================= */}
      {(() => {
        const atRiskStudents = Array.from(alertsMap.values())
          .filter((a) => a.isLowAttendance || a.isAtRiskAbsence)
          .sort((a, b) => a.attendancePercentage - b.attendancePercentage);

        if (atRiskStudents.length === 0) return null;

        return (
          <div className="rounded-2xl border border-rose-900/50 bg-[#2B352E] p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#3D4A41]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F6F3EA] flex items-center gap-2 flex-wrap">
                    <span>Low Attendance Smart Alerts (&lt; 75%)</span>
                    <span className="text-[10px] bg-rose-950/90 text-rose-300 border border-rose-800/80 px-2 py-0.5 rounded-full font-bold">
                      {atRiskStudents.length} At Risk
                    </span>
                  </h3>
                  <p className="text-xs text-[#9BAE9C] mt-0.5">
                    Automated smart alert detecting students with attendance below 75% or 3+ consecutive unexcused absences.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMonthlyReportOpen(true)}
                className="btn-interactive group flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#202822] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#D97745]/60 cursor-pointer self-start sm:self-auto shrink-0 shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#D97745] transition-transform duration-200 group-hover:scale-110" />
                <span>Monthly Summary</span>
              </button>
            </div>

            {/* At-Risk Students Grid (Top 6 students) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {atRiskStudents.slice(0, 6).map((item) => {
                const studentObj = students.find((s) => s.id === item.studentId);
                return (
                  <div
                    key={item.studentId}
                    className="bg-[#202822] border border-[#3D4A41] hover:border-rose-800/80 rounded-xl p-3 flex flex-col justify-between transition-colors duration-150 shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-[#F6F3EA] text-xs truncate">{item.studentName}</p>
                          <p className="text-[11px] text-[#9BAE9C] mt-0.5">
                            Roll #{item.rollNo} • <span className="text-[#D97745] font-semibold">{item.class}</span>
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-800/80 shrink-0">
                          {item.attendancePercentage}% Att
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="text-rose-300 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/60 font-medium text-[10px]">
                          {item.alertBadgeText}
                        </span>
                        <span className="text-[#9BAE9C] font-mono text-[10px]">
                          {item.presentDays}P / {item.totalDays}D
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-[#3D4A41]/70 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (studentObj) setSelectedStudentForDetail(studentObj);
                        }}
                        className="btn-interactive text-xs text-[#9BAE9C] hover:text-[#F6F3EA] font-medium px-2 py-1 rounded-lg hover:bg-[#2B352E] cursor-pointer"
                      >
                        View Profile
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (studentObj) setWhatsAppAlertStudent(studentObj);
                        }}
                        className="btn-interactive group flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 cursor-pointer"
                        title="Send WhatsApp notice to guardian"
                      >
                        <MessageCircle className="w-3 h-3 text-emerald-400 transition-transform duration-200 group-hover:scale-110" />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          SECTIONS 4 & 5: HIDDEN PER USER REQUEST (CLEAN DASHBOARD, NO REDUNDANT SCROLLING)
          All modules and rosters are accessible directly from the smart animated sidebar.
          ========================================================================= */}
      <div className="hidden" aria-hidden="true">
        {/* SECTION 4: 5 OFFICIAL SCHOOL RECORD MODULES */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#D97745] shadow-xs"></span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#9BAE9C]">
                Official School Record Modules ({dynamicClassesFullLabel})
              </h3>
            </div>
            <span className="text-[11px] text-[#9BAE9C] font-mono font-medium">5 Modules</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {/* Module 1: Students */}
            <div
              onClick={() => onNavigate('students')}
              className="btn-interactive p-3 rounded-xl bg-[#2B352E] border border-[#3D4A41] hover:border-[#D97745]/50 hover:bg-[#344038]/60 cursor-pointer group flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#D97745]/15 border border-[#D97745]/30 text-[#D97745] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#F6F3EA] group-hover:text-[#D97745] transition-colors duration-150 truncate">Master Students</span>
                    <span className="text-[9px] font-mono font-bold text-[#D97745] px-1 py-0.2 rounded bg-[#D97745]/20 border border-[#D97745]/40 shrink-0">M1</span>
                  </div>
                  <span className="text-[11px] text-[#9BAE9C] block truncate">{students.length} Learners</span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BAE9C] group-hover:translate-x-1 transition-transform duration-200 shrink-0 ml-1" />
            </div>

            {/* Module 2: Attendance */}
            <div
              onClick={() => onNavigate('attendance')}
              className="btn-interactive p-3 rounded-xl bg-[#2B352E] border border-[#3D4A41] hover:border-[#9BAE9C]/60 hover:bg-[#344038]/60 cursor-pointer group flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#9BAE9C]/15 border border-[#9BAE9C]/30 text-[#9BAE9C] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#F6F3EA] group-hover:text-[#9BAE9C] transition-colors duration-150 truncate">Daily Attendance</span>
                    <span className="text-[9px] font-mono font-bold text-[#9BAE9C] px-1 py-0.2 rounded bg-[#9BAE9C]/20 border border-[#9BAE9C]/40 shrink-0">M2</span>
                  </div>
                  <span className="text-[11px] text-[#9BAE9C] block truncate">{dynamicClassesFullLabel}</span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BAE9C] group-hover:translate-x-1 transition-transform duration-200 shrink-0 ml-1" />
            </div>

            {/* Module 3: Teaching Log */}
            <div
              onClick={() => onNavigate('teaching')}
              className="btn-interactive p-3 rounded-xl bg-[#2B352E] border border-[#3D4A41] hover:border-[#D97745]/50 hover:bg-[#344038]/60 cursor-pointer group flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#D97745]/15 border border-[#D97745]/30 text-[#D97745] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#F6F3EA] group-hover:text-[#D97745] transition-colors duration-150 truncate">Teaching Log</span>
                    <span className="text-[9px] font-mono font-bold text-[#D97745] px-1 py-0.2 rounded bg-[#D97745]/20 border border-[#D97745]/40 shrink-0">M3</span>
                  </div>
                  <span className="text-[11px] text-[#9BAE9C] block truncate">Daily Logs</span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BAE9C] group-hover:translate-x-1 transition-transform duration-200 shrink-0 ml-1" />
            </div>

            {/* Module 4: Practical Progress */}
            <div
              onClick={() => onNavigate('practical')}
              className="btn-interactive p-3 rounded-xl bg-[#2B352E] border border-[#3D4A41] hover:border-emerald-500/50 hover:bg-[#344038]/60 cursor-pointer group flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <Award className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#F6F3EA] group-hover:text-emerald-300 transition-colors duration-150 truncate">Practical Progress</span>
                    <span className="text-[9px] font-mono font-bold text-emerald-400 px-1 py-0.2 rounded bg-emerald-950/80 border border-emerald-800 shrink-0">M4</span>
                  </div>
                  <span className="text-[11px] text-[#9BAE9C] block truncate">Skills Tracker</span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BAE9C] group-hover:translate-x-1 transition-transform duration-200 shrink-0 ml-1" />
            </div>

            {/* Module 5: Absentee Follow-up */}
            <div
              onClick={() => onNavigate('absentee')}
              className="btn-interactive p-3 rounded-xl bg-[#2B352E] border border-[#3D4A41] hover:border-amber-500/50 hover:bg-[#344038]/60 cursor-pointer group flex items-center justify-between shadow-xs col-span-2 sm:col-span-1"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                  <UserX className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#F6F3EA] group-hover:text-amber-300 transition-colors duration-150 truncate">Absentee Follow-up</span>
                    <span className="text-[9px] font-mono font-bold text-amber-400 px-1 py-0.2 rounded bg-amber-950/80 border border-amber-800 shrink-0">M5</span>
                  </div>
                  <span className="text-[11px] text-[#9BAE9C] block truncate">Follow-up Logs</span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#9BAE9C] group-hover:translate-x-1 transition-transform duration-200 shrink-0 ml-1" />
            </div>
          </div>
        </div>

        {/* SECTION 5: LIVE STUDENT MASTER ROSTER SECTION */}
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#3D4A41]">
            <div>
              <h2 className="text-base font-bold text-[#F6F3EA] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#D97745]" />
                <span>Student Master Roster</span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#D97745]/15 text-[#E48B5D] border border-[#D97745]/30">
                  {students.length} Students
                </span>
              </h2>
              <p className="text-xs text-[#9BAE9C] mt-0.5">
                Real-time student records imported from your Excel spreadsheet and saved locally.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsMonthlyReportOpen(true)}
                className="btn-interactive group flex items-center gap-1.5 bg-[#202822] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#D97745]/50 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs cursor-pointer min-h-[36px]"
                title="Generate Monthly Summary & Performance Report"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#D97745] transition-transform duration-200 group-hover:scale-110" />
                <span>Monthly Report</span>
              </button>

              {permissions.canImport && (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenImport) onOpenImport();
                    else onNavigate('import');
                  }}
                  className="btn-interactive group flex items-center gap-1.5 bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs cursor-pointer min-h-[36px]"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />
                  <span>Import Excel</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onNavigate('students')}
                className="btn-interactive group flex items-center gap-1.5 bg-[#202822] hover:bg-[#344038] text-[#9BAE9C] hover:text-[#F6F3EA] border border-[#3D4A41] px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer min-h-[36px]"
              >
                <span>Full Directory</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          {/* Search & Class Tabs Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <ClassTabs
              selectedClass={selectedClass}
              onSelectClass={(c) => setSelectedClass(c)}
              classes={displayClasses}
              counts={{
                all: students.length,
                ...classCountsMap,
              }}
            />

            <div className="relative sm:w-72">
              <Search className="w-3.5 h-3.5 text-[#9BAE9C] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student name or roll..."
                className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl pl-8 pr-3 py-2 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745] transition-colors duration-150 min-h-[38px]"
              />
            </div>
          </div>

          {/* Notice if corrupted records were automatically purged */}
          {corruptedCleanedCount > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-xs text-amber-300 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>{corruptedCleanedCount} Corrupted Records Purged:</strong> Old records with School Name saved as Student Name have been automatically removed. Click <strong>Import Excel</strong> to import your actual student roster cleanly.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenImport) onOpenImport();
                    else onNavigate('import');
                  }}
                  className="btn-interactive bg-[#D97745] hover:bg-[#C56837] text-white font-bold px-2.5 py-1 rounded-lg text-[11px] cursor-pointer shadow-xs"
                >
                  Import Excel Now
                </button>
                <button
                  type="button"
                  onClick={() => setCorruptedCleanedCount(0)}
                  className="btn-interactive text-amber-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-amber-900/40 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Dashboard Students Table: Strictly 13 Columns in Exact Order */}
          <div className="border border-[#3D4A41] rounded-xl overflow-hidden bg-[#202822]/80 shadow-inner">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-12 h-12 rounded-2xl bg-[#2B352E] text-[#9BAE9C] flex items-center justify-center mx-auto mb-3 border border-[#3D4A41]">
                  <Users className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-[#F6F3EA]">No student records found</p>
                <p className="text-xs text-[#9BAE9C] mt-1 max-w-sm mx-auto">
                  {students.length === 0
                    ? 'Your database is currently empty. Click "Import Excel" to upload your master sheet.'
                    : 'No student matches your search query or class filter.'}
                </p>
                {students.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenImport) onOpenImport();
                      else onNavigate('import');
                    }}
                    className="btn-interactive group mt-4 inline-flex items-center gap-1.5 bg-[#D97745] hover:bg-[#C56837] text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer shadow-xs"
                  >
                    <FileSpreadsheet className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                    <span>Import Excel Roster Now</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[520px]">
                <table className="w-full text-left text-xs text-[#CCD6CD] whitespace-nowrap">
                  <thead className="bg-[#2B352E] backdrop-blur-md text-[#9BAE9C] uppercase text-[10px] font-semibold sticky top-0 border-b border-[#3D4A41] z-10 shadow-xs">
                    <tr>
                      <th className="px-3.5 py-2.5">1. S#</th>
                      <th className="px-3.5 py-2.5">2. Roll Num</th>
                      <th className="px-3.5 py-2.5">3. District</th>
                      <th className="px-3.5 py-2.5">4. School Name</th>
                      <th className="px-3.5 py-2.5">5. Trade</th>
                      <th className="px-3.5 py-2.5">6. Name of Learner</th>
                      <th className="px-3.5 py-2.5">7. Father Name</th>
                      <th className="px-3.5 py-2.5">8. Gender</th>
                      <th className="px-3.5 py-2.5">9. DOB</th>
                      <th className="px-3.5 py-2.5">10. Class</th>
                      <th className="px-3.5 py-2.5">11. Date of Center Beginning</th>
                      <th className="px-3.5 py-2.5">12. Guardian Contact</th>
                      <th className="px-3.5 py-2.5">13. Registerd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3D4A41]/70">
                    {filteredStudents.map((s, idx) => {
                      const isReg =
                        (s.registeredStatus && s.registeredStatus.toLowerCase().includes('reg')) ||
                        s.status === 'Active';
                      return (
                        <tr key={s.id} className="hover:bg-[#344038]/60 transition-colors duration-100">
                          <td className="px-3.5 py-2.5 font-mono text-[#9BAE9C] font-semibold">
                            {s.serialNo || idx + 1}
                          </td>
                          <td className="px-3.5 py-2.5 font-bold text-[#F6F3EA] font-mono">
                            {s.rollNo}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#CCD6CD]">
                            {s.district || 'Lasbela'}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#CCD6CD] font-medium">
                            {s.schoolName || profile.schoolShortName || 'GBHS Jam Yousuf Colony'}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#CCD6CD]">
                            {s.trade || 'Computer Operator'}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedStudentForDetail(s)}
                                className="font-bold text-[#F6F3EA] hover:text-[#D97745] hover:underline transition-colors text-left cursor-pointer"
                                title="Click to view full student profile and attendance history"
                              >
                                {s.name}
                              </button>
                              {(() => {
                                const alert = alertsMap.get(s.id);
                                if (alert && (alert.isLowAttendance || alert.isAtRiskAbsence)) {
                                  return (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-950/90 text-rose-300 border border-rose-800/80"
                                      title={alert.alertBadgeText}
                                    >
                                      {alert.attendancePercentage}%
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-[#CCD6CD]">
                            {s.fatherName}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#9BAE9C]">
                            {s.gender || 'Male'}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#9BAE9C] font-mono">
                            {s.dob || '—'}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#2B352E] text-[#D97745] border border-[#3D4A41]">
                                {s.class}
                              </span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#2B352E] text-[#9BAE9C] border border-[#3D4A41]">
                                Sec {s.section || 'A'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-[#9BAE9C] font-mono">
                            {s.dateOfCenterBeginning || s.admissionDate || '—'}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#CCD6CD] font-mono">
                            {s.guardianContact || s.phone || '—'}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                s.status === 'Active'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : s.status === 'Withdrawn'
                                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                  : s.status === 'Transferred'
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'bg-[#2B352E] text-[#9BAE9C] border border-[#3D4A41]'
                              }`}
                            >
                              {s.status || s.registeredStatus || (isReg ? 'Active' : 'Inactive')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 6: ATTENDANCE & CLOUD SYNC HEALTH
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance Summary Card */}
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#3D4A41]">
              <div>
                <h2 className="text-sm font-bold text-[#F6F3EA] flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-[#D97745]" />
                  <span>Today's Attendance Status</span>
                </h2>
                <p className="text-xs text-[#9BAE9C] mt-0.5">Date: {todayStr} • {dynamicClassesFullLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="btn-interactive group text-xs font-semibold text-[#D97745] hover:text-[#E48B5D] flex items-center gap-1 cursor-pointer px-2 py-1 rounded-lg hover:bg-[#202822]"
              >
                <span>Mark Register</span>
                <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </div>

            {/* 4 Attendance Status Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3.5">
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-3 text-center">
                <span className="text-emerald-400 font-semibold uppercase tracking-wider text-[10px]">Present</span>
                <p className="text-2xl font-black text-[#F6F3EA] mt-0.5">{presentCount}</p>
              </div>
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-3 text-center">
                <span className="text-rose-400 font-semibold uppercase tracking-wider text-[10px]">Absent</span>
                <p className="text-2xl font-black text-[#F6F3EA] mt-0.5">{absentCount}</p>
              </div>
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-3 text-center">
                <span className="text-amber-400 font-semibold uppercase tracking-wider text-[10px]">On Leave</span>
                <p className="text-2xl font-black text-[#F6F3EA] mt-0.5">{leaveCount}</p>
              </div>
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-3 text-center">
                <span className="text-[#D97745] font-semibold uppercase tracking-wider text-[10px]">Late</span>
                <p className="text-2xl font-black text-[#F6F3EA] mt-0.5">{lateCount}</p>
              </div>
            </div>
          </div>

          {/* Progress Bar & Rate */}
          <div className="mt-4 pt-3 border-t border-[#3D4A41]">
            <div className="flex justify-between text-xs text-[#9BAE9C] mb-1.5">
              <span className="font-medium">Attendance Rate</span>
              <span className="font-semibold text-[#F6F3EA]">
                {totalMarked > 0 ? `${presentPct}% Present (${totalMarked} / ${students.length} marked)` : 'Not taken yet'}
              </span>
            </div>
            <div className="w-full h-2 bg-[#202822] rounded-full overflow-hidden flex shadow-inner">
              <div style={{ width: `${presentPct}%` }} className="bg-emerald-500 h-full transition-all duration-200" />
              <div
                style={{ width: `${totalMarked > 0 ? (absentCount / totalMarked) * 100 : 0}%` }}
                className="bg-rose-500 h-full transition-all duration-200"
              />
              <div
                style={{ width: `${totalMarked > 0 ? (leaveCount / totalMarked) * 100 : 0}%` }}
                className="bg-amber-500 h-full transition-all duration-200"
              />
            </div>
          </div>
        </div>

        {/* Cloud Sync & Outbox Status Card */}
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#3D4A41]">
              <div>
                <h2 className="text-sm font-bold text-[#F6F3EA] flex items-center gap-2">
                  <CloudUpload className="w-4 h-4 text-[#D97745]" />
                  <span>Cloud Sync & Outbox Health</span>
                </h2>
                <p className="text-xs text-[#9BAE9C] mt-0.5">IndexedDB Queue & Remote Synchronization</p>
              </div>
              <button
                type="button"
                onClick={onOpenSyncDetails}
                className="btn-interactive text-xs text-[#D97745] hover:text-[#E48B5D] font-medium cursor-pointer px-2 py-1 rounded-lg hover:bg-[#202822]"
              >
                View Details
              </button>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3.5 text-center">
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-2.5">
                <span className="text-[10px] text-[#9BAE9C] uppercase font-semibold">Status</span>
                <p className="text-xs font-bold text-[#F6F3EA] mt-1 capitalize truncate">{overallStatus}</p>
              </div>
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-2.5">
                <span className="text-[10px] text-[#9BAE9C] uppercase font-semibold">Pending</span>
                <p className={`text-base font-black mt-0.5 ${pendingCount > 0 ? 'text-amber-400' : 'text-[#F6F3EA]'}`}>{pendingCount}</p>
              </div>
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-2.5">
                <span className="text-[10px] text-[#9BAE9C] uppercase font-semibold">Failed / Retry</span>
                <p className={`text-base font-black mt-0.5 ${failedCount > 0 ? 'text-rose-400' : 'text-[#F6F3EA]'}`}>{failedCount}</p>
              </div>
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-2.5">
                <span className="text-[10px] text-[#9BAE9C] uppercase font-semibold">Conflicts</span>
                <p className={`text-base font-black mt-0.5 ${conflictedCount > 0 ? 'text-amber-400' : 'text-[#F6F3EA]'}`}>{conflictedCount}</p>
              </div>
            </div>

            {/* Recent Outbox Operations Snippet */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-[#9BAE9C] mb-1.5">
                <span className="font-medium flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-[#9BAE9C]" />
                  Recent Queue
                </span>
                <span className="font-mono text-[10px] text-[#9BAE9C]">
                  Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                </span>
              </div>
              <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-2 space-y-1 max-h-24 overflow-y-auto no-scrollbar">
                {recentOutbox.length === 0 ? (
                  <p className="text-[11px] text-[#9BAE9C] text-center py-1">No queued outbox operations. All records synced.</p>
                ) : (
                  recentOutbox.slice(0, 3).map((op) => (
                    <div key={op.opId} className="flex items-center justify-between text-[11px] py-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`px-1 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                            op.operationType === 'CREATE'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : op.operationType === 'UPDATE'
                              ? 'bg-[#D97745]/15 text-[#D97745] border border-[#D97745]/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {op.operationType}
                        </span>
                        <span className="font-medium text-[#CCD6CD] capitalize truncate">
                          {op.entityType}: {(op.payload as any)?.name || (op.payload as any)?.studentName || op.entityId}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#9BAE9C] font-mono shrink-0 ml-2">
                        {new Date(op.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-[#3D4A41]">
            <button
              type="button"
              onClick={triggerSync}
              className="btn-interactive group w-full flex items-center justify-center gap-2 bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white font-semibold text-xs py-2.5 rounded-xl cursor-pointer shadow-xs min-h-[40px]"
            >
              <CloudUpload className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />
              <span>Trigger Sync Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 7: MODALS (MONTHLY REPORT, STUDENT DETAIL, WHATSAPP ALERT)
          ========================================================================= */}
      <MonthlyReportModal
        isOpen={isMonthlyReportOpen}
        onClose={() => setIsMonthlyReportOpen(false)}
        initialClass={selectedClass}
      />

      {selectedStudentForDetail && (
        <StudentDetailModal
          student={selectedStudentForDetail}
          onClose={() => setSelectedStudentForDetail(null)}
          onOpenWhatsAppAlert={(s) => setWhatsAppAlertStudent(s)}
        />
      )}

      {whatsAppAlertStudent && (
        <WhatsAppAlertModal
          isOpen={Boolean(whatsAppAlertStudent)}
          onClose={() => setWhatsAppAlertStudent(null)}
          studentName={whatsAppAlertStudent.name}
          rollNo={whatsAppAlertStudent.rollNo}
          classLevel={whatsAppAlertStudent.class}
          guardianPhone={whatsAppAlertStudent.guardianContact || whatsAppAlertStudent.phone || ''}
          date={todayStr}
          absenceCount={alertsMap.get(whatsAppAlertStudent.id)?.consecutiveAbsences || 1}
          reason={alertsMap.get(whatsAppAlertStudent.id)?.alertBadgeText || 'Low attendance notification'}
        />
      )}
    </div>
  );
};
