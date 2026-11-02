import * as path from "node:path";
import {
  CfnOutput, Duration, RemovalPolicy, Stack, type StackProps,
  aws_apigatewayv2 as apigw,
  aws_apigatewayv2_authorizers as authorizers,
  aws_apigatewayv2_integrations as integrations,
  aws_cognito as cognito,
  aws_budgets as budgets,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

export const SITE_ORIGIN = "https://exampreplab.ashershores.com";
export const DEV_ORIGIN = "http://localhost:5173";
/** SPEC §9.2: stage-wide throttle for the public write path. */
export const THROTTLE = { rateLimit: 5, burstLimit: 20 };
export const APP_TAG = "exam-prep-lab";
/** Where the hosted UI sends the owner back after sign-in and sign-out. */
export const ADMIN_REDIRECT_URLS = [`${SITE_ORIGIN}/admin`, `${DEV_ORIGIN}/admin`];
/** Hosted UI at https://<prefix>.auth.<region>.amazoncognito.com (must be unique in the region). */
export const HOSTED_UI_PREFIX = "exampreplab-admin";
export const ADMIN_GROUP = "admins";
const BUDGET_EMAIL = "asher.shores5@gmail.com";
const INFRA_ROOT = path.join(__dirname, "..");

export interface ApiStackProps extends StackProps {
  /** examIds the API accepts, from quiz-app/public/exams/index.json (see lib/exams.ts). */
  knownExamIds: string[];
}

/**
 * The Activity backend (ADR 0001): one table, one public write route, and the owner-only read
 * routes for the Admin Page (SPEC §9.3).
 *
 * - POST /activity: unauthenticated, write-only Lambda.
 * - GET /admin/*: Cognito JWT authorizer (API Gateway verifies the token), then a separate
 *   read-only Lambda that also requires an access token in the `admins` group.
 */
export class ApiStack extends Stack {
  readonly table: dynamodb.TableV2;
  readonly httpApi: apigw.HttpApi;
  readonly stage: apigw.HttpStage;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { knownExamIds } = props;

    // PK=LEARNER#<id>; SK=PROFILE (name, firstSeen, lastSeen) or ACT#<iso>#<rand> (one Activity).
    // Kept forever (no TTL), recoverable (PITR), and survives a stack delete (RETAIN).
    this.table = new dynamodb.TableV2(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const fn = new nodejs.NodejsFunction(this, "ActivityFn", {
      entry: path.join(INFRA_ROOT, "src", "activity", "handler.ts"),
      handler: "handler",
      projectRoot: INFRA_ROOT,
      depsLockFilePath: path.join(INFRA_ROOT, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      // The AWS SDK v3 is in the Node 22 runtime, so it stays out of the bundle.
      bundling: { minify: true, sourceMap: false, target: "node22" },
      environment: { TABLE_NAME: this.table.tableName, KNOWN_EXAM_IDS: knownExamIds.join(",") },
      logGroup: new logs.LogGroup(this, "ActivityLogs", { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
    });
    // Write-only: the public route can never read Learner data back.
    this.table.grant(fn, "dynamodb:PutItem", "dynamodb:UpdateItem");

    this.httpApi = new apigw.HttpApi(this, "Api", {
      apiName: "exam-prep-lab",
      corsPreflight: {
        allowOrigins: [SITE_ORIGIN, DEV_ORIGIN],
        allowMethods: [apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.GET],
        // `authorization` carries the admin access token; no cookies, so no credentials.
        allowHeaders: ["content-type", "authorization"],
        maxAge: Duration.days(1),
      },
      // Throttling lives on the stage, so the default stage is made explicitly below.
      createDefaultStage: false,
    });
    this.stage = new apigw.HttpStage(this, "DefaultStage", {
      httpApi: this.httpApi,
      stageName: "$default",
      autoDeploy: true,
      throttle: THROTTLE,
    });
    this.httpApi.addRoutes({
      path: "/activity",
      methods: [apigw.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("ActivityIntegration", fn),
    });

    // ---- Admin: one owner-created user (`asher`, added to `admins` by hand), hosted UI + PKCE ----
    const userPool = new cognito.UserPool(this, "AdminUsers", {
      userPoolName: "exam-prep-lab-admin",
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      signInCaseSensitive: false,
      passwordPolicy: { minLength: 16, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.NONE,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    new cognito.CfnUserPoolGroup(this, "AdminsGroup", {
      userPoolId: userPool.userPoolId,
      groupName: ADMIN_GROUP,
      description: "May read Learners and Activity on the Admin Page",
    });
    const domain = userPool.addDomain("HostedUi", { cognitoDomain: { domainPrefix: HOSTED_UI_PREFIX } });
    const client = userPool.addClient("AdminWeb", {
      userPoolClientName: "exam-prep-lab-admin-web",
      // Public browser client: PKCE instead of a secret.
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID],
        callbackUrls: ADMIN_REDIRECT_URLS,
        logoutUrls: ADMIN_REDIRECT_URLS,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      // The web app keeps no refresh token; one hour is Cognito's minimum.
      refreshTokenValidity: Duration.hours(1),
      enableTokenRevocation: true,
    });
    // Leaving ExplicitAuthFlows unset would let Cognito default to SRP + custom auth on this
    // client; the hosted UI needs none of them.
    (client.node.defaultChild as cognito.CfnUserPoolClient).explicitAuthFlows = ["ALLOW_REFRESH_TOKEN_AUTH"];

    const adminFn = new nodejs.NodejsFunction(this, "AdminFn", {
      entry: path.join(INFRA_ROOT, "src", "admin", "handler.ts"),
      handler: "handler",
      projectRoot: INFRA_ROOT,
      depsLockFilePath: path.join(INFRA_ROOT, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      bundling: { minify: true, sourceMap: false, target: "node22" },
      environment: { TABLE_NAME: this.table.tableName },
      logGroup: new logs.LogGroup(this, "AdminLogs", { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
    });
    // Read-only: the admin path can never change Learner data.
    this.table.grant(adminFn, "dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan");

    const authorizer = new authorizers.HttpUserPoolAuthorizer("AdminAuthorizer", userPool, {
      userPoolClients: [client],
      identitySource: ["$request.header.Authorization"],
    });
    const adminIntegration = new integrations.HttpLambdaIntegration("AdminIntegration", adminFn);
    for (const routePath of ["/admin/learners", "/admin/learners/{id}/activity"]) {
      this.httpApi.addRoutes({ path: routePath, methods: [apigw.HttpMethod.GET], integration: adminIntegration, authorizer });
    }

    new budgets.CfnBudget(this, "Budget", {
      budget: {
        // Coworker use costs cents; $1 catches a runaway (or a flood of fake Activity). Needs the
        // `app` cost allocation tag active in Billing (it is, from the other apps).
        budgetName: "exam-prep-lab-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: 1, unit: "USD" },
        costFilters: { TagKeyValue: [`user:app$${APP_TAG}`] },
      },
      notificationsWithSubscribers: [
        {
          notification: { notificationType: "ACTUAL", comparisonOperator: "GREATER_THAN", threshold: 80 },
          subscribers: [{ subscriptionType: "EMAIL", address: BUDGET_EMAIL }],
        },
        {
          notification: { notificationType: "FORECASTED", comparisonOperator: "GREATER_THAN", threshold: 100 },
          subscribers: [{ subscriptionType: "EMAIL", address: BUDGET_EMAIL }],
        },
      ],
    });

    new CfnOutput(this, "ActivityApiUrl", { value: this.stage.url, description: "API base URL (VITE_ACTIVITY_API origin)" });
    new CfnOutput(this, "ActivityEndpoint", { value: `${this.stage.url}activity`, description: "POST /activity" });
    new CfnOutput(this, "TableName", { value: this.table.tableName });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "ClientId", { value: client.userPoolClientId, description: "VITE_COGNITO_CLIENT_ID" });
    new CfnOutput(this, "HostedUiDomain", { value: domain.baseUrl(), description: "VITE_COGNITO_DOMAIN" });
  }
}
