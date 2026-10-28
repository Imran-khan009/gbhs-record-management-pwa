import { OperatorUser, UserTier } from '../types/auth';

export interface WorkspacePermissions {
  tier: UserTier;
  isMasterOwner: boolean;
  isOwner: boolean;
  isStaff: boolean;
  isReadOnly: boolean;
  isPending: boolean;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canImport: boolean;
  canExport: boolean;
  canChangeSettings: boolean;
  canManageUsers: boolean;
  canViewSupabaseCredentials: boolean;
}

/**
 * Verify whether an email belongs to the Master Owner (Engr. Imran Tareen).
 * Recognizes both engrimrantareen@gmail.com and s.engrimrantareen@gmail.com.
 */
export function isMasterOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean === 's.engrimrantareen@gmail.com' || clean === 'engrimrantareen@gmail.com';
}

/**
 * Compute effective workspace permissions for the given operator user according to
 * the strict 3-Tier Role-Based Access Control (RBAC) architecture:
 *
 * 1. Master Owner Role (s.engrimrantareen@gmail.com):
 *    - Absolute and full control over all system configurations, database settings, and Supabase credentials.
 *    - Only the Master Owner can view the Supabase configuration card and manage/approve or block user registrations and staff access requests.
 *
 * 2. Approved Staff Role (workspaceRole: 'team_member'):
 *    - Staff members can view system records and export data to Excel or PDF.
 *    - RESTRICTIONS FOR STAFF: Staff must NOT be allowed to edit records, delete records, or access any Supabase database settings/credentials.
 *      Hide all Edit and Delete buttons/actions for staff accounts. Hide Supabase management cards completely for staff.
 *
 * 3. New / Personal Users:
 *    - When a new user signs up or logs in for the first time, their account is AUTOMATICALLY approved as an 'approved_user' (Personal User) with full access to their own isolated workspace.
 *    - Approved personal users have full manage/edit/delete access over their own personal data/workspace, and their accounts remain isolated from master settings.
 *    - The pending screen gate is completely removed/bypassed so no user ever gets stuck waiting for manual approval.
 */
export function getWorkspacePermissions(user?: OperatorUser | null): WorkspacePermissions {
  // If user is absent or unauthenticated
  if (!user) {
    return {
      tier: 'pending_user',
      isMasterOwner: false,
      isOwner: false,
      isStaff: false,
      isReadOnly: true,
      isPending: false,
      canView: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
      canImport: false,
      canExport: false,
      canChangeSettings: false,
      canManageUsers: false,
      canViewSupabaseCredentials: false,
    };
  }

  const isMasterOwner = isMasterOwnerEmail(user.email);
  if (!isMasterOwner && user.isApproved === false) {
    return {
      tier: 'pending_user',
      isMasterOwner: false,
      isOwner: false,
      isStaff: false,
      isReadOnly: true,
      isPending: true,
      canView: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
      canImport: false,
      canExport: false,
      canChangeSettings: false,
      canManageUsers: false,
      canViewSupabaseCredentials: false,
    };
  }

  const isTeamMember = Boolean(user.workspaceRole === 'team_member') && !isMasterOwner;
  const isCustomOwner = Boolean(user.workspaceRole === 'owner') && !isMasterOwner;

  // 1. Master Owner (s.engrimrantareen@gmail.com / engrimrantareen@gmail.com)
  if (isMasterOwner) {
    return {
      tier: 'master_owner',
      isMasterOwner: true,
      isOwner: true,
      isStaff: false,
      isReadOnly: false,
      isPending: false,
      canView: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
      canImport: true,
      canExport: true,
      canChangeSettings: true,
      canManageUsers: true,
      canViewSupabaseCredentials: true,
    };
  }

  // 2. Approved Staff Role
  if (isTeamMember) {
    return {
      tier: 'approved_staff',
      isMasterOwner: false,
      isOwner: false,
      isStaff: true,
      isReadOnly: true,
      isPending: false,
      canView: true,
      canAdd: false,
      canEdit: false,
      canDelete: false,
      canImport: false,
      canExport: true, // Staff can view system records and export data to Excel or PDF
      canChangeSettings: false,
      canManageUsers: false,
      canViewSupabaseCredentials: false,
    };
  }

  // 3. Custom / Named Workspace Owner (e.g. principal or dedicated admin)
  if (isCustomOwner) {
    return {
      tier: 'master_owner',
      isMasterOwner: false,
      isOwner: true,
      isStaff: false,
      isReadOnly: false,
      isPending: false,
      canView: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
      canImport: true,
      canExport: true,
      canChangeSettings: true,
      canManageUsers: true,
      canViewSupabaseCredentials: false,
    };
  }

  // 4. Approved Personal User (All new registrations & personal logins auto-approved)
  return {
    tier: 'approved_user',
    isMasterOwner: false,
    isOwner: true, // Full control over personal workspace
    isStaff: false,
    isReadOnly: false,
    isPending: false,
    canView: true,
    canAdd: true,
    canEdit: true,
    canDelete: true,
    canImport: true,
    canExport: true,
    canChangeSettings: false, // Isolated from master settings
    canManageUsers: false, // Isolated from master user management
    canViewSupabaseCredentials: false, // Supabase master credentials card completely hidden
  };
}


