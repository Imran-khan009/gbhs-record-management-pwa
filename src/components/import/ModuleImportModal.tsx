import React, { useState, useRef, useEffect } from 'react';
import {
  BulkOperationsService,
  BulkModuleType,
  BulkImportRowValidation,
  BulkParseResult,
  BulkCommitResult,
} from '../../services/bulkOperationsService';
import { useAuth } from '../../context/AuthContext';
import { getWorkspacePermissions } from '../../services/permissionService';
import {
  X,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Check,
  CalendarCheck,
  BookOpen,
  Award,
  UserX,
  Users,
  Info,
  ChevronDown,
  Layers,
  ArrowRight,
  ShieldCheck,
  Filter,
} from 'lucide-react';

export type ModuleType = BulkModuleType | 'teaching_log' | 'practical' | 'absentee';

interface ModuleImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  initialModuleType?: ModuleType;
}

export const ModuleImportModal: React.FC<ModuleImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  initialModuleType = 'attendance',
}) => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [moduleType, setModuleType] = useState<BulkModuleType>(
    BulkOperationsService.normalizeModuleType(initialModuleType)
  );
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [parseResult, setParseResult] = useState<BulkParseResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>('update');
  const [autoEnrollMissing, setAutoEnrollMissing] = useState<boolean>(true);
  const [allowHistoricalBackfill, setAllowHistoricalBackfill] = useState<boolean>(false);
  const [explicitTargetMonth, setExplicitTargetMonth] = useState<string>('');
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'invalid' | 'duplicate'>('all');
  const [commitResult, setCommitResult] = useState<BulkCommitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync initial module type when opening
  useEffect(() => {
    if (isOpen) {
      setModuleType(BulkOperationsService.normalizeModuleType(initialModuleType));
      resetState();
    }
  }, [isOpen, initialModuleType]);

  const resetState = () => {
    setFile(null);
    setParseResult(null);
    setCommitResult(null);
    setErrorMessage(null);
    setAllowHistoricalBackfill(false);
    setExplicitTargetMonth('');
    setSelectedRowIndices(new Set());
    setFilterTab('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    try {
      await BulkOperationsService.downloadTemplateWithRoster(moduleType);
    } catch {
      BulkOperationsService.downloadTemplate(moduleType);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    await processFile(selectedFile);
  };

  const processFile = async (
    targetFile: File,
    sheet?: string,
    overrideAutoEnroll?: boolean,
    overrideStrategy?: 'skip' | 'update',
    overrideBackfill?: boolean,
    overrideTargetMonth?: string
  ) => {
    setIsParsing(true);
    setErrorMessage(null);
    setCommitResult(null);
    setFile(targetFile);

    try {
      const activeAutoEnroll = overrideAutoEnroll !== undefined ? overrideAutoEnroll : autoEnrollMissing;
      const activeStrategy = overrideStrategy !== undefined ? overrideStrategy : duplicateStrategy;
      const activeBackfill = overrideBackfill !== undefined ? overrideBackfill : allowHistoricalBackfill;
      const activeTargetMonth = overrideTargetMonth !== undefined ? overrideTargetMonth : explicitTargetMonth;

      const result = await BulkOperationsService.parseFile(targetFile, moduleType, {
        sheetName: sheet,
        duplicateStrategy: activeStrategy,
        autoEnrollMissingStudents: activeAutoEnroll,
        allowHistoricalBackfill: activeBackfill,
        attendanceContext: activeTargetMonth ? { targetMonth: activeTargetMonth } : undefined,
      });
      setParseResult(result);
      setSelectedSheet(result.sheetName);

      // Default select all valid rows
      const initialSelected = new Set<number>();
      for (const r of result.validRows) {
        if (r.isValid) {
          initialSelected.add(r.rowIndex);
        }
      }
      setSelectedRowIndices(initialSelected);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setErrorMessage(err.message || 'Failed to parse file. Verify that it is a valid spreadsheet.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSheetChange = async (sheet: string) => {
    if (!file) return;
    await processFile(file, sheet, autoEnrollMissing, duplicateStrategy, allowHistoricalBackfill);
  };

  const toggleRowSelection = (rowIndex: number) => {
    const next = new Set(selectedRowIndices);
    if (next.has(rowIndex)) next.delete(rowIndex);
    else next.add(rowIndex);
    setSelectedRowIndices(next);
  };

  const handleSelectAll = (select: boolean) => {
    if (!parseResult) return;
    if (!select) {
      setSelectedRowIndices(new Set());
      return;
    }
    const next = new Set<number>();
    for (const r of parseResult.validRows) {
      if (r.isValid) {
        next.add(r.rowIndex);
      }
    }
    setSelectedRowIndices(next);
  };

  const handleCommit = async () => {
    if (!parseResult) return;
    if (permissions.isReadOnly) {
      setErrorMessage('Permission denied: Read-only accounts cannot import data.');
      return;
    }
    if (parseResult.calendarConflict?.hasConflict) {
      setErrorMessage(parseResult.calendarConflict.message);
      return;
    }

    const rowsToCommit = parseResult.validRows.filter((r) => selectedRowIndices.has(r.rowIndex));
    if (rowsToCommit.length === 0) {
      setErrorMessage('No valid rows selected for import.');
      return;
    }

    setIsCommitting(true);
    setErrorMessage(null);

    try {
      const userEmail = session?.user?.email || 'operator@gbhs.edu.pk';
      const res = await BulkOperationsService.commit(moduleType, rowsToCommit, {
        duplicateStrategy,
        userEmail,
      });
      setCommitResult(res);
      onImportComplete();
    } catch (err: any) {
      console.error('Commit error:', err);
      setErrorMessage(err.message || 'Failed to import records.');
    } finally {
      setIsCommitting(false);
    }
  };

  // Filtered rows for the preview table across All, Valid, and Invalid tabs
  const displayedRows = (parseResult?.validRows || []).filter((r) => {
    if (filterTab === 'valid') return r.isValid && !r.isDuplicate;
    if (filterTab === 'duplicate') return r.isDuplicate;
    if (filterTab === 'invalid') return !r.isValid;
    return true; // 'all'
  });

  const getModuleMeta = () => {
    switch (moduleType) {
      case 'students':
        return {
          title: 'Student Roster Import',
          desc: 'Bulk import and update student records, admission numbers, and grade levels.',
          icon: <Users className="w-5 h-5 text-emerald-400" />,
        };
      case 'attendance':
        return {
          title: 'Daily Attendance Register Import',
          desc: 'Bulk import daily attendance marks with student Roll No matching and duplicate detection.',
          icon: <CalendarCheck className="w-5 h-5 text-[#D97745]" />,
        };
      case 'teaching_logs':
        return {
          title: 'Curriculum Teaching Log Import',
          desc: 'Bulk import daily curriculum logs, topics covered, and student completion metrics.',
          icon: <BookOpen className="w-5 h-5 text-[#9BAE9C]" />,
        };
      case 'practical_progress':
        return {
          title: 'Practical Lab Tracker Import',
          desc: 'Bulk import hands-on lab evaluations, task scores, and proficiency statuses.',
          icon: <Award className="w-5 h-5 text-emerald-400" />,
        };
      case 'absentee_followups':
        return {
          title: 'Absentee Follow-up Outreach Import',
          desc: 'Bulk import guardian outreach calls, reasons for absence, and case resolution statuses.',
          icon: <UserX className="w-5 h-5 text-amber-400" />,
        };
    }
  };

  const meta = getModuleMeta();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              {meta.icon}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{meta.title}</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-[#D97745]/15 text-[#E48B5D] border border-[#D97745]/30">
                  Bulk Operations Engine
                </span>
              </h3>
              <p className="text-xs text-slate-400">{meta.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-[#F6F3EA] border border-[#9BAE9C]/30 transition cursor-pointer"
              title="Download pre-formatted Excel template with exact headers"
            >
              <Download className="w-3.5 h-3.5 text-[#9BAE9C]" />
              <span>Download Template (.xlsx)</span>
            </button>
            <button
              onClick={onClose}
              className="btn-interactive p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Module Switcher Bar */}
        {!commitResult && !parseResult && (
          <div className="px-6 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 text-xs overflow-x-auto">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-slate-400 font-semibold mr-1">Switch Module:</span>
              <button
                type="button"
                onClick={() => {
                  setModuleType('students');
                  resetState();
                }}
                className={`btn-interactive flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  moduleType === 'students'
                    ? 'bg-[#D97745] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Students</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModuleType('attendance');
                  resetState();
                }}
                className={`btn-interactive flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  moduleType === 'attendance'
                    ? 'bg-[#D97745] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>Attendance</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModuleType('teaching_logs');
                  resetState();
                }}
                className={`btn-interactive flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  moduleType === 'teaching_logs'
                    ? 'bg-[#D97745] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Teaching Log</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModuleType('practical_progress');
                  resetState();
                }}
                className={`btn-interactive flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  moduleType === 'practical_progress'
                    ? 'bg-[#D97745] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Practical Tracker</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModuleType('absentee_followups');
                  resetState();
                }}
                className={`btn-interactive flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  moduleType === 'absentee_followups'
                    ? 'bg-[#D97745] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Absentee Outreach</span>
              </button>
            </div>

            {/* Template Quick Guidance */}
            <div className="flex items-center gap-2 text-slate-400 text-[11px] shrink-0">
              <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Uses standard Roll No / Admission No. Historical dates preserved.</span>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/80 text-xs text-rose-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200 font-bold">
                ✕
              </button>
            </div>
          )}

          {/* SUCCESS SCREEN */}
          {commitResult ? (
            <div className="space-y-5 text-center py-6">
              {commitResult.createdCount === 0 && commitResult.updatedCount === 0 ? (
                <div className="space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white">No New Records Saved</h4>
                    <p className="text-xs text-amber-300/90 mt-1 max-w-md mx-auto">
                      {commitResult.skippedCount > 0
                        ? `${commitResult.skippedCount} record${commitResult.skippedCount === 1 ? '' : 's'} already existed in the database and ${commitResult.skippedCount === 1 ? 'was' : 'were'} skipped because "Skip duplicates" was selected. If you wish to overwrite them, choose "Update existing records with new data".`
                        : 'No records could be committed to the database. Review the warnings below.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white">Bulk Import Successfully Completed</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Imported records are stored in local IndexedDB and queued in the Outbox for seamless synchronization.
                    </p>
                  </div>
                </div>
              )}

              {/* Counters Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto text-left text-xs">
                <div className="bg-slate-850 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Created</span>
                  <span className="text-xl font-bold text-emerald-400">{commitResult.createdCount}</span>
                </div>
                <div className="bg-slate-850 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Updated</span>
                  <span className="text-xl font-bold text-[#D97745]">{commitResult.updatedCount}</span>
                </div>
                <div className="bg-slate-850 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Skipped</span>
                  <span className="text-xl font-bold text-amber-400">{commitResult.skippedCount}</span>
                </div>
                <div className="bg-slate-850 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Unmatched / Invalid</span>
                  <span className="text-xl font-bold text-slate-400">
                    {commitResult.unmatchedCount + commitResult.invalidCount}
                  </span>
                </div>
              </div>

              {commitResult.errors.length > 0 && (
                <div className="max-w-xl mx-auto p-3 rounded-xl bg-amber-950/30 border border-amber-800/60 text-left text-xs text-amber-300">
                  <span className="font-bold block mb-1">Warnings / Row Notes:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {commitResult.errors.map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetState}
                  className="btn-interactive px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition cursor-pointer"
                >
                  Import Another File
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-interactive px-5 py-2 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white shadow-sm transition cursor-pointer"
                >
                  Done & Return to Workspace
                </button>
              </div>
            </div>
          ) : !parseResult ? (
            /* UPLOAD & DRAG/DROP STAGE */
            <div className="space-y-5">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) processFile(droppedFile);
                }}
                className="border-2 border-dashed border-slate-700 hover:border-[#D97745]/80 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition bg-slate-900/60 hover:bg-slate-850/60 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-[#D97745]/10 border border-[#D97745]/20 text-[#D97745] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-white">
                  {isParsing ? 'Analyzing spreadsheet and validating rows...' : 'Click to select or drag and drop your spreadsheet here'}
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Supports <strong>.xlsx</strong>, <strong>.xls</strong>, and <strong>.csv</strong> with historical date fidelity & 500+ rows support
                </p>
                <span className="mt-4 px-3 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  Target: {meta.title}
                </span>
              </div>

              {/* Instructions Card */}
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Enterprise Bulk Operations Guarantees:
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] pl-1">
                  <li>
                    <strong>Stable Student Resolution:</strong> Matches learners by Roll Number + Class or Admission Number without relying on exact spelling.
                  </li>
                  <li>
                    <strong>Historical Date Integrity:</strong> Parses historical dates (e.g., 2 March 2026, 2026-03-02, serials) faithfully without overriding to current date.
                  </li>
                  <li>
                    <strong>Zero-Refresh Reactivity:</strong> Local IndexedDB and Supabase outbox update instantly, refreshing mounted views without full page reload.
                  </li>
                  <li>
                    <strong>Never Creates Placeholder Learners:</strong> Unmatched rows are flagged with validation notes and skipped safely.
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            /* PREVIEW & ROW SELECTION STAGE */
            <div className="space-y-4">
              {/* File & Sheet Info Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-850 p-3.5 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-white truncate max-w-xs">{parseResult.fileName}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400">{parseResult.totalRows} record(s)</span>
                  {parseResult.isMatrix && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#D97745]/15 text-[#E48B5D] border border-[#D97745]/30">
                      Monthly Grid ({parseResult.matrixDateColumnCount} date columns)
                    </span>
                  )}
                </div>

                {parseResult.allSheets.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">Sheet:</span>
                    <select
                      value={selectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      {parseResult.allSheets.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={resetState}
                  className="text-slate-400 hover:text-slate-200 text-xs underline cursor-pointer"
                >
                  Choose Different File
                </button>
              </div>

              {/* Calendar Consistency Conflict Alert Banner */}
              {parseResult.calendarConflict?.hasConflict && (
                <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs shadow-md space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold text-rose-300">Calendar Consistency Conflict Detected</div>
                      <div className="text-[11px] leading-relaxed text-rose-200">
                        {parseResult.calendarConflict.message}
                      </div>
                      <div className="text-[10px] text-rose-400 font-medium">
                        Import is blocked to prevent recording attendance on mismatched dates. Correct the workbook or explicitly resolve the date context below.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-rose-900/60 flex-wrap">
                    <span className="text-[11px] text-slate-300 font-medium">Explicitly Resolve Date Context:</span>
                    <input
                      type="month"
                      value={explicitTargetMonth}
                      onChange={(e) => {
                        const val = e.target.value;
                        setExplicitTargetMonth(val);
                        if (file) {
                          processFile(file, selectedSheet, autoEnrollMissing, duplicateStrategy, allowHistoricalBackfill, val);
                        }
                      }}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                    {explicitTargetMonth && (
                      <button
                        type="button"
                        onClick={() => {
                          setExplicitTargetMonth('');
                          if (file) {
                            processFile(file, selectedSheet, autoEnrollMissing, duplicateStrategy, allowHistoricalBackfill, '');
                          }
                        }}
                        className="text-[10px] text-rose-400 hover:text-rose-200 underline cursor-pointer"
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Status Tabs Bar: All, Valid, Invalid, Duplicates */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      filterTab === 'all'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200 bg-slate-850'
                    }`}
                  >
                    All Rows ({parseResult.validRows.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterTab('valid')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                      filterTab === 'valid'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-emerald-400 hover:bg-emerald-950/60 bg-emerald-950/30'
                    }`}
                  >
                    <span>Valid Rows</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-900/80 font-bold">
                      {parseResult.validCount}
                    </span>
                  </button>

                  {parseResult.duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab('duplicate')}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                        filterTab === 'duplicate'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-amber-400 hover:bg-amber-950/60 bg-amber-950/30'
                      }`}
                    >
                      <span>Duplicates</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-900/80 font-bold">
                        {parseResult.duplicateCount}
                      </span>
                    </button>
                  )}

                  {(parseResult.invalidCount > 0 || parseResult.unmatchedCount > 0) && (
                    <button
                      type="button"
                      onClick={() => setFilterTab('invalid')}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                        filterTab === 'invalid'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-rose-400 hover:bg-rose-950/60 bg-rose-950/30'
                      }`}
                    >
                      <span>Invalid / Unmatched</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-900/80 font-bold">
                        {parseResult.invalidCount + parseResult.unmatchedCount}
                      </span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Auto-enroll Missing Students Toggle */}
                  {(moduleType === 'attendance' || moduleType === 'practical_progress' || moduleType === 'absentee_followups') && (
                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-850 hover:bg-slate-800 border border-slate-700 px-3 py-1 rounded-xl text-[11px] text-emerald-300 transition" title="Automatically create new student records if not found in active roster">
                      <input
                        type="checkbox"
                        checked={autoEnrollMissing}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setAutoEnrollMissing(val);
                          if (file) processFile(file, selectedSheet, val, duplicateStrategy, allowHistoricalBackfill);
                        }}
                        className="rounded text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                      <span>Auto-Enroll New Students</span>
                    </label>
                  )}

                  {/* Historical Attendance Backfill Toggle */}
                  {moduleType === 'attendance' && (
                    <label
                      className={`flex items-center gap-1.5 cursor-pointer border px-3 py-1 rounded-xl text-[11px] transition ${
                        allowHistoricalBackfill
                          ? 'bg-amber-950/80 hover:bg-amber-900/80 border-amber-700 text-amber-300 shadow-sm'
                          : 'bg-slate-850 hover:bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                      title="Include inactive, withdrawn, and transferred students for historical backfill without altering their lifecycle status"
                    >
                      <input
                        type="checkbox"
                        checked={allowHistoricalBackfill}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setAllowHistoricalBackfill(val);
                          if (file) processFile(file, selectedSheet, autoEnrollMissing, duplicateStrategy, val);
                        }}
                        className="rounded text-amber-500 focus:ring-0 cursor-pointer"
                      />
                      <span>Historical Backfill (All Lifecycles)</span>
                    </label>
                  )}

                  {/* Duplicate Strategy Option */}
                  {parseResult.duplicateCount > 0 && (
                    <div className="flex items-center gap-2 bg-slate-850 border border-slate-700 px-3 py-1 rounded-xl text-[11px]">
                      <span className="text-slate-400 font-semibold">On Duplicate:</span>
                      <label className="flex items-center gap-1 cursor-pointer text-[#E48B5D]">
                        <input
                          type="radio"
                          name="dupStrategy"
                          value="update"
                          checked={duplicateStrategy === 'update'}
                          onChange={() => {
                            setDuplicateStrategy('update');
                            if (file) processFile(file, selectedSheet, autoEnrollMissing, 'update', allowHistoricalBackfill);
                          }}
                          className="accent-[#D97745] cursor-pointer"
                        />
                        <span>Update</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer text-amber-300">
                        <input
                          type="radio"
                          name="dupStrategy"
                          value="skip"
                          checked={duplicateStrategy === 'skip'}
                          onChange={() => {
                            setDuplicateStrategy('skip');
                            if (file) processFile(file, selectedSheet, autoEnrollMissing, 'skip', allowHistoricalBackfill);
                          }}
                          className="text-amber-500 focus:ring-0 cursor-pointer"
                        />
                        <span>Skip</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Toolbar */}
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>
                  Selected for import: <strong className="text-white">{selectedRowIndices.size}</strong> of {parseResult.validRows.length} rows
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(true)}
                    className="text-[#D97745] hover:underline cursor-pointer"
                  >
                    Select All Valid ({parseResult.validCount})
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(false)}
                    className="hover:text-white underline cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Table Data Preview with Validation Notes */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70">
                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-slate-800 z-10">
                      <tr>
                        <th className="px-3 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={
                              parseResult.validRows.length > 0 &&
                              selectedRowIndices.size === parseResult.validRows.filter((r) => r.isValid).length
                            }
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 accent-[#D97745]"
                          />
                        </th>
                        <th className="px-3 py-2 w-12 font-mono">Row #</th>
                        <th className="px-3 py-2 whitespace-nowrap">Date / Recorded</th>
                        <th className="px-3 py-2">Class</th>
                        <th className="px-3 py-2">
                          {moduleType === 'teaching_logs' ? 'Subject / Topic' : 'Student / Roll #'}
                        </th>
                        <th className="px-3 py-2">Details</th>
                        <th className="px-3 py-2">Validation Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            No rows matching the "{filterTab}" tab filter.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((r) => {
                          const isSelected = selectedRowIndices.has(r.rowIndex);
                          return (
                            <tr
                              key={r.rowIndex}
                              className={`transition ${
                                !r.isValid
                                  ? 'bg-rose-950/20'
                                  : r.isDuplicate
                                  ? 'bg-amber-950/15'
                                  : isSelected
                                  ? 'bg-slate-850/40 hover:bg-slate-850/60'
                                  : 'opacity-60 hover:opacity-100'
                              }`}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!r.isValid}
                                  onChange={() => toggleRowSelection(r.rowIndex)}
                                  className="rounded border-slate-700 bg-slate-900 accent-[#D97745] disabled:opacity-30 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-400">{r.rowIndex}</td>
                              <td className="px-3 py-2 font-mono text-white whitespace-nowrap">
                                {r.resolvedDate || '—'}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#D97745]/15 text-[#E48B5D] border border-[#D97745]/30">
                                  {r.entity?.class || '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {moduleType === 'teaching_logs' ? (
                                  <span className="font-semibold text-white">
                                    {r.entity?.subjectTopic || r.entity?.topic || '—'}
                                  </span>
                                ) : r.matchedStudent ? (
                                  <div>
                                    <span className="font-semibold text-white">{r.matchedStudent.name}</span>
                                    <span className="text-[10px] text-slate-400 block font-mono">
                                      Roll: {r.matchedStudent.rollNo} • Adm: {r.matchedStudent.admissionNo}
                                    </span>
                                  </div>
                                ) : moduleType === 'students' ? (
                                  <div>
                                    <span className="font-semibold text-white">{r.entity?.name || '—'}</span>
                                    <span className="text-[10px] text-slate-400 block font-mono">
                                      Roll: {r.entity?.rollNo} • Adm: {r.entity?.admissionNo}
                                    </span>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="text-rose-400 font-semibold text-[11px] block">
                                      {r.data['Student Name'] ||
                                        r.data['student_name'] ||
                                        r.data['Name'] ||
                                        r.data.name ||
                                        'Unmatched Student'}{' '}
                                      <span className="text-[10px] text-rose-300 font-normal">(Not Enrolled)</span>
                                    </span>
                                    {(r.data['Roll Number*'] ||
                                      r.data['Roll Number'] ||
                                      r.data['Roll No'] ||
                                      r.data['roll_no'] ||
                                      r.data.rollnum ||
                                      r.data.rollno ||
                                      r.data['Admission No'] ||
                                      r.data['admission_no']) && (
                                      <span className="text-[10px] text-slate-400 block font-mono">
                                        Roll:{' '}
                                        {r.data['Roll Number*'] ||
                                          r.data['Roll Number'] ||
                                          r.data['Roll No'] ||
                                          r.data['roll_no'] ||
                                          r.data.rollnum ||
                                          r.data.rollno ||
                                          '—'}{' '}
                                        • Adm:{' '}
                                        {r.data['Admission No'] ||
                                          r.data['Admission Number'] ||
                                          r.data['admission_no'] ||
                                          '—'}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {moduleType === 'attendance' ? (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      r.entity?.status === 'Present'
                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                        : r.entity?.status === 'Absent'
                                        ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                                    }`}
                                  >
                                    {r.entity?.status || 'Present'}
                                  </span>
                                ) : moduleType === 'teaching_logs' ? (
                                  <span className="text-slate-300 font-mono text-[11px]">
                                    Pres: {r.entity?.studentsPresent || 0} • Done: {r.entity?.studentsCompletingTask || 0}
                                  </span>
                                ) : moduleType === 'practical_progress' ? (
                                  <span className="text-slate-300 text-[11px]">
                                    {r.entity?.skillTask || r.entity?.taskName} •{' '}
                                    <strong className="text-emerald-400 font-mono">
                                      {r.entity?.scoreMarks !== undefined
                                        ? `${r.entity.scoreMarks}/100`
                                        : r.entity?.score !== undefined
                                        ? `${r.entity.score}/100`
                                        : 'Pass'}
                                    </strong>
                                  </span>
                                ) : moduleType === 'students' ? (
                                  <span className="text-slate-300 text-[11px]">
                                    Sec {r.entity?.section || 'A'} • {r.entity?.status}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-[11px]">
                                    {r.entity?.followupReason || r.entity?.reason} •{' '}
                                    <strong className="text-amber-400">
                                      {r.entity?.currentStatus || r.entity?.status}
                                    </strong>
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`text-[11px] font-medium block ${
                                    !r.isValid
                                      ? 'text-rose-400'
                                      : r.isDuplicate
                                      ? 'text-amber-400'
                                      : 'text-emerald-400'
                                  }`}
                                >
                                  {r.validationNotes}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {parseResult && !commitResult && (() => {
          const selectedValidRows = (parseResult?.validRows || []).filter((r) => selectedRowIndices.has(r.rowIndex));
          const selectedDuplicatesCount = selectedValidRows.filter((r) => r.isDuplicate).length;
          const willSaveCount =
            duplicateStrategy === 'skip'
              ? selectedValidRows.length - selectedDuplicatesCount
              : selectedValidRows.length;
          const allSelectedAreDuplicates =
            selectedValidRows.length > 0 &&
            willSaveCount === 0 &&
            selectedDuplicatesCount > 0 &&
            duplicateStrategy === 'skip';

          return (
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-850 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={resetState}
                className="btn-interactive px-4 py-2 rounded-xl text-xs font-semibold bg-[#2B352E] hover:bg-[#344038] text-slate-300 border border-[#9BAE9C]/30 transition cursor-pointer"
              >
                Reset
              </button>

              <div className="flex items-center gap-3">
                {allSelectedAreDuplicates && (
                  <span className="text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    All selected rows are duplicates. Select "Update" to overwrite.
                  </span>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-interactive px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={
                    isCommitting ||
                    selectedRowIndices.size === 0 ||
                    permissions.isReadOnly ||
                    allSelectedAreDuplicates ||
                    Boolean(parseResult.calendarConflict?.hasConflict)
                  }
                  className="btn-interactive flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#D97745] hover:bg-[#c26535] disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm shadow-[#D97745]/20 cursor-pointer"
                >
                  {isCommitting ? (
                    <span>Saving to IndexedDB & Outbox...</span>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>
                        {allSelectedAreDuplicates
                          ? `0 to Import (${selectedDuplicatesCount} Duplicates Skipped)`
                          : duplicateStrategy === 'update'
                          ? `Update ${selectedValidRows.length} Record${selectedValidRows.length === 1 ? '' : 's'}${
                              selectedDuplicatesCount > 0 ? ` (${selectedDuplicatesCount} existing)` : ''
                            }`
                          : `Import ${willSaveCount} Record${willSaveCount === 1 ? '' : 's'}${
                              selectedDuplicatesCount > 0 ? ` (${selectedDuplicatesCount} skipped)` : ''
                            }`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
