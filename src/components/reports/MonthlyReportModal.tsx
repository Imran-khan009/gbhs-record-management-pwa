import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Printer,
  Calendar,
  Users,
  Award,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  School,
  FileText,
  UserCheck,
  ChevronRight,
  TrendingUp,
  UserX,
} from 'lucide-react';
import {
  MonthlyReportData,
  generateMonthlyReportData,
  exportMonthlyReportToExcel,
  MONTH_NAMES,
} from '../../services/reportService';
import { ClassLevel } from '../../types/student';
import { useSchoolProfile, DEFAULT_CLASSES, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';
import { useAuth } from '../../context/AuthContext';
import { ClassSelector } from '../common/ClassSelector';

interface MonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClass?: string;
}

type ReportTab = 'overview' | 'ledger' | 'teaching' | 'practical' | 'absentee' | 'printPreview';

export const MonthlyReportModal: React.FC<MonthlyReportModalProps> = ({
  isOpen,
  onClose,
  initialClass = 'All',
}) => {
  const { session } = useAuth();
  const { profile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1); // 1-12
  const [selectedClass, setSelectedClass] = useState<string>(initialClass);

  const [reportData, setReportData] = useState<MonthlyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');

  const loadReport = async () => {
    setIsLoading(true);
    try {
      const data = await generateMonthlyReportData(selectedYear, selectedMonth, selectedClass);
      setReportData(data);
    } catch (err) {
      console.error('Failed to generate monthly report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadReport();
    }
  }, [isOpen, selectedYear, selectedMonth, selectedClass]);

  if (!isOpen) return null;

  const handleExportExcel = () => {
    if (!reportData) return;
    exportMonthlyReportToExcel(reportData);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D97745]/10 border border-[#D97745]/20 text-[#D97745] flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Monthly Summary & Performance Report</span>
                <span className="text-[10px] bg-[#D97745]/15 text-[#D97745] border border-[#D97745]/30 px-2 py-0.5 rounded-full font-semibold">
                  Official Records
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Aggregated monthly attendance, curriculum teaching logs, and practical evaluations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-interactive text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Month Select */}
            <div className="flex items-center gap-1.5 bg-slate-850 border border-slate-700 rounded-xl px-2.5 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#9BAE9C]" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1} className="bg-slate-900 text-white">
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Select */}
            <div className="bg-slate-850 border border-slate-700 rounded-xl px-2.5 py-1.5">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                {[2026, 2025, 2024].map((yr) => (
                  <option key={yr} value={yr} className="bg-slate-900 text-white">
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Class Level Filter */}
            <ClassSelector
              selectedClass={selectedClass}
              onSelectClass={(c) => setSelectedClass(c)}
              classes={sortClasses(sanitizeClasses(profile.classes))}
              allOptionLabel="All Classes"
            />
          </div>

          {/* Action Export Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={isLoading || !reportData}
              className="btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#9BAE9C]/30 transition cursor-pointer disabled:opacity-40"
              title="Print official letterhead document or save as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-[#9BAE9C]" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isLoading || !reportData}
              className="btn-interactive flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] text-white shadow-sm shadow-[#D97745]/20 transition cursor-pointer disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Download Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Navigation View Sub-tabs */}
        <div className="flex items-center px-6 border-b border-slate-800 bg-slate-900/60 shrink-0 gap-1 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`btn-interactive py-2.5 px-3 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'overview'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Executive Summary
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`btn-interactive py-2.5 px-3 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ledger'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Attendance Ledger</span>
            {reportData && (
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
                {reportData.studentLedger.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('teaching')}
            className={`btn-interactive py-2.5 px-3 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'teaching'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Teaching Logs</span>
            {reportData && (
              <span className="text-[10px] bg-[#9BAE9C]/20 text-[#9BAE9C] px-1.5 py-0.5 rounded-full border border-[#9BAE9C]/30">
                {reportData.teachingLogs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('practical')}
            className={`btn-interactive py-2.5 px-3 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'practical'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Practical Labs</span>
            {reportData && (
              <span className="text-[10px] bg-amber-950 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-800">
                {reportData.practicalProgress.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('absentee')}
            className={`btn-interactive py-2.5 px-3 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'absentee'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Absentee Outreach</span>
            {reportData && (
              <span className="text-[10px] bg-rose-950 text-rose-400 px-1.5 py-0.5 rounded-full border border-rose-800">
                {reportData.absenteeFollowups.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('printPreview')}
            className={`btn-interactive py-2.5 px-3 font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'printPreview'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Printable Report
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#D97745] mb-2" />
              <p className="text-sm font-semibold">Aggregating Monthly Performance Data...</p>
            </div>
          ) : !reportData ? (
            <div className="text-center py-16 text-slate-500">
              No report data available for the selected month.
            </div>
          ) : activeTab === 'overview' ? (
            <div className="space-y-5">
              {/* Report Header Card */}
              <div className="bg-gradient-to-r from-slate-850 via-slate-800 to-slate-850 p-4 rounded-xl border border-slate-750 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold text-white">
                    {reportData.monthName} {reportData.year} Performance Report
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Scope: <strong className="text-slate-200">{reportData.classLevel}</strong> • Working Days: <strong className="text-white">{reportData.workingDaysCount} Days</strong>
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-[11px] font-mono text-slate-400 block">
                    Generated: {reportData.generatedDate}
                  </span>
                  <span className="text-xs font-semibold text-[#9BAE9C]">
                    Operator: {reportData.operatorName || session?.user?.fullName || session?.user?.email || 'Authorized Operator'}
                  </span>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-850 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Enrolled</span>
                    <Users className="w-4 h-4 text-[#9BAE9C]" />
                  </div>
                  <p className="text-2xl font-bold text-white mt-1.5">{reportData.enrolledStudentsCount}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Registered learners</p>
                </div>

                <div className="bg-slate-850 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Attendance Rate</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className={`text-2xl font-bold mt-1.5 ${reportData.overallAttendancePercentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {reportData.overallAttendancePercentage}%
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{reportData.totalPresents} presents logged</p>
                </div>

                <div className="bg-slate-850 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Curriculum Logs</span>
                    <BookOpen className="w-4 h-4 text-[#D97745]" />
                  </div>
                  <p className="text-2xl font-bold text-[#D97745] mt-1.5">{reportData.teachingSessionsCount}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{reportData.totalTeachingHours} teaching hours</p>
                </div>

                <div className="bg-slate-850 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Practicals</span>
                    <Award className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-2xl font-bold text-amber-400 mt-1.5">{reportData.practicalsConductedCount}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{reportData.practicalsCompletedCount} completed</p>
                </div>
              </div>

              {/* Attendance Details & Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2.5">
                  <h5 className="font-bold text-white uppercase text-[11px] tracking-wider flex items-center justify-between">
                    <span>Monthly Attendance Summary</span>
                    <span className="text-slate-400 font-mono">{reportData.totalAttendanceMarks} Total Marks</span>
                  </h5>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                      <span className="text-emerald-400 font-semibold">Presents</span>
                      <span className="font-bold text-white font-mono">{reportData.totalPresents}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                      <span className="text-rose-400 font-semibold">Absents</span>
                      <span className="font-bold text-white font-mono">{reportData.totalAbsents}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                      <span className="text-amber-400 font-semibold">Leaves / Late</span>
                      <span className="font-bold text-white font-mono">{reportData.totalLeaves}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
                      <span className="text-rose-300 font-semibold">Low Attendance Students (&lt;75%)</span>
                      <span className="font-bold text-rose-400 font-mono">{reportData.lowAttendanceStudentsCount}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2.5">
                  <h5 className="font-bold text-white uppercase text-[11px] tracking-wider">
                    Curriculum Modules Active
                  </h5>
                  <div className="space-y-1.5 pt-1">
                    {reportData.modulesCovered.length === 0 ? (
                      <p className="text-slate-500 italic p-2">No teaching curriculum logs recorded for this month.</p>
                    ) : (
                      reportData.modulesCovered.map((mod, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-slate-900/60 text-slate-300 font-medium flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#9BAE9C] shrink-0" />
                          <span>{mod}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'ledger' ? (
            /* TAB 2: STUDENT ATTENDANCE LEDGER */
            <div className="space-y-3">
              {/* Recorded Activity Dates Badge */}
              <div className="p-3 bg-slate-850/80 rounded-xl border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#9BAE9C] shrink-0" />
                  <span>
                    Recorded Attendance Days (<strong>{reportData.recordedAttendanceDates.length}</strong> days):{' '}
                    {reportData.recordedAttendanceDates.length > 0 ? (
                      <span className="font-mono text-white text-[11px] font-semibold">{reportData.recordedAttendanceDates.join(', ')}</span>
                    ) : (
                      <span className="italic text-slate-500">No attendance saved for this month</span>
                    )}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 italic shrink-0">
                  Days with no saved entries have no scheduled/logged activity
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Showing {reportData.studentLedger.length} student records for {reportData.monthName} {reportData.year}</span>
                <span className="text-[11px] text-amber-400 font-medium">
                  {reportData.lowAttendanceStudentsCount} students below 75% threshold
                </span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70">
                <div className="overflow-x-auto max-h-[460px]">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-slate-800 z-10">
                      <tr>
                        <th className="px-3.5 py-2.5">Roll #</th>
                        <th className="px-3.5 py-2.5">Student Name</th>
                        <th className="px-3.5 py-2.5">Father's Name</th>
                        <th className="px-3.5 py-2.5">Class</th>
                        <th className="px-3.5 py-2.5 text-center">Days</th>
                        <th className="px-3.5 py-2.5 text-center text-emerald-400">Presents</th>
                        <th className="px-3.5 py-2.5 text-center text-rose-400">Absents</th>
                        <th className="px-3.5 py-2.5 text-center">Att %</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {reportData.studentLedger.map((row) => (
                        <tr key={row.studentId} className="hover:bg-slate-850/50 transition">
                          <td className="px-3.5 py-2 font-mono font-bold text-white">{row.rollNo}</td>
                          <td className="px-3.5 py-2 font-semibold text-white">{row.name}</td>
                          <td className="px-3.5 py-2 text-slate-400">{row.fatherName}</td>
                          <td className="px-3.5 py-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#9BAE9C]/15 text-[#9BAE9C] border border-[#9BAE9C]/30">
                              {row.class}
                            </span>
                          </td>
                          <td className="px-3.5 py-2 text-center font-mono text-slate-300">{row.totalDays}</td>
                          <td className="px-3.5 py-2 text-center font-mono font-bold text-emerald-400">{row.presentDays}</td>
                          <td className="px-3.5 py-2 text-center font-mono font-bold text-rose-400">{row.absentDays}</td>
                          <td className="px-3.5 py-2 text-center font-mono font-bold">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] ${
                                row.attendancePercentage >= 75
                                  ? 'text-emerald-400 bg-emerald-950/60'
                                  : 'text-rose-400 bg-rose-950/80 border border-rose-800'
                              }`}
                            >
                              {row.attendancePercentage}%
                            </span>
                          </td>
                          <td className="px-3.5 py-2">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                row.status.includes('Critical')
                                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                  : row.status.includes('Risk')
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-emerald-950/60 text-emerald-400'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'teaching' ? (
            /* TAB 3: TEACHING LOGS */
            <div className="space-y-3">
              <div className="p-3 bg-slate-850/80 rounded-xl border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>
                    Recorded Teaching Dates (<strong>{reportData.recordedTeachingDates.length}</strong> active days):{' '}
                    {reportData.recordedTeachingDates.length > 0 ? (
                      <span className="font-mono text-white text-[11px] font-semibold">{reportData.recordedTeachingDates.join(', ')}</span>
                    ) : (
                      <span className="italic text-slate-500">No teaching logs saved for this month</span>
                    )}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 italic shrink-0">
                  Days with no entries have no recorded instruction
                </span>
              </div>

              {reportData.teachingLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-slate-800 rounded-xl bg-slate-950/50">
                  No curriculum teaching logs recorded for {reportData.monthName} {reportData.year}.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70">
                  <div className="overflow-x-auto max-h-[460px]">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-slate-800 z-10">
                        <tr>
                          <th className="px-3.5 py-2.5">Date</th>
                          <th className="px-3.5 py-2.5">Class</th>
                          <th className="px-3.5 py-2.5">Day</th>
                          <th className="px-3.5 py-2.5">Subject / Topic</th>
                          <th className="px-3.5 py-2.5">Practical Activity</th>
                          <th className="px-3.5 py-2.5 text-center">Present / Enrolled</th>
                          <th className="px-3.5 py-2.5">Instructor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {reportData.teachingLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-850/50 transition">
                            <td className="px-3.5 py-2 font-mono text-slate-300 whitespace-nowrap">{log.date}</td>
                            <td className="px-3.5 py-2 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#9BAE9C]/20 text-[#9BAE9C] border border-[#9BAE9C]/30">
                                {log.class}
                              </span>
                            </td>
                            <td className="px-3.5 py-2 whitespace-nowrap text-slate-300">{log.day}</td>
                            <td className="px-3.5 py-2 font-semibold text-white">{log.subjectTopic}</td>
                            <td className="px-3.5 py-2 text-slate-400">{log.practicalActivity || log.theoryCovered || '—'}</td>
                            <td className="px-3.5 py-2 text-center font-mono font-bold text-[#9BAE9C]">
                              {log.studentsPresent} <span className="text-[10px] text-slate-500 font-normal">/ {log.totalRegistered}</span>
                            </td>
                            <td className="px-3.5 py-2 text-slate-400 whitespace-nowrap">{log.instructorName || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'practical' ? (
            /* TAB 4: PRACTICAL LABS */
            <div className="space-y-3">
              <div className="p-3 bg-slate-850/80 rounded-xl border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Recorded Practical Dates (<strong>{reportData.recordedPracticalDates.length}</strong> active days):{' '}
                    {reportData.recordedPracticalDates.length > 0 ? (
                      <span className="font-mono text-white text-[11px] font-semibold">{reportData.recordedPracticalDates.join(', ')}</span>
                    ) : (
                      <span className="italic text-slate-500">No practical assessments saved for this month</span>
                    )}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 italic shrink-0">
                  Days with no entries have no recorded practical evaluations
                </span>
              </div>

              {reportData.practicalProgress.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-slate-800 rounded-xl bg-slate-950/50">
                  No practical lab skill evaluations recorded for {reportData.monthName} {reportData.year}.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70">
                  <div className="overflow-x-auto max-h-[460px]">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-slate-800 z-10">
                        <tr>
                          <th className="px-3.5 py-2.5">Date</th>
                          <th className="px-3.5 py-2.5">Class</th>
                          <th className="px-3.5 py-2.5">Reg / Roll</th>
                          <th className="px-3.5 py-2.5">Student Name</th>
                          <th className="px-3.5 py-2.5">Practical Skill Task</th>
                          <th className="px-3.5 py-2.5 text-center">Attempt</th>
                          <th className="px-3.5 py-2.5 text-center">Marks</th>
                          <th className="px-3.5 py-2.5">Skill Status</th>
                          <th className="px-3.5 py-2.5 text-center">Completed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {reportData.practicalProgress.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-850/50 transition">
                            <td className="px-3.5 py-2 font-mono text-slate-300 whitespace-nowrap">{p.assessmentDate}</td>
                            <td className="px-3.5 py-2 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-800">
                                {p.class}
                              </span>
                            </td>
                            <td className="px-3.5 py-2 font-mono font-bold text-white whitespace-nowrap">{p.registrationId}</td>
                            <td className="px-3.5 py-2 font-semibold text-white whitespace-nowrap">{p.studentName}</td>
                            <td className="px-3.5 py-2 text-slate-200 max-w-[200px] truncate" title={p.skillTask}>{p.skillTask}</td>
                            <td className="px-3.5 py-2 text-center font-mono">#{p.attemptNumber}</td>
                            <td className="px-3.5 py-2 text-center font-mono font-bold text-amber-400">{p.scoreMarks} / 100</td>
                            <td className="px-3.5 py-2 whitespace-nowrap">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                                p.skillStatus === 'Proficient'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : p.skillStatus === 'Competent'
                                  ? 'bg-[#9BAE9C]/15 text-[#9BAE9C] border border-[#9BAE9C]/30'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}>
                                {p.skillStatus}
                              </span>
                            </td>
                            <td className="px-3.5 py-2 text-center font-semibold text-[11px] text-slate-300">{p.practicalCompleted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'absentee' ? (
            /* TAB 5: ABSENTEE OUTREACH */
            <div className="space-y-3">
              <div className="p-3 bg-slate-850/80 rounded-xl border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Recorded Follow-up Dates (<strong>{reportData.recordedFollowupDates.length}</strong> active days):{' '}
                    {reportData.recordedFollowupDates.length > 0 ? (
                      <span className="font-mono text-white text-[11px] font-semibold">{reportData.recordedFollowupDates.join(', ')}</span>
                    ) : (
                      <span className="italic text-slate-500">No absentee follow-up records saved for this month</span>
                    )}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 italic shrink-0">
                  Days with no entries have no recorded guardian outreach
                </span>
              </div>

              {reportData.absenteeFollowups.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-slate-800 rounded-xl bg-slate-950/50">
                  No absentee outreach records found for {reportData.monthName} {reportData.year}.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70">
                  <div className="overflow-x-auto max-h-[460px]">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-slate-800 z-10">
                        <tr>
                          <th className="px-3.5 py-2.5">Date</th>
                          <th className="px-3.5 py-2.5">Class</th>
                          <th className="px-3.5 py-2.5">Student Name</th>
                          <th className="px-3.5 py-2.5">Reason for Absence</th>
                          <th className="px-3.5 py-2.5">Action Taken</th>
                          <th className="px-3.5 py-2.5">Contact Person</th>
                          <th className="px-3.5 py-2.5">Expected Return</th>
                          <th className="px-3.5 py-2.5">Current Status</th>
                          <th className="px-3.5 py-2.5 text-center">Referral</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {reportData.absenteeFollowups.map((f) => (
                          <tr key={f.id} className="hover:bg-slate-850/50 transition">
                            <td className="px-3.5 py-2 font-mono text-slate-300 whitespace-nowrap">{f.date}</td>
                            <td className="px-3.5 py-2 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-400 border border-rose-800">
                                {f.class}
                              </span>
                            </td>
                            <td className="px-3.5 py-2 font-semibold text-white whitespace-nowrap">{f.studentName}</td>
                            <td className="px-3.5 py-2 text-slate-300 max-w-[150px] truncate">{f.followupReason}</td>
                            <td className="px-3.5 py-2 text-slate-300 whitespace-nowrap">{f.actionTaken}</td>
                            <td className="px-3.5 py-2 text-slate-400 whitespace-nowrap">{f.contactPerson}</td>
                            <td className="px-3.5 py-2 font-mono text-slate-300 whitespace-nowrap">{f.expectedReturnDate || '—'}</td>
                            <td className="px-3.5 py-2 whitespace-nowrap">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                                f.currentStatus === 'Resolved / Returned'
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                  : f.currentStatus === 'Escalated'
                                  ? 'bg-rose-950 text-rose-400 border-rose-800'
                                  : 'bg-amber-950 text-amber-400 border-amber-800'
                              }`}>
                                {f.currentStatus}
                              </span>
                            </td>
                            <td className="px-3.5 py-2 text-center">
                              {f.managementReferral === 'Yes' ? (
                                <span className="text-[10px] bg-rose-950 text-rose-300 px-1.5 py-0.5 rounded font-bold border border-rose-800">YES</span>
                              ) : (
                                <span className="text-[10px] text-slate-500">No</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* TAB 3: OFFICIAL PRINT PREVIEW */
            <div id="gbhs-printable-report" className="bg-white text-slate-900 p-8 rounded-xl shadow-lg space-y-6 font-sans">
              {/* Header Letterhead */}
              <div className="border-b-2 border-slate-900 pb-4 text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  {profile.logoUrl && (
                    <img
                      src={profile.logoUrl}
                      alt="School Logo"
                      className="w-12 h-12 object-contain rounded-full border border-slate-300"
                    />
                  )}
                  <div className="text-center">
                    <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">
                      {(profile.schoolName || reportData.schoolName).toUpperCase()}
                    </h1>
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-widest mt-0.5">
                      District: {profile.district} • EMIS: {profile.emisCode || 'GBHS-MAIN'} • {profile.consoleTitle || 'Computer Operator Console'}
                    </p>
                  </div>
                </div>
                <div className="mt-1 text-sm font-bold bg-slate-100 py-1 px-4 inline-block rounded-md border border-slate-300">
                  MONTHLY ATTENDANCE & CURRICULUM REPORT: {reportData.monthName.toUpperCase()} {reportData.year}
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-3 gap-4 text-xs border border-slate-300 p-3 rounded-lg bg-slate-50">
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Scope / Class:</span>
                  <span className="font-bold text-slate-800">{reportData.classLevel}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Total Working Days:</span>
                  <span className="font-bold text-slate-800">{reportData.workingDaysCount} School Days</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Total Enrolled:</span>
                  <span className="font-bold text-slate-800">{reportData.enrolledStudentsCount} Students</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Monthly Attendance %:</span>
                  <span className="font-bold text-slate-900 text-sm">{reportData.overallAttendancePercentage}%</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Curriculum Lectures:</span>
                  <span className="font-bold text-slate-800">{reportData.teachingSessionsCount} Lectures Conducted</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">At-Risk (&lt;75% Att):</span>
                  <span className="font-bold text-rose-700">{reportData.lowAttendanceStudentsCount} Students</span>
                </div>
              </div>

              {/* Printable Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2 text-slate-800 border-b border-slate-300 pb-1">
                  Student Attendance Ledger ({reportData.monthName} {reportData.year})
                </h3>
                <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                  <thead className="bg-slate-100 uppercase text-[9px] font-bold">
                    <tr>
                      <th className="border border-slate-300 px-2 py-1.5 w-12 text-center">Roll #</th>
                      <th className="border border-slate-300 px-2 py-1.5">Student Name</th>
                      <th className="border border-slate-300 px-2 py-1.5">Father's Name</th>
                      <th className="border border-slate-300 px-2 py-1.5 w-16">Class</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-center w-12">Presents</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-center w-12">Absents</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-center w-16">Att %</th>
                      <th className="border border-slate-300 px-2 py-1.5 w-24">Evaluation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.studentLedger.map((s) => (
                      <tr key={s.studentId} className="even:bg-slate-50">
                        <td className="border border-slate-300 px-2 py-1 text-center font-bold">{s.rollNo}</td>
                        <td className="border border-slate-300 px-2 py-1 font-semibold">{s.name}</td>
                        <td className="border border-slate-300 px-2 py-1 text-slate-600">{s.fatherName}</td>
                        <td className="border border-slate-300 px-2 py-1">{s.class}</td>
                        <td className="border border-slate-300 px-2 py-1 text-center font-bold text-emerald-700">{s.presentDays}</td>
                        <td className="border border-slate-300 px-2 py-1 text-center font-bold text-rose-700">{s.absentDays}</td>
                        <td className="border border-slate-300 px-2 py-1 text-center font-bold">{s.attendancePercentage}%</td>
                        <td className="border border-slate-300 px-2 py-1 text-[10px] font-semibold">{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signature Footers */}
              <div className="pt-10 flex justify-between items-end text-xs text-slate-800 border-t border-slate-300">
                <div className="text-center">
                  <div className="w-48 border-b border-slate-900 pb-1 mb-1 font-bold">
                    {session?.user?.fullName || 'Authorized Operator'}
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Authorized Computer Operator</span>
                </div>

                <div className="text-center">
                  <div className="w-48 border-b border-slate-900 pb-1 mb-1 font-bold">
                    {profile.principalName}
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Headmaster / Principal</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
