import { describe, expect, it } from "vitest";
import { parseActivityBatch } from "../src/activity/validate";

const NOW = new Date("2026-11-02T18:00:00.000Z");
const ctx = { knownExamIds: new Set(["AWS-SAA-C03", "PSM-I"]), now: NOW };
const LEARNER = "3b241101-e2bb-4255-8caf-4136c566a962";

const batch = (over: Record<string, unknown> = {}) => ({
  learnerId: LEARNER,
  name: "Pat",
  activities: [{ type: "visit", at: "2026-11-02T17:59:00.000Z" }],
  ...over,
});

describe("parseActivityBatch", () => {
  it("accepts a Visit from a Learner", () => {
    expect(parseActivityBatch(batch(), ctx)).toEqual({
      ok: true,
      value: { learnerId: LEARNER, name: "Pat", activities: [{ type: "visit", at: "2026-11-02T17:59:00.000Z" }] },
    });
  });

  it("trims the name and keeps 40 characters, counting emoji as one", () => {
    const forty = "é".repeat(39) + "😀";
    const r = parseActivityBatch(batch({ name: `  ${forty}  ` }), ctx);
    expect(r.ok && r.value.name).toBe(forty);
  });

  it.each([
    ["a body that is not an object", "nope"],
    ["a null body", null],
    ["an array body", []],
    ["a missing learnerId", batch({ learnerId: undefined })],
    ["a learnerId that is not a UUID", batch({ learnerId: "LEARNER#x" })],
    ["a blank name", batch({ name: "   " })],
    ["a 41-character name", batch({ name: "x".repeat(41) })],
    ["a name with control characters", batch({ name: "Pat\nSmith" })],
    ["a non-string name", batch({ name: 7 })],
    ["an unknown top-level field", batch({ admin: true })],
    ["activities that is not an array", batch({ activities: {} })],
    ["21 activities", batch({ activities: Array(21).fill({ type: "visit", at: "2026-11-02T17:59:00.000Z" }) })],
  ])("rejects %s", (_label, input) => {
    expect(parseActivityBatch(input, ctx)).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("accepts 20 activities and an empty list (a name change only)", () => {
    const twenty = Array(20).fill({ type: "visit", at: "2026-11-02T17:59:00.000Z" });
    expect(parseActivityBatch(batch({ activities: twenty }), ctx).ok).toBe(true);
    expect(parseActivityBatch(batch({ activities: [] }), ctx).ok).toBe(true);
  });

  it("lower-cases the learnerId so one browser is always one Learner", () => {
    const r = parseActivityBatch(batch({ learnerId: LEARNER.toUpperCase() }), ctx);
    expect(r.ok && r.value.learnerId).toBe(LEARNER);
  });
});

describe("parseActivityBatch: each Activity", () => {
  const AT = "2026-11-02T17:00:00.000Z";
  const one = (activity: unknown) => parseActivityBatch(batch({ activities: [activity] }), ctx);
  const result = (over: Record<string, unknown> = {}) => ({
    type: "result", at: AT, examId: "AWS-SAA-C03", mode: "sim", correct: 50, total: 65, percent: 76.92, passed: true, timeSpentSec: 5400, ...over,
  });

  it("accepts an Exam Opened for a known exam", () => {
    expect(one({ type: "exam_opened", at: AT, examId: "PSM-I" })).toEqual({
      ok: true, value: expect.objectContaining({ activities: [{ type: "exam_opened", at: AT, examId: "PSM-I" }] }),
    });
  });

  it("accepts a Result from an Exam Simulation and from a Quiz (where passed is left out)", () => {
    expect(one(result())).toEqual({ ok: true, value: expect.objectContaining({ activities: [result()] }) });
    const quiz: Record<string, unknown> = result({ mode: "quiz", correct: 3, total: 10, percent: 30 });
    delete quiz.passed;
    expect(one(quiz)).toEqual({ ok: true, value: expect.objectContaining({ activities: [quiz] }) });
  });

  it("stores `at` in one canonical UTC form", () => {
    const r = one({ type: "visit", at: "2026-11-02T09:00:00-08:00" });
    expect(r.ok && r.value.activities[0].at).toBe("2026-11-02T17:00:00.000Z");
  });

  it("clamps an `at` in the future (a device clock running fast) to server now instead of rejecting", () => {
    const r = one({ type: "visit", at: "2026-11-03T18:00:00.000Z" });
    expect(r.ok && r.value.activities[0].at).toBe("2026-11-02T18:00:00.000Z");
  });

  it("accepts an `at` up to 90 days old, so a queued outbox can still be sent", () => {
    expect(one({ type: "visit", at: "2026-08-04T18:00:00.000Z" }).ok).toBe(true);
  });

  it.each([
    ["an unknown type", { type: "page_view", at: AT }],
    ["a non-object", "visit"],
    ["a missing at", { type: "visit" }],
    ["an unparseable at", { type: "visit", at: "yesterday" }],
    ["a date-only at", { type: "visit", at: "2026-11-02" }],
    ["an at more than 90 days old", { type: "visit", at: "2026-08-04T17:59:00.000Z" }],
    ["an extra field on a Visit", { type: "visit", at: AT, examId: "PSM-I" }],
    ["an unknown examId", { type: "exam_opened", at: AT, examId: "NOT-AN-EXAM" }],
    ["a missing examId", { type: "exam_opened", at: AT }],
    ["an unknown mode", result({ mode: "practice" })],
    ["a fractional correct", result({ correct: 1.5 })],
    ["a negative correct", result({ correct: -1 })],
    ["correct above total", result({ correct: 66 })],
    ["a total of 0", result({ total: 0, correct: 0, percent: 0 })],
    ["a total above 1000", result({ total: 1001 })],
    ["a percent above 100", result({ percent: 101 })],
    ["a percent that doesn't match correct/total", result({ percent: 20 })],
    ["a non-boolean passed", result({ passed: "yes" })],
    ["a negative timeSpentSec", result({ timeSpentSec: -1 })],
    ["a timeSpentSec over a day", result({ timeSpentSec: 86_401 })],
    ["a string percent", result({ percent: "76" })],
    ["an extra field on a Result", result({ score: 50 })],
  ])("rejects %s", (_label, activity) => {
    expect(one(activity)).toMatchObject({ ok: false, error: expect.stringMatching(/^activities\[0\]/) });
  });
});
