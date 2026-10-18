import React from 'react';
import { Student } from '../../types/student';
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
} from 'lucide-react';

interface StudentDetailModalProps {
  student: Student | null;
  onClose: () => void;
  onEdit: (student: Student) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  onClose,
  onEdit,
}) => {
  if (!student) return null;

  const isRegistered =
    (student.registeredStatus && student.registeredStatus.toLowerCase().includes('reg')) ||
    student.status === 'Active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Student Profile</h3>
              <p className="text-[11px] text-slate-400">
                Official Register Record • Roll #{student.rollNo}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Hero Identity Card */}
          <div className="flex items-center gap-3.5 bg-gradient-to-r from-slate-850 to-slate-800/80 p-4 rounded-xl border border-slate-750">
            <div className="w-12 h-12 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-xl shrink-0">
              {student.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-base font-bold text-white truncate">{student.name}</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Father: <span className="text-slate-200 font-medium">{student.fatherName}</span>
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                  {student.class}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  Roll #{student.rollNo}
                </span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                    isRegistered
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  {student.registeredStatus || (isRegistered ? 'Registerd' : 'Unregisterd')}
                </span>
              </div>
            </div>
          </div>

          {/* 13 Official Register Fields in Exact Order */}
          <div className="space-y-2 text-xs">
            <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-800">
              Official Register Columns
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {/* 1. S# */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-sky-400" /> 1. S#:
                </span>
                <span className="font-mono font-semibold text-slate-100">
                  {student.serialNo || student.rollNo}
                </span>
              </div>

              {/* 2. Roll Num */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-sky-400" /> 2. Roll Num:
                </span>
                <span className="font-mono font-bold text-white">{student.rollNo}</span>
              </div>

              {/* 3. District */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> 3. District:
                </span>
                <span className="font-medium text-slate-200">{student.district || 'Lasbela'}</span>
              </div>

              {/* 4. School Name */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <School className="w-3.5 h-3.5 text-indigo-400" /> 4. School Name:
                </span>
                <span className="font-medium text-slate-200 truncate max-w-[180px]">
                  {student.schoolName || 'GBHS Jam Yousf Colony'}
                </span>
              </div>

              {/* 5. Trade */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-teal-400" /> 5. Trade:
                </span>
                <span className="font-medium text-slate-200">{student.trade || 'Computer Operator'}</span>
              </div>

              {/* 6. Name of Learner */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-400" /> 6. Name of Learner:
                </span>
                <span className="font-bold text-white">{student.name}</span>
              </div>

              {/* 7. Father Name */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-400" /> 7. Father Name:
                </span>
                <span className="font-medium text-slate-200">{student.fatherName}</span>
              </div>

              {/* 8. Gender */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400">8. Gender:</span>
                <span className="font-medium text-slate-200">{student.gender || 'Male'}</span>
              </div>

              {/* 9. DOB */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" /> 9. DOB:
                </span>
                <span className="font-medium text-slate-200">{student.dob || '—'}</span>
              </div>

              {/* 10. Class */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400">10. Class:</span>
                <span className="font-semibold text-sky-400">{student.class}</span>
              </div>

              {/* 11. Date of Center Beginning */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" /> 11. Date of Center Beginning:
                </span>
                <span className="font-medium text-slate-200">
                  {student.dateOfCenterBeginning || student.admissionDate || '—'}
                </span>
              </div>

              {/* 12. Guardian Contact */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" /> 12. Guardian Contact:
                </span>
                <span className="font-mono text-slate-200">
                  {student.guardianContact || student.phone || '—'}
                </span>
              </div>

              {/* 13. Registerd */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-850 border border-slate-800 sm:col-span-2">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 13. Registerd:
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    isRegistered
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                      : 'bg-rose-950 text-rose-400 border border-rose-800/80'
                  }`}
                >
                  {student.registeredStatus || (isRegistered ? 'Registerd' : 'Unregisterd')}
                </span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={() => {
                onClose();
                onEdit(student);
              }}
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-5 py-2 rounded-xl transition cursor-pointer shadow-sm"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Student Record</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
