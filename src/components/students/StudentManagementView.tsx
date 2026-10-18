import React, { useState, useEffect } from 'react';
import { Student, ClassLevel, Section, StudentStatus } from '../../types/student';
import { getAllStudents } from '../../services/db';
import { deleteStudent, deleteAllStudentsData, sanitizeCorruptedStudents } from '../../services/recordService';
import { useAuth } from '../../context/AuthContext';
import { StudentFormModal } from './StudentFormModal';
import { StudentDetailModal } from './StudentDetailModal';
import { exportStudentsToExcel } from '../../services/excelService';
import { ClassTabs, ClassFilter } from '../common/ClassTabs';
import {
  Users,
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Filter,
  FileSpreadsheet,
  AlertTriangle,
  Sparkles,
  Download,
  CheckCircle2,
  X,
  RefreshCw,
} from 'lucide-react';

interface StudentManagementViewProps {
  onOpenImport: () => void;
  onSeedData: () => Promise<void>;
  refreshKey?: number;
}

export const StudentManagementView: React.FC<StudentManagementViewProps> = ({
  onOpenImport,
  onSeedData,
  refreshKey,
}) => {
  const { session } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedClass, setSelectedClass] = useState<ClassLevel | 'All'>('All');
  const [selectedSection, setSelectedSection] = useState<Section | 'All'>('All');
  const [selectedStatus, setSelectedStatus] = useState<StudentStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [studentToView, setStudentToView] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStudents = async () => {
    try {
      await sanitizeCorruptedStudents();
      const all = await getAllStudents();
      const cleanStudents = all.filter((s) => {
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
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [refreshKey]);

  const handleDeleteConfirm = async () => {
    if (!studentToDelete) return;
    setDeleteError(null);
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    const res = await deleteStudent(studentToDelete.id, userEmail);
    if (res.success) {
      setStudentToDelete(null);
      await fetchStudents();
    } else {
      setDeleteError(res.error || 'Failed to delete student.');
    }
  };

  const handleDeleteAllConfirm = async () => {
    setIsDeletingAll(true);
    setDeleteAllError(null);
    try {
      const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
      const count = await deleteAllStudentsData(userEmail);
      setIsDeleteAllModalOpen(false);
      setStudents([]);
      setExportNotice({
        type: 'success',
        message: `Successfully deleted all ${count} student record(s). Your database is now clear and ready for a fresh Excel import.`,
      });
      setTimeout(() => setExportNotice(null), 6000);
    } catch (err: any) {
      setDeleteAllError(err.message || 'Failed to delete all student records.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredStudents.length === 0) {
      setExportNotice({
        type: 'error',
        message: 'No student records found to export for the active filter and search criteria.',
      });
      return;
    }

    const res = exportStudentsToExcel(filteredStudents, {
      selectedClass,
      selectedSection,
      selectedStatus,
      searchQuery,
    });

    if (res.success) {
      setExportNotice({
        type: 'success',
        message: `Successfully exported ${res.count} student record(s) to "${res.filename}".`,
      });
      setTimeout(() => setExportNotice(null), 5000);
    } else {
      setExportNotice({
        type: 'error',
        message: res.error || 'Failed to export student records to Excel.',
      });
    }
  };

  // Filter logic
  const filteredStudents = students
    .filter((s) => {
      if (selectedClass !== 'All' && s.class !== selectedClass) return false;
      if (selectedSection !== 'All' && s.section !== selectedSection) return false;
      if (selectedStatus !== 'All' && s.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = s.name.toLowerCase().includes(query);
        const matchesFather = s.fatherName.toLowerCase().includes(query);
        const matchesAdm = s.admissionNo.toLowerCase().includes(query);
        const matchesRoll = s.rollNo.toLowerCase().includes(query);
        const matchesPhone = s.phone?.toLowerCase().includes(query);
        const matchesBForm = s.bFormNo?.toLowerCase().includes(query);
        const matchesFatherCnic = s.fatherCnic?.toLowerCase().includes(query);
        const matchesCaste = s.caste?.toLowerCase().includes(query);
        return (
          matchesName ||
          matchesFather ||
          matchesAdm ||
          matchesRoll ||
          matchesPhone ||
          Boolean(matchesBForm) ||
          Boolean(matchesFatherCnic) ||
          Boolean(matchesCaste)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by class then numeric roll number
      if (a.class !== b.class) return a.class.localeCompare(b.class);
      return parseInt(a.rollNo || '0', 10) - parseInt(b.rollNo || '0', 10);
    });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-400" />
            <span>Class 7, 8, & 9 Student Directory</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Preserving accurate student records with offline persistence and version control.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {students.length > 0 && (
            <button
              onClick={() => {
                setDeleteAllError(null);
                setIsDeleteAllModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
              title="Delete all student records to start fresh with your own Excel sheet"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete All Students ({students.length})</span>
            </button>
          )}
          <button
            onClick={handleExportExcel}
            disabled={filteredStudents.length === 0}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
            title={
              filteredStudents.length === 0
                ? 'No students to export'
                : `Export ${filteredStudents.length} student(s) to Excel (.xlsx)`
            }
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export to Excel</span>
          </button>
          <button
            onClick={onOpenImport}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Import Excel</span>
          </button>
          <button
            onClick={() => {
              setStudentToEdit(null);
              setIsFormOpen(true);
            }}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Export Feedback Banner */}
      {exportNotice && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition ${
            exportNotice.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {exportNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{exportNotice.message}</span>
          </div>
          <button
            onClick={() => setExportNotice(null)}
            className="text-slate-400 hover:text-white p-1 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Class Level Selector Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 overflow-x-auto">
        <ClassTabs
          selectedClass={selectedClass}
          onSelectClass={(c) => setSelectedClass(c)}
          counts={{
            all: students.length,
            class7: students.filter((s) => s.class === 'Class 7').length,
            class8: students.filter((s) => s.class === 'Class 8').length,
            class9: students.filter((s) => s.class === 'Class 9').length,
          }}
        />
      </div>

      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
        <div className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, father name, admission no, or roll no..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="All">All Sections (A, B, C)</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
            <option value="General">General</option>
          </select>
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive</option>
            <option value="Transferred">Transferred</option>
          </select>
        </div>
      </div>

      {/* Student List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-200">No student records found</h3>
            <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
              {students.length === 0
                ? 'Your student database is empty. You can now import your master Excel sheet to automatically populate Class 7, 8, and 9 students.'
                : 'No students match your active filters or search keyword.'}
            </p>
            {students.length === 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={onOpenImport}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Import Excel / CSV Sheet</span>
                </button>
                <button
                  onClick={() => {
                    setStudentToEdit(null);
                    setIsFormOpen(true);
                  }}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  <span>Enroll Single Student</span>
                </button>
                <button
                  onClick={onSeedData}
                  className="flex items-center gap-1.5 bg-slate-900 text-slate-400 border border-slate-800 px-3 py-2 rounded-xl text-xs font-medium hover:text-slate-300 hover:bg-slate-850 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restore GBHS Sample Demo Records</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 whitespace-nowrap">
              <thead className="bg-slate-850 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-3.5 py-3">1. S#</th>
                  <th className="px-3.5 py-3">2. Roll Num</th>
                  <th className="px-3.5 py-3">3. District</th>
                  <th className="px-3.5 py-3">4. School Name</th>
                  <th className="px-3.5 py-3">5. Trade</th>
                  <th className="px-3.5 py-3">6. Name of Learner</th>
                  <th className="px-3.5 py-3">7. Father Name</th>
                  <th className="px-3.5 py-3">8. Gender</th>
                  <th className="px-3.5 py-3">9. DOB</th>
                  <th className="px-3.5 py-3">10. Class</th>
                  <th className="px-3.5 py-3">11. Date of Center Beginning</th>
                  <th className="px-3.5 py-3">12. Guardian Contact</th>
                  <th className="px-3.5 py-3">13. Registerd</th>
                  <th className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredStudents.map((student, idx) => {
                  const isReg =
                    (student.registeredStatus && student.registeredStatus.toLowerCase().includes('reg')) ||
                    student.status === 'Active';
                  return (
                    <tr key={student.id} className="hover:bg-slate-850/60 transition">
                      {/* 1. S# */}
                      <td className="px-3.5 py-3 font-mono text-slate-400 font-semibold">
                        {student.serialNo || idx + 1}
                      </td>
                      {/* 2. Roll Num */}
                      <td className="px-3.5 py-3 font-bold text-white font-mono">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{student.rollNo}</span>
                          {student.rollNo?.startsWith('TEMP-') && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800/80"
                              title="Temporary roll number assigned automatically during import. Click Edit to assign permanent roll number."
                            >
                              Temp
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 3. District */}
                      <td className="px-3.5 py-3 text-slate-300">
                        {student.district || 'Lasbela'}
                      </td>
                      {/* 4. School Name */}
                      <td className="px-3.5 py-3 text-slate-300 font-medium">
                        {student.schoolName || 'GBHS Jam Yousf Colony'}
                      </td>
                      {/* 5. Trade */}
                      <td className="px-3.5 py-3 text-slate-300">
                        {student.trade || 'Computer Operator'}
                      </td>
                      {/* 6. Name of Learner */}
                      <td className="px-3.5 py-3">
                        <span className="font-bold text-white">{student.name}</span>
                      </td>
                      {/* 7. Father Name */}
                      <td className="px-3.5 py-3 text-slate-300">
                        {student.fatherName}
                      </td>
                      {/* 8. Gender */}
                      <td className="px-3.5 py-3 text-slate-400">
                        {student.gender || 'Male'}
                      </td>
                      {/* 9. DOB */}
                      <td className="px-3.5 py-3 text-slate-400 font-mono">
                        {student.dob || '—'}
                      </td>
                      {/* 10. Class */}
                      <td className="px-3.5 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950 text-sky-400 border border-sky-800/80">
                          {student.class}
                        </span>
                      </td>
                      {/* 11. Date of Center Beginning */}
                      <td className="px-3.5 py-3 text-slate-400 font-mono">
                        {student.dateOfCenterBeginning || student.admissionDate || '—'}
                      </td>
                      {/* 12. Guardian Contact */}
                      <td className="px-3.5 py-3 text-slate-300 font-mono">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{student.guardianContact || student.phone || '—'}</span>
                          {(student.guardianContact === '0300-0000000' || (!student.guardianContact && student.phone === '0300-0000000')) && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-800 text-slate-400 border border-slate-700"
                              title="Default placeholder contact assigned during import. Click Edit to add actual guardian phone number."
                            >
                              Default
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 13. Registerd */}
                      <td className="px-3.5 py-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            isReg
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                              : 'bg-rose-950 text-rose-400 border border-rose-800/80'
                          }`}
                        >
                          {student.registeredStatus || (isReg ? 'Registerd' : 'Unregisterd')}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-3.5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setStudentToView(student)}
                            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="View Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setStudentToEdit(student);
                              setIsFormOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Edit Student"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setStudentToDelete(student)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                            title="Delete Student"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <StudentFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setStudentToEdit(null);
        }}
        onSaved={fetchStudents}
        studentToEdit={studentToEdit}
        defaultClass={selectedClass === 'All' ? 'Class 7' : selectedClass}
      />

      {/* Details Modal */}
      <StudentDetailModal
        student={studentToView}
        onClose={() => setStudentToView(null)}
        onEdit={(student) => {
          setStudentToEdit(student);
          setIsFormOpen(true);
        }}
      />

      {/* Delete Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
            <div className="w-10 h-10 rounded-full bg-rose-950 text-rose-400 border border-rose-800 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Delete Student Record?</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">{studentToDelete.name}</strong> (Admission:{' '}
              {studentToDelete.admissionNo})? This deletion will be queued in the offline outbox and synced to the cloud.
            </p>

            {deleteError && (
              <p className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded mt-2 border border-rose-800">
                {deleteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                onClick={() => setStudentToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ALL Students Confirmation Modal */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border border-rose-800/60 rounded-2xl p-6 shadow-2xl text-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-950/80 text-rose-400 border border-rose-800/80 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Delete All Student Records?</h3>
            <div className="text-xs text-slate-300 mt-2 space-y-2 leading-relaxed">
              <p>
                Are you sure you want to permanently delete all <strong className="text-rose-400 font-bold">{students.length} student records</strong> (Class 7, 8, & 9) and their attendance from this device?
              </p>
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1 text-slate-400">
                <p className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Clears existing database for clean Excel import</span>
                </p>
                <p className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Demo sample records will not automatically reappear</span>
                </p>
                <p>
                  You can immediately import your updated master Excel sheet right after this.
                </p>
              </div>
            </div>

            {deleteAllError && (
              <p className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-lg mt-3 border border-rose-800">
                {deleteAllError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                disabled={isDeletingAll}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllConfirm}
                disabled={isDeletingAll}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white shadow-lg shadow-rose-950 transition cursor-pointer"
              >
                {isDeletingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting {students.length} Records...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete All ({students.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
