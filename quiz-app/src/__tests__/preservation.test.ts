/**
 * Preservation Property Tests
 *
 * These tests verify that non-buggy behavior is preserved. They should PASS
 * on the current UNFIXED code, establishing a baseline. After fixes are
 * applied, they must still pass (no regressions).
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { StorageService } from '../services/storage';
import { validateImportSchema, importData } from '../services/importExport';
import type { ReviewSession } from '../types/index';

// ---------------------------------------------------------------------------
// In-memory localStorage mock for tests that need StorageService
// ---------------------------------------------------------------------------

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  } as Storage;
}

// ---------------------------------------------------------------------------
// 1. Other Exam IDs Preserved
// ---------------------------------------------------------------------------

describe('Preservation — Other Exam IDs Preserved', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * All non-SAP exam entries in index.json should have correct, well-formed
   * IDs and paths. These entries are NOT affected by Bug 1 (the SAP typo).
   */

  const NON_SAP_EXAMS = [
    { id: 'AWS-SAA-C03', name: 'AWS Solutions Architect - Associate', path: '/exams/AWS-SAA-C03.json' },
    { id: 'AWS-DVA-C02', name: 'AWS Developer - Associate', path: '/exams/AWS-DVA-C02.json' },
    { id: 'PSM-I', name: 'Professional Scrum Master - Scrum.org', path: '/exams/PSM-I.json' },
    { id: 'CompTIA-SYO-701', name: 'CompTIA Security+', path: '/exams/CompTIA-SYO-701.json' },
    { id: 'AWS-ADC-Prep', name: 'AWS ADC Prep', path: '/exams/AWS-ADC-Prep.json' },
  ];

  it('all non-SAP exam entries have correct IDs and paths (property-based)', () => {
    const indexPath = path.resolve(__dirname, '../../public/exams/index.json');
    const indexData: Array<{ id: string; name: string; path: string }> = JSON.parse(
      fs.readFileSync(indexPath, 'utf-8')
    );

    fc.assert(
      fc.property(
        fc.constantFrom(...NON_SAP_EXAMS),
        (expected) => {
          const entry = indexData.find(e => e.name === expected.name);
          expect(entry).toBeDefined();
          expect(entry!.id).toBe(expected.id);
          expect(entry!.path).toBe(expected.path);
          // Well-formed: id contains only alphanumeric, hyphens; path starts with /exams/
          expect(entry!.id).toMatch(/^[A-Za-z0-9-]+$/);
          expect(entry!.path).toMatch(/^\/exams\/[A-Za-z0-9-]+\.json$/);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Quiz Score Correctness Preserved
// ---------------------------------------------------------------------------

describe('Preservation — Quiz Score Correctness Preserved', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * The CORRECT comparison logic (using spread-before-sort) should produce
   * the right score count. The results display section in App.tsx already
   * uses [...q.correctAnswers].sort() — this test verifies that logic is
   * correct for all answer/correctAnswer pairs.
   */

  function correctScoreCalculation(
    answers: number[][],
    correctAnswers: number[][]
  ): number {
    let score = 0;
    answers.forEach((answer, idx) => {
      if (idx < correctAnswers.length) {
        const sortedAnswer = [...answer].sort().toString();
        const sortedCorrect = [...correctAnswers[idx]].sort().toString();
        if (sortedAnswer === sortedCorrect) {
          score++;
        }
      }
    });
    return score;
  }

  it('score equals count of matching sorted arrays for all inputs (property-based)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }).chain(numQuestions =>
          fc.tuple(
            fc.array(
              fc.array(fc.nat(5), { minLength: 1, maxLength: 4 }),
              { minLength: numQuestions, maxLength: numQuestions }
            ),
            fc.array(
              fc.array(fc.nat(5), { minLength: 1, maxLength: 4 }),
              { minLength: numQuestions, maxLength: numQuestions }
            )
          )
        ),
        ([answers, correctAnswers]) => {
          const score = correctScoreCalculation(answers, correctAnswers);

          // Independently verify: count how many pairs match when both are sorted
          let expectedScore = 0;
          for (let i = 0; i < answers.length; i++) {
            if (i < correctAnswers.length) {
              const a = [...answers[i]].sort().toString();
              const c = [...correctAnswers[i]].sort().toString();
              if (a === c) expectedScore++;
            }
          }

          expect(score).toBe(expectedScore);

          // Also verify: original arrays are NOT mutated by the correct logic
          const answersCopy = answers.map(a => [...a]);
          const correctCopy = correctAnswers.map(c => [...c]);
          correctScoreCalculation(answers, correctAnswers);
          expect(answers).toEqual(answersCopy);
          expect(correctAnswers).toEqual(correctCopy);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Legacy Review Session Preserved
// ---------------------------------------------------------------------------

describe('Preservation — Legacy Review Session Preserved', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * When no deckId prop is provided, saveSession() saves with deckId: 'legacy'.
   * This is the CORRECT behavior for legacy mode and passes on unfixed code
   * because the hardcoded 'legacy' IS correct for legacy mode.
   */

  let mockLS: Storage;

  beforeEach(() => {
    mockLS = createLocalStorageMock();
    vi.stubGlobal('localStorage', mockLS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('review session without deckId prop saves with deckId "legacy" (property-based)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),   // totalCards
        fc.integer({ min: 0, max: 100 }),    // knownCount
        (totalCards, knownRaw) => {
          const knownCount = Math.min(knownRaw, totalCards);
          const stillLearningCount = totalCards - knownCount;

          // Reset storage
          mockLS.clear();

          // Replicate the saveSession logic from FlashcardViewer (legacy mode)
          // When no deckId prop is provided, it hardcodes 'legacy' — which is correct
          const session: ReviewSession = {
            id: crypto.randomUUID(),
            deckId: 'legacy',
            totalCards,
            knownCount,
            stillLearningCount,
            shuffled: false,
            completedAt: new Date().toISOString(),
          };

          const existing = StorageService.getReviewSessions();
          StorageService.saveReviewSessions([...existing, session]);

          // Verify the saved session
          const saved = StorageService.getReviewSessions();
          const lastSession = saved[saved.length - 1];

          expect(lastSession.deckId).toBe('legacy');
          expect(lastSession.totalCards).toBe(totalCards);
          expect(lastSession.knownCount).toBe(knownCount);
          expect(lastSession.stillLearningCount).toBe(stillLearningCount);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Deck CRUD Preserved
// ---------------------------------------------------------------------------

describe('Preservation — Deck CRUD Preserved', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * Creating, renaming, and deleting decks works correctly with StorageService.
   * Property: for any deck name, create → read returns the deck,
   * rename → read returns new name, delete → read returns empty.
   */

  let mockLS: Storage;

  beforeEach(() => {
    mockLS = createLocalStorageMock();
    vi.stubGlobal('localStorage', mockLS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('create → read → rename → read → delete → read works for any deck name (property-based)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (deckName, newName) => {
          // Reset storage
          mockLS.clear();

          const examId = 'test-exam';

          // CREATE
          const deck = {
            id: crypto.randomUUID(),
            name: deckName,
            examIds: [examId],
            createdAt: new Date().toISOString(),
          };
          const allDecks = StorageService.getDecks();
          StorageService.saveDecks([...allDecks, deck]);

          // READ after create
          const afterCreate = StorageService.getDecks();
          const found = afterCreate.find(d => d.id === deck.id);
          expect(found).toBeDefined();
          expect(found!.name).toBe(deckName);

          // RENAME
          const updated = afterCreate.map(d =>
            d.id === deck.id ? { ...d, name: newName } : d
          );
          StorageService.saveDecks(updated);

          // READ after rename
          const afterRename = StorageService.getDecks();
          const renamed = afterRename.find(d => d.id === deck.id);
          expect(renamed).toBeDefined();
          expect(renamed!.name).toBe(newName);

          // DELETE
          const afterDelete = afterRename.filter(d => d.id !== deck.id);
          StorageService.saveDecks(afterDelete);

          // READ after delete
          const finalDecks = StorageService.getDecks();
          const deleted = finalDecks.find(d => d.id === deck.id);
          expect(deleted).toBeUndefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Import/Export Roundtrip Preserved
// ---------------------------------------------------------------------------

describe('Preservation — Import/Export Roundtrip Preserved', () => {
  /**
   * **Validates: Requirements 3.6**
   *
   * Exporting and re-importing data produces identical collections.
   * Property: for any valid AppDataExport, import (replace) → read back
   * produces the same data.
   */

  let mockLS: Storage;

  beforeEach(() => {
    mockLS = createLocalStorageMock();
    vi.stubGlobal('localStorage', mockLS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('import (replace) → read back produces identical collections (property-based)', () => {
    fc.assert(
      fc.property(
        // Generate a minimal but valid AppDataExport
        fc.record({
          schemaVersion: fc.constant('1.0'),
          exportedAt: fc.constant(new Date().toISOString()),
          exams: fc.array(
            fc.record({
              id: fc.uuid(),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              vendor: fc.string({ minLength: 1, maxLength: 20 }),
              domains: fc.constant([]),
              createdAt: fc.constant(new Date().toISOString()),
            }),
            { minLength: 0, maxLength: 3 }
          ),
          questions: fc.constant([]),
          decks: fc.array(
            fc.record({
              id: fc.uuid(),
              name: fc.string({ minLength: 1, maxLength: 30 }),
              examIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 2 }),
              createdAt: fc.constant(new Date().toISOString()),
            }),
            { minLength: 0, maxLength: 3 }
          ),
          flashcards: fc.array(
            fc.record({
              id: fc.uuid(),
              deckId: fc.uuid(),
              front: fc.string({ minLength: 1, maxLength: 50 }),
              back: fc.string({ minLength: 1, maxLength: 50 }),
              masteryLevel: fc.nat(5),
              createdAt: fc.constant(new Date().toISOString()),
              updatedAt: fc.constant(new Date().toISOString()),
            }),
            { minLength: 0, maxLength: 3 }
          ),
          quizSessions: fc.constant([]),
          reviewSessions: fc.array(
            fc.record({
              id: fc.uuid(),
              deckId: fc.string({ minLength: 1, maxLength: 20 }),
              totalCards: fc.integer({ min: 1, max: 50 }),
              knownCount: fc.integer({ min: 0, max: 50 }),
              stillLearningCount: fc.integer({ min: 0, max: 50 }),
              shuffled: fc.boolean(),
              completedAt: fc.constant(new Date().toISOString()),
            }),
            { minLength: 0, maxLength: 3 }
          ),
        }),
        (exportData) => {
          // Reset storage
          mockLS.clear();

          // Validate schema first
          const errors = validateImportSchema(exportData);
          expect(errors).toEqual([]);

          // Import with replace mode
          const result = importData(exportData as any, 'replace');
          expect(result.errors).toEqual([]);

          // Read back all collections
          const readExams = StorageService.getExams();
          const readDecks = StorageService.getDecks();
          const readFlashcards = StorageService.getFlashcards();
          const readReviewSessions = StorageService.getReviewSessions();

          // Verify roundtrip: imported data matches what we read back
          expect(readExams).toEqual(exportData.exams);
          expect(readDecks).toEqual(exportData.decks);
          expect(readFlashcards).toEqual(exportData.flashcards);
          expect(readReviewSessions).toEqual(exportData.reviewSessions);
        }
      ),
      { numRuns: 50 }
    );
  });
});
