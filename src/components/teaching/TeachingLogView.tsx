import React, { useState, useEffect } from 'react';
import { ClassLevel } from '../../types/student';
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
} from 'lucide-react';

export const TeachingLogView: React.FC = () => {
  const { session } = useAuth();
  const [logs, setLogs] = useState<TeachingLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [classCounts, setClassCounts] = useState<{ all: number; class7: number; class8: number; class9: number }>({
    all: 0,
    class7: 0,
    class8: 0,
    class9: 0,
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TeachingLogEntry | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<TeachingLogEntry | null>(null);

  // Form Fields
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDay, setFormDay] = useState(
    new Date().toLocaleDateString('en-US', { weekday: 'long' })
  );
  const [formClass, setFormClass] = useState<ClassLevel>('Class 7');
  const [formSubjectTopic, setFormSubjectTopic] = useState('');
  const [formLearningObjectives, setFormLearningObjectives] = useState('');
  const [formTheoryCovered, setFormTheoryCovered] = useState('');
  const [formPracticalActivity, setFormPracticalActivity] = useState('');
  const [formTotalRegistered, setFormTotalRegistered] = useState(28);
  const [formStudentsPresent, setFormStudentsPresent] = useState(26);
  const [formStudentsCompletingTask, setFormStudentsCompletingTask] = useState(24);
  const [formStudentsNeedingHelp, setFormStudentsNeedingHelp] = useState(2);
  const [formTeachingMethod, setFormTeachingMethod] = useState('Demonstration & Hands-on Lab');
  const [formIssueChallenge, setFormIssueChallenge] = useState('');
  const [formEvidenceFileName, setFormEvidenceFileName] = useState('');
  const [formNextLesson, setFormNextLesson] = useState('');
  const [formInstructorName, setFormInstructorName] = useState(
    session?.user.fullName || 'Engr. Imran Tareen'
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await fetchTeachingLogs(selectedClass);
      setLogs(data);

      const all = await fetchTeachingLogs('All');
      setClassCounts({
        all: all.length,
        class7: all.filter((l) => l.class === 'Class 7').length,
        class8: all.filter((l) => l.class === 'Class 8').length,
        class9: all.filter((l) => l.class === 'Class 9').length,
      });
    } catch (err) {
      console.error('Failed to load teaching logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
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

  const handleOpenCreateModal = async () => {
    setEditingEntry(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormDay(new Date().toLocaleDateString('en-US', { weekday: 'long' }));
    const defaultCls = selectedClass !== 'All' ? selectedClass : 'Class 7';
    setFormClass(defaultCls);

    // Auto calculate enrolled count for that class from DB
    try {
      const students = await getAllStudents();
      const count = students.filter((s) => s.class === defaultCls).length;
      if (count > 0) {
        setFormTotalRegistered(count);
        setFormStudentsPresent(Math.max(1, count - 2));
        setFormStudentsCompletingTask(Math.max(1, count - 4));
        setFormStudentsNeedingHelp(2);
      }
    } catch (e) {}

    setFormSubjectTopic('');
    setFormLearningObjectives('');
    setFormTheoryCovered('');
    setFormPracticalActivity('');
    setFormTeachingMethod('Demonstration & Hands-on Lab');
    setFormIssueChallenge('');
    setFormEvidenceFileName('');
    setFormNextLesson('');
    setFormInstructorName(session?.user.fullName || 'Engr. Imran Tareen');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (entry: TeachingLogEntry) => {
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
          instructorName: formInstructorName.trim() || 'Engr. Imran Tareen',
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
          instructorName: formInstructorName.trim() || 'Engr. Imran Tareen',
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shadow-inner">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Teaching Log Module</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-950 text-sky-400 border border-sky-800 font-mono font-medium">
                  Official Record
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Record daily lectures, covered theory, practical activities, and student metrics across classes
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => exportTeachingLogsToExcel(filteredLogs, selectedClass)}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition cursor-pointer disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export Sheet</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-md shadow-sky-950/50 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lecture Log</span>
          </button>
        </div>
      </div>

      {/* Class Switching Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800">
        <ClassTabs
          selectedClass={selectedClass}
          onSelectClass={setSelectedClass}
          counts={classCounts}
        />

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topic, activity, instructor..."
            className="w-full bg-slate-850 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Lectures Recorded</span>
            <BookOpen className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{totalLectures}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {selectedClass === 'All' ? 'Across all 3 classes' : `For ${selectedClass}`}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Avg Attendance Rate</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{avgAttendance}%</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Learners present in class</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Task Completion</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-indigo-400 mt-2">{avgCompletion}%</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Hands-on practical output</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Needed Remedial Help</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{totalNeedHelp}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Student support instances</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-850/80 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
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
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    Loading teaching log entries...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    No teaching logs found for this filter. Click "Add Lecture Log" to record a session.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const completionRate = log.studentsPresent
                    ? Math.round((log.studentsCompletingTask / log.studentsPresent) * 100)
                    : 0;

                  return (
                    <tr key={log.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px]">
                        <div className="font-semibold text-white">{log.date}</div>
                        <div className="text-[10px] text-slate-500">{log.day}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            log.class === 'Class 7'
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                              : log.class === 'Class 8'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                          }`}
                        >
                          {log.class}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate" title={log.subjectTopic}>
                        {log.subjectTopic}
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-[180px] truncate" title={log.theoryCovered}>
                        {log.theoryCovered}
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-[180px] truncate" title={log.practicalActivity}>
                        {log.practicalActivity}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap font-mono">
                        <span className="font-bold text-emerald-400">{log.studentsPresent}</span>
                        <span className="text-slate-500"> / {log.totalRegistered}</span>
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
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap text-[11px]">
                        {log.teachingMethod}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{log.instructorName}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedDetail(log)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition"
                            title="View Full Details"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(log)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                            title="Edit Log"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(log.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-white text-sm">
                  {editingEntry ? 'Edit Teaching Log Entry' : 'Record New Lecture / Lab Session'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Day</label>
                  <input
                    type="text"
                    required
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Class</label>
                  <select
                    value={formClass}
                    onChange={(e) => setFormClass(e.target.value as ClassLevel)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="Class 7">Class 7th</option>
                    <option value="Class 8">Class 8th</option>
                    <option value="Class 9">Class 9th</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">Subject / Topic</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Hardware & Peripheral Devices"
                  value={formSubjectTopic}
                  onChange={(e) => setFormSubjectTopic(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">Learning Objectives</label>
                <textarea
                  rows={2}
                  placeholder="Specific learning goals for this lecture session..."
                  value={formLearningObjectives}
                  onChange={(e) => setFormLearningObjectives(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Student Attendance & Output Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-850 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Total Registered</label>
                  <input
                    type="number"
                    min="1"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Evidence File Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. lab_session_photo_01.jpg"
                    value={formEvidenceFileName}
                    onChange={(e) => setFormEvidenceFileName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Next Lesson Plan</label>
                  <input
                    type="text"
                    placeholder="Topic for upcoming lecture..."
                    value={formNextLesson}
                    onChange={(e) => setFormNextLesson(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md disabled:opacity-40"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-white text-sm">Lecture Log Details</h3>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400">Date & Class:</span>
                <span className="font-semibold text-white">
                  {selectedDetail.date} ({selectedDetail.day}) — <strong className="text-sky-400">{selectedDetail.class}</strong>
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Topic:</span>
                <p className="text-white font-semibold mt-0.5">{selectedDetail.subjectTopic}</p>
              </div>
              {selectedDetail.learningObjectives && (
                <div>
                  <span className="text-slate-400 block font-medium">Learning Objectives:</span>
                  <p className="text-slate-200 mt-0.5">{selectedDetail.learningObjectives}</p>
                </div>
              )}
              <div>
                <span className="text-slate-400 block font-medium">Theory Covered:</span>
                <p className="text-slate-200 mt-0.5">{selectedDetail.theoryCovered}</p>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Practical Activity:</span>
                <p className="text-slate-200 mt-0.5">{selectedDetail.practicalActivity}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-850 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 text-[11px]">Attendance:</span>
                  <p className="font-bold text-white text-sm">
                    {selectedDetail.studentsPresent} / {selectedDetail.totalRegistered}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Tasks Completed:</span>
                  <p className="font-bold text-emerald-400 text-sm">{selectedDetail.studentsCompletingTask}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Needed Support:</span>
                  <p className="font-bold text-amber-400 text-sm">{selectedDetail.studentsNeedingHelp}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Instructor:</span>
                  <p className="font-bold text-white text-sm">{selectedDetail.instructorName}</p>
                </div>
              </div>

              {selectedDetail.nextLesson && (
                <div>
                  <span className="text-slate-400 block font-medium">Next Lesson:</span>
                  <p className="text-sky-300 mt-0.5 font-medium">{selectedDetail.nextLesson}</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedDetail(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
