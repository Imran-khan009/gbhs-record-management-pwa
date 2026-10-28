import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Student, ClassLevel, Section, StudentStatus } from '../../types/student';
import { getAllStudents } from '../../services/db';
import {
  deleteStudent,
  deleteAllStudentsData,
  sanitizeCorruptedStudents,
  withdrawStudent,
  reactivateStudent,
  replaceStudent,
  updateStudentStatus,
  compareStudentsByRoll,
} from '../../services/recordService';
import { useAuth } from '../../context/AuthContext';
import { StudentFormModal } from './StudentFormModal';
import { StudentDetailModal } from './StudentDetailModal';
import { exportStudentsToExcel } from '../../services/excelService';
import { getWorkspacePermissions } from '../../services/permissionService';
import { ClassTabs } from '../common/ClassTabs';
import { BulkOperationsService } from '../../services/bulkOperationsService';
import { useSchoolProfile, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';
import {
  Users,
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
  Download,
  CheckCircle2,
  X,
  RefreshCw,
  UserPlus2,
  ChevronDown,
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
  const permissions = getWorkspacePermissions(session?.user);
  const { profile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const configuredClasses = sortClasses(sanitizeClasses(profile.classes));
  const enrolledClassNames = Array.from(new Set(students.map((s) => s.class).filter(Boolean)));
  const displayClasses = sortClasses(Array.from(new Set([...configuredClasses, ...enrolledClassNames])));

  // Filters
  const [selectedClass, setSelectedClass] = useState<ClassLevel | 'All'>('All');
  const [selectedSection, setSelectedSection] = useState<Section | 'All'>('All');
  const [selectedStatus, setSelectedStatus] = useState<StudentStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown & Modals state
  const [isDataMenuOpen, setIsDataMenuOpen] = useState(false);
  const dataMenuRef = useRef<HTMLDivElement>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [studentToView, setStudentToView] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [targetLifecycleStatus, setTargetLifecycleStatus] = useState<StudentStatus>('Withdrawn');
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [studentToReplace, setStudentToReplace] = useState<Student | null>(null);
  const [replacementForm, setReplacementForm] = useState({
    name: '',
    fatherName: '',
    rollNo: '',
    phone: '',
    gender: 'Male',
    section: 'A' as Section,
  });
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Lock background scrolling whenever warning or delete modal is open
  useEffect(() => {
    if (studentToDelete || isDeleteAllModalOpen || studentToReplace) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [studentToDelete, isDeleteAllModalOpen, studentToReplace]);

  // Close Data Actions dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dataMenuRef.current && !dataMenuRef.current.contains(event.target as Node)) {
        setIsDataMenuOpen(false);
      }
    };
    if (isDataMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDataMenuOpen]);

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
    const handleReactivity = () => {
      fetchStudents();
    };
    window.addEventListener('gbhs_records_imported', handleReactivity);
    window.addEventListener('gbhs_students_changed', handleReactivity);
    return () => {
      window.removeEventListener('gbhs_records_imported', handleReactivity);
      window.removeEventListener('gbhs_students_changed', handleReactivity);
    };
  }, [refreshKey]);

  const handleDeleteConfirm = async () => {
    if (!studentToDelete) return;
    setDeleteError(null);
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    const res = await deleteStudent(studentToDelete.id, userEmail, {
      reason: lifecycleReason.trim() || undefined,
    });
    if (res.success) {
      const studentName = studentToDelete.name;
      setStudentToDelete(null);
      setLifecycleReason('');
      setExportNotice({
        type: 'success',
        message: `Successfully marked "${studentName}" as Withdrawn. Historical attendance and records are preserved.`,
      });
      setTimeout(() => setExportNotice(null), 5000);
      await fetchStudents();
    } else {
      setDeleteError(res.error || 'Failed to update student status.');
    }
  };

  const handleReactivate = async (student: Student) => {
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    const res = await reactivateStudent(student.id, userEmail);
    if (res.success) {
      setExportNotice({
        type: 'success',
        message: `Successfully reactivated "${student.name}". Student restored to active attendance roster.`,
      });
      setTimeout(() => setExportNotice(null), 5000);
      await fetchStudents();
    } else {
      setExportNotice({
        type: 'error',
        message: res.error || 'Failed to reactivate student.',
      });
    }
  };

  const handleOpenReplaceModal = (student: Student) => {
    setStudentToReplace(student);
    setReplaceError(null);
    setReplacementForm({
      name: '',
      fatherName: '',
      rollNo: student.rollNo ? `${student.rollNo}-R` : '',
      phone: student.phone || '',
      gender: (student.gender as string) || 'Male',
      section: (student.section as Section) || 'A',
    });
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToReplace) return;
    if (!replacementForm.name.trim()) {
      setReplaceError('Replacement candidate name is required.');
      return;
    }
    if (!replacementForm.fatherName.trim()) {
      setReplaceError('Father name is required.');
      return;
    }
    if (!replacementForm.rollNo.trim()) {
      setReplaceError('Roll number is required.');
      return;
    }

    setIsReplacing(true);
    setReplaceError(null);
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    try {
      const res = await replaceStudent(
        studentToReplace.id,
        {
          name: replacementForm.name.trim(),
          fatherName: replacementForm.fatherName.trim(),
          rollNo: replacementForm.rollNo.trim(),
          phone: replacementForm.phone.trim(),
          gender: replacementForm.gender,
          section: replacementForm.section,
          class: studentToReplace.class,
          district: studentToReplace.district,
          schoolName: studentToReplace.schoolName,
          trade: studentToReplace.trade,
          status: 'Active',
          registeredStatus: 'Registerd',
          admissionNo: `ADM-${studentToReplace.class.replace(/\D/g, '') || '1'}${replacementForm.section}-${replacementForm.rollNo.trim().padStart(3, '0')}`,
        },
        userEmail
      );

      if (res.success) {
        setStudentToReplace(null);
        setExportNotice({
          type: 'success',
          message: `Successfully enrolled replacement student "${replacementForm.name}". "${studentToReplace.name}" history preserved as Withdrawn.`,
        });
        setTimeout(() => setExportNotice(null), 5000);
        await fetchStudents();
      } else {
        setReplaceError(res.error || 'Failed to enroll replacement student.');
      }
    } catch (err: any) {
      setReplaceError(err.message || 'An unexpected error occurred during replacement.');
    } finally {
      setIsReplacing(false);
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

  // Filter logic with roll number sorting
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
    .sort(compareStudentsByRoll);

  return (
    <div className="space-y-6">
      {/* 1. Page Heading Area & Unified Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#3D4A41]/60">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#F6F3EA] flex items-center gap-2.5 tracking-tight">
            <Users className="w-6 h-6 text-[#D97745]" />
            <span>Student Master Directory</span>
          </h2>
          <p className="text-xs text-[#9BAE9C] mt-1 font-normal">
            Preserving accurate student records with offline persistence and version control.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Data Actions Dropdown Menu */}
          <div className="relative" ref={dataMenuRef}>
            <button
              type="button"
              onClick={() => setIsDataMenuOpen((prev) => !prev)}
              className="group inline-flex items-center gap-2 bg-[#2B352E] hover:bg-[#344037] active:bg-[#202822] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#9BAE9C]/60 px-3.5 py-2 rounded-xl text-xs font-medium shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.975] transition-all duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] focus-visible:ring-offset-2 focus-visible:ring-offset-[#202822]"
              aria-expanded={isDataMenuOpen}
              aria-haspopup="true"
              title="Data Actions (Import, Export, Template, Roster Management)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#9BAE9C] transition-transform duration-150 group-hover:scale-110 group-hover:-rotate-3" />
              <span>Data Actions</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#9BAE9C] transition-transform duration-150 ${
                  isDataMenuOpen ? 'rotate-180' : 'group-hover:translate-y-0.5'
                }`}
              />
            </button>

            {isDataMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 bg-[#2B352E] border border-[#3D4A41] rounded-xl shadow-2xl p-1.5 z-30 transition-all duration-150"
              >
                {permissions.canImport && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDataMenuOpen(false);
                        onOpenImport();
                      }}
                      className="group w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#F6F3EA] hover:bg-[#202822] hover:translate-x-1 active:scale-[0.98] rounded-lg text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:bg-[#202822] focus-visible:ring-1 focus-visible:ring-[#D97745]"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-[#9BAE9C] transition-transform duration-150 group-hover:scale-110 group-hover:-rotate-3 shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-medium text-[#F6F3EA] group-hover:text-white">Import Excel</span>
                        <span className="text-[10px] text-[#9BAE9C]">Batch student spreadsheet (.xlsx)</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsDataMenuOpen(false);
                        BulkOperationsService.downloadTemplate('students');
                      }}
                      className="group w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#F6F3EA] hover:bg-[#202822] hover:translate-x-1 active:scale-[0.98] rounded-lg text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:bg-[#202822] focus-visible:ring-1 focus-visible:ring-[#D97745]"
                    >
                      <Download className="w-4 h-4 text-[#9BAE9C] transition-transform duration-150 group-hover:translate-y-0.5 shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-medium text-[#F6F3EA] group-hover:text-white">Download Template</span>
                        <span className="text-[10px] text-[#9BAE9C]">Official student roster format</span>
                      </div>
                    </button>
                  </>
                )}

                {permissions.canExport && (
                  <button
                    type="button"
                    disabled={filteredStudents.length === 0}
                    onClick={() => {
                      setIsDataMenuOpen(false);
                      handleExportExcel();
                    }}
                    className="group w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#F6F3EA] hover:bg-[#202822] hover:translate-x-1 active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:translate-x-0 rounded-lg text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:bg-[#202822] focus-visible:ring-1 focus-visible:ring-[#D97745]"
                  >
                    <Download className="w-4 h-4 text-[#9BAE9C] transition-transform duration-150 group-hover:translate-y-0.5 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium text-[#F6F3EA] group-hover:text-white">Export to Excel</span>
                      <span className="text-[10px] text-[#9BAE9C]">
                        {filteredStudents.length === 0
                          ? 'No active records'
                          : `Export ${filteredStudents.length} student(s)`}
                      </span>
                    </div>
                  </button>
                )}

                {/* Destructive Operation: Visually Separated */}
                {permissions.canDelete && students.length > 0 && (
                  <>
                    <div className="my-1 border-t border-[#3D4A41]" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsDataMenuOpen(false);
                        setDeleteAllError(null);
                        setIsDeleteAllModalOpen(true);
                      }}
                      className="group w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-300 hover:bg-rose-950/40 hover:translate-x-1 active:scale-[0.98] rounded-lg text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:bg-rose-950/40 focus-visible:ring-1 focus-visible:ring-rose-500"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400 transition-transform duration-150 group-hover:rotate-12 shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-rose-300">Delete All Students</span>
                        <span className="text-[10px] text-rose-400/80">
                          Clear active roster ({students.length})
                        </span>
                      </div>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Primary Action Button: Add Student (Copper) */}
          {permissions.canAdd && (
            <button
              type="button"
              onClick={() => {
                setStudentToEdit(null);
                setIsFormOpen(true);
              }}
              className="group inline-flex items-center gap-1.5 bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs hover:shadow-md hover:shadow-[#D97745]/25 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.975] transition-all duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] focus-visible:ring-offset-2 focus-visible:ring-offset-[#202822]"
            >
              <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
              <span>Add Student</span>
            </button>
          )}
        </div>
      </div>

      {/* Read-Only Access Banner */}
      {permissions.isReadOnly && (
        <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-xs text-amber-300 flex items-center gap-2.5">
          <Eye className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Approved Staff Access (Read & Export):</strong> You are viewing shared student records with export privileges. Record additions, edits, deletions, and spreadsheet imports can only be performed by the Workspace Owner.
          </span>
        </div>
      )}

      {/* Export / Operation Feedback Banner */}
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
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] p-1 rounded-lg transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97745]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="bg-[#2B352E] border border-[#3D4A41] p-3 rounded-xl flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#9BAE9C] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, father name, admission no, or roll no..."
            className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl pl-9 pr-8 py-2 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745] transition min-h-[38px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-[#9BAE9C] hover:text-[#F6F3EA] p-0.5 rounded cursor-pointer transition-all duration-150 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97745]"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Compact Reusable Class Selector */}
        <div className="w-full md:w-52 shrink-0">
          <ClassTabs
            selectedClass={selectedClass}
            onSelectClass={(c) => setSelectedClass(c)}
            classes={displayClasses}
            counts={students.reduce(
              (acc, s) => {
                if (s.class) {
                  acc[s.class] = (acc[s.class] || 0) + 1;
                }
                return acc;
              },
              {
                all: students.length,
              } as Record<string, number>
            )}
          />
        </div>

        <div className="w-full md:w-44 shrink-0">
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value as any)}
            className="w-full bg-[#202822] border border-[#3D4A41] rounded-xl px-2.5 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745] transition cursor-pointer min-h-[38px]"
          >
            <option value="All">All Sections (A, B, C)</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
            <option value="General">General</option>
          </select>
        </div>

        <div className="w-full md:w-48 shrink-0">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-2.5 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745] transition cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive</option>
            <option value="Withdrawn">Withdrawn (Dropout / Left)</option>
            <option value="Transferred">Transferred</option>
          </select>
        </div>
      </div>

      {/* Student List Table & Empty State */}
      <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl overflow-hidden shadow-sm">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-10 h-10 text-[#9BAE9C]/60 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-[#F6F3EA]">No student records found</h3>
            <p className="text-xs text-[#9BAE9C] mt-1.5 max-w-md mx-auto leading-relaxed">
              {students.length === 0
                ? 'Your student database is empty. You can now import your master Excel sheet to automatically populate Class 7, 8, and 9 students.'
                : 'No students match your active filters or search keyword.'}
            </p>
            {students.length === 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="group inline-flex items-center gap-2 bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs hover:shadow-md hover:shadow-[#D97745]/25 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.975] transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B352E]"
                >
                  <FileSpreadsheet className="w-4 h-4 transition-transform duration-150 group-hover:scale-110" />
                  <span>Import Excel / CSV Sheet</span>
                </button>
                {permissions.canAdd && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentToEdit(null);
                      setIsFormOpen(true);
                    }}
                    className="group inline-flex items-center gap-1.5 bg-[#202822] hover:bg-[#2B352E] active:bg-[#181F1A] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#9BAE9C]/60 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.975] transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B352E]"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#D97745] transition-transform duration-200 group-hover:rotate-90" />
                    <span>Enroll Single Student</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#F6F3EA] whitespace-nowrap">
              <thead className="bg-[#202822] border-b border-[#3D4A41] text-[11px] font-semibold text-[#9BAE9C] uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-3.5 py-3">S#</th>
                  <th className="px-3.5 py-3">Roll Num</th>
                  <th className="px-3.5 py-3">District</th>
                  <th className="px-3.5 py-3">School Name</th>
                  <th className="px-3.5 py-3">Trade</th>
                  <th className="px-3.5 py-3">Name of Learner</th>
                  <th className="px-3.5 py-3">Father Name</th>
                  <th className="px-3.5 py-3">Gender</th>
                  <th className="px-3.5 py-3">DOB</th>
                  <th className="px-3.5 py-3">Class</th>
                  <th className="px-3.5 py-3">Center Beginning</th>
                  <th className="px-3.5 py-3">Guardian Contact</th>
                  <th className="px-3.5 py-3">Status</th>
                  <th className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3D4A41]/40">
                {filteredStudents.map((student, idx) => {
                  const isReg =
                    (student.registeredStatus && student.registeredStatus.toLowerCase().includes('reg')) ||
                    student.status === 'Active';
                  return (
                    <tr key={student.id} className="hover:bg-[#202822]/60 transition-colors duration-150">
                      {/* 1. S# */}
                      <td className="px-3.5 py-3 font-mono text-[#9BAE9C] font-medium text-xs">
                        {student.serialNo || idx + 1}
                      </td>

                      {/* 2. Roll Num */}
                      <td className="px-3.5 py-3 font-bold text-[#F6F3EA] font-mono">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{student.rollNo}</span>
                          {student.rollNo?.startsWith('TEMP-') && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800/80"
                              title="Temporary roll number assigned automatically during import. Click Edit to assign permanent roll number."
                            >
                              Temp
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. District */}
                      <td className="px-3.5 py-3 text-[#9BAE9C]">
                        {student.district || 'Lasbela'}
                      </td>

                      {/* 4. School Name */}
                      <td className="px-3.5 py-3 text-[#F6F3EA] font-medium">
                        {student.schoolName || 'GBHS Jam Yousf Colony'}
                      </td>

                      {/* 5. Trade */}
                      <td className="px-3.5 py-3 text-[#9BAE9C]">
                        {student.trade || 'Computer Operator'}
                      </td>

                      {/* 6. Name of Learner */}
                      <td className="px-3.5 py-3">
                        <span className="font-bold text-[#F6F3EA]">{student.name}</span>
                      </td>

                      {/* 7. Father Name */}
                      <td className="px-3.5 py-3 text-[#9BAE9C]">
                        {student.fatherName}
                      </td>

                      {/* 8. Gender */}
                      <td className="px-3.5 py-3 text-[#9BAE9C]">
                        {student.gender || 'Male'}
                      </td>

                      {/* 9. DOB */}
                      <td className="px-3.5 py-3 text-[#9BAE9C] font-mono">
                        {student.dob || '—'}
                      </td>

                      {/* 10. Class & Section */}
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#202822] text-[#9BAE9C] border border-[#3D4A41]">
                            {student.class}
                          </span>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#2B352E] text-[#F6F3EA] border border-[#3D4A41]">
                            Sec {student.section || 'A'}
                          </span>
                        </div>
                      </td>

                      {/* 11. Date of Center Beginning */}
                      <td className="px-3.5 py-3 text-[#9BAE9C] font-mono">
                        {student.dateOfCenterBeginning || student.admissionDate || '—'}
                      </td>

                      {/* 12. Guardian Contact */}
                      <td className="px-3.5 py-3 text-[#9BAE9C] font-mono">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{student.guardianContact || student.phone || '—'}</span>
                          {(student.guardianContact === '0300-0000000' ||
                            (!student.guardianContact && student.phone === '0300-0000000')) && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[#202822] text-[#9BAE9C] border border-[#3D4A41]"
                              title="Default placeholder contact assigned during import. Click Edit to add actual guardian phone number."
                            >
                              Default
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 13. Registerd / Status */}
                      <td className="px-3.5 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-center ${
                              student.status === 'Active'
                                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/80'
                                : student.status === 'Withdrawn'
                                ? 'bg-rose-950/70 text-rose-300 border border-rose-800/80'
                                : student.status === 'Transferred'
                                ? 'bg-[#202822] text-[#9BAE9C] border border-[#3D4A41]'
                                : 'bg-[#202822] text-[#9BAE9C] border border-[#3D4A41]'
                            }`}
                          >
                            {student.status || (isReg ? 'Active' : 'Inactive')}
                          </span>
                          {student.withdrawalReason && (
                            <span
                              className="text-[9px] text-rose-400/90 truncate max-w-[130px]"
                              title={`Reason: ${student.withdrawalReason}`}
                            >
                              {student.withdrawalReason}
                            </span>
                          )}
                          {student.transferDetails && (
                            <span
                              className="text-[9px] text-[#9BAE9C] truncate max-w-[130px]"
                              title={`Transferred to: ${student.transferDetails}`}
                            >
                              {student.transferDetails}
                            </span>
                          )}
                          {student.replacementStudentId && (
                            <span className="text-[9px] text-[#D97745] font-medium">Replaced</span>
                          )}
                          {student.replacedStudentId && (
                            <span className="text-[9px] text-emerald-400 font-medium">Replacement</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setStudentToView(student)}
                            className="group p-1.5 text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] hover:-translate-y-0.5 active:translate-y-0 active:scale-90 rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745]"
                            title="View Profile & Complete History"
                          >
                            <Eye className="w-3.5 h-3.5 transition-transform duration-150 group-hover:scale-110" />
                          </button>
                          {permissions.canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setStudentToEdit(student);
                                setIsFormOpen(true);
                              }}
                              className="group p-1.5 text-[#9BAE9C] hover:text-amber-400 hover:bg-[#202822] hover:-translate-y-0.5 active:translate-y-0 active:scale-90 rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                              title="Edit Student"
                            >
                              <Pencil className="w-3.5 h-3.5 transition-transform duration-150 group-hover:rotate-12 group-hover:scale-110" />
                            </button>
                          )}
                          {/* Quick Lifecycle Reactivation */}
                          {permissions.canEdit && student.status !== 'Active' && (
                            <button
                              type="button"
                              onClick={() => handleReactivate(student)}
                              className="group p-1.5 text-[#9BAE9C] hover:text-emerald-400 hover:bg-emerald-950/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-90 rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                              title="Reactivate Student (Restore to Active Attendance)"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 transition-transform duration-200 group-hover:rotate-180" />
                            </button>
                          )}
                          {/* Replacement Action for Withdrawn Students */}
                          {permissions.canAdd &&
                            student.status === 'Withdrawn' &&
                            !student.replacementStudentId && (
                              <button
                                type="button"
                                onClick={() => handleOpenReplaceModal(student)}
                                className="group p-1.5 text-[#9BAE9C] hover:text-[#D97745] hover:bg-[#202822] hover:-translate-y-0.5 active:translate-y-0 active:scale-90 rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745]"
                                title="Enroll Replacement Student for Trade Seat"
                              >
                                <UserPlus2 className="w-3.5 h-3.5 text-[#D97745] transition-transform duration-150 group-hover:scale-110 group-hover:-translate-y-0.5" />
                              </button>
                            )}
                          {permissions.canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setStudentToDelete(student);
                                setTargetLifecycleStatus(student.status === 'Active' ? 'Withdrawn' : student.status);
                                setLifecycleReason(student.withdrawalReason || student.transferDetails || '');
                              }}
                              className="group p-1.5 text-[#9BAE9C] hover:text-rose-400 hover:bg-rose-950/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-90 rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                              title={
                                student.status === 'Active'
                                  ? 'Withdraw / Remove Student (Preserves History)'
                                  : 'Status / Archive'
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5 transition-transform duration-150 group-hover:rotate-12 group-hover:scale-110" />
                            </button>
                          )}
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
        defaultClass={(!selectedClass || selectedClass.startsWith('All')) ? 'Class 1' : (selectedClass as ClassLevel)}
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

      {/* Status & Withdrawal Modal */}
      {studentToDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-xs overscroll-contain overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm sm:max-w-md bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-5 sm:p-6 shadow-2xl text-[#F6F3EA] m-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
              <div className="w-11 h-11 rounded-full bg-rose-950/80 text-rose-400 border border-rose-800/80 flex items-center justify-center mb-3 shrink-0 shadow-sm">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#F6F3EA] leading-tight">
                {studentToDelete.status === 'Active' ? 'Withdraw / Remove Student' : 'Update Student Status'}
              </h3>
              <div className="overflow-y-auto pr-1 mt-2.5 space-y-3 text-xs sm:text-sm">
                <p className="text-[#9BAE9C] leading-relaxed">
                  Student: <strong className="text-[#F6F3EA]">{studentToDelete.name}</strong> (Roll #{studentToDelete.rollNo} • {studentToDelete.class}).
                </p>

                {/* Non-destructive guarantee banner */}
                <div className="p-3 bg-[#202822] border border-[#3D4A41] rounded-xl space-y-1 text-xs text-[#9BAE9C]">
                  <p className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Historical records are permanently preserved</span>
                  </p>
                  <p className="text-[#9BAE9C] text-[11px] leading-relaxed">
                    Student will be excluded from default daily attendance, but their past attendance, assessments, teaching logs, and history will remain in monthly reports and archives.
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">Target Status</label>
                    <select
                      value={targetLifecycleStatus}
                      onChange={(e) => setTargetLifecycleStatus(e.target.value as StudentStatus)}
                      className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-3 py-2 text-xs sm:text-sm text-[#F6F3EA] focus:outline-none focus:border-[#D97745] transition cursor-pointer"
                    >
                      <option value="Withdrawn">Withdrawn (Dropout / Left Center)</option>
                      <option value="Transferred">Transferred to Other School</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">
                      {targetLifecycleStatus === 'Withdrawn'
                        ? 'Withdrawal Reason (Optional)'
                        : targetLifecycleStatus === 'Transferred'
                        ? 'Destination School / Transfer Details'
                        : 'Reason (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={lifecycleReason}
                      onChange={(e) => setLifecycleReason(e.target.value)}
                      placeholder={
                        targetLifecycleStatus === 'Withdrawn'
                          ? 'e.g. Relocated to another district, financial hardship...'
                          : 'e.g. Transferred to GBHS Hub...'
                      }
                      className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-3 py-2 text-xs sm:text-sm text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745] transition"
                    />
                  </div>
                </div>

                {deleteError && (
                  <p className="text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/80">
                    {deleteError}
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 mt-5 pt-3 border-t border-[#3D4A41]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setStudentToDelete(null);
                    setLifecycleReason('');
                  }}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] border border-[#3D4A41] cursor-pointer text-center transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white cursor-pointer shadow-md shadow-rose-950/50 text-center transition-colors"
                >
                  Confirm Status Change
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Replacement Student Modal */}
      {studentToReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#2B352E] border border-[#3D4A41] rounded-2xl p-6 shadow-2xl text-[#F6F3EA] my-6 animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-xl bg-[#202822] text-[#D97745] border border-[#3D4A41] flex items-center justify-center mb-3">
              <UserPlus2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#F6F3EA]">Enroll Replacement Student</h3>
            <p className="text-xs text-[#9BAE9C] mt-1 leading-relaxed">
              Replacing seat previously held by <strong className="text-[#F6F3EA]">{studentToReplace.name}</strong> (Roll #{studentToReplace.rollNo} • {studentToReplace.class}).
              Original records will remain permanently intact.
            </p>

            <form onSubmit={handleReplaceSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">
                  New Learner Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={replacementForm.name}
                  onChange={(e) => setReplacementForm({ ...replacementForm, name: e.target.value })}
                  placeholder="Full name of replacement candidate"
                  className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-3 py-2 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">
                  Father Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={replacementForm.fatherName}
                  onChange={(e) => setReplacementForm({ ...replacementForm, fatherName: e.target.value })}
                  placeholder="Father's name"
                  className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-3 py-2 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745] transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">
                    New Roll Num <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={replacementForm.rollNo}
                    onChange={(e) => setReplacementForm({ ...replacementForm, rollNo: e.target.value })}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745] font-mono transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">Section</label>
                  <select
                    value={replacementForm.section}
                    onChange={(e) => setReplacementForm({ ...replacementForm, section: e.target.value as Section })}
                    className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-3 py-2 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745] transition cursor-pointer"
                  >
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">Guardian Contact</label>
                <input
                  type="text"
                  value={replacementForm.phone}
                  onChange={(e) => setReplacementForm({ ...replacementForm, phone: e.target.value })}
                  placeholder="e.g. 03412089077"
                  className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-3 py-2 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/60 focus:outline-none focus:border-[#D97745] font-mono transition"
                />
              </div>

              {replaceError && (
                <p className="text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/80">
                  {replaceError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStudentToReplace(null)}
                  className="btn-interactive px-3.5 py-2 rounded-xl text-xs text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReplacing}
                  className="btn-interactive group inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] disabled:opacity-50 text-white cursor-pointer shadow-md shadow-[#D97745]/20"
                >
                  {isReplacing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Enrolling...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus2 className="w-3.5 h-3.5 transition-transform duration-150 group-hover:scale-110" />
                      <span>Enroll Replacement</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete ALL Students Confirmation Modal */}
      {isDeleteAllModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-xs overscroll-contain overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm sm:max-w-md bg-[#2B352E] border border-rose-800/60 rounded-2xl p-5 sm:p-6 shadow-2xl text-[#F6F3EA] m-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
              <div className="w-11 h-11 rounded-full bg-rose-950/80 text-rose-400 border border-rose-800/80 flex items-center justify-center mb-3 shrink-0 shadow-sm">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#F6F3EA] leading-tight">Delete All Student Records?</h3>
              <div className="overflow-y-auto pr-1 mt-2.5 space-y-2 text-xs sm:text-sm text-[#9BAE9C] leading-relaxed">
                <p>
                  Are you sure you want to delete all <strong className="text-rose-400 font-bold">{students.length} student records</strong> from this device?
                </p>
                <div className="p-3 bg-[#202822] border border-[#3D4A41] rounded-xl space-y-1.5 text-xs text-[#9BAE9C]">
                  <p className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Clears unassessed rosters for a clean Excel re-import</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Protected: Automatically blocked if attendance or module records exist</span>
                  </p>
                  <p className="text-[11px] text-[#9BAE9C] leading-normal">
                    To preserve academic records and data integrity, students with attendance history must be withdrawn individually.
                  </p>
                </div>

                {deleteAllError && (
                  <p className="text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/80">
                    {deleteAllError}
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 mt-5 pt-3 border-t border-[#3D4A41]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsDeleteAllModalOpen(false)}
                  disabled={isDeletingAll}
                  className="btn-interactive w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] border border-[#3D4A41] cursor-pointer text-center transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAllConfirm}
                  disabled={isDeletingAll}
                  className="btn-interactive group inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[42px] px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-500 active:bg-rose-700 disabled:opacity-50 text-white shadow-lg shadow-rose-950/50 cursor-pointer text-center transition-colors"
                >
                  {isDeletingAll ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting {students.length} Records...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5 transition-transform duration-150 group-hover:rotate-12" />
                      <span>Confirm Delete All ({students.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
