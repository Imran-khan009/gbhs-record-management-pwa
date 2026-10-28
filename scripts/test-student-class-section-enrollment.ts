/**
 * Verification Suite: Student Admission Class & Section Dynamic Enrollment
 * 
 * Verifies:
 * 1. sanitizeClasses & sortClasses correctly purges "All Class" and sorts 1 to 10 in numeric order
 * 2. StudentFormModal has dynamic Class selection (Class 1-10) and Section selector (A, B, C, General)
 * 3. Student admission generates correct admission number including class & section
 * 4. DashboardView and StudentManagementView render both Class and Section badges
 * 5. recordService dispatches gbhs_students_changed for live reactivity
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { sanitizeClasses, sortClasses, DEFAULT_CLASSES } from '../src/services/schoolProfileService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName}`);
    if (details) console.error(`    Details: ${details}`);
  }
}

console.log('\n=============================================================================');
console.log('--- TEST SUITE: STUDENT ADMISSION DYNAMIC CLASS & SECTION ENROLLMENT ---');
console.log('=============================================================================\n');

// 1. Test sanitizeClasses & sortClasses functions directly
console.log('[1] Core Class Sanitization & Numeric Sorting Logic:');

const corruptedInput = ['All Class'];
const sanitizedFromCorrupt = sanitizeClasses(corruptedInput);
assert(
  !sanitizedFromCorrupt.includes('All Class') && sanitizedFromCorrupt.length === 10,
  'Purges single ["All Class"] and restores full Class 1-10 array'
);

const legacy3Classes = ['Class 7', 'Class 8', 'Class 9'];
const sanitizedLegacy = sanitizeClasses(legacy3Classes);
assert(
  sanitizedLegacy.length === 10 && sanitizedLegacy[0] === 'Class 1' && sanitizedLegacy[9] === 'Class 10',
  'Upgrades legacy 3 classes to full Class 1-10 spectrum'
);

const unsorted = ['Class 10', 'Class 2', 'Class 1', 'Class 9', 'Class 3'];
const sorted = sortClasses(unsorted);
assert(
  JSON.stringify(sorted) === JSON.stringify(['Class 1', 'Class 2', 'Class 3', 'Class 9', 'Class 10']),
  'sortClasses sorts classes in correct numeric order (1, 2, 3, 9, 10 instead of lexical 1, 10, 2)'
);

const mixedCorrupt = ['All Classes', 'all', 'Class 5', 'Class 1'];
const sanitizedMixed = sanitizeClasses(mixedCorrupt);
assert(
  sanitizedMixed.length === 2 && sanitizedMixed[0] === 'Class 1' && sanitizedMixed[1] === 'Class 5',
  'Filters out any string starting with "all" (case-insensitive) and keeps valid classes sorted'
);

// 2. Test StudentFormModal.tsx
console.log('\n[2] StudentFormModal Class & Section Implementation:');
const studentModalPath = resolve(process.cwd(), 'src/components/students/StudentFormModal.tsx');
const studentModalCode = readFileSync(studentModalPath, 'utf-8');

assert(
  studentModalCode.includes('sanitizeClasses') && studentModalCode.includes('sortClasses'),
  'StudentFormModal imports and uses sanitizeClasses and sortClasses'
);

assert(
  studentModalCode.includes('const rawClasses = sanitizeClasses(profile.classes);') &&
  studentModalCode.includes('const availableClasses = sortClasses('),
  'StudentFormModal dynamically cleans and numerically sorts availableClasses'
);

assert(
  studentModalCode.includes("const [section, setSection] = useState<Section>('A');"),
  'StudentFormModal maintains explicit section state initialized to Section A'
);

assert(
  studentModalCode.includes('section: section as Section'),
  'StudentFormModal stores selected section in the student payload'
);

assert(
  studentModalCode.includes('Section A') &&
  studentModalCode.includes('Section B') &&
  studentModalCode.includes('Section C') &&
  studentModalCode.includes('General Section'),
  'StudentFormModal renders dropdown options for Section A, B, C, and General'
);

assert(
  (studentModalCode.includes('{displayClasses.map((cls) => (') || studentModalCode.includes('{availableClasses.map((cls) => (')) &&
  !studentModalCode.includes('All Class'),
  'StudentFormModal iterates over availableClasses without any hardcoded All Class'
);

assert(
  studentModalCode.includes('`ADM-${classNum}${section}-${rollNo.trim().padStart(3, \'0\')}`'),
  'Student admission number includes dynamic class number and selected section (e.g. ADM-3B-001)'
);

// 3. Test StudentManagementView.tsx
console.log('\n[3] StudentManagementView Dynamic Classes & Section Display:');
const studentViewPath = resolve(process.cwd(), 'src/components/students/StudentManagementView.tsx');
const studentViewCode = readFileSync(studentViewPath, 'utf-8');

assert(
  studentViewCode.includes('Student Master Directory'),
  'StudentManagementView displays dynamic "Student Master Directory" title'
);

assert(
  studentViewCode.includes('classes={displayClasses}'),
  'StudentManagementView passes dynamic displayClasses to ClassTabs'
);

assert(
  studentViewCode.includes('Sec {student.section || \'A\'}'),
  'StudentManagementView displays Section badge for each student row'
);

assert(
  studentViewCode.includes("defaultClass={(!selectedClass || selectedClass.startsWith('All')) ? 'Class 1' : (selectedClass as ClassLevel)}"),
  'StudentManagementView guards defaultClass so it never passes "All" to the admission modal'
);

// 4. Test DashboardView.tsx
console.log('\n[4] DashboardView Section Display & Reactive Bindings:');
const dashboardPath = resolve(process.cwd(), 'src/components/dashboard/DashboardView.tsx');
const dashboardCode = readFileSync(dashboardPath, 'utf-8');

assert(
  dashboardCode.includes('Sec {s.section || \'A\'}'),
  'DashboardView student master roster table displays Section badge for each learner'
);

assert(
  dashboardCode.includes('sortClasses(sanitizeClasses(profile.classes))'),
  'DashboardView computes configuredClasses using sortClasses and sanitizeClasses'
);

assert(
  dashboardCode.includes("window.addEventListener('gbhs_students_changed'"),
  'DashboardView listens for gbhs_students_changed for instant live reactivity'
);

// 5. Test recordService.ts
console.log('\n[5] recordService Live Reactivity Events:');
const recordServicePath = resolve(process.cwd(), 'src/services/recordService.ts');
const recordServiceCode = readFileSync(recordServicePath, 'utf-8');

assert(
  recordServiceCode.includes("window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: newStudent }));"),
  'createStudent dispatches gbhs_students_changed on student creation'
);

assert(
  recordServiceCode.includes("window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: updatedStudent }));"),
  'updateStudent dispatches gbhs_students_changed on student update'
);

assert(
  recordServiceCode.includes("window.dispatchEvent(new CustomEvent('gbhs_students_changed', { detail: { id } }));"),
  'deleteStudent dispatches gbhs_students_changed on student deletion'
);

console.log('\n=============================================================================');
console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('=============================================================================\n');

if (failed > 0) {
  process.exit(1);
}
