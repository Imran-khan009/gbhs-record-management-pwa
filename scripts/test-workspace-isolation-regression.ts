import 'fake-indexeddb/auto';
import {
  getDB,
  closeDB,
  LEGACY_DB_NAME,
  setActiveWorkspaceId,
  getActiveWorkspaceId,
  getActiveDatabaseName,
  getWorkspaceDatabaseName,
  clearWorkspaceCachedState,
  inspectLegacyRecords,
  linkAndMigrateLegacyRecordsToWorkspace,
  getAllStudents,
  getStudentsByClass,
  getStudentById,
  findStudentByAdmissionNo,
  saveStudentLocally,
  deleteStudentLocally,
  bulkSaveStudentsLocally,
  clearAllStudentsLocally,
  getAllAttendanceRecords,
  getAttendanceByDateAndClass,
  saveAttendanceLocally,
  bulkSaveAttendanceLocally,
  clearAllAttendanceLocally,
  getAllTeachingLogs,
  saveTeachingLogLocally,
  getAllPracticalProgress,
  savePracticalProgressLocally,
  getAllAbsenteeFollowups,
  saveAbsenteeFollowupLocally,
  enqueueOutboxOperation,
  getOutboxOperations,
  getPendingOutboxOperations,
  getAllConflicts,
  saveConflict,
  setAppState,
  getAppState,
  removeAppState,
} from '../src/services/db';
import {
  getSchoolProfile,
  saveSchoolProfile,
  resetSchoolProfile,
  DEFAULT_SCHOOL_PROFILE,
} from '../src/services/schoolProfileService';
import {
  getCustomLogoUrl,
  saveCustomLogoUrl,
  resetCustomLogo,
  DEFAULT_LOGO_URL,
} from '../src/services/logoService';
import { syncEngine } from '../src/services/syncEngine';
import { Student, AttendanceRecord } from '../src/types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../src/types/modules';
import { OutboxOperation } from '../src/types/sync';
import { AuthSession } from '../src/types/auth';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    testsPassed++;
    console.log(`[PASS] ${testName}: ${detail}`);
  } else {
    testsFailed++;
    console.error(`[FAIL] ${testName}: ${detail}`);
  }
}

// Mock localStorage for node/bun environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] || null,
    length: store.size,
  } as any;
}

// Mock window CustomEvent dispatch if not present
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('GBHS REGRESSION TEST: WORKSPACE ISOLATION & LEAKAGE PREVENTION');
  console.log('================================================================\n');

  const OWNER_WS_ID = 'e4a3515a-2556-47ac-a193-9825fda2c7d6';
  const NEW_USER_WS_ID = '70d930d9-0095-4ba9-a2d9-530ab152c5a7';

  try {
    // =========================================================================
    // TEST 1: FAIL-CLOSED FOR WORKSPACE READS/WRITES WHEN UNAUTHENTICATED
    // =========================================================================
    console.log('--- Test 1: Fail Closed When No Authenticated Workspace Is Active ---');
    await clearWorkspaceCachedState();
    assert(getActiveWorkspaceId() === null, 'Test 1.1', 'Active workspace ID is null');

    // getActiveDatabaseName must throw
    let getDbNameThrew = false;
    try {
      getActiveDatabaseName();
    } catch {
      getDbNameThrew = true;
    }
    assert(getDbNameThrew, 'Test 1.2', 'getActiveDatabaseName() throws error when unauthenticated');

    // Reads must return empty/undefined without querying or touching gbhs_operator_db_v1
    const unauthStudents = await getAllStudents();
    assert(Array.isArray(unauthStudents) && unauthStudents.length === 0, 'Test 1.3', 'getAllStudents() returns []');

    const unauthClassStudents = await getStudentsByClass('Class 7');
    assert(Array.isArray(unauthClassStudents) && unauthClassStudents.length === 0, 'Test 1.4', 'getStudentsByClass() returns []');

    const unauthStudentById = await getStudentById('test-id');
    assert(unauthStudentById === undefined, 'Test 1.5', 'getStudentById() returns undefined');

    const unauthAdmStudent = await findStudentByAdmissionNo('GBHS-001');
    assert(unauthAdmStudent === undefined, 'Test 1.6', 'findStudentByAdmissionNo() returns undefined');

    const unauthAtt = await getAllAttendanceRecords();
    assert(Array.isArray(unauthAtt) && unauthAtt.length === 0, 'Test 1.7', 'getAllAttendanceRecords() returns []');

    const unauthTeachingLogs = await getAllTeachingLogs();
    assert(Array.isArray(unauthTeachingLogs) && unauthTeachingLogs.length === 0, 'Test 1.8', 'getAllTeachingLogs() returns []');

    const unauthPractical = await getAllPracticalProgress();
    assert(Array.isArray(unauthPractical) && unauthPractical.length === 0, 'Test 1.9', 'getAllPracticalProgress() returns []');

    const unauthFollowups = await getAllAbsenteeFollowups();
    assert(Array.isArray(unauthFollowups) && unauthFollowups.length === 0, 'Test 1.10', 'getAllAbsenteeFollowups() returns []');

    const unauthOutbox = await getOutboxOperations();
    assert(Array.isArray(unauthOutbox) && unauthOutbox.length === 0, 'Test 1.11', 'getOutboxOperations() returns []');

    const unauthConflicts = await getAllConflicts();
    assert(Array.isArray(unauthConflicts) && unauthConflicts.length === 0, 'Test 1.12', 'getAllConflicts() returns []');

    // Writes must throw without an active workspace
    const dummyStudent: Student = {
      id: 'dummy-1',
      admissionNo: 'D-001',
      rollNo: '1',
      name: 'Unauth Student',
      fatherName: 'Father',
      class: 'Class 7',
      section: 'A',
      phone: '0300-0000000',
      dob: '2012-01-01',
      address: 'Address',
      status: 'Active',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      createdBy: 'test@example.com',
    };

    let saveStudentThrew = false;
    try {
      await saveStudentLocally(dummyStudent);
    } catch {
      saveStudentThrew = true;
    }
    assert(saveStudentThrew, 'Test 1.13', 'saveStudentLocally() throws when unauthenticated');

    let saveAttendanceThrew = false;
    try {
      await saveAttendanceLocally({
        id: 'att-1',
        studentId: 'dummy-1',
        studentName: 'Unauth Student',
        rollNo: '1',
        class: 'Class 7',
        section: 'A',
        date: '2026-10-24',
        status: 'Present',
        version: 1,
        schoolId: 'GBHS-MAIN',
        markedBy: 'test@example.com',
        updatedAt: new Date().toISOString(),
      });
    } catch {
      saveAttendanceThrew = true;
    }
    assert(saveAttendanceThrew, 'Test 1.14', 'saveAttendanceLocally() throws when unauthenticated');

    let outboxThrew = false;
    try {
      await enqueueOutboxOperation({
        opId: 'op-1',
        entityType: 'student',
        entityId: 'dummy-1',
        operationType: 'CREATE',
        payload: dummyStudent,
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
        version: 1,
        userEmail: 'test@example.com',
      });
    } catch {
      outboxThrew = true;
    }
    assert(outboxThrew, 'Test 1.15', 'enqueueOutboxOperation() throws when unauthenticated');

    let workspaceAppStateThrew = false;
    try {
      await setAppState('workspace_private_key', 'some_secret');
    } catch {
      workspaceAppStateThrew = true;
    }
    assert(workspaceAppStateThrew, 'Test 1.16', 'setAppState() throws for non-global key when unauthenticated');

    const workspaceAppStateVal = await getAppState('workspace_private_key');
    assert(workspaceAppStateVal === null, 'Test 1.17', 'getAppState() returns null for non-global key when unauthenticated');

    // =========================================================================
    // TEST 2: PRESERVE EXPLICITLY SCOPED LEGACY MIGRATION & GLOBAL APP STATE
    // =========================================================================
    console.log('\n--- Test 2: Preserve Explicitly Scoped Legacy & Global App State ---');

    // Global app state keys work unauthenticated
    await setAppState('gbhs_active_session', { testSession: true });
    const readSession = await getAppState<{ testSession: boolean }>('gbhs_active_session');
    assert(readSession?.testSession === true, 'Test 2.1', 'Global key gbhs_active_session succeeds without workspace');

    await setAppState('supabase_config', { url: 'https://test.supabase.co', key: 'anon-key' });
    const readConfig = await getAppState<{ url: string }>('supabase_config');
    assert(readConfig?.url === 'https://test.supabase.co', 'Test 2.2', 'Global key supabase_config succeeds without workspace');

    // Seed 2 mock records in legacy DB gbhs_operator_db_v1
    const legacyDb = await getDB(LEGACY_DB_NAME);
    await legacyDb.put('students', {
      id: 'legacy-std-1',
      admissionNo: 'LEG-101',
      name: 'Legacy Student',
      class: 'Class 8',
      status: 'Active',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      createdBy: 'legacy@example.com',
    } as any);

    const inspection = await inspectLegacyRecords();
    assert(inspection.hasLegacyData === true && inspection.counts.students >= 1, 'Test 2.3', 'inspectLegacyRecords() reads gbhs_operator_db_v1');

    // Explicitly scoped migration
    const migrationResult = await linkAndMigrateLegacyRecordsToWorkspace(OWNER_WS_ID, 's.engrimrantareen@gmail.com');
    assert(migrationResult.success === true, 'Test 2.4', 'linkAndMigrateLegacyRecordsToWorkspace() succeeded');

    const manifest = await getAppState<any>('legacy_migration_manifest');
    assert(manifest?.targetOwnerId === OWNER_WS_ID, 'Test 2.5', 'Legacy migration manifest stored in global app_state');

    // Verify migrated record in owner workspace DB
    setActiveWorkspaceId(OWNER_WS_ID);
    const ownerStudents = await getAllStudents();
    assert(ownerStudents.some((s) => s.admissionNo === 'LEG-101'), 'Test 2.6', 'Legacy student migrated into owner workspace');

    // =========================================================================
    // TEST 3: SCHOOL PROFILE ISOLATION (NO OWNER PROFILE LEAKAGE TO NEW USER)
    // =========================================================================
    console.log('\n--- Test 3: School Profile Isolation (No Leakage to New User) ---');

    // 1. Owner saves custom school profile and custom logo
    setActiveWorkspaceId(OWNER_WS_ID);
    await saveSchoolProfile(
      {
        schoolName: 'Govt Boys High School Jam Yousaf Colony Hub',
        schoolShortName: 'GBHS (JYC)',
        principalName: 'Engr. Imran Tareen',
      },
      OWNER_WS_ID
    );
    saveCustomLogoUrl('/custom-owner-logo.png', OWNER_WS_ID);

    // Verify Owner sees their own custom profile and logo
    const ownerProfile = getSchoolProfile(OWNER_WS_ID);
    assert(ownerProfile.schoolName === 'Govt Boys High School Jam Yousaf Colony Hub', 'Test 3.1', 'Owner profile matches saved custom profile');
    assert(getCustomLogoUrl(OWNER_WS_ID) === '/custom-owner-logo.png', 'Test 3.2', 'Owner logo matches saved custom logo');

    // 2. New User becomes active
    setActiveWorkspaceId(NEW_USER_WS_ID);
    const newUserProfile = getSchoolProfile();
    assert(
      newUserProfile.schoolName === DEFAULT_SCHOOL_PROFILE.schoolName,
      'Test 3.3',
      `New user sees DEFAULT_SCHOOL_PROFILE ("${DEFAULT_SCHOOL_PROFILE.schoolName}"), NOT Owner's profile`
    );
    assert(
      newUserProfile.schoolShortName === DEFAULT_SCHOOL_PROFILE.schoolShortName,
      'Test 3.4',
      'New user sees default short name'
    );
    assert(
      getCustomLogoUrl() === DEFAULT_LOGO_URL,
      'Test 3.5',
      `New user sees DEFAULT_LOGO_URL ("${DEFAULT_LOGO_URL}"), NOT Owner's logo`
    );

    // =========================================================================
    // TEST 4: OWNER LOGOUT
    // =========================================================================
    console.log('\n--- Test 4: Owner Logout ---');
    setActiveWorkspaceId(OWNER_WS_ID);
    const mockSession: AuthSession = {
      user: {
        id: OWNER_WS_ID,
        email: 's.engrimrantareen@gmail.com',
        fullName: 'Master Owner',
        schoolId: 'GBHS-MAIN',
        schoolName: 'Govt Boys High School',
        role: 'Computer Operator',
        workspaceRole: 'owner',
        workspaceOwnerId: OWNER_WS_ID,
        isApproved: true,
      },
      token: 'jwt-owner-token',
      refreshToken: 'jwt-refresh-token',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      isTrustedOffline: false,
    };
    syncEngine.setSession(mockSession);

    // Perform Owner Logout
    await removeAppState('gbhs_active_session');
    syncEngine.setSession(null);
    await clearWorkspaceCachedState();

    assert(getActiveWorkspaceId() === null, 'Test 4.1', 'Active workspace ID reset to null after logout');
    const postLogoutStudents = await getAllStudents();
    assert(postLogoutStudents.length === 0, 'Test 4.2', 'getAllStudents() fails closed and returns [] after logout');

    const syncStats = syncEngine.getCachedStats();
    assert(syncStats.overallStatus === 'Offline' && syncStats.pendingCount === 0, 'Test 4.3', 'SyncEngine stats reset to clean offline defaults');

    // =========================================================================
    // TEST 5: OWNER / NEW USER SWITCHING & FRESH EMPTY WORKSPACE
    // =========================================================================
    console.log('\n--- Test 5: Owner / New User Switching & Fresh Workspace Integrity ---');

    // 1. New user logs in
    setActiveWorkspaceId(NEW_USER_WS_ID);
    const freshNewUserStudents = await getAllStudents();
    assert(freshNewUserStudents.length === 0, 'Test 5.1', 'New user starts with fresh empty student list');

    const freshNewUserOutbox = await getOutboxOperations();
    assert(freshNewUserOutbox.length === 0, 'Test 5.2', 'New user starts with fresh empty outbox');

    // New user creates their own student
    const newUserStudent: Student = {
      id: 'nu-std-1',
      admissionNo: 'NU-001',
      rollNo: '1',
      name: 'Ahmed Ali (New User Student)',
      fatherName: 'Father Ali',
      class: 'Class 9',
      section: 'A',
      phone: '0300-1111111',
      dob: '2010-05-10',
      address: 'Hub',
      status: 'Active',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schoolId: 'GBHS-MAIN',
      createdBy: 'sowardmehdi@gmail.com',
    };
    await saveStudentLocally(newUserStudent);

    const savedNewUserStudents = await getAllStudents();
    assert(
      savedNewUserStudents.length === 1 && savedNewUserStudents[0].id === 'nu-std-1',
      'Test 5.3',
      'New user student saved in new user workspace'
    );

    // 2. Switch back to Owner
    await clearWorkspaceCachedState();
    setActiveWorkspaceId(OWNER_WS_ID);

    const reloadedOwnerStudents = await getAllStudents();
    assert(
      !reloadedOwnerStudents.some((s) => s.id === 'nu-std-1'),
      'Test 5.4',
      'New user student does NOT appear in Owner workspace'
    );
    assert(
      reloadedOwnerStudents.some((s) => s.admissionNo === 'LEG-101'),
      'Test 5.5',
      'Owner workspace data preserved intact across user switch'
    );

    // 3. Switch back to New User
    await clearWorkspaceCachedState();
    setActiveWorkspaceId(NEW_USER_WS_ID);

    const reloadedNewUserStudents = await getAllStudents();
    assert(
      reloadedNewUserStudents.length === 1 && reloadedNewUserStudents[0].id === 'nu-std-1',
      'Test 5.6',
      'New user workspace contains only their own student'
    );

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n================================================================');
    console.log(`REGRESSION TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('================================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Unexpected test exception:', err);
    process.exit(1);
  }
}

runRegressionSuite();
