import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Student, AttendanceRecord, ClassLevel, Section, AttendanceStatus } from '../../types/student';
import { getStudentsByClass, getAttendanceByDateAndClass, getAllAttendanceRecords } from '../../services/db';
import {
  saveBulkAttendance,
  validateAttendanceEnrollmentDate,
  AttendanceEnrollmentValidation,
} from '../../services/recordService';
import { useAuth } from '../../context/AuthContext';
import {
  CalendarCheck,
  Calendar,
  Check,
  X,
  Clock,
  Coffee,
  Save,
  CheckCheck,
  AlertTriangle,
  Users,
  Eye,
  FileSpreadsheet,
  MessageCircle,
  Download,
  Upload,
  History,
} from 'lucide-react';
import { getWorkspacePermissions } from '../../services/permissionService';
import { ExportAttendanceModal } from './ExportAttendanceModal';
import { calculateStudentAttendanceAlerts, StudentAttendanceAlert } from '../../services/alertService';
import { StudentDetailModal } from '../students/StudentDetailModal';
import { WhatsAppAlertModal } from '../absentee/WhatsAppAlertModal';
import { MonthlyReportModal } from '../reports/MonthlyReportModal';
import { useSchoolProfile, DEFAULT_CLASSES, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';
import { downloadAttendanceTemplate } from '../../services/bulkModuleImportService';
import { ModuleImportModal } from '../import/ModuleImportModal';
import { ClassSelector } from '../common/ClassSelector';

export const AttendanceView: React.FC = () => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);
  const { profile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);

  const availableClasses = sortClasses(sanitizeClasses(profile.classes));

  const classListWithAll = ['All Classes', ...availableClasses];
  const [selectedClass, setSelectedClass] = useState<string>(() => availableClasses[0] || 'All Classes');
  const [selectedSection, setSelectedSection] = useState<Section | 'All'>('All');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    if (availableClasses.length > 0 && selectedClass !== 'All Classes' && selectedClass !== 'All' && !availableClasses.includes(selectedClass)) {
      setSelectedClass('All Classes');
    }
  }, [availableClasses, selectedClass]);

  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [originalMap, setOriginalMap] = useState<Record<string, AttendanceRecord>>({});
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isMonthlyReportOpen, setIsMonthlyReportOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showBulkOverwriteConfirm, setShowBulkOverwriteConfirm] = useState(false);
  const [showBulkMarkConfirm, setShowBulkMarkConfirm] = useState(false);

  // Smart Alerts & History Modals state
  const [alertsMap, setAlertsMap] = useState<Map<string, StudentAttendanceAlert>>(new Map());
  const [showAtRiskOnly, setShowAtRiskOnly] = useState(false);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);
  const [whatsAppAlertStudent, setWhatsAppAlertStudent] = useState<Student | null>(null);

  // Conservative conflict & historical enrollment validation prompt states
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    student: Student;
    newStatus: AttendanceStatus;
    existingStatus: AttendanceStatus;
  } | null>(null);

  // Historical attendance backfill option: includes Inactive, Withdrawn, Transferred students
  const [includeArchivedForBackfill, setIncludeArchivedForBackfill] = useState(false);
  const [pendingEnrollmentWarning, setPendingEnrollmentWarning] = useState<{
    student: Student;
    targetStatus: AttendanceStatus;
    validation: AttendanceEnrollmentValidation;
  } | null>(null);

  // Lock background scrolling whenever any warning or confirmation modal is open
  const isWarningModalOpen = Boolean(
    pendingOverwrite ||
    pendingEnrollmentWarning ||
    showBulkMarkConfirm ||
    showBulkOverwriteConfirm
  );

  useEffect(() => {
    if (isWarningModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isWarningModalOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentList, existingRecords, allRecords] = await Promise.all([
        getStudentsByClass(selectedClass),
        getAttendanceByDateAndClass(selectedDate, selectedClass),
        getAllAttendanceRecords(),
      ]);

      // Filter active students for default daily attendance, but retain inactive/withdrawn/transferred
      // students who have existing historical attendance records on this selected date, or when
      // historical backfill is explicitly enabled by the operator.
      const activeStudents = studentList.filter((s) => {
        if (s.status === 'Active') return true;
        if (existingRecords.some((rec) => rec.studentId === s.id)) return true;
        return includeArchivedForBackfill;
      });
      setStudents(activeStudents);

      const map: Record<string, AttendanceRecord> = {};
      const remMap: Record<string, string> = {};

      for (const rec of existingRecords) {
        map[rec.studentId] = rec;
        if (rec.remarks) remMap[rec.studentId] = rec.remarks;
      }

      setAttendanceMap(map);
      setOriginalMap({ ...map });
      setRemarksMap(remMap);

      // Compute smart attendance alerts scoped to selected attendance date
      const alerts = calculateStudentAttendanceAlerts(activeStudents, allRecords, selectedDate);
      setAlertsMap(alerts);
    } catch (err) {
      console.error('Failed to load attendance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSaveSuccessMsg(null);
    const handleReactivity = () => {
      loadData();
    };
    window.addEventListener('gbhs_records_imported', handleReactivity);
    window.addEventListener('gbhs_attendance_changed', handleReactivity);
    return () => {
      window.removeEventListener('gbhs_records_imported', handleReactivity);
      window.removeEventListener('gbhs_attendance_changed', handleReactivity);
    };
  }, [selectedClass, selectedDate, includeArchivedForBackfill]);

  const filteredStudents = students
    .filter((s) => selectedSection === 'All' || s.section === selectedSection)
    .filter((s) => {
      if (!showAtRiskOnly) return true;
      const alert = alertsMap.get(s.id);
      return alert && (alert.isLowAttendance || alert.isAtRiskAbsence);
    })
    .sort((a, b) => {
      const rollA = a.rollNo && !isNaN(parseInt(a.rollNo, 10)) ? parseInt(a.rollNo, 10) : null;
      const rollB = b.rollNo && !isNaN(parseInt(b.rollNo, 10)) ? parseInt(b.rollNo, 10) : null;
      if (rollA !== null && rollB !== null) return rollA - rollB;
      if (rollA !== null && rollB === null) return -1;
      if (rollA === null && rollB !== null) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

  const atRiskCount = Array.from(alertsMap.values()).filter(
    (a) =>
      a.class === selectedClass &&
      (selectedSection === 'All' || a.section === selectedSection) &&
      (a.isLowAttendance || a.isAtRiskAbsence)
  ).length;

  // Change status with conservative check & enrollment window validation
  const handleStatusClick = (student: Student, targetStatus: AttendanceStatus) => {
    if (permissions.isReadOnly) return;
    const existing = attendanceMap[student.id];

    // Check enrollment window validation (respect withdrawal & transfer dates)
    const enrollmentValidation = validateAttendanceEnrollmentDate(student, selectedDate);
    if (enrollmentValidation.isOutsideEnrollment) {
      setPendingEnrollmentWarning({
        student,
        targetStatus,
        validation: enrollmentValidation,
      });
      return;
    }

    // If student already has a recorded status and user is changing it to a different status,
    // conservatively request explicit confirmation
    if (existing && existing.status !== targetStatus) {
      setPendingOverwrite({
        student,
        newStatus: targetStatus,
        existingStatus: existing.status,
      });
      return;
    }

    applyStatusChange(student, targetStatus);
  };

  const confirmEnrollmentWarning = () => {
    if (!pendingEnrollmentWarning) return;
    const { student, targetStatus } = pendingEnrollmentWarning;
    setPendingEnrollmentWarning(null);

    const existing = attendanceMap[student.id];
    if (existing && existing.status !== targetStatus) {
      setPendingOverwrite({
        student,
        newStatus: targetStatus,
        existingStatus: existing.status,
      });
      return;
    }

    applyStatusChange(student, targetStatus);
  };

  const applyStatusChange = (student: Student, status: AttendanceStatus) => {
    const compositeId = `${student.id}_${selectedDate}`;
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    const schoolId = profile.emisCode || 'GBHS-MAIN';
    const now = new Date().toISOString();

    const currentRec = attendanceMap[student.id];
    const newRecord: AttendanceRecord = {
      id: compositeId,
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      class: student.class,
      section: student.section,
      date: selectedDate,
      status,
      remarks: remarksMap[student.id] || undefined,
      version: currentRec ? currentRec.version + 1 : 1,
      updatedAt: now,
      schoolId,
      markedBy: userEmail,
    };

    setAttendanceMap((prev) => ({
      ...prev,
      [student.id]: newRecord,
    }));
  };

  const handleMarkAllPresentClick = () => {
    if (permissions.isReadOnly) return;
    const nonPresentInOriginal = filteredStudents.filter((s) => {
      const orig = originalMap[s.id];
      return orig && orig.status !== 'Present';
    });
    if (nonPresentInOriginal.length > 0) {
      setShowBulkMarkConfirm(true);
      return;
    }
    executeMarkAllPresent();
  };

  const executeMarkAllPresent = () => {
    if (permissions.isReadOnly) return;
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    const schoolId = profile.emisCode || 'GBHS-MAIN';
    const now = new Date().toISOString();
    const updated = { ...attendanceMap };

    for (const s of filteredStudents) {
      const current = updated[s.id];
      updated[s.id] = {
        id: `${s.id}_${selectedDate}`,
        studentId: s.id,
        studentName: s.name,
        rollNo: s.rollNo,
        class: s.class,
        section: s.section,
        date: selectedDate,
        status: 'Present',
        remarks: remarksMap[s.id] || undefined,
        version: current ? current.version + 1 : 1,
        updatedAt: now,
        schoolId,
        markedBy: userEmail,
      };
    }
    setAttendanceMap(updated);
    setShowBulkMarkConfirm(false);
  };

  const handleClearAll = () => {
    if (permissions.isReadOnly) return;
    setAttendanceMap({});
  };

  const handleSaveAllClick = () => {
    if (permissions.isReadOnly) return;
    if (Object.keys(originalMap).length > 0) {
      const changedCount = Object.keys(attendanceMap).filter(
        (id) => !originalMap[id] || originalMap[id].status !== attendanceMap[id].status
      ).length;
      if (changedCount > 0) {
        setShowBulkOverwriteConfirm(true);
        return;
      }
    }
    executeSaveAll();
  };

  const executeSaveAll = async () => {
    if (permissions.isReadOnly) return;
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    setIsSaving(true);
    setSaveSuccessMsg(null);
    setShowBulkOverwriteConfirm(false);

    try {
      const recordsToSave: AttendanceRecord[] = Object.values(attendanceMap).map((rec) => ({
        ...rec,
        remarks: remarksMap[rec.studentId] || undefined,
      }));

      await saveBulkAttendance(recordsToSave, userEmail);
      setOriginalMap({ ...attendanceMap });
      setSaveSuccessMsg(`Saved ${recordsToSave.length} attendance records for ${selectedDate} locally & queued in Outbox!`);
    } catch (err: any) {
      console.error('Failed to save bulk attendance:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Metrics
  const totalCount = filteredStudents.length;
  const presentCount = filteredStudents.filter((s) => attendanceMap[s.id]?.status === 'Present').length;
  const absentCount = filteredStudents.filter((s) => attendanceMap[s.id]?.status === 'Absent').length;
  const leaveCount = filteredStudents.filter((s) => attendanceMap[s.id]?.status === 'Leave').length;
  const lateCount = filteredStudents.filter((s) => attendanceMap[s.id]?.status === 'Late').length;
  const unmarkedCount = totalCount - (presentCount + absentCount + leaveCount + lateCount);

  return (
    <div className="space-y-6">
      {/* Header & Date / Class selectors */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-[#3D4A41]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#F6F3EA] flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-[#D97745]" />
            <span>Daily Attendance Register</span>
          </h2>
          <p className="text-xs text-[#9BAE9C] mt-0.5">
            Mark daily attendance with conservative conflict protection.
          </p>
        </div>

        {/* Date and Class Selector Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#9BAE9C]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-[#F6F3EA] focus:outline-none cursor-pointer"
            />
          </div>

          {/* Compact Reusable Class Selector */}
          {/* Dynamic class selector for all configured classes: availableClasses.map((c) => */}
          <div className="w-full sm:w-auto">
            <ClassSelector
              selectedClass={selectedClass}
              onSelectClass={(c) => setSelectedClass(c)}
              classes={availableClasses}
              allOptionLabel="All Classes"
            />
          </div>

          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value as any)}
            className="bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none cursor-pointer"
          >
            <option value="All">All Sections</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
            <option value="General">General</option>
          </select>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Historical Backfill Toggle Button */}
            <button
              type="button"
              onClick={() => setIncludeArchivedForBackfill((prev) => !prev)}
              className={`btn-interactive flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer shrink-0 ${
                includeArchivedForBackfill
                  ? 'bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border-amber-700/80 shadow-xs'
                  : 'bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border-[#3D4A41]'
              }`}
              title="Toggle to include Inactive, Withdrawn, and Transferred students for historical attendance backfill"
            >
              <History className={`w-3.5 h-3.5 ${includeArchivedForBackfill ? 'text-amber-400' : 'text-[#9BAE9C]'}`} />
              <span>{includeArchivedForBackfill ? 'Backfill: All Lifecycles' : 'Historical Backfill'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                downloadAttendanceTemplate({
                  classLevel: selectedClass,
                  date: selectedDate,
                  students: filteredStudents.length > 0 ? filteredStudents : students,
                });
              }}
              className="btn-interactive group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#D97745]/60 cursor-pointer"
              title="Download Attendance Excel/CSV Template Pre-Filled With School Roster"
            >
              <Download className="w-3.5 h-3.5 text-[#D97745] transition-transform duration-200 group-hover:scale-110" />
              <span>Template</span>
            </button>

            {permissions.canImport && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="btn-interactive group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 cursor-pointer"
                title="Bulk Import Attendance from Excel or CSV"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400 transition-transform duration-200 group-hover:scale-110" />
                <span>Bulk Import</span>
              </button>
            )}

            {permissions.canExport && (
              <>
                <button
                  type="button"
                  onClick={() => setIsMonthlyReportOpen(true)}
                  className="btn-interactive group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#D97745]/60 cursor-pointer"
                  title="Generate Monthly Summary Report & Performance PDF/Excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#D97745] transition-transform duration-200 group-hover:scale-110" />
                  <span>Monthly Report</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(true)}
                  disabled={filteredStudents.length === 0}
                  className="btn-interactive group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] hover:border-emerald-500/60 cursor-pointer disabled:opacity-40"
                  title="Export Attendance Sheet"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400 transition-transform duration-200 group-hover:scale-110" />
                  <span>Export Sheet</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Historical Backfill Mode Active Banner */}
      {includeArchivedForBackfill && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Historical Backfill Mode Active:</strong> Displaying Active, Inactive, Withdrawn, and Transferred students for <strong>{selectedDate}</strong>. Existing student lifecycle statuses remain unchanged; students are not reactivated.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIncludeArchivedForBackfill(false)}
            className="btn-interactive text-[11px] font-semibold text-amber-400 hover:text-amber-200 underline cursor-pointer shrink-0"
          >
            Switch to Active Only
          </button>
        </div>
      )}

      {/* Saved Session Active Banner */}
      {Object.keys(originalMap).length > 0 && (
        <div className="p-3.5 rounded-xl bg-[#2B352E] border border-[#D97745]/50 text-xs text-[#F6F3EA] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CalendarCheck className="w-4 h-4 text-[#D97745] shrink-0" />
            <span>
              <strong>Saved Register Reopened:</strong> Displaying saved attendance session for <strong>{selectedDate}</strong> ({selectedClass}). Contains <strong>{Object.keys(originalMap).length}</strong> student record(s) persisted in local database.
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider bg-[#D97745]/20 border border-[#D97745]/40 text-[#E48B5D] px-2.5 py-0.5 rounded-full shrink-0">
            Saved Session Active
          </span>
        </div>
      )}

      {saveSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-xs text-emerald-300 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-emerald-400" />
            <span>{saveSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccessMsg(null)}
            className="btn-interactive text-emerald-400 hover:text-emerald-200 font-bold px-1.5 py-0.5 rounded-md"
          >
            ✕
          </button>
        </div>
      )}

      {/* Smart Alerts: Low Attendance Warning Banner */}
      {atRiskCount > 0 && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/80 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>Smart Alert:</strong> {atRiskCount} student(s) in {selectedClass}
              {selectedSection !== 'All' ? ` (Section ${selectedSection})` : ''} have attendance below 75% or 3+ consecutive absences. Immediate corrective follow-up recommended.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowAtRiskOnly(!showAtRiskOnly)}
            className={`btn-interactive px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer shrink-0 ${
              showAtRiskOnly
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-900/60 hover:bg-rose-900 text-rose-200 border border-rose-700/80'
            }`}
          >
            {showAtRiskOnly ? 'Show All Students' : 'Highlight At-Risk Only'}
          </button>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] text-[#9BAE9C]">Total Enrolled</span>
          <p className="text-xl font-bold text-[#F6F3EA] mt-0.5">{totalCount}</p>
        </div>
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] text-emerald-400 font-medium">Present</span>
          <p className="text-xl font-bold text-emerald-400 mt-0.5">{presentCount}</p>
        </div>
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] text-rose-400 font-medium">Absent</span>
          <p className="text-xl font-bold text-rose-400 mt-0.5">{absentCount}</p>
        </div>
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] text-amber-400 font-medium">Leave</span>
          <p className="text-xl font-bold text-amber-400 mt-0.5">{leaveCount}</p>
        </div>
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] text-[#D97745] font-medium">Late</span>
          <p className="text-xl font-bold text-[#D97745] mt-0.5">{lateCount}</p>
        </div>
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] text-[#9BAE9C] font-medium">Unmarked</span>
          <p className="text-xl font-bold text-[#9BAE9C] mt-0.5">{unmarkedCount}</p>
        </div>
      </div>

      {/* Read-Only Access Banner */}
      {permissions.isReadOnly && (
        <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-xs text-amber-300 flex items-center gap-2.5">
          <Eye className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Read-Only Workspace Access:</strong> You are viewing attendance records. Modifying, clearing, or saving daily attendance can only be performed by the Workspace Owner.
          </span>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#2B352E] border border-[#3D4A41] p-3.5 rounded-xl shadow-xs">
        {permissions.isReadOnly ? (
          <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
            <Eye className="w-4 h-4" />
            <span>Attendance Register is in View-Only mode</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMarkAllPresentClick}
                className="btn-interactive group flex items-center gap-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />
                <span>Mark All Present</span>
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="btn-interactive text-xs text-[#9BAE9C] hover:text-[#F6F3EA] px-3 py-1.5 rounded-lg bg-[#202822] hover:bg-[#344038] border border-[#3D4A41] cursor-pointer"
              >
                Reset Table
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveAllClick}
              disabled={isSaving}
              className="btn-interactive group flex items-center gap-2 bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] disabled:opacity-50 text-white font-semibold text-xs px-5 py-2 rounded-xl shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              <span>{isSaving ? 'Saving...' : `Save Attendance (${Object.keys(attendanceMap).length} Marked)`}</span>
            </button>
          </>
        )}
      </div>

      {/* Attendance Register Table */}
      <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl overflow-hidden shadow-xs">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-10 h-10 text-[#9BAE9C] mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-[#F6F3EA]">No active students in {selectedClass}</h4>
            <p className="text-xs text-[#9BAE9C] mt-1">
              Add or import students into {selectedClass} first to take attendance.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#CCD6CD]">
              <thead className="bg-[#202822] text-[#9BAE9C] uppercase text-[10px] font-semibold border-b border-[#3D4A41]">
                <tr>
                  <th className="px-4 py-3 w-16">Roll #</th>
                  <th className="px-4 py-3">Admission No</th>
                  <th className="px-4 py-3">Student Full Name</th>
                  <th className="px-4 py-3">Father's Name</th>
                  <th className="px-4 py-3">Sec</th>
                  <th className="px-4 py-3 text-center">Status Selection</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3D4A41]/70">
                {filteredStudents.map((student) => {
                  const record = attendanceMap[student.id];
                  const currentStatus = record?.status;
                  const alert = alertsMap.get(student.id);

                  return (
                    <tr key={student.id} className="hover:bg-[#344038]/50 transition-colors duration-150">
                      <td className="px-4 py-3 font-mono font-bold text-[#F6F3EA]">{student.rollNo}</td>
                      <td className="px-4 py-3 font-mono text-[#D97745] font-semibold">{student.admissionNo}</td>
                      <td className="px-4 py-3 font-semibold text-[#F6F3EA]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSelectedStudentForDetail(student)}
                            className="btn-interactive font-semibold text-[#F6F3EA] hover:text-[#D97745] hover:underline transition-colors text-left cursor-pointer"
                            title="Click to view complete student profile and attendance history"
                          >
                            {student.name}
                          </button>

                          {/* Historical Status Badge for Withdrawn / Transferred / Inactive */}
                          {student.status !== 'Active' && (() => {
                            const validation = validateAttendanceEnrollmentDate(student, selectedDate);
                            return (
                              <div className="inline-flex items-center gap-1 flex-wrap">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                                    student.status === 'Withdrawn'
                                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                      : student.status === 'Transferred'
                                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                      : 'bg-[#202822] text-[#9BAE9C] border border-[#3D4A41]'
                                  }`}
                                  title={`Historical record: Student is currently ${student.status}${
                                    student.withdrawnDate ? ` (Withdrawn: ${student.withdrawnDate})` : ''
                                  }${student.transferredDate ? ` (Transferred: ${student.transferredDate})` : ''}`}
                                >
                                  {student.status}
                                  {student.withdrawnDate && student.status === 'Withdrawn' && (
                                    <span className="ml-1 opacity-75 font-normal">({student.withdrawnDate})</span>
                                  )}
                                  {student.transferredDate && student.status === 'Transferred' && (
                                    <span className="ml-1 opacity-75 font-normal">({student.transferredDate})</span>
                                  )}
                                </span>
                                {validation.isOutsideEnrollment && (
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-800 shrink-0"
                                    title={validation.reason}
                                  >
                                    Outside Window
                                  </span>
                                )}
                              </div>
                            );
                          })()}

                          {/* Smart Alert Badge */}
                          {alert && (alert.isLowAttendance || alert.isAtRiskAbsence) && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800 shrink-0"
                              title={alert.alertBadgeText}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              <span>{alert.alertBadgeText}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#9BAE9C]">{student.fatherName}</td>
                      <td className="px-4 py-3 font-medium text-[#CCD6CD]">{student.section}</td>
                      <td className="px-4 py-3">
                        {permissions.isReadOnly ? (
                          <div className="flex items-center justify-center">
                            <span
                              className={`px-2.5 py-1 rounded-lg font-bold text-xs border ${
                                currentStatus === 'Present'
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                  : currentStatus === 'Absent'
                                  ? 'bg-rose-950 text-rose-400 border-rose-800'
                                  : currentStatus === 'Leave'
                                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                                  : currentStatus === 'Late'
                                  ? 'bg-[#D97745]/20 text-[#D97745] border border-[#D97745]/40'
                                  : 'bg-[#202822] text-[#9BAE9C] border border-[#3D4A41]'
                              }`}
                            >
                              {currentStatus || 'Unmarked'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Present */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(student, 'Present')}
                              className={`btn-interactive px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1 ${
                                currentStatus === 'Present'
                                  ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-400/30'
                                  : 'bg-[#202822] text-[#9BAE9C] hover:bg-[#344038] hover:text-emerald-300 border border-[#3D4A41]'
                              }`}
                            >
                              <Check className="w-3 h-3" /> P
                            </button>

                            {/* Absent */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(student, 'Absent')}
                              className={`btn-interactive px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1 ${
                                currentStatus === 'Absent'
                                  ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-400/30'
                                  : 'bg-[#202822] text-[#9BAE9C] hover:bg-[#344038] hover:text-rose-300 border border-[#3D4A41]'
                              }`}
                            >
                              <X className="w-3 h-3" /> A
                            </button>

                            {/* Leave */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(student, 'Leave')}
                              className={`btn-interactive px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1 ${
                                currentStatus === 'Leave'
                                  ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-400/30'
                                  : 'bg-[#202822] text-[#9BAE9C] hover:bg-[#344038] hover:text-amber-300 border border-[#3D4A41]'
                              }`}
                            >
                              <Coffee className="w-3 h-3" /> L
                            </button>

                            {/* Late */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(student, 'Late')}
                              className={`btn-interactive px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1 ${
                                currentStatus === 'Late'
                                  ? 'bg-[#D97745] text-white shadow-xs ring-2 ring-[#D97745]/30'
                                  : 'bg-[#202822] text-[#9BAE9C] hover:bg-[#344038] hover:text-[#E48B5D] border border-[#3D4A41]'
                              }`}
                            >
                              <Clock className="w-3 h-3" /> T
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          placeholder={permissions.isReadOnly ? 'No notes' : 'Add note...'}
                          disabled={permissions.isReadOnly}
                          value={remarksMap[student.id] || ''}
                          onChange={(e) =>
                            setRemarksMap((prev) => ({
                              ...prev,
                              [student.id]: e.target.value,
                            }))
                          }
                          className="w-full bg-[#202822] border border-[#3D4A41] rounded px-2 py-1 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745] disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historical Attendance Enrollment Period Validation Warning Modal */}
      {pendingEnrollmentWarning &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-xs overscroll-contain overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm sm:max-w-md bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-5 sm:p-6 shadow-2xl text-[#F6F3EA] m-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
              <div className="w-11 h-11 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/80 flex items-center justify-center mb-3 shrink-0 shadow-sm">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-[#F6F3EA] leading-tight">
                Enrollment Period Validation Notice
              </h4>
              <div className="overflow-y-auto pr-1 mt-2.5 space-y-2 text-xs sm:text-sm">
                <p className="text-[#CCD6CD] leading-relaxed">
                  <strong>{pendingEnrollmentWarning.student.name}</strong> (Roll #{pendingEnrollmentWarning.student.rollNo}) has lifecycle status{' '}
                  <span className="font-bold text-amber-400">{pendingEnrollmentWarning.student.status}</span>.
                </p>
                <div className="bg-[#202822] p-3 rounded-xl border border-[#3D4A41] text-xs space-y-1.5 text-[#CCD6CD]">
                  <div className="flex items-start gap-2 text-amber-300">
                    <span className="font-semibold shrink-0">Validation:</span>
                    <span>{pendingEnrollmentWarning.validation.reason}</span>
                  </div>
                  {pendingEnrollmentWarning.validation.details && (
                    <div className="text-[#9BAE9C] text-[11px]">
                      {pendingEnrollmentWarning.validation.details}
                    </div>
                  )}
                  <div className="text-[#9BAE9C] text-[11px] border-t border-[#3D4A41] pt-1.5">
                    Target Date: <strong className="text-[#F6F3EA]">{selectedDate}</strong> | New Status:{' '}
                    <strong className="text-[#D97745]">{pendingEnrollmentWarning.targetStatus}</strong>
                  </div>
                </div>
                <p className="text-xs text-[#9BAE9C] leading-relaxed">
                  Backfilling will record this historical attendance status without reactivating the student or modifying their enrollment lifecycle history.
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 mt-5 pt-3 border-t border-[#3D4A41]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setPendingEnrollmentWarning(null)}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] border border-[#3D4A41] cursor-pointer text-center transition-colors"
                >
                  Cancel Entry
                </button>
                <button
                  type="button"
                  onClick={confirmEnrollmentWarning}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-xs text-center transition-colors"
                >
                  Confirm Historical Entry
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Conservative Attendance Conflict Confirmation Modal */}
      {pendingOverwrite &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-xs overscroll-contain overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm sm:max-w-md bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-5 sm:p-6 shadow-2xl text-[#F6F3EA] m-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
              <div className="w-11 h-11 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/80 flex items-center justify-center mb-3 shrink-0 shadow-sm">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-[#F6F3EA] leading-tight">
                Confirm Attendance Change
              </h4>
              <div className="overflow-y-auto pr-1 mt-2.5 space-y-2 text-xs sm:text-sm">
                <p className="text-[#CCD6CD] leading-relaxed">
                  <strong>{pendingOverwrite.student.name}</strong> (Roll #{pendingOverwrite.student.rollNo}) is currently recorded as{' '}
                  <span className="font-bold text-amber-400">{pendingOverwrite.existingStatus}</span> for {selectedDate}.
                </p>
                <p className="text-[#9BAE9C] leading-relaxed">
                  Do you explicitly confirm replacing it with{' '}
                  <span className="font-bold text-[#D97745]">{pendingOverwrite.newStatus}</span>?
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 mt-5 pt-3 border-t border-[#3D4A41]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setPendingOverwrite(null)}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] border border-[#3D4A41] cursor-pointer text-center transition-colors"
                >
                  Cancel (Keep {pendingOverwrite.existingStatus})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyStatusChange(pendingOverwrite.student, pendingOverwrite.newStatus);
                    setPendingOverwrite(null);
                  }}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white cursor-pointer shadow-xs text-center transition-colors"
                >
                  Yes, Change to {pendingOverwrite.newStatus}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Conservative Bulk Mark All Present Confirmation Modal */}
      {showBulkMarkConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-xs overscroll-contain overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm sm:max-w-md bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-5 sm:p-6 shadow-2xl text-[#F6F3EA] m-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
              <div className="w-11 h-11 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/80 flex items-center justify-center mb-3 shrink-0 shadow-sm">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-[#F6F3EA] leading-tight">
                Overwrite Saved Register?
              </h4>
              <div className="overflow-y-auto pr-1 mt-2.5 space-y-2 text-xs sm:text-sm">
                <p className="text-[#CCD6CD] leading-relaxed">
                  This session on <strong>{selectedDate}</strong> already contains saved student attendance records.
                </p>
                <p className="text-[#9BAE9C] leading-relaxed">
                  Clicking continue will change existing recorded non-present statuses to <strong>Present</strong>. Are you sure you want to proceed?
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 mt-5 pt-3 border-t border-[#3D4A41]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBulkMarkConfirm(false)}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] border border-[#3D4A41] cursor-pointer text-center transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeMarkAllPresent}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs text-center transition-colors"
                >
                  Yes, Mark All Present
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Conservative Bulk Save Overwrite Confirmation Modal */}
      {showBulkOverwriteConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-xs overscroll-contain overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm sm:max-w-md bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-5 sm:p-6 shadow-2xl text-[#F6F3EA] m-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
              <div className="w-11 h-11 rounded-full bg-[#D97745]/20 text-[#D97745] border border-[#D97745]/40 flex items-center justify-center mb-3 shrink-0 shadow-sm">
                <CalendarCheck className="w-5 h-5 text-[#D97745]" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-[#F6F3EA] leading-tight">
                Confirm Overwrite of Saved Register
              </h4>
              <div className="overflow-y-auto pr-1 mt-2.5 space-y-2 text-xs sm:text-sm">
                <p className="text-[#CCD6CD] leading-relaxed">
                  You are updating attendance records for <strong>{selectedDate}</strong> ({selectedClass}). Existing saved statuses will be safely replaced with your current table selections and synchronized to local IndexedDB and the Outbox queue.
                </p>
                <div className="bg-[#202822] p-3 rounded-xl border border-[#3D4A41] mt-2 text-xs space-y-1">
                  <div className="flex justify-between text-[#9BAE9C]">
                    <span>Total records to save:</span>
                    <span className="font-bold text-[#F6F3EA] font-mono">{Object.keys(attendanceMap).length}</span>
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span>Present:</span>
                    <span className="font-bold font-mono">{presentCount}</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span>Absent:</span>
                    <span className="font-bold font-mono">{absentCount}</span>
                  </div>
                  <div className="flex justify-between text-amber-400">
                    <span>Leave / Late:</span>
                    <span className="font-bold font-mono">{leaveCount + lateCount}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 mt-5 pt-3 border-t border-[#3D4A41]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBulkOverwriteConfirm(false)}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] border border-[#3D4A41] cursor-pointer text-center transition-colors"
                >
                  Cancel Review
                </button>
                <button
                  type="button"
                  onClick={executeSaveAll}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#D97745] hover:bg-[#C56837] text-white cursor-pointer shadow-xs text-center transition-colors"
                >
                  Confirm & Save Changes
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Module Bulk Importer Modal */}
      <ModuleImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialModuleType="attendance"
        onImportComplete={loadData}
      />

      {/* Export Attendance Sheet Modal */}
      <ExportAttendanceModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        selectedClass={selectedClass}
        selectedSection={selectedSection}
        selectedDate={selectedDate}
      />

      {/* Monthly Summary & Performance Report Modal */}
      <MonthlyReportModal
        isOpen={isMonthlyReportOpen}
        onClose={() => setIsMonthlyReportOpen(false)}
        initialClass={selectedClass}
      />

      {/* Student Profile & History Modal */}
      {selectedStudentForDetail && (
        <StudentDetailModal
          student={selectedStudentForDetail}
          onClose={() => setSelectedStudentForDetail(null)}
          onOpenWhatsAppAlert={(s) => setWhatsAppAlertStudent(s)}
        />
      )}

      {/* WhatsApp Quick Alert Modal */}
      {whatsAppAlertStudent && (
        <WhatsAppAlertModal
          isOpen={Boolean(whatsAppAlertStudent)}
          onClose={() => setWhatsAppAlertStudent(null)}
          studentName={whatsAppAlertStudent.name}
          rollNo={whatsAppAlertStudent.rollNo}
          classLevel={whatsAppAlertStudent.class}
          guardianPhone={whatsAppAlertStudent.guardianContact || whatsAppAlertStudent.phone || ''}
          date={selectedDate}
          absenceCount={1}
          reason="Marked absent in daily register"
        />
      )}
    </div>
  );
};
