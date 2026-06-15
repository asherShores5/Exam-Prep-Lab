// src/types/index.ts
// Shared TypeScript types for Exam Prep Lab

// ---------------------------------------------------------------------------
// Legacy types (used by the existing quiz app)
// ---------------------------------------------------------------------------

/**
 * Question shape used by the static JSON exam files in public/exams/. This is
 * the single question model the app studies (loaded + validated at runtime).
 */
export interface LegacyQuestion {
  /**
   * Stable integer id, unique within its exam file. The app-wide identity of a
   * question is the pair (examId, id); ids are NOT globally unique across banks.
   * Assigned by scripts/assign-ids.mjs and permanent once set. Optional only so
   * older/unprocessed banks still type-check; shipped exams always carry it.
   */
  id?: number;
  question: string;
  options: string[];
  correctAnswers: number[];
  explanation: string;
  domain?: string;
}

/** Exam Simulation preset (SPEC §3.5 / Appendix A.2) — realistic exam conditions. */
export interface ExamSimPreset {
  questionCount: number;
  timeLimitMinutes: number;
  passThresholdPercent: number;
}

/** Entry in the exam index file (public/exams/index.json) */
export interface ExamIndex {
  id: string;
  name: string;
  path: string;
  version?: string;
  description?: string;
  code?: string;
  /** Optional Exam Simulation preset; falls back to defaults (A.5) when absent. */
  sim?: ExamSimPreset;
}

/** Per-domain breakdown stored with each quiz attempt */
export interface QuizResultDomain {
  domain: string;
  correct: number;
  total: number;
}

/** Result of a single completed quiz attempt */
export interface QuizResult {
  date: string;
  score: number;
  totalQuestions: number;
  timeSpent: number;
  percentage: number;
  /** Domain breakdown for this attempt (populated when domain data is available) */
  domains?: QuizResultDomain[];
  /** Stable ids of questions answered incorrectly (feeds Practice-Incorrect, §3.2).
   * Additive/optional — older stored attempts won't have it. */
  incorrectQuestionIds?: number[];
  /** Set on Exam Simulation attempts (§3.5): the pass threshold this attempt was
   * graded against, so pass/fail can be shown in history. Additive/optional. */
  passThresholdPercent?: number;
}

/** Per-exam analytics stored in localStorage under 'quizAnalytics' */
export interface ExamAnalytics {
  [examId: string]: {
    results: QuizResult[];
    averageScore: number;
    bestScore: number;
    totalAttempts: number;
    averageTime: number;
  };
}

// ---------------------------------------------------------------------------
// Derived, ID-keyed local records (user study data; persisted via StorageService)
// ---------------------------------------------------------------------------

export interface Deck {
  id: string;         // UUID
  name: string;
  examIds: string[];  // associated exams (1 or more)
  createdAt: string;
}

export interface Flashcard {
  id: string;     // UUID
  deckId: string;
  front: string;
  back: string;
  /** Mastery level: 0 = new/still learning, 1+ = known (higher = more confident) */
  masteryLevel: number;
  /** Last time this card was reviewed */
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSession {
  id: string;               // UUID
  deckId: string;
  totalCards: number;
  knownCount: number;
  stillLearningCount: number;
  shuffled: boolean;
  completedAt: string;      // ISO 8601
}

/** Per-question study state — the single source of truth for known/unknown +
 * stars (SPEC §3.3, §3.4). Keyed by the pair (examId, questionId); "Known" /
 * "Still Learning" / "Starred" are filtered VIEWS over these records, not
 * separate copied card collections. */
export type StudyStatus = 'unrated' | 'still-learning' | 'known';

export interface QuestionStudyState {
  examId: string;
  questionId: number;
  status: StudyStatus;
  starred: boolean;
  /** Spaced-repetition mastery; increments on "known", resets to 0 on "still-learning". */
  masteryLevel: number;
  lastReviewedAt?: string;  // ISO 8601
  updatedAt: string;        // ISO 8601
}
