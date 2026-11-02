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
  QuizResult,
  Deck,
  Flashcard,
  ReviewSession,
  QuestionStudyState,
} from '../types/index';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  DECKS: 'epl_decks',
  FLASHCARDS: 'epl_flashcards',
  REVIEW_SESSIONS: 'epl_review_sessions',
  QUESTION_TAGS: 'epl_question_tags',
  STUDY_STATE: 'epl_study_state',
  THEME: 'epl_theme',
  LEARNER: 'epl_learner',
  ACTIVITY_OUTBOX: 'epl_activity_outbox',
  ACTIVITY_LAST_VISIT: 'epl_activity_last_visit',
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
    message: 'Storage limit reached. Clear data you no longer need from Settings to free up space.',
  };
  window.dispatchEvent(new CustomEvent<QuotaExceededDetail>(QUOTA_EXCEEDED_EVENT, { detail }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Same container kind as the fallback: array vs. plain (non-null, non-array) object. */
function hasSameShape(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (fallback !== null && typeof fallback === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  return typeof value === typeof fallback;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!hasSameShape(parsed, fallback)) {
      console.warn(`[StorageService] Unexpected shape for key "${key}"; using default.`);
      return fallback;
    }
    return parsed as T;
  } catch (err) {
    console.warn(`[StorageService] Malformed JSON for key "${key}":`, err);
    return fallback;
  }
}

// Per-entry guards: a wrong-shaped entry is dropped instead of crashing a reader later.
// They check the fields the app relies on; optional fields are not checked.
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isDeck(v: unknown): v is Deck {
  return isRec(v) && isStr(v.id) && isStr(v.name) && Array.isArray(v.examIds) && v.examIds.every(isStr) && isStr(v.createdAt);
}

function isFlashcard(v: unknown): v is Flashcard {
  return (
    isRec(v) && isStr(v.id) && isStr(v.deckId) && isStr(v.front) && isStr(v.back) &&
    isNum(v.masteryLevel) && isStr(v.createdAt) && isStr(v.updatedAt)
  );
}

function isReviewSession(v: unknown): v is ReviewSession {
  return (
    isRec(v) && isStr(v.id) && isStr(v.deckId) && isNum(v.totalCards) && isNum(v.knownCount) &&
    isNum(v.stillLearningCount) && typeof v.shuffled === 'boolean' && isStr(v.completedAt)
  );
}

function isStudyState(v: unknown): v is QuestionStudyState {
  return (
    isRec(v) && isStr(v.examId) && Number.isInteger(v.questionId) &&
    (v.status === 'unrated' || v.status === 'still-learning' || v.status === 'known') &&
    typeof v.starred === 'boolean' && isNum(v.masteryLevel) && isStr(v.updatedAt)
  );
}

function isQuizResult(v: unknown): v is QuizResult {
  return (
    isRec(v) && isStr(v.date) && isNum(v.score) && isNum(v.totalQuestions) &&
    isNum(v.timeSpent) && isNum(v.percentage)
  );
}

/** Keep exam entries with the expected fields; drop the wrong-shaped Results inside them. */
function cleanAnalytics(raw: Rec): ExamAnalytics {
  const out: ExamAnalytics = {};
  for (const [examId, e] of Object.entries(raw)) {
    if (!isRec(e) || !Array.isArray(e.results)) continue;
    if (![e.averageScore, e.bestScore, e.totalAttempts, e.averageTime].every(isNum)) continue;
    out[examId] = { ...(e as ExamAnalytics[string]), results: e.results.filter(isQuizResult) };
  }
  return out;
}

function readArray<T>(key: string, isEntry: (v: unknown) => v is T): T[] {
  return readJson<unknown[]>(key, []).filter(isEntry);
}

function writeJson<T>(key: string, value: T): void {
  writeRaw(key, JSON.stringify(value));
}

/** Quota-safe setItem: on a quota error, dispatch QUOTA_EXCEEDED_EVENT instead of throwing. */
function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
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
  // ── Legacy: quiz analytics (quizAnalytics key) ────────────────────────────

  getExamAnalytics(): ExamAnalytics {
    return cleanAnalytics(readJson<Rec>(STORAGE_KEYS.QUIZ_ANALYTICS, {}));
  },

  saveExamAnalytics(analytics: ExamAnalytics): void {
    writeJson(STORAGE_KEYS.QUIZ_ANALYTICS, analytics);
  },

  // ── Legacy: selected exam ─────────────────────────────────────────────────

  getSelectedExam(): string | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SELECTED_EXAM);
      if (raw === null) return null;
      // Handle both JSON-stringified and plain string values
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : raw;
    } catch {
      // If not valid JSON, return the raw value (backward compat)
      return localStorage.getItem(STORAGE_KEYS.SELECTED_EXAM);
    }
  },

  saveSelectedExam(examId: string): void {
    // Store as plain string (not JSON-wrapped) for consistency with getSelectedExam
    writeRaw(STORAGE_KEYS.SELECTED_EXAM, examId);
  },

  // ── Decks ─────────────────────────────────────────────────────────────────

  getDecks(): Deck[] {
    return readArray(STORAGE_KEYS.DECKS, isDeck);
  },

  saveDecks(decks: Deck[]): void {
    writeJson(STORAGE_KEYS.DECKS, decks);
  },

  // ── Flashcards ────────────────────────────────────────────────────────────

  getFlashcards(): Flashcard[] {
    return readArray(STORAGE_KEYS.FLASHCARDS, isFlashcard);
  },

  saveFlashcards(flashcards: Flashcard[]): void {
    writeJson(STORAGE_KEYS.FLASHCARDS, flashcards);
  },

  // ── Review sessions ───────────────────────────────────────────────────────

  getReviewSessions(): ReviewSession[] {
    return readArray(STORAGE_KEYS.REVIEW_SESSIONS, isReviewSession);
  },

  saveReviewSessions(sessions: ReviewSession[]): void {
    writeJson(STORAGE_KEYS.REVIEW_SESSIONS, sessions);
  },

  // ── Question tags (epl_question_tags; entries validated by tagService) ──────

  getQuestionTags(): unknown[] {
    return readJson<unknown[]>(STORAGE_KEYS.QUESTION_TAGS, []);
  },

  saveQuestionTags(assignments: unknown[]): void {
    writeJson(STORAGE_KEYS.QUESTION_TAGS, assignments);
  },

  // ── Per-question study state (epl_study_state) ────────────────────────────

  getStudyState(): QuestionStudyState[] {
    return readArray(STORAGE_KEYS.STUDY_STATE, isStudyState);
  },

  saveStudyState(state: QuestionStudyState[]): void {
    writeJson(STORAGE_KEYS.STUDY_STATE, state);
  },

  /** Compute current localStorage usage in bytes and as a percentage of estimated 5MB quota. */
  getStorageUsage(): { bytes: number; percentage: number } {
    let total = 0;
    for (const key of Object.values(STORAGE_KEYS)) {
      const value = localStorage.getItem(key);
      if (value) total += key.length + value.length;
    }
    const bytes = total * 2; // UTF-16 encoding
    const quota = 5 * 1024 * 1024; // 5MB estimate
    return { bytes, percentage: (bytes / quota) * 100 };
  },

  // ── Learner (epl_learner) ─────────────────────────────────────────────────
  // Raw read/write only; shape checks and name rules live in services/learner.ts.

  getLearnerRaw(): unknown {
    return readJson<unknown>(STORAGE_KEYS.LEARNER, null);
  },

  saveLearnerRaw(learner: unknown): void {
    writeJson(STORAGE_KEYS.LEARNER, learner);
  },

  // ── Activity outbox (epl_activity_outbox) + last Visit day ───────────────
  // Raw read/write only; entry shape and send rules live in services/activity.ts.

  getActivityOutbox(): unknown[] {
    return readJson<unknown[]>(STORAGE_KEYS.ACTIVITY_OUTBOX, []);
  },

  saveActivityOutbox(items: unknown[]): void {
    writeJson(STORAGE_KEYS.ACTIVITY_OUTBOX, items);
  },

  getActivityLastVisit(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACTIVITY_LAST_VISIT);
  },

  saveActivityLastVisit(day: string): void {
    writeRaw(STORAGE_KEYS.ACTIVITY_LAST_VISIT, day);
  },

  /**
   * Remove all Exam Prep Lab study data from localStorage. The Learner record
   * is kept: its id never changes (SPEC §9.1). Unsent Activity and the last
   * Visit day are kept too: they are not study data.
   */
  clearAllData(): void {
    const kept: string[] = [
      STORAGE_KEYS.LEARNER,
      STORAGE_KEYS.ACTIVITY_OUTBOX,
      STORAGE_KEYS.ACTIVITY_LAST_VISIT,
    ];
    const eplKeys = Object.values(STORAGE_KEYS).filter((k) => !kept.includes(k));
    for (const key of eplKeys) {
      localStorage.removeItem(key);
    }
  },
} as const;
