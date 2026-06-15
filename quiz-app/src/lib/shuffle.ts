/**
 * Shared array utilities.
 *
 * `shuffle` is the single source of truth for randomising order. It replaces the
 * biased `sort(() => Math.random() - 0.5)` pattern that previously lived in
 * App.tsx, QuizMode, and a private copy in FlashcardViewer.
 */

/**
 * Return a new array with the elements of `arr` in random order.
 *
 * Uses the Fisher-Yates (Durstenfeld) algorithm, which produces a uniformly
 * random permutation. Does NOT mutate the input.
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
