import React, { useState, useRef, useEffect } from 'react';
import { ClassLevel, Section, StudentImportRow } from '../../types/student';
import {
  parseExcelOrCsvFile,
  commitApprovedImportRows,
  downloadSampleExcelTemplate,
  getExcelSheetDetails,
  inspectExcelFile,
  getDiagnosticLogs,
  CANONICAL_STUDENT_FIELDS,
  ColumnMappingInfo,
  CommitImportResult,
  DiagnosticLog,
} from '../../services/excelService';
import { getAllStudents } from '../../services/db';
import { deleteAllStudentsData } from '../../services/recordService';
import { useAuth } from '../../context/AuthContext';
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
  RefreshCw,
  PlusCircle,
  Trash2,
  ArrowRight,
  SlidersHorizontal,
  Cloud,
  Database,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export type ImportStrategy = 'update' | 'replace' | 'skip';
type FilterTab = 'all' | 'valid' | 'invalid' | 'new' | 'update' | 'duplicate';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importStrategy, setImportStrategy] = useState<ImportStrategy>('update');
  const [defaultClass, setDefaultClass] = useState<ClassLevel>('Class 7');
  const [file, setFile] = useState<File | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [detectedMasterSheets, setDetectedMasterSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [detectedHeaderRow, setDetectedHeaderRow] = useState<number>(0);
  const [columnMappingInfo, setColumnMappingInfo] = useState<ColumnMappingInfo | null>(null);
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({});
  const [isMappingOpen, setIsMappingOpen] = useState(false);

  const [rows, setRows] = useState<StudentImportRow[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [existingDbCount, setExistingDbCount] = useState<number>(0);
  const [isClearingExisting, setIsClearingExisting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLog[]>([]);

  const [commitResult, setCommitResult] = useState<CommitImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load existing student count whenever modal opens
  const refreshDbCount = async () => {
    try {
      const all = await getAllStudents();
      setExistingDbCount(all.length);
    } catch (err) {
      console.error('Failed to get student count:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshDbCount();
    }
  }, [isOpen]);

  const processFileWithStrategy = async (
    selectedFile: File,
    strategy: ImportStrategy,
    defClass: ClassLevel = defaultClass,
    sheet?: string,
    overrideMapping?: Record<string, string>,
    headerRow?: number
  ) => {
    setIsParsing(true);
    setErrorMessage(null);
    setCommitResult(null);

    try {
      // 1. Inspect sheet & detected headers
      const inspection = await inspectExcelFile(selectedFile, sheet);
      setAvailableSheets(inspection.allSheets);
      setDetectedMasterSheets(inspection.masterSheets);
      setDetectedHeaderRow(inspection.detectedHeaderRow);

      const activeSheet =
        sheet ||
        (inspection.masterSheets.length > 1
          ? '__ALL__'
          : inspection.masterSheets.length === 1
          ? inspection.masterSheets[0]
          : inspection.allSheets[0] || undefined);

      if (activeSheet) setSelectedSheet(activeSheet);

      const activeMap = overrideMapping || inspection.columnMappingInfo.mapping;
      setColumnMappingInfo(inspection.columnMappingInfo);
      setCustomMapping(activeMap);

      // If headers cannot be confidently mapped automatically, open column mapping
      if (!inspection.columnMappingInfo.isConfident && !overrideMapping) {
        setIsMappingOpen(true);
      }

      // 2. Parse spreadsheet rows
      const parsed = await parseExcelOrCsvFile(selectedFile, {
        updateExisting: strategy !== 'skip',
        replaceAll: strategy === 'replace',
        defaultClass: defClass,
        sheetName: activeSheet,
        headerRowIndex: headerRow !== undefined ? headerRow : inspection.detectedHeaderRow,
        customColumnMapping: activeMap,
      });

      if (parsed.length === 0) {
        setErrorMessage('The uploaded spreadsheet contains no student data rows.');
      }
      setRows(parsed);
      setDiagnosticLogs(getDiagnosticLogs());
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Failed to read spreadsheet. Ensure file is valid Excel (.xlsx) or CSV.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    await processFileWithStrategy(selectedFile, importStrategy, defaultClass);
  };

  const handleStrategyChange = async (newStrategy: ImportStrategy) => {
    setImportStrategy(newStrategy);
    if (file) {
      await processFileWithStrategy(file, newStrategy, defaultClass, selectedSheet, customMapping, detectedHeaderRow);
    }
  };

  const handleDefaultClassChange = async (newClass: ClassLevel) => {
    setDefaultClass(newClass);
    if (file) {
      await processFileWithStrategy(file, importStrategy, newClass, selectedSheet, customMapping, detectedHeaderRow);
    }
  };

  const handleSheetChange = async (newSheet: string) => {
    setSelectedSheet(newSheet);
    if (file) {
      await processFileWithStrategy(file, importStrategy, defaultClass, newSheet, customMapping);
    }
  };

  const handleMappingFieldChange = (originalHeader: string, newCanonicalKey: string) => {
    setCustomMapping((prev) => ({
      ...prev,
      [originalHeader]: newCanonicalKey,
    }));
  };

  const handleApplyCustomMapping = async () => {
    setIsMappingOpen(false);
    if (file) {
      await processFileWithStrategy(file, importStrategy, defaultClass, selectedSheet, customMapping, detectedHeaderRow);
    }
  };

  const handleToggleRow = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleSelectAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: true })));
  };

  const handleSelectAllValid = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.validationErrors.length === 0,
      }))
    );
  };

  const handleDeselectAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  const handleRowClassChange = (index: number, newClass: ClassLevel) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const updatedErrors = r.validationErrors.filter((e) => !e.toLowerCase().includes('class'));
        return {
          ...r,
          class: newClass,
          validationErrors: updatedErrors,
          selected: updatedErrors.length === 0,
        };
      })
    );
  };

  const handleToggleRowActionType = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const newAction = r.actionType === 'update' ? 'create' : 'update';
        return {
          ...r,
          actionType: newAction,
          selected: true,
        };
      })
    );
  };

  const handleClearExisting = async () => {
    setIsClearingExisting(true);
    try {
      const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
      await deleteAllStudentsData(userEmail);
      await refreshDbCount();
      setShowClearConfirm(false);
      if (file) {
        await processFileWithStrategy(file, importStrategy, defaultClass, selectedSheet, customMapping, detectedHeaderRow);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to clear existing students.');
    } finally {
      setIsClearingExisting(false);
    }
  };

  const handleCommit = async () => {
    const userEmail = session?.user.email || 'operator@gbhs.edu.pk';
    setIsCommitting(true);
    try {
      const res = await commitApprovedImportRows(rows, userEmail, {
        updateExisting: importStrategy !== 'skip',
        replaceAll: importStrategy === 'replace',
      });
      setCommitResult(res);
      setDiagnosticLogs(res.diagnostics);
      await refreshDbCount();

      // Zero-Refresh Reactivity
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('gbhs_records_imported', {
            detail: { moduleType: 'students', count: res.committedCount },
          })
        );
        window.dispatchEvent(new CustomEvent('gbhs_students_changed'));
        window.dispatchEvent(new CustomEvent('gbhs_dashboard_refresh'));
      }

      onImportComplete();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to commit import records.');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setRows([]);
    setCommitResult(null);
    setErrorMessage(null);
    setAvailableSheets([]);
    setSelectedSheet('');
    setColumnMappingInfo(null);
    setCustomMapping({});
    setIsMappingOpen(false);
    setDiagnosticLogs([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  const totalCount = rows.length;
  const updateCount = rows.filter((r) => r.actionType === 'update' && r.validationErrors.length === 0).length;
  const createCount = rows.filter((r) => r.actionType === 'create' && r.validationErrors.length === 0).length;
  const duplicateCount = rows.filter((r) => r.isDuplicate && r.actionType !== 'update').length;
  const errorCount = rows.filter((r) => r.validationErrors.length > 0).length;
  const selectedCount = rows.filter((r) => r.selected).length;

  // Filtered rows for the preview table across All, Valid, and Invalid tabs
  const displayedRows = rows.filter((r) => {
    if (filterTab === 'valid') return r.validationErrors.length === 0;
    if (filterTab === 'new') return r.actionType === 'create' && r.validationErrors.length === 0;
    if (filterTab === 'update') return r.actionType === 'update' && r.validationErrors.length === 0;
    if (filterTab === 'duplicate') return r.isDuplicate || r.isAmbiguousMatch;
    if (filterTab === 'invalid') return r.validationErrors.length > 0;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Import Students from Excel / CSV</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  GBHS Dynamic Importer
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Dynamically reads student records from any compatible workbook, safely merging classes without data loss.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={downloadSampleExcelTemplate}
              className="btn-interactive flex items-center gap-1.5 text-xs text-[#9BAE9C] hover:text-white font-semibold px-2.5 py-1.5 rounded-lg bg-[#2B352E] hover:bg-[#344038] border border-[#9BAE9C]/30 transition cursor-pointer"
              title="Download official Excel template for Class 7, 8, 9"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Template</span>
            </button>
            <button
              onClick={onClose}
              className="btn-interactive text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Strategy Selector & Database Status */}
        <div className="px-6 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 mr-1">Merge Strategy:</span>
            <button
              type="button"
              onClick={() => handleStrategyChange('update')}
              className={`btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                importStrategy === 'update'
                  ? 'bg-[#D97745] text-white shadow-sm border border-[#D97745]/80'
                  : 'bg-slate-850 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Safe Merge & Auto-Update (Recommended)</span>
            </button>

            <button
              type="button"
              onClick={() => handleStrategyChange('skip')}
              className={`btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                importStrategy === 'skip'
                  ? 'bg-[#2B352E] text-white shadow-sm border border-[#9BAE9C]/50'
                  : 'bg-slate-850 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Append Only (Skip Existing)</span>
            </button>

            <button
              type="button"
              onClick={() => handleStrategyChange('replace')}
              className={`btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                importStrategy === 'replace'
                  ? 'bg-amber-600 text-white shadow-sm border border-amber-500'
                  : 'bg-slate-850 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Replace Imported Class(es) Only</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {existingDbCount > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-slate-400">
                  Existing in DB: <strong className="text-white">{existingDbCount}</strong> students
                </span>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  title="Delete all current students before importing"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear DB</span>
                </button>
              </div>
            ) : (
              <span className="text-emerald-400 font-medium">Database ready for import</span>
            )}
          </div>
        </div>

        {/* Clear Database Confirmation Banner */}
        {showClearConfirm && (
          <div className="px-6 py-3 bg-rose-950/60 border-b border-rose-800/80 flex items-center justify-between text-xs text-rose-200 shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Delete all <strong>{existingDbCount} existing students</strong> from IndexedDB before importing?
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearExisting}
                disabled={isClearingExisting}
                className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1 cursor-pointer"
              >
                {isClearingExisting ? 'Clearing...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        )}

        {/* File Details & Column Mapping Control Bar */}
        {file && (
          <div className="px-6 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-slate-400 font-medium">
                File: <strong className="text-sky-300">{file.name}</strong>
              </span>

              {availableSheets.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Sheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs font-semibold cursor-pointer max-w-xs"
                  >
                    <option value="__ALL__">
                      {detectedMasterSheets.length > 1
                        ? `📚 All Student Sheets (${detectedMasterSheets.join(' & ')})`
                        : `📚 All Sheets (${availableSheets.length} sheets)`}
                    </option>
                    {availableSheets.map((s) => (
                      <option key={s} value={s}>
                        {detectedMasterSheets.includes(s) ? `⭐ ${s} (Roster)` : s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Default Class:</span>
                <select
                  value={defaultClass}
                  onChange={(e) => handleDefaultClassChange(e.target.value as ClassLevel)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-semibold"
                  title="If student class is not mentioned in sheet, this class will be applied"
                >
                  <option value="Class 7">Class 7</option>
                  <option value="Class 8">Class 8</option>
                  <option value="Class 9">Class 9</option>
                </select>
              </div>

              {/* Column Mapping Toggle Button */}
              <button
                type="button"
                onClick={() => setIsMappingOpen(!isMappingOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition ${
                  isMappingOpen
                    ? 'bg-sky-600 text-white border-sky-500'
                    : columnMappingInfo && !columnMappingInfo.isConfident
                    ? 'bg-amber-950/80 text-amber-300 border-amber-700 animate-pulse'
                    : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>
                  {columnMappingInfo && !columnMappingInfo.isConfident
                    ? 'Map Columns Required'
                    : 'Review Column Mappings'}
                </span>
              </button>
            </div>

            <button
              onClick={handleReset}
              className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Choose Different File
            </button>
          </div>
        )}

        {/* Interactive Column Mapping Panel */}
        {isMappingOpen && columnMappingInfo && (
          <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                  <span>Spreadsheet Column Mapping</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Match each column from your workbook to the corresponding student record field.
                </p>
              </div>
              <button
                type="button"
                onClick={handleApplyCustomMapping}
                className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shadow-sm cursor-pointer"
              >
                Apply & Re-Parse Rows
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
              {columnMappingInfo.headers.map((hdr) => {
                const currentMappedKey = customMapping[hdr] || '';
                return (
                  <div
                    key={hdr}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-1 text-xs"
                  >
                    <span className="font-mono text-slate-300 truncate font-semibold" title={hdr}>
                      {hdr}
                    </span>
                    <select
                      value={currentMappedKey}
                      onChange={(e) => handleMappingFieldChange(hdr, e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-medium cursor-pointer"
                    >
                      <option value="">— Skip / Ignore Column —</option>
                      {CANONICAL_STUDENT_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} {f.required ? '(Required)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/70 text-xs text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Separate Local-Save and Cloud-Sync Report Banner */}
          {commitResult && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-xs text-emerald-300 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm text-white">Import Committed Successfully</h4>
                    <p className="text-slate-300 mt-1">
                      {commitResult.createdCount > 0 && (
                        <span className="font-semibold text-emerald-400 mr-2">
                          • {commitResult.createdCount} new student(s) added
                        </span>
                      )}
                      {commitResult.updatedCount > 0 && (
                        <span className="font-semibold text-sky-400 mr-2">
                          • {commitResult.updatedCount} existing student(s) updated
                        </span>
                      )}
                      {commitResult.skippedCount > 0 && (
                        <span className="text-slate-400 mr-2">
                          • {commitResult.skippedCount} rows skipped
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={onClose}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <span>View Student Roster</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleReset}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Upload Another File
                  </button>
                </div>
              </div>

              {/* Separate Local vs Cloud Report */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-emerald-900/60 text-xs">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-400 block">Local Storage (IndexedDB):</span>
                    <span className="font-semibold text-white">
                      {commitResult.committedCount} records saved locally (Offline Ready)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-400 block">Cloud Synchronization (Supabase):</span>
                    <span className="font-semibold text-sky-300">
                      Status: {commitResult.cloudSync.overallStatus} (Synced: {commitResult.cloudSync.syncedCount}, Pending: {commitResult.cloudSync.pendingCount})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Upload Area when no file */}
          {rows.length === 0 && !commitResult && (
            <div className="border-2 border-dashed border-slate-700 hover:border-sky-500/80 rounded-2xl p-10 text-center transition bg-slate-850/40">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
                id="excel-file-upload"
              />
              <label htmlFor="excel-file-upload" className="cursor-pointer block">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-400 mx-auto flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-white">
                  {isParsing ? 'Detecting headers and analyzing student rows...' : 'Choose or drop your Excel / CSV file'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Supports dynamic headers, any column order, and varying student counts. Merges seamlessly into your database without erasing existing classes.
                </p>
                <div className="mt-4 inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
                  <span>Browse Spreadsheet</span>
                </div>
              </label>
            </div>
          )}

          {/* Preview Table & Analytics */}
          {rows.length > 0 && !commitResult && (
            <div className="space-y-3">
              {/* Filter Tabs Bar with Exact Counts */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      filterTab === 'all'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Rows ({totalCount})
                  </button>

                  <button
                    onClick={() => setFilterTab('valid')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      filterTab === 'valid'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    <span>Valid</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-bold">
                      {createCount + updateCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setFilterTab('new')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      filterTab === 'new'
                        ? 'bg-emerald-600 text-white'
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    <span>New Students</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 text-[10px]">
                      {createCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setFilterTab('update')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      filterTab === 'update'
                        ? 'bg-sky-600 text-white'
                        : 'text-sky-400 hover:text-sky-300'
                    }`}
                  >
                    <span>Auto-Updates</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-sky-950 text-sky-300 text-[10px]">
                      {updateCount}
                    </span>
                  </button>

                  {duplicateCount > 0 && (
                    <button
                      onClick={() => setFilterTab('duplicate')}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                        filterTab === 'duplicate'
                          ? 'bg-amber-600 text-white'
                          : 'text-amber-400 hover:text-amber-300'
                      }`}
                    >
                      <span>Duplicates / Conflicts</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-300 text-[10px]">
                        {duplicateCount}
                      </span>
                    </button>
                  )}

                  {errorCount > 0 && (
                    <button
                      onClick={() => setFilterTab('invalid')}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                        filterTab === 'invalid'
                          ? 'bg-rose-600 text-white'
                          : 'text-rose-400 hover:text-rose-300'
                      }`}
                    >
                      <span>Invalid / Excluded</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-950 text-rose-300 text-[10px]">
                        {errorCount}
                      </span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectAllValid}
                    className="text-emerald-400 hover:underline cursor-pointer text-[11px]"
                  >
                    Select All Valid ({createCount + updateCount})
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    onClick={handleDeselectAll}
                    className="text-slate-400 hover:underline cursor-pointer text-[11px]"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">Include</th>
                        <th className="px-3 py-2">S#</th>
                        <th className="px-3 py-2">Roll Num</th>
                        <th className="px-3 py-2">Admission No</th>
                        <th className="px-3 py-2">Student Name</th>
                        <th className="px-3 py-2">Father Name</th>
                        <th className="px-3 py-2">Class</th>
                        <th className="px-3 py-2">Section</th>
                        <th className="px-3 py-2">Guardian Contact</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Action / Exclusion Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {displayedRows.map((row) => {
                        const hasErrors = row.validationErrors.length > 0;
                        const originalIndex = rows.findIndex((r) => r.rowNumber === row.rowNumber);

                        return (
                          <tr
                            key={row.rowNumber}
                            className={`hover:bg-slate-850/50 transition ${
                              hasErrors
                                ? 'bg-rose-950/20'
                                : row.actionType === 'update'
                                ? 'bg-sky-950/20'
                                : row.selected
                                ? 'bg-emerald-950/10'
                                : ''
                            }`}
                          >
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => handleToggleRow(originalIndex)}
                                className="rounded border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                              {row.serialNo || row.rowNumber}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-white">
                              {row.rollNo || <span className="text-slate-500 italic">Blank</span>}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-300">
                              {row.admissionNo}
                            </td>
                            <td className="px-3 py-2 font-medium text-white">
                              {row.name || <span className="text-rose-400 italic">Missing</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-400">{row.fatherName || '—'}</td>
                            <td className="px-3 py-2">
                              <select
                                value={row.class}
                                onChange={(e) => handleRowClassChange(originalIndex, e.target.value as ClassLevel)}
                                className="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] rounded px-1.5 py-0.5 cursor-pointer font-medium"
                              >
                                <option value="Class 7">Class 7</option>
                                <option value="Class 8">Class 8</option>
                                <option value="Class 9">Class 9</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 font-mono">{row.section || 'A'}</td>
                            <td className="px-3 py-2 font-mono text-slate-300">
                              {row.guardianContact || '—'}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  row.registeredStatus === 'Registerd'
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/80'
                                    : 'bg-amber-950/60 text-amber-400 border border-amber-800/80'
                                }`}
                              >
                                {row.registeredStatus || 'Registerd'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {hasErrors ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-950/50 border border-rose-800/60 px-2 py-0.5 rounded-full">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{row.validationErrors.join(', ')}</span>
                                </span>
                              ) : row.actionType === 'update' ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 bg-sky-950/60 border border-sky-800/80 px-2 py-0.5 rounded-full"
                                    title={row.duplicateReason}
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>Auto-Update</span>
                                  </span>
                                  {row.isAmbiguousMatch && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleRowActionType(originalIndex)}
                                      className="text-[10px] text-amber-300 underline cursor-pointer"
                                      title="Click to treat this row as a new student instead of updating"
                                    >
                                      Create New Instead
                                    </button>
                                  )}
                                </div>
                              ) : row.isDuplicate ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded-full">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    <span>{row.duplicateReason || 'Duplicate'}</span>
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                                  <Check className="w-3 h-3" />
                                  <span>New Student</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Diagnostic Log Viewer Toggle */}
          {diagnosticLogs.length > 0 && (
            <div className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="w-full px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 font-semibold flex items-center justify-between cursor-pointer transition"
              >
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-sky-400" />
                  <span>Importer Diagnostic Row Counts ({diagnosticLogs.length} events)</span>
                </div>
                {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showDiagnostics && (
                <div className="p-3 space-y-1.5 font-mono text-[11px] max-h-40 overflow-y-auto bg-slate-950">
                  {diagnosticLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-slate-400">
                      <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                      <span className={`font-bold shrink-0 ${
                        log.stage === 'DETECT' ? 'text-[#9BAE9C]' :
                        log.stage === 'PARSE' ? 'text-[#D97745]' :
                        log.stage === 'VALIDATE' ? 'text-emerald-400' :
                        log.stage === 'LOCAL_SAVE' ? 'text-[#F6F3EA]' :
                        log.stage === 'CLOUD_SYNC' ? 'text-[#D97745]' : 'text-amber-400'
                      }`}>
                        [{log.stage}]
                      </span>
                      <span className="text-slate-200">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-850 shrink-0 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {rows.length > 0
              ? `Selected ${selectedCount} of ${totalCount} row(s) to import into GBHS database.`
              : 'Choose any Excel or CSV file to import.'}
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="btn-interactive px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Close
            </button>
            {rows.length > 0 && !commitResult && (
              <button
                onClick={handleCommit}
                disabled={selectedCount === 0 || isCommitting}
                className="btn-interactive flex items-center gap-2 bg-[#D97745] hover:bg-[#c26535] disabled:opacity-40 text-white text-xs font-semibold px-5 py-2 rounded-xl cursor-pointer shadow-sm shadow-[#D97745]/20"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Import...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Commit {selectedCount} Students (Safe Merge)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
