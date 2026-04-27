/**
 * importExport.ts — JSON import/export service for Exam Prep Lab.
 *
 * Provides:
 *  - exportAllData()          — builds AppDataExport, triggers browser download
 *  - validateImportSchema()   — checks top-level structure, returns error strings
 *  - importData()             — validates then writes to StorageService
 */

import type { AppDataExport } from '../types/index';
import { StorageService } from './storage';

export const SCHEMA_VERSION = '1.0';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Serializes all StorageService collections into an AppDataExport envelope
 * and triggers a browser file download.
 */
export function exportAllData(): void {
  const exportData: AppDataExport = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exams: StorageService.getExams(),
    questions: StorageService.getQuestions(),
    decks: StorageService.getDecks(),
    flashcards: StorageService.getFlashcards(),
    quizSessions: StorageService.getQuizSessions(),
    reviewSessions: StorageService.getReviewSessions(),
  };

  // Include legacy quizAnalytics alongside canonical collections
  const fullExport = {
    ...exportData,
    legacyQuizAnalytics: StorageService.getExamAnalytics(),
  };

  const json = JSON.stringify(fullExport, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `exam-prep-lab-export-${date}.json`;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

const REQUIRED_ARRAY_FIELDS: (keyof AppDataExport)[] = [
  'exams',
  'questions',
  'decks',
  'flashcards',
  'quizSessions',
  'reviewSessions',
];

/**
 * Validates the top-level structure of an import payload.
 * Returns an array of human-readable error strings.
 * An empty array means the schema is valid.
 */
export function validateImportSchema(data: unknown): string[] {
  const errors: string[] = [];

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Import data must be a JSON object.');
    return errors;
  }

  const obj = data as Record<string, unknown>;

  if (!('schemaVersion' in obj)) {
    errors.push('Missing required field: schemaVersion');
  } else if (typeof obj.schemaVersion !== 'string') {
    errors.push('Field "schemaVersion" must be a string.');
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field}`);
    } else if (!Array.isArray(obj[field])) {
      errors.push(`Field "${field}" must be an array.`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Auto-backup (non-download version for pre-import safety)
// ---------------------------------------------------------------------------

/**
 * Creates a backup of all current data and triggers a browser download.
 * Called automatically before replace-mode imports.
 */
function createBackupBlob(): void {
  const exportData: AppDataExport = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exams: StorageService.getExams(),
    questions: StorageService.getQuestions(),
    decks: StorageService.getDecks(),
    flashcards: StorageService.getFlashcards(),
    quizSessions: StorageService.getQuizSessions(),
    reviewSessions: StorageService.getReviewSessions(),
  };
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `exam-prep-lab-backup-${date}.json`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Per-record validation
// ---------------------------------------------------------------------------

/** Required fields for each collection type */
const REQUIRED_RECORD_FIELDS: Record<string, string[]> = {
  exams: ['id', 'name'],
  questions: ['id', 'examId', 'prompt', 'options', 'correctIndices'],
  decks: ['id', 'name'],
  flashcards: ['id', 'deckId', 'front', 'back'],
  quizSessions: ['id', 'score', 'totalQuestions'],
  reviewSessions: ['id', 'deckId'],
};

function validateRecords(
  records: unknown[],
  requiredFields: string[],
  label: string,
): { valid: unknown[]; errors: string[] } {
  const valid: unknown[] = [];
  const errors: string[] = [];
  records.forEach((record, idx) => {
    if (record === null || typeof record !== 'object') {
      errors.push(`${label}[${idx}]: not an object — skipped.`);
      return;
    }
    const obj = record as Record<string, unknown>;
    const missing = requiredFields.filter(f => !(f in obj));
    if (missing.length > 0) {
      errors.push(`${label}[${idx}]: missing fields: ${missing.join(', ')} — skipped.`);
      return;
    }
    valid.push(record);
  });
  return { valid, errors };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  skipped: number[];
  errors: string[];
}

/**
 * Validates the import payload then writes it to StorageService.
 *
 * @param data  - The parsed AppDataExport object.
 * @param mode  - 'replace' overwrites all existing data; 'merge' appends/upserts by id.
 * @returns     - Counts of imported items, skipped indices, and any errors.
 */
export function importData(
  data: AppDataExport,
  mode: 'replace' | 'merge',
): ImportResult {
  // Validate schema first — if invalid, make no changes
  const schemaErrors = validateImportSchema(data);
  if (schemaErrors.length > 0) {
    return { imported: 0, skipped: [], errors: schemaErrors };
  }

  const errors: string[] = [];
  const skipped: number[] = [];
  let imported = 0;

  if (mode === 'replace') {
    // Auto-backup before overwriting
    createBackupBlob();

    // Validate records before saving
    const collections: Array<{ key: keyof AppDataExport; label: string }> = [
      { key: 'exams', label: 'exams' },
      { key: 'questions', label: 'questions' },
      { key: 'decks', label: 'decks' },
      { key: 'flashcards', label: 'flashcards' },
      { key: 'quizSessions', label: 'quizSessions' },
      { key: 'reviewSessions', label: 'reviewSessions' },
    ];

    const validatedData: Record<string, unknown[]> = {};
    for (const { key, label } of collections) {
      const reqFields = REQUIRED_RECORD_FIELDS[label] ?? [];
      const result = validateRecords(data[key] as unknown[], reqFields, label);
      validatedData[label] = result.valid;
      errors.push(...result.errors);
    }

    // Overwrite every collection with validated records
    StorageService.saveExams(validatedData['exams'] as AppDataExport['exams']);
    StorageService.saveQuestions(validatedData['questions'] as AppDataExport['questions']);
    StorageService.saveDecks(validatedData['decks'] as AppDataExport['decks']);
    StorageService.saveFlashcards(validatedData['flashcards'] as AppDataExport['flashcards']);
    StorageService.saveQuizSessions(validatedData['quizSessions'] as AppDataExport['quizSessions']);
    StorageService.saveReviewSessions(validatedData['reviewSessions'] as AppDataExport['reviewSessions']);

    imported =
      (validatedData['exams']?.length ?? 0) +
      (validatedData['questions']?.length ?? 0) +
      (validatedData['decks']?.length ?? 0) +
      (validatedData['flashcards']?.length ?? 0) +
      (validatedData['quizSessions']?.length ?? 0) +
      (validatedData['reviewSessions']?.length ?? 0);
  } else {
    // Merge: upsert each item by id, skip items without an id
    const allCollections: Array<{
      incoming: unknown[];
      getter: () => { id: string }[];
      saver: (items: { id: string }[]) => void;
      label: string;
    }> = [
      {
        incoming: data.exams,
        getter: StorageService.getExams as () => { id: string }[],
        saver: StorageService.saveExams as (items: { id: string }[]) => void,
        label: 'exams',
      },
      {
        incoming: data.questions,
        getter: StorageService.getQuestions as () => { id: string }[],
        saver: StorageService.saveQuestions as (items: { id: string }[]) => void,
        label: 'questions',
      },
      {
        incoming: data.decks,
        getter: StorageService.getDecks as () => { id: string }[],
        saver: StorageService.saveDecks as (items: { id: string }[]) => void,
        label: 'decks',
      },
      {
        incoming: data.flashcards,
        getter: StorageService.getFlashcards as () => { id: string }[],
        saver: StorageService.saveFlashcards as (items: { id: string }[]) => void,
        label: 'flashcards',
      },
      {
        incoming: data.quizSessions,
        getter: StorageService.getQuizSessions as () => { id: string }[],
        saver: StorageService.saveQuizSessions as (items: { id: string }[]) => void,
        label: 'quizSessions',
      },
      {
        incoming: data.reviewSessions,
        getter: StorageService.getReviewSessions as () => { id: string }[],
        saver: StorageService.saveReviewSessions as (items: { id: string }[]) => void,
        label: 'reviewSessions',
      },
    ];

    for (const { incoming, getter, saver, label } of allCollections) {
      const existing = getter();
      const existingMap = new Map(existing.map(item => [item.id, item]));

      // Validate records before merging
      const reqFields = REQUIRED_RECORD_FIELDS[label] ?? [];
      const { valid, errors: recordErrors } = validateRecords(incoming, reqFields, label);
      errors.push(...recordErrors);

      valid.forEach((item) => {
        const record = item as { id: string };
        existingMap.set(record.id, record);
        imported += 1;
      });

      // Track skipped indices (records that failed validation)
      incoming.forEach((item, idx) => {
        if (!valid.includes(item)) {
          skipped.push(idx);
        }
      });

      saver(Array.from(existingMap.values()));
    }
  }

  return { imported, skipped, errors };
}
