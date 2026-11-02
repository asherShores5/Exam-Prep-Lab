/**
 * POST /activity: the public, unauthenticated write path (SPEC §9.2, ADR 0001). Validates the
 * batch, then upserts the Learner's PROFILE and adds one ACT# item per Activity in a single
 * transaction. There is deliberately no read path here; Admin reads (ticket 10) go through a
 * separate, Cognito-guarded Lambda.
 */
import { randomBytes } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { type Activity, parseActivityBatch } from "./validate";

export const ROUTE = "POST /activity";
/** Bodies bigger than this are refused before parsing. 20 full Results are about 4 KB. */
export const MAX_BODY_BYTES = 16 * 1024;

export interface HandlerDeps {
  client: { send(command: TransactWriteCommand): Promise<unknown> };
  tableName: string;
  knownExamIds: ReadonlySet<string>;
  now(): Date;
  /** Makes two Activities with the same `at` distinct keys. */
  randomSuffix(): string;
}

type Response = APIGatewayProxyStructuredResultV2;

const json = (statusCode: number, body: unknown): Response => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});
const invalid = (message: string) => json(400, { error: "invalid", message });

function readBody(event: APIGatewayProxyEventV2): string | undefined {
  if (event.body === undefined || event.body === null) return undefined;
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

export function createHandler(deps: HandlerDeps) {
  return async (event: APIGatewayProxyEventV2): Promise<Response> => {
    if (event.routeKey !== ROUTE) return json(404, { error: "not_found" });

    const raw = readBody(event);
    if (raw === undefined || raw === "") return invalid("body is required");
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return invalid(`body must be at most ${MAX_BODY_BYTES} bytes`);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return invalid("body must be JSON");
    }

    const now = deps.now();
    const parsed = parseActivityBatch(input, { knownExamIds: deps.knownExamIds, now });
    if (!parsed.ok) return invalid(parsed.error);
    const { learnerId, name, activities } = parsed.value;
    const PK = `LEARNER#${learnerId}`;
    const receivedAt = now.toISOString();

    try {
      await deps.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: deps.tableName,
                Key: { PK, SK: "PROFILE" },
                UpdateExpression: "SET #name = :name, lastSeen = :now, firstSeen = if_not_exists(firstSeen, :now)",
                ExpressionAttributeNames: { "#name": "name" },
                ExpressionAttributeValues: { ":name": name, ":now": receivedAt },
              },
            },
            ...activities.map((activity: Activity) => ({
              Put: {
                TableName: deps.tableName,
                Item: { PK, SK: `ACT#${activity.at}#${deps.randomSuffix()}`, ...activity, receivedAt },
                ConditionExpression: "attribute_not_exists(SK)",
              },
            })),
          ],
        }),
      );
    } catch (e) {
      // Log the failure kind only: no names, no request body.
      console.error("activity write failed", (e as Error)?.name);
      return json(500, { error: "internal" });
    }
    return json(200, { accepted: activities.length });
  };
}

let live: ReturnType<typeof createHandler> | undefined;

/** Lambda entry point, wired from env set by the CDK stack. */
export const handler = (event: APIGatewayProxyEventV2): Promise<Response> => {
  live ??= createHandler({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: requireEnv("TABLE_NAME"),
    knownExamIds: new Set(requireEnv("KNOWN_EXAM_IDS").split(",")),
    now: () => new Date(),
    randomSuffix: () => randomBytes(6).toString("hex"),
  });
  return live(event);
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
