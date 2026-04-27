import type { Flashcard } from '../types/index';

const MS_PER_DAY = 86_400_000;

/**
 * Compute the next review date for a flashcard based on mastery level.
 * mastery 0 → +1 day, mastery 1 → +3 days, mastery ≥2 → +(3 × mastery) days
 */
export function computeNextReview(masteryLevel: number, lastReviewedAt: Date): Date {
  let days: number;
  if (masteryLevel <= 0) days = 1;
  else if (masteryLevel === 1) days = 3;
  else days = 3 * masteryLevel;
  return new Date(lastReviewedAt.getTime() + days * MS_PER_DAY);
}

/** Determine if a flashcard is due for review. */
export function isDue(card: Flashcard, now?: Date): boolean {
  if (!card.lastReviewedAt) return true; // never reviewed = due
  const ref = now ?? new Date();
  const next = computeNextReview(card.masteryLevel, new Date(card.lastReviewedAt));
  return next.getTime() <= ref.getTime();
}

/** Sort cards so due cards come first, then by next-review date ascending. */
export function sortByDueFirst(cards: Flashcard[], now?: Date): Flashcard[] {
  const ref = now ?? new Date();
  return [...cards].sort((a, b) => {
    const aDue = isDue(a, ref);
    const bDue = isDue(b, ref);
    if (aDue !== bDue) return aDue ? -1 : 1;
    // Within same group, sort by next review date ascending
    const aNext = a.lastReviewedAt
      ? computeNextReview(a.masteryLevel, new Date(a.lastReviewedAt)).getTime()
      : 0;
    const bNext = b.lastReviewedAt
      ? computeNextReview(b.masteryLevel, new Date(b.lastReviewedAt)).getTime()
      : 0;
    return aNext - bNext;
  });
}

/** Update mastery after a card rating. */
export function updateMastery(
  card: Flashcard,
  known: boolean,
): Pick<Flashcard, 'masteryLevel' | 'lastReviewedAt' | 'updatedAt'> {
  return {
    masteryLevel: known ? card.masteryLevel + 1 : 0,
    lastReviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
