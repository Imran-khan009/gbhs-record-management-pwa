import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { SyncBadge } from './SyncBadge';
import { PWAInstallButton } from './PWAInstallButton';
import { getWorkspacePermissions } from '../../services/permissionService';
import { getCustomLogoUrl, saveCustomLogoUrl } from '../../services/logoService';
import { useSchoolProfile } from '../../services/schoolProfileService';
import { useTheme } from '../../context/ThemeContext';
import {
  School,
  Sliders,
  WifiOff,
  UserCheck,
  Sun,
  Moon,
  Menu,
  LogOut,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'students'
  | 'attendance'
  | 'teaching'
  | 'practical'
  | 'absentee'
  | 'reports'
  | 'import'
  | 'sync'
  | 'tests'
  | 'settings';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSyncDetails: () => void;
  onLogoutClick: () => void;
  onOpenSettings: () => void;
  onToggleMobileNav?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSyncDetails,
  onLogoutClick,
  onOpenSettings,
  onToggleMobileNav,
}) => {
  const { session } = useAuth();
  const isOnline = useOnlineStatus();
  const permissions = getWorkspacePermissions(session?.user);
  const { profile, updateProfile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);
  const { isDark, toggleTheme } = useTheme();

  const [logoSrc, setLogoSrc] = useState<string>(() => profile.logoUrl || getCustomLogoUrl());
  const [logoFailed, setLogoFailed] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile.logoUrl) {
      setLogoSrc(profile.logoUrl);
      setLogoFailed(false);
    }
  }, [profile.logoUrl]);

  useEffect(() => {
    const handleLogoChanged = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setLogoSrc(customEvent.detail || getCustomLogoUrl());
      setLogoFailed(false);
    };
    window.addEventListener('gbhs_logo_changed', handleLogoChanged);
    return () => window.removeEventListener('gbhs_logo_changed', handleLogoChanged);
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file (JPG, PNG, WebP).');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result as string;
        if (result) {
          saveCustomLogoUrl(result);
          setLogoSrc(result);
          setLogoFailed(false);
          await updateProfile({ logoUrl: result }, session?.user?.email);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#202822]/95 dark:bg-[#202822]/95 border-b border-[#3D4A41] text-[#F6F3EA] backdrop-blur-md transition-colors duration-150">
      {/* Top Banner if Offline */}
      {!isOnline && (
        <div className="bg-[#2B352E] text-amber-300 border-b border-amber-600/40 px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Offline Mode Active — Changes are securely saved to local IndexedDB and queued in Outbox.</span>
        </div>
      )}

      <div className="w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          {/* Left Area: Mobile Menu Trigger + Brand & School Logo */}
          <div className="flex items-center gap-2 sm:gap-3.5 shrink-0 pr-2 sm:pr-4 lg:pr-6 border-r border-[#3D4A41]/80">
            {/* Mobile Sidebar Hamburger Toggle (min 44px touch target) */}
            {onToggleMobileNav && (
              <button
                type="button"
                onClick={onToggleMobileNav}
                className="p-2.5 -ml-1.5 rounded-xl text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#2B352E] active:bg-[#344038] lg:hidden cursor-pointer shrink-0 transition-colors duration-150"
                aria-label="Toggle navigation menu"
                title="Open Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleLogoUpload}
              accept="image/*"
              className="hidden"
              aria-label="Upload custom school logo"
            />

            {/* Circular School Logo (40x40px) */}
            <div
              onClick={() => permissions.isOwner && fileInputRef.current?.click()}
              title={permissions.isOwner ? `School Emblem - ${profile.schoolName} (Click to change/upload logo)` : profile.schoolName}
              className={`relative w-10 h-10 rounded-full overflow-hidden border-2 border-[#3D4A41] ring-2 ring-[#D97745]/25 bg-[#2B352E] flex items-center justify-center shrink-0 group transition-all duration-150 ${
                permissions.isOwner ? 'cursor-pointer hover:border-[#D97745] hover:ring-[#D97745]/50' : ''
              }`}
            >
              {!logoFailed ? (
                <img
                  src={logoSrc}
                  alt={`${profile.schoolName} Logo`}
                  className="w-full h-full object-cover rounded-full transition-transform duration-200 group-hover:scale-105"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <div className="w-full h-full bg-[#2B352E] flex items-center justify-center text-[#D97745]">
                  <School className="w-5 h-5" />
                </div>
              )}
              {permissions.isOwner && (
                <div className="absolute inset-0 bg-[#202822]/75 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center text-[9px] font-bold text-[#D97745] rounded-full backdrop-blur-xs">
                  Edit
                </div>
              )}
            </div>

            {/* Typography & Hierarchy: Title & Subtitle neatly stacked */}
            <div className="flex flex-col justify-center select-none min-w-0">
              <span className="font-extrabold text-sm sm:text-base text-[#F6F3EA] tracking-wide uppercase leading-tight whitespace-nowrap truncate max-w-[170px] xs:max-w-[220px] sm:max-w-none">
                {profile.schoolShortName || profile.schoolName}
              </span>
              <p className="text-[11px] text-[#9BAE9C] font-medium tracking-normal whitespace-nowrap mt-0.5 leading-tight hidden xs:block">
                {profile.district}{' '}
                <span className="text-[#54665A]">•</span>{' '}
                <span>{profile.consoleTitle || 'Computer Operator Console'}</span>{' '}
                <span className="text-[#54665A]">•</span>{' '}
                <span className="text-[#D97745] font-semibold">
                  {profile.classes && profile.classes.length > 0
                    ? profile.classes.length <= 4
                      ? profile.classes.map((c) => c.replace(/^Class\s*/i, '')).every((n) => /^\d+$/.test(n))
                        ? `Classes ${profile.classes.map((c) => c.replace(/^Class\s*/i, '')).join(', ')}`
                        : profile.classes.join(', ')
                      : `${profile.classes.length} Active Classes`
                    : 'All Classes'}
                </span>
              </p>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right Area: Sync Badge, PWA Install, Theme, Settings, Operator, Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 pl-2 sm:pl-3 border-l border-[#3D4A41]/80">
            <SyncBadge onClick={permissions.isOwner && !permissions.isStaff ? onOpenSyncDetails : undefined} />
            <PWAInstallButton />

            {/* Theme Switcher Toggle Button (Rotates smoothly on click) */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl text-[#9BAE9C] hover:text-[#D97745] hover:bg-[#2B352E] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-150 cursor-pointer flex items-center justify-center relative group min-w-[36px] min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745]"
              title={isDark ? "Switch to Warm Ivory Light Mode" : "Switch to Charcoal Dark Mode"}
              aria-label={isDark ? "Switch to Warm Ivory Light Mode" : "Switch to Charcoal Dark Mode"}
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-[#D97745] group-hover:rotate-45 transition-transform duration-200" />
              ) : (
                <Moon className="w-4 h-4 text-[#202822] group-hover:-rotate-12 transition-transform duration-200" />
              )}
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="group p-2 rounded-xl text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#2B352E] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-150 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745]"
              title={permissions.isMasterOwner ? "Supabase Cloud Database & Settings" : "Workspace & Account Settings"}
              aria-label="Settings"
            >
              <Sliders className="w-4 h-4 transition-transform duration-150 group-hover:rotate-45" />
            </button>

            {/* Operator Details (Hidden on small mobile, visible on desktop) */}
            {session && (
              <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-[#3D4A41]/80 text-xs shrink-0">
                <div
                  className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${
                    permissions.tier === 'master_owner'
                      ? 'bg-[#D97745]/15 border-[#D97745]/40 text-[#D97745]'
                      : permissions.tier === 'approved_staff'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-[#9BAE9C]/15 border-[#9BAE9C]/40 text-[#9BAE9C]'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
                <div className="leading-tight">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-[#F6F3EA] max-w-[120px] truncate text-xs">{session.user.fullName}</p>
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                        permissions.tier === 'master_owner'
                          ? 'bg-[#D97745]/20 text-[#E48B5D] border-[#D97745]/40'
                          : permissions.tier === 'approved_staff'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-[#9BAE9C]/20 text-[#B4C4B5] border-[#9BAE9C]/40'
                      }`}
                    >
                      {permissions.tier === 'master_owner'
                        ? 'Master Owner'
                        : permissions.tier === 'approved_staff'
                        ? 'Staff (Read-Only)'
                        : 'Personal User'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#9BAE9C] truncate max-w-[130px] mt-0.5">{session.user.email}</p>
                </div>
              </div>
            )}

            {/* Logout Button */}
            <button
              type="button"
              onClick={onLogoutClick}
              className="p-2 rounded-xl text-[#9BAE9C] hover:text-rose-400 hover:bg-rose-950/30 active:bg-rose-950/50 transition-colors duration-150 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="Logout Operator"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
