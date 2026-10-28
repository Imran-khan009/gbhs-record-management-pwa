import { ClassLevel } from '../types/student';

export const CANONICAL_CLASSES: ClassLevel[] = [
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
];

/**
 * Checks whether a given string is exactly one of the canonical Classes 1–10.
 */
export function isCanonicalClass(cls: any): boolean {
  return typeof cls === 'string' && CANONICAL_CLASSES.includes(cls as ClassLevel);
}

/**
 * Standard class normalization strategy used across student import, bulk operations,
 * and module imports.
 *
 * Accepts: Canonical Classes 1–10 and supported aliases (Arabic numerals, ordinals,
 * words, Roman numerals I–X, Urdu numerals, Urdu words, Class/Grade prefixes).
 * Rejects: Blank, whitespace, placeholders, zero, negative numbers, out-of-range
 * (Class 11, Class 12, etc.), and malformed strings by returning null.
 * NEVER silently defaults to Class 7.
 */
export function normalizeClass(raw: any, availableClasses?: string[]): ClassLevel | null {
  if (raw === null || raw === undefined) return null;

  const rawStr = String(raw).trim();
  if (!rawStr) return null;

  const lower = rawStr.toLowerCase();

  // Reject placeholder and null-like strings
  if (
    lower === '-' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'none' ||
    lower === 'empty' ||
    lower === 'n/a' ||
    lower === 'na'
  ) {
    return null;
  }

  // Reject negative numbers
  if (rawStr.startsWith('-') || /-\s*\d+/.test(rawStr) || /class\s*-\s*\d+/i.test(rawStr)) {
    return null;
  }

  // Reject zero and class 0
  if (
    lower === '0' ||
    lower === '0th' ||
    lower === 'class 0' ||
    lower === 'grade 0' ||
    lower === 'zero' ||
    /^(?:class|grade)?\s*0+(?:th)?$/i.test(rawStr)
  ) {
    return null;
  }

  // Explicitly reject Class 11, 12, or higher (numeric, ordinal, Roman)
  if (
    /\b(?:1[1-9]|[2-9][0-9]+)(?:st|nd|rd|th)?\b/i.test(rawStr) ||
    lower.includes('11') ||
    lower.includes('12') ||
    /\b(?:xi|xii|xiii|xiv|xv|xvi)\b/i.test(lower)
  ) {
    return null;
  }

  // Exact canonical match check (case-insensitive & whitespace-collapsed)
  const collapsed = lower.replace(/\s+/g, ' ');
  for (const c of CANONICAL_CLASSES) {
    if (collapsed === c.toLowerCase()) {
      return c;
    }
  }

  // Check Eastern Arabic / Urdu numerals
  if (rawStr.includes('۱۰')) return 'Class 10';
  if (rawStr.includes('۱')) return 'Class 1';
  if (rawStr.includes('۲')) return 'Class 2';
  if (rawStr.includes('۳')) return 'Class 3';
  if (rawStr.includes('۴')) return 'Class 4';
  if (rawStr.includes('۵')) return 'Class 5';
  if (rawStr.includes('۶')) return 'Class 6';
  if (rawStr.includes('۷')) return 'Class 7';
  if (rawStr.includes('۸')) return 'Class 8';
  if (rawStr.includes('۹')) return 'Class 9';

  // Check Urdu words
  if (lower.includes('دسویں') || lower.includes('دہم')) return 'Class 10';
  if (lower.includes('پہلی') || lower.includes('اول')) return 'Class 1';
  if (lower.includes('دوسری') || lower.includes('دوم')) return 'Class 2';
  if (lower.includes('تیسری') || lower.includes('سوم')) return 'Class 3';
  if (lower.includes('چوتھی') || lower.includes('چہارم')) return 'Class 4';
  if (lower.includes('پانچویں') || lower.includes('پنجم')) return 'Class 5';
  if (lower.includes('چھٹی') || lower.includes('ششم')) return 'Class 6';
  if (lower.includes('ساتویں') || lower.includes('ہفتم')) return 'Class 7';
  if (lower.includes('آٹھویں') || lower.includes('ہشتم')) return 'Class 8';
  if (lower.includes('نویں') || lower.includes('نہم')) return 'Class 9';

  // Check Roman numerals (standalone or with class/grade prefix)
  // Check in descending order of length to avoid prefix collision
  if (/\b(?:class|grade)?\s*(?:viii)\b/i.test(lower)) return 'Class 8';
  if (/\b(?:class|grade)?\s*(?:vii)\b/i.test(lower)) return 'Class 7';
  if (/\b(?:class|grade)?\s*(?:vi)\b/i.test(lower)) return 'Class 6';
  if (/\b(?:class|grade)?\s*(?:iv)\b/i.test(lower)) return 'Class 4';
  if (/\b(?:class|grade)?\s*(?:iii)\b/i.test(lower)) return 'Class 3';
  if (/\b(?:class|grade)?\s*(?:ii)\b/i.test(lower)) return 'Class 2';
  if (/\b(?:class|grade)?\s*(?:ix)\b/i.test(lower)) return 'Class 9';
  if (/\b(?:class|grade)?\s*(?:x)\b/i.test(lower)) return 'Class 10';
  if (/\b(?:class|grade)?\s*(?:v)\b/i.test(lower)) return 'Class 5';
  if (/\b(?:class|grade)?\s*(?:i)\b/i.test(lower)) return 'Class 1';

  // Check English words & ordinals
  if (/\b(?:tenth|10th)\b/i.test(lower)) return 'Class 10';
  if (/\b(?:ninth|9th)\b/i.test(lower)) return 'Class 9';
  if (/\b(?:eighth|8th)\b/i.test(lower)) return 'Class 8';
  if (/\b(?:seventh|7th)\b/i.test(lower)) return 'Class 7';
  if (/\b(?:sixth|6th)\b/i.test(lower)) return 'Class 6';
  if (/\b(?:fifth|5th)\b/i.test(lower)) return 'Class 5';
  if (/\b(?:fourth|4th)\b/i.test(lower)) return 'Class 4';
  if (/\b(?:third|3rd)\b/i.test(lower)) return 'Class 3';
  if (/\b(?:second|2nd)\b/i.test(lower)) return 'Class 2';
  if (/\b(?:first|1st)\b/i.test(lower)) return 'Class 1';

  // Check clean alphanumeric forms: 1 to 10
  const cleanAlphanum = lower.replace(/[^a-z0-9]/g, '');
  for (let n = 1; n <= 10; n++) {
    const ord = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
    if (
      cleanAlphanum === String(n) ||
      cleanAlphanum === ord ||
      cleanAlphanum === `class${n}` ||
      cleanAlphanum === `grade${n}` ||
      cleanAlphanum === `class${ord}` ||
      cleanAlphanum === `grade${ord}`
    ) {
      return `Class ${n}`;
    }
  }

  // Regex extraction for forms like "Class 10-A", "7-A", "Class 8 Sec B", "Class 1 (A)"
  const numMatch = lower.match(/(?:class|grade)?\s*(10|[1-9])(?:st|nd|rd|th)?(?:\s*(?:sec|section)?\s*[-_/\s:(]*[a-z]\)?)?$/i);
  if (numMatch && numMatch[1]) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1 && num <= 10) {
      return `Class ${num}`;
    }
  }

  // Check availableClasses if provided (e.g. from school profile)
  if (availableClasses && availableClasses.length > 0) {
    const matched = availableClasses.find((c) => {
      const cClean = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cClean === cleanAlphanum || c.trim().toLowerCase() === collapsed;
    });
    if (matched) return matched as ClassLevel;
  }

  return null;
}

/**
 * Returns consistent Tailwind badge color classes for a given class level (Classes 1–10).
 * Preserves the exact existing styling for Class 7, 8, 9 while providing vibrant,
 * distinct colors for Classes 1–6 and 10.
 */
export function getClassBadgeColor(cls: string): string {
  switch (cls) {
    case 'Class 1': return 'bg-[#9BAE9C]/15 text-[#9BAE9C] border border-[#9BAE9C]/30';
    case 'Class 2': return 'bg-teal-500/10 text-teal-400 border border-teal-500/30';
    case 'Class 3': return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
    case 'Class 4': return 'bg-orange-500/10 text-orange-400 border border-orange-500/30';
    case 'Class 5': return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
    case 'Class 6': return 'bg-purple-500/10 text-purple-400 border border-purple-500/30';
    case 'Class 7': return 'bg-[#D97745]/15 text-[#D97745] border border-[#D97745]/30';
    case 'Class 8': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    case 'Class 9': return 'bg-[#F6F3EA]/15 text-[#F6F3EA] border border-[#F6F3EA]/30';
    case 'Class 10': return 'bg-violet-500/10 text-violet-400 border border-violet-500/30';
    default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
  }
}

