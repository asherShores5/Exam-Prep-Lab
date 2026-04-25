/**
 * StorageService — single point of contact for all localStorage reads/writes.
 *
 * Rules:
 *  - Components NEVER call localStorage directly; they use this service.
 *  - Every setItem call is wrapped in a try/catch for QuotaExceededError.
 *    When quota is exceeded the service dispatches a custom DOM event so any
 *    part of the UI can react without tight coupling.
 */

import type {
  ExamAnalytics,
  Exam,
  Question,
  Deck,
  Flashcard,
  QuizSession,
  ReviewSession,
} from '../types/index';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  SCHEMA_VERSION: 'epl_schema_version',
  EXAMS: 'epl_exams',
  QUESTIONS: 'epl_questions',
  DECKS: 'epl_decks',
  FLASHCARDS: 'epl_flashcards',
  QUIZ_SESSIONS: 'epl_quiz_sessions',
  REVIEW_SESSIONS: 'epl_review_sessions',
  // Legacy keys kept for backward-compat migration
  QUIZ_ANALYTICS: 'quizAnalytics',
  SELECTED_EXAM: 'selectedExam',
} as const;

// ---------------------------------------------------------------------------
// Quota-exceeded event
// ---------------------------------------------------------------------------

export const QUOTA_EXCEEDED_EVENT = 'epl:quotaExceeded';

/** Dispatched on window whenever a setItem call hits the storage quota. */
export interface QuotaExceededDetail {
  message: string;
}

function dispatchQuotaExceeded(): void {
  const detail: QuotaExceededDetail = {
    message: 'Storage limit reached. Export your data to free up space.',
  };
  window.dispatchEvent(new CustomEvent<QuotaExceededDetail>(QUOTA_EXCEEDED_EVENT, { detail }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22)
    ) {
      dispatchQuotaExceeded();
    } else {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// StorageService
// ---------------------------------------------------------------------------

export const StorageService = {
  // ── Schema version ────────────────────────────────────────────────────────

  getSchemaVersion(): string | null {
    return localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
  },

  saveSchemaVersion(version: string): void {
    writeJson(STORAGE_KEYS.SCHEMA_VERSION, version);
  },

  // ── Legacy: quiz analytics (quizAnalytics key) ────────────────────────────

  getExamAnalytics(): ExamAnalytics {
    return readJson<ExamAnalytics>(STORAGE_KEYS.QUIZ_ANALYTICS, {});
  },

  saveExamAnalytics(analytics: ExamAnalytics): void {
    writeJson(STORAGE_KEYS.QUIZ_ANALYTICS, analytics);
  },

  // ── Legacy: selected exam ─────────────────────────────────────────────────

  getSelectedExam(): string | null {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_EXAM);
  },

  saveSelectedExam(examId: string): void {
    writeJson(STORAGE_KEYS.SELECTED_EXAM, examId);
  },

  // ── Exams ─────────────────────────────────────────────────────────────────

  getExams(): Exam[] {
    return readJson<Exam[]>(STORAGE_KEYS.EXAMS, []);
  },

  saveExams(exams: Exam[]): void {
    writeJson(STORAGE_KEYS.EXAMS, exams);
  },

  // ── Questions ─────────────────────────────────────────────────────────────

  getQuestions(): Question[] {
    return readJson<Question[]>(STORAGE_KEYS.QUESTIONS, []);
  },

  saveQuestions(questions: Question[]): void {
    writeJson(STORAGE_KEYS.QUESTIONS, questions);
  },

  // ── Decks ─────────────────────────────────────────────────────────────────

  getDecks(): Deck[] {
    return readJson<Deck[]>(STORAGE_KEYS.DECKS, []);
  },

  saveDecks(decks: Deck[]): void {
    writeJson(STORAGE_KEYS.DECKS, decks);
  },

  // ── Flashcards ────────────────────────────────────────────────────────────

  getFlashcards(): Flashcard[] {
    return readJson<Flashcard[]>(STORAGE_KEYS.FLASHCARDS, []);
  },

  saveFlashcards(flashcards: Flashcard[]): void {
    writeJson(STORAGE_KEYS.FLASHCARDS, flashcards);
  },

  // ── Quiz sessions ─────────────────────────────────────────────────────────

  getQuizSessions(): QuizSession[] {
    return readJson<QuizSession[]>(STORAGE_KEYS.QUIZ_SESSIONS, []);
  },

  saveQuizSessions(sessions: QuizSession[]): void {
    writeJson(STORAGE_KEYS.QUIZ_SESSIONS, sessions);
  },

  // ── Review sessions ───────────────────────────────────────────────────────

  getReviewSessions(): ReviewSession[] {
    return readJson<ReviewSession[]>(STORAGE_KEYS.REVIEW_SESSIONS, []);
  },

  saveReviewSessions(sessions: ReviewSession[]): void {
    writeJson(STORAGE_KEYS.REVIEW_SESSIONS, sessions);
  },
} as const;
