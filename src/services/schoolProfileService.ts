import { getAppState, setAppState, getActiveWorkspaceId } from './db';
import { getCustomLogoUrl, saveCustomLogoUrl, resetCustomLogo, DEFAULT_LOGO_URL } from './logoService';
import { getSupabase } from './supabase';
import { useState, useEffect } from 'react';

export interface SchoolProfile {
  schoolName: string;         // Full school name (e.g. "Govt Boys High School Jam Yousuf Colony")
  schoolShortName: string;    // Abbreviated name for badges & navbar (e.g. "GBHS Jam Yousuf Colony")
  district: string;           // District / Division (e.g. "Hub, Lasbela")
  consoleTitle?: string;      // Dynamic console title (e.g. "Computer Operator Console")
  operatorTitle?: string;     // Custom title for master operator (e.g. "Lead Computer Operator & Systems Administrator")
  principalName: string;      // Principal or Headmaster (e.g. "Prof. Abdul Rasheed")
  principalPhone?: string;    // Office or principal contact
  emisCode?: string;          // Institution code (e.g. "GBHS-MAIN")
  address?: string;           // Campus location
  academicYear?: string;      // Current academic year (e.g. "2026-2027")
  logoUrl?: string;           // Logo URL or Base64 data URI
  classes?: string[];         // Configured classes/grades (e.g. ['Class 7', 'Class 8', 'Class 9'])
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_CLASSES: string[] = [
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

export const DEFAULT_SCHOOL_PROFILE: SchoolProfile = {
  schoolName: 'Govt Boys High School Jam Yousuf Colony',
  schoolShortName: 'GBHS Jam Yousuf Colony',
  district: 'Hub, Lasbela',
  consoleTitle: 'Computer Operator Console',
  operatorTitle: 'Lead Computer Operator & Systems Administrator',
  principalName: 'Prof. Abdul Rasheed',
  principalPhone: '',
  emisCode: 'GBHS-MAIN',
  address: 'Jam Yousuf Colony, Hub, Balochistan',
  academicYear: '2026-2027',
  logoUrl: DEFAULT_LOGO_URL,
  classes: DEFAULT_CLASSES,
};

export function sortClasses(classes: string[]): string[] {
  return [...classes].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
}

export function sanitizeClasses(classes?: any): string[] {
  if (!Array.isArray(classes) || classes.length === 0) return [...DEFAULT_CLASSES];
  const filtered = classes
    .map((c: any) => String(c || '').trim())
    .filter((c: string) => {
      if (!c) return false;
      const lower = c.toLowerCase();
      return !lower.startsWith('all') && lower !== 'all class' && lower !== 'all classes';
    });
  if (filtered.length === 0) return [...DEFAULT_CLASSES];
  // If legacy 3 classes are stored, upgrade to full Class 1-10 spectrum
  if (filtered.length === 3 && filtered.includes('Class 7') && filtered.includes('Class 8') && filtered.includes('Class 9')) {
    return [...DEFAULT_CLASSES];
  }
  return sortClasses(filtered);
}

const STORAGE_KEY_PREFIX = 'gbhs_school_profile';

/**
 * Retrieve the current school profile synchronously from localStorage or defaults.
 * Strictly isolates workspace profile so authenticated workspaces never fall back to unscoped global keys.
 */
export function getSchoolProfile(workspaceId?: string): SchoolProfile {
  try {
    const wsId = workspaceId || getActiveWorkspaceId();
    if (wsId) {
      const tenantKey = `${STORAGE_KEY_PREFIX}_${wsId}`;
      const tenantRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(tenantKey) : null;
      if (tenantRaw) {
        const parsed = JSON.parse(tenantRaw);
        return {
          ...DEFAULT_SCHOOL_PROFILE,
          ...parsed,
          classes: sanitizeClasses(parsed.classes),
          logoUrl: parsed.logoUrl || getCustomLogoUrl(wsId) || DEFAULT_SCHOOL_PROFILE.logoUrl,
        };
      }
      // An authenticated workspace exists, but no custom profile is saved for it yet.
      // Must NOT fall back to unscoped global key (which would leak Owner's profile to new users).
      return {
        ...DEFAULT_SCHOOL_PROFILE,
        classes: DEFAULT_CLASSES,
        logoUrl: getCustomLogoUrl(wsId) || DEFAULT_SCHOOL_PROFILE.logoUrl,
      };
    }

    // Fall back to the legacy unscoped key ONLY when no workspace is active at all
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_PREFIX) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SCHOOL_PROFILE,
        ...parsed,
        classes: sanitizeClasses(parsed.classes),
        logoUrl: parsed.logoUrl || getCustomLogoUrl() || DEFAULT_SCHOOL_PROFILE.logoUrl,
      };
    }
  } catch (err) {
    console.warn('[SchoolProfile] Error loading from localStorage:', err);
  }

  return {
    ...DEFAULT_SCHOOL_PROFILE,
    classes: DEFAULT_CLASSES,
    logoUrl: getCustomLogoUrl() || DEFAULT_SCHOOL_PROFILE.logoUrl,
  };
}

/**
 * Persist school profile changes to localStorage, IndexedDB, and Supabase.
 * Dispatches 'gbhs_school_profile_changed' custom event for real-time reactivity.
 */
export async function saveSchoolProfile(
  updates: Partial<SchoolProfile>,
  workspaceId?: string,
  updatedByEmail?: string
): Promise<SchoolProfile> {
  const wsId = workspaceId || getActiveWorkspaceId();
  const current = getSchoolProfile(wsId || undefined);
  const updated: SchoolProfile = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedByEmail || current.updatedBy,
  };

  // 1. Sync custom logo service if logoUrl is updated
  if (updates.logoUrl) {
    saveCustomLogoUrl(updates.logoUrl, wsId || undefined);
  }

  // 2. Persist to localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      if (wsId) {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}_${wsId}`, JSON.stringify(updated));
      } else {
        localStorage.setItem(STORAGE_KEY_PREFIX, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('[SchoolProfile] LocalStorage save error:', e);
    }
  }

  // 3. Persist to IndexedDB app_state store
  try {
    if (wsId) {
      await setAppState(`school_profile_${wsId}`, updated);
    } else {
      await setAppState('school_profile', updated);
    }
  } catch (e) {
    console.warn('[SchoolProfile] IndexedDB save error:', e);
  }

  // 4. Dispatch browser custom event for instant live UI re-rendering
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gbhs_school_profile_changed', {
        detail: { ...updated, workspaceId: wsId },
      })
    );
  }

  // 5. Asynchronously sync to Supabase if connected
  if (wsId) {
    syncSchoolProfileToCloud(updated, wsId).catch((err) => {
      console.warn('[SchoolProfile] Background cloud sync note:', err?.message || err);
    });
  }

  return updated;
}

/**
 * Reset school profile to the authentic defaults.
 */
export async function resetSchoolProfile(workspaceId?: string): Promise<SchoolProfile> {
  const wsId = workspaceId || getActiveWorkspaceId();
  resetCustomLogo(wsId || undefined);
  if (typeof localStorage !== 'undefined') {
    if (wsId) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}_${wsId}`);
    } else {
      localStorage.removeItem(STORAGE_KEY_PREFIX);
    }
  }
  return saveSchoolProfile(DEFAULT_SCHOOL_PROFILE, wsId || undefined);
}

/**
 * Upsert school profile into Supabase table public.school_profiles
 */
export async function syncSchoolProfileToCloud(
  profile: SchoolProfile,
  ownerId: string
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !ownerId) return false;

  try {
    const payload = {
      owner_id: ownerId,
      school_name: profile.schoolName,
      school_short_name: profile.schoolShortName,
      district: profile.district,
      console_title: profile.consoleTitle || null,
      operator_title: profile.operatorTitle || null,
      principal_name: profile.principalName,
      principal_phone: profile.principalPhone || null,
      emis_code: profile.emisCode || null,
      address: profile.address || null,
      academic_year: profile.academicYear || null,
      logo_url: profile.logoUrl || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('school_profiles')
      .upsert(payload, { onConflict: 'owner_id' });

    if (error) {
      // Non-blocking: table might not exist in cloud yet or permissions restricted
      console.warn('[SchoolProfile] Supabase cloud upsert:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[SchoolProfile] Failed to sync to cloud:', err);
    return false;
  }
}

/**
 * Fetch school profile from Supabase and cache locally.
 */
export async function loadSchoolProfileFromCloud(ownerId: string): Promise<SchoolProfile | null> {
  const supabase = getSupabase();
  if (!supabase || !ownerId) return null;

  try {
    const { data, error } = await supabase
      .from('school_profiles')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error || !data) return null;

    const profile: SchoolProfile = {
      schoolName: data.school_name || DEFAULT_SCHOOL_PROFILE.schoolName,
      schoolShortName: data.school_short_name || DEFAULT_SCHOOL_PROFILE.schoolShortName,
      district: data.district || DEFAULT_SCHOOL_PROFILE.district,
      consoleTitle: data.console_title || DEFAULT_SCHOOL_PROFILE.consoleTitle,
      operatorTitle: data.operator_title || DEFAULT_SCHOOL_PROFILE.operatorTitle,
      principalName: data.principal_name || DEFAULT_SCHOOL_PROFILE.principalName,
      principalPhone: data.principal_phone || '',
      emisCode: data.emis_code || DEFAULT_SCHOOL_PROFILE.emisCode,
      address: data.address || DEFAULT_SCHOOL_PROFILE.address,
      academicYear: data.academic_year || DEFAULT_SCHOOL_PROFILE.academicYear,
      logoUrl: data.logo_url || getCustomLogoUrl(ownerId) || DEFAULT_SCHOOL_PROFILE.logoUrl,
      classes: sanitizeClasses(data.classes),
      updatedAt: data.updated_at,
    };

    if (typeof localStorage !== 'undefined') {
      const key = `${STORAGE_KEY_PREFIX}_${ownerId}`;
      localStorage.setItem(key, JSON.stringify(profile));
    }

    if (profile.logoUrl) {
      saveCustomLogoUrl(profile.logoUrl, ownerId);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gbhs_school_profile_changed', {
          detail: { ...profile, workspaceId: ownerId },
        })
      );
    }

    return profile;
  } catch (err) {
    console.warn('[SchoolProfile] Failed to load from cloud:', err);
    return null;
  }
}

/**
 * React hook for consuming and updating dynamic school profile across components.
 */
export function useSchoolProfile(workspaceId?: string) {
  const currentWsId = workspaceId || getActiveWorkspaceId() || undefined;
  const [profile, setProfile] = useState<SchoolProfile>(() => getSchoolProfile(currentWsId));

  useEffect(() => {
    const activeWs = workspaceId || getActiveWorkspaceId() || undefined;
    setProfile(getSchoolProfile(activeWs));

    // 1. Check IndexedDB if localStorage was cold
    const dbKey = activeWs ? `school_profile_${activeWs}` : 'school_profile';
    getAppState<SchoolProfile>(dbKey).then((stored) => {
      if (stored) {
        setProfile((prev) => ({
          ...prev,
          ...stored,
          classes: sanitizeClasses(stored.classes),
          logoUrl: stored.logoUrl || getCustomLogoUrl(activeWs) || prev.logoUrl,
        }));
      }
    });

    // 2. Listen to profile changed and logo changed custom events
    const handleProfileChange = (e: any) => {
      if (e.detail) {
        if (e.detail.workspaceId && activeWs && e.detail.workspaceId !== activeWs) {
          return;
        }
        setProfile((prev) => ({
          ...prev,
          ...e.detail,
          classes: sanitizeClasses(e.detail.classes),
        }));
      } else {
        setProfile(getSchoolProfile(activeWs));
      }
    };

    const handleLogoChange = (e: any) => {
      if (e.detail) {
        const newLogo = typeof e.detail === 'string' ? e.detail : e.detail.logoUrl;
        const targetWs = typeof e.detail === 'object' ? e.detail.workspaceId : undefined;
        if (targetWs && activeWs && targetWs !== activeWs) {
          return;
        }
        setProfile((prev) => ({ ...prev, logoUrl: newLogo }));
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('gbhs_school_profile_changed', handleProfileChange);
      window.addEventListener('gbhs_logo_changed', handleLogoChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('gbhs_school_profile_changed', handleProfileChange);
        window.removeEventListener('gbhs_logo_changed', handleLogoChange);
      }
    };
  }, [workspaceId]);

  const updateProfile = async (updates: Partial<SchoolProfile>, updatedByEmail?: string) => {
    const activeWs = workspaceId || getActiveWorkspaceId() || undefined;
    return saveSchoolProfile(updates, activeWs, updatedByEmail);
  };

  const resetProfile = async () => {
    const activeWs = workspaceId || getActiveWorkspaceId() || undefined;
    return resetSchoolProfile(activeWs);
  };

  return {
    profile,
    updateProfile,
    resetProfile,
  };
}
