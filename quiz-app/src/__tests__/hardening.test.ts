/**
 * B9-B11 hardening (SPEC §2 "2026-11 audit", §9.4).
 * Seams: StorageService getters/savers, tagService public API,
 * validateExamQuestions, and the exam-bank runtime-caching entry.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageService, STORAGE_KEYS, QUOTA_EXCEEDED_EVENT } from '../services/storage';
import { addTag, getTags, getAllTagsForExam } from '../services/tagService';
import { validateExamQuestions } from '../services/validateExam';
import { examBankRuntimeCaching } from '../lib/examBankCaching';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('B9: StorageService shape-checks stored JSON', () => {
  it('array readers fall back to [] when the stored JSON is an object', () => {
    for (const key of [STORAGE_KEYS.DECKS, STORAGE_KEYS.FLASHCARDS, STORAGE_KEYS.REVIEW_SESSIONS, STORAGE_KEYS.STUDY_STATE]) {
      localStorage.setItem(key, '{"not":"an array"}');
    }
    expect(StorageService.getDecks()).toEqual([]);
    expect(StorageService.getFlashcards()).toEqual([]);
    expect(StorageService.getReviewSessions()).toEqual([]);
    expect(StorageService.getStudyState()).toEqual([]);
  });
});

describe('B9: tagService tolerates a wrong-shaped store', () => {
  it('treats a non-array store as empty and can still add tags', () => {
    localStorage.setItem(STORAGE_KEYS.QUESTION_TAGS, '{"oops":true}');
    expect(getTags('EX', 'Q1')).toEqual([]);
    expect(getAllTagsForExam('EX')).toEqual([]);
    addTag('EX', 'Q1', 'network');
    expect(getTags('EX', 'Q1')).toEqual(['network']);
  });

  it('skips malformed entries inside the array', () => {
    localStorage.setItem(
      STORAGE_KEYS.QUESTION_TAGS,
      JSON.stringify([null, 'x', { examId: 'EX', questionKey: 'Q2' }, { examId: 'EX', questionKey: 'Q1', tags: ['iam'] }]),
    );
    expect(getAllTagsForExam('EX')).toEqual(['iam']);
    expect(getTags('EX', 'Q2')).toEqual([]);
  });
});

describe('B9: object readers', () => {
  it('getExamAnalytics falls back to {} for an array, null, or a number', () => {
    for (const bad of ['[1,2]', 'null', '42']) {
      localStorage.setItem(STORAGE_KEYS.QUIZ_ANALYTICS, bad);
      expect(StorageService.getExamAnalytics()).toEqual({});
    }
  });
});

describe('B10: validateExamQuestions checks answers and options', () => {
  const good = { id: 1, question: 'Q?', options: ['a', 'b', 'c'], correctAnswers: [2], explanation: '' };

  it('keeps a well-formed question (including multi-select)', () => {
    const r = validateExamQuestions([good, { ...good, id: 2, correctAnswers: [0, 1] }], 'EX');
    expect(r.valid).toHaveLength(2);
    expect(r.skipped).toBe(0);
  });

  it.each([
    ['empty correctAnswers', { correctAnswers: [] }],
    ['index past the end', { correctAnswers: [3] }],
    ['negative index', { correctAnswers: [-1] }],
    ['non-integer index', { correctAnswers: [0.5] }],
    ['string index', { correctAnswers: ['0'] }],
    ['non-string option', { options: ['a', 2, 'c'] }],
    ['no options', { options: [], correctAnswers: [0] }],
  ])('drops a question with %s', (_label, patch) => {
    const r = validateExamQuestions([good, { ...good, id: 2, ...patch }], 'EX');
    expect(r.valid.map(q => q.id)).toEqual([1]);
    expect(r.skipped).toBe(1);
    expect(r.warnings.some(w => w.includes('EX[1]'))).toBe(true);
  });
});

describe('B11: exam-bank runtime caching', () => {
  const plugin = examBankRuntimeCaching.options.plugins[0];
  const respond = (contentType: string | null) =>
    new Response('{}', { status: 200, headers: contentType ? { 'content-type': contentType } : {} });
  const willCache = (res: Response) =>
    plugin.cacheWillUpdate!({ response: res, request: new Request('https://x/exams/a.json'), event: undefined as never, state: undefined });

  it('is NetworkFirst for /exams/*.json only', () => {
    expect(examBankRuntimeCaching.handler).toBe('NetworkFirst');
    const match = (p: string) =>
      examBankRuntimeCaching.urlPattern({ url: new URL(`https://x${p}`) } as never);
    expect(match('/exams/index.json')).toBe(true);
    expect(match('/exams/AWS-SAA-C03.json')).toBe(true);
    expect(match('/index.html')).toBe(false);
  });

  it('only caches 200 responses', () => {
    expect(examBankRuntimeCaching.options.cacheableResponse.statuses).toEqual([200]);
  });

  it('caches JSON responses (with or without charset)', async () => {
    const a = respond('application/json');
    const b = respond('application/json; charset=utf-8');
    expect(await willCache(a)).toBe(a);
    expect(await willCache(b)).toBe(b);
  });

  it('refuses an index.html SPA fallback or a missing content-type', async () => {
    expect(await willCache(respond('text/html'))).toBeNull();
    expect(await willCache(respond(null))).toBeNull();
  });
});

function quotaError(): DOMException {
  return new DOMException('full', 'QuotaExceededError');
}

describe('B9: saveSelectedExam is quota-safe', () => {
  it('dispatches the quota event instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quotaError(); });
    const onQuota = vi.fn();
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
    expect(() => StorageService.saveSelectedExam('AWS-SAA-C03')).not.toThrow();
    window.removeEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
    expect(onQuota).toHaveBeenCalledTimes(1);
  });

  it('tagService writes dispatch the quota event instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quotaError(); });
    const onQuota = vi.fn();
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
    expect(() => addTag('EX', 'Q1', 'network')).not.toThrow();
    window.removeEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
    expect(onQuota).toHaveBeenCalledTimes(1);
  });

  it('still round-trips as a plain string', () => {
    StorageService.saveSelectedExam('AWS-SAA-C03');
    expect(localStorage.getItem(STORAGE_KEYS.SELECTED_EXAM)).toBe('AWS-SAA-C03');
    expect(StorageService.getSelectedExam()).toBe('AWS-SAA-C03');
  });
});
