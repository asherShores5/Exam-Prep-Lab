// src/types/index.ts
// Shared TypeScript types for Exam Prep Lab

// ---------------------------------------------------------------------------
// Legacy types (used by the existing quiz app)
// ---------------------------------------------------------------------------

/** Question shape used by the existing static JSON exam files */
export interface LegacyQuestion {
  question: string;
  options: string[];
  correctAnswers: number[];
  explanation: string;
  domain?: string;
}

/** Entry in the exam index file (public/exams/index.json) */
export interface ExamIndex {
  id: string;
  name: string;
  path: string;
}

/** Result of a single completed quiz attempt */
export interface QuizResult {
  date: string;
  score: number;
  totalQuestions: number;
  timeSpent: number;
  percentage: number;
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
// New canonical types (spec-defined, used by upcoming features)
// ---------------------------------------------------------------------------

export type QuestionType = 'multiple-choice' | 'multi-select';

export interface Exam {
  id: string;       // UUID
  name: string;
  vendor: string;   // e.g. "AWS", "CompTIA"
  code?: string;    // e.g. "SAA-C03"
  domains: Domain[];
  createdAt: string; // ISO 8601
}

export interface Domain {
  id: string;   // UUID
  name: string;
}

export interface Question {
  id: string;           // UUID
  examId: string;
  domainId?: string;
  type: QuestionType;
  prompt: string;
  options: string[];          // at least 2 entries
  correctIndices: number[];   // exactly 1 for MC, 2+ for multi-select
  explanation?: string;
  createdAt: string;
  updatedAt: string;
}

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
  createdAt: string;
  updatedAt: string;
}

export interface QuizSession {
  id: string;               // UUID
  examIds: string[];
  domainFilter?: string[];  // domain IDs, undefined = all domains
  questions: QuizSessionQuestion[];
  score: number;            // count of correct answers
  totalQuestions: number;
  percentage: number;       // (score / totalQuestions) * 100
  domainBreakdown: DomainResult[];
  startedAt: string;        // ISO 8601
  completedAt: string;      // ISO 8601
}

export interface QuizSessionQuestion {
  questionId: string;
  selectedIndices: number[];
  correct: boolean;
}

export interface DomainResult {
  domainId: string;
  domainName: string;
  correct: number;
  total: number;
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

/** Full export/import envelope */
export interface AppDataExport {
  schemaVersion: string;
  exportedAt: string;
  exams: Exam[];
  questions: Question[];
  decks: Deck[];
  flashcards: Flashcard[];
  quizSessions: QuizSession[];
  reviewSessions: ReviewSession[];
}
