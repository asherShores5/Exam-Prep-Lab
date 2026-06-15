/**
 * examSim.ts — Exam Simulation preset resolution (SPEC §3.5, Appendix A.5).
 *
 * A sim preset configures a realistic exam attempt: full-length question count,
 * a real time limit, and a pass/fail threshold. Per-exam presets live in
 * `public/exams/index.json` (`ExamIndex.sim`); when absent, sensible defaults
 * are derived from the bank size.
 */

import type { ExamSimPreset } from '../types/index';

/** A.5 fallback defaults when an exam has no `sim` preset in index.json. */
export function defaultSimPreset(totalQuestions: number): ExamSimPreset {
  return {
    questionCount: Math.min(60, totalQuestions),
    timeLimitMinutes: 90,
    passThresholdPercent: 70,
  };
}

/**
 * Resolve the sim preset for an exam: use the index.json preset when present,
 * else the A.5 defaults. The resolved `questionCount` is always capped at the
 * number of questions actually available in the bank (you can't simulate more
 * questions than exist).
 */
export function resolveSimPreset(
  preset: ExamSimPreset | undefined,
  totalQuestions: number,
): ExamSimPreset {
  const base = preset ?? defaultSimPreset(totalQuestions);
  return {
    ...base,
    questionCount: Math.min(base.questionCount, totalQuestions),
  };
}

/** Whether a percentage meets/exceeds the pass threshold. */
export function isPass(percentage: number, passThresholdPercent: number): boolean {
  return percentage >= passThresholdPercent;
}
