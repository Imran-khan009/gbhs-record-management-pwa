/**
 * Custom School Logo Service
 * Manages loading, uploading, and caching the custom school logo.
 * Defaults to the referenced '/custom-logo.jpg' located in the public assets folder.
 */

import { getActiveWorkspaceId } from './db';

const CUSTOM_LOGO_STORAGE_KEY = 'gbhs_custom_school_logo';
export const DEFAULT_LOGO_URL = '/custom-logo.jpg';

export function getCustomLogoUrl(workspaceId?: string): string {
  try {
    const wsId = workspaceId || getActiveWorkspaceId();
    if (wsId) {
      const tenantKey = `${CUSTOM_LOGO_STORAGE_KEY}_${wsId}`;
      const savedTenant = typeof localStorage !== 'undefined' ? localStorage.getItem(tenantKey) : null;
      if (savedTenant && (savedTenant.startsWith('data:image/') || savedTenant.startsWith('http') || savedTenant.startsWith('/'))) {
        return savedTenant;
      }
      return DEFAULT_LOGO_URL;
    }

    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_LOGO_STORAGE_KEY) : null;
    if (saved && (saved.startsWith('data:image/') || saved.startsWith('http') || saved.startsWith('/'))) {
      return saved;
    }
  } catch {
    // Local storage access error fallback
  }
  return DEFAULT_LOGO_URL;
}

export function saveCustomLogoUrl(logoUrlOrBase64: string, workspaceId?: string): void {
  try {
    const wsId = workspaceId || getActiveWorkspaceId();
    if (typeof localStorage !== 'undefined') {
      if (wsId) {
        localStorage.setItem(`${CUSTOM_LOGO_STORAGE_KEY}_${wsId}`, logoUrlOrBase64);
      } else {
        localStorage.setItem(CUSTOM_LOGO_STORAGE_KEY, logoUrlOrBase64);
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gbhs_logo_changed', {
          detail: { logoUrl: logoUrlOrBase64, workspaceId: wsId },
        })
      );
    }
  } catch (err) {
    console.error('Failed to save custom logo to localStorage:', err);
  }
}

export function resetCustomLogo(workspaceId?: string): void {
  try {
    const wsId = workspaceId || getActiveWorkspaceId();
    if (typeof localStorage !== 'undefined') {
      if (wsId) {
        localStorage.removeItem(`${CUSTOM_LOGO_STORAGE_KEY}_${wsId}`);
      } else {
        localStorage.removeItem(CUSTOM_LOGO_STORAGE_KEY);
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gbhs_logo_changed', {
          detail: { logoUrl: DEFAULT_LOGO_URL, workspaceId: wsId },
        })
      );
    }
  } catch (err) {
    console.error('Failed to reset custom logo:', err);
  }
}
