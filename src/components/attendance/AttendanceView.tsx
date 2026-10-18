import React, { useState, useEffect } from 'react';
import { Student, AttendanceRecord, ClassLevel, Section, AttendanceStatus } from '../../types/student';
import { getStudentsByClass, getAttendanceByDateAndClass } from '../../services/db';
import { saveBulkAttendance } from '../../services/recordService';
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
} from 'lucide-react';

export const AttendanceView: React.FC = () => {
  const { session } = useAuth();
  const [selectedClass, setSelectedClass] = useState<ClassLevel>('Class 7');
  const [selectedSection, setSelectedSection] = useState<Section | 'All'>('All');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [originalMap, setOriginalMap] = useState<Record<string, AttendanceRecord>>({});
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Conservative conflict prompt state
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    student: Student;
    newStatus: AttendanceStatus;
    existingStatus: AttendanceStatus;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const studentList = await getStudentsByClass(selectedClass);
      // Filter active students
      const activeStudents = studentList.filter((s) => s.status === 'Active');
      setStudents(activeStudents);

      const existingRecords = await getAttendanceByDateAndClass(selectedDate, selectedClass);
      const map: Record<string, AttendanceRecord> = {};
      const remMap: Record<string, string> = {};

      for (const rec of existingRecords) {
        map[rec.studentId] = rec;
        if (rec.remarks) remMap[rec.studentId] = rec.remarks;
      }

      setAttendanceMap(map);
      setOriginalMap({ ...map });
      setRemarksMap(remMap);
    } catch (err) {
      console.error('Failed to load attendance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSaveSuccessMsg(null);
  }, [selectedClass, selectedDate]);

  const filteredStudents = students
    .filter((s) => selectedSection === 'All' || s.section === selectedSection)
    .sort((a, b) => parseInt(a.rollNo || '0', 10) - parseInt(b.rollNo || '0', 10));

  // Change status with conservative check
  const handleStatusClick = (student: Student, targetStatus: AttendanceStatus) => {
    const existing = attendanceMap[student.id];

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

  const applyStatusChange = (student: Student, status: AttendanceStatus) => {
    const compositeId = `${student.id}_${selectedDate}`;
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
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
      schoolId: 'GBHS-MAIN',
      markedBy: userEmail,
    };

    setAttendanceMap((prev) => ({
      ...prev,
      [student.id]: newRecord,
    }));
  };

  const handleMarkAllPresent = () => {
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
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
        schoolId: 'GBHS-MAIN',
        markedBy: userEmail,
      };
    }
    setAttendanceMap(updated);
  };

  const handleClearAll = () => {
    setAttendanceMap({});
  };

  const handleSaveAll = async () => {
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    setIsSaving(true);
    setSaveSuccessMsg(null);

    try {
      const recordsToSave: AttendanceRecord[] = Object.values(attendanceMap).map((rec) => ({
        ...rec,
        remarks: remarksMap[rec.studentId] || undefined,
      }));

      await saveBulkAttendance(recordsToSave, userEmail);
      setOriginalMap({ ...attendanceMap });
      setSaveSuccessMsg(`Saved ${recordsToSave.length} attendance records locally & queued in Outbox!`);
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-sky-400" />
            <span>Daily Attendance Register</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mark daily attendance for Classes 7, 8, & 9 with conservative conflict protection.
          </p>
        </div>

        {/* Date and Class Selector Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 p-1 rounded-xl">
            {(['Class 7', 'Class 8', 'Class 9'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setSelectedClass(c)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selectedClass === c
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value as any)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
          >
            <option value="All">All Sections</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
            <option value="General">General</option>
          </select>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-emerald-400" />
            <span>{saveSuccessMsg}</span>
          </div>
          <button
            onClick={() => setSaveSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-[11px] text-slate-400">Total Enrolled</span>
          <p className="text-xl font-bold text-white mt-0.5">{totalCount}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-[11px] text-emerald-400 font-medium">Present</span>
          <p className="text-xl font-bold text-emerald-400 mt-0.5">{presentCount}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-[11px] text-rose-400 font-medium">Absent</span>
          <p className="text-xl font-bold text-rose-400 mt-0.5">{absentCount}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-[11px] text-amber-400 font-medium">Leave</span>
          <p className="text-xl font-bold text-amber-400 mt-0.5">{leaveCount}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-[11px] text-sky-400 font-medium">Late</span>
          <p className="text-xl font-bold text-sky-400 mt-0.5">{lateCount}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-[11px] text-slate-500 font-medium">Unmarked</span>
          <p className="text-xl font-bold text-slate-400 mt-0.5">{unmarkedCount}</p>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllPresent}
            className="flex items-center gap-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All Present</span>
          </button>
          <button
            onClick={handleClearAll}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 transition cursor-pointer"
          >
            Reset Table
          </button>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs px-5 py-2 rounded-xl shadow-md transition active:scale-95 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : `Save Attendance (${Object.keys(attendanceMap).length} Marked)`}</span>
        </button>
      </div>

      {/* Attendance Register Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">No active students in {selectedClass}</h4>
            <p className="text-xs text-slate-500 mt-1">
              Add or import students into {selectedClass} first to take attendance.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
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
              <tbody className="divide-y divide-slate-800/80">
                {filteredStudents.map((student) => {
                  const record = attendanceMap[student.id];
                  const currentStatus = record?.status;

                  return (
                    <tr key={student.id} className="hover:bg-slate-850/50 transition">
                      <td className="px-4 py-3 font-mono font-bold text-white">{student.rollNo}</td>
                      <td className="px-4 py-3 font-mono text-sky-400">{student.admissionNo}</td>
                      <td className="px-4 py-3 font-semibold text-white">{student.name}</td>
                      <td className="px-4 py-3 text-slate-400">{student.fatherName}</td>
                      <td className="px-4 py-3 font-medium text-slate-300">{student.section}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Present */}
                          <button
                            onClick={() => handleStatusClick(student, 'Present')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                              currentStatus === 'Present'
                                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-emerald-300'
                            }`}
                          >
                            <Check className="w-3 h-3" /> P
                          </button>

                          {/* Absent */}
                          <button
                            onClick={() => handleStatusClick(student, 'Absent')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                              currentStatus === 'Absent'
                                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-rose-300'
                            }`}
                          >
                            <X className="w-3 h-3" /> A
                          </button>

                          {/* Leave */}
                          <button
                            onClick={() => handleStatusClick(student, 'Leave')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                              currentStatus === 'Leave'
                                ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-400/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-amber-300'
                            }`}
                          >
                            <Coffee className="w-3 h-3" /> L
                          </button>

                          {/* Late */}
                          <button
                            onClick={() => handleStatusClick(student, 'Late')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                              currentStatus === 'Late'
                                ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-400/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-sky-300'
                            }`}
                          >
                            <Clock className="w-3 h-3" /> T
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          placeholder="Add note..."
                          value={remarksMap[student.id] || ''}
                          onChange={(e) =>
                            setRemarksMap((prev) => ({
                              ...prev,
                              [student.id]: e.target.value,
                            }))
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
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

      {/* Conservative Attendance Conflict Confirmation Modal */}
      {pendingOverwrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
            <div className="w-10 h-10 rounded-full bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="text-base font-bold text-white">Confirm Attendance Change</h4>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              <strong>{pendingOverwrite.student.name}</strong> (Roll #{pendingOverwrite.student.rollNo}) is currently recorded as{' '}
              <span className="font-bold text-amber-400">{pendingOverwrite.existingStatus}</span> for {selectedDate}.
            </p>
            <p className="text-xs text-slate-400 mt-1.5">
              Do you explicitly confirm replacing it with{' '}
              <span className="font-bold text-sky-400">{pendingOverwrite.newStatus}</span>?
            </p>

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                onClick={() => setPendingOverwrite(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                Cancel (Keep {pendingOverwrite.existingStatus})
              </button>
              <button
                onClick={() => {
                  applyStatusChange(pendingOverwrite.student, pendingOverwrite.newStatus);
                  setPendingOverwrite(null);
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
              >
                Yes, Change to {pendingOverwrite.newStatus}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
