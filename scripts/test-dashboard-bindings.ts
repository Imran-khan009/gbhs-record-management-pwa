/**
 * Automated Verification: Live School Profile & Dynamic Dashboard Bindings
 * 
 * Verifies:
 * 1. Dynamic School Name: In DashboardView header, renders profile.schoolShortName dynamically
 * 2. Dynamic Authorized Operator: Replaced hardcoded "Engr Imran Khan" with session user's fullName / email
 * 3. Dynamic Class Labels: Replaced hardcoded "Class 7, 8, 9 total" with dynamically computed class categories
 * 4. SettingsModal: Added configured classes field and persistence
 * 5. Instant Live Event Sync: Window event 'gbhs_school_profile_changed' triggers live re-rendering
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (details) console.error(`    Details: ${details}`);
  }
}

console.log('\n=================================================================');
console.log('--- VERIFICATION SUITE: LIVE SCHOOL PROFILE & DASHBOARD BINDINGS ---');
console.log('=================================================================\n');

const dashboardPath = resolve(process.cwd(), 'src/components/dashboard/DashboardView.tsx');
const settingsPath = resolve(process.cwd(), 'src/components/settings/SettingsModal.tsx');
const servicePath = resolve(process.cwd(), 'src/services/schoolProfileService.ts');
const reportServicePath = resolve(process.cwd(), 'src/services/reportService.ts');

const dashboardCode = readFileSync(dashboardPath, 'utf-8');
const settingsCode = readFileSync(settingsPath, 'utf-8');
const serviceCode = readFileSync(servicePath, 'utf-8');
const reportServiceCode = readFileSync(reportServicePath, 'utf-8');

// Section 1: Dashboard Header School Name Binding
console.log('[SECTION 1] Dashboard Header Dynamic School Name Binding');

assert(
  dashboardCode.includes("useSchoolProfile") && dashboardCode.includes("from '../../services/schoolProfileService'"),
  'DashboardView imports useSchoolProfile hook'
);

assert(
  dashboardCode.includes("const { profile } = useSchoolProfile("),
  'DashboardView initializes live profile state with workspace scoping'
);

assert(
  dashboardCode.includes("{profile.schoolShortName || profile.schoolName}") &&
    dashboardCode.includes("profile.consoleTitle"),
  'DashboardView header dynamically renders profile.schoolShortName and dynamic console title'
);

assert(
  !dashboardCode.includes("<span>GBHS Computer Operator Workspace</span>"),
  'Hardcoded "GBHS Computer Operator Workspace" removed from hero banner'
);

// Section 2: Dashboard Authorized Operator Binding
console.log('\n[SECTION 2] Dynamic Authorized Operator Binding');

assert(
  dashboardCode.includes("const operatorDisplayName = session?.user?.fullName || session?.user?.email || 'Authorized Operator';"),
  'DashboardView computes dynamic operator display name from session user'
);

assert(
  dashboardCode.includes("{operatorDisplayName}"),
  'DashboardView renders dynamic operator display name'
);

assert(
  !dashboardCode.includes("<span className=\"text-slate-200 font-medium\">Engr Imran Khan</span>"),
  'Hardcoded "Engr Imran Khan" completely eliminated from DashboardView'
);

assert(
  !reportServiceCode.includes("['Authorized Operator:', 'Engr Imran Khan']"),
  'Hardcoded "Engr Imran Khan" removed from reportService Excel exporter'
);

// Section 3: Dynamic Class Labels & Categories
console.log('\n[SECTION 3] Dynamic Class Labels & Categories');

assert(
  serviceCode.includes("classes?: string[];"),
  'SchoolProfile interface includes classes array'
);

assert(
  serviceCode.includes("classes: DEFAULT_CLASSES") || serviceCode.includes("classes: ['Class 7', 'Class 8', 'Class 9'],"),
  'DEFAULT_SCHOOL_PROFILE defines default classes'
);

assert(
  dashboardCode.includes("const dynamicClassesTotalLabel = displayClasses"),
  'DashboardView dynamically computes short class total label'
);

assert(
  dashboardCode.includes("const dynamicClassesFullLabel = displayClasses.join(', ');"),
  'DashboardView dynamically computes full class list label'
);

assert(
  dashboardCode.includes("{dynamicClassesTotalLabel} total"),
  'Total Enrolled KPI card renders dynamic class label'
);

assert(
  dashboardCode.includes("Official School Record Modules ({dynamicClassesFullLabel})"),
  'Official School Record Modules section header renders dynamic class list'
);

assert(
  dashboardCode.includes("{dynamicClassesFullLabel}"),
  'Module 2 Daily Attendance card renders dynamic class list'
);

assert(
  !dashboardCode.includes("<span>Class 7, 8, 9 total</span>"),
  'Hardcoded "Class 7, 8, 9 total" eliminated from Total Enrolled card'
);

// Section 4: Dynamic KPI Cards Generation
console.log('\n[SECTION 4] Dynamic KPI Cards');

assert(
  dashboardCode.includes("displayClasses.map((className, idx) => {"),
  'KPI cards dynamically map over all displayClasses without rigid slice constraints'
);

assert(
  dashboardCode.includes("const count = students.filter((s) => s.class === className).length;"),
  'Each dynamic KPI card computes actual student count for that grade'
);

// Section 5: Settings Modal Configured Classes Input & Save
console.log('\n[SECTION 5] Settings Modal Configuration & Instant Live Sync');

assert(
  settingsCode.includes("const [classesInput, setClassesInput] = useState"),
  'SettingsModal has classesInput state initialized from school profile'
);

assert(
  settingsCode.includes("Configured Classes / Grades (Comma-separated)"),
  'SettingsModal provides form input for operator to configure classes/grades'
);

assert(
  settingsCode.includes("classes: sanitizeClasses(parsedClasses)") || settingsCode.includes("classes: parsedClasses.length > 0 ? parsedClasses : ['Class 7', 'Class 8', 'Class 9'],"),
  'SettingsModal saves parsed classes array into school profile on submit'
);

assert(
  serviceCode.includes("window.dispatchEvent(\n      new CustomEvent('gbhs_school_profile_changed'"),
  'saveSchoolProfile dispatches gbhs_school_profile_changed custom event for instant live UI re-rendering'
);

// Summary
console.log('\n=================================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED:      ${passedTests}`);
console.log(`FAILED:      ${totalTests - passedTests}`);
console.log('=================================================================\n');

if (passedTests === totalTests) {
  console.log('>>> ALL LIVE SCHOOL PROFILE & DASHBOARD BINDING TESTS PASSED! <<<\n');
  process.exit(0);
} else {
  console.error('>>> TESTS FAILED! <<<\n');
  process.exit(1);
}
