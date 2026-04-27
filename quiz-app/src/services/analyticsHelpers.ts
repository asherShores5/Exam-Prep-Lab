import type { Flashcard } from '../types/index';

/**
 * Compute study streak: count of consecutive calendar days ending at today
 * with at least one activity (quiz or review session).
 */
export function computeStudyStreak(
  quizDates: string[],
  reviewDates: string[],
  today?: Date,
): number {
  const ref = today ?? new Date();
  const allDates = [...quizDates, ...reviewDates];
  if (allDates.length === 0) return 0;

  // Normalize to YYYY-MM-DD strings and deduplicate
  const daySet = new Set(
    allDates.map(d => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }),
  );

  let streak = 0;
  const cursor = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  while (true) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (!daySet.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/**
 * Identify the N lowest-scoring domains.
 */
export function findFocusAreas(
  domainScores: Array<{ domain: string; correct: number; total: number }>,
  count = 2,
): Array<{ domain: string; percentage: number }> {
  if (domainScores.length === 0) return [];
  const scored = domainScores
    .filter(d => d.total > 0)
    .map(d => ({ domain: d.domain, percentage: (d.correct / d.total) * 100 }))
    .sort((a, b) => a.percentage - b.percentage);
  return scored.slice(0, count);
}

/**
 * Compute overall mastery percentage across flashcards.
 * Mastery is capped at maxLevel per card.
 */
export function computeMasteryPercentage(
  flashcards: Flashcard[],
  maxLevel = 3,
): number {
  if (flashcards.length === 0) return 0;
  const sum = flashcards.reduce(
    (acc, c) => acc + Math.min(c.masteryLevel, maxLevel),
    0,
  );
  return (sum / (flashcards.length * maxLevel)) * 100;
}
