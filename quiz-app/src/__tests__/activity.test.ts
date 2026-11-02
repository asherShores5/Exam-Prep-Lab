/**
 * Activity client tests (SPEC §9.2, infra/README.md "POST /activity").
 * Seam: createActivityClient's public methods, with a fake fetch and fake clock;
 * the outbox is observed through StorageService.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createActivityClient, type ActivityDeps } from '../services/activity';
import { StorageService } from '../services/storage';

const API = 'https://api.example.test';
const LEARNER = { learnerId: '3b241101-e2bb-4255-8caf-4136c566a962', name: 'Pat' };

function fakeFetch(...statuses: (number | 'network')[]) {
  const queue = [...statuses];
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    const s = queue.length > 1 ? queue.shift()! : queue[0] ?? 200;
    if (s === 'network') throw new TypeError('Failed to fetch');
    return new Response('{}', { status: s });
  });
}

function setup(overrides: Partial<ActivityDeps> = {}) {
  let now = new Date('2026-11-02T17:00:00.000Z');
  const fetch = overrides.fetch ?? fakeFetch(200);
  const client = createActivityClient({
    apiUrl: API,
    fetch,
    now: () => now,
    getLearner: () => LEARNER,
    ...overrides,
  });
  return {
    client,
    fetch: fetch as ReturnType<typeof fakeFetch>,
    setNow: (iso: string) => { now = new Date(iso); },
  };
}

function bodies(fetch: ReturnType<typeof fakeFetch>) {
  return fetch.mock.calls.map(([, init]) => JSON.parse(String(init!.body)));
}

beforeEach(() => {
  localStorage.clear();
});

describe('Activity client', () => {
  it('records nothing when no API URL is configured', async () => {
    const { client, fetch } = setup({ apiUrl: undefined });
    await client.recordExamOpened('AWS-SAA-C03');
    await client.recordVisit();
    expect(fetch).not.toHaveBeenCalled();
    expect(StorageService.getActivityOutbox()).toEqual([]);
  });

  it('POSTs an Exam Opened to /activity with learner, name and timestamp', async () => {
    const { client, fetch } = setup();
    await client.recordExamOpened('AWS-SAA-C03');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.example.test/activity');
    expect(init!.method).toBe('POST');
    expect(init!.keepalive).toBe(true);
    expect(new Headers(init!.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init!.body))).toEqual({
      learnerId: LEARNER.learnerId,
      name: 'Pat',
      activities: [{ type: 'exam_opened', at: '2026-11-02T17:00:00.000Z', examId: 'AWS-SAA-C03' }],
    });
    expect(StorageService.getActivityOutbox()).toEqual([]);
  });

  it.each([429, 500, 503, 'network' as const])('keeps the batch in the outbox on %s and never throws', async (status) => {
    const { client } = setup({ fetch: fakeFetch(status) });
    await expect(client.recordExamOpened('AWS-SAA-C03')).resolves.toBeUndefined();
    expect(StorageService.getActivityOutbox()).toEqual([
      { type: 'exam_opened', at: '2026-11-02T17:00:00.000Z', examId: 'AWS-SAA-C03' },
    ]);
  });

  it('drops the batch on 400 (the server will never accept it)', async () => {
    const { client } = setup({ fetch: fakeFetch(400) });
    await client.recordExamOpened('NOT-AN-EXAM');
    expect(StorageService.getActivityOutbox()).toEqual([]);
  });

  it('sends queued Activity together with the next one once the API is back', async () => {
    const fetch = fakeFetch(503, 200);
    const { client, setNow } = setup({ fetch });
    await client.recordExamOpened('AWS-SAA-C03');
    setNow('2026-11-02T17:05:00.000Z');
    await client.recordExamOpened('AWS-DVA-C02');
    expect(bodies(fetch)[1].activities).toEqual([
      { type: 'exam_opened', at: '2026-11-02T17:00:00.000Z', examId: 'AWS-SAA-C03' },
      { type: 'exam_opened', at: '2026-11-02T17:05:00.000Z', examId: 'AWS-DVA-C02' },
    ]);
    expect(StorageService.getActivityOutbox()).toEqual([]);
  });

  it('sends at most 20 Activities per request', async () => {
    const fetch = fakeFetch('network');
    const { client } = setup({ fetch });
    for (let i = 0; i < 45; i++) await client.recordExamOpened(`EXAM-${i}`);
    fetch.mockClear();
    fetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    await client.flush();
    expect(bodies(fetch).map((b) => b.activities.length)).toEqual([20, 20, 5]);
    expect(bodies(fetch)[0].activities[0].examId).toBe('EXAM-0');
    expect(StorageService.getActivityOutbox()).toEqual([]);
  });

  it('caps the outbox at 200 items, dropping the oldest', async () => {
    const { client } = setup({ fetch: fakeFetch(503) });
    for (let i = 0; i < 205; i++) await client.recordExamOpened(`EXAM-${i}`);
    const outbox = StorageService.getActivityOutbox() as { examId: string }[];
    expect(outbox).toHaveLength(200);
    expect(outbox[0].examId).toBe('EXAM-5');
    expect(outbox[199].examId).toBe('EXAM-204');
  });

  it('drops outbox items older than 90 days instead of sending them', async () => {
    const fetch = fakeFetch(503);
    const { client, setNow } = setup({ fetch });
    setNow('2026-08-01T12:00:00.000Z');
    await client.recordExamOpened('OLD');
    setNow('2026-08-05T12:00:00.000Z');
    await client.recordExamOpened('RECENT');
    fetch.mockClear();
    fetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    setNow('2026-11-01T12:00:00.000Z'); // OLD is 92 days old, RECENT 88
    await client.flush();
    expect(bodies(fetch)[0].activities.map((a: { examId: string }) => a.examId)).toEqual(['RECENT']);
  });

  it('records at most one Visit per local day', async () => {
    const { client, fetch, setNow } = setup();
    await client.recordVisit();
    setNow('2026-11-02T17:01:00.000Z');
    await client.recordVisit();
    setNow('2026-11-03T17:00:00.000Z');
    await client.recordVisit();
    expect(bodies(fetch).map((b) => b.activities)).toEqual([
      [{ type: 'visit', at: '2026-11-02T17:00:00.000Z' }],
      [{ type: 'visit', at: '2026-11-03T17:00:00.000Z' }],
    ]);
  });

  it('still counts a Visit as recorded for the day while it waits in the outbox', async () => {
    const { client, setNow } = setup({ fetch: fakeFetch('network') });
    await client.recordVisit();
    setNow('2026-11-02T17:30:00.000Z');
    await client.recordVisit();
    expect(StorageService.getActivityOutbox()).toHaveLength(1);
  });

  it('records a Quiz Result without passed', async () => {
    const { client, fetch } = setup();
    await client.recordResult({
      examId: 'AWS-SAA-C03', mode: 'quiz', correct: 2, total: 3, percent: 66.666666, passed: true, timeSpentSec: 95.4,
    });
    expect(bodies(fetch)[0].activities).toEqual([{
      type: 'result', at: '2026-11-02T17:00:00.000Z', examId: 'AWS-SAA-C03',
      mode: 'quiz', correct: 2, total: 3, percent: 66.67, timeSpentSec: 95,
    }]);
  });

  it('records an Exam Simulation Result with passed', async () => {
    const { client, fetch } = setup();
    await client.recordResult({
      examId: 'AWS-SAA-C03', mode: 'sim', correct: 50, total: 65, percent: 76.923, passed: true, timeSpentSec: 5400,
    });
    expect(bodies(fetch)[0].activities[0]).toMatchObject({ mode: 'sim', percent: 76.92, passed: true });
  });

  it('skips a Result with no questions (the API needs total >= 1)', async () => {
    const { client, fetch } = setup();
    await client.recordResult({
      examId: 'AWS-SAA-C03', mode: 'quiz', correct: 0, total: 0, percent: 0, timeSpentSec: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('start() records the Visit, flushes the outbox, and flushes again when back online', async () => {
    const fetch = fakeFetch('network');
    const { client } = setup({ fetch });
    await client.recordExamOpened('AWS-SAA-C03');
    fetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const stop = client.start();
    await client.flush();
    expect(StorageService.getActivityOutbox()).toEqual([]);
    expect(bodies(fetch).at(-1).activities.map((a: { type: string }) => a.type)).toEqual(['exam_opened', 'visit']);

    fetch.mockImplementation(async () => { throw new TypeError('offline'); });
    await client.recordExamOpened('AWS-DVA-C02');
    fetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    window.dispatchEvent(new Event('online'));
    await client.flush();
    expect(StorageService.getActivityOutbox()).toEqual([]);

    stop();
    fetch.mockClear();
    window.dispatchEvent(new Event('online'));
    await client.flush();
    expect(fetch).not.toHaveBeenCalled();
  });
});
