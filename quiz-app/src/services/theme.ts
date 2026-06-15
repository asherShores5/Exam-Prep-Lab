/**
 * theme.ts — light/dark theme service (SPEC §3.7).
 *
 * `ThemePreference` is what the user picks (system | light | dark); the
 * *resolved* theme is always 'light' | 'dark' and drives the `.dark` class on
 * <html>. Default is 'system' (follow prefers-color-scheme).
 *
 * IMPORTANT: the storage key ('epl_theme') and the class logic here MUST match
 * the inline no-FOUC script in index.html, which applies the theme before React
 * mounts to avoid a flash. If you change the key or class, change both.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'epl_theme';

/** Coerce arbitrary storage input into a valid preference (defaults to system). */
export function normalizePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

/** Resolve a preference to the concrete theme, given the system's dark preference. */
export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Read the saved preference (defaults to 'system'). */
export function getThemePreference(): ThemePreference {
  try {
    return normalizePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

/** Apply the resolved theme to <html> by toggling the `.dark` class. */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

/** Persist a preference and apply it immediately. Returns the resolved theme. */
export function setThemePreference(pref: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore quota / unavailable storage — applying still works for the session */
  }
  const resolved = resolveTheme(pref, systemPrefersDark());
  applyResolvedTheme(resolved);
  return resolved;
}

/** Apply the currently saved preference (used on app mount). Returns resolved theme. */
export function initTheme(): ResolvedTheme {
  const resolved = resolveTheme(getThemePreference(), systemPrefersDark());
  applyResolvedTheme(resolved);
  return resolved;
}

/**
 * Subscribe to OS theme changes so 'system' preference tracks live. No-op unless
 * the saved preference is 'system'. Returns an unsubscribe function.
 */
export function watchSystemTheme(onChange: (resolved: ResolvedTheme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    if (getThemePreference() !== 'system') return;
    const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
    applyResolvedTheme(resolved);
    onChange(resolved);
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
