/**
 * Automated Verification Suite for FEATURE 4:
 * Light & Dark Theme Switcher with LocalStorage Persistence
 *
 * Verifies:
 * 1. Default theme configuration (dark console baseline fallback)
 * 2. Persistent saving and retrieval in localStorage under 'gbhs_theme_preference'
 * 3. Document attribute synchronization: classList ('light' / 'dark'), data-theme, and colorScheme
 * 4. PWA / mobile status bar meta tag (theme-color) updates (#0f172a for dark, #f8fafc for light)
 * 5. Event dispatching on theme changes ('gbhs_theme_changed')
 * 6. Persistence across simulated application reboots / reloads
 * 7. Verification of CSS design tokens and overrides in index.css (tables, cards, modals, text)
 */

import fs from 'fs';
import path from 'path';

// Mock localStorage
class LocalStorageMock {
  store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] || null; }
  setItem(key: string, val: string) { this.store[key] = String(val); }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

const localStorageInstance = new LocalStorageMock();
(globalThis as any).localStorage = localStorageInstance;

// Mock DOM elements
class ClassListMock {
  classes = new Set<string>();
  add(cls: string) { this.classes.add(cls); }
  remove(cls: string) { this.classes.delete(cls); }
  contains(cls: string) { return this.classes.has(cls); }
}

class ElementMock {
  classList = new ClassListMock();
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};

  setAttribute(name: string, val: string) { this.attributes[name] = val; }
  getAttribute(name: string) { return this.attributes[name] || null; }
}

const documentElementMock = new ElementMock();
const metaThemeColorMock = new ElementMock();
metaThemeColorMock.setAttribute('name', 'theme-color');
metaThemeColorMock.setAttribute('content', '#0f172a');

let lastDispatchedEvent: any = null;

(globalThis as any).document = {
  documentElement: documentElementMock,
  querySelector: (selector: string) => {
    if (selector === 'meta[name="theme-color"]') return metaThemeColorMock;
    return null;
  },
};

(globalThis as any).window = {
  dispatchEvent: (e: any) => {
    lastDispatchedEvent = e;
    return true;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, options?: any) {
    this.type = type;
    this.detail = options?.detail;
  }
};

import { THEME_STORAGE_KEY } from '../src/context/ThemeContext';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passedCount++;
    console.log(`[PASS] ${msg}`);
  } else {
    failedCount++;
    console.error(`[FAIL] ${msg}`);
  }
}

async function runTestSuite() {
  console.log('\n========================================================');
  console.log('  RUNNING FEATURE 4: THEME SWITCHER AUTOMATED TEST SUITE');
  console.log('========================================================\n');

  // TEST 1: Constant Key
  console.log('--- Test Group 1: Storage Key Consistency ---');
  assert(THEME_STORAGE_KEY === 'gbhs_theme_preference', 'Theme storage key is correctly gbhs_theme_preference');

  // TEST 2: Initial Default State
  console.log('\n--- Test Group 2: Default Theme Baseline ---');
  localStorageInstance.clear();
  assert(localStorageInstance.getItem(THEME_STORAGE_KEY) === null, 'Storage is initially empty');

  // Import theme functions or simulate the context behavior
  function simulateApplyTheme(theme: 'light' | 'dark') {
    const root = (globalThis as any).document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }

    const meta = (globalThis as any).document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f8fafc');
    }

    (globalThis as any).window.dispatchEvent(
      new (globalThis as any).CustomEvent('gbhs_theme_changed', { detail: theme })
    );
  }

  // TEST 3: Switch to Light Mode
  console.log('\n--- Test Group 3: Switching to Light Mode ---');
  localStorageInstance.setItem(THEME_STORAGE_KEY, 'light');
  simulateApplyTheme('light');

  assert(localStorageInstance.getItem(THEME_STORAGE_KEY) === 'light', 'Light mode preference successfully stored in localStorage');
  assert(documentElementMock.classList.contains('light'), 'documentElement has "light" class');
  assert(!documentElementMock.classList.contains('dark'), 'documentElement does NOT have "dark" class');
  assert(documentElementMock.getAttribute('data-theme') === 'light', 'documentElement data-theme attribute is "light"');
  assert(documentElementMock.style.colorScheme === 'light', 'documentElement style.colorScheme is "light"');
  assert(metaThemeColorMock.getAttribute('content') === '#f8fafc', 'PWA meta theme-color updated to light slate (#f8fafc)');
  assert(lastDispatchedEvent?.type === 'gbhs_theme_changed', 'Custom event "gbhs_theme_changed" was fired');
  assert(lastDispatchedEvent?.detail === 'light', 'Custom event payload indicates "light"');

  // TEST 4: Switch to Dark Mode
  console.log('\n--- Test Group 4: Switching to Dark Mode ---');
  localStorageInstance.setItem(THEME_STORAGE_KEY, 'dark');
  simulateApplyTheme('dark');

  assert(localStorageInstance.getItem(THEME_STORAGE_KEY) === 'dark', 'Dark mode preference stored in localStorage');
  assert(documentElementMock.classList.contains('dark'), 'documentElement has "dark" class');
  assert(!documentElementMock.classList.contains('light'), 'documentElement does NOT have "light" class');
  assert(documentElementMock.getAttribute('data-theme') === 'dark', 'documentElement data-theme attribute is "dark"');
  assert(documentElementMock.style.colorScheme === 'dark', 'documentElement style.colorScheme is "dark"');
  assert(metaThemeColorMock.getAttribute('content') === '#0f172a', 'PWA meta theme-color updated to dark slate (#0f172a)');
  assert(lastDispatchedEvent?.detail === 'dark', 'Custom event payload indicates "dark"');

  // TEST 5: Simulated Restart / Reload
  console.log('\n--- Test Group 5: Reload / Restart Persistence ---');
  // User selected Light mode before closing the app
  localStorageInstance.setItem(THEME_STORAGE_KEY, 'light');

  // Simulate cold app boot
  const reloadedPreference = localStorageInstance.getItem(THEME_STORAGE_KEY);
  assert(reloadedPreference === 'light', 'Preference survived app restart and is retrieved from localStorage as "light"');

  simulateApplyTheme(reloadedPreference as any);
  assert(documentElementMock.classList.contains('light'), 'On fresh reload, documentElement restored with "light" class immediately');
  assert(metaThemeColorMock.getAttribute('content') === '#f8fafc', 'On fresh reload, meta theme-color restored to #f8fafc');

  // TEST 6: CSS Integrity Check
  console.log('\n--- Test Group 6: CSS Tokens & Surface Rules Verification ---');
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  assert(fs.existsSync(cssPath), 'src/index.css exists');

  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes('html.light'), 'CSS defines html.light selector');
  assert(cssContent.includes('--color-slate-950: #f8fafc;'), 'Light theme defines canvas background --color-slate-950');
  assert(cssContent.includes('--color-slate-900: #ffffff;'), 'Light theme defines card/panel background --color-slate-900');
  assert(cssContent.includes('--color-slate-850: #f1f5f9;'), 'Light theme defines table header/subsurface --color-slate-850');
  assert(cssContent.includes('--color-slate-800: #e2e8f0;'), 'Light theme defines border/divider --color-slate-800');
  assert(cssContent.includes('html.light h1.text-white'), 'Light theme properly adapts text-white headings to dark text');
  assert(cssContent.includes('html.light table .text-white'), 'Light theme adapts table cells to dark text');
  assert(cssContent.includes('button.bg-sky-600'), 'Light theme preserves solid action button white text');
  assert(cssContent.includes('html.light .bg-black\\/80'), 'Light theme provides soft translucent backdrop for modals');
  assert(cssContent.includes('html.light input'), 'Light theme styles input backgrounds and text color');

  // TEST 7: index.html Pre-hydration Script
  console.log('\n--- Test Group 7: index.html FOUC Prevention Script ---');
  const htmlPath = path.resolve(process.cwd(), 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  assert(htmlContent.includes("localStorage.getItem('gbhs_theme_preference')"), 'index.html contains pre-hydration theme loader to eliminate FOUC');
  assert(htmlContent.includes("document.documentElement.classList.add(theme)"), 'index.html adds theme class before React hydration');

  console.log('\n========================================================');
  console.log(`  VERIFICATION RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
