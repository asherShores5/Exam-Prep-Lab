/**
 * Exam Simulation tests (SPEC §3.5 / Appendix A.2, A.5).
 *
 * Covers preset resolution (defaults + cap-to-bank), pass/fail, and a guard
 * that the real index.json presets are well-formed and feasible against the
 * shipped banks.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveSimPreset, defaultSimPreset, isPass } from '../lib/examSim';
import type { ExamSimPreset } from '../types/index';

describe('examSim — defaultSimPreset (A.5)', () => {
  it('caps questionCount at 60 for large banks', () => {
    expect(defaultSimPreset(500)).toEqual({ questionCount: 60, timeLimitMinutes: 90, passThresholdPercent: 70 });
  });
  it('uses the bank size when smaller than 60', () => {
    expect(defaultSimPreset(40).questionCount).toBe(40);
  });
});

describe('examSim — resolveSimPreset', () => {
  const preset: ExamSimPreset = { questionCount: 65, timeLimitMinutes: 130, passThresholdPercent: 72 };

  it('uses the provided preset when present', () => {
    expect(resolveSimPreset(preset, 1000)).toEqual(preset);
  });
  it('falls back to defaults when absent', () => {
    expect(resolveSimPreset(undefined, 1000)).toEqual({ questionCount: 60, timeLimitMinutes: 90, passThresholdPercent: 70 });
  });
  it('caps questionCount at the bank size (can\'t simulate more than exist)', () => {
    expect(resolveSimPreset(preset, 50).questionCount).toBe(50);
    // other fields preserved
    expect(resolveSimPreset(preset, 50).timeLimitMinutes).toBe(130);
  });
});

describe('examSim — isPass', () => {
  it('passes at or above threshold, fails below', () => {
    expect(isPass(72, 72)).toBe(true);
    expect(isPass(80, 72)).toBe(true);
    expect(isPass(71.9, 72)).toBe(false);
    expect(isPass(0, 70)).toBe(false);
  });
});

describe('examSim — index.json presets are valid', () => {
  const EXAMS_DIR = path.resolve(__dirname, '../../public/exams');
  const index: Array<{ id: string; path: string; sim?: ExamSimPreset }> = JSON.parse(
    fs.readFileSync(path.join(EXAMS_DIR, 'index.json'), 'utf-8'),
  );

  for (const entry of index) {
    if (!entry.sim) continue; // sim is optional (default fallback covers it)
    it(`${entry.id}: sim preset is well-formed and feasible`, () => {
      const { questionCount, timeLimitMinutes, passThresholdPercent } = entry.sim!;
      expect(Number.isInteger(questionCount)).toBe(true);
      expect(questionCount).toBeGreaterThan(0);
      expect(timeLimitMinutes).toBeGreaterThan(0);
      expect(passThresholdPercent).toBeGreaterThan(0);
      expect(passThresholdPercent).toBeLessThanOrEqual(100);

      // The preset must not ask for more questions than the bank has.
      const bank = JSON.parse(fs.readFileSync(path.join(EXAMS_DIR, path.basename(entry.path)), 'utf-8'));
      expect(questionCount).toBeLessThanOrEqual(bank.length);
    });
  }
});
