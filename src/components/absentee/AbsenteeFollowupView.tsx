import React, { useState, useEffect } from 'react';
import { ClassLevel, Student } from '../../types/student';
import { AbsenteeFollowupEntry, FollowupStatus } from '../../types/modules';
import {
  fetchAbsenteeFollowups,
  createAbsenteeFollowup,
  updateAbsenteeFollowup,
  deleteAbsenteeFollowup,
  exportAbsenteeFollowupsToExcel,
} from '../../services/modulesService';
import { getAllStudents } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { getWorkspacePermissions } from '../../services/permissionService';
import { useSchoolProfile } from '../../services/schoolProfileService';
import { ClassTabs, ClassFilter } from '../common/ClassTabs';
import {
  UserX,
  Plus,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  PhoneCall,
  Calendar,
  X,
  FileText,
  Edit,
  Trash2,
  ShieldAlert,
  ArrowRight,
  MessageSquare,
  MessageCircle,
  Download,
  Upload,
} from 'lucide-react';
import { WhatsAppAlertModal } from './WhatsAppAlertModal';
import { StudentDetailModal } from '../students/StudentDetailModal';
import { downloadAbsenteeFollowupTemplate } from '../../services/bulkModuleImportService';
import { ModuleImportModal } from '../import/ModuleImportModal';
import { DEFAULT_CLASSES, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';
import { getClassBadgeColor } from '../../services/classNormalizationService';

export const AbsenteeFollowupView: React.FC = () => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);
  const { profile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const availableClasses = sortClasses(sanitizeClasses(profile.classes));

  const [followups, setFollowups] = useState<AbsenteeFollowupEntry[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | FollowupStatus>('All');
  const [referralFilter, setReferralFilter] = useState<'All' | 'Yes' | 'No'>('All');
  const [classCounts, setClassCounts] = useState<{ all: number; [key: string]: number }>({
    all: 0,
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AbsenteeFollowupEntry | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AbsenteeFollowupEntry | null>(null);
  const [whatsAppAlertTarget, setWhatsAppAlertTarget] = useState<{
    studentName: string;
    rollNo: string;
    classLevel: string;
    phone: string;
    date: string;
    absenceCount: number;
    reason: string;
  } | null>(null);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<Student | null>(null);

  // Form Fields
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formClass, setFormClass] = useState<ClassLevel>(() => availableClasses[0] || 'Class 1');
  const [formStudentId, setFormStudentId] = useState('');
  const [formStudentName, setFormStudentName] = useState('');
  const [formRegistrationId, setFormRegistrationId] = useState('');
  const [formAbsenceCount, setFormAbsenceCount] = useState<number>(2);
  const [formFollowupReason, setFormFollowupReason] = useState('Illness / Medical');
  const [formActionTaken, setFormActionTaken] = useState('Phone Call to Guardian');
  const [formContactPerson, setFormContactPerson] = useState('Father');
  const [formResponseReceived, setFormResponseReceived] = useState('');
  const [formExpectedReturnDate, setFormExpectedReturnDate] = useState('');
  const [formFollowupDate, setFormFollowupDate] = useState(new Date().toISOString().split('T')[0]);
  const [formCurrentStatus, setFormCurrentStatus] = useState<FollowupStatus>('Pending Return');
  const [formManagementReferral, setFormManagementReferral] = useState<'Yes' | 'No'>('No');
  const [formRemarks, setFormRemarks] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [list, students] = await Promise.all([
        fetchAbsenteeFollowups(selectedClass),
        getAllStudents(),
      ]);
      setFollowups(list);
      setAllStudents(students);

      const all = await fetchAbsenteeFollowups('All');
      const dynamicCounts: Record<string, number> = { all: all.length };
      availableClasses.forEach((cls) => {
        const normCls = cls.trim().toLowerCase().replace(/\s+/g, ' ');
        const count = all.filter((f) => (f.class || '').trim().toLowerCase().replace(/\s+/g, ' ') === normCls).length;
        dynamicCounts[cls] = count;
        const rawKey = cls.toLowerCase().replace(/[\s_-]+/g, '');
        dynamicCounts[rawKey] = count;
      });

      setClassCounts(dynamicCounts as any);
    } catch (err) {
      console.error('Failed to load absentee follow-ups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleReactivity = () => {
      loadData();
    };
    window.addEventListener('gbhs_records_imported', handleReactivity);
    window.addEventListener('gbhs_absentee_changed', handleReactivity);
    return () => {
      window.removeEventListener('gbhs_records_imported', handleReactivity);
      window.removeEventListener('gbhs_absentee_changed', handleReactivity);
    };
  }, [selectedClass]);

  const handleOpenWhatsAppAlert = (item: AbsenteeFollowupEntry) => {
    const student = allStudents.find((s) => s.id === item.studentId || s.rollNo === item.registrationId);
    const phone = student?.guardianContact || student?.phone || (item.contactPerson.match(/\d{10,13}/)?.[0] || '');
    setWhatsAppAlertTarget({
      studentName: item.studentName,
      rollNo: item.registrationId,
      classLevel: item.class,
      phone,
      date: item.date,
      absenceCount: item.absenceCount || 1,
      reason: item.followupReason || 'Absent from school',
    });
  };

  const handleOpenStudentProfile = (item: AbsenteeFollowupEntry) => {
    const student = allStudents.find((s) => s.id === item.studentId || s.rollNo === item.registrationId);
    if (student) {
      setSelectedStudentForProfile(student);
    } else {
      setSelectedStudentForProfile({
        id: item.studentId || 'unknown',
        rollNo: item.registrationId,
        admissionNo: item.registrationId,
        name: item.studentName,
        fatherName: item.contactPerson || 'Guardian',
        class: item.class as any,
        section: 'A',
        status: 'Active',
        phone: '',
        version: 1,
        updatedAt: item.date,
        createdAt: item.date,
        schoolId: 'GBHS-MAIN',
        createdBy: 'system',
      });
    }
  };

  const handleClassChangeInForm = (cls: ClassLevel) => {
    setFormClass(cls);
    setFormStudentId('');
    setFormStudentName('');
    setFormRegistrationId('');
    setFormContactPerson('');
  };

  const handleStudentSelect = (studentId: string) => {
    setFormStudentId(studentId);
    if (!studentId) {
      setFormStudentName('');
      setFormRegistrationId('');
      setFormContactPerson('');
      return;
    }
    const found = allStudents.find((s) => s.id === studentId);
    if (found) {
      setFormStudentName(found.name);
      setFormRegistrationId(found.rollNo || found.admissionNo);
      const phoneInfo = found.phone ? ` [Phone: ${found.phone}]` : '';
      setFormContactPerson(
        found.fatherName ? `Father (${found.fatherName})${phoneInfo}` : `Guardian${phoneInfo}`
      );
    }
  };

  const handleOpenCreate = () => {
    if (permissions.isReadOnly) return;
    setEditingEntry(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    const defaultCls = selectedClass !== 'All' ? selectedClass : (availableClasses[0] || 'Class 1');
    setFormClass(defaultCls);
    setFormStudentId('');
    setFormStudentName('');
    setFormRegistrationId('');
    setFormContactPerson('');

    setFormAbsenceCount(1);
    setFormFollowupReason('Illness / Medical');
    setFormActionTaken('Phone Call to Guardian');
    setFormResponseReceived('');
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 3);
    setFormExpectedReturnDate(nextWeek.toISOString().split('T')[0]);
    setFormFollowupDate(new Date().toISOString().split('T')[0]);
    setFormCurrentStatus('Pending Return');
    setFormManagementReferral('No');
    setFormRemarks('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (entry: AbsenteeFollowupEntry) => {
    if (permissions.isReadOnly) return;
    setEditingEntry(entry);
    setFormDate(entry.date);
    setFormClass(entry.class);
    setFormStudentId(entry.studentId || '');
    setFormStudentName(entry.studentName);
    setFormRegistrationId(entry.registrationId);
    setFormAbsenceCount(entry.absenceCount);
    setFormFollowupReason(entry.followupReason);
    setFormActionTaken(entry.actionTaken);
    setFormContactPerson(entry.contactPerson);
    setFormResponseReceived(entry.responseReceived);
    setFormExpectedReturnDate(entry.expectedReturnDate || '');
    setFormFollowupDate(entry.followupDate);
    setFormCurrentStatus(entry.currentStatus);
    setFormManagementReferral(entry.managementReferral);
    setFormRemarks(entry.remarks || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStudentId || !formStudentName.trim()) {
      setFormError('Please select a student from the Student Master Roster.');
      return;
    }
    if (!formResponseReceived.trim()) {
      setFormError('Response received from contact person is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingEntry) {
        const res = await updateAbsenteeFollowup(editingEntry.id, {
          date: formDate,
          class: formClass,
          studentId: formStudentId || undefined,
          studentName: formStudentName.trim(),
          registrationId: formRegistrationId.trim() || '—',
          absenceCount: Number(formAbsenceCount),
          followupReason: formFollowupReason,
          actionTaken: formActionTaken,
          contactPerson: formContactPerson.trim(),
          responseReceived: formResponseReceived.trim(),
          expectedReturnDate: formExpectedReturnDate || undefined,
          followupDate: formFollowupDate,
          currentStatus: formCurrentStatus,
          managementReferral: formManagementReferral,
          remarks: formRemarks.trim() || undefined,
        });
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createAbsenteeFollowup({
          date: formDate,
          class: formClass,
          studentId: formStudentId || undefined,
          studentName: formStudentName.trim(),
          registrationId: formRegistrationId.trim() || '—',
          absenceCount: Number(formAbsenceCount),
          followupReason: formFollowupReason,
          actionTaken: formActionTaken,
          contactPerson: formContactPerson.trim(),
          responseReceived: formResponseReceived.trim(),
          expectedReturnDate: formExpectedReturnDate || undefined,
          followupDate: formFollowupDate,
          currentStatus: formCurrentStatus,
          managementReferral: formManagementReferral,
          remarks: formRemarks.trim() || undefined,
        });
        if (!res.success) throw new Error(res.error);
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save absentee follow-up.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickResolve = async (entry: AbsenteeFollowupEntry) => {
    if (permissions.isReadOnly) return;
    await updateAbsenteeFollowup(entry.id, {
      currentStatus: 'Resolved / Returned',
      remarks: (entry.remarks ? entry.remarks + ' | ' : '') + 'Returned to class on ' + new Date().toISOString().split('T')[0],
    });
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (permissions.isReadOnly) return;
    if (window.confirm('Are you sure you want to delete this absentee follow-up record?')) {
      await deleteAbsenteeFollowup(id);
      await loadData();
    }
  };

  const filteredFollowups = followups.filter((f) => {
    if (statusFilter !== 'All' && f.currentStatus !== statusFilter) return false;
    if (referralFilter !== 'All' && f.managementReferral !== referralFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.studentName.toLowerCase().includes(q) ||
      f.registrationId.toLowerCase().includes(q) ||
      f.followupReason.toLowerCase().includes(q) ||
      f.actionTaken.toLowerCase().includes(q) ||
      f.contactPerson.toLowerCase().includes(q) ||
      f.responseReceived.toLowerCase().includes(q)
    );
  });

  // Calculate Metrics
  const totalCount = filteredFollowups.length;
  const pendingCount = filteredFollowups.filter((f) => f.currentStatus === 'Pending Return').length;
  const resolvedCount = filteredFollowups.filter((f) => f.currentStatus === 'Resolved / Returned').length;
  const referralCount = filteredFollowups.filter((f) => f.managementReferral === 'Yes').length;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Absentee Follow-up Module</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 font-mono font-medium">
                  Guardian Outreach
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Log prolonged absences, guardian outreach, reasons, return commitments, and administrative escalation
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => downloadAbsenteeFollowupTemplate({ classLevel: selectedClass, students: allStudents })}
            className="btn-interactive flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#9BAE9C]/30 cursor-pointer"
            title="Download Excel/CSV template for Absentee Follow-ups with Student Roster"
          >
            <Download className="w-4 h-4 text-[#9BAE9C]" />
            <span>Template</span>
          </button>

          {permissions.canAdd && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="btn-interactive flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#9BAE9C]/30 cursor-pointer"
              title="Bulk import absentee follow-up records from Excel or CSV"
            >
              <Upload className="w-4 h-4 text-[#D97745]" />
              <span>Bulk Import</span>
            </button>
          )}

          {permissions.canExport && (
            <button
              onClick={() => exportAbsenteeFollowupsToExcel(filteredFollowups, selectedClass)}
              disabled={filteredFollowups.length === 0}
              className="btn-interactive flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#9BAE9C]/30 cursor-pointer disabled:opacity-40"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#9BAE9C]" />
              <span>Export Sheet</span>
            </button>
          )}

          {permissions.canAdd && (
            <button
              onClick={handleOpenCreate}
              className="btn-interactive flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] text-white shadow-sm shadow-[#D97745]/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Follow-up</span>
            </button>
          )}
        </div>
      </div>

      {/* Read-Only Access Banner */}
      {permissions.isReadOnly && (
        <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-xs text-amber-300 flex items-center gap-2.5">
          <span>
            <strong>Approved Staff Access (Read & Export):</strong> You are viewing absentee follow-up records in this shared workspace with read and export permissions. Logging, editing, or deleting outreach can only be performed by the Workspace Owner.
          </span>
        </div>
      )}

      {/* Class Selector & Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#2B352E]/60 p-2.5 rounded-2xl border border-[#3D4A41]">
        <div className="flex items-center gap-2 flex-wrap">
          <ClassTabs
            selectedClass={selectedClass}
            onSelectClass={setSelectedClass}
            classes={availableClasses}
            counts={classCounts}
          />

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="btn-interactive bg-[#202822] border border-[#3D4A41] rounded-xl px-2.5 py-2 text-xs text-[#F6F3EA] font-medium cursor-pointer focus:outline-none focus:border-[#D97745] transition-colors duration-150"
          >
            <option value="All">All Resolution States</option>
            <option value="Pending Return">Pending Return</option>
            <option value="Resolved / Returned">Resolved / Returned</option>
            <option value="Escalated">Escalated</option>
            <option value="Prolonged Leave">Prolonged Leave</option>
          </select>

          {/* Referral Filter */}
          <select
            value={referralFilter}
            onChange={(e) => setReferralFilter(e.target.value as any)}
            className="btn-interactive bg-[#202822] border border-[#3D4A41] rounded-xl px-2.5 py-2 text-xs text-[#F6F3EA] font-medium cursor-pointer focus:outline-none focus:border-[#D97745] transition-colors duration-150"
          >
            <option value="All">All Referrals</option>
            <option value="Yes">Management Referral</option>
            <option value="No">No Referral</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-[#9BAE9C] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student or parent..."
            className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl pl-8 pr-8 py-2 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745] transition-colors duration-150"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="btn-interactive absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BAE9C] hover:text-[#F6F3EA]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Total Follow-up Cases</span>
            <UserX className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-[#F6F3EA] mt-2">{totalCount}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Contact cases documented</p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Pending Return</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{pendingCount}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Students expected to resume</p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Resolved / Returned</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{resolvedCount}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Successfully rejoined classroom</p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Headmaster Referral</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 mt-2">{referralCount}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Administrative disciplinary cases</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#F6F3EA]">
            <thead className="bg-[#202822] text-[#9BAE9C] uppercase text-[10px] font-semibold tracking-wider border-b border-[#3D4A41]">
              <tr>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-4 py-3.5">Class</th>
                <th className="px-4 py-3.5">Roll / Reg #</th>
                <th className="px-4 py-3.5">Student Name</th>
                <th className="px-4 py-3.5 text-center">Days Absent</th>
                <th className="px-4 py-3.5">Reason for Absence</th>
                <th className="px-4 py-3.5">Action Taken</th>
                <th className="px-4 py-3.5">Contact Person</th>
                <th className="px-4 py-3.5">Expected Return</th>
                <th className="px-4 py-3.5">Current Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3D4A41]/80">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-[#9BAE9C]">
                    Loading absentee follow-ups...
                  </td>
                </tr>
              ) : filteredFollowups.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-[#9BAE9C]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserX className="w-9 h-9 text-[#9BAE9C]/60 mb-1" />
                      <p className="text-[#F6F3EA] font-semibold text-sm">No absentee follow-ups recorded yet</p>
                      <p className="text-xs text-[#9BAE9C] max-w-md">
                        This module is clean and ready. Click "Log Follow-up" to record communication with parents/guardians linked strictly to your imported Student Master Roster.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFollowups.map((item) => (
                  <tr key={item.id} className="hover:bg-[#344038]/50 transition-colors duration-150">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-[#9BAE9C]">
                      {item.date}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${getClassBadgeColor(item.class)}`}
                      >
                        {item.class}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[#F6F3EA] whitespace-nowrap">
                      {item.registrationId}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#F6F3EA] whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenStudentProfile(item)}
                        className="btn-interactive font-medium text-[#F6F3EA] hover:text-[#D97745] hover:underline transition text-left cursor-pointer"
                        title="Click to view complete student profile and attendance history"
                      >
                        {item.studentName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                          item.absenceCount >= 3
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {item.absenceCount} Days
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#CCD6CD] max-w-[160px] truncate" title={item.followupReason}>
                      {item.followupReason}
                    </td>
                    <td className="px-4 py-3 text-[#9BAE9C] max-w-[150px] truncate" title={item.actionTaken}>
                      {item.actionTaken}
                    </td>
                    <td className="px-4 py-3 text-[#CCD6CD] whitespace-nowrap">
                      {item.contactPerson}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-[#9BAE9C]">
                      {item.expectedReturnDate || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          item.currentStatus === 'Resolved / Returned'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                            : item.currentStatus === 'Pending Return'
                            ? 'bg-amber-950/60 text-amber-400 border-amber-800'
                            : item.currentStatus === 'Escalated'
                            ? 'bg-rose-950/60 text-rose-400 border-rose-800'
                            : 'bg-[#202822] text-[#9BAE9C] border-[#3D4A41]'
                        }`}
                      >
                        {item.currentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.currentStatus === 'Pending Return' && permissions.canEdit && (
                          <button
                            onClick={() => handleQuickResolve(item)}
                            className="btn-interactive px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/80 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                            title="Mark Student as Returned"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Returned</span>
                          </button>
                        )}
                        {/* Direct WhatsApp Quick Alert */}
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsAppAlert(item)}
                          className="btn-interactive p-1.5 rounded-lg text-[#9BAE9C] hover:text-emerald-400 hover:bg-emerald-950/40 cursor-pointer"
                          title="Send WhatsApp Quick Alert to Guardian"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        </button>

                        <button
                          onClick={() => setSelectedDetail(item)}
                          className="btn-interactive p-1.5 rounded-lg text-[#9BAE9C] hover:text-[#D97745] hover:bg-[#202822] cursor-pointer"
                          title="View Details"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        {permissions.canEdit && (
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="btn-interactive p-1.5 rounded-lg text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] cursor-pointer"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {permissions.canDelete && (
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="btn-interactive p-1.5 rounded-lg text-[#9BAE9C] hover:text-rose-400 hover:bg-[#202822] cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Followup Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A211C]/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#3D4A41] flex items-center justify-between sticky top-0 bg-[#2B352E] z-10">
              <div className="flex items-center gap-2">
                <UserX className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-[#F6F3EA] text-sm">
                  {editingEntry ? 'Edit Absentee Follow-up' : 'Log Absentee Contact / Outreach'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="btn-interactive text-[#9BAE9C] hover:text-[#F6F3EA] p-1 rounded-lg hover:bg-[#202822] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 space-y-4">
              {formError && (
                <div className="bg-rose-950/60 border border-rose-800 text-rose-300 text-xs px-3.5 py-2 rounded-xl">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Follow-up Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  />
                </div>
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Class</label>
                  <select
                    value={formClass}
                    onChange={(e) => handleClassChangeInForm(e.target.value as ClassLevel)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  >
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Days Absent</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={formAbsenceCount}
                    onChange={(e) => setFormAbsenceCount(Number(e.target.value))}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-amber-400 font-bold font-mono"
                  />
                </div>
              </div>

              {/* Student Picker */}
              <div className="bg-[#202822] p-3 rounded-xl border border-[#3D4A41] space-y-2">
                <label className="block text-[#CCD6CD] text-xs font-medium">Select Student</label>
                <select
                  value={formStudentId}
                  onChange={(e) => handleStudentSelect(e.target.value)}
                  className="w-full bg-[#2B352E] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                >
                  <option value="">-- Choose student from {formClass} --</option>
                  {allStudents
                    .filter((s) => s.class === formClass)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Roll #{s.rollNo} — {s.name} ({s.fatherName})
                      </option>
                    ))}
                </select>

                {allStudents.filter((s) => s.class === formClass).length === 0 && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      No active students found in <strong>{formClass}</strong> in the Student Master Roster. Import roster excel sheet first.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <label className="text-[#9BAE9C] text-[11px] block">Student Name</label>
                    <input
                      type="text"
                      required
                      value={formStudentName}
                      onChange={(e) => setFormStudentName(e.target.value)}
                      placeholder="Student full name"
                      className="w-full bg-[#2B352E] border border-[#3D4A41] rounded-lg px-2.5 py-1 text-xs text-[#F6F3EA]"
                    />
                  </div>
                  <div>
                    <label className="text-[#9BAE9C] text-[11px] block">Roll / Reg #</label>
                    <input
                      type="text"
                      required
                      value={formRegistrationId}
                      onChange={(e) => setFormRegistrationId(e.target.value)}
                      placeholder="Roll or reg number"
                      className="w-full bg-[#2B352E] border border-[#3D4A41] rounded-lg px-2.5 py-1 text-xs text-[#F6F3EA] font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Reason for Absence</label>
                  <select
                    value={formFollowupReason}
                    onChange={(e) => setFormFollowupReason(e.target.value)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  >
                    <option value="Illness / Medical">Illness / Medical</option>
                    <option value="Family Emergency">Family Emergency</option>
                    <option value="Visiting Ancestral Village">Visiting Ancestral Village</option>
                    <option value="Transportation / Road Blockage">Transportation / Road Blockage</option>
                    <option value="Unexcused Absence">Unexcused Absence</option>
                    <option value="Financial / Domestic Work">Financial / Domestic Work</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Action Taken</label>
                  <select
                    value={formActionTaken}
                    onChange={(e) => setFormActionTaken(e.target.value)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  >
                    <option value="Phone Call to Guardian">Phone Call to Guardian</option>
                    <option value="WhatsApp Notification">WhatsApp Notification</option>
                    <option value="Home Visit by Senior Teacher">Home Visit by Senior Teacher</option>
                    <option value="Parent Summoned to School">Parent Summoned to School</option>
                    <option value="Written Notice Issued">Written Notice Issued</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Contact Person</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Father (Mehrullah), Guardian"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  />
                </div>

                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Expected Return Date</label>
                  <input
                    type="date"
                    value={formExpectedReturnDate}
                    onChange={(e) => setFormExpectedReturnDate(e.target.value)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Response Received / Guardian Statement</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Summary of response from father/guardian..."
                  value={formResponseReceived}
                  onChange={(e) => setFormResponseReceived(e.target.value)}
                  className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Current Status</label>
                  <select
                    value={formCurrentStatus}
                    onChange={(e) => setFormCurrentStatus(e.target.value as FollowupStatus)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  >
                    <option value="Pending Return">Pending Return</option>
                    <option value="Resolved / Returned">Resolved / Returned</option>
                    <option value="Escalated">Escalated</option>
                    <option value="Prolonged Leave">Prolonged Leave</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Management Referral?</label>
                  <select
                    value={formManagementReferral}
                    onChange={(e) => setFormManagementReferral(e.target.value as any)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  >
                    <option value="No">No Referral Required</option>
                    <option value="Yes">Yes — Escalate to Headmaster</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Remarks / Administrative Notes</label>
                <input
                  type="text"
                  placeholder="Optional counseling or administrative remarks..."
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#3D4A41]">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="btn-interactive px-4 py-2 rounded-xl text-xs font-semibold text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-interactive px-5 py-2 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] text-white shadow-sm shadow-[#D97745]/20 cursor-pointer disabled:opacity-40"
                >
                  {isSubmitting ? 'Saving...' : editingEntry ? 'Update Follow-up' : 'Save Follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A211C]/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#3D4A41]">
              <div className="flex items-center gap-2">
                <UserX className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-[#F6F3EA] text-sm">Absentee Follow-up Record</h3>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="btn-interactive text-[#9BAE9C] hover:text-[#F6F3EA] p-1.5 rounded-lg hover:bg-[#344038] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[#202822] p-3 rounded-xl border border-[#3D4A41] flex justify-between items-center">
                <div>
                  <div className="font-bold text-[#F6F3EA] text-sm">{selectedDetail.studentName}</div>
                  <div className="text-[11px] text-[#9BAE9C]">
                    Roll #{selectedDetail.registrationId} • {selectedDetail.class}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-rose-400 block">
                    {selectedDetail.absenceCount} Days Absent
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      selectedDetail.currentStatus === 'Resolved / Returned'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : selectedDetail.currentStatus === 'Pending Return'
                        ? 'bg-amber-950 text-amber-400 border-amber-800'
                        : 'bg-rose-950 text-rose-400 border-rose-800'
                    }`}
                  >
                    {selectedDetail.currentStatus}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#202822] p-2.5 rounded-xl border border-[#3D4A41]">
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Reason:</span>
                  <p className="font-medium text-[#F6F3EA]">{selectedDetail.followupReason}</p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Action Taken:</span>
                  <p className="font-medium text-[#F6F3EA]">{selectedDetail.actionTaken}</p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Contact Person:</span>
                  <p className="font-medium text-[#F6F3EA]">{selectedDetail.contactPerson}</p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Expected Return:</span>
                  <p className="font-medium text-emerald-400">{selectedDetail.expectedReturnDate || 'Not specified'}</p>
                </div>
              </div>

              <div>
                <span className="text-[#9BAE9C] block font-medium">Guardian Statement / Response:</span>
                <p className="text-[#F6F3EA] mt-0.5 bg-[#202822] p-2.5 rounded-xl border border-[#3D4A41]">
                  {selectedDetail.responseReceived}
                </p>
              </div>

              {selectedDetail.remarks && (
                <div>
                  <span className="text-[#9BAE9C] block font-medium">Administrative Remarks:</span>
                  <p className="text-[#F6F3EA]/90 mt-0.5">{selectedDetail.remarks}</p>
                </div>
              )}

              {selectedDetail.managementReferral === 'Yes' && (
                <div className="bg-rose-950/40 border border-rose-800 p-2.5 rounded-xl text-rose-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Escalated to Headmaster Office for formal review and counseling.</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  handleOpenWhatsAppAlert(selectedDetail);
                }}
                className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Send WhatsApp Alert</span>
              </button>

              <button
                onClick={() => setSelectedDetail(null)}
                className="btn-interactive px-4 py-1.5 rounded-xl text-xs font-semibold bg-[#202822] text-[#F6F3EA] hover:bg-[#344038] border border-[#3D4A41] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Quick Alert Modal */}
      {whatsAppAlertTarget && (
        <WhatsAppAlertModal
          isOpen={Boolean(whatsAppAlertTarget)}
          onClose={() => setWhatsAppAlertTarget(null)}
          studentName={whatsAppAlertTarget.studentName}
          rollNo={whatsAppAlertTarget.rollNo}
          classLevel={whatsAppAlertTarget.classLevel}
          guardianPhone={whatsAppAlertTarget.phone}
          date={whatsAppAlertTarget.date}
          absenceCount={whatsAppAlertTarget.absenceCount}
          reason={whatsAppAlertTarget.reason}
        />
      )}

      {/* Student Profile & History Modal */}
      {selectedStudentForProfile && (
        <StudentDetailModal
          student={selectedStudentForProfile}
          onClose={() => setSelectedStudentForProfile(null)}
          onOpenWhatsAppAlert={(student) => {
            setWhatsAppAlertTarget({
              studentName: student.name,
              rollNo: student.rollNo,
              classLevel: student.class,
              phone: student.guardianContact || student.phone || '',
              date: new Date().toISOString().split('T')[0],
              absenceCount: 1,
              reason: 'Attendance notification',
            });
          }}
        />
      )}

      {/* Bulk Import Modal */}
      <ModuleImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialModuleType="absentee"
        onImportComplete={loadData}
      />
    </div>
  );
};
