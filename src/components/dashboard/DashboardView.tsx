import React, { useEffect, useState } from 'react';
import { Student, AttendanceRecord, ClassLevel } from '../../types/student';
import { getAllStudents, getAttendanceByDateAndClass, getOutboxOperations } from '../../services/db';
import { sanitizeCorruptedStudents } from '../../services/recordService';
import { useSync } from '../../hooks/useSync';
import { useAuth } from '../../context/AuthContext';
import { OutboxOperation } from '../../types/sync';
import {
  Users,
  GraduationCap,
  CalendarCheck,
  CloudUpload,
  FileSpreadsheet,
  PlusCircle,
  FlaskConical,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Search,
  Plus,
  ArrowRight,
  RotateCcw,
  BookOpen,
  Award,
  UserX,
} from 'lucide-react';
import { ActiveTab } from '../layout/Navbar';
import { ClassTabs } from '../common/ClassTabs';

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
  const { overallStatus, pendingCount, failedCount, conflictedCount, lastSyncedAt, triggerSync } = useSync();

  const [students, setStudents] = useState<Student[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [recentOutbox, setRecentOutbox] = useState<OutboxOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [corruptedCleanedCount, setCorruptedCleanedCount] = useState<number>(0);

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

        // Load today's attendance for Class 7, 8, 9
        const c7Att = await getAttendanceByDateAndClass(todayStr, 'Class 7');
        const c8Att = await getAttendanceByDateAndClass(todayStr, 'Class 8');
        const c9Att = await getAttendanceByDateAndClass(todayStr, 'Class 9');
        setTodayAttendance([...c7Att, ...c8Att, ...c9Att]);

        const ops = await getOutboxOperations();
        setRecentOutbox(ops.slice(-5).reverse());
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [todayStr, pendingCount, refreshKey]);

  const class7Count = students.filter((s) => s.class === 'Class 7').length;
  const class8Count = students.filter((s) => s.class === 'Class 8').length;
  const class9Count = students.filter((s) => s.class === 'Class 9').length;

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
          (s.bFormNo && s.bFormNo.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (a.class !== b.class) return a.class.localeCompare(b.class);
      return parseInt(a.rollNo || '0', 10) - parseInt(b.rollNo || '0', 10);
    });

  return (
    <div className="space-y-6">
      {/* Top Welcome & School Operator Hero */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-400">
              <ShieldCheck className="w-4 h-4" />
              <span>GBHS Computer Operator Workspace</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 tracking-tight">
              Class 7, 8, & 9 Record Management
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Authorized Operator: <span className="text-slate-200 font-medium">{session?.user.fullName}</span> ({session?.user.email})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenNewStudentModal}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Enroll Student</span>
            </button>
            <button
              onClick={() => {
                if (onOpenImport) onOpenImport();
                else onNavigate('import');
              }}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import Excel Sheet</span>
            </button>
            <button
              onClick={() => onNavigate('attendance')}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl transition active:scale-95 cursor-pointer"
            >
              <CalendarCheck className="w-4 h-4 text-sky-400" />
              <span>Mark Attendance</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <div
          onClick={() => onNavigate('students')}
          className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 hover:border-slate-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Enrolled</span>
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:scale-105 transition">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">{students.length}</span>
            <span className="text-[11px] text-slate-500">Students</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Class 7, 8, 9 total</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Class 7 */}
        <div
          onClick={() => onNavigate('students')}
          className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 hover:border-slate-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Class 7</span>
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-900">
              Grade 7
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">{class7Count}</span>
            <span className="text-[11px] text-slate-500">Students</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Sections A, B, C</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Class 8 */}
        <div
          onClick={() => onNavigate('students')}
          className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 hover:border-slate-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Class 8</span>
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-900">
              Grade 8
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">{class8Count}</span>
            <span className="text-[11px] text-slate-500">Students</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Sections A, B, C</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Class 9 */}
        <div
          onClick={() => onNavigate('students')}
          className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 hover:border-slate-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Class 9</span>
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-900">
              Grade 9
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">{class9Count}</span>
            <span className="text-[11px] text-slate-500">Students</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Matric Part 1</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition" />
          </div>
        </div>
      </div>

      {/* 5 Complete School Record Modules (Class 7, 8, & 9) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Official School Record Modules (Classes 7th, 8th, & 9th)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">5 Modules Ready</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Module 1: Students */}
          <div
            onClick={() => onNavigate('students')}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-850/80 transition cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:scale-105 transition">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-bold text-sky-400 px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-800">
                  Module 1
                </span>
              </div>
              <h4 className="text-sm font-bold text-white group-hover:text-sky-300 transition">Master Students</h4>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                13 Official record columns, roll numbers, admission details, and Excel import.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold text-slate-300">{students.length} Learners</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition" />
            </div>
          </div>

          {/* Module 2: Attendance */}
          <div
            onClick={() => onNavigate('attendance')}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850/80 transition cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-bold text-indigo-400 px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-800">
                  Module 2
                </span>
              </div>
              <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition">Daily Attendance</h4>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                Daily roll-call mark, present/absent tallies, and monthly register views.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold text-slate-300">Class 7, 8, 9</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition" />
            </div>
          </div>

          {/* Module 3: Teaching Log */}
          <div
            onClick={() => onNavigate('teaching')}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-850/80 transition cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:scale-105 transition">
                  <BookOpen className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-bold text-sky-400 px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-800">
                  Module 3
                </span>
              </div>
              <h4 className="text-sm font-bold text-white group-hover:text-sky-300 transition">Teaching Log</h4>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                Daily lectures, theory topics, practical activities, student counts, and instructor names.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold text-sky-400">Daily Logs</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition" />
            </div>
          </div>

          {/* Module 4: Practical Progress */}
          <div
            onClick={() => onNavigate('practical')}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850/80 transition cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
                  <Award className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800">
                  Module 4
                </span>
              </div>
              <h4 className="text-sm font-bold text-white group-hover:text-emerald-300 transition">Practical Progress</h4>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                Skill assessments, attempts, scores, proficiency status, weak areas, and remedial practice.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold text-emerald-400">Skills Tracker</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition" />
            </div>
          </div>

          {/* Module 5: Absentee Follow-up */}
          <div
            onClick={() => onNavigate('absentee')}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850/80 transition cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-105 transition">
                  <UserX className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800">
                  Module 5
                </span>
              </div>
              <h4 className="text-sm font-bold text-white group-hover:text-amber-300 transition">Absentee Follow-up</h4>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                Absence logging, guardian contacts, action taken, expected return dates, and resolution.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold text-amber-400">Follow-up Logs</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition" />
            </div>
          </div>
        </div>
      </div>

      {/* DASHBOARD LIVE STUDENT ROSTER SECTION (Matches Excel Sheet directly) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-400" />
              <span>Student Master Roster</span>
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-sky-950 text-sky-400 border border-sky-800">
                {students.length} Students
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time student records imported from your Excel spreadsheet and saved locally.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                if (onOpenImport) onOpenImport();
                else onNavigate('import');
              }}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import Excel</span>
            </button>
            <button
              onClick={() => onNavigate('students')}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              <span>Full Directory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search & Class Tabs Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <ClassTabs
            selectedClass={selectedClass}
            onSelectClass={(c) => setSelectedClass(c)}
            counts={{
              all: students.length,
              class7: class7Count,
              class8: class8Count,
              class9: class9Count,
            }}
          />

          <div className="relative sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by student name or roll..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Notice if corrupted records were automatically purged */}
        {corruptedCleanedCount > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-xs text-amber-300 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>{corruptedCleanedCount} Corrupted Records Purged:</strong> Old records with School Name saved as Student Name have been automatically removed. Click <strong>Import Excel</strong> to import your actual student roster cleanly.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (onOpenImport) onOpenImport();
                  else onNavigate('import');
                }}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer"
              >
                Import Excel Now
              </button>
              <button
                onClick={() => setCorruptedCleanedCount(0)}
                className="text-amber-400 hover:text-white text-xs px-2 py-1 rounded bg-amber-900/40 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Dashboard Students Table: Strictly 13 Columns in Exact Order */}
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">No student records found</p>
              <p className="text-xs text-slate-500 mt-1">
                {students.length === 0
                  ? 'Your database is currently empty. Click "Import Excel" to upload your master sheet.'
                  : 'No student matches your search query or class filter.'}
              </p>
              {students.length === 0 && (
                <button
                  onClick={() => {
                    if (onOpenImport) onOpenImport();
                    else onNavigate('import');
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Import Excel Roster Now</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-left text-xs text-slate-300 whitespace-nowrap">
                <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-slate-800 z-10 shadow-xs">
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
                <tbody className="divide-y divide-slate-800/80">
                  {filteredStudents.map((s, idx) => {
                    const isReg =
                      (s.registeredStatus && s.registeredStatus.toLowerCase().includes('reg')) ||
                      s.status === 'Active';
                    return (
                      <tr key={s.id} className="hover:bg-slate-850/60 transition">
                        {/* 1. S# */}
                        <td className="px-3.5 py-2.5 font-mono text-slate-400 font-semibold">
                          {s.serialNo || idx + 1}
                        </td>
                        {/* 2. Roll Num */}
                        <td className="px-3.5 py-2.5 font-bold text-white font-mono">
                          {s.rollNo}
                        </td>
                        {/* 3. District */}
                        <td className="px-3.5 py-2.5 text-slate-300">
                          {s.district || 'Lasbela'}
                        </td>
                        {/* 4. School Name */}
                        <td className="px-3.5 py-2.5 text-slate-300 font-medium">
                          {s.schoolName || 'GBHS Jam Yousf Colony'}
                        </td>
                        {/* 5. Trade */}
                        <td className="px-3.5 py-2.5 text-slate-300">
                          {s.trade || 'Computer Operator'}
                        </td>
                        {/* 6. Name of Learner */}
                        <td className="px-3.5 py-2.5">
                          <span className="font-bold text-white">{s.name}</span>
                        </td>
                        {/* 7. Father Name */}
                        <td className="px-3.5 py-2.5 text-slate-300">
                          {s.fatherName}
                        </td>
                        {/* 8. Gender */}
                        <td className="px-3.5 py-2.5 text-slate-400">
                          {s.gender || 'Male'}
                        </td>
                        {/* 9. DOB */}
                        <td className="px-3.5 py-2.5 text-slate-400 font-mono">
                          {s.dob || '—'}
                        </td>
                        {/* 10. Class */}
                        <td className="px-3.5 py-2.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950 text-sky-400 border border-sky-800/80">
                            {s.class}
                          </span>
                        </td>
                        {/* 11. Date of Center Beginning */}
                        <td className="px-3.5 py-2.5 text-slate-400 font-mono">
                          {s.dateOfCenterBeginning || s.admissionDate || '—'}
                        </td>
                        {/* 12. Guardian Contact */}
                        <td className="px-3.5 py-2.5 text-slate-300 font-mono">
                          {s.guardianContact || s.phone || '—'}
                        </td>
                        {/* 13. Registerd */}
                        <td className="px-3.5 py-2.5">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              isReg
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                                : 'bg-rose-950 text-rose-400 border border-rose-800/80'
                            }`}
                          >
                            {s.registeredStatus || (isReg ? 'Registerd' : 'Unregisterd')}
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

      {/* Main Grid: Today's Attendance & Offline Sync Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Summary */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-sky-400" />
                <span>Today's Attendance Status</span>
              </h2>
              <p className="text-xs text-slate-400">Date: {todayStr} • Classes 7, 8, & 9</p>
            </div>
            <button
              onClick={() => onNavigate('attendance')}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
            >
              Take / View Attendance <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="bg-slate-800/60 border border-slate-750 rounded-xl p-3 text-center">
              <span className="text-xs text-emerald-400 font-medium">Present</span>
              <p className="text-xl font-bold text-white mt-1">{presentCount}</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-750 rounded-xl p-3 text-center">
              <span className="text-xs text-rose-400 font-medium">Absent</span>
              <p className="text-xl font-bold text-white mt-1">{absentCount}</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-750 rounded-xl p-3 text-center">
              <span className="text-xs text-amber-400 font-medium">On Leave</span>
              <p className="text-xl font-bold text-white mt-1">{leaveCount}</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-750 rounded-xl p-3 text-center">
              <span className="text-xs text-blue-400 font-medium">Late</span>
              <p className="text-xl font-bold text-white mt-1">{lateCount}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>Attendance Rate</span>
              <span className="font-semibold text-slate-200">
                {totalMarked > 0 ? `${presentPct}% Present (${totalMarked} / ${students.length} marked)` : 'Not taken yet'}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
              <div style={{ width: `${presentPct}%` }} className="bg-emerald-500 h-full transition-all duration-500" />
              <div
                style={{ width: `${totalMarked > 0 ? (absentCount / totalMarked) * 100 : 0}%` }}
                className="bg-rose-500 h-full transition-all duration-500"
              />
              <div
                style={{ width: `${totalMarked > 0 ? (leaveCount / totalMarked) * 100 : 0}%` }}
                className="bg-amber-500 h-full transition-all duration-500"
              />
            </div>
          </div>
        </div>

        {/* Sync & Outbox Status Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CloudUpload className="w-4 h-4 text-sky-400" />
                <span>Sync & Outbox Status</span>
              </h2>
              <button
                onClick={onOpenSyncDetails}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
              >
                View Details
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Current Status</span>
                <span className="font-semibold text-slate-200">{overallStatus}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Pending Outbox Ops</span>
                <span className="font-semibold text-amber-400">{pendingCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Failed / Retrying</span>
                <span className="font-semibold text-rose-400">{failedCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Conflicts Detected</span>
                <span className="font-semibold text-amber-400">{conflictedCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                <span className="text-slate-400">Last Synced</span>
                <span className="font-mono text-[11px] text-slate-300">
                  {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800">
            <button
              onClick={triggerSync}
              className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs py-2.5 rounded-xl transition cursor-pointer"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span>Trigger Sync Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Outbox Operations & Interactive Test Suite Shortcut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outbox Activity */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Recent Local Outbox Operations</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">IndexedDB Queue</span>
          </div>

          <div className="mt-3 divide-y divide-slate-800">
            {recentOutbox.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No recent outbox operations recorded.</p>
            ) : (
              recentOutbox.map((op) => (
                <div key={op.opId} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        op.operationType === 'CREATE'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : op.operationType === 'UPDATE'
                          ? 'bg-sky-950 text-sky-400 border border-sky-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {op.operationType}
                    </span>
                    <span className="font-medium text-slate-200 capitalize">
                      {op.entityType}: {(op.payload as any)?.name || (op.payload as any)?.studentName || op.entityId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] capitalize ${
                        op.status === 'synced'
                          ? 'text-emerald-400'
                          : op.status === 'pending'
                          ? 'text-amber-400'
                          : op.status === 'failed'
                          ? 'text-rose-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {op.status}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(op.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Test Suite Card */}
        <div className="bg-gradient-to-br from-purple-950/40 to-slate-900 border border-purple-900/40 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center mb-3">
              <FlaskConical className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Compliance Test Suite</h3>
            <p className="text-xs text-purple-200/80 mt-1.5 leading-relaxed">
              Verify offline saving, app restart, reconnection, interrupted sync, duplicate retries, exponential backoff,
              conflict resolution, and Excel import.
            </p>
          </div>
          <button
            onClick={() => onNavigate('tests')}
            className="mt-4 w-full bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs py-2 rounded-xl transition cursor-pointer"
          >
            Launch Interactive Tests
          </button>
        </div>
      </div>
    </div>
  );
};
