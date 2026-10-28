import {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  deleteWorkspaceDatabase,
  clearAllCurrentDatabaseStores,
  getAllStudents,
  getAllAttendanceRecords,
  getOutboxOperations,
} from './db';
import {
  getSupabaseConfig,
  updateSupabaseConfig,
  setNetworkSimulation,
  setMockCloudOnly,
  resetMockCloudStorage,
  isMockCloudOnly,
  SupabaseConfig,
} from './supabase';
import { syncEngine } from './syncEngine';
import { AuthSession } from '../types/auth';
import { Student, AttendanceRecord } from '../types/student';
import { OutboxOperation } from '../types/sync';

export interface SandboxSnapshot {
  originalWorkspaceId: string | null;
  originalSimulationMode: SupabaseConfig['simulationMode'];
  originalConfig: SupabaseConfig;
  originalSession: AuthSession | null;
  originalOnline: boolean;
  sandboxWorkspaceId: string;
  preTestRealStudentsCount: number;
  preTestRealAttendanceCount: number;
  preTestRealOutboxCount: number;
  preTestRealStudentIds: string[];
  preTestRealOutboxOpIds: string[];
}

export interface TestSandboxContext {
  sandboxWorkspaceId: string;
  snapshot: SandboxSnapshot;
  cleanup: () => Promise<void>;
  restore: () => Promise<void>;
  cleanupAndRestore: () => Promise<void>;
  verifyRealDataUntouched: () => Promise<{ ok: boolean; reason?: string }>;
}

/**
 * Initializes a fully isolated sandbox environment for compliance testing.
 * - Backs up active workspace ID and database contents
 * - Switches active workspace to an isolated temporary IndexedDB workspace
 * - Enforces mock-only cloud mode (blocking all production Supabase network calls)
 * - Sets a safe sandbox auth session
 */
export async function initTestSandbox(testName?: string): Promise<TestSandboxContext> {
  // 1. Snapshot original environment & real data
  const originalWorkspaceId = getActiveWorkspaceId();
  const originalConfig: SupabaseConfig = { ...getSupabaseConfig() };
  const originalSimulationMode = originalConfig.simulationMode;
  const originalSession = syncEngine.getSession();
  const originalOnline = (syncEngine as any).isOnline ?? true;

  // Snapshot real workspace records
  let preTestRealStudents: Student[] = [];
  let preTestRealAttendance: AttendanceRecord[] = [];
  let preTestRealOutbox: OutboxOperation[] = [];

  try {
    preTestRealStudents = await getAllStudents();
    preTestRealAttendance = await getAllAttendanceRecords();
    preTestRealOutbox = await getOutboxOperations();
  } catch (err) {
    console.warn('[TestSandbox] Could not read real workspace snapshot prior to test:', err);
  }

  const preTestRealStudentIds = preTestRealStudents.map((s) => s.id).sort();
  const preTestRealOutboxOpIds = preTestRealOutbox.map((o) => o.opId).sort();

  // 2. Generate isolated sandbox workspace ID
  const safeSlug = (testName || 'test').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  const sandboxWorkspaceId = `test_sandbox_${safeSlug}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 3. Switch active workspace to sandbox
  setActiveWorkspaceId(sandboxWorkspaceId);

  // 4. Force Mock-Only cloud mode (zero production Supabase requests)
  setMockCloudOnly(true);
  resetMockCloudStorage();
  setNetworkSimulation('none');

  // 5. Setup safe sandbox auth session for sync engine
  const sandboxSession: AuthSession = {
    token: `sandbox-test-token-${Date.now()}`,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    isTrustedOffline: true,
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'test@gbhs.edu.pk',
      fullName: 'Sandbox Compliance Tester',
      schoolId: 'GBHS-MAIN',
      schoolName: 'Govt Boys High School Jam Yousuf Colony',
      role: 'Computer Operator',
      workspaceOwnerId: '00000000-0000-0000-0000-000000000001',
      workspaceRole: 'owner',
      isApproved: true,
    },
  };
  syncEngine.setSession(sandboxSession);
  syncEngine.setOnlineStatus(true);

  const snapshot: SandboxSnapshot = {
    originalWorkspaceId,
    originalSimulationMode,
    originalConfig,
    originalSession,
    originalOnline,
    sandboxWorkspaceId,
    preTestRealStudentsCount: preTestRealStudents.length,
    preTestRealAttendanceCount: preTestRealAttendance.length,
    preTestRealOutboxCount: preTestRealOutbox.length,
    preTestRealStudentIds,
    preTestRealOutboxOpIds,
  };

  const cleanup = async () => {
    try {
      // Clear all records from sandbox DB
      await clearAllCurrentDatabaseStores();
    } catch (e) {
      console.warn('[TestSandbox] Error clearing sandbox stores:', e);
    }

    try {
      // Delete temporary sandbox database
      await deleteWorkspaceDatabase(sandboxWorkspaceId);
    } catch (e) {
      console.warn('[TestSandbox] Error deleting sandbox database:', e);
    }

    try {
      // Reset mock cloud store
      resetMockCloudStorage();
    } catch (e) {
      console.warn('[TestSandbox] Error resetting mock cloud store:', e);
    }
  };

  const restore = async () => {
    // 1. Restore active workspace ID
    setActiveWorkspaceId(originalWorkspaceId);

    // 2. Disable forced mock cloud mode
    setMockCloudOnly(false);

    // 3. Restore original simulation mode and config
    setNetworkSimulation(originalSimulationMode);
    try {
      await updateSupabaseConfig(originalConfig);
    } catch (e) {
      console.warn('[TestSandbox] Error restoring supabase config:', e);
    }

    // 4. Restore original sync engine session & online status
    syncEngine.setSession(originalSession);
    syncEngine.setOnlineStatus(originalOnline);
  };

  const cleanupAndRestore = async () => {
    try {
      await cleanup();
    } catch (cleanupErr) {
      console.warn('[TestSandbox] Cleanup encountered warning:', cleanupErr);
    } finally {
      // ALWAYS guaranteed to execute even if cleanup throws
      await restore();
    }
  };

  const verifyRealDataUntouched = async (): Promise<{ ok: boolean; reason?: string }> => {
    // Ensure we are inspecting the real workspace
    const currentWs = getActiveWorkspaceId();
    if (currentWs !== originalWorkspaceId) {
      setActiveWorkspaceId(originalWorkspaceId);
    }

    try {
      const currentStudents = await getAllStudents();
      const currentAttendance = await getAllAttendanceRecords();
      const currentOutbox = await getOutboxOperations();

      if (currentStudents.length !== snapshot.preTestRealStudentsCount) {
        return {
          ok: false,
          reason: `Student count mismatch: expected ${snapshot.preTestRealStudentsCount}, found ${currentStudents.length}`,
        };
      }

      const currentStudentIds = currentStudents.map((s) => s.id).sort();
      if (JSON.stringify(currentStudentIds) !== JSON.stringify(snapshot.preTestRealStudentIds)) {
        return {
          ok: false,
          reason: 'Real student ID set was modified during test run.',
        };
      }

      if (currentAttendance.length !== snapshot.preTestRealAttendanceCount) {
        return {
          ok: false,
          reason: `Attendance record count mismatch: expected ${snapshot.preTestRealAttendanceCount}, found ${currentAttendance.length}`,
        };
      }

      if (currentOutbox.length !== snapshot.preTestRealOutboxCount) {
        return {
          ok: false,
          reason: `Outbox operation count mismatch: expected ${snapshot.preTestRealOutboxCount}, found ${currentOutbox.length}`,
        };
      }

      const currentOutboxIds = currentOutbox.map((o) => o.opId).sort();
      if (JSON.stringify(currentOutboxIds) !== JSON.stringify(snapshot.preTestRealOutboxOpIds)) {
        return {
          ok: false,
          reason: 'Real Outbox operation set was modified or contaminated during test run.',
        };
      }

      return { ok: true };
    } finally {
      // Restore workspace pointer to whatever it was before verification
      setActiveWorkspaceId(currentWs);
    }
  };

  return {
    sandboxWorkspaceId,
    snapshot,
    cleanup,
    restore,
    cleanupAndRestore,
    verifyRealDataUntouched,
  };
}

/**
 * Executes a test function inside an isolated sandbox with guaranteed cleanup & restoration.
 */
export async function runInSandbox<T>(
  testName: string,
  testFn: (sandbox: TestSandboxContext) => Promise<T>
): Promise<T> {
  const sandbox = await initTestSandbox(testName);
  try {
    return await testFn(sandbox);
  } finally {
    await sandbox.cleanupAndRestore();
  }
}
