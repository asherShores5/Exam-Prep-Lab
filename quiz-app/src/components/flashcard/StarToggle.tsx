/**
 * StarToggle — a self-contained star/bookmark button backed by per-question
 * study state (SPEC §3.4). Reads and writes `(examId, questionId)` through
 * `studyState.ts`, so it can be dropped into Review, Quiz review, and Flashcards
 * without the parent managing star state.
 *
 * No-ops (renders nothing) when the question has no stable id.
 */

import { useState } from 'react';
import { Star } from 'lucide-react';
import { getStudyState, toggleStar } from '../../services/studyState';

export interface StarToggleProps {
  examId: string;
  questionId: number | undefined;
  /** Visual size: "sm" for inline lists, "md" for toolbars. */
  size?: 'sm' | 'md';
  className?: string;
}

export function StarToggle({ examId, questionId, size = 'sm', className = '' }: StarToggleProps) {
  const hasId = typeof questionId === 'number';
  const [starred, setStarred] = useState<boolean>(
    hasId ? (getStudyState(examId, questionId)?.starred ?? false) : false,
  );

  if (!hasId) return null;

  const dim = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';

  function handleClick() {
    const next = toggleStar(examId, questionId as number);
    setStarred(next.starred);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={starred ? 'Unstar this question' : 'Star this question'}
      aria-pressed={starred}
      title={starred ? 'Starred' : 'Star this question'}
      className={`inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-gray-800 ${className}`}
    >
      <Star className={`${dim} ${starred ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} aria-hidden="true" />
    </button>
  );
}
