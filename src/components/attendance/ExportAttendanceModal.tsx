import React, { useState } from 'react';
import { ClassLevel, Section } from '../../types/student';
import { exportAttendanceToExcel } from '../../services/excelService';
import {
  X,
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface ExportAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClass: ClassLevel;
  selectedSection: Section | 'All';
  selectedDate: string;
}

export const ExportAttendanceModal: React.FC<ExportAttendanceModalProps> = ({
  isOpen,
  onClose,
  selectedClass,
  selectedSection,
  selectedDate,
}) => {
  if (!isOpen) return null;

  const [dateRangeMode, setDateRangeMode] = useState<'single' | 'term' | 'custom'>('term');
  const [customStartDate, setCustomStartDate] = useState('2026-03-02');
  const [customEndDate, setCustomEndDate] = useState(selectedDate || '2026-10-20');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setNotice(null);
    try {
      let startDate: string | undefined;
      let endDate: string | undefined;
      let singleDate: string | undefined;

      if (dateRangeMode === 'single') {
        singleDate = selectedDate;
      } else if (dateRangeMode === 'term') {
        startDate = '2026-03-02';
        endDate = '2026-10-20';
      } else {
        startDate = customStartDate;
        endDate = customEndDate;
      }

      const res = await exportAttendanceToExcel({
        selectedClass,
        selectedSection,
        date: singleDate,
        startDate,
        endDate,
        format,
      });

      if (res.success) {
        setNotice({
          type: 'success',
          message: `Successfully exported to "${res.filename}".`,
        });
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        setNotice({
          type: 'error',
          message: res.error || 'Failed to export attendance records.',
        });
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'An unexpected error occurred during export.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202822]/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#2B352E] border border-[#3D4A41] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#3D4A41] flex items-center justify-between bg-[#202822]/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D97745]/15 text-[#D97745] flex items-center justify-center border border-[#D97745]/30">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F6F3EA] flex items-center gap-2">
                <span>Export Attendance Sheet</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D97745]/20 text-[#E48B5D] border border-[#D97745]/40 font-mono font-semibold">
                  {selectedClass}
                </span>
              </h3>
              <p className="text-[11px] text-[#9BAE9C]">
                Generate official attendance matrix & daily register sheet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-interactive p-1.5 rounded-lg text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#202822] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Target Scope Summary */}
          <div className="bg-[#202822] border border-[#3D4A41] rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D97745]" />
              <span className="text-[#F6F3EA] font-medium">Target Scope:</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-[#E48B5D] bg-[#D97745]/15 px-2 py-0.5 rounded border border-[#D97745]/30">
                {selectedClass}
              </span>
              <span className="text-[#9BAE9C] bg-[#2B352E] px-2 py-0.5 rounded border border-[#3D4A41]">
                {selectedSection === 'All' ? 'All Sections' : `Sec ${selectedSection}`}
              </span>
            </div>
          </div>

          {/* Date Range Options */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#F6F3EA] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#9BAE9C]" />
              <span>Date Range & Matrix Scope</span>
            </label>

            <div className="space-y-2">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                  dateRangeMode === 'term'
                    ? 'bg-[#D97745]/10 border-[#D97745]/50 text-[#F6F3EA]'
                    : 'bg-[#202822] border-[#3D4A41] text-[#9BAE9C] hover:border-[#9BAE9C]/40'
                }`}
              >
                <input
                  type="radio"
                  name="dateRangeMode"
                  checked={dateRangeMode === 'term'}
                  onChange={() => setDateRangeMode('term')}
                  className="mt-0.5 accent-[#D97745] cursor-pointer"
                />
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <span>Full Academic Term (March 2 – October 20, 2026)</span>
                    <span className="text-[10px] bg-[#D97745]/20 text-[#E48B5D] px-1.5 py-0.2 rounded font-normal border border-[#D97745]/30">
                      Recommended Matrix
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9BAE9C] mt-0.5">
                    Exports complete 200 school days matrix with daily P/A/L/T metrics and percentage summary.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                  dateRangeMode === 'single'
                    ? 'bg-[#D97745]/10 border-[#D97745]/50 text-[#F6F3EA]'
                    : 'bg-[#202822] border-[#3D4A41] text-[#9BAE9C] hover:border-[#9BAE9C]/40'
                }`}
              >
                <input
                  type="radio"
                  name="dateRangeMode"
                  checked={dateRangeMode === 'single'}
                  onChange={() => setDateRangeMode('single')}
                  className="mt-0.5 accent-[#D97745] cursor-pointer"
                />
                <div>
                  <div className="font-semibold text-[#F6F3EA]">Selected Single Day ({selectedDate})</div>
                  <p className="text-[11px] text-[#9BAE9C] mt-0.5">
                    Exports the active daily attendance sheet for this specific date with student names and remarks.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                  dateRangeMode === 'custom'
                    ? 'bg-[#D97745]/10 border-[#D97745]/50 text-[#F6F3EA]'
                    : 'bg-[#202822] border-[#3D4A41] text-[#9BAE9C] hover:border-[#9BAE9C]/40'
                }`}
              >
                <input
                  type="radio"
                  name="dateRangeMode"
                  checked={dateRangeMode === 'custom'}
                  onChange={() => setDateRangeMode('custom')}
                  className="mt-0.5 accent-[#D97745] cursor-pointer"
                />
                <div className="w-full">
                  <div className="font-semibold text-[#F6F3EA]">Custom Date Range</div>
                  <p className="text-[11px] text-[#9BAE9C] mt-0.5 mb-2">
                    Specify custom start and end dates for periodic reports.
                  </p>

                  {dateRangeMode === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#3D4A41]">
                      <div>
                        <span className="text-[10px] text-[#9BAE9C] uppercase font-medium">From Date</span>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-2.5 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745] mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-[#9BAE9C] uppercase font-medium">To Date</span>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full bg-[#202822] border border-[#3D4A41] rounded-lg px-2.5 py-1.5 text-xs text-[#F6F3EA] focus:outline-none focus:border-[#D97745] mt-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Export File Format */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#F6F3EA] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#9BAE9C]" />
              <span>File Format</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`btn-interactive flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium cursor-pointer ${
                  format === 'xlsx'
                    ? 'bg-[#202822] border-[#D97745] text-[#F6F3EA] shadow-xs'
                    : 'bg-[#202822] border-[#3D4A41] text-[#9BAE9C] hover:border-[#9BAE9C]/40'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-[#D97745]" />
                <div className="text-left">
                  <div className="font-semibold text-[#F6F3EA]">Excel (.xlsx)</div>
                  <div className="text-[10px] text-[#9BAE9C]">Matrix + Register</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`btn-interactive flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium cursor-pointer ${
                  format === 'csv'
                    ? 'bg-[#202822] border-[#D97745] text-[#F6F3EA] shadow-xs'
                    : 'bg-[#202822] border-[#3D4A41] text-[#9BAE9C] hover:border-[#9BAE9C]/40'
                }`}
              >
                <FileText className="w-4 h-4 text-[#9BAE9C]" />
                <div className="text-left">
                  <div className="font-semibold text-[#F6F3EA]">CSV (.csv)</div>
                  <div className="text-[10px] text-[#9BAE9C]">Plain Matrix</div>
                </div>
              </button>
            </div>
          </div>

          {notice && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                notice.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-800 text-rose-300'
              }`}
            >
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{notice.message}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#3D4A41] flex items-center justify-end gap-2.5 bg-[#202822]/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="btn-interactive px-3.5 py-2 rounded-xl text-xs font-semibold text-[#9BAE9C] hover:text-[#F6F3EA] bg-[#202822] hover:bg-[#344038] border border-[#3D4A41] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="btn-interactive flex items-center gap-2 bg-[#D97745] hover:bg-[#C56837] active:bg-[#B35B2B] text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Export Attendance Sheet</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
