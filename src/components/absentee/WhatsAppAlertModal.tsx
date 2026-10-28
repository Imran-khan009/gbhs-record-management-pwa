import React, { useState } from 'react';
import {
  X,
  Send,
  MessageCircle,
  Copy,
  Check,
  Phone,
  Calendar,
  AlertTriangle,
  User,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import {
  cleanPhoneNumberForWhatsApp,
  getWhatsAppUrl,
  getSmsUrl,
  generateAbsenteeWhatsAppMessage,
} from '../../services/alertService';

interface WhatsAppAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  rollNo: string;
  classLevel: string;
  guardianPhone?: string;
  date?: string;
  absenceCount?: number;
  reason?: string;
}

export const WhatsAppAlertModal: React.FC<WhatsAppAlertModalProps> = ({
  isOpen,
  onClose,
  studentName,
  rollNo,
  classLevel,
  guardianPhone = '',
  date = new Date().toISOString().split('T')[0],
  absenceCount = 1,
  reason = 'Absence reported without prior leave',
}) => {
  const [phone, setPhone] = useState(guardianPhone);
  const [message, setMessage] = useState(() =>
    generateAbsenteeWhatsAppMessage(studentName, rollNo, classLevel, date, absenceCount, reason)
  );
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sync state if props change
  React.useEffect(() => {
    setPhone(guardianPhone);
    setMessage(generateAbsenteeWhatsAppMessage(studentName, rollNo, classLevel, date, absenceCount, reason));
    setCopied(false);
    setStatusMessage(null);
  }, [studentName, rollNo, classLevel, guardianPhone, date, absenceCount, reason, isOpen]);

  if (!isOpen) return null;

  const cleanedPhone = cleanPhoneNumberForWhatsApp(phone);
  const hasValidPhone = cleanedPhone.length >= 10;

  const handleSendWhatsApp = () => {
    const url = getWhatsAppUrl(phone, message);
    window.open(url, '_blank');
    setStatusMessage('WhatsApp web/app launched in a new tab.');
  };

  const handleSendSms = () => {
    const url = getSmsUrl(phone, message);
    window.open(url, '_self');
    setStatusMessage('Default SMS app opened.');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setStatusMessage('Message copied to clipboard.');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>WhatsApp Quick Alert</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                  Guardian Notice
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Send instant absence notification to student's parent/guardian.
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

        <div className="p-5 sm:p-6 space-y-4 text-xs">
          {/* Student Info Card */}
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-750 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="truncate">
                <p className="font-bold text-white text-sm truncate">{studentName}</p>
                <p className="text-slate-400 text-[11px]">
                  Roll #{rollNo} • <span className="text-sky-400 font-semibold">{classLevel}</span>
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 font-semibold text-[10px]">
                {absenceCount} {absenceCount === 1 ? 'Day Absent' : 'Days Absent'}
              </span>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{date}</p>
            </div>
          </div>

          {/* Phone Number Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Guardian Mobile / WhatsApp Number</span>
              </span>
              {hasValidPhone ? (
                <span className="text-[10px] text-emerald-400 font-mono">Format: +{cleanedPhone}</span>
              ) : (
                <span className="text-[10px] text-amber-400">Please verify 11-digit number</span>
              )}
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 03001234567 or +923001234567"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Message Preview Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>Pre-Formatted Message (Editable)</span>
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>
            <textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-emerald-500"
            />
          </div>

          {statusMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleSendSms}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5 text-sky-400" />
              <span>Send via Regular SMS</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-semibold text-xs px-5 py-2 rounded-xl transition cursor-pointer shadow-md shadow-emerald-950/50"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Send WhatsApp Alert</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
