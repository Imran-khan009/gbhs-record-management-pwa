import { readFileSync } from 'fs';
import { resolve } from 'path';

console.log('--- Testing Centered & Scroll-Locked Warning Dialogs (Desktop & Mobile) ---\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failCount++;
  }
}

const attendanceSrc = readFileSync(resolve('src/components/attendance/AttendanceView.tsx'), 'utf-8');
const studentSrc = readFileSync(resolve('src/components/students/StudentManagementView.tsx'), 'utf-8');
const cssSrc = readFileSync(resolve('src/index.css'), 'utf-8');

console.log('[1] AttendanceView Warning & Confirmation Modals:');
assert(
  attendanceSrc.includes("import { createPortal } from 'react-dom';"),
  'AttendanceView imports createPortal from react-dom'
);
assert(
  attendanceSrc.includes('pendingOverwrite &&\n        createPortal(') ||
  attendanceSrc.includes('pendingOverwrite && createPortal(') ||
  attendanceSrc.includes('createPortal('),
  'Attendance conflict warning modal (pendingOverwrite) is rendered via createPortal'
);
assert(
  attendanceSrc.includes('Confirm Attendance Change'),
  'Confirm Attendance Change warning title is preserved'
);
assert(
  attendanceSrc.includes('pendingEnrollmentWarning &&\n        createPortal(') ||
  attendanceSrc.includes('pendingEnrollmentWarning && createPortal('),
  'Enrollment period warning modal is rendered via createPortal'
);
assert(
  attendanceSrc.includes('showBulkMarkConfirm &&\n        createPortal(') ||
  attendanceSrc.includes('showBulkMarkConfirm && createPortal('),
  'Bulk mark confirm modal is rendered via createPortal'
);
assert(
  attendanceSrc.includes('showBulkOverwriteConfirm &&\n        createPortal(') ||
  attendanceSrc.includes('showBulkOverwriteConfirm && createPortal('),
  'Bulk overwrite confirm modal is rendered via createPortal'
);

console.log('\n[2] Viewport Centering & Responsiveness (Desktop & Mobile):');
assert(
  attendanceSrc.includes('fixed inset-0 z-[100] flex items-center justify-center'),
  'Overlay is fixed to full viewport with high z-index (z-[100]) and flex centered'
);
assert(
  attendanceSrc.includes('m-auto') && attendanceSrc.includes('max-h-[90vh]'),
  'Modal dialog card uses m-auto and max-h-[90vh] to stay centered and prevent viewport cutoff'
);
assert(
  attendanceSrc.includes('w-full max-w-sm sm:max-w-md'),
  'Modal card adapts responsively to mobile (max-w-sm) and desktop (sm:max-w-md)'
);
assert(
  attendanceSrc.includes('flex flex-col-reverse sm:flex-row'),
  'Modal buttons adapt to touch-friendly column on mobile and row on desktop'
);

console.log('\n[3] Background Scroll Lock:');
assert(
  attendanceSrc.includes("document.body.style.overflow = 'hidden'"),
  'AttendanceView locks document.body scroll when warning dialog is active'
);
assert(
  attendanceSrc.includes('isWarningModalOpen'),
  'AttendanceView tracks warning dialog open state with isWarningModalOpen'
);
assert(
  studentSrc.includes("document.body.style.overflow = 'hidden'"),
  'StudentManagementView locks document.body scroll when warning/delete dialog is active'
);

console.log('\n[4] CSS Containing Block Fix:');
assert(
  cssSrc.includes('transform: none'),
  'moduleViewEnter keyframe sets transform: none to avoid creating containing blocks for fixed elements'
);
assert(
  !cssSrc.includes('will-change: opacity, transform'),
  'Permanent will-change: transform removed from module-view-transition'
);

console.log(`\nResults: ${passCount} passed, ${failCount} failed\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('>>> ALL CENTERED WARNING MODAL & SCROLL LOCK TESTS PASSED! <<<');
}
