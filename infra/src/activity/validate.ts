/**
 * Validation for POST /activity (SPEC §9.2). Shared contract: the Lambda uses it to reject bad
 * input, and the client (ticket 09) can import the types. Pure: no AWS, no clock of its own.
 */

export const LIMITS = {
  nameChars: 40,
  activitiesPerRequest: 20,
  /** A Result's question count. The biggest bank is well under this. */
  maxQuestions: 1000,
  maxTimeSpentSec: 86_400,
  /** Clock skew allowed for `at`. */
  atFutureMs: 5 * 60_000,
  /** How old a queued (outbox) Activity may be. */
  atPastMs: 90 * 86_400_000,
} as const;

/** Every Activity carries `at`: when it happened on the Learner's device (ISO, any zone in, UTC out). */
export interface Visit { type: "visit"; at: string }
export interface ExamOpened { type: "exam_opened"; at: string; examId: string }
export interface Result {
  type: "result";
  at: string;
  examId: string;
  mode: "quiz" | "sim";
  correct: number;
  total: number;
  percent: number;
  /** Set for an Exam Simulation; left out for a Quiz. */
  passed?: boolean;
  timeSpentSec: number;
}
export type Activity = Visit | ExamOpened | Result;

export interface ActivityBatch {
  learnerId: string;
  name: string;
  activities: Activity[];
}

export interface ValidationContext {
  knownExamIds: ReadonlySet<string>;
  now: Date;
}

export type ParseResult = { ok: true; value: ActivityBatch } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// C0/C1 control characters, plus line/paragraph separators.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]");

class Invalid extends Error {}
const fail = (message: string): never => {
  throw new Invalid(message);
};

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function onlyKeys(o: Obj, allowed: readonly string[], where: string) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${where}: unknown field "${k}"`);
}

function parseName(v: unknown): string {
  if (typeof v !== "string") return fail("name must be a string");
  const name = v.trim();
  const chars = [...name].length;
  if (chars < 1 || chars > LIMITS.nameChars) fail(`name must be 1-${LIMITS.nameChars} characters`);
  if (CONTROL.test(name)) fail("name must not contain control characters");
  return name;
}

// Full ISO 8601 date-time with seconds and an explicit zone, e.g. 2026-11-02T17:00:00.000Z.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function parseAt(v: unknown, where: string, now: Date): string {
  if (typeof v !== "string" || !ISO_DATE_TIME.test(v)) return fail(`${where}.at must be an ISO date-time with a zone`);
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return fail(`${where}.at is not a real date`);
  if (ms > now.getTime() + LIMITS.atFutureMs) fail(`${where}.at is in the future`);
  if (ms < now.getTime() - LIMITS.atPastMs) fail(`${where}.at is more than 90 days old`);
  return new Date(ms).toISOString();
}

function parseExamId(v: unknown, where: string, ctx: ValidationContext): string {
  if (typeof v !== "string" || !ctx.knownExamIds.has(v)) return fail(`${where}.examId is not a known exam`);
  return v;
}

function intIn(v: unknown, where: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return fail(`${where} must be an integer ${min}-${max}`);
  return v;
}

function parseActivity(v: unknown, i: number, ctx: ValidationContext): Activity {
  const where = `activities[${i}]`;
  if (!isObj(v)) return fail(`${where} must be an object`);
  switch (v.type) {
    case "visit":
      onlyKeys(v, ["type", "at"], where);
      return { type: "visit", at: parseAt(v.at, where, ctx.now) };
    case "exam_opened":
      onlyKeys(v, ["type", "at", "examId"], where);
      return { type: "exam_opened", at: parseAt(v.at, where, ctx.now), examId: parseExamId(v.examId, where, ctx) };
    case "result": {
      onlyKeys(v, ["type", "at", "examId", "mode", "correct", "total", "percent", "passed", "timeSpentSec"], where);
      const at = parseAt(v.at, where, ctx.now);
      const examId = parseExamId(v.examId, where, ctx);
      if (v.mode !== "quiz" && v.mode !== "sim") fail(`${where}.mode must be "quiz" or "sim"`);
      const total = intIn(v.total, `${where}.total`, 1, LIMITS.maxQuestions);
      const correct = intIn(v.correct, `${where}.correct`, 0, total);
      const { percent } = v;
      if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) fail(`${where}.percent must be 0-100`);
      if (Math.abs((percent as number) - (correct / total) * 100) > 1) fail(`${where}.percent doesn't match correct/total`);
      if (v.passed !== undefined && typeof v.passed !== "boolean") fail(`${where}.passed must be a boolean`);
      const timeSpentSec = intIn(v.timeSpentSec, `${where}.timeSpentSec`, 0, LIMITS.maxTimeSpentSec);
      return {
        type: "result", at, examId, mode: v.mode as Result["mode"], correct, total, percent: percent as number,
        ...(v.passed === undefined ? {} : { passed: v.passed as boolean }),
        timeSpentSec,
      };
    }
    default:
      return fail(`${where}.type must be "visit", "exam_opened" or "result"`);
  }
}

export function parseActivityBatch(input: unknown, ctx: ValidationContext): ParseResult {
  try {
    if (!isObj(input)) return fail("body must be a JSON object");
    onlyKeys(input, ["learnerId", "name", "activities"], "body");
    const { learnerId, activities } = input;
    if (typeof learnerId !== "string" || !UUID.test(learnerId)) fail("learnerId must be a UUID");
    const name = parseName(input.name);
    if (!Array.isArray(activities)) return fail("activities must be an array");
    if (activities.length > LIMITS.activitiesPerRequest) fail(`at most ${LIMITS.activitiesPerRequest} activities per request`);
    return {
      ok: true,
      value: {
        learnerId: (learnerId as string).toLowerCase(),
        name,
        activities: activities.map((a, i) => parseActivity(a, i, ctx)),
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}
