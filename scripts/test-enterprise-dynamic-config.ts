/**
 * ENTERPRISE SaaS REFACTOR VERIFICATION SUITE
 * 
 * Verifies all 4 enterprise dynamic requirements:
 * 1. Dynamic Top-Left Header & Console Title
 * 2. Dynamic Dashboard Hero Banner & Workspace Title (with crest logo)
 * 3. Dynamic Authorized Operator Display & Role Badging Logic
 * 4. Universal Class Management Across Entire App (Forms & Dashboards)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error(`    -> ${detail}`);
    failedTests++;
  }
}

console.log('=================================================================');
console.log('--- ENTERPRISE SaaS REFACTOR: 100% DYNAMIC CONFIGURATION TEST ---');
console.log('=================================================================\n');

// Load files to test
const navbarSrc = readFileSync(resolve('src/components/layout/Navbar.tsx'), 'utf-8');
const dashboardSrc = readFileSync(resolve('src/components/dashboard/DashboardView.tsx'), 'utf-8');
const settingsSrc = readFileSync(resolve('src/components/settings/SettingsModal.tsx'), 'utf-8');
const profileServiceSrc = readFileSync(resolve('src/services/schoolProfileService.ts'), 'utf-8');
const studentFormSrc = readFileSync(resolve('src/components/students/StudentFormModal.tsx'), 'utf-8');
const attendanceSrc = readFileSync(resolve('src/components/attendance/AttendanceView.tsx'), 'utf-8');
const teachingSrc = readFileSync(resolve('src/components/teaching/TeachingLogView.tsx'), 'utf-8');
const practicalSrc = readFileSync(resolve('src/components/practical/PracticalProgressView.tsx'), 'utf-8');
const absenteeSrc = readFileSync(resolve('src/components/absentee/AbsenteeFollowupView.tsx'), 'utf-8');
const monthlyReportSrc = readFileSync(resolve('src/components/reports/MonthlyReportModal.tsx'), 'utf-8');
const classTabsSrc = readFileSync(resolve('src/components/common/ClassTabs.tsx'), 'utf-8');

// ==========================================
// REQUIREMENT 1: Dynamic Top-Left Header & Console Title
// ==========================================
console.log('[REQUIREMENT 1] Dynamic Top-Left Header & Console Title');

assert(
  profileServiceSrc.includes('consoleTitle?: string'),
  'SchoolProfile interface includes consoleTitle property'
);

assert(
  navbarSrc.includes('profile.schoolShortName || profile.schoolName'),
  'Navbar renders dynamic school short name or school name'
);

assert(
  navbarSrc.includes('profile.district'),
  'Navbar renders dynamic school district'
);

assert(
  navbarSrc.includes('profile.consoleTitle'),
  'Navbar renders dynamic consoleTitle from active School Profile'
);

assert(
  navbarSrc.includes('profile.classes') && navbarSrc.includes('Active Classes'),
  'Navbar dynamically formats and displays active class count / classes badge'
);

assert(
  settingsSrc.includes('consoleTitleInput') && settingsSrc.includes('setConsoleTitleInput'),
  'SettingsModal provides state and form input for customizable Console Designation Title'
);

// ==========================================
// REQUIREMENT 2: Dynamic Dashboard Hero Banner & Workspace Title
// ==========================================
console.log('\n[REQUIREMENT 2] Dynamic Dashboard Hero Banner & Workspace Title');

assert(
  dashboardSrc.includes('profile.schoolShortName || profile.schoolName') &&
  dashboardSrc.includes('profile.consoleTitle'),
  'Dashboard hero banner dynamically renders active school name and custom console title'
);

assert(
  !dashboardSrc.includes('GBHS COMPUTER OPERATOR WORKSPACE'),
  'Hardcoded "GBHS COMPUTER OPERATOR WORKSPACE" eliminated from DashboardView'
);

assert(
  dashboardSrc.includes('profile.logoUrl') && dashboardSrc.includes('alt={profile.schoolShortName || profile.schoolName}'),
  'Dashboard hero banner dynamically renders the active school profile logo crest'
);

// ==========================================
// REQUIREMENT 3: Dynamic Authorized Operator Display & Role Logic
// ==========================================
console.log('\n[REQUIREMENT 3] Dynamic Authorized Operator Display & Role Logic');

assert(
  dashboardSrc.includes('operatorDisplayName = session?.user?.fullName || session?.user?.email || \'Authorized Operator\''),
  'Dashboard computes operator name dynamically from session user'
);

assert(
  dashboardSrc.includes('session?.user?.fullName && session?.user?.email'),
  'Dashboard displays logged-in user email cleanly when available'
);

assert(
  dashboardSrc.includes('permissions.tier === \'master_owner\'') &&
  dashboardSrc.includes('Master Owner') &&
  dashboardSrc.includes('Approved Staff (Read-Only)') &&
  dashboardSrc.includes('Personal User'),
  'Dashboard displays role badges for Master Owner, Approved Staff, and Personal User'
);

assert(
  dashboardSrc.includes('permissions.tier === \'master_owner\' && profile.operatorTitle'),
  'Dashboard hero renders customizable operatorTitle for Master Owner'
);

assert(
  settingsSrc.includes('operatorTitleInput') && settingsSrc.includes('setOperatorTitleInput'),
  'SettingsModal provides state and form input for customizable Master Operator Title'
);

assert(
  !dashboardSrc.includes('Authorized Operator: Engr Imran Khan'),
  'Hardcoded "Authorized Operator: Engr Imran Khan" completely eliminated'
);

// ==========================================
// REQUIREMENT 4: Universal Class Management Across Entire App
// ==========================================
console.log('\n[REQUIREMENT 4] Universal Class Management Across Entire App (Forms & Dashboards)');

// 4.1 Dashboard KPI Cards & Tabs
assert(
  dashboardSrc.includes('displayClasses.map((className, idx) =>'),
  'Dashboard KPI cards dynamically map over all active classes without rigid limits'
);

assert(
  dashboardSrc.includes('<ClassTabs') && dashboardSrc.includes('classes={displayClasses}'),
  'Dashboard passes dynamic classes list to ClassTabs'
);

// 4.2 ClassTabs component
assert(
  classTabsSrc.includes('classes?: string[]') && classTabsSrc.includes('useSchoolProfile'),
  'ClassTabs supports dynamic classes prop and subscribes to useSchoolProfile hook'
);

assert(
  classTabsSrc.includes('colorPalettes') && classTabsSrc.includes('idx % colorPalettes.length'),
  'ClassTabs applies rotating color palettes for arbitrary custom classes'
);

// 4.3 Student Enrollment Form
assert(
  studentFormSrc.includes('availableClasses.map((cls) =>') &&
  studentFormSrc.includes('useSchoolProfile'),
  'StudentFormModal dynamically populates Class select dropdown from active School Profile classes'
);

// 4.4 Attendance View
assert(
  attendanceSrc.includes('availableClasses.map((c) =>') &&
  attendanceSrc.includes('useSchoolProfile'),
  'AttendanceView renders dynamic class selector buttons for all configured classes'
);

assert(
  !attendanceSrc.includes('Classes 7, 8, & 9 Daily Attendance Register'),
  'AttendanceView eliminated hardcoded "Classes 7, 8, & 9" subtitle'
);

// 4.5 Teaching Log View
assert(
  teachingSrc.includes('availableClasses.map((cls) =>') &&
  teachingSrc.includes('useSchoolProfile'),
  'TeachingLogView dynamically populates Class dropdown and tabs from active School Profile classes'
);

// 4.6 Practical Progress Tracker
assert(
  practicalSrc.includes('availableClasses.map((cls) =>') &&
  practicalSrc.includes('useSchoolProfile'),
  'PracticalProgressView dynamically populates Class dropdown and tabs from active School Profile classes'
);

// 4.7 Absentee Follow-up View
assert(
  absenteeSrc.includes('availableClasses.map((cls) =>') &&
  absenteeSrc.includes('useSchoolProfile'),
  'AbsenteeFollowupView dynamically populates Class dropdown and tabs from active School Profile classes'
);

// 4.8 Monthly Summary Report
assert(
  monthlyReportSrc.includes('profile.classes') &&
  monthlyReportSrc.includes('profile.consoleTitle'),
  'MonthlyReportModal dynamically filters and renders report by configured classes and console title'
);

// 4.9 Real-time Reactivity without Page Refresh
assert(
  profileServiceSrc.includes('gbhs_school_profile_changed') &&
  profileServiceSrc.includes('window.dispatchEvent'),
  'saveSchoolProfile dispatches "gbhs_school_profile_changed" browser custom event'
);

assert(
  profileServiceSrc.includes('window.addEventListener(\'gbhs_school_profile_changed\''),
  'useSchoolProfile hook listens to "gbhs_school_profile_changed" for real-time live synchronization'
);

// ==========================================
// FINAL SUMMARY
// ==========================================
console.log('\n=================================================================');
console.log(`TOTAL TESTS: ${passedTests + failedTests}`);
console.log(`PASSED:      ${passedTests}`);
console.log(`FAILED:      ${failedTests}`);
console.log('=================================================================');

if (failedTests > 0) {
  console.error('\n>>> SOME TESTS FAILED! <<<');
  process.exit(1);
} else {
  console.log('\n>>> ALL 100% FULLY DYNAMIC ENTERPRISE CONFIGURATION TESTS PASSED! <<<\n');
  process.exit(0);
}
