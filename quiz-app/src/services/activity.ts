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
  const total = clamp(Math.round(input.total), 1, 1000);
  const correct = clamp(Math.round(input.correct || 0), 0, total);
  const percent = Math.round(clamp(input.percent || 0, 0, 100) * 100) / 100;
  const timeSpentSec = clamp(Math.round(input.timeSpentSec || 0), 0, 86400);
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

function isActivity(value: unknown): value is Activity {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === 'string' && typeof v.at === 'string' && !Number.isNaN(Date.parse(v.at));
}

function readOutbox(): Activity[] {
  try {
    return StorageService.getActivityOutbox().filter(isActivity);
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

  /** Send the outbox in batches; stop at the first retryable failure. */
  async function sendOutbox(): Promise<void> {
    const learner = deps.getLearner();
    if (!learner) return;
    dropExpired();
    for (;;) {
      const batch = readOutbox().slice(0, ACTIVITY_BATCH_SIZE);
      if (batch.length === 0) return;
      let status: number;
      try {
        const res = await deps.fetch(endpoint, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ learnerId: learner.learnerId, name: learner.name, activities: batch }),
        });
        status = res.status;
      } catch {
        return; // offline / network error: keep for later
      }
      // 2xx = stored; 400 = will never be accepted, drop it. Anything else: retry later.
      if ((status >= 200 && status < 300) || status === 400) removeSent(batch);
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
    if (!enabled) return;
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
