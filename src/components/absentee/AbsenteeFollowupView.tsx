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
} from 'lucide-react';

export const AbsenteeFollowupView: React.FC = () => {
  const [followups, setFollowups] = useState<AbsenteeFollowupEntry[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | FollowupStatus>('All');
  const [referralFilter, setReferralFilter] = useState<'All' | 'Yes' | 'No'>('All');
  const [classCounts, setClassCounts] = useState<{ all: number; class7: number; class8: number; class9: number }>({
    all: 0,
    class7: 0,
    class8: 0,
    class9: 0,
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AbsenteeFollowupEntry | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AbsenteeFollowupEntry | null>(null);

  // Form Fields
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formClass, setFormClass] = useState<ClassLevel>('Class 7');
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
      setClassCounts({
        all: all.length,
        class7: all.filter((f) => f.class === 'Class 7').length,
        class8: all.filter((f) => f.class === 'Class 8').length,
        class9: all.filter((f) => f.class === 'Class 9').length,
      });
    } catch (err) {
      console.error('Failed to load absentee follow-ups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedClass]);

  const handleClassChangeInForm = (cls: ClassLevel) => {
    setFormClass(cls);
    const studentsInClass = allStudents.filter((s) => s.class === cls);
    if (studentsInClass.length > 0) {
      const first = studentsInClass[0];
      setFormStudentId(first.id);
      setFormStudentName(first.name);
      setFormRegistrationId(first.rollNo || first.admissionNo);
      setFormContactPerson(
        first.fatherName ? `Father (${first.fatherName})` : 'Guardian'
      );
    } else {
      setFormStudentId('');
      setFormStudentName('');
      setFormRegistrationId('');
      setFormContactPerson('Guardian');
    }
  };

  const handleStudentSelect = (studentId: string) => {
    setFormStudentId(studentId);
    const found = allStudents.find((s) => s.id === studentId);
    if (found) {
      setFormStudentName(found.name);
      setFormRegistrationId(found.rollNo || found.admissionNo);
      setFormContactPerson(
        found.fatherName ? `Father (${found.fatherName})` : 'Guardian'
      );
    }
  };

  const handleOpenCreate = () => {
    setEditingEntry(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    const defaultCls = selectedClass !== 'All' ? selectedClass : 'Class 7';
    setFormClass(defaultCls);

    const studentsInClass = allStudents.filter((s) => s.class === defaultCls);
    if (studentsInClass.length > 0) {
      setFormStudentId(studentsInClass[0].id);
      setFormStudentName(studentsInClass[0].name);
      setFormRegistrationId(studentsInClass[0].rollNo || studentsInClass[0].admissionNo);
      setFormContactPerson(
        studentsInClass[0].fatherName ? `Father (${studentsInClass[0].fatherName})` : 'Father'
      );
    } else {
      setFormStudentId('');
      setFormStudentName('');
      setFormRegistrationId('');
      setFormContactPerson('Guardian');
    }

    setFormAbsenceCount(2);
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
    if (!formStudentName.trim()) {
      setFormError('Please select or specify student name.');
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
    await updateAbsenteeFollowup(entry.id, {
      currentStatus: 'Resolved / Returned',
      remarks: (entry.remarks ? entry.remarks + ' | ' : '') + 'Returned to class on ' + new Date().toISOString().split('T')[0],
    });
    await loadData();
  };

  const handleDelete = async (id: string) => {
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
            onClick={() => exportAbsenteeFollowupsToExcel(filteredFollowups, selectedClass)}
            disabled={filteredFollowups.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition cursor-pointer disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export Sheet</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-md shadow-amber-950/50 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Log Follow-up</span>
          </button>
        </div>
      </div>

      {/* Class Switching Tabs & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800">
        <ClassTabs
          selectedClass={selectedClass}
          onSelectClass={setSelectedClass}
          counts={classCounts}
        />

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-850 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-medium cursor-pointer"
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
            className="bg-slate-850 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-medium cursor-pointer"
          >
            <option value="All">All Referrals</option>
            <option value="Yes">Management Referral</option>
            <option value="No">No Referral</option>
          </select>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student or parent..."
              className="w-full bg-slate-850 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Follow-up Cases</span>
            <UserX className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{totalCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Contact cases documented</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Pending Return</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">{pendingCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Students expected to resume</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Resolved / Returned</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{resolvedCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Successfully rejoined classroom</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Headmaster Referral</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 mt-2">{referralCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Administrative disciplinary cases</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-850/80 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
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
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                    Loading absentee follow-ups...
                  </td>
                </tr>
              ) : filteredFollowups.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                    No absentee records found for this filter. Click "Log Follow-up" to record a guardian contact.
                  </td>
                </tr>
              ) : (
                filteredFollowups.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {item.date}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.class === 'Class 7'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                            : item.class === 'Class 8'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                        }`}
                      >
                        {item.class}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-white whitespace-nowrap">
                      {item.registrationId}
                    </td>
                    <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                      {item.studentName}
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
                    <td className="px-4 py-3 text-slate-300 max-w-[160px] truncate" title={item.followupReason}>
                      {item.followupReason}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-[150px] truncate" title={item.actionTaken}>
                      {item.actionTaken}
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {item.contactPerson}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
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
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {item.currentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.currentStatus === 'Pending Return' && (
                          <button
                            onClick={() => handleQuickResolve(item)}
                            className="px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/80 text-[10px] font-semibold flex items-center gap-1 transition"
                            title="Mark Student as Returned"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Returned</span>
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedDetail(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition"
                          title="View Details"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                          title="Edit"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center gap-2">
                <UserX className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-sm">
                  {editingEntry ? 'Edit Absentee Follow-up' : 'Log Absentee Contact / Outreach'}
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
                  <label className="block text-slate-400 text-xs font-medium mb-1">Follow-up Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Class</label>
                  <select
                    value={formClass}
                    onChange={(e) => handleClassChangeInForm(e.target.value as ClassLevel)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Class 7">Class 7th</option>
                    <option value="Class 8">Class 8th</option>
                    <option value="Class 9">Class 9th</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Days Absent</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={formAbsenceCount}
                    onChange={(e) => setFormAbsenceCount(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-amber-400 font-bold font-mono"
                  />
                </div>
              </div>

              {/* Student Picker */}
              <div className="bg-slate-850 p-3 rounded-xl border border-slate-800 space-y-2">
                <label className="block text-slate-300 text-xs font-medium">Select Student</label>
                <select
                  value={formStudentId}
                  onChange={(e) => handleStudentSelect(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
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

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <label className="text-slate-400 text-[11px] block">Student Name</label>
                    <input
                      type="text"
                      required
                      value={formStudentName}
                      onChange={(e) => setFormStudentName(e.target.value)}
                      placeholder="Student full name"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[11px] block">Roll / Reg #</label>
                    <input
                      type="text"
                      required
                      value={formRegistrationId}
                      onChange={(e) => setFormRegistrationId(e.target.value)}
                      placeholder="Roll or reg number"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Reason for Absence</label>
                  <select
                    value={formFollowupReason}
                    onChange={(e) => setFormFollowupReason(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
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
                  <label className="block text-slate-400 text-xs font-medium mb-1">Action Taken</label>
                  <select
                    value={formActionTaken}
                    onChange={(e) => setFormActionTaken(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
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
                  <label className="block text-slate-400 text-xs font-medium mb-1">Contact Person</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Father (Mehrullah), Guardian"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Expected Return Date</label>
                  <input
                    type="date"
                    value={formExpectedReturnDate}
                    onChange={(e) => setFormExpectedReturnDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">Response Received / Guardian Statement</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Summary of response from father/guardian..."
                  value={formResponseReceived}
                  onChange={(e) => setFormResponseReceived(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Current Status</label>
                  <select
                    value={formCurrentStatus}
                    onChange={(e) => setFormCurrentStatus(e.target.value as FollowupStatus)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Pending Return">Pending Return</option>
                    <option value="Resolved / Returned">Resolved / Returned</option>
                    <option value="Escalated">Escalated</option>
                    <option value="Prolonged Leave">Prolonged Leave</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Management Referral?</label>
                  <select
                    value={formManagementReferral}
                    onChange={(e) => setFormManagementReferral(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="No">No Referral Required</option>
                    <option value="Yes">Yes — Escalate to Headmaster</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">Remarks / Administrative Notes</label>
                <input
                  type="text"
                  placeholder="Optional counseling or administrative remarks..."
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
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
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shadow-md disabled:opacity-40"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserX className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Absentee Follow-up Record</h3>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-850 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white text-sm">{selectedDetail.studentName}</div>
                  <div className="text-[11px] text-slate-400">
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

              <div className="grid grid-cols-2 gap-2 bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 text-[11px]">Reason:</span>
                  <p className="font-medium text-slate-200">{selectedDetail.followupReason}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Action Taken:</span>
                  <p className="font-medium text-slate-200">{selectedDetail.actionTaken}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Contact Person:</span>
                  <p className="font-medium text-slate-200">{selectedDetail.contactPerson}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Expected Return:</span>
                  <p className="font-medium text-emerald-400">{selectedDetail.expectedReturnDate || 'Not specified'}</p>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block font-medium">Guardian Statement / Response:</span>
                <p className="text-white mt-0.5 bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                  {selectedDetail.responseReceived}
                </p>
              </div>

              {selectedDetail.remarks && (
                <div>
                  <span className="text-slate-400 block font-medium">Administrative Remarks:</span>
                  <p className="text-slate-300 mt-0.5">{selectedDetail.remarks}</p>
                </div>
              )}

              {selectedDetail.managementReferral === 'Yes' && (
                <div className="bg-rose-950/40 border border-rose-800 p-2.5 rounded-xl text-rose-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Escalated to Headmaster Office for formal review and counseling.</span>
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
