import 'fake-indexeddb/auto';
import {
  getDB,
  closeDB,
  setActiveWorkspaceId,
  getActiveWorkspaceId,
  getWorkspaceDatabaseName,
  getAllStudents,
  getAllAttendanceRecords,
  getAllTeachingLogs,
  getAllPracticalProgress,
  getAllAbsenteeFollowups,
  setAppState,
  enqueueOutboxOperation,
} from '../src/services/db';

import {
  createStudent,
  updateStudent,
  deleteStudent,
  markSingleAttendance,
} from '../src/services/recordService';

import {
  createTeachingLog,
  updateTeachingLog,
  deleteTeachingLog,
  createPracticalProgress,
  updatePracticalProgress,
  deletePracticalProgress,
  createAbsenteeFollowup,
  updateAbsenteeFollowup,
  deleteAbsenteeFollowup,
  exportTeachingLogsToExcel,
  exportPracticalProgressToExcel,
  exportAbsenteeFollowupsToExcel,
} from '../src/services/modulesService';

import {
  exportStudentsToExcel,
  commitApprovedImportRows,
} from '../src/services/excelService';

import { createBackupData } from '../src/services/backupService';

import {
  getWorkspacePermissions,
  isMasterOwnerEmail,
} from '../src/services/permissionService';

import {
  addWorkspaceMember,
  updateWorkspaceMemberStatus,
  removeWorkspaceMember,
  fetchWorkspaceMembers,
  checkUserWorkspaceMembership,
  uploadWorkspaceSnapshotToSupabase,
  downloadWorkspaceSnapshotFromSupabase,
  syncOperationToCloud,
  updateSupabaseConfig,
} from '../src/services/supabase';

import {
  buildOperatorUser,
  tryOfflineSignIn,
} from '../src/services/authService';
import { getCustomLogoUrl } from '../src/services/logoService';

import { syncEngine } from '../src/services/syncEngine';
import { AuthSession, OperatorUser } from '../src/types/auth';
import {
  cleanPhoneNumberForWhatsApp,
  getWhatsAppUrl,
  getSmsUrl,
  generateAbsenteeWhatsAppMessage,
  calculateStudentAttendanceAlerts,
} from '../src/services/alertService';
import {
  generateMonthlyReportData,
} from '../src/services/reportService';

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

async function runPermissionTestSuite() {
  console.log('================================================================');
  console.log('GBHS ACCOUNT PERMISSION VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  // Use isolated local mock cloud without external credentials
  await updateSupabaseConfig({ url: '', anonKey: '' });

  const ownerId = 'own-1111-4000-8000-000000000001';
  const ownerEmail = 'principal@gbhs.edu.pk';

  const newUserId = 'new-2222-4000-8000-000000000002';
  const newUserEmail = 'newoperator@gbhs.edu.pk';

  const teamMemberId = 'tm-3333-4000-8000-000000000003';
  const teamMemberEmail = 'staff.assistant@gbhs.edu.pk';

  const ownerUser: OperatorUser = {
    id: ownerId,
    email: ownerEmail,
    fullName: 'School Principal (Owner)',
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    role: 'Computer Operator',
    workspaceRole: 'owner',
    workspaceOwnerId: ownerId,
  };

  const ownerSession: AuthSession = {
    user: ownerUser,
    token: 'mock-owner-token',
    refreshToken: 'mock-owner-refresh',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: false,
  };

  // ===========================================================================
  // SCENARIO 1: OWNER — FULL ACCESS
  // ===========================================================================
  console.log('--- Feature 1: Owner — Full Access Enforcements ---');

  // 1.1 Permission Matrix
  const ownerPerms = getWorkspacePermissions(ownerUser);
  assert(ownerPerms.isOwner === true, '1.1.1 Owner isOwner', 'Should be recognized as owner');
  assert(ownerPerms.isReadOnly === false, '1.1.2 Owner isReadOnly', 'Owner must NOT be read-only');
  assert(ownerPerms.canAdd === true, '1.1.3 Owner canAdd', 'Owner can add records');
  assert(ownerPerms.canEdit === true, '1.1.4 Owner canEdit', 'Owner can edit records');
  assert(ownerPerms.canDelete === true, '1.1.5 Owner canDelete', 'Owner can delete records');
  assert(ownerPerms.canImport === true, '1.1.6 Owner canImport', 'Owner can import excel files');
  assert(ownerPerms.canExport === true, '1.1.7 Owner canExport', 'Owner can export excel data');
  assert(ownerPerms.canChangeSettings === true, '1.1.8 Owner canChangeSettings', 'Owner can change system settings');
  assert(ownerPerms.canManageUsers === true, '1.1.9 Owner canManageUsers', 'Owner can manage team members');

  // 1.2 Switch to Owner Workspace and Perform Mutations
  setActiveWorkspaceId(ownerId);
  await setAppState('gbhs_auth_session', ownerSession);
  syncEngine.setSession(ownerSession);

  const createRes = await createStudent(
    {
      admissionNo: '1001',
      rollNo: '101',
      name: 'Muhammad Ali',
      fatherName: 'Asad Ali',
      class: 'Class 9',
      section: 'A',
      status: 'Active',
      phone: '03001234567',
    },
    ownerEmail
  );
  assert(Boolean(createRes.success && createRes.student), '1.2.1 Owner Create Student', `Created student with id: ${createRes.student?.id}`);
  const studentA = createRes.student!;

  const updateRes = await updateStudent(
    studentA.id,
    { name: 'Muhammad Ali (Updated by Owner)' },
    ownerEmail
  );
  assert(Boolean(updateRes.success && updateRes.student?.name.includes('Updated')), '1.2.2 Owner Update Student', 'Owner successfully updated student');
  const updatedStd = updateRes.student!;

  const attRecord = await markSingleAttendance(studentA, '2026-10-20', 'Present', 'On time', ownerEmail);
  assert(attRecord.status === 'Present', '1.2.3 Owner Mark Attendance', 'Owner successfully marked attendance');

  const teachRes = await createTeachingLog(
    {
      date: '2026-10-20',
      day: 'Tuesday',
      class: 'Class 9',
      subjectTopic: 'Relational Database Security & RLS',
      learningObjectives: 'Understand role-based access control and RLS',
      theoryCovered: 'RLS policies and non-recursive queries',
      practicalActivity: 'Policy design exercises',
      totalRegistered: 40,
      studentsPresent: 35,
      studentsCompletingTask: 30,
      studentsNeedingHelp: 5,
      teachingMethod: 'Interactive lecture and lab',
      instructorName: 'Sir Principal',
    },
    ownerEmail
  );
  assert(Boolean(teachRes.success && teachRes.entry), '1.2.4 Owner Create Teaching Log', `Owner logged lecture: ${teachRes.entry?.id}`);
  const teachLog = teachRes.entry!;

  const practRes = await createPracticalProgress(
    {
      assessmentDate: '2026-10-20',
      studentId: studentA.id,
      registrationId: studentA.admissionNo,
      studentName: studentA.name,
      class: 'Class 9',
      skillTask: 'Database Isolation Lab',
      attemptNumber: 1,
      practicalCompleted: 'Yes',
      scoreMarks: 95,
      skillStatus: 'Proficient',
      remedialPracticeRequired: 'No',
      instructorRemarks: 'Excellent work',
    },
    ownerEmail
  );
  assert(Boolean(practRes.success && practRes.entry), '1.2.5 Owner Create Practical Log', `Owner logged practical: ${practRes.entry?.id}`);
  const practLog = practRes.entry!;

  const followRes = await createAbsenteeFollowup(
    {
      date: '2026-10-20',
      studentId: studentA.id,
      registrationId: studentA.admissionNo,
      studentName: studentA.name,
      class: 'Class 9',
      absenceCount: 2,
      followupReason: 'Uninformed absence',
      actionTaken: 'Phone call to father',
      contactPerson: 'Father',
      responseReceived: 'Father promised attendance tomorrow',
      followupDate: '2026-10-20',
      currentStatus: 'Pending Return',
      managementReferral: 'No',
      remarks: 'Father promised attendance tomorrow',
    },
    ownerEmail
  );
  assert(Boolean(followRes.success && followRes.entry), '1.2.6 Owner Create Followup', `Owner logged absentee followup: ${followRes.entry?.id}`);
  const followup = followRes.entry!;

  // 1.3 Owner Export Capabilities
  const backupResult = await createBackupData();
  assert(backupResult.backup.metadata.totalRecords >= 4, '1.3.1 Owner Backup Export', `Owner can generate backup with ${backupResult.backup.metadata.totalRecords} records`);

  const excelResult = exportStudentsToExcel([updatedStd], { selectedClass: 'Class 9' });
  assert(excelResult.success === true, '1.3.2 Owner Excel Export', 'Owner can export excel sheet');

  // 1.4 Owner Workspace Member Management
  const inviteResult = await addWorkspaceMember(ownerId, teamMemberEmail, ownerEmail);
  assert(inviteResult.success === true, '1.4.1 Owner Invite Member', `Invited ${teamMemberEmail}`);
  assert(inviteResult.member?.status === 'pending', '1.4.2 Member Default Pending', 'Invited member status defaults to pending');

  const membersList = await fetchWorkspaceMembers(ownerId);
  assert(membersList.length >= 1, '1.4.3 Owner Fetch Members', `Owner sees ${membersList.length} members`);

  // 1.5 Owner Cloud Sync Permissions
  const ownerUploadResult = await uploadWorkspaceSnapshotToSupabase(
    null,
    ownerId,
    {
      students: [updatedStd],
      attendance: [attRecord],
      teachingLogs: [teachLog],
      practicalProgress: [practLog],
      absenteeFollowups: [followup],
    },
    ownerId,
    'owner'
  );
  assert(ownerUploadResult.success === true, '1.5.1 Owner Cloud Snapshot Upload', 'Owner upload accepted');


  // ===========================================================================
  // SCENARIO 2: NEW USERS — PRIVATE EMPTY WORKSPACE
  // ===========================================================================
  console.log('\n--- Feature 2: New Users — Private Empty Workspace Enforcements ---');

  // 2.1 New User has no membership in owner workspace
  const newMembership = await checkUserWorkspaceMembership(newUserId, newUserEmail);
  assert(newMembership === null, '2.1.1 New User Unaffiliated', 'New user has no approved workspace membership');

  // 2.2 Build new operator user profile
  const rawSbNewUser = {
    id: newUserId,
    email: newUserEmail,
    user_metadata: { full_name: 'New Registered User' },
  };
  const newOperator = await buildOperatorUser(rawSbNewUser);
  assert(newOperator.workspaceRole === 'user', '2.2.1 New User Starts in Personal User Role', 'New user has workspaceRole = user');
  assert(newOperator.isApproved === true, '2.2.1b New User Automatically Approved', 'New user is automatically approved as Personal User');
  assert(newOperator.workspaceOwnerId === newUserId, '2.2.2 New User Workspace ID', 'Workspace ID equals new user ID');
  const newPerms = getWorkspacePermissions(newOperator);
  assert(newPerms.tier === 'approved_user', '2.2.3 Tier is approved_user', 'Personal user tier is approved_user');
  assert(newPerms.isPending === false, '2.2.4 isPending is false', 'isPending flag is false (pending screen gate bypassed)');
  assert(newPerms.canView === true, '2.2.5 Auto-approved user can view records', 'canView is true for auto-approved user');
  assert(newPerms.isOwner === true, '2.2.6 Auto-approved user is owner of own workspace', 'isOwner is true for personal workspace');

  // 2.3 Switch to New User's workspace
  setActiveWorkspaceId(newUserId);
  const newUserDbName = getWorkspaceDatabaseName(newUserId);
  assert(newUserDbName === `gbhs_workspace_${newUserId}`, '2.3.1 Isolated Database Name', `DB Name is ${newUserDbName}`);

  const newUserSession: AuthSession = {
    user: newOperator,
    token: 'mock-new-token',
    refreshToken: 'mock-new-refresh',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: false,
  };
  await setAppState('gbhs_auth_session', newUserSession);
  syncEngine.setSession(newUserSession);

  // 2.4 Verify empty workspace
  const newStudents = await getAllStudents();
  const newAttendance = await getAllAttendanceRecords();
  const newTeachingLogs = await getAllTeachingLogs();
  const newPracticals = await getAllPracticalProgress();
  const newFollowups = await getAllAbsenteeFollowups();

  assert(newStudents.length === 0, '2.4.1 New User 0 Students', 'Must have 0 students');
  assert(newAttendance.length === 0, '2.4.2 New User 0 Attendance', 'Must have 0 attendance records');
  assert(newTeachingLogs.length === 0, '2.4.3 New User 0 Teaching Logs', 'Must have 0 teaching logs');
  assert(newPracticals.length === 0, '2.4.4 New User 0 Practicals', 'Must have 0 practicals');
  assert(newFollowups.length === 0, '2.4.5 New User 0 Followups', 'Must have 0 followups');

  // 2.5 Ensure new user does not see owner's student
  const queryOwnerStdInNewSpace = newStudents.find((s) => s.id === studentA.id);
  assert(queryOwnerStdInNewSpace === undefined, '2.5.1 No Data Leakage', "Owner's records are completely invisible to new user");


  // ===========================================================================
  // SCENARIO 3: UNAPPROVED TEAM MEMBER ACCESS DENIAL
  // ===========================================================================
  console.log('\n--- Feature 3: Unapproved Team Member Access Denial Enforcements ---');

  // 3.1 Verify status is pending
  const pendingMemberCheck = await checkUserWorkspaceMembership(teamMemberId, teamMemberEmail);
  assert(pendingMemberCheck === null, '3.1.1 Pending Member Not Approved', 'Pending invite is NOT treated as approved membership');

  // 3.2 If unapproved member logs in, they get their own workspace, NOT owner's
  const rawSbPendingUser = {
    id: teamMemberId,
    email: teamMemberEmail,
    user_metadata: { full_name: 'Pending Assistant' },
  };
  const pendingOperator = await buildOperatorUser(rawSbPendingUser);
  assert(pendingOperator.workspaceRole === 'user', '3.2.1 Fallback to Private Workspace', 'Pending user falls back to private workspace');
  assert(pendingOperator.isApproved === true, '3.2.1b Pending Member Auto-Approved on Private Workspace', 'Pending staff invitee has access to own private workspace');
  assert(pendingOperator.workspaceOwnerId === teamMemberId, '3.2.2 Private Workspace ID', 'Pending user workspace ID is their own');

  // 3.3 Supabase Cloud RLS Policy Denial on Owner's Workspace
  // Unapproved member tries to download owner's workspace snapshot
  const unauthorizedDownload = await downloadWorkspaceSnapshotFromSupabase(
    null,
    ownerId,
    teamMemberId,
    teamMemberEmail
  );
  assert(unauthorizedDownload.success === false, '3.3.1 Cloud Download Denied', 'Downloading owner data rejected with error');
  assert(
    Boolean(unauthorizedDownload.error?.includes('42501') || unauthorizedDownload.error?.includes('denied')),
    '3.3.2 RLS Code 42501 Enforced',
    `Error received: ${unauthorizedDownload.error}`
  );

  // Unapproved member tries to upload/mutate owner's workspace in cloud
  const unauthorizedUpload = await uploadWorkspaceSnapshotToSupabase(
    null,
    ownerId,
    {
      students: [studentA],
      attendance: [],
      teachingLogs: [],
      practicalProgress: [],
      absenteeFollowups: [],
    },
    teamMemberId,
    'operator'
  );
  assert(unauthorizedUpload.success === false, '3.3.3 Cloud Upload Denied', 'Uploading to owner workspace rejected');
  assert(
    Boolean(unauthorizedUpload.error?.includes('42501')),
    '3.3.4 RLS Code 42501 on Upload',
    `Error received: ${unauthorizedUpload.error}`
  );


  // ===========================================================================
  // SCENARIO 4: APPROVED TEAM MEMBERS — READ-ONLY SHARED ACCESS
  // ===========================================================================
  console.log('\n--- Feature 4: Approved Team Member — Read-Only Shared Access Enforcements ---');

  // 4.1 Owner Approves Member
  const approveRes = await updateWorkspaceMemberStatus(inviteResult.member!.id, 'approved');
  assert(approveRes.success === true, '4.1.1 Owner Approves Member', 'Owner approved team member status');

  // 4.2 Approved Membership Recognized
  const approvedCheck = await checkUserWorkspaceMembership(teamMemberId, teamMemberEmail);
  assert(approvedCheck !== null, '4.2.1 Membership Found', 'Approved membership confirmed');
  assert(approvedCheck?.status === 'approved', '4.2.2 Membership Status Approved', 'Status is approved');
  assert(approvedCheck?.access_level === 'read_only', '4.2.3 Access Level Read-Only', 'Access level is read_only');
  assert(approvedCheck?.owner_id === ownerId, '4.2.4 Workspace Owner Mapped', `Maps to owner ${ownerId}`);

  // 4.3 Operator User Construction for Approved Member
  const approvedOperator = await buildOperatorUser(rawSbPendingUser);
  assert(approvedOperator.workspaceRole === 'team_member', '4.3.1 Role is team_member', 'Assigned team_member role');
  assert(approvedOperator.workspaceOwnerId === ownerId, '4.3.2 Linked to Owner Workspace', 'Workspace owner points to owner');

  const approvedPerms = getWorkspacePermissions(approvedOperator);
  assert(approvedPerms.isOwner === false, '4.3.3 Approved Member Not Owner', 'isOwner must be false');
  assert(approvedPerms.isReadOnly === true, '4.3.4 Approved Member isReadOnly', 'isReadOnly must be true');
  assert(approvedPerms.canAdd === false, '4.3.5 Approved Member canAdd is false', 'Cannot add');
  assert(approvedPerms.canEdit === false, '4.3.6 Approved Member canEdit is false', 'Cannot edit');
  assert(approvedPerms.canDelete === false, '4.3.7 Approved Member canDelete is false', 'Cannot delete');
  assert(approvedPerms.canImport === false, '4.3.8 Approved Member canImport is false', 'Cannot import');
  assert(approvedPerms.canExport === true, '4.3.9 Approved Member canExport is true', 'Approved staff can export reports');
  assert(approvedPerms.canChangeSettings === false, '4.3.10 Approved Member canChangeSettings is false', 'Cannot change settings');
  assert(approvedPerms.canManageUsers === false, '4.3.11 Approved Member canManageUsers is false', 'Cannot manage users');

  // 4.4 Set Active Session as Approved Member in Owner's Workspace
  setActiveWorkspaceId(ownerId);
  const memberSession: AuthSession = {
    user: approvedOperator,
    token: 'mock-member-token',
    refreshToken: 'mock-member-refresh',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    isTrustedOffline: false,
  };
  await setAppState('gbhs_auth_session', memberSession);
  syncEngine.setSession(memberSession);

  // 4.5 Member CAN READ Owner's records
  const memberSeenStudents = await getAllStudents();
  assert(memberSeenStudents.length >= 1, '4.5.1 Read Shared Students', `Member sees ${memberSeenStudents.length} student(s)`);
  assert(memberSeenStudents[0].name.includes('Muhammad Ali'), '4.5.2 Correct Record Content', 'Read correct student data');

  const memberSeenAttendance = await getAllAttendanceRecords();
  assert(memberSeenAttendance.length >= 1, '4.5.3 Read Shared Attendance', `Member sees ${memberSeenAttendance.length} attendance record(s)`);

  const memberSeenTeaching = await getAllTeachingLogs();
  assert(memberSeenTeaching.length >= 1, '4.5.4 Read Shared Teaching Logs', `Member sees ${memberSeenTeaching.length} lecture log(s)`);

  const memberSeenPracticals = await getAllPracticalProgress();
  assert(memberSeenPracticals.length >= 1, '4.5.5 Read Shared Practicals', `Member sees ${memberSeenPracticals.length} practical log(s)`);

  const memberSeenFollowups = await getAllAbsenteeFollowups();
  assert(memberSeenFollowups.length >= 1, '4.5.6 Read Shared Followups', `Member sees ${memberSeenFollowups.length} followup(s)`);

  // Cloud Download: Member CAN download snapshot from cloud
  const memberCloudDownload = await downloadWorkspaceSnapshotFromSupabase(
    null,
    ownerId,
    teamMemberId,
    teamMemberEmail
  );
  assert(memberCloudDownload.success === true, '4.5.7 Cloud Read Allowed', 'Approved member authorized to download cloud snapshot');

  // 4.6 Member Local Mutation Rejections (Enforced via Service Guards)
  const addStudentRes = await createStudent(
    {
      admissionNo: '9999',
      rollNo: '999',
      name: 'Hacker Attempt',
      fatherName: 'Nobody',
      class: 'Class 7',
      section: 'A',
      status: 'Active',
      phone: '00000000000',
    },
    teamMemberEmail
  );
  assert(addStudentRes.success === false, '4.6.1 Create Student Blocked', 'createStudent rejected for read-only member');
  assert(Boolean(addStudentRes.error?.includes('Read-only') || addStudentRes.error?.includes('Permission denied')), '4.6.1b Create Student Error Message', addStudentRes.error || '');

  const updateStudentRes = await updateStudent(
    memberSeenStudents[0].id,
    { name: 'Unauthorized Edit' },
    teamMemberEmail
  );
  assert(updateStudentRes.success === false, '4.6.2 Update Student Blocked', 'updateStudent rejected for read-only member');
  assert(Boolean(updateStudentRes.error?.includes('Read-only') || updateStudentRes.error?.includes('Permission denied')), '4.6.2b Update Student Error Message', updateStudentRes.error || '');

  const deleteStudentRes = await deleteStudent(memberSeenStudents[0].id, teamMemberEmail);
  assert(deleteStudentRes.success === false, '4.6.3 Delete Student Blocked', 'deleteStudent rejected for read-only member');
  assert(Boolean(deleteStudentRes.error?.includes('Read-only') || deleteStudentRes.error?.includes('Permission denied')), '4.6.3b Delete Student Error Message', deleteStudentRes.error || '');

  let attendanceBlocked = false;
  try {
    await markSingleAttendance(memberSeenStudents[0], '2026-10-21', 'Absent', 'Unauthorized mark', teamMemberEmail);
  } catch (err: any) {
    attendanceBlocked = true;
    assert(Boolean(err.message.includes('Read-only') || err.message.includes('Permission denied')), '4.6.4 Attendance Blocked', err.message);
  }
  assert(attendanceBlocked, '4.6.4b Attendance Error Thrown', 'markSingleAttendance was blocked');

  const memberTeachRes = await createTeachingLog(
    {
      date: '2026-10-21',
      day: 'Wednesday',
      class: 'Class 7',
      subjectTopic: 'Unauthorized',
      learningObjectives: 'None',
      theoryCovered: 'None',
      practicalActivity: 'None',
      totalRegistered: 10,
      studentsPresent: 5,
      studentsCompletingTask: 0,
      studentsNeedingHelp: 5,
      teachingMethod: 'Lecture',
      instructorName: 'Assistant',
    },
    teamMemberEmail
  );
  assert(memberTeachRes.success === false, '4.6.5 Teaching Log Blocked', 'createTeachingLog rejected');
  assert(Boolean(memberTeachRes.error?.includes('Read-only') || memberTeachRes.error?.includes('Permission denied')), '4.6.5b Teaching Error Message', memberTeachRes.error || '');

  const memberPractRes = await createPracticalProgress(
    {
      assessmentDate: '2026-10-21',
      class: 'Class 7',
      studentId: memberSeenStudents[0].id,
      studentName: memberSeenStudents[0].name,
      registrationId: memberSeenStudents[0].admissionNo,
      skillTask: 'Unauthorized Lab',
      attemptNumber: 1,
      practicalCompleted: 'No',
      scoreMarks: 0,
      skillStatus: 'Not Started',
      remedialPracticeRequired: 'No',
    },
    teamMemberEmail
  );
  assert(memberPractRes.success === false, '4.6.6 Practical Blocked', 'createPracticalProgress rejected');
  assert(Boolean(memberPractRes.error?.includes('Read-only') || memberPractRes.error?.includes('Permission denied')), '4.6.6b Practical Error Message', memberPractRes.error || '');

  const memberFollowRes = await createAbsenteeFollowup(
    {
      date: '2026-10-21',
      studentId: memberSeenStudents[0].id,
      registrationId: memberSeenStudents[0].admissionNo,
      studentName: memberSeenStudents[0].name,
      class: 'Class 9',
      absenceCount: 1,
      followupReason: 'Unauthorized',
      actionTaken: 'None',
      contactPerson: 'None',
      responseReceived: 'None',
      followupDate: '2026-10-21',
      currentStatus: 'Pending Return',
      managementReferral: 'No',
      remarks: 'Unauthorized',
    },
    teamMemberEmail
  );
  assert(memberFollowRes.success === false, '4.6.7 Followup Blocked', 'createAbsenteeFollowup rejected');
  assert(Boolean(memberFollowRes.error?.includes('Read-only') || memberFollowRes.error?.includes('Permission denied')), '4.6.7b Followup Error Message', memberFollowRes.error || '');

  const memberExcelRes = exportStudentsToExcel(memberSeenStudents, { selectedClass: 'Class 9' });
  assert(memberExcelRes.success === true, '4.6.8 Export Excel Allowed for Staff', 'exportStudentsToExcel succeeds for approved staff');
  assert(memberExcelRes.count === memberSeenStudents.length, '4.6.8b Export Count Matches', `Exported ${memberExcelRes.count} records`);

  // Verify other report exports succeed for approved staff
  let teachExportSuccess = true;
  try {
    exportTeachingLogsToExcel(memberSeenTeaching, 'Class 7');
  } catch {
    teachExportSuccess = false;
  }
  assert(teachExportSuccess, '4.6.8c Teaching Log Export Allowed for Staff', 'exportTeachingLogsToExcel succeeds');

  let practicalExportSuccess = true;
  try {
    exportPracticalProgressToExcel(memberSeenPracticals, 'Class 7');
  } catch {
    practicalExportSuccess = false;
  }
  assert(practicalExportSuccess, '4.6.8d Practical Progress Export Allowed for Staff', 'exportPracticalProgressToExcel succeeds');

  let followupExportSuccess = true;
  try {
    exportAbsenteeFollowupsToExcel(memberSeenFollowups, 'Class 9');
  } catch {
    followupExportSuccess = false;
  }
  assert(followupExportSuccess, '4.6.8e Absentee Followup Export Allowed for Staff', 'exportAbsenteeFollowupsToExcel succeeds');

  let importCommitBlocked = false;
  try {
    await commitApprovedImportRows(
      [
        {
          rowNumber: 1,
          serialNo: '1',
          rollNo: '888',
          name: 'Illegal Import',
          fatherName: 'Illegal',
          class: 'Class 8',
          section: 'B',
          admissionNo: '8888',
          phone: '03001112233',
          guardianContact: '03001112233',
          registeredStatus: 'Registerd',
          selected: true,
          validationErrors: [],
          status: 'Active',
          isDuplicate: false,
        },
      ],
      teamMemberEmail
    );
  } catch (err: any) {
    importCommitBlocked = true;
    assert(Boolean(err.message.includes('Read-only') || err.message.includes('Permission denied')), '4.6.9 Excel Import Commit Blocked', err.message);
  }
  assert(importCommitBlocked, '4.6.9b Import Commit Error Thrown', 'commitApprovedImportRows was blocked');

  let backupBlocked = false;
  try {
    await createBackupData();
  } catch (err: any) {
    backupBlocked = true;
    assert(Boolean(err.message.includes('Read-only') || err.message.includes('Permission denied')), '4.6.10 Backup Creation Blocked', err.message);
  }
  assert(backupBlocked, '4.6.10b Backup Creation Error Thrown', 'createBackupData was blocked');

  // 4.7 Member Cloud Mutation Rejection (RLS 42501)
  const memberCloudUpload = await uploadWorkspaceSnapshotToSupabase(
    null,
    ownerId,
    {
      students: memberSeenStudents,
      attendance: memberSeenAttendance,
      teachingLogs: memberSeenTeaching,
      practicalProgress: memberSeenPracticals,
      absenteeFollowups: memberSeenFollowups,
    },
    teamMemberId,
    'team_member'
  );
  assert(memberCloudUpload.success === false, '4.7.1 Cloud Snapshot Upload Blocked', 'Team member cannot upload snapshot');
  assert(
    Boolean(memberCloudUpload.error?.includes('42501')),
    '4.7.2 RLS Code 42501 on Cloud Upload',
    `Rejected with: ${memberCloudUpload.error}`
  );

  const memberCloudOpSync = await syncOperationToCloud(
    {
      opId: 'op-illegal-1',
      entityId: studentA.id,
      entityType: 'student',
      operationType: 'UPDATE',
      payload: studentA,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      userEmail: teamMemberEmail,
      version: 1,
    },
    'mock-token',
    ownerId,
    'team_member'
  );
  assert(memberCloudOpSync.success === false, '4.7.3 Cloud Outbox Op Blocked', 'Team member outbox op rejected');
  assert(
    Boolean(memberCloudOpSync.error?.message?.includes('42501')),
    '4.7.4 RLS Code 42501 on Cloud Outbox Op',
    `Rejected with: ${memberCloudOpSync.error?.message}`
  );

  // 4.8 Member Access Revocation
  console.log('\n--- Feature 5: Revocation Verification ---');
  const revokeRes = await updateWorkspaceMemberStatus(inviteResult.member!.id, 'revoked');
  assert(revokeRes.success === true, '5.1 Revoke Member Status', 'Owner revoked team member access');

  const revokedCheck = await checkUserWorkspaceMembership(teamMemberId, teamMemberEmail);
  assert(revokedCheck === null, '5.2 Revoked Member Denied', 'Revoked member checkUserWorkspaceMembership returns null');

  const postRevokeOperator = await buildOperatorUser(rawSbPendingUser);
  assert(postRevokeOperator.workspaceRole === 'user', '5.3 Relegated to Private Workspace', 'Revoked member cannot access owner workspace');
  assert(postRevokeOperator.isApproved === true, '5.3b Revoked Member Auto-Approved in Personal Workspace', 'Revoked member has access to their own workspace');
  assert(postRevokeOperator.workspaceOwnerId === teamMemberId, '5.4 Relegated Workspace ID', 'Points to private workspace');

  // ===========================================================================
  // SCENARIO 6: DATABASE SETTINGS RESTRICTIONS & SYNC HEALING
  // ===========================================================================
  console.log('\n--- Feature 6: Database Settings Restrictions & Sync Healing ---');

  // 6.1 Verify Owner has full settings & backup access
  const ownerRolePerms = getWorkspacePermissions(ownerUser);
  assert(ownerRolePerms.canChangeSettings === true, '6.1.1 Owner Can Change Settings', 'Owner has canChangeSettings: true');
  assert(ownerRolePerms.canManageUsers === true, '6.1.2 Owner Can Manage Users', 'Owner has canManageUsers: true');
  assert(ownerRolePerms.isOwner === true, '6.1.3 Owner Is Verified Owner', 'Owner role verified');

  // 6.2 Verify Staff is strictly blocked from settings
  assert(approvedPerms.canChangeSettings === false, '6.2.1 Staff Cannot Change Settings', 'Staff has canChangeSettings: false');
  assert(approvedPerms.canManageUsers === false, '6.2.2 Staff Cannot Manage Users', 'Staff has canManageUsers: false');

  // 6.3 Test Sync Animation Bug Fix: Auto-healing stranded 'syncing' operations
  // Simulate an operation that was left in 'syncing' state (e.g. from app crash / dropped connection)
  const strandedOpId = 'op-stranded-sync-test';
  await enqueueOutboxOperation({
    opId: strandedOpId,
    entityId: 'test-entity',
    entityType: 'student',
    operationType: 'UPDATE',
    payload: studentA,
    timestamp: Date.now() - 30000, // 30 seconds ago
    status: 'syncing',
    retryCount: 0,
    userEmail: ownerEmail,
    version: 1,
  });

  // Verify self-healing in syncEngine: orphaned syncing op is recovered back to pending
  const healedCount = await syncEngine.recoverOrphanedSyncingOps();
  assert(healedCount >= 1, '6.3.1 Stranded Ops Recovered', `Healed ${healedCount} stuck syncing operation(s)`);

  const currentStats = await syncEngine.getStats();
  assert(currentStats.syncingCount === 0, '6.3.2 Zero Stuck Syncing Ops', 'No operations left stuck in syncing status');
  assert(currentStats.overallStatus !== 'Syncing', '6.3.3 Status Not Stuck in Syncing', `Overall status healed to: ${currentStats.overallStatus}`);

  // =========================================================================
  // 7. Master Owner Account Normalization, Offline Sign-in Fallback & Custom Logo
  // =========================================================================
  console.log('\n--- 7. Master Owner Account Normalization, Offline Sign-in & Custom Logo ---');

  // 7.1 Verify both emails are recognized as Master Owner
  assert(isMasterOwnerEmail('engrimrantareen@gmail.com') === true, '7.1.1 engrimrantareen@gmail.com Is Master Owner', 'Approved owner email recognized');
  assert(isMasterOwnerEmail('s.engrimrantareen@gmail.com') === true, '7.1.2 s.engrimrantareen@gmail.com Is Master Owner', 'Primary owner email recognized');
  assert(isMasterOwnerEmail(' ENGRIMRANTAREEN@gmail.com ') === true, '7.1.3 Case & Whitespace Insensitive Owner Verification', 'Owner normalized correctly');
  assert(isMasterOwnerEmail('staff_teacher@gbhs.edu.pk') === false, '7.1.4 Staff Is Not Master Owner', 'Staff correctly not recognized as master owner');

  // 7.2 Verify tryOfflineSignIn is securely disabled and rejects unverified offline login attempts
  const offlineOwnerResult = await tryOfflineSignIn('engrimrantareen@gmail.com');
  assert(offlineOwnerResult.success === false, '7.2.1 Offline Sign-In Rejected For Master Owner', 'Master Owner cannot sign in offline without password');
  assert(offlineOwnerResult.session === undefined, '7.2.2 No Offline Master Owner Session Created', 'Session is undefined');
  assert(Boolean(offlineOwnerResult.error?.includes('internet connection') || offlineOwnerResult.error?.includes('disabled')), '7.2.3 Error Requires Connection', offlineOwnerResult.error || '');
  assert(offlineOwnerResult.session?.isTrustedOffline !== true, '7.2.4 No Insecure Session Generated', 'isTrustedOffline session not created');

  // 7.3 Verify Custom Logo resolution
  const logoUrl = getCustomLogoUrl();
  assert(logoUrl === '/custom-logo.jpg', '7.3.1 Custom Logo Resolves to /custom-logo.jpg', `Resolved logo URL: ${logoUrl}`);

  // 7.4 Supabase Cloud Credentials Visibility & Security Isolation
  console.log('\n--- 7.4 Supabase Cloud Credentials Visibility & Security Isolation ---');
  const masterEmail = 'engrimrantareen@gmail.com';
  const newAccountEmail = 'new_registered_user@gmail.com';
  const staffEmail = 'staff_assistant@gbhs.edu.pk';
  const publicEmail = 'guest_public_user@yahoo.com';

  assert(isMasterOwnerEmail(masterEmail) === true, '7.4.1 Master Owner Receives Supabase Credentials Access', 'engrimrantareen@gmail.com can view Supabase credentials');
  assert(isMasterOwnerEmail(newAccountEmail) === false, '7.4.2 New Registered User Completely Hidden From Supabase Credentials', 'new_registered_user@gmail.com cannot view Supabase credentials');
  assert(isMasterOwnerEmail(staffEmail) === false, '7.4.3 Staff Member Completely Hidden From Supabase Credentials', 'staff_assistant@gbhs.edu.pk cannot view Supabase credentials');
  assert(isMasterOwnerEmail(publicEmail) === false, '7.4.4 Public User Completely Hidden From Supabase Credentials', 'guest_public_user@yahoo.com cannot view Supabase credentials');
  assert(isMasterOwnerEmail(null) === false, '7.4.5 Null Email Completely Hidden From Supabase Credentials', 'null email cannot view Supabase credentials');
  assert(isMasterOwnerEmail(undefined) === false, '7.4.6 Undefined Email Completely Hidden From Supabase Credentials', 'undefined email cannot view Supabase credentials');

  // =========================================================================
  // 8. Advanced Features Verification: WhatsApp Alerts, Monthly Reports & Smart Badges
  // =========================================================================
  console.log('\n--- 8. Advanced Features: WhatsApp Alerts, Smart Badges & Monthly Reports ---');

  // 8.1 WhatsApp Phone Number Cleaning (Pakistani & International formats)
  assert(cleanPhoneNumberForWhatsApp('03001234567') === '923001234567', '8.1.1 Local 03XX Number Normalized', '03001234567 -> 923001234567');
  assert(cleanPhoneNumberForWhatsApp('+92 300 1234567') === '923001234567', '8.1.2 International +92 Number Normalized', '+92 300 1234567 -> 923001234567');
  assert(cleanPhoneNumberForWhatsApp('0312-7654321') === '923127654321', '8.1.3 Formatted Hyphenated Number Normalized', '0312-7654321 -> 923127654321');
  assert(cleanPhoneNumberForWhatsApp('923450000000') === '923450000000', '8.1.4 Raw 92 Number Preserved', '923450000000 -> 923450000000');

  // 8.2 WhatsApp & SMS URL Generation
  const waUrl = getWhatsAppUrl('03001234567', 'Test Message for Parent');
  assert(waUrl.includes('https://wa.me/923001234567') && waUrl.includes('Test%20Message'), '8.2.1 WhatsApp URL Generation', `Generated WhatsApp URL: ${waUrl.slice(0, 45)}...`);
  const smsUrl = getSmsUrl('03001234567', 'SMS Notice');
  assert(smsUrl.includes('sms:923001234567') && smsUrl.includes('SMS%20Notice'), '8.2.2 SMS URL Generation', `Generated SMS URL: ${smsUrl}`);

  // 8.3 Professional Absentee WhatsApp Notice Formatting
  const waMsg = generateAbsenteeWhatsAppMessage({
    studentName: 'Ali Ahmed',
    rollNo: '07',
    classLevel: 'Class 8',
    date: '2026-10-20',
    absenceCount: 3,
    reason: 'Uninformed absence',
  });
  assert(waMsg.includes('GOVT BOYS HIGH SCHOOL JAM YOUSUF COLONY'), '8.3.1 WhatsApp Message Header', 'Includes official school letterhead header');
  assert(waMsg.includes('Ali Ahmed') && waMsg.includes('*07*'), '8.3.2 WhatsApp Student Details', 'Includes student name and roll number');
  assert(waMsg.includes('3 consecutive days'), '8.3.3 WhatsApp Absence Count', 'Includes absence duration count');

  // 8.4 Smart Attendance Alert Calculations
  const testStudentMock = {
    id: 'student-alert-mock-1',
    name: 'Tariq Khan',
    rollNo: '12',
    class: 'Class 7' as const,
    section: 'A' as const,
  } as any;

  // Case A: 4 presents out of 10 days = 40% (< 75%) -> CRITICAL
  const criticalAttHistory = [
    { id: 'a1', studentId: 'student-alert-mock-1', date: '2026-10-01', status: 'Present', class: 'Class 7', section: 'A' },
    { id: 'a2', studentId: 'student-alert-mock-1', date: '2026-10-02', status: 'Present', class: 'Class 7', section: 'A' },
    { id: 'a3', studentId: 'student-alert-mock-1', date: '2026-10-03', status: 'Present', class: 'Class 7', section: 'A' },
    { id: 'a4', studentId: 'student-alert-mock-1', date: '2026-10-04', status: 'Present', class: 'Class 7', section: 'A' },
    { id: 'a5', studentId: 'student-alert-mock-1', date: '2026-10-05', status: 'Absent', class: 'Class 7', section: 'A' },
    { id: 'a6', studentId: 'student-alert-mock-1', date: '2026-10-06', status: 'Absent', class: 'Class 7', section: 'A' },
    { id: 'a7', studentId: 'student-alert-mock-1', date: '2026-10-07', status: 'Absent', class: 'Class 7', section: 'A' },
    { id: 'a8', studentId: 'student-alert-mock-1', date: '2026-10-08', status: 'Absent', class: 'Class 7', section: 'A' },
    { id: 'a9', studentId: 'student-alert-mock-1', date: '2026-10-09', status: 'Absent', class: 'Class 7', section: 'A' },
    { id: 'a10', studentId: 'student-alert-mock-1', date: '2026-10-10', status: 'Absent', class: 'Class 7', section: 'A' },
  ] as any[];

  const alertsMap = calculateStudentAttendanceAlerts([testStudentMock], criticalAttHistory);
  const tariqAlert = alertsMap.get('student-alert-mock-1');
  assert(tariqAlert?.alertLevel === 'CRITICAL', '8.4.1 Low Attendance Triggers CRITICAL Alert', `Alert level is: ${tariqAlert?.alertLevel} (${tariqAlert?.attendancePercentage}%)`);
  assert(tariqAlert?.isAtRisk === true, '8.4.2 Student Flagged As At Risk', 'isAtRisk flagged true');
  assert(tariqAlert?.consecutiveAbsences === 6, '8.4.3 Consecutive Absences Accurately Counted', `Consecutive absences: ${tariqAlert?.consecutiveAbsences}`);

  // 8.5 Monthly Summary Report Aggregation
  const monthlyReport = await generateMonthlyReportData({
    monthIndex: 10,
    year: 2026,
    classLevel: 'All',
  });
  assert(monthlyReport.monthName === 'October', '8.5.1 Report Month Name', `Report month: ${monthlyReport.monthName}`);
  assert(monthlyReport.year === 2026, '8.5.2 Report Year', `Report year: ${monthlyReport.year}`);
  assert(Array.isArray(monthlyReport.studentLedger), '8.5.3 Report Student Ledger Array', `Ledger students: ${monthlyReport.studentLedger.length}`);
  assert(typeof monthlyReport.overallAttendancePercentage === 'number', '8.5.4 Overall Attendance Computed', `Overall %: ${monthlyReport.overallAttendancePercentage}%`);
  // ===========================================================================
  // SCENARIO 9: STRICT 3-TIER ROLE-BASED ACCESS CONTROL (RBAC) ENFORCEMENTS
  // ===========================================================================
  console.log('\n--- Feature 9: Strict 3-Tier RBAC Architecture Enforcements ---');

  // 9.1 Tier 1: Master Owner Role (s.engrimrantareen@gmail.com)
  const masterUser1: OperatorUser = {
    id: 'op-master-imran',
    email: 's.engrimrantareen@gmail.com',
    fullName: 'Engr Imran Khan',
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    role: 'Computer Operator',
    workspaceRole: 'owner',
    workspaceOwnerId: 'op-master-imran',
    isApproved: true,
  };
  const masterPerms1 = getWorkspacePermissions(masterUser1);
  assert(masterPerms1.tier === 'master_owner', '9.1.1 Master Owner Tier Identified', 'Tier is master_owner');
  assert(masterPerms1.isMasterOwner === true, '9.1.2 isMasterOwner is true', 'Master owner flag is true');
  assert(masterPerms1.canViewSupabaseCredentials === true, '9.1.3 Master Owner Sees Supabase Credentials', 'canViewSupabaseCredentials is true');
  assert(masterPerms1.canManageUsers === true, '9.1.4 Master Owner Manages Users & Approvals', 'canManageUsers is true');
  assert(masterPerms1.canChangeSettings === true, '9.1.5 Master Owner Changes Settings', 'canChangeSettings is true');
  assert(masterPerms1.canEdit === true && masterPerms1.canDelete === true, '9.1.6 Master Owner Full CRUD', 'Master owner has full CRUD');

  // Also verify alias engrimrantareen@gmail.com
  const masterUser2: OperatorUser = {
    ...masterUser1,
    email: 'engrimrantareen@gmail.com',
  };
  const masterPerms2 = getWorkspacePermissions(masterUser2);
  assert(masterPerms2.tier === 'master_owner' && masterPerms2.canViewSupabaseCredentials === true, '9.1.7 Alias engrimrantareen@gmail.com Is Master Owner', 'Alias recognized');

  // 9.2 Tier 2: Approved Staff Role
  const staffUser: OperatorUser = {
    id: 'op-staff-1',
    email: 'teacher.assistant@gbhs.edu.pk',
    fullName: 'Staff Teacher',
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    role: 'Computer Operator',
    workspaceRole: 'team_member',
    workspaceOwnerId: 'op-master-imran',
    isApproved: true,
  };
  const staffPerms = getWorkspacePermissions(staffUser);
  assert(staffPerms.tier === 'approved_staff', '9.2.1 Staff Tier Identified', 'Tier is approved_staff');
  assert(staffPerms.isStaff === true, '9.2.2 isStaff is true', 'Staff flag is true');
  assert(staffPerms.isReadOnly === true, '9.2.3 Staff isReadOnly is true', 'Staff is read-only');
  assert(staffPerms.canView === true, '9.2.4 Staff Can View Records', 'Staff can view system records');
  assert(staffPerms.canExport === true, '9.2.5 Staff Can Export to Excel/PDF', 'Staff can export data');
  assert(staffPerms.canEdit === false, '9.2.6 Staff Cannot Edit Records', 'canEdit is false (Edit buttons hidden)');
  assert(staffPerms.canDelete === false, '9.2.7 Staff Cannot Delete Records', 'canDelete is false (Delete buttons hidden)');
  assert(staffPerms.canAdd === false, '9.2.8 Staff Cannot Add Records', 'canAdd is false (Add buttons hidden)');
  assert(staffPerms.canImport === false, '9.2.9 Staff Cannot Import Records', 'canImport is false');
  assert(staffPerms.canChangeSettings === false, '9.2.10 Staff Cannot Change Settings', 'canChangeSettings is false');
  assert(staffPerms.canManageUsers === false, '9.2.11 Staff Cannot Manage Users', 'canManageUsers is false');
  assert(staffPerms.canViewSupabaseCredentials === false, '9.2.12 Staff Completely Blocked From Supabase Credentials', 'canViewSupabaseCredentials is false');

  // 9.3 Tier 3: Approved Personal User
  const personalUser: OperatorUser = {
    id: 'op-personal-1',
    email: 'personal.educator@gmail.com',
    fullName: 'Personal Educator',
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    role: 'Computer Operator',
    workspaceRole: 'user',
    workspaceOwnerId: 'op-personal-1',
    isApproved: true,
  };
  const personalPerms = getWorkspacePermissions(personalUser);
  assert(personalPerms.tier === 'approved_user', '9.3.1 Personal User Tier Identified', 'Tier is approved_user');
  assert(personalPerms.isOwner === true, '9.3.2 Personal User isOwner of Own Space', 'isOwner is true');
  assert(personalPerms.isStaff === false, '9.3.3 Personal User isStaff is false', 'isStaff is false');
  assert(personalPerms.isReadOnly === false, '9.3.4 Personal User isReadOnly is false', 'isReadOnly is false');
  assert(personalPerms.canView === true, '9.3.5 Personal User Can View Own Records', 'canView is true');
  assert(personalPerms.canAdd === true, '9.3.6 Personal User Can Add Own Records', 'canAdd is true');
  assert(personalPerms.canEdit === true, '9.3.7 Personal User Can Edit Own Records', 'canEdit is true');
  assert(personalPerms.canDelete === true, '9.3.8 Personal User Can Delete Own Records', 'canDelete is true');
  assert(personalPerms.canExport === true, '9.3.9 Personal User Can Export Own Records', 'canExport is true');
  assert(personalPerms.canImport === true, '9.3.10 Personal User Can Import Own Records', 'canImport is true');
  assert(personalPerms.canChangeSettings === false, '9.3.11 Personal User Isolated From Master Settings', 'canChangeSettings is false');
  assert(personalPerms.canManageUsers === false, '9.3.12 Personal User Isolated From Master User Management', 'canManageUsers is false');
  assert(personalPerms.canViewSupabaseCredentials === false, '9.3.13 Personal User Completely Blocked From Supabase Credentials', 'canViewSupabaseCredentials is false');

  // 9.4 Auto-Approved Personal User
  const selfRegisteredUser: OperatorUser = {
    id: 'op-pending-1',
    email: 'new.applicant@gmail.com',
    fullName: 'Pending Applicant',
    schoolId: 'GBHS-MAIN',
    schoolName: 'Govt Boys High School',
    role: 'Computer Operator',
    workspaceRole: 'user',
    workspaceOwnerId: 'op-pending-1',
    isApproved: true,
  };
  const applicantPerms = getWorkspacePermissions(selfRegisteredUser);
  assert(applicantPerms.tier === 'approved_user', '9.4.1 Personal User Tier Identified', 'Tier is approved_user');
  assert(applicantPerms.isPending === false, '9.4.2 isPending is false', 'isPending is false (pending gate bypassed)');
  assert(applicantPerms.canView === true, '9.4.3 Personal User Can View Records', 'canView is true');
  assert(applicantPerms.canAdd === true, '9.4.4 Personal User Can Add Records', 'canAdd is true');
  assert(applicantPerms.canEdit === true, '9.4.5 Personal User Can Edit Records', 'canEdit is true');
  assert(applicantPerms.canDelete === true, '9.4.6 Personal User Can Delete Records', 'canDelete is true');
  assert(applicantPerms.canChangeSettings === false, '9.4.7 Personal User Cannot Change Settings', 'canChangeSettings is false');
  assert(applicantPerms.canViewSupabaseCredentials === false, '9.4.8 Personal User Cannot View Credentials', 'canViewSupabaseCredentials is false');


  // Summary
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runPermissionTestSuite().catch((err) => {
  console.error('Test Suite Failed Unexpectedly:', err);
  process.exit(1);
});
