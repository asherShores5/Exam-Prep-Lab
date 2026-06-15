/**
 * studyState.ts — per-question study state service (SPEC §3.3, §3.4).
 *
 * The single source of truth for a question's known/unknown status, starred
 * flag, and spaced-repetition mastery. Records are keyed by the pair
 * (examId, questionId) — see the `question-identity-model` design note. "Known",
 * "Still Learning", and "Starred" are filtered VIEWS over these records, not
 * separate copied card collections (which is what the old auto-decks were).
 *
 * All persistence routes through StorageService. The pure transform helpers
 * (applyRating, toggleStarred, filtering) are exported separately so they can be
 * unit-tested without touching localStorage.
 */

import type { QuestionStudyState, StudyStatus, LegacyQuestion, Flashcard, QuizResult } from '../types/index';
import { StorageService } from './storage';
import { computeNextReview } from './spacedRepetition';

// ---------------------------------------------------------------------------
// Keys & lookups (pure)
// ---------------------------------------------------------------------------

/** Find the index of the record for (examId, questionId), or -1. */
function indexOf(state: QuestionStudyState[], examId: string, questionId: number): number {
  return state.findIndex(s => s.examId === examId && s.questionId === questionId);
}

/** A fresh, unrated record for a question. */
function blankState(examId: string, questionId: number, now: string): QuestionStudyState {
  return {
    examId,
    questionId,
    status: 'unrated',
    starred: false,
    masteryLevel: 0,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Pure transforms (no I/O) — exported for testing
// ---------------------------------------------------------------------------

/**
 * Apply a Known / Still-Learning rating to a record, returning a NEW record.
 * "known" increments mastery; "still-learning" resets it to 0 — mirroring
 * spacedRepetition.updateMastery, but on study state.
 */
export function applyRating(
  prev: QuestionStudyState,
  known: boolean,
  now: string,
): QuestionStudyState {
  return {
    ...prev,
    status: known ? 'known' : 'still-learning',
    masteryLevel: known ? prev.masteryLevel + 1 : 0,
    lastReviewedAt: now,
    updatedAt: now,
  };
}

/** Toggle the starred flag, returning a NEW record. */
export function toggleStarred(prev: QuestionStudyState, now: string): QuestionStudyState {
  return { ...prev, starred: !prev.starred, updatedAt: now };
}

/** Whether a record is due for review (delegates to spaced-repetition math). */
export function isStudyStateDue(state: QuestionStudyState, now?: Date): boolean {
  if (!state.lastReviewedAt) return true;
  const ref = now ?? new Date();
  return computeNextReview(state.masteryLevel, new Date(state.lastReviewedAt)).getTime() <= ref.getTime();
}

// ---------------------------------------------------------------------------
// Stateful operations (read-modify-write through StorageService)
// ---------------------------------------------------------------------------

/** Get the record for (examId, questionId), or undefined if none exists yet. */
export function getStudyState(examId: string, questionId: number): QuestionStudyState | undefined {
  const all = StorageService.getStudyState();
  const idx = indexOf(all, examId, questionId);
  return idx === -1 ? undefined : all[idx];
}

/** All records for one exam. */
export function getExamStudyState(examId: string): QuestionStudyState[] {
  return StorageService.getStudyState().filter(s => s.examId === examId);
}

/** Upsert: apply `mutate` to the existing record (or a fresh blank), persist, return the result. */
function upsert(
  examId: string,
  questionId: number,
  mutate: (prev: QuestionStudyState, now: string) => QuestionStudyState,
  now: string = new Date().toISOString(),
): QuestionStudyState {
  const all = StorageService.getStudyState();
  const idx = indexOf(all, examId, questionId);
  const prev = idx === -1 ? blankState(examId, questionId, now) : all[idx];
  const next = mutate(prev, now);
  const updated = idx === -1 ? [...all, next] : all.map((s, i) => (i === idx ? next : s));
  StorageService.saveStudyState(updated);
  return next;
}

/** Rate a question Known / Still Learning. Creates the record if needed. */
export function rateQuestion(examId: string, questionId: number, known: boolean): QuestionStudyState {
  return upsert(examId, questionId, (prev, now) => applyRating(prev, known, now));
}

/** Toggle a question's starred flag. Creates the record if needed. */
export function toggleStar(examId: string, questionId: number): QuestionStudyState {
  return upsert(examId, questionId, (prev, now) => toggleStarred(prev, now));
}

// ---------------------------------------------------------------------------
// Views & counts (pure over a provided record set)
// ---------------------------------------------------------------------------

export interface StudyStateCounts {
  known: number;
  stillLearning: number;
  unrated: number;
  starred: number;
}

/** Build a quick lookup of questionId → record for one exam's records. */
export function indexByQuestionId(records: QuestionStudyState[]): Map<number, QuestionStudyState> {
  return new Map(records.map(r => [r.questionId, r]));
}

/**
 * Count study-state buckets for an exam, given the exam's full question id list
 * and its study-state records. Questions with no record count as `unrated`.
 */
export function countStudyState(
  allQuestionIds: number[],
  records: QuestionStudyState[],
): StudyStateCounts {
  const byId = indexByQuestionId(records);
  let known = 0, stillLearning = 0, unrated = 0, starred = 0;
  for (const id of allQuestionIds) {
    const rec = byId.get(id);
    if (rec?.starred) starred++;
    const status: StudyStatus = rec?.status ?? 'unrated';
    if (status === 'known') known++;
    else if (status === 'still-learning') stillLearning++;
    else unrated++;
  }
  return { known, stillLearning, unrated, starred };
}

/** Mastery % for an exam = known / total questions (0 when no questions). */
export function masteryPercentage(allQuestionIds: number[], records: QuestionStudyState[]): number {
  if (allQuestionIds.length === 0) return 0;
  const { known } = countStudyState(allQuestionIds, records);
  return Math.round((known / allQuestionIds.length) * 100);
}

// ---------------------------------------------------------------------------
// One-time migration from legacy auto-decks (§3.3)
// ---------------------------------------------------------------------------

/** Auto-deck id helpers (these decks are being retired in favour of study state). */
export function knownAutoDeckId(examId: string): string {
  return `__known__${examId}`;
}
export function learningAutoDeckId(examId: string): string {
  return `__learning__${examId}`;
}

/**
 * Migrate the legacy `__known__`/`__learning__` auto-deck flashcards for ONE exam
 * into study-state records, matching each card's `front` (prompt) to a question
 * `id` in that exam's bank. Pure: returns the work to do; the caller persists.
 *
 * - Only fills in questions that don't already have a study-state record
 *   (existing state always wins — re-running is a no-op).
 * - "Known" cards → status 'known' (mastery carried over, min 1);
 *   "Still Learning" cards → status 'still-learning'.
 * - Returns the auto-deck card ids that were consumed, so the caller can drop
 *   them from epl_flashcards.
 */
export function migrateAutoDecksForExam(
  examId: string,
  questions: LegacyQuestion[],
  allFlashcards: Flashcard[],
  existing: QuestionStudyState[],
  now: string = new Date().toISOString(),
): { merged: QuestionStudyState[]; consumedCardIds: string[]; migratedCount: number } {
  const knownId = knownAutoDeckId(examId);
  const learningId = learningAutoDeckId(examId);
  const autoCards = allFlashcards.filter(c => c.deckId === knownId || c.deckId === learningId);

  if (autoCards.length === 0) {
    return { merged: existing, consumedCardIds: [], migratedCount: 0 };
  }

  const promptToId = new Map(
    questions
      .filter(q => typeof q.id === 'number')
      .map(q => [q.question, q.id as number]),
  );
  const have = new Set(existing.filter(s => s.examId === examId).map(s => s.questionId));

  const additions: QuestionStudyState[] = [];
  const consumedCardIds: string[] = [];

  for (const card of autoCards) {
    consumedCardIds.push(card.id);
    const questionId = promptToId.get(card.front);
    if (questionId === undefined) continue;     // prompt no longer in bank
    if (have.has(questionId)) continue;          // already has study state
    have.add(questionId);
    const known = card.deckId === knownId;
    additions.push({
      examId,
      questionId,
      status: known ? 'known' : 'still-learning',
      starred: false,
      masteryLevel: known ? Math.max(1, card.masteryLevel) : 0,
      lastReviewedAt: card.lastReviewedAt ?? now,
      updatedAt: now,
    });
  }

  return {
    merged: [...existing, ...additions],
    consumedCardIds,
    migratedCount: additions.length,
  };
}

// ---------------------------------------------------------------------------
// Practice-Incorrect source (§3.2)
// ---------------------------------------------------------------------------

/**
 * The set of question ids a user should "practice what they missed":
 *   - questions currently marked `still-learning` in study state, PLUS
 *   - questions recorded as incorrect in quiz history (`incorrectQuestionIds`).
 * Questions the user has since marked `known` are excluded — once mastered, a
 * past miss shouldn't keep resurfacing.
 *
 * Pure: returns a sorted, de-duplicated id list from the provided inputs.
 */
export function computePracticeIncorrectIds(
  studyStateRecords: QuestionStudyState[],
  quizResults: QuizResult[],
): number[] {
  const known = new Set(studyStateRecords.filter(s => s.status === 'known').map(s => s.questionId));
  const ids = new Set<number>();

  for (const s of studyStateRecords) {
    if (s.status === 'still-learning') ids.add(s.questionId);
  }
  for (const r of quizResults) {
    for (const id of r.incorrectQuestionIds ?? []) {
      if (!known.has(id)) ids.add(id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/** Stateful: practice-incorrect ids for one exam, read from StorageService. */
export function getPracticeIncorrectIds(examId: string): number[] {
  const state = getExamStudyState(examId);
  const results = StorageService.getExamAnalytics()[examId]?.results ?? [];
  return computePracticeIncorrectIds(state, results);
}
