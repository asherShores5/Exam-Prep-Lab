/**
 * GET /admin/*: the owner-only read path for the Admin Page (SPEC §9.3, ADR 0001).
 *
 * API Gateway's Cognito JWT authorizer has already verified the access token (signature, issuer,
 * client, expiry) before this runs. This handler adds the action-level check: the token must be
 * an access token whose `cognito:groups` contains `admins`. Anything else gets 403 and nothing is
 * read. The Lambda's IAM role can only read the table (Scan, Query, GetItem).
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const LEARNERS_ROUTE = "GET /admin/learners";
export const ACTIVITY_ROUTE = "GET /admin/learners/{id}/activity";
export const ADMIN_GROUP = "admins";

export interface AdminDeps {
  client: { send(command: ScanCommand | QueryCommand | GetCommand): Promise<any> };
  tableName: string;
}

type Response = APIGatewayProxyStructuredResultV2;
type Event = APIGatewayProxyEventV2WithJWTAuthorizer;

const json = (statusCode: number, body: unknown): Response => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

/**
 * HTTP API passes array claims as a string like "[admins viewers]"; accept that, a plain
 * string, or a real array. Matching is on whole group names only.
 */
export function groupsOf(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.filter((g): g is string => typeof g === "string");
  if (typeof claim !== "string") return [];
  const s = claim.trim();
  const inner = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s;
  return inner.split(/[\s,]+/).filter(Boolean);
}

type Access = "ok" | "unauthenticated" | "forbidden";

function checkAccess(event: Event): Access {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return "unauthenticated";
  if (claims.token_use !== "access") return "forbidden";
  return groupsOf(claims["cognito:groups"]).includes(ADMIN_GROUP) ? "ok" : "forbidden";
}

export function createAdminHandler(deps: AdminDeps) {
  return async (event: Event): Promise<Response> => {
    if (event.routeKey !== LEARNERS_ROUTE && event.routeKey !== ACTIVITY_ROUTE) return json(404, { error: "not_found" });
    const access = checkAccess(event);
    if (access === "unauthenticated") return json(401, { error: "unauthorized" });
    if (access === "forbidden") return json(403, { error: "forbidden" });

    try {
      if (event.routeKey === LEARNERS_ROUTE) return json(200, await listLearners(deps));
      const req = parseActivityRequest(event);
      if (!req.ok) return json(400, { error: "invalid", message: req.error });
      const timeline = await learnerActivity(deps, req.value);
      return timeline ? json(200, timeline) : json(404, { error: "not_found" });
    } catch (e) {
      // Failure kind only: no names, no keys.
      console.error("admin read failed", (e as Error)?.name);
      return json(500, { error: "internal" });
    }
  };
}

/** Up to 10 scan pages (1 MB each) per request; past that the list says `truncated: true`. */
export const MAX_SCAN_PAGES = 10;

export interface LatestScore {
  examId: string;
  at: string;
  mode: string;
  percent: number;
  passed?: boolean;
}

export interface LearnerSummary {
  learnerId: string;
  name: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  exams: string[];
  resultCount: number;
  /** Newest Result per exam, newest first. */
  latestScores: LatestScore[];
}

const LEARNER_PREFIX = "LEARNER#";
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

async function listLearners(deps: AdminDeps): Promise<{ learners: LearnerSummary[]; truncated: boolean }> {
  const byId = new Map<string, { summary: LearnerSummary; exams: Set<string>; latest: Map<string, LatestScore> }>();
  const entry = (learnerId: string) => {
    let e = byId.get(learnerId);
    if (!e) {
      e = {
        summary: { learnerId, name: null, firstSeen: null, lastSeen: null, exams: [], resultCount: 0, latestScores: [] },
        exams: new Set(),
        latest: new Map(),
      };
      byId.set(learnerId, e);
    }
    return e;
  };

  let startKey: Record<string, unknown> | undefined;
  let pages = 0;
  do {
    const page = await deps.client.send(
      new ScanCommand({
        TableName: deps.tableName,
        // Only what the summary needs; Result details stay on the per-Learner timeline.
        ProjectionExpression: "PK, SK, #name, firstSeen, lastSeen, #type, examId, #mode, #at, percent, passed",
        ExpressionAttributeNames: { "#name": "name", "#type": "type", "#mode": "mode", "#at": "at" },
        ExclusiveStartKey: startKey,
      }),
    );
    pages++;
    for (const item of (page.Items ?? []) as Record<string, unknown>[]) {
      const pk = str(item.PK);
      const sk = str(item.SK);
      if (!pk?.startsWith(LEARNER_PREFIX) || !sk) continue;
      const e = entry(pk.slice(LEARNER_PREFIX.length));
      if (sk === "PROFILE") {
        e.summary.name = str(item.name);
        e.summary.firstSeen = str(item.firstSeen);
        e.summary.lastSeen = str(item.lastSeen);
        continue;
      }
      if (!sk.startsWith("ACT#")) continue;
      const examId = str(item.examId);
      if (examId) e.exams.add(examId);
      const at = str(item.at);
      if (item.type !== "result" || !examId || !at || typeof item.percent !== "number") continue;
      e.summary.resultCount++;
      const prev = e.latest.get(examId);
      if (!prev || prev.at < at) {
        const score: LatestScore = { examId, at, mode: str(item.mode) ?? "", percent: item.percent };
        if (typeof item.passed === "boolean") score.passed = item.passed;
        e.latest.set(examId, score);
      }
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey && pages < MAX_SCAN_PAGES);

  const learners = [...byId.values()].map(({ summary, exams, latest }) => ({
    ...summary,
    exams: [...exams].sort(),
    latestScores: [...latest.values()].sort((a, b) => b.at.localeCompare(a.at)),
  }));
  // Most recently seen first; Learners with no profile last.
  learners.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
  return { learners, truncated: startKey !== undefined };
}

export const DEFAULT_ACTIVITY_LIMIT = 100;
export const MAX_ACTIVITY_LIMIT = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fields of a stored Activity the Admin Page may see (table keys stay server-side). */
const ACTIVITY_FIELDS = ["type", "at", "examId", "mode", "correct", "total", "percent", "passed", "timeSpentSec", "receivedAt"] as const;

interface ActivityRequest {
  learnerId: string;
  limit: number;
  startKey?: { PK: string; SK: string };
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseActivityRequest(event: Event): Parsed<ActivityRequest> {
  const id = event.pathParameters?.id;
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "id must be a Learner UUID" };
  const learnerId = id.toLowerCase();

  const q = event.queryStringParameters ?? {};
  let limit = DEFAULT_ACTIVITY_LIMIT;
  if (q.limit !== undefined) {
    if (!/^[1-9][0-9]{0,5}$/.test(q.limit)) return { ok: false, error: "limit must be a positive integer" };
    limit = Math.min(Number(q.limit), MAX_ACTIVITY_LIMIT);
  }

  let startKey: ActivityRequest["startKey"];
  if (q.cursor !== undefined) {
    startKey = decodeCursor(q.cursor, learnerId);
    if (!startKey) return { ok: false, error: "cursor is not valid for this Learner" };
  }
  return { ok: true, value: { learnerId, limit, startKey } };
}

const encodeCursor = (key: { PK: string; SK: string }) => Buffer.from(JSON.stringify({ PK: key.PK, SK: key.SK })).toString("base64url");

/** A cursor is only ever a key inside this Learner's own ACT# range. */
function decodeCursor(cursor: string, learnerId: string): { PK: string; SK: string } | undefined {
  if (cursor.length > 512) return undefined;
  try {
    const key = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (key && typeof key === "object" && Object.keys(key).length === 2 && key.PK === `${LEARNER_PREFIX}${learnerId}`
      && typeof key.SK === "string" && key.SK.startsWith("ACT#")) {
      return { PK: key.PK, SK: key.SK };
    }
  } catch {
    // fall through
  }
  return undefined;
}

async function learnerActivity(deps: AdminDeps, req: ActivityRequest) {
  const PK = `${LEARNER_PREFIX}${req.learnerId}`;
  const [profileRes, page] = await Promise.all([
    deps.client.send(new GetCommand({ TableName: deps.tableName, Key: { PK, SK: "PROFILE" } })),
    deps.client.send(
      new QueryCommand({
        TableName: deps.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :act)",
        ExpressionAttributeValues: { ":pk": PK, ":act": "ACT#" },
        ScanIndexForward: false,
        Limit: req.limit,
        ExclusiveStartKey: req.startKey,
      }),
    ),
  ]);
  const profile = profileRes.Item as Record<string, unknown> | undefined;
  const items = (page.Items ?? []) as Record<string, unknown>[];
  if (!profile && items.length === 0 && !req.startKey) return undefined;

  const activities = items.map((item) => {
    const out: Record<string, unknown> = {};
    for (const f of ACTIVITY_FIELDS) if (item[f] !== undefined) out[f] = item[f];
    return out;
  });
  const last = page.LastEvaluatedKey as { PK: string; SK: string } | undefined;
  return {
    learner: {
      learnerId: req.learnerId,
      name: str(profile?.name),
      firstSeen: str(profile?.firstSeen),
      lastSeen: str(profile?.lastSeen),
    },
    activities,
    nextCursor: last ? encodeCursor(last) : null,
  };
}

let live: ReturnType<typeof createAdminHandler> | undefined;

/** Lambda entry point, wired from env set by the CDK stack. */
export const handler = (event: Event): Promise<Response> => {
  live ??= createAdminHandler({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: requireEnv("TABLE_NAME"),
  });
  return live(event);
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
