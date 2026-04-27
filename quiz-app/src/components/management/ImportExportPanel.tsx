/**
 * ImportExportPanel — UI for exporting all app data to JSON and importing
 * a previously exported JSON file back into the app.
 *
 * Enhanced with:
 * - Data summary section (counts of stored items)
 * - localStorage usage display (KB + percentage)
 * - "Reset All Data" button with confirmation modal
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { exportAllData, validateImportSchema, importData } from '../../services/importExport';
import { StorageService } from '../../services/storage';
import type { AppDataExport } from '../../types/index';
import { Download, Upload, Trash2 } from 'lucide-react';

type ImportMode = 'merge' | 'replace';

interface ImportStatus {
  type: 'success' | 'error' | 'partial';
  message: string;
  details?: string[];
}

export function ImportExportPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // ── Data summary & storage usage (Task 15.1) ──────────────────────────────

  const [dataSummary, setDataSummary] = useState({
    exams: 0,
    decks: 0,
    flashcards: 0,
    quizSessions: 0,
    reviewSessions: 0,
  });
  const [storageUsage, setStorageUsage] = useState({ bytes: 0, percentage: 0 });

  function refreshDataSummary() {
    setDataSummary({
      exams: StorageService.getExams().length,
      decks: StorageService.getDecks().length,
      flashcards: StorageService.getFlashcards().length,
      quizSessions: StorageService.getQuizSessions().length,
      reviewSessions: StorageService.getReviewSessions().length,
    });
    setStorageUsage(StorageService.getStorageUsage());
  }

  useEffect(() => {
    refreshDataSummary();
  }, []);

  // ── Export ─────────────────────────────────────────────────────────────────

  function handleExport() {
    try {
      exportAllData();
      setStatus({ type: 'success', message: 'Export started — check your downloads folder.' });
    } catch (err) {
      setStatus({
        type: 'error',
        message: 'Export failed.',
        details: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatus(null);

    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== 'string') {
        setStatus({ type: 'error', message: 'Could not read the selected file.' });
        setIsImporting(false);
        return;
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setStatus({ type: 'error', message: 'The selected file is not valid JSON.' });
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Validate schema
      const schemaErrors = validateImportSchema(parsed);
      if (schemaErrors.length > 0) {
        setStatus({
          type: 'error',
          message: 'The file failed schema validation. No data was imported.',
          details: schemaErrors,
        });
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Run import
      const result = importData(parsed as AppDataExport, importMode);

      if (result.errors.length > 0 && result.imported === 0) {
        setStatus({
          type: 'error',
          message: 'Import failed — no items were imported.',
          details: result.errors,
        });
      } else if (result.skipped.length > 0) {
        setStatus({
          type: 'partial',
          message: `Partial import: ${result.imported} item(s) imported. Skipped indices: [${result.skipped.join(', ')}].`,
          details: result.errors,
        });
      } else {
        setStatus({
          type: 'success',
          message: `Import successful — ${result.imported} item(s) imported.`,
        });
      }

      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      refreshDataSummary();
    };

    reader.onerror = () => {
      setStatus({ type: 'error', message: 'Failed to read the file.' });
      setIsImporting(false);
    };

    reader.readAsText(file);
  }

  // ── Reset All Data (Task 15.3) ─────────────────────────────────────────────

  function handleResetConfirm() {
    StorageService.clearAllData();
    setShowResetModal(false);
    setStatus({ type: 'success', message: 'All data has been cleared.' });
    refreshDataSummary();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const statusColors: Record<ImportStatus['type'], string> = {
    success: 'bg-green-900/30 border-green-600 text-green-200',
    error: 'bg-red-900/30 border-red-600 text-red-200',
    partial: 'bg-yellow-900/30 border-yellow-600 text-yellow-200',
  };

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
      <h2 className="text-lg font-semibold">Import / Export</h2>

      {/* ── Data summary (Task 15.1) ── */}
      <section aria-labelledby="summary-heading" className="space-y-3">
        <h3 id="summary-heading" className="text-sm font-medium text-gray-300">
          Data summary
        </h3>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {([
            ['Exams', dataSummary.exams],
            ['Decks', dataSummary.decks],
            ['Flashcards', dataSummary.flashcards],
            ['Quizzes', dataSummary.quizSessions],
            ['Reviews', dataSummary.reviewSessions],
          ] as const).map(([label, count]) => (
            <div
              key={label}
              className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-center"
            >
              <p className="text-lg font-semibold text-gray-100">{count}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>

        {/* Storage usage bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Storage usage</span>
            <span>{usageKB} KB ({usagePct}%)</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-700 overflow-hidden" role="progressbar" aria-valuenow={storageUsage.percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`Storage usage: ${usagePct}%`}>
            <div
              className={`h-full rounded-full transition-all ${usageBarColor}`}
              style={{ width: `${Math.min(storageUsage.percentage, 100)}%` }}
            />
          </div>
          {storageUsage.percentage > 80 && (
            <p className="text-xs text-red-400">
              Storage is nearly full. Export your data to avoid losing progress.
            </p>
          )}
        </div>
      </section>

      <hr className="border-gray-700" />

      {/* ── Export section ── */}
      <section aria-labelledby="export-heading" className="space-y-2">
        <h3 id="export-heading" className="text-sm font-medium text-gray-300">
          Export all data
        </h3>
        <p className="text-xs text-gray-500">
          Downloads a JSON file containing all your exams, questions, decks, flashcards, and
          session history.
        </p>
        <Button onClick={handleExport} size="sm" className="flex items-center gap-2">
          <Download className="w-4 h-4" aria-hidden="true" />
          Export to JSON
        </Button>
      </section>

      <hr className="border-gray-700" />

      {/* ── Import section ── */}
      <section aria-labelledby="import-heading" className="space-y-3">
        <h3 id="import-heading" className="text-sm font-medium text-gray-300">
          Import data
        </h3>
        <p className="text-xs text-gray-500">
          Select a previously exported JSON file to restore or merge your data.
        </p>

        {/* Merge / Replace choice */}
        <fieldset className="space-y-1">
          <legend className="text-xs text-gray-400 mb-1">Import mode</legend>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="importMode"
              value="merge"
              checked={importMode === 'merge'}
              onChange={() => setImportMode('merge')}
              className="accent-blue-500"
            />
            <span>
              <strong>Merge</strong>
              <span className="text-gray-400 ml-1">— add imported items alongside existing data (upsert by id)</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="importMode"
              value="replace"
              checked={importMode === 'replace'}
              onChange={() => setImportMode('replace')}
              className="accent-blue-500"
            />
            <span>
              <strong>Replace</strong>
              <span className="text-gray-400 ml-1">— overwrite all existing data with the imported file</span>
            </span>
          </label>
        </fieldset>

        {/* File input */}
        <div className="flex items-center gap-3">
          <label
            htmlFor="import-file-input"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-600 bg-gray-800 text-sm text-gray-200 cursor-pointer hover:bg-gray-700 transition-colors"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Choose file…
          </label>
          <input
            id="import-file-input"
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            disabled={isImporting}
            className="sr-only"
            aria-label="Select JSON file to import"
          />
          {isImporting && (
            <span className="text-xs text-gray-400" aria-live="polite">
              Importing…
            </span>
          )}
        </div>
      </section>

      {/* ── Status message ── */}
      {status && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg border px-4 py-3 text-sm space-y-1 ${statusColors[status.type]}`}
        >
          <p className="font-medium">{status.message}</p>
          {status.details && status.details.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 text-xs opacity-90">
              {status.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <hr className="border-gray-700" />

      {/* ── Reset All Data (Task 15.3) ── */}
      <section aria-labelledby="reset-heading" className="space-y-2">
        <h3 id="reset-heading" className="text-sm font-medium text-gray-300">
          Reset all data
        </h3>
        <p className="text-xs text-gray-500">
          Permanently delete all Exam Prep Lab data from this browser. This cannot be undone.
        </p>
        <Button
          onClick={() => setShowResetModal(true)}
          size="sm"
          variant="outline"
          className="flex items-center gap-2 border-red-700 text-red-400 hover:bg-red-900/30 hover:text-red-300"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          Reset All Data
        </Button>
      </section>

      {/* ── Reset confirmation modal ── */}
      <Modal
        isOpen={showResetModal}
        title="Reset All Data?"
        message="This will permanently delete all your exams, questions, decks, flashcards, quiz sessions, and review sessions from this browser. This action cannot be undone. Consider exporting your data first."
        confirmLabel="Delete Everything"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleResetConfirm}
        onCancel={() => setShowResetModal(false)}
      />
    </div>
  );
}
