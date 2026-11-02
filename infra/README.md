# Exam Prep Lab infra

The Learner Activity backend (SPEC §9.2, `docs/adr/0001-small-backend-for-learner-activity.md`).
A CDK app (TypeScript) in us-west-1, account 334772842524, every resource tagged `app=exam-prep-lab`.
Site hosting stays on Amplify; this app is only the API.

## Stacks

- `ExamPrepLabApi`: HTTP API (stage `$default`, throttled 5 rps / burst 20, CORS GET/POST with
  `content-type` and `authorization` headers from `https://exampreplab.ashershores.com` and
  `http://localhost:5173`), the write-only Activity Lambda (`src/activity/handler.ts`), the
  read-only admin Lambda (`src/admin/handler.ts`), the DynamoDB table (on-demand, PITR, RETAIN,
  deletion protection, no TTL), the admin Cognito pool and the `exam-prep-lab-monthly` $1 budget
  on the `app` cost tag.
  Outputs: `ActivityApiUrl`, `ActivityEndpoint`, `TableName`, `UserPoolId`, `ClientId`, `HostedUiDomain`.
- `ExamPrepLabCi`: role `exam-prep-lab-github-deploy`, assumable only by GitHub OIDC tokens with
  `sub = repo:asherShores5/Exam-Prep-Lab:environment:production`; it can only assume the CDK
  bootstrap roles. Reuses the account's existing GitHub OIDC provider. Output: `DeployRoleArn`.


## Commands

```bash
npm ci
npm test          # validation, handler (mocked DynamoDB) and CDK assertion tests
npm run typecheck
npm run synth     # pins AWS_REGION=us-west-1
npm run deploy    # CI only, in the `production` environment
```

First deploy is by hand: `cdk deploy --all --no-execute`, review the change sets, then approve.

Known examIds come from `../quiz-app/public/exams/index.json` at synth time (`lib/exams.ts`), so
adding an exam there needs an infra deploy before its Activity is accepted.

## POST /activity

Public and unauthenticated by design (anyone can submit; throttling and caps limit the damage).
Its Lambda can only write; reads go through `GET /admin/*` below.

Request: `Content-Type: application/json`, body at most 16 KB.

```jsonc
{
  "learnerId": "3b241101-e2bb-4255-8caf-4136c566a962", // UUID (crypto.randomUUID()); stored lower-case
  "name": "Pat",                                        // trimmed, 1-40 characters, no control characters
  "activities": [                                       // 0-20 items; [] just updates the name
    { "type": "visit", "at": "2026-11-02T17:00:00.000Z" },
    { "type": "exam_opened", "at": "2026-11-02T17:00:05.000Z", "examId": "AWS-SAA-C03" },
    {
      "type": "result", "at": "2026-11-02T19:10:00.000Z",
      "examId": "AWS-SAA-C03",
      "mode": "sim",          // "quiz" | "sim"
      "correct": 50,          // integer, 0..total
      "total": 65,            // integer, 1..1000
      "percent": 76.92,       // 0..100, within 1 point of correct/total*100
      "passed": true,         // optional boolean (set for "sim", left out for "quiz")
      "timeSpentSec": 5400    // integer, 0..86400
    }
  ]
}
```

- `at` is when the Activity happened on the device: a full ISO date-time with a zone (`Z` or
  `+hh:mm`), no more than 90 days old (so the outbox should drop items older than that). Stored
  as UTC. An `at` in the future (a device clock running fast) is not rejected: it is stored as
  the server's current time.
- `examId` must be an `id` in `quiz-app/public/exams/index.json`.
- Unknown fields anywhere are rejected. One bad Activity rejects the whole batch, so the client
  checks each item against these rules before queueing or sending and drops only the bad ones.
- At most one Visit per Learner per local day is the client's job; the server stores what it gets.

Responses (all `application/json`, `Cache-Control: no-store`):

- `200 {"accepted": <number of activities>}`: written in one transaction.
- `400 {"error": "invalid", "message": "<what was wrong, e.g. activities[0].examId is not a known exam>"}`:
  nothing written. Don't retry the same batch. If it had more than one Activity, send each one
  on its own once (the web client does this) so only the bad ones are dropped; a single-Activity
  400 is dropped.
- `429` (API Gateway throttle) or `500 {"error": "internal"}`: nothing written. Safe to keep in
  the outbox and retry later.

Stored items (`PK = LEARNER#<learnerId>`):

- `SK = PROFILE`: `name`, `firstSeen` (set once), `lastSeen` (server time of the latest request).
- `SK = ACT#<at>#<random>`: the Activity's fields plus `receivedAt` (server time).

## Admin sign-in (Cognito)

- Pool `exam-prep-lab-admin`: self sign-up off, no account recovery, password at least 16
  characters, deletion protection, RETAIN. Group `admins`. The stack creates **no users**.
- Hosted UI `https://exampreplab-admin.auth.us-west-1.amazoncognito.com` (output `HostedUiDomain`;
  the prefix must be free in us-west-1 or the deploy fails, then change `HOSTED_UI_PREFIX`).
- App client `exam-prep-lab-admin-web`: public (no secret), authorization code flow with PKCE,
  scope `openid`, callback and logout URLs `https://exampreplab.ashershores.com/admin` and
  `http://localhost:5173/admin`. No direct password/SRP flows. Tokens last 1 hour; the web app
  keeps only the access token, in sessionStorage.

One-time, after the first deploy (owner, by hand):

```bash
export AWS_PROFILE=personal AWS_REGION=us-west-1
POOL=<UserPoolId output>
aws cognito-idp admin-create-user --user-pool-id "$POOL" --username asher --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username asher --permanent --password '<16+ chars>'
aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username asher --group-name admins
```

Web build env (Amplify): `VITE_ACTIVITY_API` = `ActivityApiUrl`, `VITE_COGNITO_DOMAIN` =
`HostedUiDomain`, `VITE_COGNITO_CLIENT_ID` = `ClientId`. Without all three, `/admin` says it is
not configured.

## GET /admin/*

Owner-only. Every request needs `Authorization: Bearer <Cognito access token>`.

1. API Gateway's JWT authorizer checks signature, issuer (this pool), client id and expiry.
   No or bad token: `401 {"message":"Unauthorized"}` from API Gateway; the Lambda never runs.
2. The admin Lambda then requires `token_use = access` and `admins` in `cognito:groups`.
   Otherwise `403 {"error":"forbidden"}` and nothing is read.

Its IAM role has only `dynamodb:GetItem`, `Query` and `Scan` on the table. All responses are
`application/json` with `Cache-Control: no-store`; DynamoDB failures are a bare `500 {"error":"internal"}`.

### GET /admin/learners

```jsonc
{
  "truncated": false, // true if the table needed more than 10 scan pages (1 MB each); the list is partial
  "learners": [       // most recently seen first; Learners with no PROFILE item last
    {
      "learnerId": "3b241101-e2bb-4255-8caf-4136c566a962",
      "name": "Pat",                                    // null if the PROFILE item is missing
      "firstSeen": "2026-10-01T10:00:00.000Z",          // null likewise
      "lastSeen": "2026-11-01T10:00:00.000Z",
      "exams": ["AWS-SAA-C03", "PSM-I"],                // sorted examIds from Exam Opened and Results
      "resultCount": 3,
      "latestResults": [                                 // newest Result per exam, newest first
        { "examId": "PSM-I", "at": "2026-10-05T10:00:00.000Z", "mode": "sim", "percent": 80, "passed": true }
      ]
    }
  ]
}
```

### GET /admin/learners/{id}/activity?limit=&cursor=

- `id`: the Learner UUID (any case; looked up lower-case). Not a UUID: `400`.
- `limit`: 1..200, default 100 (bigger values are capped at 200). Not a positive integer: `400`.
- `cursor`: the `nextCursor` from the previous page. A cursor for another Learner or one that
  doesn't decode: `400 {"error":"invalid","message":...}`.
- Unknown Learner (no PROFILE and no Activity): `404 {"error":"not_found"}`.

```jsonc
{
  "learner": { "learnerId": "3b24…", "name": "Pat", "firstSeen": "…", "lastSeen": "…" },
  "activities": [ // newest first; table keys (PK/SK) are never returned
    { "type": "result", "at": "…", "examId": "PSM-I", "mode": "sim", "correct": 8, "total": 10,
      "percent": 80, "passed": true, "timeSpentSec": 90, "receivedAt": "…" },
    { "type": "visit", "at": "…", "receivedAt": "…" }
  ],
  "nextCursor": null // or an opaque string: pass it as ?cursor= for older Activity
}
```
