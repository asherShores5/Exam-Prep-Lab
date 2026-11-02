/**
 * activity.ts — records Learner Activity to POST /activity (SPEC §9.2,
 * GLOSSARY "Activity"; contract in infra/README.md).
 *
 * Every Activity is queued in the outbox (`epl_activity_outbox`) and then sent.
 * Failure policy: recording never throws and never blocks studying.
 */

import { StorageService } from './storage';
import { getLearner as defaultGetLearner, type Learner } from './learner';

/** The API takes at most 20 Activities per request. */
export const ACTIVITY_BATCH_SIZE = 20;
/** Outbox cap; the oldest items are dropped first. */
export const ACTIVITY_OUTBOX_CAP = 200;
/** The API rejects Activity older than 90 days, so the outbox drops it. */
export const ACTIVITY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/** A Result's question count must be 1..this. */
export const ACTIVITY_MAX_QUESTIONS = 1000;
/** A Result's timeSpentSec must be 0..this (one day). */
export const ACTIVITY_MAX_TIME_SPENT_SEC = 86_400;

export type ResultMode = 'quiz' | 'sim';

/** A finished Quiz or Exam Simulation, as passed in by QuizMode. */
export interface ResultInput {
  examId: string;
  mode: ResultMode;
  correct: number;
  total: number;
  percent: number;
  /** Only sent for 'sim'. */
  passed?: boolean;
  timeSpentSec: number;
}

export type Activity =
  | { type: 'visit'; at: string }
  | { type: 'exam_opened'; at: string; examId: string }
  | ({ type: 'result'; at: string } & ResultInput);

export interface ActivityDeps {
  /** API base URL; unset means recording is a no-op. */
  apiUrl: string | undefined;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => Date;
  getLearner: () => Learner | null;
}

/** YYYY-MM-DD in the device's local time zone. */
function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Shape a Result to the API's ranges, or null if it can't be sent (no questions). */
function toResultActivity(input: ResultInput, at: string): Activity | null {
  if (!Number.isFinite(input.total) || input.total < 1) return null;
  const total = clamp(Math.round(input.total), 1, ACTIVITY_MAX_QUESTIONS);
  const correct = clamp(Math.round(input.correct || 0), 0, total);
  const percent = Math.round(clamp(input.percent || 0, 0, 100) * 100) / 100;
  const timeSpentSec = clamp(Math.round(input.timeSpentSec || 0), 0, ACTIVITY_MAX_TIME_SPENT_SEC);
  return {
    type: 'result',
    at,
    examId: input.examId,
    mode: input.mode,
    correct,
    total,
    percent,
    ...(input.mode === 'sim' && typeof input.passed === 'boolean' ? { passed: input.passed } : {}),
    timeSpentSec,
  };
}

// Mirrors the per-item rules in infra/src/activity/validate.ts (the age limit is applied in
// dropExpired, and known examIds are the server's call), so one bad item never costs a batch.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const KEYS: Record<Activity['type'], readonly string[]> = {
  visit: ['type', 'at'],
  exam_opened: ['type', 'at', 'examId'],
  result: ['type', 'at', 'examId', 'mode', 'correct', 'total', 'percent', 'passed', 'timeSpentSec'],
};
const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** True if the API would accept this item (shape, fields and ranges). */
export function isValidActivity(value: unknown): value is Activity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.type !== 'visit' && v.type !== 'exam_opened' && v.type !== 'result') return false;
  if (Object.keys(v).some((k) => !KEYS[v.type as Activity['type']].includes(k))) return false;
  if (typeof v.at !== 'string' || !ISO_DATE_TIME.test(v.at) || Number.isNaN(Date.parse(v.at))) return false;
  if (v.type === 'visit') return true;
  if (typeof v.examId !== 'string' || v.examId.length === 0) return false;
  if (v.type === 'exam_opened') return true;
  if (v.mode !== 'quiz' && v.mode !== 'sim') return false;
  if (!intIn(v.total, 1, ACTIVITY_MAX_QUESTIONS) || !intIn(v.correct, 0, v.total)) return false;
  const { percent } = v;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return false;
  if (Math.abs(percent - (v.correct / v.total) * 100) > 1) return false;
  if (v.passed !== undefined && typeof v.passed !== 'boolean') return false;
  return intIn(v.timeSpentSec, 0, ACTIVITY_MAX_TIME_SPENT_SEC);
}

function readOutbox(): Activity[] {
  try {
    return StorageService.getActivityOutbox().filter(isValidActivity);
  } catch {
    return [];
  }
}

function writeOutbox(items: Activity[]): void {
  try {
    StorageService.saveActivityOutbox(items);
  } catch (err) {
    console.warn('[activity] Could not save outbox:', err);
  }
}

export function createActivityClient(deps: ActivityDeps) {
  const enabled = typeof deps.apiUrl === 'string' && deps.apiUrl.length > 0;
  const endpoint = enabled ? `${deps.apiUrl!.replace(/\/+$/, '')}/activity` : '';

  /** Remove one stored copy of each sent item (new items may have been queued meanwhile). */
  function removeSent(sent: Activity[]): void {
    const remaining = readOutbox().map((a) => JSON.stringify(a));
    for (const item of sent) {
      const i = remaining.indexOf(JSON.stringify(item));
      if (i !== -1) remaining.splice(i, 1);
    }
    writeOutbox(remaining.map((a) => JSON.parse(a) as Activity));
  }

  function dropExpired(): void {
    const cutoff = deps.now().getTime() - ACTIVITY_MAX_AGE_MS;
    const items = readOutbox();
    const fresh = items.filter((a) => Date.parse(a.at) >= cutoff);
    if (fresh.length !== items.length) writeOutbox(fresh);
  }

  /** POST one batch; the HTTP status, or null on a network error. */
  async function post(learner: Learner, activities: Activity[]): Promise<number | null> {
    try {
      const res = await deps.fetch(endpoint, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerId: learner.learnerId, name: learner.name, activities }),
      });
      return res.status;
    } catch {
      return null; // offline / network error: keep for later
    }
  }

  // 2xx = stored; 400 = will never be accepted, drop it. Anything else: retry later.
  const isDone = (status: number | null) => status !== null && ((status >= 200 && status < 300) || status === 400);

  /** Send the outbox in batches; stop at the first retryable failure. */
  async function sendOutbox(): Promise<void> {
    const learner = deps.getLearner();
    if (!learner) return;
    dropExpired();
    for (;;) {
      const batch = readOutbox().slice(0, ACTIVITY_BATCH_SIZE);
      if (batch.length === 0) return;
      const status = await post(learner, batch);
      if (status === 400 && batch.length > 1) {
        // One bad item rejects the whole batch: retry each once so only the bad ones are dropped.
        for (const item of batch) {
          const itemStatus = await post(learner, [item]);
          if (!isDone(itemStatus)) return;
          removeSent([item]);
        }
        continue;
      }
      if (isDone(status)) removeSent(batch);
      else return;
    }
  }

  // Serialize sends so two flushes never post the same items.
  let chain: Promise<void> = Promise.resolve();
  function flush(): Promise<void> {
    if (!enabled) return Promise.resolve();
    chain = chain.then(sendOutbox).catch((err) => {
      console.warn('[activity] Send failed:', err);
    });
    return chain;
  }

  async function record(activity: Activity): Promise<void> {
    if (!enabled || !isValidActivity(activity)) return;
    try {
      writeOutbox([...readOutbox(), activity].slice(-ACTIVITY_OUTBOX_CAP));
    } catch {
      return;
    }
    await flush();
  }

  async function recordVisit(): Promise<void> {
    if (!enabled) return;
    try {
      const now = deps.now();
      const today = localDay(now);
      if (StorageService.getActivityLastVisit() === today) return;
      StorageService.saveActivityLastVisit(today);
      await record({ type: 'visit', at: now.toISOString() });
    } catch {
      // never block studying
    }
  }

  return {
    /** Record a Visit unless one was already recorded today (local time). */
    recordVisit,
    recordExamOpened: async (examId: string) => {
      await record({ type: 'exam_opened', at: deps.now().toISOString(), examId });
    },
    recordResult: async (input: ResultInput) => {
      try {
        const activity = toResultActivity(input, deps.now().toISOString());
        if (activity) await record(activity);
      } catch {
        // never block studying
      }
    },
    flush,
    /**
     * Call once on app load: records today's Visit (which also flushes the
     * outbox) and flushes again on every `online` event. Returns a cleanup.
     */
    start(): () => void {
      if (!enabled || typeof window === 'undefined') return () => {};
      const onOnline = () => { void flush(); };
      window.addEventListener('online', onOnline);
      void recordVisit().then(flush);
      return () => window.removeEventListener('online', onOnline);
    },
  };
}

export type ActivityClient = ReturnType<typeof createActivityClient>;

// ---------------------------------------------------------------------------
// App-wide client: real fetch, real clock, API URL from VITE_ACTIVITY_API.
// ---------------------------------------------------------------------------

const activity = createActivityClient({
  apiUrl: import.meta.env.VITE_ACTIVITY_API,
  fetch: (url, init) => fetch(url, init),
  now: () => new Date(),
  getLearner: defaultGetLearner,
});

/** Start recording (Visit + outbox flush on load and `online`). Returns a cleanup. */
export const startActivity = activity.start;
/** Fire-and-forget: record that the Learner opened an Exam. */
export const recordExamOpened = (examId: string): void => { void activity.recordExamOpened(examId); };
/** Fire-and-forget: record a finished Quiz or Exam Simulation. */
export const recordResult = (input: ResultInput): void => { void activity.recordResult(input); };
