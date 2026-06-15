/**
 * Answer comparison + single/multi-select helpers.
 *
 * Centralises the "did the user pick exactly the correct set of options" logic
 * that was duplicated (and previously mutated its inputs via `.sort()`) across
 * QuizMode's scoring, domain breakdown, and post-quiz review.
 */

/**
 * True when `selected` contains exactly the same option indices as `correct`,
 * regardless of order. Does NOT mutate either input.
 */
export function isAnswerCorrect(
  selected: readonly number[],
  correct: readonly number[],
): boolean {
  if (selected.length !== correct.length) return false;
  const a = [...selected].sort((x, y) => x - y);
  const b = [...correct].sort((x, y) => x - y);
  return a.every((v, i) => v === b[i]);
}

/**
 * A question is single-select when it has exactly one correct answer, and
 * multi-select when it has two or more. Drives the radio-vs-checkbox UI.
 */
export function isSingleSelect(correctAnswers: readonly number[]): boolean {
  return correctAnswers.length <= 1;
}
