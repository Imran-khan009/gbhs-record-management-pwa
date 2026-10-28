import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getWorkspacePermissions } from '../../services/permissionService';
import { useSchoolProfile } from '../../services/schoolProfileService';
import { ActiveTab } from './Navbar';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  BookOpen,
  Award,
  UserX,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  FlaskConical,
  Sliders,
  ChevronLeft,
  ChevronRight,
  X,
  School,
  WifiOff,
  UserCheck,
  LogOut,
  Pin,
  PinOff,
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSyncDetails?: () => void;
  onLogoutClick?: () => void;
  onOpenSettings?: () => void;
  onOpenReports?: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  isPinned?: boolean;
  onPinChange?: (pinned: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenReports,
  onOpenSettings,
  onOpenSyncDetails,
  onLogoutClick,
  isMobileOpen,
  setIsMobileOpen,
  isPinned: externalIsPinned,
  onPinChange,
}) => {
  const { session } = useAuth();
  const isOnline = useOnlineStatus();
  const permissions = getWorkspacePermissions(session?.user);
  const { profile } = useSchoolProfile(session?.user?.workspaceOwnerId || session?.user?.id);

  // Desktop Pinned State: whether the user explicitly keeps the sidebar expanded
  const [internalIsPinned, setInternalIsPinned] = useState<boolean>(() => {
    try {
      const savedPinned = localStorage.getItem('gbhs_sidebar_pinned');
      if (savedPinned !== null) {
        return savedPinned === 'true';
      }
      const savedCollapsed = localStorage.getItem('gbhs_sidebar_collapsed');
      return savedCollapsed === 'false';
    } catch {
      return false;
    }
  });

  const isPinned = externalIsPinned !== undefined ? externalIsPinned : internalIsPinned;

  // Transient hover expansion state for desktop
  const [isHovered, setIsHovered] = useState<boolean>(false);

  // Accessible floating tooltip state for collapsed rail mode
  const [hoveredTooltip, setHoveredTooltip] = useState<{
    id: string;
    label: string;
    badge?: string;
    top: number;
  } | null>(null);

  // Collapsed state strictly for desktop (saved in localStorage for desktop rail persistence)
  const isCollapsed = isPinned ? false : !isHovered;

  const sidebarRef = useRef<HTMLElement | null>(null);
  const navContainerRef = useRef<HTMLDivElement | null>(null);
  const navItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Track active indicator geometry relative to the nav container
  const [indicatorStyle, setIndicatorStyle] = useState<{
    top: number;
    height: number;
    opacity: number;
  }>({
    top: 0,
    height: 0,
    opacity: 0,
  });

  const updateIndicator = () => {
    const activeEl = navItemRefs.current[activeTab];
    const containerEl = navContainerRef.current;
    if (activeEl && containerEl) {
      const top = activeEl.offsetTop;
      const height = activeEl.offsetHeight;
      setIndicatorStyle({
        top,
        height,
        opacity: 1,
      });
    } else {
      setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  };

  useEffect(() => {
    updateIndicator();
    // Re-check after potential layout recalculations (sidebar expand/collapse, drawer toggle, window resize)
    const t1 = setTimeout(updateIndicator, 40);
    const t2 = setTimeout(updateIndicator, 150);
    const t3 = setTimeout(updateIndicator, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [activeTab, isCollapsed, isMobileOpen]);

  useEffect(() => {
    const handleResize = () => updateIndicator();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab, isCollapsed]);

  // Keep indicator aligned with container resizes during smooth width transitions
  useEffect(() => {
    const containerEl = navContainerRef.current;
    if (!containerEl) return;
    const observer = new ResizeObserver(() => {
      updateIndicator();
    });
    observer.observe(containerEl);
    return () => observer.disconnect();
  }, [activeTab, isCollapsed]);

  // Dismiss transient hover expansion when clicking outside on the main page (without blocking clicks)
  useEffect(() => {
    if (!isHovered || isPinned) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setIsHovered(false);
        setHoveredTooltip(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isHovered, isPinned]);

  const toggleCollapsed = () => {
    const nextPinned = !isPinned;
    if (externalIsPinned === undefined) {
      setInternalIsPinned(nextPinned);
    }
    onPinChange?.(nextPinned);
    try {
      localStorage.setItem('gbhs_sidebar_pinned', String(nextPinned));
      localStorage.setItem('gbhs_sidebar_collapsed', String(!nextPinned));
    } catch {}
  };

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    badge?: string;
    icon: React.FC<{ className?: string }>;
    visible: boolean;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: 'students',
      label: 'Student Management',
      badge: 'M1',
      icon: Users,
      visible: true,
    },
    {
      id: 'attendance',
      label: 'Daily Attendance',
      badge: 'M2',
      icon: CalendarCheck,
      visible: true,
    },
    {
      id: 'teaching',
      label: 'Teaching Log',
      badge: 'M3',
      icon: BookOpen,
      visible: true,
    },
    {
      id: 'practical',
      label: 'Practical Tracker',
      badge: 'M4',
      icon: Award,
      visible: true,
    },
    {
      id: 'absentee',
      label: 'Absentee Follow-up',
      badge: 'M5',
      icon: UserX,
      visible: true,
    },
    {
      id: 'reports',
      label: 'Reports',
      badge: 'RPT',
      icon: FileText,
      visible: true,
    },
    {
      id: 'import',
      label: 'Excel Importer',
      icon: FileSpreadsheet,
      visible: Boolean(permissions.canImport),
    },
    {
      id: 'sync',
      label: 'Sync Center',
      icon: RefreshCw,
      visible: Boolean(permissions.isOwner && !permissions.isStaff),
    },
    {
      id: 'tests',
      label: 'Compliance Test Suite',
      icon: FlaskConical,
      visible: Boolean(permissions.isOwner && !permissions.isStaff),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Sliders,
      visible: true,
    },
  ];

  const handleNavClick = (id: ActiveTab) => {
    if (id === 'reports' && onOpenReports) {
      onOpenReports();
    }
    if (id === 'settings' && onOpenSettings) {
      onOpenSettings();
    }
    if (id === 'sync' && onOpenSyncDetails && permissions.isOwner) {
      onOpenSyncDetails();
    }
    setActiveTab(id);
    setIsMobileOpen(false);
    setHoveredTooltip(null);
  };

  return (
    <>
      {/* Mobile Drawer Backdrop with gentle blur and smooth fade */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#202822]/80 backdrop-blur-xs lg:hidden transition-opacity duration-200 ease-out"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Shell (Fixed Viewport Desktop Rail / Mobile Slide-Over Drawer) */}
      <aside
        ref={sidebarRef}
        onMouseEnter={() => {
          if (!isPinned) {
            setIsHovered(true);
            setHoveredTooltip(null);
          }
        }}
        onMouseLeave={() => {
          if (!isPinned) {
            setIsHovered(false);
            setHoveredTooltip(null);
          }
        }}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#202822] border-r border-[#3D4A41] transition-[width,transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] lg:z-40 shrink-0 select-none ${
          isMobileOpen
            ? 'translate-x-0 w-[280px] max-w-[calc(100vw-56px)] shadow-2xl'
            : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-[68px]' : 'lg:w-60'} ${
          !isPinned && isHovered ? 'lg:shadow-2xl lg:shadow-black/70' : ''
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="h-16 flex items-center justify-between px-3.5 border-b border-[#3D4A41] shrink-0">
          <div
            onClick={() => handleNavClick('dashboard')}
            className={`flex items-center gap-2.5 cursor-pointer group min-w-0 ${
              isCollapsed ? 'lg:justify-center lg:w-full' : ''
            }`}
          >
            {/* School Emblem Crest */}
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-[#3D4A41] bg-[#2B352E] flex items-center justify-center shrink-0 group-hover:border-[#D97745]/60 group-hover:scale-105 active:scale-95 transition-all duration-150">
              {profile.logoUrl ? (
                <img
                  src={profile.logoUrl}
                  alt={profile.schoolShortName || profile.schoolName}
                  className="w-full h-full object-cover rounded-lg"
                  onError={(e) => {
                    (e.currentTarget as any).src = '/custom-logo.jpg';
                  }}
                />
              ) : (
                <div className="w-full h-full bg-[#2B352E] flex items-center justify-center text-[#D97745]">
                  <School className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* School Identity: Always visible on mobile; on desktop: hidden if collapsed */}
            <div
              className={`flex flex-col min-w-0 leading-tight transition-all duration-200 ease-out ${
                isCollapsed ? 'flex lg:hidden' : 'flex'
              } ${isCollapsed ? 'lg:opacity-0 lg:-translate-x-2' : 'lg:opacity-100 lg:translate-x-0'}`}
            >
              <span className="font-bold text-xs text-[#F6F3EA] tracking-wide uppercase truncate">
                {profile.schoolShortName || profile.schoolName}
              </span>
              <span className="text-[10px] text-[#9BAE9C] font-medium truncate">
                RMS Console
              </span>
            </div>
          </div>

          {/* Mobile Drawer Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="p-1.5 rounded-lg text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#2B352E] active:scale-95 lg:hidden cursor-pointer transition-all duration-150 shrink-0"
            aria-label="Close navigation sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Offline Banner Inside Sidebar if Disconnected */}
        {!isOnline && (
          <div className="bg-[#2B352E] border-b border-amber-600/40 px-3.5 py-1.5 flex items-center gap-2 text-[10px] text-amber-300">
            <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />
            <span className={`truncate ${isCollapsed ? 'inline lg:hidden' : 'inline'}`}>
              Offline Mode Active
            </span>
          </div>
        )}

        {/* Primary Navigation Modules List */}
        <div
          ref={navContainerRef}
          className="flex-1 overflow-y-auto no-scrollbar py-2.5 px-2 space-y-1 relative"
        >
          {/* Smooth Sliding Copper Active Module Indicator Pill */}
          <div
            aria-hidden="true"
            className={`absolute left-2 right-2 pointer-events-none rounded-xl bg-[#D97745]/15 border border-[#D97745]/35 shadow-xs transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] z-0 ${
              indicatorStyle.opacity === 0 ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
            style={{
              top: `${indicatorStyle.top}px`,
              height: `${indicatorStyle.height}px`,
            }}
          >
            {/* Copper Accent Line: Always on the left for mobile drawer; on desktop: Left if expanded rail, Right if collapsed rail */}
            <span
              className={`absolute top-2 bottom-2 w-1 bg-[#D97745] shadow-xs shadow-[#D97745]/50 transition-all duration-200 ${
                isCollapsed
                  ? 'left-0 rounded-r lg:left-auto lg:right-0 lg:rounded-l'
                  : 'left-0 rounded-r'
              }`}
            />
          </div>

          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    navItemRefs.current[item.id] = el;
                  }}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  onFocus={(e) => {
                    if (isCollapsed) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredTooltip({
                        id: item.id,
                        label: item.label,
                        badge: item.badge,
                        top: rect.top + rect.height / 2,
                      });
                    }
                  }}
                  onBlur={() => setHoveredTooltip(null)}
                  onMouseEnter={(e) => {
                    if (isCollapsed) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredTooltip({
                        id: item.id,
                        label: item.label,
                        badge: item.badge,
                        top: rect.top + rect.height / 2,
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    if (hoveredTooltip?.id === item.id) {
                      setHoveredTooltip(null);
                    }
                  }}
                  title={item.label}
                  aria-label={item.label}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer group relative z-10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] focus-visible:ring-offset-1 focus-visible:ring-offset-[#202822] ${
                    isCollapsed
                      ? 'lg:justify-center lg:px-2.5 lg:py-2.5 lg:min-h-[40px]'
                      : 'lg:justify-between lg:px-3 lg:py-2.5 lg:min-h-[40px]'
                  } ${
                    isActive
                      ? 'text-[#F6F3EA] font-semibold'
                      : 'text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#2B352E]/60 hover:translate-x-0.5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform duration-200 ease-out ${
                        isActive
                          ? 'scale-110 text-[#D97745] drop-shadow-[0_1px_4px_rgba(217,119,69,0.35)]'
                          : 'scale-100 text-[#9BAE9C] group-hover:scale-110 group-hover:text-[#F6F3EA]'
                      } ${item.id === 'settings' ? 'group-hover:rotate-45' : ''} ${
                        item.id === 'sync' ? 'group-hover:rotate-180 duration-500' : ''
                      } ${item.id === 'tests' ? 'group-hover:rotate-12' : ''}`}
                    />
                    {/* Module Name: Always visible on mobile drawer; on desktop: hidden if collapsed */}
                    <span
                      className={`truncate text-left text-xs font-medium transition-colors duration-150 ${
                        isCollapsed ? 'block lg:hidden' : 'block'
                      } ${
                        isCollapsed
                          ? 'lg:opacity-0 lg:-translate-x-2'
                          : 'lg:opacity-100 lg:translate-x-0'
                      } transition-all duration-200 ease-out ${
                        isActive
                          ? 'text-[#F6F3EA] font-semibold'
                          : 'text-[#9BAE9C] group-hover:text-[#F6F3EA]'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>

                  {/* Module Badge (e.g. M1, M2, M3, RPT): Always visible on mobile drawer; on desktop: hidden if collapsed */}
                  {item.badge && (
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 transition-all duration-150 ${
                        isCollapsed ? 'inline-block lg:hidden' : 'inline-block'
                      } ${
                        isCollapsed
                          ? 'lg:opacity-0 lg:scale-90'
                          : 'lg:opacity-100 lg:scale-100'
                      } ${
                        isActive
                          ? 'bg-[#D97745]/25 text-[#E48B5D] border-[#D97745]/40 shadow-xs'
                          : 'bg-[#2B352E] text-[#9BAE9C] border-[#3D4A41] group-hover:border-[#9BAE9C]/40 group-hover:text-[#F6F3EA]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        {/* Clean Sidebar Footer */}
        <div className="p-2 border-t border-[#3D4A41] shrink-0">
          {/* Mobile Operator Identifier with Role & Logout (Only visible inside slide-over drawer) */}
          {session && (
            <div className="lg:hidden flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#2B352E] border border-[#3D4A41] mb-1.5 text-xs">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-lg bg-[#202822] border border-[#3D4A41] flex items-center justify-center text-[#D97745] shrink-0">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="font-semibold text-[#F6F3EA] truncate">{session.user.fullName || session.user.email}</p>
                  <span className="text-[9px] text-[#9BAE9C] uppercase font-medium">
                    {permissions.tier === 'master_owner' ? 'Master Owner' : permissions.tier === 'approved_staff' ? 'Staff' : 'User'}
                  </span>
                </div>
              </div>
              {onLogoutClick && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileOpen(false);
                    onLogoutClick();
                  }}
                  className="p-1.5 rounded-lg text-[#9BAE9C] hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                  title="Logout Operator"
                  aria-label="Logout Operator"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Desktop Rail Expand / Pin Toggle Control */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:flex w-full py-2 px-2.5 rounded-xl text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#2B352E] active:scale-[0.975] transition-all duration-150 cursor-pointer items-center justify-center text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] group"
            title={
              isPinned
                ? 'Pinned Open (Click to enable auto-collapse on hover)'
                : isCollapsed
                ? 'Auto-Hide Rail (Click to Pin Open)'
                : 'Auto-Hide Active (Click to Pin Open)'
            }
            aria-label={
              isPinned
                ? 'Pinned Open (Click to enable auto-collapse on hover)'
                : isCollapsed
                ? 'Auto-Hide Rail (Click to Pin Open)'
                : 'Auto-Hide Active (Click to Pin Open)'
            }
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 transition-transform duration-200 hover:translate-x-0.5" />
            ) : (
              <div className="flex items-center gap-1.5 w-full justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isPinned ? (
                    <Pin className="w-3.5 h-3.5 text-[#D97745] fill-[#D97745]/30 rotate-45 shrink-0" />
                  ) : (
                    <PinOff className="w-3.5 h-3.5 text-[#9BAE9C] group-hover:text-[#F6F3EA] shrink-0" />
                  )}
                  <span className="text-[11px] text-[#9BAE9C] group-hover:text-[#F6F3EA] font-medium truncate">
                    {isPinned ? 'Pinned Open' : 'Auto-Hide'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[#9BAE9C] bg-[#202822] px-1.5 py-0.5 rounded border border-[#3D4A41] group-hover:border-[#9BAE9C]/40 shrink-0">
                  <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                  <ChevronLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
                </div>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Floating Accessible Tooltip for Collapsed Desktop Rail Mode */}
      {isCollapsed && hoveredTooltip && (
        <div
          role="tooltip"
          className="fixed z-50 pointer-events-none hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2B352E] border border-[#3D4A41] text-[#F6F3EA] text-xs font-semibold shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: '74px',
            top: `${hoveredTooltip.top}px`,
            transform: 'translateY(-50%)',
          }}
        >
          <span>{hoveredTooltip.label}</span>
          {hoveredTooltip.badge && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border bg-[#D97745]/25 text-[#E48B5D] border-[#D97745]/40 shadow-xs">
              {hoveredTooltip.badge}
            </span>
          )}
          <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[#2B352E] border-l border-b border-[#3D4A41]" />
        </div>
      )}
    </>
  );
};


