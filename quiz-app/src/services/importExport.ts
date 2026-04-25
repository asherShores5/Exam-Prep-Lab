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

  const json = JSON.stringify(exportData, null, 2);
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
    // Overwrite every collection wholesale
    StorageService.saveExams(data.exams);
    StorageService.saveQuestions(data.questions);
    StorageService.saveDecks(data.decks);
    StorageService.saveFlashcards(data.flashcards);
    StorageService.saveQuizSessions(data.quizSessions);
    StorageService.saveReviewSessions(data.reviewSessions);

    imported =
      data.exams.length +
      data.questions.length +
      data.decks.length +
      data.flashcards.length +
      data.quizSessions.length +
      data.reviewSessions.length;
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

      incoming.forEach((item, idx) => {
        const record = item as { id?: string };
        if (!record.id || typeof record.id !== 'string') {
          skipped.push(idx);
          errors.push(`${label}[${idx}]: missing or invalid "id" field — skipped.`);
          return;
        }
        existingMap.set(record.id, record as { id: string });
        imported += 1;
      });

      saver(Array.from(existingMap.values()));
    }
  }

  return { imported, skipped, errors };
}
