/**
 * Exam-switch and tab regression guards for SPEC §2 (2026-11 audit) B3-B6.
 *
 * B3: the exam picker is disabled while a Quiz or Exam Simulation is running.
 * B4: the Quiz tab stays mounted across tab switches, so a quiz in progress survives.
 * B5: switching exams clears the old bank and ignores a stale (late) fetch response.
 * B6: legacy auto-deck migration only runs against the matching bank, and only
 *     consumes cards it actually migrated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import App from '../App';
import { ToastProvider } from '../components/ui/toast';
import { FlashcardsTab } from '../components/flashcard/FlashcardsTab';
import { createLearner } from '../services/learner';
import { StorageService } from '../services/storage';
import { knownAutoDeckId, migrateAutoDecksForExam } from '../services/studyState';
import type { ExamIndex, Flashcard, LegacyQuestion } from '../types';

const bank = (n: number, prefix: string): LegacyQuestion[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    question: `${prefix}${i + 1} prompt`,
    options: ['right', 'wrong'],
    correctAnswers: [0],
    explanation: '',
  }));

const INDEX: ExamIndex[] = [
  { id: 'A', name: 'Alpha exam', path: '/exams/A.json' },
  { id: 'B', name: 'Bravo exam', path: '/exams/B.json' },
];

/** A fetch whose bank responses resolve only when the test says so. */
function deferredFetch() {
  const pending = new Map<string, Array<() => void>>();
  const fetchMock = vi.fn((url: string) => {
    if (url === '/exams/index.json') return Promise.resolve(new Response(JSON.stringify(INDEX)));
    const body = url.includes('A') ? bank(12, 'A') : bank(12, 'B');
    return new Promise<Response>(resolve => {
      const list = pending.get(url) ?? [];
      list.push(() => resolve(new Response(JSON.stringify(body))));
      pending.set(url, list);
    });
  });
  const release = async (url: string) => {
    const next = pending.get(url)?.shift();
    if (!next) throw new Error(`no pending fetch for ${url}`);
    await act(async () => { next(); });
  };
  return { fetchMock, release };
}

/** Immediately-resolving fetch for tests that don't care about timing. */
function instantFetch() {
  return vi.fn(async (url: string) => {
    if (url === '/exams/index.json') return new Response(JSON.stringify(INDEX));
    return new Response(JSON.stringify(url.includes('A') ? bank(12, 'A') : bank(12, 'B')));
  });
}

beforeEach(() => {
  localStorage.clear();
  createLearner('Ada');
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {},
  }));
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const renderApp = () => render(<ToastProvider><App /></ToastProvider>);

const examPicker = () => screen.getByRole('combobox');

async function pickExam(name: RegExp) {
  fireEvent.keyDown(examPicker(), { key: 'Enter' });
  const option = await screen.findByRole('option', { name });
  fireEvent.click(option);
}

/** Desktop tab trigger (mobile menu is separate). */
const tab = (name: string) => screen.getByRole('tab', { name });

function selectTab(name: string) {
  // Radix Tabs activates on mousedown.
  fireEvent.mouseDown(tab(name), { button: 0 });
}

async function startQuiz() {
  selectTab('Quiz');
  fireEvent.click(await screen.findByRole('button', { name: 'Start Quiz' }));
  return screen.findByText(/Question 1 of 10/);
}

describe('B3 — exam picker locked during a quiz', () => {
  it('disables the exam picker while a quiz is running and re-enables it after', async () => {
    StorageService.saveSelectedExam('A');
    vi.stubGlobal('fetch', instantFetch());
    renderApp();
    await screen.findByText('A1 prompt');
    expect(examPicker()).not.toBeDisabled();

    await startQuiz();
    expect(examPicker()).toBeDisabled();

    for (let i = 0; i < 9; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish Quiz' }));
    // unanswered questions open a confirm dialog
    // (Modal's backdrop is aria-hidden, so query hidden elements.)
    const dialog = await screen.findByRole('dialog', { hidden: true });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finish Quiz', hidden: true }));
    await screen.findByText('Quiz Results');
    expect(examPicker()).not.toBeDisabled();
  });
});

describe('B4 — quiz survives tab switches', () => {
  it('keeps the in-progress quiz (position and answers) after visiting another tab', async () => {
    StorageService.saveSelectedExam('A');
    vi.stubGlobal('fetch', instantFetch());
    renderApp();
    await screen.findByText('A1 prompt');

    await startQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/Question 2 of 10/);

    selectTab('Settings');
    selectTab('Quiz');

    expect(screen.getByText(/Question 2 of 10/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Quiz' })).toBeNull();
  });
});

describe('B5 — exam-switch race', () => {
  it('clears the old bank as soon as the exam changes', async () => {
    StorageService.saveSelectedExam('A');
    const { fetchMock, release } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderApp();
    await act(async () => {});
    await release('/exams/A.json');
    await screen.findByText('A1 prompt');

    await pickExam(/Bravo exam/);
    // B's bank hasn't arrived yet: nothing from A may be shown (or written to under B).
    expect(screen.queryByText('A1 prompt')).toBeNull();

    await release('/exams/B.json');
    await screen.findByText('B1 prompt');
  });

  it('ignores a response for the previous exam that arrives late', async () => {
    StorageService.saveSelectedExam('A');
    const { fetchMock, release } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderApp();
    await act(async () => {});
    await screen.findByRole('combobox');

    await pickExam(/Bravo exam/);
    await release('/exams/B.json');
    await screen.findByText('B1 prompt');

    await release('/exams/A.json'); // stale
    expect(screen.getByText('B1 prompt')).toBeInTheDocument();
    expect(screen.queryByText('A1 prompt')).toBeNull();
  });
});

describe('B6 — auto-deck migration', () => {
  const card = (front: string): Flashcard => ({
    id: `c-${front}`, deckId: knownAutoDeckId('B'), front, back: 'x',
    masteryLevel: 1, createdAt: '', updatedAt: '',
  });

  it('keeps cards whose prompt is not in the loaded bank (not consumed)', () => {
    const cards = [card('B1 prompt'), card('elsewhere')];
    const { consumedCardIds, migratedCount } = migrateAutoDecksForExam('B', bank(3, 'B'), cards, []);
    expect(migratedCount).toBe(1);
    expect(consumedCardIds).toEqual(['c-B1 prompt']);
  });

  it('does not migrate or drop cards while the bank for the exam is not loaded', () => {
    const cards = [card('B1 prompt'), card('B2 prompt')];
    StorageService.saveFlashcards(cards);
    render(
      <ToastProvider>
        <FlashcardsTab examId="B" legacyQuestions={[]} shuffleLegacy={() => {}} />
      </ToastProvider>,
    );
    expect(StorageService.getFlashcards().map(c => c.id)).toEqual(['c-B1 prompt', 'c-B2 prompt']);
    expect(StorageService.getStudyState()).toEqual([]);
  });
});
