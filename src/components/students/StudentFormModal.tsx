import React, { useState, useEffect } from 'react';
import { Student, ClassLevel, Section, StudentStatus } from '../../types/student';
import { createStudent, updateStudent } from '../../services/recordService';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  UserPlus,
  Save,
  AlertCircle,
  Hash,
  School,
  MapPin,
  Briefcase,
  User,
  Calendar,
  Phone,
  CheckCircle2,
} from 'lucide-react';

interface StudentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  studentToEdit?: Student | null;
  defaultClass?: ClassLevel;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  studentToEdit,
  defaultClass = 'Class 7',
}) => {
  const { session } = useAuth();

  // Exactly the 13 fields in exact order
  const [serialNo, setSerialNo] = useState(''); // 1. S# (Serial Number)
  const [rollNo, setRollNo] = useState(''); // 2. Roll Num (Roll Number)
  const [district, setDistrict] = useState('Lasbela'); // 3. District
  const [schoolName, setSchoolName] = useState('GBHS Jam Yousf Colony'); // 4. School Name
  const [trade, setTrade] = useState('Computer Operator'); // 5. Trade
  const [name, setName] = useState(''); // 6. Name of Learner
  const [fatherName, setFatherName] = useState(''); // 7. Father Name
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male'); // 8. Gender
  const [dob, setDob] = useState(''); // 9. DOB (Date of Birth)
  const [classLevel, setClassLevel] = useState<ClassLevel>(defaultClass); // 10. Class
  const [dateOfCenterBeginning, setDateOfCenterBeginning] = useState(''); // 11. Date of Center Beginning
  const [guardianContact, setGuardianContact] = useState(''); // 12. Guardian Contact
  const [registeredStatus, setRegisteredStatus] = useState('Registerd'); // 13. Registerd

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (studentToEdit) {
      setSerialNo(studentToEdit.serialNo || '');
      setRollNo(studentToEdit.rollNo || '');
      setDistrict(studentToEdit.district || 'Lasbela');
      setSchoolName(studentToEdit.schoolName || 'GBHS Jam Yousf Colony');
      setTrade(studentToEdit.trade || 'Computer Operator');
      setName(studentToEdit.name || '');
      setFatherName(studentToEdit.fatherName || '');
      setGender((studentToEdit.gender as 'Male' | 'Female' | 'Other') || 'Male');
      setDob(studentToEdit.dob || '');
      setClassLevel(studentToEdit.class || defaultClass);
      setDateOfCenterBeginning(studentToEdit.dateOfCenterBeginning || studentToEdit.admissionDate || '');
      setGuardianContact(studentToEdit.guardianContact || studentToEdit.phone || '');
      setRegisteredStatus(studentToEdit.registeredStatus || (studentToEdit.status === 'Active' ? 'Registerd' : 'Unregisterd'));
    } else {
      setSerialNo('');
      setRollNo('');
      setDistrict('Lasbela');
      setSchoolName('GBHS Jam Yousf Colony');
      setTrade('Computer Operator');
      setName('');
      setFatherName('');
      setGender('Male');
      setDob('');
      setClassLevel(defaultClass);
      setDateOfCenterBeginning('');
      setGuardianContact('');
      setRegisteredStatus('Registerd');
    }
    setError(null);
  }, [studentToEdit, defaultClass, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name of Learner is required.');
      return;
    }
    if (!fatherName.trim()) {
      setError("Father Name is required.");
      return;
    }
    if (!rollNo.trim()) {
      setError('Roll Num is required.');
      return;
    }

    const finalSerialNo = serialNo.trim() || rollNo.trim();
    const isTempAdm = studentToEdit?.admissionNo?.includes('TEMP');
    const finalAdmNo =
      !studentToEdit?.admissionNo || isTempAdm
        ? `ADM-${classLevel.replace('Class ', '')}A-${rollNo.trim().padStart(3, '0')}`
        : studentToEdit.admissionNo;
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    setIsSubmitting(true);

    const payload = {
      // 13 Fields in exact order
      serialNo: finalSerialNo,
      rollNo: rollNo.trim(),
      district: district.trim(),
      schoolName: schoolName.trim(),
      trade: trade.trim(),
      name: name.trim(),
      fatherName: fatherName.trim(),
      gender,
      dob: dob || undefined,
      class: classLevel,
      dateOfCenterBeginning: dateOfCenterBeginning || undefined,
      guardianContact: guardianContact.trim(),
      registeredStatus: registeredStatus.trim(),

      // Synced system fields
      admissionNo: finalAdmNo,
      section: studentToEdit?.section || ('A' as Section),
      phone: guardianContact.trim(),
      status: (registeredStatus.toLowerCase().includes('reg') ? 'Active' : 'Inactive') as StudentStatus,
      admissionDate: dateOfCenterBeginning || undefined,
    };

    try {
      if (studentToEdit) {
        const res = await updateStudent(studentToEdit.id, payload, userEmail);
        if (!res.success) {
          setError(res.error || 'Failed to update student record.');
          setIsSubmitting(false);
          return;
        }
      } else {
        const res = await createStudent(payload, userEmail);
        if (!res.success) {
          setError(res.error || 'Failed to create student record.');
          setIsSubmitting(false);
          return;
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-4 sm:my-8 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {studentToEdit ? 'Edit Student Record' : 'Student Admission Form'}
              </h3>
              <p className="text-xs text-slate-400">
                Official Register Record Management
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body with the 13 fields in exact order */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/80 text-xs text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Section: Institution & Identifier Details (Fields 1-5) */}
          <div className="space-y-3.5 rounded-xl p-4 bg-slate-850/60 border border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Hash className="w-4 h-4 text-sky-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Registration & Center Details
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* 1. S# (Serial Number) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  1. S# (Serial Number)
                </label>
                <input
                  type="text"
                  value={serialNo}
                  onChange={(e) => setSerialNo(e.target.value)}
                  placeholder="e.g. 1, 2, 3"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              {/* 2. Roll Num (Roll Number) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  2. Roll Num (Roll Number) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  placeholder="e.g. 3473, 1078, 1"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono font-bold"
                />
              </div>

              {/* 3. District */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  3. District
                </label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Lasbela"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* 4. School Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  4. School Name
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. GBHS Jam Yousf Colony"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* 5. Trade */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  5. Trade
                </label>
                <input
                  type="text"
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  placeholder="e.g. Computer Operator"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Learner Profile & Demographics (Fields 6-9) */}
          <div className="space-y-3.5 rounded-xl p-4 bg-slate-850/60 border border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <User className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Learner & Parent Information
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* 6. Name of Learner */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  6. Name of Learner <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Nadir Ali"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-semibold"
                />
              </div>

              {/* 7. Father Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  7. Father Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  placeholder="e.g. Mehrullah"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* 8. Gender */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  8. Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* 9. DOB (Date of Birth) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  9. DOB (Date of Birth)
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Academic Schedule, Contact & Registration (Fields 10-13) */}
          <div className="space-y-3.5 rounded-xl p-4 bg-slate-850/60 border border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Enrollment & Status
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* 10. Class */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  10. Class <span className="text-rose-400">*</span>
                </label>
                <select
                  value={classLevel}
                  onChange={(e) => setClassLevel(e.target.value as ClassLevel)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="Class 7">Class 7</option>
                  <option value="Class 8">Class 8</option>
                  <option value="Class 9">Class 9</option>
                </select>
              </div>

              {/* 11. Date of Center Beginning */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  11. Date of Center Beginning
                </label>
                <input
                  type="date"
                  value={dateOfCenterBeginning}
                  onChange={(e) => setDateOfCenterBeginning(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* 12. Guardian Contact */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  12. Guardian Contact
                </label>
                <input
                  type="text"
                  value={guardianContact}
                  onChange={(e) => setGuardianContact(e.target.value)}
                  placeholder="e.g. 03412089077"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              {/* 13. Registerd */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  13. Registerd
                </label>
                <select
                  value={registeredStatus}
                  onChange={(e) => setRegisteredStatus(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-medium"
                >
                  <option value="Registerd">Registerd</option>
                  <option value="Unregisterd">Unregisterd</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Offline-ready: Auto-saves to local database and outbox sync</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2 rounded-xl transition cursor-pointer shadow-md shadow-sky-900/30 active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Saving...' : studentToEdit ? 'Update Student Record' : 'Save Student Record'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
