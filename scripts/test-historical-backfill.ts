/**
 * Automated Verification Script for Master Owner Historical Backfill Logic
 * 
 * Tests:
 * 1. Non-owner denial: Calling backfill on arbitrary email throws permission error.
 * 2. Master Owner account backfill execution:
 *    - Populates 75 Jam Yousuf Colony students (Class 7, 8, 9).
 *    - Populates 200 sequential teaching logs (March 2, 2026 to October 20, 2026 covering Modules 1-4).
 *    - Populates 15,000 attendance records (75 students x 200 days).
 *    - Populates 9 practicals and 4 absentee followups.
 *    - Zero outbox pollution (no 15,000 operations queued into sync outbox).
 *    - Verifies app state flags (owner_historical_backfilled_v2 = true, modules_mock_cleared_v1 = false).
 * 3. Fresh user isolation:
 *    - Switching to a new registered user workspace has 0 students, 0 attendance, 0 teaching logs.
 */

import 'fake-indexeddb/auto';
import {
  backfillHistoricalDataForOwner,
  getSchoolDays,
  HISTORICAL_CURRICULUM_LUS,
  JAM_YOUSUF_STUDENTS_RAW,
} from '../src/services/historicalBackfillService';
import {
  setActiveWorkspaceId,
  getAllStudents,
  getAllAttendanceRecords,
  getAllTeachingLogs,
  getAllPracticalProgress,
  getAllAbsenteeFollowups,
  getPendingOutboxOperations,
  getAppState,
  getDB,
} from '../src/services/db';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`[PASS] ${testName}: ${detail}`);
  } else {
    console.error(`[FAIL] ${testName}: ${detail}`);
    process.exit(1);
  }
}

async function runHistoricalBackfillVerification() {
  console.log('================================================================');
  console.log('STARTING HISTORICAL CURRICULUM & ATTENDANCE BACKFILL TEST SUITE');
  console.log('================================================================\n');

  // 1. Verify Date Generation & LUs
  console.log('--- Phase 1: Curriculum & School Days Schedule Verification ---');
  const schoolDays = getSchoolDays('2026-03-02', '2026-10-20');
  assert(schoolDays.length === 200, '1.1 Working Days Count', `Generated exactly ${schoolDays.length} working days (Mon-Sat)`);
  assert(schoolDays[0].dateStr === '2026-03-02', '1.2 First Working Day', `First day is ${schoolDays[0].dateStr}`);
  assert(schoolDays[schoolDays.length - 1].dateStr === '2026-10-20', '1.3 Last Working Day', `Last day is ${schoolDays[schoolDays.length - 1].dateStr}`);

  // Verify no Sundays included
  const hasSunday = schoolDays.some((d) => d.dayName === 'Sunday');
  assert(!hasSunday, '1.4 No Sundays', 'All 200 days fall between Monday and Saturday');

  // Verify LUs
  assert(HISTORICAL_CURRICULUM_LUS.length === 42, '1.5 LUs Count', `Curriculum contains 42 LUs across Modules 1 to 4`);
  assert(JAM_YOUSUF_STUDENTS_RAW.length === 75, '1.6 Jam Yousuf Students Count', `Master roster contains 75 students`);

  // 2. Security Check: Non-Owner Denial
  console.log('\n--- Phase 2: Security & Non-Owner Denial ---');
  let nonOwnerBlocked = false;
  try {
    await backfillHistoricalDataForOwner('unauthorized.user@gmail.com', 'user-999');
  } catch (err: any) {
    nonOwnerBlocked = true;
    assert(true, '2.1 Non-Owner Blocked', `Caught expected error: ${err.message}`);
  }
  assert(nonOwnerBlocked, '2.2 Strict Rejection', 'Arbitrary user cannot trigger historical backfill');

  // 3. Master Owner Workspace Backfill
  console.log('\n--- Phase 3: Master Owner Backfill Execution ---');
  const ownerId = 'master-owner-001';
  const ownerEmail = 's.engrimrantareen@gmail.com';
  setActiveWorkspaceId(ownerId);

  const initialOutbox = await getPendingOutboxOperations();
  const res = await backfillHistoricalDataForOwner(ownerEmail, ownerId, true);

  assert(res.studentsCount === 75, '3.1 Students Backfilled', `Populated ${res.studentsCount} students`);
  assert(res.teachingLogsCount === 200, '3.2 Teaching Logs Backfilled', `Populated ${res.teachingLogsCount} teaching logs (Modules 1-4)`);
  assert(res.attendanceCount === 15000, '3.3 Attendance Backfilled', `Populated ${res.attendanceCount.toLocaleString()} attendance records`);
  assert(res.practicalsCount === 9, '3.4 Practicals Backfilled', `Populated ${res.practicalsCount} practical progress entries`);
  assert(res.followupsCount === 4, '3.5 Followups Backfilled', `Populated ${res.followupsCount} absentee followups`);

  // Verify direct database contents
  const ownerStudents = await getAllStudents();
  const ownerLogs = await getAllTeachingLogs();
  const ownerAttendance = await getAllAttendanceRecords();
  const ownerPracticals = await getAllPracticalProgress();
  const ownerFollowups = await getAllAbsenteeFollowups();

  assert(ownerStudents.length === 75, '3.6 DB Students Match', `Found ${ownerStudents.length} students in owner DB`);
  assert(ownerLogs.length === 200, '3.7 DB Teaching Logs Match', `Found ${ownerLogs.length} logs in owner DB`);
  assert(ownerAttendance.length === 15000, '3.8 DB Attendance Match', `Found ${ownerAttendance.length.toLocaleString()} attendance records in owner DB`);
  assert(ownerPracticals.length === 9, '3.9 DB Practicals Match', `Found ${ownerPracticals.length} practicals in owner DB`);
  assert(ownerFollowups.length === 4, '3.10 DB Followups Match', `Found ${ownerFollowups.length} followups in owner DB`);

  // Verify Outbox is NOT flooded
  const afterOutbox = await getPendingOutboxOperations();
  assert(afterOutbox.length === initialOutbox.length, '3.11 Outbox Clean', `Outbox operations count is ${afterOutbox.length} (zero pollution)`);

  // Verify App State flags
  const isBackfilledFlag = await getAppState<boolean>('owner_historical_backfilled_v2');
  const mockClearedFlag = await getAppState<boolean>('modules_mock_cleared_v1');
  assert(isBackfilledFlag === true, '3.12 Backfill Flag Set', 'owner_historical_backfilled_v2 is true');
  assert(mockClearedFlag === false, '3.13 Mock Wipeout Reversed', 'modules_mock_cleared_v1 is false for owner');

  // Verify date range in records (getAllTeachingLogs returns descending order by date)
  const latestLog = ownerLogs[0];
  const earliestLog = ownerLogs[ownerLogs.length - 1];
  assert(latestLog.date === '2026-10-20', '3.14 Latest Teaching Log Date', `Latest log date is ${latestLog.date}`);
  assert(earliestLog.date === '2026-03-02', '3.15 Earliest Teaching Log Date', `Earliest log date is ${earliestLog.date}`);

  // 4. New Registered User Workspace Isolation Verification
  console.log('\n--- Phase 4: Fresh New User Workspace Isolation ---');
  const newUserId = 'fresh-user-777';
  setActiveWorkspaceId(newUserId);

  const newUserStudents = await getAllStudents();
  const newUserLogs = await getAllTeachingLogs();
  const newUserAttendance = await getAllAttendanceRecords();
  const newUserPracticals = await getAllPracticalProgress();
  const newUserFollowups = await getAllAbsenteeFollowups();

  assert(newUserStudents.length === 0, '4.1 New User 0 Students', `New user has ${newUserStudents.length} students`);
  assert(newUserLogs.length === 0, '4.2 New User 0 Teaching Logs', `New user has ${newUserLogs.length} teaching logs`);
  assert(newUserAttendance.length === 0, '4.3 New User 0 Attendance', `New user has ${newUserAttendance.length} attendance records`);
  assert(newUserPracticals.length === 0, '4.4 New User 0 Practicals', `New user has ${newUserPracticals.length} practicals`);
  assert(newUserFollowups.length === 0, '4.5 New User 0 Followups', `New user has ${newUserFollowups.length} followups`);

  console.log('\n================================================================');
  console.log('ALL HISTORICAL BACKFILL & WORKSPACE ISOLATION TESTS PASSED!');
  console.log('================================================================\n');
}

runHistoricalBackfillVerification().catch((err) => {
  console.error('Test failed with unhandled exception:', err);
  process.exit(1);
});
