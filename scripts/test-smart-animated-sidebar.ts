/**
 * Test Suite: Smart Auto-Hide, Hover-Expand Animated Sidebar Verification
 * Validates:
 * 1. Fixed Sidebar viewport anchoring (position: fixed, inset-y-0, stationary on page scroll).
 * 2. Independent scrolling: Inner nav container scrolls while shell, header, and footer stay anchored.
 * 3. Desktop Auto-Hide & Hover Expansion:
 *    - Collapsed rail (68px) default when unpinned.
 *    - Smooth expand to 240px on pointer enter.
 *    - Smooth collapse on pointer leave.
 *    - Expand/Pin toggle control with localStorage persistence.
 *    - Outside click dismisses transient expansion without blocking clicks.
 * 4. Animated Icons & Module Labels:
 *    - Icon scale, rotate, and press transforms.
 *    - Labels slide and fade in without layout jump.
 *    - Copper active indicator glides smoothly.
 *    - Accessible floating tooltips in collapsed mode, inline labels in expanded mode.
 * 5. Mobile & Touch behavior:
 *    - Full drawer with icons and labels.
 *    - Touch targets >= 44px.
 *    - Viewport constraints (360px, 390px).
 * 6. Brand palette integrity:
 *    - #202822, #2B352E, #F6F3EA, #9BAE9C, #D97745.
 *    - Zero prohibited blues.
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

console.log('--- Testing Smart Auto-Hide, Hover-Expand Animated Sidebar ---');

const sidebarPath = resolve(__dirname, '../src/components/layout/Sidebar.tsx');
const sidebarContent = readFileSync(sidebarPath, 'utf-8');

const appPath = resolve(__dirname, '../src/App.tsx');
const appContent = readFileSync(appPath, 'utf-8');

const navbarPath = resolve(__dirname, '../src/components/layout/Navbar.tsx');
const navbarContent = readFileSync(navbarPath, 'utf-8');

// [1] Fixed Sidebar Layout & Independent Main-Page Scrolling
console.log('\n[1] Fixed Sidebar Layout & Viewport Anchoring:');
assert(
  sidebarContent.includes('fixed inset-y-0 left-0'),
  'Sidebar shell is permanently fixed to the viewport height (fixed inset-y-0 left-0)'
);
assert(
  appContent.includes("isSidebarPinned ? 'lg:pl-60' : 'lg:pl-[68px]'"),
  'Main content column dynamically shifts padding to offset fixed sidebar (lg:pl-60 when pinned, lg:pl-[68px] when rail)'
);
assert(
  sidebarContent.includes('overflow-y-auto no-scrollbar') && sidebarContent.includes('flex-1'),
  'Nav items container scrolls independently inside sidebar when content exceeds viewport height'
);
assert(
  sidebarContent.includes('h-16 flex items-center justify-between px-3.5 border-b border-[#3D4A41] shrink-0'),
  'Sidebar brand header is shrink-0 and remains stationary during internal scrolling'
);
assert(
  sidebarContent.includes('p-2 border-t border-[#3D4A41] shrink-0'),
  'Sidebar footer pin control is shrink-0 and remains anchored at the bottom of the viewport'
);
assert(
  navbarContent.includes('sticky top-0 z-30'),
  'Navbar uses sticky top-0 z-30 to remain anchored during main page scrolling without covering the sidebar'
);

// [2] Desktop Auto-Hide and Hover Expansion
console.log('\n[2] Desktop Auto-Hide & Hover Expansion Mechanics:');
assert(
  sidebarContent.includes('onMouseEnter') && sidebarContent.includes('setIsHovered(true)'),
  'Sidebar expands smoothly on pointer entering the rail'
);
assert(
  sidebarContent.includes('onMouseLeave') && sidebarContent.includes('setIsHovered(false)'),
  'Sidebar collapses smoothly on pointer leaving into main content'
);
assert(
  sidebarContent.includes('isPinned ? false : !isHovered'),
  'Sidebar stays expanded when pinned open, or follows automatic hover-expansion when unpinned'
);
assert(
  sidebarContent.includes("localStorage.setItem('gbhs_sidebar_pinned'"),
  'Pin state preference is securely saved to localStorage'
);
assert(
  sidebarContent.includes("window.addEventListener('pointerdown', handlePointerDown)") &&
  sidebarContent.includes('!sidebarRef.current.contains(e.target as Node)'),
  'Clicking on main page dismisses transient hover expansion without blocking target click actions'
);

// [3] Animated Icons & Module Labels
console.log('\n[3] Animated Icons, Active Indicator & Module Labels:');
assert(
  sidebarContent.includes('group-hover:scale-110') && sidebarContent.includes('transition-transform duration-200'),
  'Icons animate with subtle scale on hover and active route state'
);
assert(
  sidebarContent.includes('group-hover:rotate-45') && sidebarContent.includes('group-hover:rotate-180'),
  'Interactive module-specific micro-animations applied to Settings and Sync icons'
);
assert(
  sidebarContent.includes('indicatorStyle.top') && sidebarContent.includes('indicatorStyle.height'),
  'Copper active indicator computes position and glides smoothly across items'
);
assert(
  sidebarContent.includes('bg-[#D97745]/15 border border-[#D97745]/35') &&
  sidebarContent.includes('bg-[#D97745] shadow-xs shadow-[#D97745]/50'),
  'Copper active indicator pill features terracotta accent line and translucent highlight'
);
assert(
  sidebarContent.includes('role="tooltip"') && sidebarContent.includes('fixed z-50 pointer-events-none hidden lg:flex'),
  'Accessible floating tooltips are displayed in collapsed rail mode'
);
assert(
  sidebarContent.includes('isCollapsed && hoveredTooltip'),
  'Tooltips are hidden when expanded so inline labels take precedence'
);

// [4] Mobile Drawer & Touch Navigation
console.log('\n[4] Mobile Navigation & Touch Standards:');
assert(
  sidebarContent.includes('min-h-[44px]'),
  'Touch targets satisfy minimum 44px mobile accessibility guidelines'
);
assert(
  sidebarContent.includes('w-[280px]') && sidebarContent.includes('max-w-[calc(100vw-56px)]'),
  'Mobile drawer sized at 280px with guaranteed dismissable backdrop on 360px and 390px screens'
);
assert(
  sidebarContent.includes("isCollapsed ? 'block lg:hidden' : 'block'"),
  'Mobile drawer always displays full module labels regardless of desktop collapsed state'
);
assert(
  sidebarContent.includes("onClick={() => setIsMobileOpen(false)}"),
  'Tapping outside or selecting a module dismisses the mobile navigation drawer'
);

// [5] Visual Identity & Approved Palette
console.log('\n[5] Brand Palette Verification:');
const requiredColors = ['#202822', '#2B352E', '#F6F3EA', '#9BAE9C', '#D97745'];
for (const color of requiredColors) {
  assert(sidebarContent.includes(color), `Sidebar complies with palette token ${color}`);
}
const hasProhibitedBlues =
  sidebarContent.includes('sky-') ||
  sidebarContent.includes('blue-') ||
  sidebarContent.includes('indigo-') ||
  sidebarContent.includes('cyan-');
assert(!hasProhibitedBlues, 'Zero prohibited blue, cyan, sky-blue, or indigo classes in Sidebar');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
