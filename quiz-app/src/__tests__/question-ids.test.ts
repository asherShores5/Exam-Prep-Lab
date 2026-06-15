/**
 * Stable question id guards (SPEC §5.1 / Appendix A.4).
 *
 * 1. Every shipped exam bank must have a unique integer `id` on every question
 *    (the pair (examId, id) is the app-wide question identity). This reads the
 *    REAL files in public/exams/ — a failure means scripts/assign-ids.mjs needs
 *    to run, or a bank was hand-edited badly.
 * 2. `findIdIssues` correctly flags missing/non-integer/duplicate ids.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { findIdIssues } from '../services/validateExam';
import type { LegacyQuestion } from '../types/index';

const EXAMS_DIR = path.resolve(__dirname, '../../public/exams');

function loadIndex(): Array<{ id: string; path: string }> {
  return JSON.parse(fs.readFileSync(path.join(EXAMS_DIR, 'index.json'), 'utf-8'));
}

function loadExam(relPath: string): LegacyQuestion[] {
  // index paths are web-absolute ("/exams/X.json"); map to the public dir.
  const file = path.join(EXAMS_DIR, path.basename(relPath));
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

describe('Stable question ids — shipped exam banks', () => {
  const index = loadIndex();

  it('index references at least one exam', () => {
    expect(index.length).toBeGreaterThan(0);
  });

  for (const entry of index) {
    it(`${entry.id}: every question has a unique integer id`, () => {
      const questions = loadExam(entry.path);
      expect(questions.length).toBeGreaterThan(0);

      const issues = findIdIssues(questions, entry.id);
      expect(issues).toEqual([]);

      // Sanity: ids form a unique set of integers.
      const ids = questions.map(q => q.id);
      expect(ids.every(id => typeof id === 'number' && Number.isInteger(id))).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
});

describe('findIdIssues', () => {
  const ok: LegacyQuestion[] = [
    { id: 1, question: 'a', options: ['x'], correctAnswers: [0], explanation: '' },
    { id: 2, question: 'b', options: ['y'], correctAnswers: [0], explanation: '' },
  ];

  it('returns no issues for unique integer ids', () => {
    expect(findIdIssues(ok, 'EXAM')).toEqual([]);
  });

  it('flags a missing id', () => {
    const bad = [{ question: 'a', options: ['x'], correctAnswers: [0], explanation: '' }] as LegacyQuestion[];
    const issues = findIdIssues(bad, 'EXAM');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('missing or non-integer id');
  });

  it('flags a non-integer id', () => {
    const bad = [{ id: 1.5, question: 'a', options: ['x'], correctAnswers: [0], explanation: '' }] as LegacyQuestion[];
    expect(findIdIssues(bad, 'EXAM')[0]).toContain('missing or non-integer id');
  });

  it('flags a duplicate id', () => {
    const bad: LegacyQuestion[] = [
      { id: 7, question: 'a', options: ['x'], correctAnswers: [0], explanation: '' },
      { id: 7, question: 'b', options: ['y'], correctAnswers: [0], explanation: '' },
    ];
    const issues = findIdIssues(bad, 'EXAM');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('duplicate id 7');
  });
});
