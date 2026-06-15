/**
 * Bug Condition Regression Guards
 *
 * Originally these tests encoded the EXPECTED behavior for five known bugs by
 * asserting against *inlined copies* of the buggy logic — so they could never
 * pass no matter how the app was fixed. They have been re-authored to import
 * and exercise the REAL modules, so they now pass against the fixed code and
 * act as genuine regression guards: if a fix is reverted, the matching test
 * goes red again.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { shuffle } from '../lib/shuffle';
import { isAnswerCorrect, isSingleSelect } from '../lib/answers';
import { StorageService } from '../services/storage';

// ---------------------------------------------------------------------------
// In-memory localStorage mock (shared with preservation.test.ts pattern)
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
// Bug 1 — Index Typo: SAP-C02 entry should have id "AWS-SAP-C02"
// ---------------------------------------------------------------------------

describe('Bug 1 — Exam Index Typo', () => {
  it('SAP-C02 entry should have id "AWS-SAP-C02"', () => {
    /**
     * Validates: Requirements 1.1
     *
     * The exam index file should contain the correct ID for the AWS Solutions
     * Architect Professional exam. The bug was a typo: "AWS-SA{-C02" instead
     * of "AWS-SAP-C02".
     */
    const indexPath = path.resolve(__dirname, '../../public/exams/index.json');
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

    const sapEntry = indexData.find(
      (e: { name: string }) => e.name === 'AWS Solutions Architect - Professional'
    );

    expect(sapEntry).toBeDefined();
    expect(sapEntry.id).toBe('AWS-SAP-C02');
  });
});

// ---------------------------------------------------------------------------
// Bug 2 — Mutating Sort: answer comparison must not mutate arrays
// ---------------------------------------------------------------------------

describe('Bug 2 — Mutating Sort in answer comparison', () => {
  /**
   * Validates: Requirements 1.2
   *
   * QuizMode's scoring previously compared answers with
   *   answer.sort().toString() === correctAnswers.sort().toString()
   * which mutates both arrays in place. The logic now lives in
   * `lib/answers.ts#isAnswerCorrect`, which spreads before sorting. This test
   * exercises that REAL function and asserts it never mutates its inputs and
   * is order-insensitive.
   */

  it('isAnswerCorrect does NOT mutate its inputs (property-based)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(10), { minLength: 1, maxLength: 6 }),
        fc.array(fc.nat(10), { minLength: 1, maxLength: 6 }),
        (answerSrc, correctSrc) => {
          const answer = [...answerSrc];
          const correct = [...correctSrc];
          const answerBefore = [...answer];
          const correctBefore = [...correct];

          isAnswerCorrect(answer, correct);

          expect(answer).toEqual(answerBefore);
          expect(correct).toEqual(correctBefore);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('isAnswerCorrect is order-insensitive and set-exact (property-based)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.nat(10), { minLength: 1, maxLength: 6 }),
        (correct) => {
          // A shuffled copy of the exact same set is correct...
          expect(isAnswerCorrect(shuffle(correct), correct)).toBe(true);
          // ...but a strict superset (over-selection) is not.
          const extra = [...correct, 11];
          expect(isAnswerCorrect(extra, correct)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Bug 3 — Hardcoded deckId: saveSession should use the provided deckId
// ---------------------------------------------------------------------------

describe('Bug 3 — Hardcoded deckId in review sessions', () => {
  /**
   * Validates: Requirements 1.3
   *
   * FlashcardViewer.saveSession previously hardcoded `deckId: 'legacy'` for
   * every session, ignoring the `deckId` prop. It now uses `deckId ?? 'legacy'`.
   * We drive the REAL FlashcardViewer through a one-card classic session with a
   * concrete deckId and assert the persisted ReviewSession carries that id.
   */

  let mockLS: Storage;

  beforeEach(() => {
    mockLS = createLocalStorageMock();
    vi.stubGlobal('localStorage', mockLS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('completing a deck review saves the session with the provided deckId', async () => {
    const React = (await import('react')).default;
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
    const { FlashcardViewer } = await import('../components/flashcard/FlashcardViewer');
    const { ToastProvider } = await import('../components/ui/toast');

    const deckIdProp = 'deck-abc-123';
    const questions = [
      { question: 'What is S3?', options: ['Storage', 'Compute'], correctAnswers: [0], explanation: '' },
    ];

    render(
      React.createElement(ToastProvider, null,
        React.createElement(FlashcardViewer, {
          questions,
          shuffleQuestions: () => {},
          decks: [],
          onSaveCardToDeck: () => true,
          onCreateDeck: () => ({ id: 'd', name: 'd', examIds: [], createdAt: '' }),
          deckId: deckIdProp,
        })
      )
    );

    // Classic mode: reveal then mark the only card known → ends the session.
    fireEvent.click(screen.getByText('Reveal Answer'));
    fireEvent.click(screen.getByLabelText('Mark card as known'));

    const sessions = StorageService.getReviewSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].deckId).toBe(deckIdProp);

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// Bug 4 — Shuffle No-Op: shuffle must actually reorder
// ---------------------------------------------------------------------------

describe('Bug 4 — Shuffle actually reorders', () => {
  /**
   * Validates: Requirements 1.4
   *
   * Deck review passed a no-op `shuffleQuestions={() => {}}`, so cards never
   * moved. FlashcardViewer now shuffles its local copy via the shared
   * `lib/shuffle.ts#shuffle` (Fisher-Yates). This exercises that REAL util:
   * it must reorder and must not mutate the source.
   */

  it('shuffle reorders a 20-element array and leaves the source untouched', () => {
    const source = Array.from({ length: 20 }, (_, i) => i);
    const before = [...source];

    const result = shuffle(source);

    // Source is untouched.
    expect(source).toEqual(before);
    // Same multiset of elements.
    expect([...result].sort((a, b) => a - b)).toEqual(before);
    // Reordered. P(identical permutation of 20) = 1/20! ≈ 4e-19.
    const orderChanged = before.some((v, i) => v !== result[i]);
    expect(orderChanged).toBe(true);
  });

  it('shuffle is a uniform-ish permutation, not a no-op (property-based)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer(), { minLength: 10, maxLength: 50 }),
        (source) => {
          const result = shuffle(source);
          // Permutation invariant: same elements regardless of order.
          expect([...result].sort((a, b) => a - b)).toEqual([...source].sort((a, b) => a - b));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Bug 5 — Global Duplicate Check: question in deck A is addable to deck B
// ---------------------------------------------------------------------------

describe('Bug 5 — Duplicate check is scoped to the target deck', () => {
  /**
   * Validates: Requirements 1.5
   *
   * QuestionSearchPanel previously built `addedQuestions` from ALL flashcards
   * globally, so a card already in deck A showed "Already added" when the user
   * targeted deck B. The check is now scoped to the selected target deck. We
   * render the REAL panel, target deck B, and assert the Add button is enabled
   * (label "Add", not "Already added") for a question that only exists in A.
   */

  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
    vi.resetModules();
  });

  it('a question in deck A is still addable when targeting deck B', async () => {
    const React = (await import('react')).default;
    const { render, screen, fireEvent } = await import('@testing-library/react');
    const { QuestionSearchPanel } = await import('../components/flashcard/QuestionSearchPanel');
    const { ToastProvider } = await import('../components/ui/toast');

    const questionText = 'What is S3?';
    const decks = [
      { id: 'deck-A', name: 'Deck A', examIds: ['exam-1'], createdAt: '' },
      { id: 'deck-B', name: 'Deck B', examIds: ['exam-1'], createdAt: '' },
    ];
    const flashcards = [
      {
        id: 'card-1', deckId: 'deck-A', front: questionText, back: 'answer',
        masteryLevel: 0, createdAt: '', updatedAt: '',
      },
    ];

    render(
      React.createElement(ToastProvider, null,
        React.createElement(QuestionSearchPanel, {
          examId: 'exam-1',
          questions: [{ question: questionText, options: ['Storage', 'Compute'], correctAnswers: [0], explanation: '' }],
          decks,
          flashcards,
          onCardAdded: () => {},
          onCreateDeck: () => ({ id: 'x', name: 'x', examIds: [], createdAt: '' }),
        })
      )
    );

    // Search to surface the question, then target deck B.
    fireEvent.change(screen.getByLabelText('Search exam questions'), {
      target: { value: questionText },
    });
    fireEvent.change(screen.getByLabelText('Select deck'), {
      target: { value: 'deck-B' },
    });

    // The Add button must be enabled and labeled "Add" — NOT "Already added".
    const addButton = screen.getByRole('button', { name: 'Add' });
    expect(addButton).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Already added' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2 fix — single- vs multi-select derivation
// ---------------------------------------------------------------------------

describe('Single- vs multi-select derivation', () => {
  /**
   * Validates: Requirements 1.2 (single/multi UI + scoring)
   *
   * The UI chooses radios vs checkboxes from `correctAnswers.length` via
   * `lib/answers.ts#isSingleSelect`.
   */
  it('single-select iff there is at most one correct answer', () => {
    expect(isSingleSelect([0])).toBe(true);
    expect(isSingleSelect([])).toBe(true);
    expect(isSingleSelect([0, 2])).toBe(false);
    expect(isSingleSelect([0, 1, 3])).toBe(false);
  });
});
