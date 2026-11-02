import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../lib/app";
import { EXAM_INDEX_PATH, loadKnownExamIds } from "../lib/exams";

let built: BuiltApp;
let api: Template;
let ci: Template;
beforeAll(() => {
  built = buildApp(new App(), { region: "us-west-1" });
  api = Template.fromStack(built.api);
  ci = Template.fromStack(built.ci);
}, 120_000);

const only = (t: Template, type: string) => {
  const all = Object.values(t.findResources(type));
  expect(all).toHaveLength(1);
  return all[0] as { Properties: Record<string, any>; DeletionPolicy?: string; UpdateReplacePolicy?: string };
};

describe("Activity API stack", () => {
  it("lives in us-west-1", () => {
    expect(built.api.region).toBe("us-west-1");
    expect(built.ci.region).toBe("us-west-1");
  });

  it("is an HTTP API with exactly one public route, POST /activity, and no read route", () => {
    only(api, "AWS::ApiGatewayV2::Api");
    const routes = Object.values(api.findResources("AWS::ApiGatewayV2::Route")).map((r: any) => r.Properties.RouteKey);
    expect(routes).toEqual(["POST /activity"]);
  });

  it("throttles the stage to 5 requests a second with a burst of 20", () => {
    const stage = only(api, "AWS::ApiGatewayV2::Stage");
    expect(stage.Properties).toMatchObject({
      StageName: "$default",
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 20 },
    });
  });

  it("allows CORS only from the live site and the local dev server", () => {
    const { CorsConfiguration } = only(api, "AWS::ApiGatewayV2::Api").Properties;
    expect([...CorsConfiguration.AllowOrigins].sort()).toEqual(["http://localhost:5173", "https://exampreplab.ashershores.com"]);
    expect(CorsConfiguration.AllowMethods).toEqual(["POST"]);
    expect(CorsConfiguration.AllowHeaders).toEqual(["content-type"]);
    expect(CorsConfiguration.AllowCredentials).toBeFalsy();
  });

  it("keeps the table forever: on-demand, PITR on, RETAIN, deletion protection, no TTL", () => {
    const table = only(api, "AWS::DynamoDB::GlobalTable");
    expect(table.DeletionPolicy).toBe("Retain");
    expect(table.UpdateReplacePolicy).toBe("Retain");
    expect(table.Properties).toMatchObject({
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
    });
    expect(table.Properties.TimeToLiveSpecification).toBeUndefined();
    const [replica] = table.Properties.Replicas;
    expect(replica).toMatchObject({
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      DeletionProtectionEnabled: true,
    });
  });

  it("runs the handler on Node 22 with the table name and every known examId from index.json", () => {
    api.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Environment: {
        Variables: Match.objectLike({ TABLE_NAME: Match.anyValue(), KNOWN_EXAM_IDS: loadKnownExamIds(EXAM_INDEX_PATH).join(",") }),
      },
    });
  });

  it("lets the Lambda write items but never read, query or scan them", () => {
    const actions = Object.values(api.findResources("AWS::IAM::Policy"))
      .flatMap((p: any) => p.Properties.PolicyDocument.Statement)
      .flatMap((s: any) => [s.Action].flat());
    expect(actions.filter((a: string) => a.startsWith("dynamodb:")).sort()).toEqual(["dynamodb:PutItem", "dynamodb:UpdateItem"]);
  });

  it("has a $1/month budget on the app=exam-prep-lab cost tag", () => {
    const { Budget, NotificationsWithSubscribers } = only(api, "AWS::Budgets::Budget").Properties;
    expect(Budget).toMatchObject({
      BudgetName: "exam-prep-lab-monthly",
      BudgetType: "COST",
      TimeUnit: "MONTHLY",
      BudgetLimit: { Amount: 1, Unit: "USD" },
      CostFilters: { TagKeyValue: ["user:app$exam-prep-lab"] },
    });
    expect(NotificationsWithSubscribers.length).toBeGreaterThan(0);
  });

  it("tags every taggable resource app=exam-prep-lab", () => {
    for (const t of [api, ci]) {
      for (const type of ["AWS::Lambda::Function", "AWS::IAM::Role"]) {
        for (const r of Object.values(t.findResources(type)) as any[]) {
          expect(r.Properties.Tags).toContainEqual({ Key: "app", Value: "exam-prep-lab" });
        }
      }
    }
    // TableV2 puts tags on the replica.
    expect(only(api, "AWS::DynamoDB::GlobalTable").Properties.Replicas[0].Tags).toContainEqual({ Key: "app", Value: "exam-prep-lab" });
    expect(only(api, "AWS::ApiGatewayV2::Api").Properties.Tags).toEqual({ app: "exam-prep-lab" });
  });

  it("outputs the API base URL, the full /activity endpoint and the table name", () => {
    expect(Object.keys(api.findOutputs("*")).sort()).toEqual(["ActivityApiUrl", "ActivityEndpoint", "TableName"]);
  });
});

describe("CI deploy role", () => {
  it("is named exam-prep-lab-github-deploy and trusts only this repo's production environment", () => {
    const role = only(ci, "AWS::IAM::Role");
    expect(role.Properties.RoleName).toBe("exam-prep-lab-github-deploy");
    const statements = role.Properties.AssumeRolePolicyDocument.Statement;
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      Effect: "Allow",
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:asherShores5/Exam-Prep-Lab:environment:production",
        },
      },
    });
    expect(JSON.stringify(statements[0].Condition)).not.toMatch(/StringLike|\*/);
  });

  it("reuses the account's existing GitHub OIDC provider instead of creating a second", () => {
    ci.resourceCountIs("Custom::AWSCDKOpenIdConnectProvider", 0);
    ci.resourceCountIs("AWS::IAM::OIDCProvider", 0);
  });

  it("can only assume the CDK bootstrap roles", () => {
    const statements = only(ci, "AWS::IAM::Policy").Properties.PolicyDocument.Statement;
    expect(statements).toHaveLength(1);
    expect(statements[0].Action).toBe("sts:AssumeRole");
    expect(JSON.stringify(statements[0].Resource)).toContain(":role/cdk-hnb659fds-*");
    expect(only(ci, "AWS::IAM::Role").Properties.MaxSessionDuration).toBe(3600);
  });

  it("outputs the role ARN", () => {
    expect(Object.keys(ci.findOutputs("*"))).toEqual(["DeployRoleArn"]);
  });
});
