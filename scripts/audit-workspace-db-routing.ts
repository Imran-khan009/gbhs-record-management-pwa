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
  saveStudentLocally,
  getAllAttendanceRecords,
  saveAttendanceLocally,
  getAllTeachingLogs,
  saveTeachingLogLocally,
  getAllPracticalProgress,
  getAllAbsenteeFollowups,
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
  DEFAULT_SCHOOL_PROFILE,
} from '../src/services/schoolProfileService';
import {
  getCustomLogoUrl,
  saveCustomLogoUrl,
  DEFAULT_LOGO_URL,
} from '../src/services/logoService';
import { syncEngine } from '../src/services/syncEngine';
import { Student } from '../src/types/student';
import { AuthSession } from '../src/types/auth';

let auditPassed = 0;
let auditFailed = 0;

function check(condition: boolean, code: string, message: string) {
  if (condition) {
    auditPassed++;
    console.log(`[PASS] ${code}: ${message}`);
  } else {
    auditFailed++;
    console.error(`[FAIL] ${code}: ${message}`);
  }
}

// Polyfill localStorage & window for test harness
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) || null,
    setItem: (k: string, v: string) => mem.set(k, String(v)),
    removeItem: (k: string) => mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => Array.from(mem.keys())[i] || null,
    length: mem.size,
  } as any;
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

async function runAudit() {
  console.log('========================================================================');
  console.log('COMPREHENSIVE AUDIT: getDB() AND getActiveDatabaseName() WORKSPACE ROUTING');
  console.log('========================================================================\n');

  const OWNER_ID = 'e4a3515a-2556-47ac-a193-9825fda2c7d6';
  const NEW_USER_ID = '70d930d9-0095-4ba9-a2d9-530ab152c5a7';

  // Seed baseline data in legacy database gbhs_operator_db_v1
  const legacyDb = await getDB(LEGACY_DB_NAME);
  await legacyDb.put('students', {
    id: 'legacy-rec-1',
    admissionNo: 'LEGACY-001',
    name: 'Protected Archive Student',
    class: 'Class 10',
    status: 'Active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    createdBy: 'system@archive.local',
  } as any);

  // -------------------------------------------------------------------------
  // AUDIT SECTION 1: STARTUP / RELOAD WHEN UNLOGGED
  // -------------------------------------------------------------------------
  console.log('--- 1. Startup & Reload Verification (Unlogged State) ---');
  await clearWorkspaceCachedState();
  check(getActiveWorkspaceId() === null, 'AUDIT-1.1', 'App starts with activeWorkspaceId = null');

  let getActiveDbFailed = false;
  try {
    getActiveDatabaseName();
  } catch {
    getActiveDbFailed = true;
  }
  check(getActiveDbFailed, 'AUDIT-1.2', 'getActiveDatabaseName() fails closed without authenticated workspace');

  // Re-acquire legacy DB handle after clearWorkspaceCachedState() closed previous connections
  const freshLegacyDb = await getDB(LEGACY_DB_NAME);
  const legacyStudentCount = await freshLegacyDb.count('students');
  check(legacyStudentCount === 1, 'AUDIT-1.3', 'Legacy DB gbhs_operator_db_v1 has 1 archive student');

  // Normal workspace query MUST return 0 and NOT see the legacy student
  const startupStudents = await getAllStudents();
  check(startupStudents.length === 0, 'AUDIT-1.4', 'getAllStudents() returns [] and does NOT expose legacy archive student');

  // Global state keys MUST work
  await setAppState('gbhs_active_session', { restored: true });
  const restoredSession = await getAppState<{ restored: boolean }>('gbhs_active_session');
  check(restoredSession?.restored === true, 'AUDIT-1.5', 'Global session key gbhs_active_session resolves to legacy DB');

  await setAppState('supabase_config', { url: 'https://demo.supabase.co', key: 'key' });
  const restoredConfig = await getAppState<{ url: string }>('supabase_config');
  check(restoredConfig?.url === 'https://demo.supabase.co', 'AUDIT-1.6', 'Global config key supabase_config resolves to legacy DB');

  // -------------------------------------------------------------------------
  // AUDIT SECTION 2: OWNER LOGIN FLOW
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Owner Login Flow ---');
  setActiveWorkspaceId(OWNER_ID);
  check(getActiveWorkspaceId() === OWNER_ID, 'AUDIT-2.1', 'Owner activeWorkspaceId set correctly');
  check(
    getActiveDatabaseName() === getWorkspaceDatabaseName(OWNER_ID),
    'AUDIT-2.2',
    `getActiveDatabaseName() resolves to "${getWorkspaceDatabaseName(OWNER_ID)}"`
  );

  // Owner saves a student in their workspace
  const ownerStudent: Student = {
    id: 'owner-std-101',
    admissionNo: 'OWN-101',
    rollNo: '1',
    name: 'Owner Student One',
    fatherName: 'Owner Father',
    class: 'Class 7',
    section: 'A',
    phone: '0300-1111111',
    status: 'Active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    createdBy: 's.engrimrantareen@gmail.com',
  };
  await saveStudentLocally(ownerStudent);

  const ownerStudents = await getAllStudents();
  check(
    ownerStudents.length === 1 && ownerStudents[0].id === 'owner-std-101',
    'AUDIT-2.3',
    'Owner student saved and retrieved from owner workspace DB'
  );

  // Legacy DB gbhs_operator_db_v1 MUST NOT contain the new owner student
  const checkLegacyDb = await getDB(LEGACY_DB_NAME);
  const legacyStudentAfterOwnerSave = await checkLegacyDb.get('students', 'owner-std-101');
  check(legacyStudentAfterOwnerSave === undefined, 'AUDIT-2.4', 'Legacy DB was NOT touched by owner student save');

  // -------------------------------------------------------------------------
  // AUDIT SECTION 3: OWNER LOGOUT FLOW
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Owner Logout Flow ---');
  await clearWorkspaceCachedState();
  syncEngine.setSession(null);

  check(getActiveWorkspaceId() === null, 'AUDIT-3.1', 'Active workspace reset to null after logout');

  const postLogoutStudents = await getAllStudents();
  check(postLogoutStudents.length === 0, 'AUDIT-3.2', 'getAllStudents() returns [] after logout');

  let postLogoutWriteThrew = false;
  try {
    await saveStudentLocally(ownerStudent);
  } catch {
    postLogoutWriteThrew = true;
  }
  check(postLogoutWriteThrew, 'AUDIT-3.3', 'saveStudentLocally() throws error after logout');

  // -------------------------------------------------------------------------
  // AUDIT SECTION 4: NEW USER LOGIN & ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- 4. New User Login & Isolation Flow ---');
  setActiveWorkspaceId(NEW_USER_ID);
  check(
    getActiveDatabaseName() === getWorkspaceDatabaseName(NEW_USER_ID),
    'AUDIT-4.1',
    `New User getActiveDatabaseName() resolves to "${getWorkspaceDatabaseName(NEW_USER_ID)}"`
  );

  const newUserStudents = await getAllStudents();
  check(newUserStudents.length === 0, 'AUDIT-4.2', 'New User workspace starts completely empty (cannot see Owner data)');

  const newUserProfile = getSchoolProfile();
  check(
    newUserProfile.schoolName === DEFAULT_SCHOOL_PROFILE.schoolName,
    'AUDIT-4.3',
    'New User does not inherit Owner custom profile'
  );

  // New User creates student
  const newUserStudent: Student = {
    id: 'newuser-std-201',
    admissionNo: 'NU-201',
    rollNo: '1',
    name: 'New User Student One',
    fatherName: 'New Father',
    class: 'Class 8',
    section: 'B',
    phone: '0300-2222222',
    status: 'Active',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schoolId: 'GBHS-MAIN',
    createdBy: 'sowardmehdi@gmail.com',
  };
  await saveStudentLocally(newUserStudent);

  const newRetrieved = await getAllStudents();
  check(
    newRetrieved.length === 1 && newRetrieved[0].id === 'newuser-std-201',
    'AUDIT-4.4',
    'New User student isolated in new user workspace'
  );

  // -------------------------------------------------------------------------
  // AUDIT SECTION 5: ACCOUNT SWITCHING
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Account Switching Flow (New User -> Owner -> New User) ---');
  // Switch to Owner
  await clearWorkspaceCachedState();
  setActiveWorkspaceId(OWNER_ID);

  const reloadedOwnerStudents = await getAllStudents();
  check(
    reloadedOwnerStudents.length === 1 && reloadedOwnerStudents[0].id === 'owner-std-101',
    'AUDIT-5.1',
    'Owner sees ONLY Owner students (no cross-contamination from New User)'
  );

  // Switch back to New User
  await clearWorkspaceCachedState();
  setActiveWorkspaceId(NEW_USER_ID);

  const reloadedNewStudents = await getAllStudents();
  check(
    reloadedNewStudents.length === 1 && reloadedNewStudents[0].id === 'newuser-std-201',
    'AUDIT-5.2',
    'New User sees ONLY New User students (no cross-contamination from Owner)'
  );

  // -------------------------------------------------------------------------
  // AUDIT SECTION 6: EXPLICITLY SCOPED LEGACY MIGRATION
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Explicitly Scoped Legacy Migration Audit ---');
  const inspectRes = await inspectLegacyRecords();
  check(inspectRes.hasLegacyData === true && inspectRes.counts.students === 1, 'AUDIT-6.1', 'inspectLegacyRecords() accurately reports legacy archive count');

  const migrateRes = await linkAndMigrateLegacyRecordsToWorkspace(OWNER_ID, 's.engrimrantareen@gmail.com');
  check(migrateRes.success === true, 'AUDIT-6.2', 'Explicit migration links archive without mutating gbhs_operator_db_v1');

  // Verify archive remains intact in legacy DB
  const checkLegacyDb2 = await getDB(LEGACY_DB_NAME);
  const archiveStillExists = await checkLegacyDb2.get('students', 'legacy-rec-1');
  check(archiveStillExists !== undefined, 'AUDIT-6.3', 'Legacy DB record remains 100% intact as permanent local rollback');

  // Verify migrated record exists in Owner workspace
  setActiveWorkspaceId(OWNER_ID);
  const ownerPostMigrate = await getAllStudents();
  check(ownerPostMigrate.some((s) => s.id === 'legacy-rec-1'), 'AUDIT-6.4', 'Migrated legacy record present in Owner workspace');

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`AUDIT RESULTS: ${auditPassed} PASSED, ${auditFailed} FAILED OUT OF ${auditPassed + auditFailed} CHECKS`);
  console.log('========================================================================\n');

  if (auditFailed > 0) {
    process.exit(1);
  }
}

runAudit();
