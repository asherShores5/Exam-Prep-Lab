/**
 * transformLegacy.ts — Transforms between the legacy static-JSON question
 * shape and the unified canonical Question type.
 *
 * Used at the data-loading boundary so the rest of the app only deals with
 * the canonical Question interface.
 */

import type { LegacyQuestion, Question, QuestionType } from '../types/index';

// ---------------------------------------------------------------------------
// Simple deterministic hash
// ---------------------------------------------------------------------------

/**
 * Produces a deterministic hex string from the input.
 * Uses a simple numeric hash (similar to Java's String.hashCode) converted
 * to an unsigned 32-bit hex representation.
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0; // force 32-bit integer
  }
  // Convert to unsigned 32-bit then to hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Fixed epoch for deterministic timestamps
// ---------------------------------------------------------------------------

const FIXED_EPOCH = '1970-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Forward transform: LegacyQuestion → Question
// ---------------------------------------------------------------------------

/**
 * Converts a legacy static-JSON question into the unified Question type.
 *
 * @param legacy    - The legacy question record from a static exam JSON file.
 * @param examId    - The exam identifier this question belongs to.
 * @param domainMap - A map from domain display name to domain ID.
 * @returns A canonical Question record with a deterministic ID.
 */
export function transformLegacyQuestion(
  legacy: LegacyQuestion,
  examId: string,
  domainMap: Map<string, string>,
): Question {
  const id = simpleHash(examId + legacy.question);

  const type: QuestionType =
    legacy.correctAnswers.length > 1 ? 'multi-select' : 'multiple-choice';

  const domainId =
    legacy.domain !== undefined ? domainMap.get(legacy.domain) : undefined;

  return {
    id,
    examId,
    domainId,
    type,
    prompt: legacy.question,
    options: legacy.options,
    correctIndices: legacy.correctAnswers,
    explanation: legacy.explanation,
    createdAt: FIXED_EPOCH,
    updatedAt: FIXED_EPOCH,
  };
}

// ---------------------------------------------------------------------------
// Reverse transform: Question → LegacyQuestion
// ---------------------------------------------------------------------------

/**
 * Converts a canonical Question back to the legacy LegacyQuestion shape.
 *
 * Note: The `domain` field is NOT included because the canonical Question
 * only stores a `domainId`, and the human-readable domain name is not
 * available without an external lookup.
 *
 * @param question - The canonical Question record.
 * @returns A LegacyQuestion-shaped object (without domain).
 */
export function toLegacyShape(question: Question): LegacyQuestion {
  return {
    question: question.prompt,
    options: question.options,
    correctAnswers: question.correctIndices,
    explanation: question.explanation ?? '',
  };
}
