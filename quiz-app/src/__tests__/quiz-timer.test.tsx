/**
 * Quiz timer regression guards for SPEC §2 (2026-11 audit) B7, B8.
 *
 * B7: timeSpent uses the running attempt's own limit (sim minutes for sims).
 * B8: remaining time comes from a deadline timestamp, so throttled or skipped
 *     interval ticks (background tabs) don't slow the clock.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { QuizMode } from '../components/quiz/QuizMode';
import { ToastProvider } from '../components/ui/toast';
import { StorageService } from '../services/storage';
import type { LegacyQuestion } from '../types';

// 12 questions: enough for the default 10-question Quiz (Start is disabled otherwise).
const bank: LegacyQuestion[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  question: `Q${i + 1} prompt`,
  options: ['right', 'wrong'],
  correctAnswers: [0],
  explanation: '',
}));

const renderQuiz = () =>
  render(
    <ToastProvider>
      <QuizMode
        questions={bank}
        selectedExam="A"
        simPreset={{ questionCount: 3, timeLimitMinutes: 10, passThresholdPercent: 70 }}
      />
    </ToastProvider>,
  );

/** Finish the attempt, confirming past the "unanswered" dialog. */
const finish = () => {
  const grid = screen.getAllByRole('listitem', { name: /^Question \d+/ });
  fireEvent.click(grid[grid.length - 1]);
  fireEvent.click(screen.getByRole('button', { name: 'Finish Quiz' }));
  // The confirm Modal sits under an aria-hidden backdrop, so include hidden nodes.
  const buttons = screen.getAllByRole('button', { name: 'Finish Quiz', hidden: true });
  fireEvent.click(buttons[buttons.length - 1]);
};

const savedTimeSpent = () => StorageService.getExamAnalytics().A.results.map(r => r.timeSpent);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe('B7: timeSpent uses the running attempt limit', () => {
  it('records 2 minutes for an Exam Simulation finished 2 minutes in', () => {
    renderQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Start Exam Simulation' }));
    act(() => { vi.advanceTimersByTime(120_000); });
    finish();
    expect(savedTimeSpent()).toEqual([120]);
  });
});

/** Move the wall clock without firing any interval ticks (a throttled background tab). */
const sleepInBackground = (ms: number) => {
  vi.setSystemTime(Date.now() + ms);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
};

describe('B8: remaining time is computed from a deadline', () => {
  it('catches up on return to the tab after 5 minutes with no ticks', () => {
    renderQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));
    expect(screen.getByText('Time Remaining: 30:00')).toBeInTheDocument();
    sleepInBackground(5 * 60_000);
    expect(screen.getByText('Time Remaining: 25:00')).toBeInTheDocument();
  });

  it('ends a sim whose deadline passed while the tab was hidden, recording the full limit', () => {
    renderQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Start Exam Simulation' }));
    sleepInBackground(11 * 60_000);
    expect(screen.queryByText(/Time Remaining/)).not.toBeInTheDocument();
    expect(savedTimeSpent()).toEqual([600]);
  });
});
