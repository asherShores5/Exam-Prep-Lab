/**
 * Preservation Property Tests
 *
 * These verify that non-buggy behavior is preserved across refactors. They
 * passed on the pre-overhaul baseline and must keep passing.
 *
 * Updated for step 2 (§3.1/§5.1): import/export was removed, so the old
 * import/export roundtrip test is gone. Its coverage is replaced by:
 *   - the stable-id guards in `question-ids.test.ts`, and
 *   - a guard here that the import/export-only StorageService surface is gone.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { StorageService } from '../services/storage';
import { isAnswerCorrect } from '../lib/answers';
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
   * IDs and paths.
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
   * The real scoring helper (`lib/answers.ts#isAnswerCorrect`) counts a question
   * correct iff the selected option set exactly equals the correct set, order
   * insensitively, without mutating inputs.
   */

  function scoreWith(answers: number[][], correctAnswers: number[][]): number {
    let score = 0;
    answers.forEach((answer, idx) => {
      if (idx < correctAnswers.length && isAnswerCorrect(answer, correctAnswers[idx])) {
        score++;
      }
    });
    return score;
  }

  it('score equals count of exact-set matches for all inputs (property-based)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }).chain(numQuestions =>
          fc.tuple(
            // Selected/correct option indices are always distinct (built from a
            // Set in the UI), so generate unique arrays to mirror real usage.
            fc.array(fc.uniqueArray(fc.nat(5), { minLength: 1, maxLength: 4 }), { minLength: numQuestions, maxLength: numQuestions }),
            fc.array(fc.uniqueArray(fc.nat(5), { minLength: 1, maxLength: 4 }), { minLength: numQuestions, maxLength: numQuestions })
          )
        ),
        ([answers, correctAnswers]) => {
          const score = scoreWith(answers, correctAnswers);

          // Independently verify with a set-equality check.
          let expectedScore = 0;
          for (let i = 0; i < answers.length; i++) {
            if (i < correctAnswers.length) {
              const a = new Set(answers[i]);
              const c = new Set(correctAnswers[i]);
              const equal = a.size === c.size && [...a].every(v => c.has(v));
              if (equal) expectedScore++;
            }
          }
          expect(score).toBe(expectedScore);

          // Inputs are not mutated.
          const answersCopy = answers.map(a => [...a]);
          const correctCopy = correctAnswers.map(c => [...c]);
          scoreWith(answers, correctAnswers);
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
   * Review sessions persist through StorageService and read back intact.
   */

  let mockLS: Storage;

  beforeEach(() => {
    mockLS = createLocalStorageMock();
    vi.stubGlobal('localStorage', mockLS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('review session round-trips through StorageService (property-based)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (totalCards, knownRaw) => {
          const knownCount = Math.min(knownRaw, totalCards);
          const stillLearningCount = totalCards - knownCount;
          mockLS.clear();

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
   * Create → read → rename → read → delete → read works for any deck name.
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
          mockLS.clear();
          const examId = 'test-exam';

          const deck = {
            id: crypto.randomUUID(),
            name: deckName,
            examIds: [examId],
            createdAt: new Date().toISOString(),
          };
          StorageService.saveDecks([...StorageService.getDecks(), deck]);

          const afterCreate = StorageService.getDecks();
          const found = afterCreate.find(d => d.id === deck.id);
          expect(found).toBeDefined();
          expect(found!.name).toBe(deckName);

          const updated = afterCreate.map(d => d.id === deck.id ? { ...d, name: newName } : d);
          StorageService.saveDecks(updated);

          const renamed = StorageService.getDecks().find(d => d.id === deck.id);
          expect(renamed).toBeDefined();
          expect(renamed!.name).toBe(newName);

          StorageService.saveDecks(StorageService.getDecks().filter(d => d.id !== deck.id));

          const deleted = StorageService.getDecks().find(d => d.id === deck.id);
          expect(deleted).toBeUndefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Import/Export surface removed (§3.1 / §5.1)
// ---------------------------------------------------------------------------

describe('Preservation — Import/Export removed', () => {
  /**
   * Guards the step-2 removal: the import/export-only StorageService methods and
   * keys are gone, while the derived study-data surface remains.
   */
  it('StorageService no longer exposes import/export-only methods', () => {
    const svc = StorageService as unknown as Record<string, unknown>;
    for (const gone of [
      'getExams', 'saveExams', 'getQuestions', 'saveQuestions',
      'getQuizSessions', 'saveQuizSessions', 'getSchemaVersion', 'saveSchemaVersion',
    ]) {
      expect(svc[gone]).toBeUndefined();
    }
  });

  it('StorageService keeps the derived study-data surface', () => {
    for (const kept of [
      'getDecks', 'saveDecks', 'getFlashcards', 'saveFlashcards',
      'getReviewSessions', 'saveReviewSessions', 'getExamAnalytics',
      'getStorageUsage', 'clearAllData',
    ]) {
      expect(typeof (StorageService as unknown as Record<string, unknown>)[kept]).toBe('function');
    }
  });
});
