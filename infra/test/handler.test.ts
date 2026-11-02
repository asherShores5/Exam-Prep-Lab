import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { createHandler } from "../src/activity/handler";

const NOW = new Date("2026-11-02T18:00:00.000Z");
const LEARNER = "3b241101-e2bb-4255-8caf-4136c566a962";
const AT = "2026-11-02T17:00:00.000Z";

function setup(send = vi.fn().mockResolvedValue({})) {
  let n = 0;
  const handler = createHandler({
    client: { send },
    tableName: "Activity",
    knownExamIds: new Set(["PSM-I"]),
    now: () => NOW,
    randomSuffix: () => `r${++n}`,
  });
  return { handler, send };
}

function post(body: unknown, over: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: "POST /activity",
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded: false,
    headers: { "content-type": "application/json" },
    ...over,
  } as APIGatewayProxyEventV2;
}

const valid = {
  learnerId: LEARNER,
  name: " Pat ",
  activities: [
    { type: "visit", at: AT },
    { type: "result", at: AT, examId: "PSM-I", mode: "quiz", correct: 3, total: 4, percent: 75, timeSpentSec: 60 },
  ],
};

/** The single TransactWriteItems request the handler sent. */
function written(send: ReturnType<typeof vi.fn>) {
  expect(send).toHaveBeenCalledTimes(1);
  return send.mock.calls[0][0].input.TransactItems as Array<Record<string, any>>;
}

describe("POST /activity", () => {
  it("records the Learner's profile and each Activity in one write, and says how many it took", async () => {
    const { handler, send } = setup();
    const res = await handler(post(valid));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({ accepted: 2 });

    const [profile, ...acts] = written(send);
    expect(profile.Update).toMatchObject({
      TableName: "Activity",
      Key: { PK: `LEARNER#${LEARNER}`, SK: "PROFILE" },
      ExpressionAttributeValues: { ":name": "Pat", ":now": NOW.toISOString() },
    });
    // firstSeen is set once and never moved; lastSeen and name follow the latest request.
    expect(profile.Update.UpdateExpression).toMatch(/firstSeen = if_not_exists\(firstSeen, :now\)/);
    expect(profile.Update.UpdateExpression).toMatch(/lastSeen = :now/);

    expect(acts.map((a) => a.Put)).toEqual([
      {
        TableName: "Activity",
        Item: { PK: `LEARNER#${LEARNER}`, SK: `ACT#${AT}#r1`, type: "visit", at: AT, receivedAt: NOW.toISOString() },
        ConditionExpression: "attribute_not_exists(SK)",
      },
      {
        TableName: "Activity",
        Item: {
          PK: `LEARNER#${LEARNER}`, SK: `ACT#${AT}#r2`, type: "result", at: AT, examId: "PSM-I", mode: "quiz",
          correct: 3, total: 4, percent: 75, timeSpentSec: 60, receivedAt: NOW.toISOString(),
        },
        ConditionExpression: "attribute_not_exists(SK)",
      },
    ]);
  });

  it("updates only the profile when there are no activities (a name change)", async () => {
    const { handler, send } = setup();
    const res = await handler(post({ ...valid, activities: [] }));
    expect(res.statusCode).toBe(200);
    expect(written(send)).toHaveLength(1);
  });

  it("reads a base64-encoded body", async () => {
    const { handler, send } = setup();
    const res = await handler(post(Buffer.from(JSON.stringify(valid)).toString("base64"), { isBase64Encoded: true }));
    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no body", post(undefined, { body: undefined })],
    ["a body that isn't JSON", post("{nope")],
    ["a body over 16 KB", post(JSON.stringify({ ...valid, pad: "x".repeat(16 * 1024) }))],
    ["an invalid batch", post({ ...valid, learnerId: "x" })],
    ["an unknown examId", post({ ...valid, activities: [{ type: "exam_opened", at: AT, examId: "NOPE" }] })],
  ])("returns 400 and writes nothing for %s", async (_label, event) => {
    const { handler, send } = setup();
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!)).toEqual({ error: "invalid", message: expect.any(String) });
    expect(send).not.toHaveBeenCalled();
  });

  it("says why a batch was refused", async () => {
    const { handler } = setup();
    const res = await handler(post({ ...valid, name: "" }));
    expect(JSON.parse(res.body!).message).toMatch(/name/);
  });

  it("returns 404 for any other route, so it can't become a read path", async () => {
    const { handler, send } = setup();
    const res = await handler(post(valid, { routeKey: "GET /activity" }));
    expect(res.statusCode).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns a bare 500 when DynamoDB fails, without leaking the error", async () => {
    const { handler } = setup(vi.fn().mockRejectedValue(new Error("arn:aws:dynamodb:secret-table")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handler(post(valid));
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe(JSON.stringify({ error: "internal" }));
  });

  it("answers JSON and never lets the response be cached", async () => {
    const { handler } = setup();
    const res = await handler(post(valid));
    expect(res.headers).toMatchObject({ "content-type": "application/json", "cache-control": "no-store" });
  });
});
