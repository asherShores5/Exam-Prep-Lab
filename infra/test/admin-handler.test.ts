import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { createAdminHandler } from "../src/admin/handler";

const A = "3b241101-e2bb-4255-8caf-4136c566a962";
const B = "9f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";

type Send = (command: any) => Promise<any>;

function setup(send: ReturnType<typeof vi.fn<Send>> = vi.fn<Send>().mockResolvedValue({ Items: [] })) {
  return { handler: createAdminHandler({ client: { send }, tableName: "Activity" }), send };
}

const ADMIN_CLAIMS = { "cognito:groups": "[admins]", token_use: "access", username: "asher" };

function get(
  routeKey: string,
  opts: { claims?: Record<string, unknown> | null; id?: string; query?: Record<string, string> } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const claims = opts.claims === undefined ? ADMIN_CLAIMS : opts.claims;
  return {
    routeKey,
    pathParameters: opts.id === undefined ? undefined : { id: opts.id },
    queryStringParameters: opts.query,
    requestContext: claims === null ? {} : { authorizer: { jwt: { claims, scopes: null } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const body = (res: { body?: string }) => JSON.parse(res.body!);
const LEARNERS = "GET /admin/learners";
const ACTIVITY = "GET /admin/learners/{id}/activity";

describe("admin access", () => {
  it("returns 401 and reads nothing when the request carries no verified token", async () => {
    const { handler, send } = setup();
    const res = await handler(get(LEARNERS, { claims: null }));
    expect(res.statusCode).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["no groups", { token_use: "access" }],
    ["another group", { "cognito:groups": "[viewers]", token_use: "access" }],
    ["a group whose name only contains admins", { "cognito:groups": "[notadmins]", token_use: "access" }],
    ["an ID token instead of an access token", { "cognito:groups": "[admins]", token_use: "id" }],
  ])("returns 403 and reads nothing for a signed-in caller with %s", async (_label, claims) => {
    const { handler, send } = setup();
    const res = await handler(get(LEARNERS, { claims }));
    expect(res.statusCode).toBe(403);
    expect(body(res)).toEqual({ error: "forbidden" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["the bracketed string API Gateway passes", "[admins]"],
    ["a bracketed list with other groups", "[viewers admins]"],
    ["a plain string", "admins"],
    ["a real array", ["viewers", "admins"]],
  ])("accepts the admins group given as %s", async (_label, groups) => {
    const { handler } = setup();
    const res = await handler(get(LEARNERS, { claims: { "cognito:groups": groups, token_use: "access" } }));
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for any route it doesn't serve", async () => {
    const { handler, send } = setup();
    const res = await handler(get("POST /activity"));
    expect(res.statusCode).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it("answers JSON and never lets the response be cached", async () => {
    const { handler } = setup();
    const res = await handler(get(LEARNERS));
    expect(res.headers).toMatchObject({ "content-type": "application/json", "cache-control": "no-store" });
  });

  it("returns a bare 500 when DynamoDB fails, without leaking the error", async () => {
    const { handler } = setup(vi.fn().mockRejectedValue(new Error("arn:aws:dynamodb:secret-table")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handler(get(LEARNERS));
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe(JSON.stringify({ error: "internal" }));
  });
});

const profile = (id: string, name: string, firstSeen: string, lastSeen: string) => ({
  PK: `LEARNER#${id}`, SK: "PROFILE", name, firstSeen, lastSeen,
});
const act = (id: string, at: string, rest: Record<string, unknown>) => ({ PK: `LEARNER#${id}`, SK: `ACT#${at}#ab12`, at, ...rest });

describe("GET /admin/learners", () => {
  const items = [
    profile(A, "Pat", "2026-10-01T10:00:00.000Z", "2026-11-01T10:00:00.000Z"),
    act(A, "2026-10-01T10:00:00.000Z", { type: "visit" }),
    act(A, "2026-10-01T10:01:00.000Z", { type: "exam_opened", examId: "PSM-I" }),
    act(A, "2026-10-02T10:00:00.000Z", { type: "result", examId: "PSM-I", mode: "quiz", correct: 6, total: 10, percent: 60, timeSpentSec: 30 }),
    act(A, "2026-10-05T10:00:00.000Z", { type: "result", examId: "PSM-I", mode: "sim", correct: 8, total: 10, percent: 80, passed: true, timeSpentSec: 90 }),
    act(A, "2026-10-03T10:00:00.000Z", { type: "result", examId: "AWS-SAA-C03", mode: "quiz", correct: 1, total: 2, percent: 50, timeSpentSec: 9 }),
    profile(B, "Sam", "2026-10-20T10:00:00.000Z", "2026-11-02T09:00:00.000Z"),
  ];

  it("lists every Learner, most recently seen first, with exams, Result count and latest score per exam", async () => {
    const send = vi.fn().mockResolvedValue({ Items: items });
    const { handler } = setup(send);
    const res = await handler(get(LEARNERS));
    expect(res.statusCode).toBe(200);
    expect(body(res)).toEqual({
      truncated: false,
      learners: [
        { learnerId: B, name: "Sam", firstSeen: "2026-10-20T10:00:00.000Z", lastSeen: "2026-11-02T09:00:00.000Z", exams: [], resultCount: 0, latestScores: [] },
        {
          learnerId: A, name: "Pat", firstSeen: "2026-10-01T10:00:00.000Z", lastSeen: "2026-11-01T10:00:00.000Z",
          exams: ["AWS-SAA-C03", "PSM-I"],
          resultCount: 3,
          latestScores: [
            { examId: "PSM-I", at: "2026-10-05T10:00:00.000Z", mode: "sim", percent: 80, passed: true },
            { examId: "AWS-SAA-C03", at: "2026-10-03T10:00:00.000Z", mode: "quiz", percent: 50 },
          ],
        },
      ],
    });
  });

  it("follows scan pages until the table is done", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Items: items.slice(0, 3), LastEvaluatedKey: { PK: "x", SK: "y" } })
      .mockResolvedValueOnce({ Items: items.slice(3) });
    const { handler } = setup(send);
    const res = await handler(get(LEARNERS));
    expect(body(res).learners).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].input).toMatchObject({ TableName: "Activity" });
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual({ PK: "x", SK: "y" });
  });

  it("stops after a fixed number of scan pages and says the list is truncated", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [items[0]], LastEvaluatedKey: { PK: "x", SK: "y" } });
    const { handler } = setup(send);
    const res = await handler(get(LEARNERS));
    expect(body(res).truncated).toBe(true);
    expect(send).toHaveBeenCalledTimes(10);
  });

  it("still lists a Learner whose profile item is missing, and ignores items that aren't Learner data", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [act(A, "2026-10-01T10:00:00.000Z", { type: "visit" }), { PK: "OTHER", SK: "X" }] });
    const { handler } = setup(send);
    const res = await handler(get(LEARNERS));
    expect(body(res).learners).toEqual([
      { learnerId: A, name: null, firstSeen: null, lastSeen: null, exams: [], resultCount: 0, latestScores: [] },
    ]);
  });
});

describe("GET /admin/learners/{id}/activity", () => {
  const PROFILE = profile(A, "Pat", "2026-10-01T10:00:00.000Z", "2026-11-01T10:00:00.000Z");
  const RESULT = act(A, "2026-10-05T10:00:00.000Z", {
    type: "result", examId: "PSM-I", mode: "sim", correct: 8, total: 10, percent: 80, passed: true, timeSpentSec: 90,
    receivedAt: "2026-10-05T10:00:01.000Z",
  });
  const VISIT = act(A, "2026-10-01T10:00:00.000Z", { type: "visit", receivedAt: "2026-10-01T10:00:02.000Z" });

  /** GetItem answers the profile; Query answers the timeline page. */
  function table(page: { Items: unknown[]; LastEvaluatedKey?: unknown }, profileItem: unknown = PROFILE) {
    return vi.fn(async (cmd: any) => (cmd.constructor.name === "GetCommand" ? { Item: profileItem ?? undefined } : page));
  }

  it("returns the Learner's profile and Activity newest first, without table keys", async () => {
    const send = table({ Items: [RESULT, VISIT] });
    const { handler } = setup(send);
    const res = await handler(get(ACTIVITY, { id: A }));
    expect(res.statusCode).toBe(200);
    expect(body(res)).toEqual({
      learner: { learnerId: A, name: "Pat", firstSeen: "2026-10-01T10:00:00.000Z", lastSeen: "2026-11-01T10:00:00.000Z" },
      activities: [
        { type: "result", at: "2026-10-05T10:00:00.000Z", examId: "PSM-I", mode: "sim", correct: 8, total: 10, percent: 80, passed: true, timeSpentSec: 90, receivedAt: "2026-10-05T10:00:01.000Z" },
        { type: "visit", at: "2026-10-01T10:00:00.000Z", receivedAt: "2026-10-01T10:00:02.000Z" },
      ],
      nextCursor: null,
    });
    const query = send.mock.calls.map((c) => c[0]).find((c) => c.constructor.name === "QueryCommand").input;
    expect(query).toMatchObject({
      TableName: "Activity",
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :act)",
      ExpressionAttributeValues: { ":pk": `LEARNER#${A}`, ":act": "ACT#" },
      ScanIndexForward: false,
      Limit: 100,
    });
  });

  it("accepts an upper-case id and looks it up lower-case", async () => {
    const send = table({ Items: [] });
    const { handler } = setup(send);
    const res = await handler(get(ACTIVITY, { id: A.toUpperCase() }));
    expect(res.statusCode).toBe(200);
    expect(body(res).learner.learnerId).toBe(A);
  });

  it("caps the page size at 200 and honours a smaller limit", async () => {
    for (const [limit, expected] of [["500", 200], ["25", 25]] as const) {
      const send = table({ Items: [] });
      const { handler } = setup(send);
      await handler(get(ACTIVITY, { id: A, query: { limit } }));
      const query = send.mock.calls.map((c) => c[0]).find((c) => c.constructor.name === "QueryCommand").input;
      expect(query.Limit).toBe(expected);
    }
  });

  it("hands back a cursor for the next page, and resumes from it", async () => {
    const lastKey = { PK: `LEARNER#${A}`, SK: VISIT.SK };
    const first = setup(table({ Items: [VISIT], LastEvaluatedKey: lastKey }));
    const cursor = body(await first.handler(get(ACTIVITY, { id: A }))).nextCursor;
    expect(typeof cursor).toBe("string");

    const send = table({ Items: [] });
    const { handler } = setup(send);
    const res = await handler(get(ACTIVITY, { id: A, query: { cursor } }));
    expect(res.statusCode).toBe(200);
    const query = send.mock.calls.map((c) => c[0]).find((c) => c.constructor.name === "QueryCommand").input;
    expect(query.ExclusiveStartKey).toEqual(lastKey);
  });

  it.each([
    ["an id that isn't a UUID", { id: "LEARNER#x" }],
    ["a cursor that isn't ours", { id: A, query: { cursor: "not-a-cursor" } }],
    ["a cursor for another Learner", { id: A, query: { cursor: Buffer.from(JSON.stringify({ PK: `LEARNER#${B}`, SK: "ACT#x" })).toString("base64url") } }],
    ["a limit that isn't a positive integer", { id: A, query: { limit: "-1" } }],
  ])("returns 400 and reads nothing for %s", async (_label, opts) => {
    const { handler, send } = setup();
    const res = await handler(get(ACTIVITY, opts));
    expect(res.statusCode).toBe(400);
    expect(body(res)).toEqual({ error: "invalid", message: expect.any(String) });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 404 for a Learner that doesn't exist", async () => {
    const { handler } = setup(table({ Items: [] }, null));
    const res = await handler(get(ACTIVITY, { id: B }));
    expect(res.statusCode).toBe(404);
  });

  it("refuses a non-admin before reading anything", async () => {
    const { handler, send } = setup();
    const res = await handler(get(ACTIVITY, { id: A, claims: { token_use: "access" } }));
    expect(res.statusCode).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });
});
