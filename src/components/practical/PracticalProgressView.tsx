import React, { useState, useEffect } from 'react';
import { ClassLevel, Student } from '../../types/student';
import { PracticalProgressEntry, SkillStatus, PracticalCompletedStatus } from '../../types/modules';
import {
  fetchPracticalProgress,
  createPracticalProgress,
  updatePracticalProgress,
  deletePracticalProgress,
  exportPracticalProgressToExcel,
} from '../../services/modulesService';
import { getAllStudents } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { getWorkspacePermissions } from '../../services/permissionService';
import { useSchoolProfile } from '../../services/schoolProfileService';
import { ClassTabs, ClassFilter } from '../common/ClassTabs';
import {
  Award,
  Plus,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  X,
  FileText,
  Edit,
  Trash2,
  TrendingUp,
  Percent,
  CheckCircle,
  Download,
  Upload,
} from 'lucide-react';
import { StudentDetailModal } from '../students/StudentDetailModal';
import { WhatsAppAlertModal } from '../absentee/WhatsAppAlertModal';
import { downloadPracticalTrackerTemplate } from '../../services/bulkModuleImportService';
import { ModuleImportModal } from '../import/ModuleImportModal';
import { DEFAULT_CLASSES, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';
import { getClassBadgeColor } from '../../services/classNormalizationService';

export const PracticalProgressView: React.FC = () => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);
  const { profile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);

  const availableClasses = sortClasses(sanitizeClasses(profile.classes));

  const [records, setRecords] = useState<PracticalProgressEntry[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | SkillStatus>('All');
  const [remedialFilter, setRemedialFilter] = useState<'All' | 'Yes' | 'No'>('All');
  const [classCounts, setClassCounts] = useState<{ all: number; [key: string]: number }>({
    all: 0,
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PracticalProgressEntry | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PracticalProgressEntry | null>(null);
  const [selectedStudentForModal, setSelectedStudentForModal] = useState<Student | null>(null);
  const [whatsAppStudent, setWhatsAppStudent] = useState<Student | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleOpenStudentDetail = (item: PracticalProgressEntry) => {
    const match = allStudents.find(
      (s) =>
        (item.studentId && s.id === item.studentId) ||
        (item.registrationId && (s.rollNo === item.registrationId || s.admissionNo === item.registrationId)) ||
        s.name.toLowerCase() === item.studentName.toLowerCase()
    );
    if (match) {
      setSelectedStudentForModal(match);
    } else {
      setSelectedStudentForModal({
        id: item.studentId || `temp-${item.id}`,
        name: item.studentName,
        fatherName: '—',
        rollNo: item.registrationId || '—',
        admissionNo: item.registrationId || '—',
        class: item.class,
        section: 'A',
        guardianContact: '',
        phone: '',
        status: 'Active',
        version: 1,
        schoolId: profile.emisCode || 'GBHS-MAIN',
        createdBy: 'system',
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.createdAt || new Date().toISOString(),
      });
    }
  };


  // Form Fields
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formClass, setFormClass] = useState<ClassLevel>(() => availableClasses[0] || 'Class 1');
  const [formStudentId, setFormStudentId] = useState('');
  const [formStudentName, setFormStudentName] = useState('');
  const [formRegistrationId, setFormRegistrationId] = useState('');
  const [formSkillTask, setFormSkillTask] = useState('Touch Typing Speed & Accuracy');
  const [formAttemptNumber, setFormAttemptNumber] = useState(1);
  const [formPracticalCompleted, setFormPracticalCompleted] = useState<PracticalCompletedStatus>('Yes');
  const [formScoreMarks, setFormScoreMarks] = useState<number>(80);
  const [formSkillStatus, setFormSkillStatus] = useState<SkillStatus>('Proficient');
  const [formWeakArea, setFormWeakArea] = useState('');
  const [formRemedialRequired, setFormRemedialRequired] = useState<'Yes' | 'No'>('No');
  const [formReassessmentDate, setFormReassessmentDate] = useState('');
  const [formEvidenceFile, setFormEvidenceFile] = useState('');
  const [formInstructorRemarks, setFormInstructorRemarks] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [prog, students] = await Promise.all([
        fetchPracticalProgress(selectedClass),
        getAllStudents(),
      ]);
      setRecords(prog);
      setAllStudents(students);

      const all = await fetchPracticalProgress('All');
      const dynamicCounts: Record<string, number> = { all: all.length };
      availableClasses.forEach((cls) => {
        const normCls = cls.trim().toLowerCase().replace(/\s+/g, ' ');
        const count = all.filter((r) => (r.class || '').trim().toLowerCase().replace(/\s+/g, ' ') === normCls).length;
        dynamicCounts[cls] = count;
        const rawKey = cls.toLowerCase().replace(/[\s_-]+/g, '');
        dynamicCounts[rawKey] = count;
      });

      setClassCounts(dynamicCounts as any);
    } catch (err) {
      console.error('Failed to load practical progress:', err);
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
    window.addEventListener('gbhs_practical_changed', handleReactivity);
    return () => {
      window.removeEventListener('gbhs_records_imported', handleReactivity);
      window.removeEventListener('gbhs_practical_changed', handleReactivity);
    };
  }, [selectedClass]);

  const handleScoreChange = (score: number) => {
    setFormScoreMarks(score);
    if (score >= 80) {
      setFormSkillStatus('Proficient');
      setFormRemedialRequired('No');
    } else if (score >= 60) {
      setFormSkillStatus('Competent');
    } else if (score > 0) {
      setFormSkillStatus('Needs Improvement');
      setFormRemedialRequired('Yes');
    } else {
      setFormSkillStatus('Not Started');
    }
  };

  const handleClassChangeInForm = (cls: ClassLevel) => {
    setFormClass(cls);
    setFormStudentId('');
    setFormStudentName('');
    setFormRegistrationId('');
  };

  const handleStudentSelect = (studentId: string) => {
    setFormStudentId(studentId);
    if (!studentId) {
      setFormStudentName('');
      setFormRegistrationId('');
      return;
    }
    const found = allStudents.find((s) => s.id === studentId);
    if (found) {
      setFormStudentName(found.name);
      setFormRegistrationId(found.rollNo || found.admissionNo);
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

    setFormSkillTask(
      defaultCls === 'Class 7'
        ? 'Touch Typing Speed & Accuracy Test'
        : defaultCls === 'Class 8'
        ? 'MS Word Document Formatting & Tables'
        : 'Excel Formulas: SUM, AVERAGE, IF'
    );
    setFormAttemptNumber(1);
    setFormPracticalCompleted('Yes');
    setFormScoreMarks(80);
    setFormSkillStatus('Proficient');
    setFormWeakArea('');
    setFormRemedialRequired('No');
    setFormReassessmentDate('');
    setFormEvidenceFile('');
    setFormInstructorRemarks('Assessment completed satisfactorily.');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (entry: PracticalProgressEntry) => {
    if (permissions.isReadOnly) return;
    setEditingEntry(entry);
    setFormDate(entry.assessmentDate);
    setFormClass(entry.class);
    setFormStudentId(entry.studentId || '');
    setFormStudentName(entry.studentName);
    setFormRegistrationId(entry.registrationId);
    setFormSkillTask(entry.skillTask);
    setFormAttemptNumber(entry.attemptNumber);
    setFormPracticalCompleted(entry.practicalCompleted);
    setFormScoreMarks(entry.scoreMarks);
    setFormSkillStatus(entry.skillStatus);
    setFormWeakArea(entry.weakArea || '');
    setFormRemedialRequired(entry.remedialPracticeRequired);
    setFormReassessmentDate(entry.reassessmentDate || '');
    setFormEvidenceFile(entry.evidenceFile || '');
    setFormInstructorRemarks(entry.instructorRemarks || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStudentId || !formStudentName.trim()) {
      setFormError('Please select a student from the Student Master Roster.');
      return;
    }
    if (!formSkillTask.trim()) {
      setFormError('Skill / Practical Task is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingEntry) {
        const res = await updatePracticalProgress(editingEntry.id, {
          assessmentDate: formDate,
          class: formClass,
          studentId: formStudentId || undefined,
          studentName: formStudentName.trim(),
          registrationId: formRegistrationId.trim() || '—',
          skillTask: formSkillTask.trim(),
          attemptNumber: Number(formAttemptNumber),
          practicalCompleted: formPracticalCompleted,
          scoreMarks: Number(formScoreMarks),
          skillStatus: formSkillStatus,
          weakArea: formWeakArea.trim() || undefined,
          remedialPracticeRequired: formRemedialRequired,
          reassessmentDate: formReassessmentDate || undefined,
          evidenceFile: formEvidenceFile.trim() || undefined,
          instructorRemarks: formInstructorRemarks.trim() || undefined,
        });
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createPracticalProgress({
          assessmentDate: formDate,
          class: formClass,
          studentId: formStudentId || undefined,
          studentName: formStudentName.trim(),
          registrationId: formRegistrationId.trim() || '—',
          skillTask: formSkillTask.trim(),
          attemptNumber: Number(formAttemptNumber),
          practicalCompleted: formPracticalCompleted,
          scoreMarks: Number(formScoreMarks),
          skillStatus: formSkillStatus,
          weakArea: formWeakArea.trim() || undefined,
          remedialPracticeRequired: formRemedialRequired,
          reassessmentDate: formReassessmentDate || undefined,
          evidenceFile: formEvidenceFile.trim() || undefined,
          instructorRemarks: formInstructorRemarks.trim() || undefined,
        });
        if (!res.success) throw new Error(res.error);
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save practical progress.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (permissions.isReadOnly) return;
    if (window.confirm('Are you sure you want to delete this practical progress record?')) {
      await deletePracticalProgress(id);
      await loadData();
    }
  };

  const filteredRecords = records.filter((r) => {
    if (statusFilter !== 'All' && r.skillStatus !== statusFilter) return false;
    if (remedialFilter !== 'All' && r.remedialPracticeRequired !== remedialFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.studentName.toLowerCase().includes(q) ||
      r.registrationId.toLowerCase().includes(q) ||
      r.skillTask.toLowerCase().includes(q) ||
      (r.weakArea && r.weakArea.toLowerCase().includes(q))
    );
  });

  // Calculate Metrics
  const totalCount = filteredRecords.length;
  const proficientCount = filteredRecords.filter((r) => r.skillStatus === 'Proficient').length;
  const competentCount = filteredRecords.filter((r) => r.skillStatus === 'Competent').length;
  const remedialCount = filteredRecords.filter((r) => r.remedialPracticeRequired === 'Yes').length;
  const avgScore =
    totalCount > 0
      ? Math.round(filteredRecords.reduce((acc, curr) => acc + (curr.scoreMarks || 0), 0) / totalCount)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-inner">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Practical Progress Tracker</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono font-medium">
                  Skills Assessment
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Track hands-on competencies, attempt numbers, scores, weak areas, and remedial interventions
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => downloadPracticalTrackerTemplate({ classLevel: selectedClass, students: allStudents })}
            className="btn-interactive flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#9BAE9C]/30 cursor-pointer"
            title="Download Practical Tracker Excel/CSV Template with Student Roster"
          >
            <Download className="w-3.5 h-3.5 text-[#9BAE9C]" />
            <span>Template</span>
          </button>

          {permissions.canImport && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="btn-interactive flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#9BAE9C]/30 cursor-pointer"
              title="Bulk Import Practical Progress from Excel or CSV"
            >
              <Upload className="w-3.5 h-3.5 text-[#D97745]" />
              <span>Bulk Import</span>
            </button>
          )}

          {permissions.canExport && (
            <button
              onClick={() => exportPracticalProgressToExcel(filteredRecords, selectedClass)}
              disabled={filteredRecords.length === 0}
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
              <span>Add Assessment</span>
            </button>
          )}
        </div>
      </div>

      {/* Read-Only Access Banner */}
      {permissions.isReadOnly && (
        <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-xs text-amber-300 flex items-center gap-2.5">
          <span>
            <strong>Approved Staff Access (Read & Export):</strong> You are viewing practical progress records in this shared workspace with read and export permissions. Adding, editing, or deleting assessments can only be performed by the Workspace Owner.
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
            <option value="All">All Skill Levels</option>
            <option value="Proficient">Proficient (&gt;=80)</option>
            <option value="Competent">Competent (60-79)</option>
            <option value="Needs Improvement">Needs Improvement (&lt;60)</option>
          </select>

          {/* Remedial Filter */}
          <select
            value={remedialFilter}
            onChange={(e) => setRemedialFilter(e.target.value as any)}
            className="btn-interactive bg-[#202822] border border-[#3D4A41] rounded-xl px-2.5 py-2 text-xs text-[#F6F3EA] font-medium cursor-pointer focus:outline-none focus:border-[#D97745] transition-colors duration-150"
          >
            <option value="All">All Practice States</option>
            <option value="Yes">Remedial Required</option>
            <option value="No">No Remedial Required</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-[#9BAE9C] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student or skill..."
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
            <span>Evaluations Conducted</span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-[#F6F3EA] mt-2">{totalCount}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Average score: <strong className="text-emerald-400">{avgScore} / 100</strong></p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Proficient (80%+)</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{proficientCount}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">
            {totalCount > 0 ? `${Math.round((proficientCount / totalCount) * 100)}% mastery rate` : 'No records'}
          </p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Competent (60-79%)</span>
            <TrendingUp className="w-4 h-4 text-[#9BAE9C]" />
          </div>
          <p className="text-2xl font-bold text-[#9BAE9C] mt-2">{competentCount}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Ready for next skill tier</p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Remedial Practice</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{remedialCount}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Targeted intervention needed</p>
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
                <th className="px-4 py-3.5">Skill / Task Assessed</th>
                <th className="px-4 py-3.5 text-center">Attempt</th>
                <th className="px-4 py-3.5 text-center">Score</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Weak Area</th>
                <th className="px-4 py-3.5 text-center">Remedial</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3D4A41]/80">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-[#9BAE9C]">
                    Loading practical progress records...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-[#9BAE9C]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Award className="w-9 h-9 text-[#9BAE9C]/60 mb-1" />
                      <p className="text-[#F6F3EA] font-semibold text-sm">No practical skill assessments recorded yet</p>
                      <p className="text-xs text-[#9BAE9C] max-w-md">
                        This module is clean and ready. Click "New Practical Assessment" to record individual student hands-on evaluations linked to your imported Student Master Roster.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item) => (
                  <tr key={item.id} className="hover:bg-[#344038]/50 transition-colors duration-150">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-[#9BAE9C]">
                      {item.assessmentDate}
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
                        onClick={() => handleOpenStudentDetail(item)}
                        className="btn-interactive font-medium text-[#F6F3EA] hover:text-[#D97745] hover:underline text-left inline-flex items-center gap-1.5 transition-colors group cursor-pointer"
                        title="Click to view comprehensive student profile & history"
                      >
                        <span>{item.studentName}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[#CCD6CD] max-w-[200px] truncate" title={item.skillTask}>
                      {item.skillTask}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap font-mono text-[#9BAE9C]">
                      #{item.attemptNumber}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 font-mono font-bold text-xs">
                        <span
                          className={
                            item.scoreMarks >= 80
                              ? 'text-emerald-400'
                              : item.scoreMarks >= 60
                              ? 'text-[#9BAE9C]'
                              : 'text-amber-400'
                          }
                        >
                          {item.scoreMarks}
                        </span>
                        <span className="text-[10px] text-[#9BAE9C]/60">/100</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          item.skillStatus === 'Proficient'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                            : item.skillStatus === 'Competent'
                            ? 'bg-[#9BAE9C]/15 text-[#9BAE9C] border-[#9BAE9C]/30'
                            : item.skillStatus === 'Needs Improvement'
                            ? 'bg-rose-950/60 text-rose-400 border-rose-800'
                            : 'bg-[#202822] text-[#9BAE9C] border-[#3D4A41]'
                        }`}
                      >
                        {item.skillStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#9BAE9C] max-w-[150px] truncate" title={item.weakArea || 'None'}>
                      {item.weakArea || '—'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.remedialPracticeRequired === 'Yes'
                            ? 'bg-amber-950/60 text-amber-400 border border-amber-800/80'
                            : 'bg-[#202822] text-[#9BAE9C] border border-[#3D4A41]'
                        }`}
                      >
                        {item.remedialPracticeRequired}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
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

      {/* Add / Edit Assessment Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A211C]/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#3D4A41] flex items-center justify-between sticky top-0 bg-[#2B352E] z-10">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-[#F6F3EA] text-sm">
                  {editingEntry ? 'Edit Practical Assessment' : 'New Practical Skill Assessment'}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Assessment Date</label>
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

              {/* Task & Attempt */}
              <div>
                <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Skill / Practical Task</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Touch Typing 25 WPM, Excel Marksheet Formulas, Windows Navigation"
                  value={formSkillTask}
                  onChange={(e) => setFormSkillTask(e.target.value)}
                  className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Attempt #</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formAttemptNumber}
                    onChange={(e) => setFormAttemptNumber(Number(e.target.value))}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-[#F6F3EA] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Completed?</label>
                  <select
                    value={formPracticalCompleted}
                    onChange={(e) => setFormPracticalCompleted(e.target.value as any)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  >
                    <option value="Yes">Yes (Completed)</option>
                    <option value="No">No</option>
                    <option value="In Progress">In Progress</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Score / Marks (0-100)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formScoreMarks}
                    onChange={(e) => handleScoreChange(Number(e.target.value))}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-emerald-400 font-bold font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Skill Status</label>
                  <select
                    value={formSkillStatus}
                    onChange={(e) => setFormSkillStatus(e.target.value as any)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  >
                    <option value="Proficient">Proficient (&gt;=80)</option>
                    <option value="Competent">Competent (60-79)</option>
                    <option value="Needs Improvement">Needs Improvement (&lt;60)</option>
                    <option value="Not Started">Not Started</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Remedial Required?</label>
                  <select
                    value={formRemedialRequired}
                    onChange={(e) => setFormRemedialRequired(e.target.value as any)}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                  >
                    <option value="No">No Remedial Practice</option>
                    <option value="Yes">Yes — Extra Lab Practice Needed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Weak Area (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Right-hand numeric typing speed, nested formula brackets"
                  value={formWeakArea}
                  onChange={(e) => setFormWeakArea(e.target.value)}
                  className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
                />
              </div>

              <div>
                <label className="block text-[#9BAE9C] text-xs font-medium mb-1">Instructor Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Evaluation notes, feedback, and target goals..."
                  value={formInstructorRemarks}
                  onChange={(e) => setFormInstructorRemarks(e.target.value)}
                  className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745]"
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
                  {isSubmitting ? 'Saving...' : editingEntry ? 'Update Assessment' : 'Save Assessment'}
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
                <Award className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-[#F6F3EA] text-sm">Skill Evaluation Record</h3>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="btn-interactive text-[#9BAE9C] hover:text-[#F6F3EA] p-1 rounded-lg hover:bg-[#202822] cursor-pointer"
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
                  <div className="font-mono text-base font-bold text-emerald-400">{selectedDetail.scoreMarks} / 100</div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      selectedDetail.skillStatus === 'Proficient'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : selectedDetail.skillStatus === 'Competent'
                        ? 'bg-[#9BAE9C]/20 text-[#9BAE9C] border border-[#9BAE9C]/30'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {selectedDetail.skillStatus}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[#9BAE9C] block font-medium">Assessed Task:</span>
                <p className="text-[#F6F3EA] font-semibold mt-0.5">{selectedDetail.skillTask}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#202822] p-2.5 rounded-xl border border-[#3D4A41]">
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Assessment Date:</span>
                  <p className="font-medium text-[#CCD6CD]">{selectedDetail.assessmentDate}</p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Attempt Number:</span>
                  <p className="font-medium text-[#CCD6CD]">Attempt #{selectedDetail.attemptNumber}</p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Completed Status:</span>
                  <p className="font-medium text-emerald-400">{selectedDetail.practicalCompleted}</p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Remedial Practice:</span>
                  <p
                    className={`font-semibold ${
                      selectedDetail.remedialPracticeRequired === 'Yes' ? 'text-amber-400' : 'text-[#CCD6CD]'
                    }`}
                  >
                    {selectedDetail.remedialPracticeRequired}
                  </p>
                </div>
              </div>

              {selectedDetail.weakArea && (
                <div>
                  <span className="text-[#9BAE9C] block font-medium">Identified Weak Area:</span>
                  <p className="text-amber-300 mt-0.5">{selectedDetail.weakArea}</p>
                </div>
              )}

              {selectedDetail.instructorRemarks && (
                <div>
                  <span className="text-[#9BAE9C] block font-medium">Instructor Remarks:</span>
                  <p className="text-[#CCD6CD] mt-0.5">{selectedDetail.instructorRemarks}</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
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

      {/* Student Profile & History Modal */}
      {selectedStudentForModal && (
        <StudentDetailModal
          student={selectedStudentForModal}
          onClose={() => setSelectedStudentForModal(null)}
          onOpenWhatsAppAlert={(s) => setWhatsAppStudent(s)}
        />
      )}

      {/* WhatsApp Quick Alert Modal */}
      {whatsAppStudent && (
        <WhatsAppAlertModal
          isOpen={Boolean(whatsAppStudent)}
          onClose={() => setWhatsAppStudent(null)}
          studentName={whatsAppStudent.name}
          rollNo={whatsAppStudent.rollNo}
          classLevel={whatsAppStudent.class}
          guardianPhone={whatsAppStudent.guardianContact || whatsAppStudent.phone || ''}
          date={new Date().toISOString().split('T')[0]}
          absenceCount={1}
          reason="Practical assessment inquiry"
        />
      )}

      {/* Bulk Import Modal */}
      <ModuleImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialModuleType="practical"
        onImportComplete={loadData}
      />
    </div>
  );
};
