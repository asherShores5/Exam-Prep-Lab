/**
 * Contract drift guard: the web client's Activity limits must match the API's
 * (infra/src/activity/validate.ts, infra/README.md "POST /activity").
 * Seams: the exported limit constants and validators on both sides.
 */
import { describe, it, expect } from 'vitest';
import { LIMITS, parseActivityBatch } from '../../../infra/src/activity/validate';
import {
  ACTIVITY_BATCH_SIZE,
  ACTIVITY_MAX_AGE_MS,
  ACTIVITY_MAX_QUESTIONS,
  ACTIVITY_MAX_TIME_SPENT_SEC,
  isValidActivity,
} from '../services/activity';
import { LEARNER_NAME_MAX, normalizeLearnerName } from '../services/learner';

const NOW = new Date('2026-11-02T18:00:00.000Z');
const ctx = { knownExamIds: new Set(['PSM-I']), now: NOW };
const LEARNER = '3b241101-e2bb-4255-8caf-4136c566a962';
const AT = '2026-11-02T17:00:00.000Z';
const result = (over: Record<string, unknown> = {}) => ({
  type: 'result', at: AT, examId: 'PSM-I', mode: 'sim', correct: 8, total: 10, percent: 80, passed: true, timeSpentSec: 90, ...over,
});
const serverAccepts = (activity: unknown, name = 'Pat') =>
  parseActivityBatch({ learnerId: LEARNER, name, activities: [activity] }, ctx).ok;

describe('Activity contract: client limits match the API', () => {
  it('uses the same name, batch, age, question-count and time limits', () => {
    expect(LEARNER_NAME_MAX).toBe(LIMITS.nameChars);
    expect(ACTIVITY_BATCH_SIZE).toBe(LIMITS.activitiesPerRequest);
    expect(ACTIVITY_MAX_AGE_MS).toBe(LIMITS.atPastMs);
    expect(ACTIVITY_MAX_QUESTIONS).toBe(LIMITS.maxQuestions);
    expect(ACTIVITY_MAX_TIME_SPENT_SEC).toBe(LIMITS.maxTimeSpentSec);
  });

  it.each([
    ['a Visit', { type: 'visit', at: AT }],
    ['an Exam Opened', { type: 'exam_opened', at: AT, examId: 'PSM-I' }],
    ['a sim Result', result()],
    ['a Result at the range edges', result({ correct: 0, total: 1000, percent: 0, timeSpentSec: 86_400, passed: false })],
    ['a Result with total 1', result({ correct: 1, total: 1, percent: 100, timeSpentSec: 0 })],
    ['a date-only at', { type: 'visit', at: '2026-11-02' }],
    ['an unknown field', { type: 'visit', at: AT, extra: 1 }],
    ['a total of 0', result({ total: 0, correct: 0, percent: 0 })],
    ['a total above the max', result({ total: 1001 })],
    ['a negative timeSpentSec', result({ timeSpentSec: -1 })],
    ['a timeSpentSec over a day', result({ timeSpentSec: 86_401 })],
    ['a percent off by more than 1', result({ percent: 82 })],
    ['an unknown mode', result({ mode: 'practice' })],
  ])('client and server agree on %s', (_label, activity) => {
    expect(isValidActivity(activity)).toBe(serverAccepts(activity));
  });

  it.each([
    ['tabs and newlines', 'Pat\n\tSmith'],
    ['NUL and C1 controls', 'A\u0000B\u0085C'],
    ['a line separator', 'Ada\u2028Lovelace'],
    ['the longest allowed name', 'a'.repeat(40)],
  ])('any name the client accepts, the server accepts (%s)', (_label, raw) => {
    const name = normalizeLearnerName(raw);
    expect(name).not.toBeNull();
    expect(serverAccepts({ type: 'visit', at: AT }, name!)).toBe(true);
  });
});
