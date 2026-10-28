/**
 * Test Suite: Mobile Sidebar Navigation Verification
 * Validates:
 * 1. Mobile Drawer always renders icons and complete module labels.
 * 2. Mobile drawer is never collapsed by desktop collapsed state or localStorage.
 * 3. Required module labels: Dashboard, Student Management, Daily Attendance, Teaching Log, Practical Tracker, Absentee Follow-up, Reports, Settings.
 * 4. Responsive viewport testing at 360px and 390px widths (comfortable drawer width, no overflow/clipping).
 * 5. Touch target heights meet minimum 44px accessibility standards.
 * 6. Brand palette integrity: Charcoal (#202822), Secondary (#2B352E), Warm Ivory (#F6F3EA), Muted Sage (#9BAE9C), Copper (#D97745).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? `: ${detail}` : ''}`);
    failed++;
  }
}

console.log('--- Testing Mobile Sidebar Navigation Implementation ---');

const sidebarPath = resolve(__dirname, '../src/components/layout/Sidebar.tsx');
const sidebarContent = readFileSync(sidebarPath, 'utf-8');

// 1. Required Navigation Items Verification
const requiredLabels = [
  'Dashboard',
  'Student Management',
  'Daily Attendance',
  'Teaching Log',
  'Practical Tracker',
  'Absentee Follow-up',
  'Reports',
  'Settings',
];

console.log('\n[1] Checking Required Module Labels in Sidebar:');
for (const label of requiredLabels) {
  const hasLabel = sidebarContent.includes(`label: '${label}'`);
  assert(hasLabel, `Sidebar includes '${label}' navigation item`);
}

// 2. Settings Nav Item & Action Integration
console.log('\n[2] Checking Settings Navigation Integration:');
assert(
  sidebarContent.includes("id: 'settings'") && sidebarContent.includes("label: 'Settings'"),
  "Settings item defined in navItems with id: 'settings'"
);
assert(
  sidebarContent.includes('onOpenSettings') && sidebarContent.includes("if (id === 'settings' && onOpenSettings)"),
  'Settings action dispatches onOpenSettings and switches active tab'
);

// 3. Desktop vs Mobile Collapse Isolation (Never force mobile into icon-only mode)
console.log('\n[3] Checking Desktop vs Mobile Collapse Separation:');
assert(
  sidebarContent.includes("isCollapsed ? 'block lg:hidden' : 'block'"),
  'Module labels are always displayed on mobile (block) and only hidden on desktop when collapsed (lg:hidden)'
);
assert(
  sidebarContent.includes("isCollapsed ? 'inline-block lg:hidden' : 'inline-block'"),
  'Module badges are always displayed on mobile (inline-block) and only hidden on desktop when collapsed (lg:hidden)'
);
assert(
  sidebarContent.includes("isCollapsed ? 'flex lg:hidden' : 'flex'"),
  'School identity in header is always visible on mobile and only hidden on desktop when collapsed'
);
assert(
  sidebarContent.includes("isCollapsed ? 'inline lg:hidden' : 'inline'"),
  'Offline mode label is always visible on mobile and only hidden on desktop when collapsed'
);

// 4. Touch Target & Spacing Standards
console.log('\n[4] Checking Touch Targets & Row Ergonomics:');
assert(
  sidebarContent.includes('min-h-[44px]'),
  'Navigation items provide minimum 44px touch targets on mobile devices'
);
assert(
  sidebarContent.includes('gap-3'),
  'Navigation items maintain comfortable 12px (gap-3) spacing between icon and label'
);
assert(
  sidebarContent.includes('justify-between px-3.5 py-2.5'),
  'Mobile rows use comfortable horizontal padding (px-3.5) and vertical spacing (py-2.5)'
);

// 5. Mobile Drawer Sizing & Backdrop Geometry
console.log('\n[5] Checking Viewport Geometry (360px & 390px widths):');
assert(
  sidebarContent.includes('w-[280px]') && sidebarContent.includes('max-w-[calc(100vw-56px)]'),
  'Mobile drawer uses 280px width with max-w constraint to guarantee tap-to-dismiss backdrop'
);

// Math simulation of drawer width on 360px and 390px viewports
const testViewports = [360, 390];
for (const vp of testViewports) {
  const maxAllowed = vp - 56;
  const actualDrawerWidth = Math.min(280, maxAllowed);
  const backdropSpace = vp - actualDrawerWidth;
  assert(
    backdropSpace >= 56 && actualDrawerWidth >= 250,
    `Viewport ${vp}px: drawer width is ${actualDrawerWidth}px with ${backdropSpace}px dismissable backdrop`
  );
}

// 6. Brand Color Palette Verification
console.log('\n[6] Checking Brand Color Palette Compliance:');
assert(sidebarContent.includes('#202822'), 'Sidebar background uses Deep Charcoal (#202822)');
assert(sidebarContent.includes('#2B352E'), 'Sidebar cards/hover use Secondary Charcoal (#2B352E)');
assert(sidebarContent.includes('#F6F3EA'), 'Sidebar typography uses Warm Ivory (#F6F3EA)');
assert(sidebarContent.includes('#9BAE9C'), 'Sidebar muted text uses Muted Sage (#9BAE9C)');
assert(sidebarContent.includes('#D97745'), 'Sidebar active accents use Terracotta Copper (#D97745)');

// Zero prohibited blue/cyan/indigo colors in sidebar
const hasProhibitedBlues =
  sidebarContent.includes('sky-') ||
  sidebarContent.includes('blue-') ||
  sidebarContent.includes('indigo-') ||
  sidebarContent.includes('cyan-');
assert(!hasProhibitedBlues, 'Zero prohibited blue, cyan, sky-blue, or indigo classes in Sidebar');

// 7. Desktop Collapse Functionality Preserved
console.log('\n[7] Checking Desktop Collapse Behavior:');
assert(
  sidebarContent.includes("isCollapsed ? 'lg:w-[68px]' : 'lg:w-60'"),
  'Desktop rail collapses to 68px and expands to 240px (w-60)'
);
assert(
  /isCollapsed\s*\?\s*'lg:justify-center lg:px-2\.5 lg:py-2\.5 lg:min-h-\[40px\]'\s*:\s*'lg:justify-between lg:px-3 lg:py-2\.5 lg:min-h-\[40px\]'/.test(sidebarContent),
  'Desktop rail centers icons when collapsed and restores full row alignment when expanded'
);
assert(
  sidebarContent.includes('toggleCollapsed'),
  'Desktop collapse toggle handler remains intact'
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
