export interface OperatorUser {
  id: string;
  email: string;
  fullName: string;
  schoolId: string;
  schoolName: string;
  role: 'Computer Operator' | 'Admin';
}

export interface AuthSession {
  user: OperatorUser;
  token: string;
  expiresAt: number; // millisecond timestamp
  createdAt: number;
  lastActiveAt: number;
  isTrustedOffline: boolean; // if offline, can proceed locally
}
