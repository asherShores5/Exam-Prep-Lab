/**
 * SettingsPanel — the "Settings" tab (formerly "Data" / ImportExportPanel).
 *
 * In the static, local-only model (SPEC §3.1) there is no JSON import/export and
 * no question editing. This panel surfaces only what the user can actually do to
 * their local data: see how much storage it uses, and clear it.
 *
 * (Theme toggle — SPEC §3.7 — will be added here in a later step.)
 */

import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { StorageService } from '../../services/storage';
import { Trash2, Monitor, Sun, Moon } from 'lucide-react';
import { getThemePreference, setThemePreference, type ThemePreference } from '../../services/theme';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Monitor }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function SettingsPanel() {
  const [showResetModal, setShowResetModal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState({ bytes: 0, percentage: 0 });
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());

  function handleThemeChange(pref: ThemePreference) {
    setThemePreference(pref);
    setTheme(pref);
  }

  function refresh() {
    setStorageUsage(StorageService.getStorageUsage());
  }

  useEffect(() => {
    refresh();
  }, []);

  function handleResetConfirm() {
    StorageService.clearAllData();
    setShowResetModal(false);
    setStatus('All local data has been cleared.');
    refresh();
  }

  const usageKB = (storageUsage.bytes / 1024).toFixed(1);
  const usagePct = storageUsage.percentage.toFixed(1);
  const usageBarColor =
    storageUsage.percentage > 80
      ? 'bg-red-500'
      : storageUsage.percentage > 50
        ? 'bg-yellow-500'
        : 'bg-blue-500';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {/* ── Appearance / theme ── */}
      <section aria-labelledby="theme-heading" className="space-y-3">
        <h3 id="theme-heading" className="text-sm font-medium text-gray-300">
          Appearance
        </h3>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex rounded-lg border border-gray-700 overflow-hidden"
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={active}
                onClick={() => handleThemeChange(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                  active ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          “System” follows your device’s light/dark setting.
        </p>
      </section>

      <hr className="border-gray-700" />

      {/* ── Storage usage ── */}
      <section aria-labelledby="storage-heading" className="space-y-3">
        <h3 id="storage-heading" className="text-sm font-medium text-gray-300">
          Local storage
        </h3>
        <p className="text-xs text-gray-500">
          Your progress, decks, stars, and study state are saved only in this browser. They
          are not synced anywhere — clearing your browser data will remove them.
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Storage usage</span>
            <span>{usageKB} KB ({usagePct}%)</span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-gray-700 overflow-hidden"
            role="progressbar"
            aria-valuenow={storageUsage.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Storage usage: ${usagePct}%`}
          >
            <div
              className={`h-full rounded-full transition-all ${usageBarColor}`}
              style={{ width: `${Math.min(storageUsage.percentage, 100)}%` }}
            />
          </div>
          {storageUsage.percentage > 80 && (
            <p className="text-xs text-red-400">
              Storage is nearly full. Consider clearing data you no longer need.
            </p>
          )}
        </div>
      </section>

      {status && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-green-600 bg-green-900/30 px-4 py-3 text-sm text-green-200"
        >
          {status}
        </div>
      )}

      <hr className="border-gray-700" />

      {/* ── Clear local data ── */}
      <section aria-labelledby="reset-heading" className="space-y-2">
        <h3 id="reset-heading" className="text-sm font-medium text-gray-300">
          Clear local data
        </h3>
        <p className="text-xs text-gray-500">
          Permanently delete all Exam Prep Lab data (progress, decks, stars, study state) from
          this browser. This cannot be undone.
        </p>
        <Button
          onClick={() => setShowResetModal(true)}
          size="sm"
          variant="outline"
          className="flex items-center gap-2 border-red-700 text-red-400 hover:bg-red-900/30 hover:text-red-300"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          Clear Local Data
        </Button>
      </section>

      <Modal
        isOpen={showResetModal}
        title="Clear all local data?"
        message="This will permanently delete all your progress, decks, stars, study state, and session history from this browser. This action cannot be undone."
        confirmLabel="Delete Everything"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleResetConfirm}
        onCancel={() => setShowResetModal(false)}
      />
    </div>
  );
}
