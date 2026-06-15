/**
 * Per-question study-state service tests (SPEC §3.3, §3.4).
 *
 * Covers the pure transforms, the stateful read-modify-write ops through
 * StorageService, the filtered-view counts, and the one-time auto-deck
 * migration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageService } from '../services/storage';
import {
  applyRating,
  toggleStarred,
  rateQuestion,
  toggleStar,
  getStudyState,
  getExamStudyState,
  countStudyState,
  masteryPercentage,
  migrateAutoDecksForExam,
  knownAutoDeckId,
  learningAutoDeckId,
  computePracticeIncorrectIds,
  getPracticeIncorrectIds,
} from '../services/studyState';
import type { QuestionStudyState, LegacyQuestion, Flashcard, QuizResult } from '../types/index';

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

const NOW = '2026-06-15T00:00:00.000Z';
const base: QuestionStudyState = {
  examId: 'E', questionId: 1, status: 'unrated', starred: false, masteryLevel: 0, updatedAt: NOW,
};

// ---------------------------------------------------------------------------
// Pure transforms
// ---------------------------------------------------------------------------

describe('studyState — pure transforms', () => {
  it('applyRating(known) sets status known and increments mastery', () => {
    const next = applyRating(base, true, NOW);
    expect(next.status).toBe('known');
    expect(next.masteryLevel).toBe(1);
    expect(next.lastReviewedAt).toBe(NOW);
    expect(base.status).toBe('unrated'); // input not mutated
  });

  it('applyRating(still-learning) resets mastery to 0', () => {
    const known = applyRating(base, true, NOW);          // mastery 1
    const relapsed = applyRating(known, false, NOW);     // back to 0
    expect(relapsed.status).toBe('still-learning');
    expect(relapsed.masteryLevel).toBe(0);
  });

  it('repeated known ratings keep incrementing mastery', () => {
    let s = base;
    for (let i = 1; i <= 4; i++) s = applyRating(s, true, NOW);
    expect(s.masteryLevel).toBe(4);
  });

  it('toggleStarred flips the flag without touching status', () => {
    const starred = toggleStarred(base, NOW);
    expect(starred.starred).toBe(true);
    expect(starred.status).toBe('unrated');
    expect(toggleStarred(starred, NOW).starred).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stateful ops through StorageService
// ---------------------------------------------------------------------------

describe('studyState — stateful ops', () => {
  let mockLS: Storage;
  beforeEach(() => { mockLS = createLocalStorageMock(); vi.stubGlobal('localStorage', mockLS); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('rateQuestion creates a record then updates it in place', () => {
    rateQuestion('E', 5, false);
    let rec = getStudyState('E', 5)!;
    expect(rec.status).toBe('still-learning');
    expect(StorageService.getStudyState()).toHaveLength(1);

    rateQuestion('E', 5, true);
    rec = getStudyState('E', 5)!;
    expect(rec.status).toBe('known');
    expect(rec.masteryLevel).toBe(1);
    expect(StorageService.getStudyState()).toHaveLength(1); // updated, not duplicated
  });

  it('toggleStar creates a starred record and persists it', () => {
    toggleStar('E', 9);
    expect(getStudyState('E', 9)!.starred).toBe(true);
    toggleStar('E', 9);
    expect(getStudyState('E', 9)!.starred).toBe(false);
  });

  it('records for different exams with the same questionId do not collide', () => {
    rateQuestion('E1', 1, true);
    rateQuestion('E2', 1, false);
    expect(getStudyState('E1', 1)!.status).toBe('known');
    expect(getStudyState('E2', 1)!.status).toBe('still-learning');
    expect(getExamStudyState('E1')).toHaveLength(1);
  });

  it('star and rating coexist on one record', () => {
    rateQuestion('E', 3, true);
    toggleStar('E', 3);
    const rec = getStudyState('E', 3)!;
    expect(rec.status).toBe('known');
    expect(rec.starred).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Views & counts
// ---------------------------------------------------------------------------

describe('studyState — counts & mastery', () => {
  const ids = [1, 2, 3, 4, 5];
  const records: QuestionStudyState[] = [
    { ...base, questionId: 1, status: 'known' },
    { ...base, questionId: 2, status: 'known', starred: true },
    { ...base, questionId: 3, status: 'still-learning' },
    { ...base, questionId: 4, status: 'unrated', starred: true },
    // id 5 has no record → counts as unrated
  ];

  it('countStudyState buckets correctly; unrecorded ids are unrated', () => {
    const c = countStudyState(ids, records);
    expect(c.known).toBe(2);
    expect(c.stillLearning).toBe(1);
    expect(c.unrated).toBe(2);   // id 4 (unrated) + id 5 (no record)
    expect(c.starred).toBe(2);   // ids 2 and 4
  });

  it('masteryPercentage = known / total questions', () => {
    expect(masteryPercentage(ids, records)).toBe(40); // 2 known / 5
    expect(masteryPercentage([], records)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// One-time auto-deck migration
// ---------------------------------------------------------------------------

describe('studyState — migrateAutoDecksForExam', () => {
  const questions: LegacyQuestion[] = [
    { id: 1, question: 'Q-one', options: ['a'], correctAnswers: [0], explanation: '' },
    { id: 2, question: 'Q-two', options: ['a'], correctAnswers: [0], explanation: '' },
    { id: 3, question: 'Q-three', options: ['a'], correctAnswers: [0], explanation: '' },
  ];

  function card(deckId: string, front: string, mastery = 0): Flashcard {
    return { id: `c-${front}`, deckId, front, back: 'x', masteryLevel: mastery, createdAt: NOW, updatedAt: NOW };
  }

  it('folds known/learning auto-deck cards into study state and reports consumed ids', () => {
    const cards = [
      card(knownAutoDeckId('E'), 'Q-one', 2),
      card(learningAutoDeckId('E'), 'Q-two'),
      card('custom-deck', 'Q-three'), // untouched — not an auto-deck
    ];
    const { merged, consumedCardIds, migratedCount } = migrateAutoDecksForExam('E', questions, cards, [], NOW);

    expect(migratedCount).toBe(2);
    expect(consumedCardIds).toEqual(['c-Q-one', 'c-Q-two']);
    const byId = new Map(merged.map(s => [s.questionId, s]));
    expect(byId.get(1)!.status).toBe('known');
    expect(byId.get(1)!.masteryLevel).toBe(2);  // carried over
    expect(byId.get(2)!.status).toBe('still-learning');
    expect(byId.has(3)).toBe(false);            // custom-deck card not migrated
  });

  it('is a no-op when there are no auto-deck cards', () => {
    const { merged, consumedCardIds, migratedCount } = migrateAutoDecksForExam('E', questions, [card('custom', 'Q-one')], [], NOW);
    expect(migratedCount).toBe(0);
    expect(consumedCardIds).toEqual([]);
    expect(merged).toEqual([]);
  });

  it('never overwrites existing study state (re-run safe)', () => {
    const existing: QuestionStudyState[] = [{ ...base, questionId: 1, status: 'still-learning', masteryLevel: 0 }];
    const cards = [card(knownAutoDeckId('E'), 'Q-one', 5)];
    const { merged, migratedCount } = migrateAutoDecksForExam('E', questions, cards, existing, NOW);
    expect(migratedCount).toBe(0); // id 1 already has state — left as-is
    expect(merged.find(s => s.questionId === 1)!.status).toBe('still-learning');
  });

  it('known cards get at least mastery 1', () => {
    const cards = [card(knownAutoDeckId('E'), 'Q-one', 0)];
    const { merged } = migrateAutoDecksForExam('E', questions, cards, [], NOW);
    expect(merged.find(s => s.questionId === 1)!.masteryLevel).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Practice-Incorrect source (§3.2)
// ---------------------------------------------------------------------------

describe('studyState — computePracticeIncorrectIds (pure)', () => {
  const result = (incorrectQuestionIds: number[]): QuizResult => ({
    date: NOW, score: 0, totalQuestions: incorrectQuestionIds.length, timeSpent: 0,
    percentage: 0, incorrectQuestionIds,
  });

  it('includes still-learning questions', () => {
    const state: QuestionStudyState[] = [
      { ...base, questionId: 1, status: 'still-learning' },
      { ...base, questionId: 2, status: 'known' },
      { ...base, questionId: 3, status: 'unrated' },
    ];
    expect(computePracticeIncorrectIds(state, [])).toEqual([1]);
  });

  it('includes questions missed in quiz history', () => {
    expect(computePracticeIncorrectIds([], [result([5, 7]), result([7, 9])])).toEqual([5, 7, 9]);
  });

  it('unions still-learning with missed-in-history and de-dupes/sorts', () => {
    const state: QuestionStudyState[] = [{ ...base, questionId: 3, status: 'still-learning' }];
    expect(computePracticeIncorrectIds(state, [result([3, 1])])).toEqual([1, 3]);
  });

  it('excludes questions the user has since marked known, even if missed before', () => {
    const state: QuestionStudyState[] = [{ ...base, questionId: 5, status: 'known' }];
    // 5 was missed historically but is now known → excluded; 6 still surfaces.
    expect(computePracticeIncorrectIds(state, [result([5, 6])])).toEqual([6]);
  });

  it('returns empty when nothing is missed or still-learning', () => {
    expect(computePracticeIncorrectIds([], [])).toEqual([]);
  });
});

describe('studyState — getPracticeIncorrectIds (stateful)', () => {
  let mockLS: Storage;
  beforeEach(() => { mockLS = createLocalStorageMock(); vi.stubGlobal('localStorage', mockLS); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads study state + quiz analytics for the exam', () => {
    rateQuestion('E', 1, false); // still-learning
    rateQuestion('E', 2, true);  // known
    StorageService.saveExamAnalytics({
      E: {
        results: [{ date: NOW, score: 0, totalQuestions: 2, timeSpent: 0, percentage: 0, incorrectQuestionIds: [2, 4] }],
        averageScore: 0, bestScore: 0, totalAttempts: 1, averageTime: 0,
      },
    });
    // 1 still-learning, 4 missed-and-not-known; 2 is known so excluded.
    expect(getPracticeIncorrectIds('E')).toEqual([1, 4]);
  });

  it('isolates exams', () => {
    rateQuestion('E1', 1, false);
    rateQuestion('E2', 2, false);
    expect(getPracticeIncorrectIds('E1')).toEqual([1]);
  });
});
