export type UserWorkspaceRole = 'owner' | 'team_member' | 'user';
export type UserTier = 'master_owner' | 'approved_staff' | 'approved_user' | 'pending_user';

export interface OperatorUser {
  id: string;
  email: string;
  fullName: string;
  schoolId: string;
  schoolName: string;
  role: 'Computer Operator' | 'Admin';
  workspaceRole: UserWorkspaceRole;
  workspaceOwnerId: string;
  isApproved?: boolean;
}

export interface AuthSession {
  user: OperatorUser;
  token: string;
  refreshToken?: string;
  expiresAt: number; // millisecond timestamp
  createdAt: number;
  lastActiveAt: number;
  isTrustedOffline: boolean; // if offline, can proceed locally
}

export interface WorkspaceMember {
  id: string;
  owner_id: string;
  member_email: string;
  member_id?: string;
  access_level: 'read_only' | 'read_write';
  status: 'pending' | 'approved' | 'revoked';
  invited_by: string;
  created_at: string;
  updated_at: string;
}
