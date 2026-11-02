/**
 * Crash regression guards for SPEC §2 (2026-11 audit) B1 and B2.
 *
 * B1: in a filtered Flashcards view (Still Learning, Starred, Practice Incorrect)
 *     the rated / un-starred card drops out of the list. The viewer must keep
 *     pointing at the next remaining card, clamp, and never throw.
 * B2: ReviewMode must reset / clamp its index when the question list changes
 *     (e.g. switching to a smaller exam bank).
 */
import { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FlashcardViewer } from '../components/flashcard/FlashcardViewer';
import { ReviewMode } from '../components/review/ReviewMode';
import { ToastProvider } from '../components/ui/toast';
import type { LegacyQuestion } from '../types';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const bank = (n: number, prefix = 'Q'): LegacyQuestion[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    question: `${prefix}${i + 1} prompt`,
    options: ['right', 'wrong'],
    correctAnswers: [0],
    explanation: '',
  }));

/**
 * Behaves like FlashcardsTab's filtered views: the parent rebuilds the list on
 * every change, and a card leaves the list once it is rated (`dropOn: 'rate'`)
 * or un-starred (`dropOn: 'star'`).
 */
function FilteredView({ initial, dropOn, dropWhen = () => true }: {
  initial: LegacyQuestion[];
  dropOn: 'rate' | 'star';
  dropWhen?: (known: boolean) => boolean;
}) {
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const drop = (q: LegacyQuestion) => setRemoved(prev => new Set(prev).add(q.id as number));
  const questions = initial.filter(q => !removed.has(q.id as number));
  if (!questions.length) return <div>empty view</div>;
  return (
    <FlashcardViewer
      questions={questions}
      shuffleQuestions={() => {}}
      decks={[]}
      onSaveCardToDeck={() => true}
      onCreateDeck={name => ({ id: 'd', name, examIds: [], createdAt: '' })}
      deckId="legacy"
      onCardRated={(q, known) => { if (dropOn === 'rate' && dropWhen(known)) drop(q); }}
      onToggleStar={q => { if (dropOn === 'star') drop(q); }}
      starredIds={new Set(questions.map(q => q.id as number))}
    />
  );
}

const renderView = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

function rate(known: boolean) {
  fireEvent.click(screen.getByText('Reveal Answer'));
  fireEvent.click(screen.getByLabelText(known ? 'Mark card as known' : 'Mark card as still learning'));
}

describe('B1: FlashcardViewer in a filtered view', () => {
  it('rating Known in Still Learning shows every remaining card in order', () => {
    renderView(<FilteredView initial={bank(4)} dropOn="rate" dropWhen={known => known} />);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(screen.getByText(/Q\d prompt/).textContent!);
      rate(true);
    }
    expect(seen).toEqual(['Q1 prompt', 'Q2 prompt', 'Q3 prompt', 'Q4 prompt']);
  });

  it('rating in Practice Incorrect never reads past the end of the list', () => {
    renderView(<FilteredView initial={bank(3)} dropOn="rate" />);
    rate(false);
    expect(screen.getByText('Q2 prompt')).toBeInTheDocument();
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    rate(true);
    expect(screen.getByText('Q3 prompt')).toBeInTheDocument();
    expect(() => rate(true)).not.toThrow();
  });

  it('un-starring in Starred keeps the index on the next card and clamps at the end', () => {
    renderView(<FilteredView initial={bank(3)} dropOn="star" />);
    // Move to the last card, then un-star it: the view must clamp, not throw.
    fireEvent.click(screen.getByText('Reveal Answer'));
    fireEvent.click(screen.getByLabelText('Mark card as still learning'));
    fireEvent.click(screen.getByText('Reveal Answer'));
    fireEvent.click(screen.getByLabelText('Mark card as still learning'));
    expect(screen.getByText('Q3 prompt')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Unstar this question'));
    expect(screen.getByText('Q2 prompt')).toBeInTheDocument();
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
    // Un-star in the middle: next remaining card takes its place.
    fireEvent.click(screen.getByLabelText('Unstar this question'));
    expect(screen.getByText('Q1 prompt')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Unstar this question'));
    expect(screen.getByText('empty view')).toBeInTheDocument();
  });

  it('un-starring the first card shows the next card, not the one after it', () => {
    renderView(<FilteredView initial={bank(3)} dropOn="star" />);
    fireEvent.click(screen.getByLabelText('Unstar this question'));
    expect(screen.getByText('Q2 prompt')).toBeInTheDocument();
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
  });

  it('a parent re-render with an equal new array keeps the current card', () => {
    const qs = bank(3);
    const props = {
      shuffleQuestions: () => {},
      decks: [],
      onSaveCardToDeck: () => true,
      onCreateDeck: (name: string) => ({ id: 'd', name, examIds: [], createdAt: '' }),
    };
    const { rerender } = renderView(<FlashcardViewer questions={qs} {...props} />);
    rate(false);
    expect(screen.getByText('Q2 prompt')).toBeInTheDocument();
    rerender(<ToastProvider><FlashcardViewer questions={[...qs]} {...props} /></ToastProvider>);
    expect(screen.getByText('Q2 prompt')).toBeInTheDocument();
  });
});

describe('B2: ReviewMode when the question list changes', () => {
  it('switching to a smaller exam does not crash and starts at question 1', () => {
    const { rerender } = render(<ReviewMode questions={bank(5, 'A')} shuffleQuestions={() => {}} examId="exam-a" />);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Question 5 of 5')).toBeInTheDocument();
    rerender(<ReviewMode questions={bank(2, 'B')} shuffleQuestions={() => {}} examId="exam-b" />);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('B1 prompt')).toBeInTheDocument();
  });

  it('a smaller list for the same exam clamps instead of crashing', () => {
    const { rerender } = render(<ReviewMode questions={bank(5)} shuffleQuestions={() => {}} examId="x" />);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'));
    expect(() =>
      rerender(<ReviewMode questions={bank(3)} shuffleQuestions={() => {}} examId="x" />),
    ).not.toThrow();
    expect(screen.getByText(/Question \d of 3/)).toBeInTheDocument();
  });
});

describe('FlashcardViewer shuffle with a parent-owned order', () => {
  it('a parent reshuffle restarts the session at card 1', () => {
    function ParentShuffles() {
      const [qs, setQs] = useState(bank(5));
      return (
        <FlashcardViewer
          questions={qs}
          shuffleQuestions={() => setQs(prev => [...prev].reverse())}
          decks={[]}
          onSaveCardToDeck={() => true}
          onCreateDeck={name => ({ id: 'd', name, examIds: [], createdAt: '' })}
        />
      );
    }
    renderView(<ParentShuffles />);
    rate(false);
    rate(false);
    fireEvent.click(screen.getByLabelText('Shuffle cards and restart session'));
    expect(screen.getByText('Card 1 of 5')).toBeInTheDocument();
    expect(screen.getByText('Q5 prompt')).toBeInTheDocument();
  });

  it('after a local shuffle, rating in a filtered view moves on to a remaining card', () => {
    renderView(<FilteredView initial={bank(3)} dropOn="rate" />);
    fireEvent.click(screen.getByLabelText('Shuffle cards and restart session'));
    const first = screen.getByText(/Q\d prompt/).textContent;
    rate(true);
    // Order after the rebuild is B10's concern (local shuffle vs parent order);
    // here the shuffle flag must not linger and the rated card must be gone.
    expect(screen.getByText(/Card \d of 2/)).toBeInTheDocument();
    expect(screen.getByText(/Q\d prompt/).textContent).not.toBe(first);
  });
});
