/**
 * quizTimer.ts — countdown for a Quiz or Exam Simulation attempt (SPEC §2 B7, B8).
 *
 * Remaining time is computed from a deadline timestamp, not by counting
 * interval ticks: browsers throttle timers in background tabs, so ticks are
 * only a prompt to re-read the clock. The clock is also re-read on
 * `visibilitychange`, so returning to the tab shows the true time at once.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Whole seconds left before `deadlineMs` at `nowMs` (rounded up, never negative). */
export function remainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export interface QuizTimer {
  /** Seconds left in the current attempt. */
  remaining: number;
  /** Seconds used so far, measured against this attempt's own limit (B7). */
  timeSpent: number;
  /** Start a new attempt with a limit of `minutes`. */
  start: (minutes: number) => void;
}

/**
 * Countdown that runs while `running` is true and calls `onExpire` once when
 * the deadline passes.
 */
export function useQuizTimer(running: boolean, onExpire: () => void): QuizTimer {
  const [limitSeconds, setLimitSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  // Bumped on every start so the effect re-arms even if `running` stays true.
  const [attempt, setAttempt] = useState(0);
  const deadline = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const start = useCallback((minutes: number) => {
    const seconds = minutes * 60;
    deadline.current = Date.now() + seconds * 1000;
    setLimitSeconds(seconds);
    setRemaining(seconds);
    setAttempt(a => a + 1);
  }, []);

  useEffect(() => {
    if (!running || deadline.current === null) return;
    const sync = () => {
      if (deadline.current === null) return;
      const left = remainingSeconds(deadline.current, Date.now());
      setRemaining(left);
      if (left === 0) {
        deadline.current = null;
        onExpireRef.current();
      }
    };
    const id = setInterval(sync, 1000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [running, attempt]);

  const timeSpent = Math.min(limitSeconds, Math.max(0, limitSeconds - remaining));
  return { remaining, timeSpent, start };
}
