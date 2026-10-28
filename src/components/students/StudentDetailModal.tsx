import React, { useState, useEffect } from 'react';
import { Student, AttendanceRecord } from '../../types/student';
import { PracticalProgressEntry, AbsenteeFollowupEntry } from '../../types/modules';
import { getAllAttendanceRecords } from '../../services/db';
import { fetchPracticalProgress, fetchAbsenteeFollowups } from '../../services/modulesService';
import { useAuth } from '../../context/AuthContext';
import { getWorkspacePermissions } from '../../services/permissionService';
import {
  X,
  User,
  Hash,
  Phone,
  Calendar,
  Pencil,
  School,
  MapPin,
  Briefcase,
  CheckCircle2,
  CalendarCheck,
  Award,
  UserX,
  Clock,
  AlertTriangle,
  MessageCircle,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

interface StudentDetailModalProps {
  student: Student | null;
  onClose: () => void;
  onEdit?: (student: Student) => void;
  onOpenWhatsAppAlert?: (student: Student) => void;
}

type TabType = 'register' | 'attendance' | 'practicals' | 'followups';

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  onClose,
  onEdit,
  onOpenWhatsAppAlert,
}) => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);

  const [activeTab, setActiveTab] = useState<TabType>('register');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [practicals, setPracticals] = useState<PracticalProgressEntry[]>([]);
  const [followups, setFollowups] = useState<AbsenteeFollowupEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!student) return;

    let isMounted = true;
    setIsLoadingHistory(true);

    Promise.all([
      getAllAttendanceRecords(),
      fetchPracticalProgress('All'),
      fetchAbsenteeFollowups('All'),
    ])
      .then(([allAtt, allPract, allFollow]) => {
        if (!isMounted) return;
        // Filter attendance for this student
        const studentAtt = allAtt
          .filter((a) => a.studentId === student.id)
          .sort((a, b) => b.date.localeCompare(a.date)); // descending
        setAttendanceRecords(studentAtt);

        // Filter practicals
        const studentPract = allPract
          .filter(
            (p) =>
              p.studentId === student.id ||
              p.registrationId === student.rollNo ||
              p.registrationId === student.admissionNo ||
              p.studentName.toLowerCase() === student.name.toLowerCase()
          )
          .sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
        setPracticals(studentPract);

        // Filter followups
        const studentFollow = allFollow
          .filter((f) => f.studentId === student.id || f.registrationId === student.rollNo)
          .sort((a, b) => b.date.localeCompare(a.date));
        setFollowups(studentFollow);
      })
      .catch((err) => {
        console.error('Failed to load student history details:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [student]);

  if (!student) return null;

  const isRegistered =
    (student.registeredStatus && student.registeredStatus.toLowerCase().includes('reg')) ||
    student.status === 'Active';

  // Attendance metrics
  const totalDays = attendanceRecords.length;
  const presents = attendanceRecords.filter((a) => a.status === 'Present').length;
  const absents = attendanceRecords.filter((a) => a.status === 'Absent').length;
  const leaves = attendanceRecords.filter((a) => a.status === 'Leave' || a.status === 'Late').length;
  const attendancePct = totalDays > 0 ? Math.round((presents / totalDays) * 100) : 100;
  const isLowAttendance = totalDays >= 3 && attendancePct < 75;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#D97745]/10 border border-[#D97745]/20 text-[#D97745] flex items-center justify-center font-bold text-base">
              {student.name.charAt(0)}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{student.name}</span>
                {isLowAttendance && (
                  <span className="text-[10px] bg-rose-950 text-rose-400 border border-rose-800 px-2 py-0.5 rounded-full font-bold">
                    Low Att: {attendancePct}%
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                Official Register Record • Roll #{student.rollNo} • {student.class} • Section {student.section || 'A'}
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

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-slate-800 bg-slate-900 shrink-0 gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('register')}
            className={`btn-interactive flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'register'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Official Register</span>
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className={`btn-interactive flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'attendance'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>Attendance Timeline ({totalDays})</span>
          </button>

          <button
            onClick={() => setActiveTab('practicals')}
            className={`btn-interactive flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'practicals'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Practicals ({practicals.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('followups')}
            className={`btn-interactive flex items-center gap-1.5 py-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'followups'
                ? 'border-[#D97745] text-[#D97745]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Follow-ups & Remarks ({followups.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Hero Identity Overview (always visible) */}
          <div className="flex items-center justify-between bg-gradient-to-r from-slate-850 to-slate-800 p-3.5 rounded-xl border border-slate-750">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#D97745]/20 text-[#D97745] border border-[#D97745]/30 flex items-center justify-center font-bold text-lg shrink-0">
                {student.name.charAt(0)}
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">{student.name}</h4>
                <p className="text-xs text-slate-400">
                  Father: <span className="text-slate-200 font-medium">{student.fatherName}</span> • Sec: {student.section}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Contact: <span className="font-mono text-emerald-400">{student.guardianContact || student.phone || 'No Phone'}</span>
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center gap-1 justify-end">
                <span className="text-xs font-bold text-white font-mono">{attendancePct}%</span>
                <span className="text-[10px] text-slate-400">Status</span>
              </div>
              <span
                className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-semibold mt-1 ${
                  student.status === 'Active'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : student.status === 'Withdrawn'
                    ? 'bg-rose-950 text-rose-400 border border-rose-800'
                    : student.status === 'Transferred'
                    ? 'bg-purple-950 text-purple-400 border border-purple-800'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {student.status || student.registeredStatus || (isRegistered ? 'Active' : 'Inactive')}
              </span>
            </div>
          </div>

          {/* TAB 1: OFFICIAL REGISTER */}
          {activeTab === 'register' && (
            <div className="space-y-3">
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-800">
                13 Official Register Columns
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {/* 1. S# */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-slate-400" /> 1. S#:
                  </span>
                  <span className="font-mono text-slate-200 font-semibold">{student.serialNo || '—'}</span>
                </div>

                {/* 2. Roll Num */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-[#D97745]" /> 2. Roll Num:
                  </span>
                  <span className="font-mono font-bold text-white">{student.rollNo}</span>
                </div>

                {/* 3. District */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" /> 3. District:
                  </span>
                  <span className="font-medium text-slate-200">{student.district || 'Lasbela'}</span>
                </div>

                {/* 4. School Name */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <School className="w-3.5 h-3.5 text-[#9BAE9C]" /> 4. School Name:
                  </span>
                  <span className="font-medium text-slate-200 truncate max-w-[180px]">
                    {student.schoolName || 'GBHS Jam Yousf Colony'}
                  </span>
                </div>

                {/* 5. Trade */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-400" /> 5. Trade:
                  </span>
                  <span className="font-medium text-slate-200">{student.trade || 'Computer Operator'}</span>
                </div>

                {/* 6. Name of Learner */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#D97745]" /> 6. Name of Learner:
                  </span>
                  <span className="font-bold text-white">{student.name}</span>
                </div>

                {/* 7. Father Name */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" /> 7. Father Name:
                  </span>
                  <span className="font-medium text-slate-200">{student.fatherName}</span>
                </div>

                {/* 8. Gender */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#9BAE9C]" /> 8. Gender:
                  </span>
                  <span className="font-medium text-slate-200">{student.gender || 'Male'}</span>
                </div>

                {/* 9. DOB */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-rose-400" /> 9. DOB:
                  </span>
                  <span className="font-mono text-slate-200">{student.dob || '—'}</span>
                </div>

                {/* 10. Class */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#D97745]" /> 10. Class:
                  </span>
                  <span className="font-bold text-[#D97745]">{student.class}</span>
                </div>

                {/* 11. Date of Center Beginning */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" /> 11. Date of Center Beginning:
                  </span>
                  <span className="font-mono text-slate-200">
                    {student.dateOfCenterBeginning || student.admissionDate || '—'}
                  </span>
                </div>

                {/* 12. Guardian Contact */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" /> 12. Guardian Contact:
                  </span>
                  <span className="font-mono text-emerald-300 font-semibold">
                    {student.guardianContact || student.phone || '—'}
                  </span>
                </div>

                {/* 13. Registerd / Status */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800 sm:col-span-2">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 13. Status:
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      student.status === 'Active'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                        : student.status === 'Withdrawn'
                        ? 'bg-rose-950 text-rose-400 border border-rose-800/80'
                        : student.status === 'Transferred'
                        ? 'bg-purple-950 text-purple-400 border border-purple-800/80'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {student.status || student.registeredStatus || (isRegistered ? 'Active' : 'Inactive')}
                  </span>
                </div>

                {/* Optional Lifecycle Details */}
                {student.withdrawalReason && (
                  <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/60 sm:col-span-2 text-xs">
                    <span className="text-rose-400 font-semibold block mb-0.5">Withdrawal Reason:</span>
                    <span className="text-rose-200">{student.withdrawalReason}</span>
                    {student.withdrawnDate && (
                      <span className="text-rose-400/80 block text-[10px] mt-0.5">Date: {student.withdrawnDate}</span>
                    )}
                  </div>
                )}

                {student.transferDetails && (
                  <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-900/60 sm:col-span-2 text-xs">
                    <span className="text-purple-400 font-semibold block mb-0.5">Transfer Details:</span>
                    <span className="text-purple-200">{student.transferDetails}</span>
                    {student.transferredDate && (
                      <span className="text-purple-400/80 block text-[10px] mt-0.5">Date: {student.transferredDate}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ATTENDANCE TIMELINE */}
          {activeTab === 'attendance' && (
            <div className="space-y-3">
              {/* Metrics Header */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase">Days Recorded</span>
                  <p className="text-base font-bold text-white mt-0.5">{totalDays}</p>
                </div>
                <div className="bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-emerald-400 uppercase">Presents</span>
                  <p className="text-base font-bold text-emerald-400 mt-0.5">{presents}</p>
                </div>
                <div className="bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-rose-400 uppercase">Absents</span>
                  <p className="text-base font-bold text-rose-400 mt-0.5">{absents}</p>
                </div>
                <div className="bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-amber-400 uppercase">Attendance %</span>
                  <p className={`text-base font-bold mt-0.5 ${attendancePct < 75 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {attendancePct}%
                  </p>
                </div>
              </div>

              {/* Attendance Log List */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-72 overflow-y-auto">
                {attendanceRecords.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No individual attendance records logged yet for this student.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-850 text-xs">
                    {attendanceRecords.map((r) => (
                      <div key={r.id} className="p-2.5 flex items-center justify-between hover:bg-slate-900/60 transition">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-mono text-slate-300 font-medium">{r.date}</span>
                          {r.remarks && <span className="text-slate-500 text-[11px]">({r.remarks})</span>}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.status === 'Present'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : r.status === 'Absent'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : r.status === 'Leave'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-[#202822] text-[#9BAE9C] border border-[#3D4A41]'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PRACTICALS */}
          {activeTab === 'practicals' && (
            <div className="space-y-3">
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-800">
                IT & Computer Lab Practicals ({practicals.length})
              </h5>

              {practicals.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                  No practical lab progress records recorded for this student yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {practicals.map((p) => (
                    <div key={p.id} className="bg-slate-850 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{p.skillTask}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.skillStatus === 'Proficient'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : p.skillStatus === 'Competent'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {p.skillStatus}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Status: <span className="text-slate-200">{p.practicalCompleted}</span>
                        {p.weakArea && (
                          <span className="text-amber-400 ml-2">Weak Area: {p.weakArea}</span>
                        )}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                        <span>Date: {p.assessmentDate} (Attempt #{p.attemptNumber})</span>
                        <span>Evaluation: {p.scoreMarks != null ? `${p.scoreMarks}/100 Marks` : 'Pending Score'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FOLLOW-UPS & REMARKS */}
          {activeTab === 'followups' && (
            <div className="space-y-3">
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-800">
                Absentee Outreach & Teacher Follow-ups ({followups.length})
              </h5>

              {followups.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                  No absentee follow-up entries or disciplinary warnings recorded.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto">
                  {followups.map((f) => (
                    <div key={f.id} className="bg-slate-850 p-3 rounded-xl border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white">{f.followupReason}</span>
                          <span className="text-slate-500 text-[11px] block">{f.date} • {f.actionTaken}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            f.currentStatus === 'Resolved / Returned'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : f.currentStatus === 'Pending Return'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {f.currentStatus}
                        </span>
                      </div>

                      {f.responseReceived && (
                        <div className="bg-slate-900 p-2 rounded-lg text-[11px] text-slate-300">
                          <span className="text-slate-500 block text-[10px] uppercase font-semibold">Guardian Response:</span>
                          {f.responseReceived}
                        </div>
                      )}

                      {f.remarks && (
                        <p className="text-[11px] text-slate-400 italic">Remarks: {f.remarks}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
            <div>
              {onOpenWhatsAppAlert && (
                <button
                  type="button"
                  onClick={() => onOpenWhatsAppAlert(student)}
                  className="btn-interactive flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Send WhatsApp Notice</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="btn-interactive px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
              {permissions.canEdit && onEdit && (
                <button
                  onClick={() => {
                    onClose();
                    onEdit(student);
                  }}
                  className="btn-interactive flex items-center gap-1.5 bg-[#D97745] hover:bg-[#c26535] text-white font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer shadow-sm shadow-[#D97745]/20"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
