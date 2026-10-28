import React, { useState, useEffect } from 'react';
import { ClassLevel, Student } from '../../types/student';
import { TeachingLogEntry } from '../../types/modules';
import {
  fetchTeachingLogs,
  createTeachingLog,
  updateTeachingLog,
  deleteTeachingLog,
  exportTeachingLogsToExcel,
} from '../../services/modulesService';
import { getAllStudents } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { getWorkspacePermissions } from '../../services/permissionService';
import { useSchoolProfile } from '../../services/schoolProfileService';
import { ClassTabs, ClassFilter } from '../common/ClassTabs';
import {
  BookOpen,
  Plus,
  FileSpreadsheet,
  Search,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  Sparkles,
  ChevronRight,
  Trash2,
  Edit,
  X,
  FileText,
  HelpCircle,
  Activity,
  Download,
  Upload,
} from 'lucide-react';
import { downloadTeachingLogTemplate } from '../../services/bulkModuleImportService';
import { ModuleImportModal } from '../import/ModuleImportModal';
import { DEFAULT_CLASSES, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';
import { getClassBadgeColor } from '../../services/classNormalizationService';

export const TeachingLogView: React.FC = () => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);
  const { profile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);

  const availableClasses = sortClasses(sanitizeClasses(profile.classes));

  const [logs, setLogs] = useState<TeachingLogEntry[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [classCounts, setClassCounts] = useState<{ all: number; [key: string]: number }>({
    all: 0,
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TeachingLogEntry | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<TeachingLogEntry | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Form Fields
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDay, setFormDay] = useState(
    new Date().toLocaleDateString('en-US', { weekday: 'long' })
  );
  const [formClass, setFormClass] = useState<ClassLevel>(() => availableClasses[0] || 'Class 1');
  const [formSubjectTopic, setFormSubjectTopic] = useState('');
  const [formLearningObjectives, setFormLearningObjectives] = useState('');
  const [formTheoryCovered, setFormTheoryCovered] = useState('');
  const [formPracticalActivity, setFormPracticalActivity] = useState('');
  const [formTotalRegistered, setFormTotalRegistered] = useState(0);
  const [formStudentsPresent, setFormStudentsPresent] = useState(0);
  const [formStudentsCompletingTask, setFormStudentsCompletingTask] = useState(0);
  const [formStudentsNeedingHelp, setFormStudentsNeedingHelp] = useState(0);
  const [formTeachingMethod, setFormTeachingMethod] = useState('Demonstration & Hands-on Lab');
  const [formIssueChallenge, setFormIssueChallenge] = useState('');
  const [formEvidenceFileName, setFormEvidenceFileName] = useState('');
  const [formNextLesson, setFormNextLesson] = useState('');
  const [formInstructorName, setFormInstructorName] = useState(
    session?.user.fullName || session?.user.email || profile.principalName || 'Lead Instructor'
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const [data, all, students] = await Promise.all([
        fetchTeachingLogs(selectedClass),
        fetchTeachingLogs('All'),
        getAllStudents(),
      ]);
      setLogs(data);
      setAllStudents(students);

      const dynamicCounts: Record<string, number> = { all: all.length };
      availableClasses.forEach((cls) => {
        const normCls = cls.trim().toLowerCase().replace(/\s+/g, ' ');
        const count = all.filter((l) => (l.class || '').trim().toLowerCase().replace(/\s+/g, ' ') === normCls).length;
        dynamicCounts[cls] = count;
        const rawKey = cls.toLowerCase().replace(/[\s_-]+/g, '');
        dynamicCounts[rawKey] = count;
      });

      setClassCounts(dynamicCounts as any);
    } catch (err) {
      console.error('Failed to load teaching logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    const handleReactivity = () => {
      loadLogs();
    };
    window.addEventListener('gbhs_records_imported', handleReactivity);
    window.addEventListener('gbhs_teaching_changed', handleReactivity);
    return () => {
      window.removeEventListener('gbhs_records_imported', handleReactivity);
      window.removeEventListener('gbhs_teaching_changed', handleReactivity);
    };
  }, [selectedClass]);

  const handleDateChange = (newDate: string) => {
    setFormDate(newDate);
    if (newDate) {
      const d = new Date(newDate);
      if (!isNaN(d.getTime())) {
        setFormDay(d.toLocaleDateString('en-US', { weekday: 'long' }));
      }
    }
  };

  const handleClassChangeInForm = (cls: ClassLevel) => {
    setFormClass(cls);
    const classStudents = allStudents.filter(
      (s) => s.class === cls && (s.status ? s.status === 'Active' : true)
    );
    const count = classStudents.length;
    setFormTotalRegistered(count);
    setFormStudentsPresent(count);
    setFormStudentsCompletingTask(count);
    setFormStudentsNeedingHelp(0);
  };

  const handleOpenCreateModal = async () => {
    if (permissions.isReadOnly) return;
    setEditingEntry(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormDay(new Date().toLocaleDateString('en-US', { weekday: 'long' }));
    const defaultCls = selectedClass !== 'All' ? selectedClass : (availableClasses[0] || 'Class 1');
    setFormClass(defaultCls);

    const classStudents = allStudents.filter(
      (s) => s.class === defaultCls && (s.status ? s.status === 'Active' : true)
    );
    const count = classStudents.length;
    setFormTotalRegistered(count);
    setFormStudentsPresent(count);
    setFormStudentsCompletingTask(count);
    setFormStudentsNeedingHelp(0);

    setFormSubjectTopic('');
    setFormLearningObjectives('');
    setFormTheoryCovered('');
    setFormPracticalActivity('');
    setFormTeachingMethod('Demonstration & Hands-on Lab');
    setFormIssueChallenge('');
    setFormEvidenceFileName('');
    setFormNextLesson('');
    setFormInstructorName(session?.user.fullName || session?.user.email || profile.principalName || 'Lead Instructor');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (entry: TeachingLogEntry) => {
    if (permissions.isReadOnly) return;
    setEditingEntry(entry);
    setFormDate(entry.date);
    setFormDay(entry.day);
    setFormClass(entry.class);
    setFormSubjectTopic(entry.subjectTopic);
    setFormLearningObjectives(entry.learningObjectives);
    setFormTheoryCovered(entry.theoryCovered);
    setFormPracticalActivity(entry.practicalActivity);
    setFormTotalRegistered(entry.totalRegistered);
    setFormStudentsPresent(entry.studentsPresent);
    setFormStudentsCompletingTask(entry.studentsCompletingTask);
    setFormStudentsNeedingHelp(entry.studentsNeedingHelp);
    setFormTeachingMethod(entry.teachingMethod);
    setFormIssueChallenge(entry.issueChallenge || '');
    setFormEvidenceFileName(entry.evidenceFileName || '');
    setFormNextLesson(entry.nextLesson || '');
    setFormInstructorName(entry.instructorName);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubjectTopic.trim()) {
      setFormError('Subject / Topic is required.');
      return;
    }
    if (!formTheoryCovered.trim()) {
      setFormError('Theory Covered is required.');
      return;
    }
    if (!formPracticalActivity.trim()) {
      setFormError('Practical Activity is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingEntry) {
        const res = await updateTeachingLog(editingEntry.id, {
          date: formDate,
          day: formDay,
          class: formClass,
          subjectTopic: formSubjectTopic.trim(),
          learningObjectives: formLearningObjectives.trim(),
          theoryCovered: formTheoryCovered.trim(),
          practicalActivity: formPracticalActivity.trim(),
          totalRegistered: Number(formTotalRegistered),
          studentsPresent: Number(formStudentsPresent),
          studentsCompletingTask: Number(formStudentsCompletingTask),
          studentsNeedingHelp: Number(formStudentsNeedingHelp),
          teachingMethod: formTeachingMethod,
          issueChallenge: formIssueChallenge.trim() || undefined,
          evidenceFileName: formEvidenceFileName.trim() || undefined,
          nextLesson: formNextLesson.trim() || undefined,
          instructorName: formInstructorName.trim() || session?.user.fullName || session?.user.email || 'Lead Instructor',
        });
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createTeachingLog({
          date: formDate,
          day: formDay,
          class: formClass,
          subjectTopic: formSubjectTopic.trim(),
          learningObjectives: formLearningObjectives.trim(),
          theoryCovered: formTheoryCovered.trim(),
          practicalActivity: formPracticalActivity.trim(),
          totalRegistered: Number(formTotalRegistered),
          studentsPresent: Number(formStudentsPresent),
          studentsCompletingTask: Number(formStudentsCompletingTask),
          studentsNeedingHelp: Number(formStudentsNeedingHelp),
          teachingMethod: formTeachingMethod,
          issueChallenge: formIssueChallenge.trim() || undefined,
          evidenceFileName: formEvidenceFileName.trim() || undefined,
          nextLesson: formNextLesson.trim() || undefined,
          instructorName: formInstructorName.trim() || session?.user.fullName || session?.user.email || 'Lead Instructor',
        });
        if (!res.success) throw new Error(res.error);
      }

      setIsFormOpen(false);
      await loadLogs();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save teaching log entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (permissions.isReadOnly) return;
    if (window.confirm('Are you sure you want to delete this teaching log entry?')) {
      await deleteTeachingLog(id);
      await loadLogs();
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.subjectTopic.toLowerCase().includes(q) ||
      l.theoryCovered.toLowerCase().includes(q) ||
      l.practicalActivity.toLowerCase().includes(q) ||
      l.instructorName.toLowerCase().includes(q) ||
      l.teachingMethod.toLowerCase().includes(q) ||
      l.date.includes(q)
    );
  });

  // Calculate Metrics
  const totalLectures = filteredLogs.length;
  const avgAttendance =
    totalLectures > 0
      ? Math.round(
          (filteredLogs.reduce((acc, curr) => acc + (curr.totalRegistered ? curr.studentsPresent / curr.totalRegistered : 0), 0) /
            totalLectures) *
            100
        )
      : 0;
  const avgCompletion =
    totalLectures > 0
      ? Math.round(
          (filteredLogs.reduce((acc, curr) => acc + (curr.studentsPresent ? curr.studentsCompletingTask / curr.studentsPresent : 0), 0) /
            totalLectures) *
            100
        )
      : 0;
  const totalNeedHelp = filteredLogs.reduce((acc, curr) => acc + (curr.studentsNeedingHelp || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#3D4A41]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#D97745]/15 border border-[#D97745]/30 text-[#D97745] flex items-center justify-center shadow-inner">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#F6F3EA] tracking-tight flex items-center gap-2">
                <span>Teaching Log Module</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D97745]/20 text-[#E48B5D] border border-[#D97745]/40 font-mono font-medium">
                  Official Record
                </span>
              </h1>
              <p className="text-xs text-[#9BAE9C] mt-0.5">
                Record daily lectures, covered theory, practical activities, and student metrics across classes
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => downloadTeachingLogTemplate({ classLevel: selectedClass })}
            className="btn-interactive group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#D97745]/60 cursor-pointer"
            title="Download Teaching Log Excel/CSV Template"
          >
            <Download className="w-3.5 h-3.5 text-[#D97745] transition-transform duration-200 group-hover:scale-110" />
            <span>Template</span>
          </button>

          {permissions.canImport && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="btn-interactive group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 cursor-pointer"
              title="Bulk Import Teaching Logs from Excel or CSV"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400 transition-transform duration-200 group-hover:scale-110" />
              <span>Bulk Import</span>
            </button>
          )}

          {permissions.canExport && (
            <button
              type="button"
              onClick={() => exportTeachingLogsToExcel(filteredLogs, selectedClass)}
              disabled={filteredLogs.length === 0}
              className="btn-interactive group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#3D4A41] hover:border-emerald-500/60 cursor-pointer disabled:opacity-40"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 transition-transform duration-200 group-hover:scale-110" />
              <span>Export Sheet</span>
            </button>
          )}

          {permissions.canAdd && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="btn-interactive group flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
              <span>Add Lecture Log</span>
            </button>
          )}
        </div>
      </div>

      {/* Read-Only Access Banner */}
      {permissions.isReadOnly && (
        <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-xs text-amber-300 flex items-center gap-2.5">
          <span>
            <strong>Approved Staff Access (Read & Export):</strong> You are viewing teaching logs in this shared workspace with read and export permissions. Creating, editing, or deleting lectures can only be performed by the Workspace Owner.
          </span>
        </div>
      )}

      {/* Class Switching Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#2B352E]/60 p-2.5 rounded-2xl border border-[#3D4A41]">
        <ClassTabs
          selectedClass={selectedClass}
          onSelectClass={setSelectedClass}
          classes={availableClasses}
          counts={classCounts}
        />

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-[#9BAE9C] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topic, activity, instructor..."
            className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745]"
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
            <span>Lectures Recorded</span>
            <BookOpen className="w-4 h-4 text-[#D97745]" />
          </div>
          <p className="text-2xl font-bold text-[#F6F3EA] mt-2">{totalLectures}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">
            {selectedClass === 'All' ? 'Across all classes' : `For ${selectedClass}`}
          </p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Avg Attendance Rate</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{avgAttendance}%</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Learners present in class</p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Task Completion</span>
            <CheckCircle2 className="w-4 h-4 text-[#D97745]" />
          </div>
          <p className="text-2xl font-bold text-[#D97745] mt-2">{avgCompletion}%</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Hands-on practical output</p>
        </div>

        <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9BAE9C] text-xs font-medium">
            <span>Needed Remedial Help</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{totalNeedHelp}</p>
          <p className="text-[11px] text-[#9BAE9C] mt-0.5">Student support instances</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#CCD6CD]">
            <thead className="bg-[#202822] text-[#9BAE9C] uppercase text-[10px] font-semibold tracking-wider border-b border-[#3D4A41]">
              <tr>
                <th className="px-4 py-3.5">Date & Day</th>
                <th className="px-4 py-3.5">Class</th>
                <th className="px-4 py-3.5">Subject / Topic</th>
                <th className="px-4 py-3.5">Theory Covered</th>
                <th className="px-4 py-3.5">Practical Activity</th>
                <th className="px-4 py-3.5 text-center">Students (P / Reg)</th>
                <th className="px-4 py-3.5 text-center">Task Done</th>
                <th className="px-4 py-3.5">Teaching Method</th>
                <th className="px-4 py-3.5">Instructor</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3D4A41]/70">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-[#9BAE9C]">
                    Loading teaching log entries...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-[#9BAE9C]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <BookOpen className="w-9 h-9 text-[#9BAE9C] mb-1" />
                      <p className="text-[#F6F3EA] font-semibold text-sm">No teaching logs recorded yet</p>
                      <p className="text-xs text-[#9BAE9C] max-w-md">
                        This module is clean and empty. Real classroom lecture logs will automatically calculate student enrollment numbers directly from your imported Student Master Roster.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const completionRate = log.studentsPresent
                    ? Math.round((log.studentsCompletingTask / log.studentsPresent) * 100)
                    : 0;

                  return (
                    <tr key={log.id} className="hover:bg-[#344038]/50 transition-colors duration-150">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px]">
                        <div className="font-semibold text-[#F6F3EA]">{log.date}</div>
                        <div className="text-[10px] text-[#9BAE9C]">{log.day}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${getClassBadgeColor(log.class)}`}
                        >
                          {log.class}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[#F6F3EA] max-w-[200px] truncate" title={log.subjectTopic}>
                        {log.subjectTopic}
                      </td>
                      <td className="px-4 py-3 text-[#9BAE9C] max-w-[180px] truncate" title={log.theoryCovered}>
                        {log.theoryCovered}
                      </td>
                      <td className="px-4 py-3 text-[#9BAE9C] max-w-[180px] truncate" title={log.practicalActivity}>
                        {log.practicalActivity}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap font-mono">
                        <span className="font-bold text-emerald-400">{log.studentsPresent}</span>
                        <span className="text-[#9BAE9C]"> / {log.totalRegistered}</span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap font-mono">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            completionRate >= 80
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {completionRate}% ({log.studentsCompletingTask})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#CCD6CD] whitespace-nowrap text-[11px]">
                        {log.teachingMethod}
                      </td>
                      <td className="px-4 py-3 text-[#9BAE9C] whitespace-nowrap">{log.instructorName}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDetail(log)}
                            className="btn-interactive p-1.5 rounded-lg text-[#9BAE9C] hover:text-[#D97745] hover:bg-[#202822] cursor-pointer"
                            title="View Full Details"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          {permissions.canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(log)}
                              className="btn-interactive p-1.5 rounded-lg text-[#9BAE9C] hover:text-emerald-400 hover:bg-[#202822] cursor-pointer"
                              title="Edit Log"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {permissions.canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(log.id)}
                              className="btn-interactive p-1.5 rounded-lg text-[#9BAE9C] hover:text-rose-400 hover:bg-[#202822] cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Log Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#3D4A41] flex items-center justify-between sticky top-0 bg-[#2B352E] z-10">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#D97745]" />
                <h3 className="font-bold text-[#F6F3EA] text-sm">
                  {editingEntry ? 'Edit Teaching Log Entry' : 'Record New Lecture / Lab Session'}
                </h3>
              </div>
              <button
                type="button"
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
                  <label className="block text-slate-400 text-xs font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Day</label>
                  <input
                    type="text"
                    required
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Class</label>
                  <select
                    value={formClass}
                    onChange={(e) => handleClassChangeInForm(e.target.value as ClassLevel)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  >
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formTotalRegistered === 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    No active students registered in <strong>{formClass}</strong> in the Student Master Roster. Import roster excel sheet first or adjust student count manually.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">Subject / Topic</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Hardware & Peripheral Devices"
                  value={formSubjectTopic}
                  onChange={(e) => setFormSubjectTopic(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D97745]"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">Learning Objectives</label>
                <textarea
                  rows={2}
                  placeholder="Specific learning goals for this lecture session..."
                  value={formLearningObjectives}
                  onChange={(e) => setFormLearningObjectives(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D97745]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Theory Covered</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Theoretical concepts, definitions, explanations..."
                    value={formTheoryCovered}
                    onChange={(e) => setFormTheoryCovered(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Practical Activity</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Hands-on lab exercises and student tasks..."
                    value={formPracticalActivity}
                    onChange={(e) => setFormPracticalActivity(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  />
                </div>
              </div>

              {/* Student Attendance & Output Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-850 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Total Registered</label>
                  <input
                    type="number"
                    min="0"
                    value={formTotalRegistered}
                    onChange={(e) => setFormTotalRegistered(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-emerald-400 mb-1">Students Present</label>
                  <input
                    type="number"
                    min="0"
                    value={formStudentsPresent}
                    onChange={(e) => setFormStudentsPresent(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-indigo-400 mb-1">Task Completed</label>
                  <input
                    type="number"
                    min="0"
                    value={formStudentsCompletingTask}
                    onChange={(e) => setFormStudentsCompletingTask(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-indigo-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-amber-400 mb-1">Needing Help</label>
                  <input
                    type="number"
                    min="0"
                    value={formStudentsNeedingHelp}
                    onChange={(e) => setFormStudentsNeedingHelp(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Teaching Method</label>
                  <select
                    value={formTeachingMethod}
                    onChange={(e) => setFormTeachingMethod(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  >
                    <option value="Demonstration & Hands-on Lab">Demonstration & Hands-on Lab</option>
                    <option value="Interactive Lecture">Interactive Lecture</option>
                    <option value="Guided Practice">Guided Practice</option>
                    <option value="Project-Based Learning">Project-Based Learning</option>
                    <option value="Assessment & Skill Evaluation">Assessment & Skill Evaluation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Instructor Name</label>
                  <input
                    type="text"
                    required
                    value={formInstructorName}
                    onChange={(e) => setFormInstructorName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Issues / Challenges (Optional)</label>
                  <input
                    type="text"
                    placeholder="Power, hardware, software issues..."
                    value={formIssueChallenge}
                    onChange={(e) => setFormIssueChallenge(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Evidence File Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. lab_session_photo_01.jpg"
                    value={formEvidenceFileName}
                    onChange={(e) => setFormEvidenceFileName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Next Lesson Plan</label>
                  <input
                    type="text"
                    placeholder="Topic for upcoming lecture..."
                    value={formNextLesson}
                    onChange={(e) => setFormNextLesson(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D97745]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#3D4A41]">
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
                  className="btn-interactive px-5 py-2 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white shadow-xs disabled:opacity-40 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingEntry ? 'Update Entry' : 'Save Teaching Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#3D4A41]">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#D97745]" />
                <h3 className="font-bold text-[#F6F3EA] text-sm">Lecture Log Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="btn-interactive text-[#9BAE9C] hover:text-[#F6F3EA] p-1 rounded-lg hover:bg-[#202822] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-[#202822] p-2.5 rounded-xl border border-[#3D4A41]">
                <span className="text-[#9BAE9C]">Date & Class:</span>
                <span className="font-semibold text-[#F6F3EA]">
                  {selectedDetail.date} ({selectedDetail.day}) — <strong className="text-[#D97745]">{selectedDetail.class}</strong>
                </span>
              </div>
              <div>
                <span className="text-[#9BAE9C] block font-medium">Topic:</span>
                <p className="text-[#F6F3EA] font-semibold mt-0.5">{selectedDetail.subjectTopic}</p>
              </div>
              {selectedDetail.learningObjectives && (
                <div>
                  <span className="text-[#9BAE9C] block font-medium">Learning Objectives:</span>
                  <p className="text-[#CCD6CD] mt-0.5">{selectedDetail.learningObjectives}</p>
                </div>
              )}
              <div>
                <span className="text-[#9BAE9C] block font-medium">Theory Covered:</span>
                <p className="text-[#CCD6CD] mt-0.5">{selectedDetail.theoryCovered}</p>
              </div>
              <div>
                <span className="text-[#9BAE9C] block font-medium">Practical Activity:</span>
                <p className="text-[#CCD6CD] mt-0.5">{selectedDetail.practicalActivity}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#202822] p-3 rounded-xl border border-[#3D4A41]">
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Attendance:</span>
                  <p className="font-bold text-[#F6F3EA] text-sm">
                    {selectedDetail.studentsPresent} / {selectedDetail.totalRegistered}
                  </p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Tasks Completed:</span>
                  <p className="font-bold text-emerald-400 text-sm">{selectedDetail.studentsCompletingTask}</p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Needed Support:</span>
                  <p className="font-bold text-amber-400 text-sm">{selectedDetail.studentsNeedingHelp}</p>
                </div>
                <div>
                  <span className="text-[#9BAE9C] text-[11px]">Instructor:</span>
                  <p className="font-bold text-[#F6F3EA] text-sm">{selectedDetail.instructorName}</p>
                </div>
              </div>

              {selectedDetail.nextLesson && (
                <div>
                  <span className="text-[#9BAE9C] block font-medium">Next Lesson:</span>
                  <p className="text-[#D97745] mt-0.5 font-medium">{selectedDetail.nextLesson}</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="btn-interactive px-4 py-1.5 rounded-xl text-xs font-semibold bg-[#202822] text-[#F6F3EA] hover:bg-[#344038] border border-[#3D4A41] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Module Bulk Importer Modal */}
      <ModuleImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialModuleType="teaching_log"
        onImportComplete={loadLogs}
      />
    </div>
  );
};
