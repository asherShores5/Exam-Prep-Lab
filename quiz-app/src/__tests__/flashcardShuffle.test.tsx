/**
 * B10: a local shuffle in FlashcardViewer must survive a parent re-render that
 * passes a fresh (but equal) questions array — FlashcardsTab rebuilds the
 * array on every render.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FlashcardViewer } from '../components/flashcard/FlashcardViewer';
import { ToastProvider } from '../components/ui/toast';
import type { LegacyQuestion } from '../types/index';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const bank = (): LegacyQuestion[] => ['Alpha?', 'Bravo?', 'Charlie?'].map((question, i) => ({
  id: i + 1, question, options: ['x', 'y'], correctAnswers: [0], explanation: '',
}));

function viewer(questions: LegacyQuestion[]) {
  return (
    <ToastProvider>
      <FlashcardViewer
        questions={questions}
        shuffleQuestions={() => {}}
        decks={[]}
        onSaveCardToDeck={() => true}
        onCreateDeck={() => ({ id: 'd', name: 'd', examIds: [], createdAt: '' })}
      />
    </ToastProvider>
  );
}

describe('B10: FlashcardViewer shuffle', () => {
  it('keeps the shuffled order when the parent re-renders with an equal array', () => {
    // Math.random() = 0 makes Fisher-Yates turn [A, B, C] into [B, C, A].
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { rerender } = render(viewer(bank()));
    expect(screen.getByText('Alpha?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /shuffle/i }));
    expect(screen.getByText('Bravo?')).toBeInTheDocument();

    rerender(viewer(bank()));
    expect(screen.getByText('Bravo?')).toBeInTheDocument();
    expect(screen.queryByText('Alpha?')).not.toBeInTheDocument();
  });

  it('picks up a genuinely different question set', () => {
    const { rerender } = render(viewer(bank()));
    rerender(viewer([{ id: 9, question: 'Zulu?', options: ['x'], correctAnswers: [0], explanation: '' }]));
    expect(screen.getByText('Zulu?')).toBeInTheDocument();
  });

  it('picks up another exam whose ids are the same (ids are only unique per bank)', () => {
    const { rerender } = render(viewer(bank()));
    rerender(viewer(bank().map(q => ({ ...q, question: q.question.replace('?', ' (exam B)?') }))));
    expect(screen.getByText('Alpha (exam B)?')).toBeInTheDocument();
  });
});
