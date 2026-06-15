/**
 * Theme service tests (SPEC §3.7).
 *
 * Covers the pure resolution/normalisation logic plus the stateful
 * persist + apply-to-<html> behaviour (jsdom provides document + localStorage).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizePreference,
  resolveTheme,
  getThemePreference,
  setThemePreference,
  initTheme,
  applyResolvedTheme,
  THEME_STORAGE_KEY,
} from '../services/theme';

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  } as Storage;
}

describe('theme — normalizePreference', () => {
  it('accepts valid preferences', () => {
    expect(normalizePreference('light')).toBe('light');
    expect(normalizePreference('dark')).toBe('dark');
    expect(normalizePreference('system')).toBe('system');
  });
  it('defaults anything else to system', () => {
    expect(normalizePreference(null)).toBe('system');
    expect(normalizePreference('')).toBe('system');
    expect(normalizePreference('bogus')).toBe('system');
    expect(normalizePreference(undefined)).toBe('system');
  });
});

describe('theme — resolveTheme', () => {
  it('explicit light/dark ignore the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('system follows the OS dark preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('theme — stateful persist + apply', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    document.documentElement.classList.remove('dark');
    // Default matchMedia: system prefers light.
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('applyResolvedTheme toggles the .dark class on <html>', () => {
    applyResolvedTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyResolvedTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setThemePreference persists and applies', () => {
    const resolved = setThemePreference('dark');
    expect(resolved).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    setThemePreference('light');
    expect(getThemePreference()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('getThemePreference defaults to system when unset', () => {
    expect(getThemePreference()).toBe('system');
  });

  it('initTheme applies the saved preference (system → light when OS prefers light)', () => {
    setThemePreference('system');
    document.documentElement.classList.add('dark'); // dirty it
    const resolved = initTheme();
    expect(resolved).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('system preference resolves to dark when the OS prefers dark', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const resolved = setThemePreference('system');
    expect(resolved).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
