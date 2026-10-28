import React, { useState, useEffect, useRef } from 'react';
import {
  getSupabaseConfig,
  updateSupabaseConfig,
  getSupabaseSQLSchema,
  setNetworkSimulation,
  SupabaseConfig,
  fetchWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberStatus,
  removeWorkspaceMember,
} from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { getWorkspacePermissions, isMasterOwnerEmail } from '../../services/permissionService';
import { WorkspaceMember } from '../../types/auth';
import { useSchoolProfile, DEFAULT_CLASSES, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';
import {
  X,
  Sliders,
  Database,
  Cloud,
  CheckCircle2,
  Copy,
  Check,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Wifi,
  WifiOff,
  AlertTriangle,
  Download,
  HardDrive,
  Loader2,
  Users,
  UserPlus,
  UserCheck,
  XCircle,
  Trash2,
  Clock,
  Lock,
  History,
  BookOpen,
  School,
  Building,
  Save,
  RotateCcw,
  Upload,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { backfillHistoricalDataForOwner } from '../../services/historicalBackfillService';
import {
  getStoreCounts,
  downloadLocalBackup,
  validateBackupJSON,
  restoreBackupData,
} from '../../services/backupService';
import {
  inspectLegacyRecords,
  linkAndMigrateLegacyRecordsToWorkspace,
  rollbackLegacyMigration,
  LEGACY_DB_NAME,
  LegacyDataInspection,
} from '../../services/db';
import { StoreCounts, BackupValidationResult, RestoreExecutionResult } from '../../types/backup';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { session } = useAuth();
  const permissions = getWorkspacePermissions(session?.user);
  const { theme, setTheme } = useTheme();

  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [simulationMode, setSimulationMode] = useState<SupabaseConfig['simulationMode']>('none');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedSQL, setCopiedSQL] = useState(false);
  const [showSQL, setShowSQL] = useState(false);

  // Backup state
  const [storeCounts, setStoreCounts] = useState<StoreCounts | null>(null);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupResult, setBackupResult] = useState<{
    success: boolean;
    filename: string;
    totalRecords: number;
    error?: string;
  } | null>(null);

  // Restore state
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [isValidatingRestore, setIsValidatingRestore] = useState(false);
  const [restoreValidation, setRestoreValidation] = useState<BackupValidationResult | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [hasConfirmedReplace, setHasConfirmedReplace] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreExecutionResult | null>(null);

  // Legacy Archive & Rollback state
  const [legacyInspection, setLegacyInspection] = useState<LegacyDataInspection | null>(null);
  const [rollbackStatus, setRollbackStatus] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Workspace Member state (Owner only)
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isMasterOwner = isMasterOwnerEmail(session?.user?.email);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // School Profile & Institution Setup state
  const {
    profile: currentSchoolProfile,
    updateProfile: updateSchoolProfile,
    resetProfile: resetSchoolProfileState,
  } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);

  const [schoolNameInput, setSchoolNameInput] = useState(currentSchoolProfile.schoolName);
  const [schoolShortNameInput, setSchoolShortNameInput] = useState(currentSchoolProfile.schoolShortName);
  const [districtInput, setDistrictInput] = useState(currentSchoolProfile.district);
  const [principalNameInput, setPrincipalNameInput] = useState(currentSchoolProfile.principalName);
  const [principalPhoneInput, setPrincipalPhoneInput] = useState(currentSchoolProfile.principalPhone || '');
  const [emisCodeInput, setEmisCodeInput] = useState(currentSchoolProfile.emisCode || '');
  const [addressInput, setAddressInput] = useState(currentSchoolProfile.address || '');
  const [academicYearInput, setAcademicYearInput] = useState(currentSchoolProfile.academicYear || '');
  const [classesInput, setClassesInput] = useState(
    sortClasses(sanitizeClasses(currentSchoolProfile.classes)).join(', ')
  );
  const [consoleTitleInput, setConsoleTitleInput] = useState(
    currentSchoolProfile.consoleTitle || 'Computer Operator Console'
  );
  const [operatorTitleInput, setOperatorTitleInput] = useState(
    currentSchoolProfile.operatorTitle || 'Lead Computer Operator & Systems Administrator'
  );
  const [logoPreview, setLogoPreview] = useState(currentSchoolProfile.logoUrl || '');
  const [isSavingSchoolProfile, setIsSavingSchoolProfile] = useState(false);
  const [schoolProfileNotice, setSchoolProfileNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSchoolNameInput(currentSchoolProfile.schoolName);
    setSchoolShortNameInput(currentSchoolProfile.schoolShortName);
    setDistrictInput(currentSchoolProfile.district);
    setPrincipalNameInput(currentSchoolProfile.principalName);
    setPrincipalPhoneInput(currentSchoolProfile.principalPhone || '');
    setEmisCodeInput(currentSchoolProfile.emisCode || '');
    setAddressInput(currentSchoolProfile.address || '');
    setAcademicYearInput(currentSchoolProfile.academicYear || '');
    setClassesInput(sortClasses(sanitizeClasses(currentSchoolProfile.classes)).join(', '));
    setConsoleTitleInput(currentSchoolProfile.consoleTitle || 'Computer Operator Console');
    setOperatorTitleInput(currentSchoolProfile.operatorTitle || 'Lead Computer Operator & Systems Administrator');
    setLogoPreview(currentSchoolProfile.logoUrl || '');
  }, [currentSchoolProfile]);

  // Handle ESC key to dismiss modal cleanly
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSaveSchoolProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (permissions.isReadOnly) return;
    setIsSavingSchoolProfile(true);
    setSchoolProfileNotice(null);
    try {
      const parsedClasses = classesInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      await updateSchoolProfile(
        {
          schoolName: schoolNameInput.trim() || 'Govt Boys High School Jam Yousuf Colony',
          schoolShortName: schoolShortNameInput.trim() || 'GBHS Jam Yousuf Colony',
          district: districtInput.trim() || 'Hub, Lasbela',
          consoleTitle: consoleTitleInput.trim() || 'Computer Operator Console',
          operatorTitle: operatorTitleInput.trim() || 'Lead Computer Operator & Systems Administrator',
          principalName: principalNameInput.trim() || 'Prof. Abdul Rasheed',
          principalPhone: principalPhoneInput.trim(),
          emisCode: emisCodeInput.trim() || 'GBHS-MAIN',
          address: addressInput.trim(),
          academicYear: academicYearInput.trim() || '2026-2027',
          logoUrl: logoPreview,
          classes: sanitizeClasses(parsedClasses),
        },
        session?.user?.email
      );
      setSchoolProfileNotice({
        type: 'success',
        message: 'School Profile & Institution setup updated successfully!',
      });
      setTimeout(() => setSchoolProfileNotice(null), 4000);
    } catch (err: any) {
      setSchoolProfileNotice({
        type: 'error',
        message: err.message || 'Failed to update school profile.',
      });
    } finally {
      setIsSavingSchoolProfile(false);
    }
  };

  const handleSchoolLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file (JPG, PNG, WebP).');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setLogoPreview(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetSchoolLogo = async () => {
    await resetSchoolProfileState();
    setLogoPreview('/custom-logo.jpg');
    setSchoolProfileNotice({
      type: 'success',
      message: 'School profile reset to defaults.',
    });
    setTimeout(() => setSchoolProfileNotice(null), 3000);
  };

  const handleRunHistoricalBackfill = async () => {
    if (!session?.user?.email || !session?.user?.id || !isMasterOwner) return;
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await backfillHistoricalDataForOwner(session.user.email, session.user.id, true);
      const refreshedCounts = await getStoreCounts();
      setStoreCounts(refreshedCounts);
      setBackfillResult({
        success: true,
        message: `Backfill Complete! Restored ${res.studentsCount} Students, ${res.teachingLogsCount} Teaching Logs (Modules 1-4), ${res.attendanceCount.toLocaleString()} Attendance Records (March 2 – October 20, 2026), ${res.practicalsCount} Practicals, and ${res.followupsCount} Follow-ups.`,
      });
    } catch (err: any) {
      setBackfillResult({
        success: false,
        message: err.message || 'Failed to complete historical backfill.',
      });
    } finally {
      setIsBackfilling(false);
    }
  };

  const loadMembers = async () => {
    if (!session?.user?.id) return;
    try {
      const list = await fetchWorkspaceMembers(session.user.id);
      setMembers(list);
    } catch (err: any) {
      console.error('Failed to load workspace members:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (isMasterOwner) {
        const cfg = getSupabaseConfig();
        setUrl(cfg.url || '');
        setAnonKey(cfg.anonKey || '');
        setSimulationMode(cfg.simulationMode || 'none');
      } else {
        setUrl('');
        setAnonKey('');
        setSimulationMode('none');
      }
      setSaveSuccess(false);
      setBackupResult(null);
      setRollbackStatus(null);
      setMemberMessage(null);
      setBackfillResult(null);

      // Load live store counts for backup overview
      getStoreCounts()
        .then((counts) => setStoreCounts(counts))
        .catch((err) => console.error('Failed to load store counts:', err));

      // Inspect legacy records archive
      inspectLegacyRecords(session?.user?.id)
        .then((inspection) => setLegacyInspection(inspection))
        .catch((err) => console.error('Failed to inspect legacy archive:', err));

      // Load workspace members if Master Owner
      if (session?.user?.id && isMasterOwner) {
        loadMembers();
      }
    }
  }, [isOpen, session?.user?.id, session?.user?.email, isMasterOwner]);

  const handleDownloadBackup = async () => {
    if (permissions.isReadOnly) return;
    setIsExportingBackup(true);
    setBackupResult(null);
    try {
      const res = await downloadLocalBackup();
      setBackupResult(res);
      // Refresh counts after export to confirm zero change
      const refreshed = await getStoreCounts();
      setStoreCounts(refreshed);
    } catch (e: any) {
      setBackupResult({
        success: false,
        filename: '',
        totalRecords: 0,
        error: e.message || 'Export error',
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (permissions.isReadOnly || !permissions.isOwner) {
      alert('Permission denied: Only the authorized Workspace Owner can restore database backups.');
      return;
    }

    const activeWsId = session?.user?.workspaceOwnerId || session?.user?.id;
    if (!activeWsId) {
      alert('No active workspace: You must be logged into a workspace to restore records.');
      return;
    }

    setIsValidatingRestore(true);
    setRestoreResult(null);
    setHasConfirmedReplace(false);

    try {
      const text = await file.text();
      const validation = await validateBackupJSON(text, activeWsId);
      setRestoreValidation(validation);
      setIsRestoreModalOpen(true);
    } catch (err: any) {
      setRestoreValidation({
        isValid: false,
        errors: [err.message || 'Failed to read backup file.'],
        warnings: [],
      });
      setIsRestoreModalOpen(true);
    } finally {
      setIsValidatingRestore(false);
      if (restoreFileInputRef.current) {
        restoreFileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmRestore = async () => {
    if (permissions.isReadOnly || !permissions.isOwner) return;
    if (!restoreValidation?.isValid || !restoreValidation?.backup) return;
    if (!hasConfirmedReplace) return;

    const activeWsId = session?.user?.workspaceOwnerId || session?.user?.id;
    if (!activeWsId) return;

    setIsRestoring(true);
    try {
      const result = await restoreBackupData(restoreValidation.backup, activeWsId);
      setRestoreResult(result);
      if (result.success) {
        const refreshed = await getStoreCounts();
        setStoreCounts(refreshed);
        window.dispatchEvent(new CustomEvent('gbhs_records_restored', { detail: { count: result.totalRecords } }));
      }
    } catch (err: any) {
      setRestoreResult({
        success: false,
        restoredCounts: {} as StoreCounts,
        totalRecords: 0,
        targetDatabaseName: '',
        targetWorkspaceId: activeWsId,
        error: err.message || 'Restoration failed.',
        rolledBack: true,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDownloadLegacyArchive = async () => {
    if (permissions.isReadOnly) return;
    setIsExportingBackup(true);
    try {
      const res = await downloadLocalBackup(LEGACY_DB_NAME);
      setBackupResult(res);
    } catch (e: any) {
      setBackupResult({
        success: false,
        filename: '',
        totalRecords: 0,
        error: e.message || 'Legacy export error',
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRollbackWorkspace = async () => {
    if (permissions.isReadOnly) return;
    if (!session?.user?.id) return;
    if (!window.confirm('Are you sure you want to revert this workspace? All linked records will be cleared from this workspace, but the legacy archive in gbhs_operator_db_v1 will remain 100% intact.')) {
      return;
    }
    setIsRollingBack(true);
    setRollbackStatus(null);
    try {
      const res = await rollbackLegacyMigration(session.user.id);
      if (res.success) {
        setRollbackStatus(res.message);
        const refreshed = await getStoreCounts();
        setStoreCounts(refreshed);
        const refreshedInspection = await inspectLegacyRecords(session.user.id);
        setLegacyInspection(refreshedInspection);
      } else {
        setRollbackStatus(res.error || 'Rollback failed.');
      }
    } catch (err: any) {
      setRollbackStatus(err.message || 'Rollback error.');
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id || !inviteEmail.trim()) return;
    setIsInviting(true);
    setMemberMessage(null);
    try {
      const res = await addWorkspaceMember(
        session.user.id,
        inviteEmail.trim(),
        session.user.email
      );
      if (res.success) {
        setInviteEmail('');
        setMemberMessage({
          type: 'success',
          text: `Invitation created for ${res.member?.member_email}! Status is Pending until approved.`,
        });
        await loadMembers();
      } else {
        setMemberMessage({
          type: 'error',
          text: res.error || 'Failed to invite team member.',
        });
      }
    } catch (err: any) {
      setMemberMessage({
        type: 'error',
        text: err.message || 'Invitation failed.',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateMemberStatus = async (
    memberId: string,
    status: 'approved' | 'revoked',
    accessLevel?: 'read_only' | 'read_write'
  ) => {
    setMemberActionLoading(memberId);
    setMemberMessage(null);
    try {
      const res = await updateWorkspaceMemberStatus(memberId, status, accessLevel);
      if (res.success) {
        let msg = 'Member status updated.';
        if (status === 'approved') {
          msg =
            accessLevel === 'read_only'
              ? 'Account approved as Staff (Read-Only Shared Access)!'
              : 'Account approved as Personal User (Isolated Personal Workspace)!';
        } else if (status === 'revoked') {
          msg = 'Account access revoked and blocked.';
        }
        setMemberMessage({
          type: 'success',
          text: msg,
        });
        await loadMembers();
      } else {
        setMemberMessage({
          type: 'error',
          text: res.error || 'Failed to update member status.',
        });
      }
    } catch (err: any) {
      setMemberMessage({
        type: 'error',
        text: err.message || 'Update failed.',
      });
    } finally {
      setMemberActionLoading(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm('Are you sure you want to remove this member from your workspace?')) return;
    setMemberActionLoading(memberId);
    setMemberMessage(null);
    try {
      const res = await removeWorkspaceMember(memberId);
      if (res.success) {
        setMemberMessage({
          type: 'success',
          text: 'Member removed from workspace.',
        });
        await loadMembers();
      } else {
        setMemberMessage({
          type: 'error',
          text: res.error || 'Failed to remove member.',
        });
      }
    } catch (err: any) {
      setMemberMessage({
        type: 'error',
        text: err.message || 'Remove failed.',
      });
    } finally {
      setMemberActionLoading(null);
    }
  };

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterOwner || permissions.isReadOnly) return;
    await updateSupabaseConfig({
      url: url.trim(),
      anonKey: anonKey.trim(),
      simulationMode,
    });
    setNetworkSimulation(simulationMode);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const sqlSchema = getSupabaseSQLSchema();

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlSchema);
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl lg:max-w-4xl bg-[#202822] border border-[#3A473E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Pinned Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3A473E] bg-[#2B352E] shrink-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D97745]/10 text-[#D97745] flex items-center justify-center border border-[#D97745]/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isMasterOwner ? 'System & Supabase Cloud Settings' : 'System & Workspace Settings'}
              </h3>
              <p className="text-xs text-slate-300">
                Configure school branding, appearance theme, user roles, and local IndexedDB backups.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-interactive text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#202822] transition cursor-pointer"
            title="Close Settings (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1 overscroll-contain">
          {/* Read-Only Access Banner */}
          {permissions.isReadOnly && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800 text-xs text-amber-200 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-300">Read-Only Shared Access</p>
                <p className="text-amber-200/80 mt-1 leading-relaxed">
                  You are viewing shared records as an approved team member. Modification of database credentials, system configuration, backups, or user permissions is reserved exclusively for the workspace owner.
                </p>
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Settings updated successfully!</span>
            </div>
          )}

          {/* School & Operator profile summary */}
          <div className="bg-[#2B352E] border border-[#3A473E] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-400">School Scope</span>
              <p className="font-bold text-white text-sm">
                {currentSchoolProfile.schoolName} ({currentSchoolProfile.emisCode || 'GBHS-MAIN'})
              </p>
              <p className="text-slate-300 mt-0.5">
                District: <strong className="text-white">{currentSchoolProfile.district}</strong> • Principal: <strong className="text-white">{currentSchoolProfile.principalName}</strong>
              </p>
              <p className="text-slate-300 mt-0.5">Operator: {session?.user.fullName} ({session?.user.email})</p>
              <p className="text-[11px] text-slate-400 font-mono mt-1">
                Account UUID: {session?.user.id}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                Workspace ID: {session?.user.workspaceOwnerId || session?.user.id}
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-1 shrink-0">
              <span className={`px-2.5 py-1 rounded-lg font-bold text-[11px] uppercase tracking-wide border ${
                permissions.isReadOnly
                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                  : 'bg-[#D97745]/20 text-[#D97745] border border-[#D97745]/40'
              }`}>
                Role: {session?.user.workspaceRole || 'owner'}
              </span>
              <span className="text-[10px] text-emerald-400 font-medium">
                Cloud Authenticated
              </span>
            </div>
          </div>

          {/* Appearance & Theme Preferences Card */}
          <div className="bg-[#2B352E] border border-[#3A473E] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#3A473E] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#D97745]/10 text-[#D97745] flex items-center justify-center border border-[#D97745]/20 shrink-0">
                  {theme === 'dark' ? <Moon className="w-5 h-5 text-[#9BAE9C]" /> : <Sun className="w-5 h-5 text-[#D97745]" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Appearance & Theme</span>
                    <span className="text-[10px] bg-[#202822] text-[#9BAE9C] border border-[#3A473E] px-2 py-0.5 rounded-full font-semibold">
                      {theme === 'dark' ? 'Dark Palette Active' : 'Light Palette Active'}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Choose between Dark and Light mode. Theme preference is automatically saved in local storage and persists across restarts.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Dark Mode Card */}
              <div
                onClick={() => setTheme('dark')}
                className={`btn-interactive p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  theme === 'dark'
                    ? 'bg-[#1A211C] border-[#D97745] ring-2 ring-[#D97745]/20 shadow-md'
                    : 'bg-[#202822] border-[#3A473E] hover:border-[#9BAE9C]/40 opacity-75 hover:opacity-100'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#2B352E] text-[#9BAE9C] border border-[#3A473E] flex items-center justify-center">
                        <Moon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-white">Dark Mode</span>
                    </div>
                    {theme === 'dark' && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#D97745] bg-[#D97745]/15 px-2 py-0.5 rounded-full border border-[#D97745]/30">
                        <Check className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Deep Charcoal & Muted Sage palette. Reduced eye glare for late-night record keeping and standard console operations.
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#3A473E] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#202822] border border-[#3A473E]"></span>
                    <span className="w-3 h-3 rounded-full bg-[#2B352E] border border-[#3A473E]"></span>
                    <span className="w-3 h-3 rounded-full bg-[#D97745]"></span>
                    <span className="w-3 h-3 rounded-full bg-[#9BAE9C]"></span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">#202822</span>
                </div>
              </div>

              {/* Light Mode Card */}
              <div
                onClick={() => setTheme('light')}
                className={`btn-interactive p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  theme === 'light'
                    ? 'bg-[#F6F3EA] text-slate-900 border-[#D97745] ring-2 ring-[#D97745]/20 shadow-md'
                    : 'bg-[#F6F3EA]/80 text-slate-900 border-slate-300 hover:border-[#9BAE9C] opacity-75 hover:opacity-100'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 border border-amber-300 flex items-center justify-center">
                        <Sun className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-900">Light Mode</span>
                    </div>
                    {theme === 'light' && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#D97745] bg-[#D97745]/15 px-2 py-0.5 rounded-full border border-[#D97745]/30">
                        <Check className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    Crisp Warm Ivory & soft surfaces with high-contrast text. Optimal for daytime classrooms and bright daylight.
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#F6F3EA] border border-slate-300"></span>
                    <span className="w-3 h-3 rounded-full bg-white border border-slate-300"></span>
                    <span className="w-3 h-3 rounded-full bg-[#D97745]"></span>
                    <span className="w-3 h-3 rounded-full bg-[#9BAE9C]"></span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">#F6F3EA</span>
                </div>
              </div>
            </div>
          </div>

          {/* School Profile & Institution Setup Card */}
          <div className="bg-[#2B352E] border border-[#3A473E] rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#3A473E] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#D97745]/10 text-[#D97745] flex items-center justify-center border border-[#D97745]/20 shrink-0">
                  <School className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>School Profile & Institution Setup</span>
                    <span className="text-[10px] bg-[#D97745]/15 text-[#D97745] border border-[#D97745]/30 px-2 py-0.5 rounded-full font-semibold">
                      Dynamic Branding
                    </span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Customize School Name, District, Principal Name, and Logo across headers, reports, and exported documents.
                  </p>
                </div>
              </div>

              {!permissions.isReadOnly && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetSchoolLogo}
                    className="btn-interactive flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-[#202822] hover:bg-[#1A211C] border border-[#3A473E] transition cursor-pointer"
                    title="Reset to default institution settings"
                  >
                    <RotateCcw className="w-3 h-3 text-[#9BAE9C]" />
                    <span>Reset Defaults</span>
                  </button>
                </div>
              )}
            </div>

            {schoolProfileNotice && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  schoolProfileNotice.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                {schoolProfileNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{schoolProfileNotice.message}</span>
              </div>
            )}

            <form onSubmit={handleSaveSchoolProfile} className="space-y-4">
              {/* Logo & School Name Row */}
              <div className="flex flex-col sm:flex-row items-start gap-4 p-3 bg-[#202822] border border-[#3A473E] rounded-xl">
                {/* Logo Uploader / Preview */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <input
                    type="file"
                    ref={logoFileInputRef}
                    onChange={handleSchoolLogoUpload}
                    accept="image/*"
                    className="hidden"
                    disabled={permissions.isReadOnly}
                  />
                  <div
                    onClick={() => !permissions.isReadOnly && logoFileInputRef.current?.click()}
                    className={`w-16 h-16 rounded-full overflow-hidden bg-[#2B352E] border-2 border-[#3A473E] ring-2 ring-[#D97745]/20 flex items-center justify-center relative group ${
                      !permissions.isReadOnly ? 'cursor-pointer hover:border-[#D97745] transition-colors' : ''
                    }`}
                    title={permissions.isReadOnly ? 'School Logo' : 'Click to change school logo'}
                  >
                    <img
                      src={logoPreview || '/custom-logo.jpg'}
                      alt="School Logo Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as any).src = '/custom-logo.jpg';
                      }}
                    />
                    {!permissions.isReadOnly && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-bold text-[#F6F3EA]">
                        Upload
                      </div>
                    )}
                  </div>
                  {!permissions.isReadOnly && (
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      className="btn-interactive flex items-center gap-1 text-[10px] text-[#D97745] hover:text-[#c26535] font-semibold cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Change Logo</span>
                    </button>
                  )}
                </div>

                {/* School Name & Short Name Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 w-full">
                  <div>
                    <label className="block text-slate-300 text-xs font-semibold mb-1">
                      Full School Name *
                    </label>
                    <input
                      type="text"
                      value={schoolNameInput}
                      onChange={(e) => setSchoolNameInput(e.target.value)}
                      disabled={permissions.isReadOnly}
                      placeholder="e.g. Govt Boys High School Jam Yousuf Colony"
                      required
                      className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                    />
                    <span className="text-[10px] text-slate-400">Used in official letterheads, PDF reports & exports</span>
                  </div>

                  <div>
                    <label className="block text-slate-300 text-xs font-semibold mb-1">
                      Short / Abbreviated Name *
                    </label>
                    <input
                      type="text"
                      value={schoolShortNameInput}
                      onChange={(e) => setSchoolShortNameInput(e.target.value)}
                      disabled={permissions.isReadOnly}
                      placeholder="e.g. GBHS Jam Yousuf Colony"
                      required
                      className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                    />
                    <span className="text-[10px] text-slate-400">Displayed in top navigation bar & status tags</span>
                  </div>
                </div>
              </div>

              {/* District & Principal Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    District / Division *
                  </label>
                  <input
                    type="text"
                    value={districtInput}
                    onChange={(e) => setDistrictInput(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="e.g. Hub, Lasbela"
                    required
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Principal / Headmaster *
                  </label>
                  <input
                    type="text"
                    value={principalNameInput}
                    onChange={(e) => setPrincipalNameInput(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="e.g. Prof. Abdul Rasheed"
                    required
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Principal / Office Contact
                  </label>
                  <input
                    type="text"
                    value={principalPhoneInput}
                    onChange={(e) => setPrincipalPhoneInput(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="e.g. 0300-1234567"
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Code, Academic Year, and Address */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    EMIS / Institution Code
                  </label>
                  <input
                    type="text"
                    value={emisCodeInput}
                    onChange={(e) => setEmisCodeInput(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="e.g. GBHS-MAIN"
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Academic Year
                  </label>
                  <input
                    type="text"
                    value={academicYearInput}
                    onChange={(e) => setAcademicYearInput(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="e.g. 2026-2027"
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Campus Address
                  </label>
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="e.g. Jam Yousuf Colony, Hub"
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-slate-300 font-semibold mb-1">
                    Configured Classes / Grades (Comma-separated) *
                  </label>
                  <input
                    type="text"
                    value={classesInput}
                    onChange={(e) => setClassesInput(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="e.g. Class 1, Class 2, Class 3, ..., Class 10"
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                  />
                  <span className="text-[10px] text-slate-400">
                    Defines active grades dynamically rendered on dashboard cards, reports, forms, and attendance registers.
                  </span>
                </div>

                {/* Console Title & Operator Custom Title Row */}
                <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Console / Portal Designation Title
                    </label>
                    <input
                      type="text"
                      value={consoleTitleInput}
                      onChange={(e) => setConsoleTitleInput(e.target.value)}
                      disabled={permissions.isReadOnly}
                      placeholder="e.g. Computer Operator Console"
                      className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                    />
                    <span className="text-[10px] text-slate-400">
                      Displayed on top navbar, reports, and main dashboard hero banner.
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Master Operator Custom Title / Role
                    </label>
                    <input
                      type="text"
                      value={operatorTitleInput}
                      onChange={(e) => setOperatorTitleInput(e.target.value)}
                      disabled={permissions.isReadOnly}
                      placeholder="e.g. Lead Computer Operator & Systems Administrator"
                      className="w-full bg-[#1A211C] border border-[#3A473E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745] disabled:opacity-60"
                    />
                    <span className="text-[10px] text-slate-400">
                      Rendered alongside the Master Owner credentials on dashboard hero.
                    </span>
                  </div>
                </div>
              </div>

              {!permissions.isReadOnly && (
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingSchoolProfile}
                    className="btn-interactive flex items-center gap-1.5 bg-[#D97745] hover:bg-[#c26535] text-white font-semibold text-xs px-4 py-2 rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingSchoolProfile ? 'Saving...' : 'Save School Profile'}</span>
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* User Registrations & Staff Access Control (Master Owner Only) */}
          {isMasterOwner && (
            <div className="bg-[#2B352E] border border-[#3A473E] rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#D97745]/10 text-[#D97745] flex items-center justify-center border border-[#D97745]/20 shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span>User Registrations & Staff Access Control</span>
                      <span className="text-[10px] bg-[#D97745]/15 text-[#D97745] border border-[#D97745]/30 px-2 py-0.5 rounded-full font-semibold">
                        Master Owner Only
                      </span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Review pending user sign-ups and staff access requests. Approve as <strong>Staff (Read-Only Shared records & Excel export)</strong> or as <strong>Personal User (Isolated workspace with full manage/edit/delete control over own data)</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Message */}
              {memberMessage && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    memberMessage.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800 text-rose-300'
                  }`}
                >
                  {memberMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>{memberMessage.text}</span>
                </div>
              )}

              {/* Invite Form */}
              <form onSubmit={handleInviteMember} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Enter colleague or staff email (e.g. operator2@gbhs.edu.pk)"
                  required
                  className="flex-1 bg-[#1A211C] border border-[#3A473E] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D97745]"
                />
                <button
                  type="submit"
                  disabled={isInviting || !inviteEmail.trim()}
                  className="btn-interactive flex items-center gap-1.5 bg-[#D97745] hover:bg-[#c26535] disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-sm cursor-pointer shrink-0"
                >
                  {isInviting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>Register User</span>
                </button>
              </form>

              {/* Members List */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Registered Accounts & Access Requests ({members.length})
                </span>

                {members.length === 0 ? (
                  <div className="bg-[#202822] border border-[#3A473E] rounded-xl p-4 text-center text-xs text-slate-400">
                    No access requests or team members registered yet. Newly registered users stay in a pending state until approved.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="bg-[#202822] border border-[#3A473E] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{m.member_email}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                m.status === 'approved' && m.access_level === 'read_only'
                                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                                  : m.status === 'approved' && m.access_level === 'read_write'
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                  : m.status === 'pending'
                                  ? 'bg-rose-950 text-rose-400 border-rose-800'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {m.status === 'approved' && m.access_level === 'read_only'
                                ? 'Approved Staff (Read-Only)'
                                : m.status === 'approved' && m.access_level === 'read_write'
                                ? 'Approved Personal User'
                                : m.status === 'pending'
                                ? 'Pending Approval'
                                : 'Access Blocked'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Tier:{' '}
                            {m.status === 'approved' && m.access_level === 'read_only'
                              ? 'Staff Role (Shared View & Export, No Edit/Delete)'
                              : m.status === 'approved' && m.access_level === 'read_write'
                              ? 'Personal Role (Full Manage/Edit/Delete On Own Space)'
                              : m.status === 'pending'
                              ? 'Unapproved (Awaiting Master Owner Review)'
                              : 'Blocked'}{' '}
                            | Requested: {new Date(m.created_at).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          {m.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateMemberStatus(m.id, 'approved', 'read_only')}
                                disabled={memberActionLoading === m.id}
                                className="btn-interactive px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 transition shadow-xs cursor-pointer"
                                title="Grant Staff access: view shared records and export to Excel/PDF. Edit, delete, and Supabase credentials are strictly blocked."
                              >
                                {memberActionLoading === m.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <UserCheck className="w-3 h-3" />
                                )}
                                <span>Approve Staff</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateMemberStatus(m.id, 'approved', 'read_write')}
                                disabled={memberActionLoading === m.id}
                                className="btn-interactive px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 transition shadow-xs cursor-pointer"
                                title="Grant Personal User access: isolated private workspace with full manage/edit/delete control over personal data."
                              >
                                {memberActionLoading === m.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3 h-3" />
                                )}
                                <span>Approve Personal</span>
                              </button>
                            </>
                          )}

                          {m.status === 'approved' && (
                            <>
                              {m.access_level === 'read_only' ? (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateMemberStatus(m.id, 'approved', 'read_write')}
                                  disabled={memberActionLoading === m.id}
                                  className="btn-interactive px-2 py-1 rounded-lg bg-[#1A211C] text-emerald-300 border border-emerald-800 hover:bg-[#2B352E] text-[10px] font-medium transition cursor-pointer"
                                  title="Switch to Personal User (Isolated Workspace)"
                                >
                                  Make Personal User
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateMemberStatus(m.id, 'approved', 'read_only')}
                                  disabled={memberActionLoading === m.id}
                                  className="btn-interactive px-2 py-1 rounded-lg bg-[#1A211C] text-amber-300 border border-amber-800 hover:bg-[#2B352E] text-[10px] font-medium transition cursor-pointer"
                                  title="Switch to Staff (Read-Only Shared records)"
                                >
                                  Make Staff
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleUpdateMemberStatus(m.id, 'revoked')}
                                disabled={memberActionLoading === m.id}
                                className="btn-interactive px-2.5 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1 transition shadow-xs cursor-pointer"
                              >
                                {memberActionLoading === m.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <XCircle className="w-3 h-3" />
                                )}
                                <span>Block / Revoke</span>
                              </button>
                            </>
                          )}

                          {m.status === 'revoked' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateMemberStatus(m.id, 'approved', 'read_only')}
                                disabled={memberActionLoading === m.id}
                                className="btn-interactive px-2.5 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1 transition shadow-xs cursor-pointer"
                              >
                                {memberActionLoading === m.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <UserCheck className="w-3 h-3" />
                                )}
                                <span>Re-Approve Staff</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateMemberStatus(m.id, 'approved', 'read_write')}
                                disabled={memberActionLoading === m.id}
                                className="btn-interactive px-2.5 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 transition shadow-xs cursor-pointer"
                              >
                                {memberActionLoading === m.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3 h-3" />
                                )}
                                <span>Re-Approve Personal</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.id)}
                            disabled={memberActionLoading === m.id}
                            className="btn-interactive p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#1A211C] transition cursor-pointer"
                            title="Remove Member from List"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Safe Local Database Backup Card */}
          <div className="bg-[#202822] border border-[#3A473E] rounded-xl p-5 space-y-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#D97745]/15 text-[#D97745] flex items-center justify-center shrink-0 border border-[#D97745]/30">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#F6F3EA] uppercase tracking-wider flex items-center gap-2">
                    <span>Safe Local Data Backup (JSON Export)</span>
                    <span className="text-[10px] bg-[#1A211C] text-[#9BAE9C] border border-[#3A473E] px-2 py-0.5 rounded-full font-semibold">
                      Non-Destructive
                    </span>
                  </h4>
                  <p className="text-xs text-[#9BAE9C] mt-0.5">
                    Export all 8 IndexedDB stores (students, attendance, teaching logs, practicals, follow-ups, outbox, conflicts, and app settings) into a single timestamped JSON file.
                  </p>
                </div>
              </div>
            </div>

            {/* Store Counts Breakdown */}
            {storeCounts && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="bg-[#1A211C] border border-[#3A473E]/70 rounded-lg p-2 text-center">
                  <span className="text-[10px] text-[#9BAE9C] uppercase">Students</span>
                  <p className="text-sm font-bold text-[#F6F3EA]">{storeCounts.students}</p>
                </div>
                <div className="bg-[#1A211C] border border-[#3A473E]/70 rounded-lg p-2 text-center">
                  <span className="text-[10px] text-[#9BAE9C] uppercase">Attendance</span>
                  <p className="text-sm font-bold text-[#F6F3EA]">{storeCounts.attendance}</p>
                </div>
                <div className="bg-[#1A211C] border border-[#3A473E]/70 rounded-lg p-2 text-center">
                  <span className="text-[10px] text-[#9BAE9C] uppercase">Teaching Logs</span>
                  <p className="text-sm font-bold text-[#F6F3EA]">{storeCounts.teaching_logs}</p>
                </div>
                <div className="bg-[#1A211C] border border-[#3A473E]/70 rounded-lg p-2 text-center">
                  <span className="text-[10px] text-[#9BAE9C] uppercase">Practicals</span>
                  <p className="text-sm font-bold text-[#F6F3EA]">{storeCounts.practical_progress}</p>
                </div>
                <div className="bg-[#1A211C] border border-[#3A473E]/70 rounded-lg p-2 text-center">
                  <span className="text-[10px] text-[#9BAE9C] uppercase">Follow-ups</span>
                  <p className="text-sm font-bold text-[#F6F3EA]">{storeCounts.absentee_followups}</p>
                </div>
                <div className="bg-[#1A211C] border border-[#3A473E]/70 rounded-lg p-2 text-center">
                  <span className="text-[10px] text-[#9BAE9C] uppercase">Outbox</span>
                  <p className="text-sm font-bold text-[#D97745]">{storeCounts.outbox}</p>
                </div>
                <div className="bg-[#1A211C] border border-[#3A473E]/70 rounded-lg p-2 text-center">
                  <span className="text-[10px] text-[#9BAE9C] uppercase">Conflicts</span>
                  <p className="text-sm font-bold text-rose-400">{storeCounts.conflicts}</p>
                </div>
                <div className="bg-[#1A211C] border border-[#3A473E]/70 rounded-lg p-2 text-center">
                  <span className="text-[10px] text-[#9BAE9C] uppercase">App State</span>
                  <p className="text-sm font-bold text-[#F6F3EA]">{storeCounts.app_state}</p>
                </div>
              </div>
            )}

            {/* Security Guarantee */}
            <div className="flex items-center gap-2 text-[11px] text-[#9BAE9C] bg-[#1A211C] p-2.5 rounded-lg border border-[#3A473E]/60">
              <ShieldCheck className="w-4 h-4 text-[#D97745] shrink-0" />
              <span>Security Verified: Bearer tokens, passwords, and secrets are strictly redacted from the backup file.</span>
            </div>

            {backupResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  backupResult.success
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {backupResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>
                    {backupResult.success
                      ? `Backup verified! ${backupResult.totalRecords} records preserved in ${backupResult.filename}`
                      : backupResult.error}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
              {permissions.isReadOnly ? (
                <span className="text-[11px] text-[#D97745]/90 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Local data backups can only be exported or restored by the workspace owner.</span>
                </span>
              ) : <div />}

              <div className="flex items-center gap-2 flex-wrap">
                {/* Hidden File Input for Restore */}
                <input
                  type="file"
                  ref={restoreFileInputRef}
                  onChange={handleSelectRestoreFile}
                  accept=".json,application/json"
                  className="hidden"
                  disabled={permissions.isReadOnly || !permissions.isOwner}
                />

                <button
                  type="button"
                  onClick={() => restoreFileInputRef.current?.click()}
                  disabled={isExportingBackup || isValidatingRestore || isRestoring || permissions.isReadOnly || !permissions.isOwner}
                  className="btn-interactive flex items-center gap-2 bg-[#2B352E] hover:bg-[#344038] disabled:opacity-50 text-[#F6F3EA] border border-[#3A473E] font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer shadow-md"
                  title="Restore a validated JSON backup into this workspace"
                >
                  {isValidatingRestore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#D97745]" />
                      <span>Validating Backup...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-[#D97745]" />
                      <span>Import / Restore Backup</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={isExportingBackup || isValidatingRestore || isRestoring || permissions.isReadOnly}
                  className="btn-interactive flex items-center gap-2 bg-[#D97745] hover:bg-[#c26535] disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer shadow-md shadow-[#D97745]/20"
                >
                  {isExportingBackup ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying & Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download Safe Backup (.JSON)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Legacy Local Records Archive & Rollback Protection */}
          {legacyInspection && (
            <div className="bg-[#202822] border border-[#3A473E] rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[#F6F3EA] uppercase tracking-wider flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#D97745]" />
                    <span>Legacy Local Archive ({LEGACY_DB_NAME})</span>
                  </h4>
                  <p className="text-xs text-[#9BAE9C] mt-0.5">
                    Untouched archive of pre-isolation records. Total unassigned items: <strong className="text-[#D97745]">{legacyInspection.totalRecords}</strong>
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1A211C] text-[#9BAE9C] border border-[#3A473E]">
                  {legacyInspection.isAlreadyLinked ? 'Linked to Current Workspace' : 'Unassigned Archive'}
                </span>
              </div>

              {rollbackStatus && (
                <div className="p-2.5 rounded-lg border border-[#D97745]/40 bg-[#D97745]/10 text-xs text-[#D97745]">
                  {rollbackStatus}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#3A473E]">
                <button
                  type="button"
                  onClick={handleDownloadLegacyArchive}
                  disabled={isExportingBackup || permissions.isReadOnly}
                  className="btn-interactive flex items-center gap-1.5 text-xs text-[#F6F3EA] hover:text-white bg-[#2B352E] hover:bg-[#344038] disabled:opacity-50 px-3.5 py-1.5 rounded-lg border border-[#3A473E] transition"
                >
                  <Download className="w-3.5 h-3.5 text-[#D97745]" />
                  <span>Download Legacy Archive (.JSON)</span>
                </button>

                {legacyInspection.isAlreadyLinked && session?.user?.id && !permissions.isReadOnly && (
                  <button
                    type="button"
                    onClick={handleRollbackWorkspace}
                    disabled={isRollingBack}
                    className="btn-interactive flex items-center gap-1.5 text-xs text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/50 px-3.5 py-1.5 rounded-lg border border-rose-800/60 transition"
                  >
                    {isRollingBack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Rollback Workspace to Empty</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Master Owner Historical Backfill Control */}
          {isMasterOwner && (
            <div className="bg-[#202822] border border-[#3A473E] rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[#F6F3EA] uppercase tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4 text-[#D97745]" />
                    <span>Master Owner Historical Backfill (March 2 – October 20, 2026)</span>
                  </h4>
                  <p className="text-xs text-[#9BAE9C] mt-0.5 leading-relaxed">
                    Restores authentic historical curriculum teaching logs (200 school days covering Modules 1 to 4)
                    and 15,000 attendance records for the 75 Jam Yousuf Colony students. Populated strictly for the Master
                    Owner account, keeping all new user workspaces clean and empty.
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1A211C] text-[#D97745] border border-[#D97745]/40">
                  Owner Exclusive
                </span>
              </div>

              {backfillResult && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                    backfillResult.success
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800 text-rose-300'
                  }`}
                >
                  {backfillResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>{backfillResult.message}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 border-t border-[#3A473E]">
                <span className="text-[11px] text-[#9BAE9C]">
                  Data sourced from <span className="font-mono text-[#F6F3EA]">Historical_Curriculum_And_Attendance_2026.xlsx</span>
                </span>

                <button
                  type="button"
                  onClick={handleRunHistoricalBackfill}
                  disabled={isBackfilling}
                  className="btn-interactive flex items-center gap-1.5 text-xs font-semibold text-white bg-[#D97745] hover:bg-[#c26535] disabled:opacity-50 px-3.5 py-1.5 rounded-lg shadow-sm shadow-[#D97745]/20 transition"
                >
                  {isBackfilling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Backfilling Historical Records...</span>
                    </>
                  ) : (
                    <>
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Re-run Historical Backfill (March 2 – Oct 20)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Supabase Cloud Connection Form (Master Owner Only) */}
          {isMasterOwner && (
            <>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-[#F6F3EA] uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-[#D97745]" />
                    <span>Supabase Cloud Database & Authentication</span>
                  </h4>
                  <p className="text-xs text-[#9BAE9C] mb-3 leading-relaxed">
                    Enter your Supabase project credentials. When left empty, the built-in zero-setup mock cloud adapter is
                    used for instantaneous offline/online sync verification.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">Supabase Project URL</label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="https://xyzcompany.supabase.co"
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/40 disabled:opacity-50 focus:outline-none focus:border-[#D97745] focus:ring-1 focus:ring-[#D97745] font-mono transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#F6F3EA] mb-1">
                    Supabase Anon / Public Key (Never use Service Role Key)
                  </label>
                  <input
                    type="password"
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    disabled={permissions.isReadOnly}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] placeholder-[#9BAE9C]/40 disabled:opacity-50 focus:outline-none focus:border-[#D97745] focus:ring-1 focus:ring-[#D97745] font-mono transition-all"
                  />
                </div>

                {/* Network Simulation Modes for Testing */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-[#F6F3EA] mb-1.5 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#D97745]" />
                    <span>Network & Cloud Simulation Mode (For Test Verification)</span>
                  </label>
                  <select
                    value={simulationMode}
                    onChange={(e) => setSimulationMode(e.target.value as any)}
                    disabled={permissions.isReadOnly}
                    className="w-full bg-[#1A211C] border border-[#3A473E] rounded-xl px-3 py-2 text-xs text-[#F6F3EA] disabled:opacity-50 focus:outline-none focus:border-[#D97745] focus:ring-1 focus:ring-[#D97745] transition-all"
                  >
                    <option value="none">Normal (Active Online Cloud Sync)</option>
                    <option value="offline">Simulate Network Disconnected (Offline)</option>
                    <option value="server_error">Simulate HTTP 503 Server Error (Triggers Backoff)</option>
                    <option value="auth_expired">Simulate Expired Session (Auth Required)</option>
                    <option value="conflict_trigger">Simulate Remote Divergence (Conflict Review)</option>
                  </select>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSQL(!showSQL)}
                    className="text-xs text-[#D97745] hover:text-[#c26535] font-medium underline cursor-pointer transition-colors"
                  >
                    {showSQL ? 'Hide Supabase SQL Schema' : 'View Supabase RLS SQL Schema'}
                  </button>

                  {permissions.isReadOnly ? (
                    <span className="text-xs text-[#D97745]/90 font-medium flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Settings locked to Workspace Owner</span>
                    </span>
                  ) : (
                    <button
                      type="submit"
                      className="btn-interactive bg-[#D97745] hover:bg-[#c26535] text-white font-semibold text-xs px-5 py-2 rounded-xl shadow-md shadow-[#D97745]/20 transition-all cursor-pointer"
                    >
                      Save Settings
                    </button>
                  )}
                </div>
              </form>

              {/* Collapsible Supabase RLS SQL schema */}
              {showSQL && (
                <div className="bg-[#1A211C] border border-[#3A473E] rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[#9BAE9C]">PostgreSQL Schema & RLS Policies</span>
                    <button
                      onClick={handleCopySQL}
                      className="btn-interactive flex items-center gap-1.5 text-xs text-[#D97745] hover:text-white font-mono bg-[#2B352E] hover:bg-[#344038] border border-[#3A473E] px-2.5 py-1 rounded transition"
                    >
                      {copiedSQL ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSQL ? 'Copied!' : 'Copy SQL'}</span>
                    </button>
                  </div>
                  <pre className="text-[10px] text-[#9BAE9C] font-mono overflow-x-auto max-h-52 p-2.5 bg-[#131814] rounded-lg border border-[#3A473E]/50">
                    {sqlSchema}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pinned Sticky Footer Action Bar */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3.5 border-t border-[#3A473E] bg-[#202822]/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-2 text-xs text-[#9BAE9C]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="hidden sm:inline">GBHS Record Console • Ready</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="btn-interactive px-4 py-2 rounded-xl text-xs font-semibold text-[#F6F3EA] hover:text-white bg-[#2B352E] hover:bg-[#344038] border border-[#3A473E] transition cursor-pointer"
            >
              Close Settings
            </button>
          </div>
        </div>
      </div>
      {/* Restore Backup Preview & Confirmation Modal */}
      {isRestoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-[#202822] border border-[#3A473E] rounded-2xl shadow-2xl p-6 text-[#F6F3EA] my-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#3A473E] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#D97745]/15 text-[#D97745] flex items-center justify-center border border-[#D97745]/30">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#F6F3EA]">Import & Restore Workspace Backup</h3>
                  <p className="text-xs text-[#9BAE9C]">Preview contents before confirming database replacement</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isRestoring) {
                    setIsRestoreModalOpen(false);
                    setRestoreResult(null);
                    setRestoreValidation(null);
                  }
                }}
                disabled={isRestoring}
                className="btn-interactive text-[#9BAE9C] hover:text-[#F6F3EA] p-1.5 rounded-lg hover:bg-[#2B352E] transition disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {/* Validation Failed State */}
              {!restoreValidation?.isValid && (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 space-y-2">
                  <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Incompatible or Corrupted Backup File</span>
                  </div>
                  <p className="text-xs text-rose-200/80">
                    This file cannot be restored because it failed security and data integrity validation:
                  </p>
                  <ul className="list-disc list-inside text-xs text-rose-300/90 space-y-1 mt-2">
                    {restoreValidation?.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validation Succeeded State */}
              {restoreValidation?.isValid && restoreValidation.summary && (
                <>
                  {/* Target Workspace Info */}
                  <div className="bg-[#1A211C] border border-[#3A473E] rounded-xl p-3.5 text-xs space-y-1">
                    <span className="text-[10px] text-[#9BAE9C] font-semibold uppercase tracking-wider">
                      Target Authenticated Workspace
                    </span>
                    <p className="font-bold text-[#F6F3EA] text-sm">
                      {session?.user.fullName} ({session?.user.email})
                    </p>
                    <p className="text-[#9BAE9C] font-mono text-[11px]">
                      Database: <strong className="text-[#D97745]">{restoreValidation.summary.targetDatabaseName}</strong>
                    </p>
                  </div>

                  {/* Backup Metadata Overview */}
                  <div className="bg-[#1A211C] border border-[#3A473E] rounded-xl p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#9BAE9C] font-semibold uppercase tracking-wider">
                        Backup Metadata Overview
                      </span>
                      <span className="text-[10px] bg-[#202822] text-[#9BAE9C] border border-[#3A473E] px-2 py-0.5 rounded-full font-semibold">
                        Validated & Compatible
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#9BAE9C]">Export Date:</span>
                        <p className="text-[#F6F3EA] font-medium">
                          {new Date(restoreValidation.summary.exportDate).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#9BAE9C]">Application:</span>
                        <p className="text-[#F6F3EA] font-medium">
                          {restoreValidation.summary.appName} (v{restoreValidation.summary.appVersion})
                        </p>
                      </div>
                      {restoreValidation.summary.workspaceId && (
                        <div className="col-span-2">
                          <span className="text-[#9BAE9C]">Source Workspace ID:</span>
                          <p className="text-[#9BAE9C] font-mono text-[10px] truncate">
                            {restoreValidation.summary.workspaceId}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Store Breakdown */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-[#9BAE9C] font-semibold uppercase tracking-wider">
                      Records to be Restored ({restoreValidation.summary.totalRecords} Total)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-[#1A211C] border border-[#3A473E] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#9BAE9C] uppercase">Students</span>
                        <p className="text-sm font-bold text-[#F6F3EA]">
                          {restoreValidation.summary.countsPerStore.students}
                        </p>
                      </div>
                      <div className="bg-[#1A211C] border border-[#3A473E] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#9BAE9C] uppercase">Attendance</span>
                        <p className="text-sm font-bold text-[#F6F3EA]">
                          {restoreValidation.summary.countsPerStore.attendance}
                        </p>
                      </div>
                      <div className="bg-[#1A211C] border border-[#3A473E] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#9BAE9C] uppercase">Teaching</span>
                        <p className="text-sm font-bold text-[#F6F3EA]">
                          {restoreValidation.summary.countsPerStore.teaching_logs}
                        </p>
                      </div>
                      <div className="bg-[#1A211C] border border-[#3A473E] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#9BAE9C] uppercase">Practicals</span>
                        <p className="text-sm font-bold text-[#F6F3EA]">
                          {restoreValidation.summary.countsPerStore.practical_progress}
                        </p>
                      </div>
                      <div className="bg-[#1A211C] border border-[#3A473E] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#9BAE9C] uppercase">Follow-ups</span>
                        <p className="text-sm font-bold text-[#F6F3EA]">
                          {restoreValidation.summary.countsPerStore.absentee_followups}
                        </p>
                      </div>
                      <div className="bg-[#1A211C] border border-[#3A473E] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#9BAE9C] uppercase">Outbox</span>
                        <p className="text-sm font-bold text-[#D97745]">
                          {restoreValidation.summary.countsPerStore.outbox}
                        </p>
                      </div>
                      <div className="bg-[#1A211C] border border-[#3A473E] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#9BAE9C] uppercase">Conflicts</span>
                        <p className="text-sm font-bold text-rose-400">
                          {restoreValidation.summary.countsPerStore.conflicts}
                        </p>
                      </div>
                      <div className="bg-[#1A211C] border border-[#3A473E] rounded-lg p-2 text-center">
                        <span className="text-[10px] text-[#9BAE9C] uppercase">App State</span>
                        <p className="text-sm font-bold text-[#F6F3EA]">
                          {restoreValidation.summary.countsPerStore.app_state}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {restoreValidation.warnings.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800 text-xs text-amber-200 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-amber-300">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Restoration Notices</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-200/90">
                        {restoreValidation.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Restore Result Message */}
                  {restoreResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                        restoreResult.success
                          ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/40 border-rose-800 text-rose-300'
                      }`}
                    >
                      {restoreResult.success ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      )}
                      <span>
                        {restoreResult.success
                          ? `Restoration successful! Restored ${restoreResult.totalRecords} records into ${restoreResult.targetDatabaseName}.`
                          : restoreResult.error}
                      </span>
                    </div>
                  )}

                  {/* Explicit Confirmation Checkbox */}
                  {!restoreResult?.success && (
                    <div className="bg-rose-950/20 border border-rose-900/60 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          id="confirm-replace-checkbox"
                          checked={hasConfirmedReplace}
                          onChange={(e) => setHasConfirmedReplace(e.target.checked)}
                          disabled={isRestoring}
                          className="mt-0.5 rounded border-rose-700 bg-[#1A211C] text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                        <label htmlFor="confirm-replace-checkbox" className="text-xs text-rose-200 cursor-pointer select-none">
                          <strong className="text-rose-300">I confirm replacement:</strong> I understand that restoring this backup will replace existing local data in workspace <span className="font-mono text-white">{restoreValidation.summary.targetWorkspaceId}</span>. Live credentials and active session will be protected.
                        </label>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#3A473E] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setRestoreResult(null);
                  setRestoreValidation(null);
                }}
                disabled={isRestoring}
                className="btn-interactive px-4 py-2 rounded-xl text-xs font-semibold text-[#F6F3EA] hover:text-white bg-[#2B352E] hover:bg-[#344038] transition cursor-pointer disabled:opacity-50 border border-[#3A473E]"
              >
                {restoreResult?.success ? 'Close' : 'Cancel'}
              </button>

              {restoreValidation?.isValid && !restoreResult?.success && (
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  disabled={isRestoring || !hasConfirmedReplace}
                  className="btn-interactive flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer shadow-md shadow-rose-950/50"
                >
                  {isRestoring ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Restoring Database...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Confirm & Restore Workspace</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
