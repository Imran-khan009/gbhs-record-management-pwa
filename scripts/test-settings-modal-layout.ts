/**
 * Automated Verification: Settings Modal Layout & Scrolling Fix
 * Verifies:
 * 1. max-h-[90vh] constraint on dialog container
 * 2. flex-col layout on dialog container
 * 3. shrink-0 pinned header with visible title & close button
 * 4. overflow-y-auto flex-1 on internal scrollable body
 * 5. shrink-0 sticky footer action bar
 * 6. Responsive form elements and grids
 * 7. ESC key handling & backdrop dismissal
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

console.log('\n============================================================');
console.log('--- VERIFICATION SUITE: SETTINGS MODAL LAYOUT & SCROLLING ---');
console.log('============================================================\n');

const settingsModalPath = resolve(process.cwd(), 'src/components/settings/SettingsModal.tsx');
const content = readFileSync(settingsModalPath, 'utf-8');

// 1. Modal Overlay & Container Structure
console.log('[SECTION 1] Modal Overlay & Container Layout');

assert(
  content.includes('fixed inset-0 z-50 flex items-center justify-center bg-black/80'),
  'Overlay is fixed, full viewport (inset-0), centered, and high z-index (z-50)'
);

assert(
  !content.includes('fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs overflow-y-auto'),
  'Outer overlay no longer has conflicting overflow-y-auto that causes negative coordinate scroll locks'
);

assert(
  content.includes('max-h-[90vh]'),
  'Dialog container has strict max-height constraint (max-h-[90vh])'
);

assert(
  content.includes('flex flex-col'),
  'Dialog container uses flex-col layout for header/body/footer separation'
);

assert(
  content.includes('max-w-3xl lg:max-w-4xl'),
  'Dialog container uses responsive maximum width (max-w-3xl lg:max-w-4xl)'
);

assert(
  content.includes('rounded-2xl shadow-2xl overflow-hidden'),
  'Dialog container clips internal scrollbars with rounded-2xl overflow-hidden'
);

// 2. Pinned Header
console.log('\n[SECTION 2] Pinned Modal Header');

assert(
  content.includes('shrink-0 z-10') && (content.includes('bg-slate-850') || content.includes('bg-[#2B352E]')),
  'Modal header has shrink-0 and z-10 to stay pinned and never compress'
);

assert(
  content.includes('Sliders className="w-4 h-4"'),
  'Modal header displays system settings icon'
);

assert(
  content.includes('title="Close Settings (Esc)"'),
  'Modal header includes accessible close button with Esc shortcut tooltip'
);

// 3. Scrollable Modal Body
console.log('\n[SECTION 3] Internal Scrolling Body');

assert(
  content.includes('overflow-y-auto flex-1 overscroll-contain'),
  'Inner body has overflow-y-auto, flex-1, and overscroll-contain for smooth contained scrolling'
);

// 4. Pinned Sticky Footer
console.log('\n[SECTION 4] Pinned Sticky Footer Action Bar');

assert(
  content.includes('shrink-0 flex items-center justify-between px-6 py-3.5') && content.includes('backdrop-blur-xs z-10'),
  'Sticky footer bar is pinned with shrink-0, backdrop blur, and border-t'
);

assert(
  content.includes('Close Settings'),
  'Sticky footer includes dedicated "Close Settings" action button'
);

// 5. Responsive Setting Cards
console.log('\n[SECTION 5] Responsive Setting Cards Scaling');

assert(
  content.includes('School Profile & Institution Setup'),
  'School Profile card is present'
);

assert(
  content.includes('User Registrations & Staff Access Control'),
  'User Management & Staff Access card is present'
);

assert(
  content.includes('Safe Local Data Backup (JSON Export)'),
  'Safe Local Data Backup card is present'
);

assert(
  content.includes('grid-cols-2 sm:grid-cols-4 gap-2'),
  'Backup card 8 IndexedDB stores scale responsively (2 cols mobile, 4 cols sm+)'
);

assert(
  content.includes('flex flex-col sm:flex-row gap-2'),
  'User registration form stacks vertically on mobile (flex-col sm:flex-row)'
);

assert(
  content.includes('flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1'),
  'Backup action row wraps responsively on mobile without content collision'
);

// 6. Escape Key Listener & Backdrop Dismissal
console.log('\n[SECTION 6] Accessibility & Interaction Controls');

assert(
  content.includes("e.key === 'Escape'"),
  'Escape key event listener implemented to cleanly dismiss modal'
);

assert(
  content.includes('e.target === e.currentTarget'),
  'Backdrop click handler implemented to close modal when clicking outside'
);

// Summary
console.log('\n============================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED:      ${passedTests}`);
console.log(`FAILED:      ${totalTests - passedTests}`);
console.log('============================================================\n');

if (passedTests === totalTests) {
  console.log('>>> ALL SETTINGS MODAL LAYOUT & SCROLLING TESTS PASSED SUCCESSFULLY! <<<\n');
  process.exit(0);
} else {
  console.error('>>> SOME TESTS FAILED! <<<\n');
  process.exit(1);
}
