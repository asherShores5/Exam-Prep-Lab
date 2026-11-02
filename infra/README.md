# Exam Prep Lab infra

The Learner Activity backend (SPEC §9.2, `docs/adr/0001-small-backend-for-learner-activity.md`).
A CDK app (TypeScript) in us-west-1, account 334772842524, every resource tagged `app=exam-prep-lab`.
Site hosting stays on Amplify; this app is only the API.

## Stacks

- `ExamPrepLabApi`: HTTP API (stage `$default`, throttled 5 rps / burst 20, CORS
  `https://exampreplab.ashershores.com` and `http://localhost:5173`), one Node 22 Lambda
  (`src/activity/handler.ts`), the DynamoDB table (on-demand, PITR, RETAIN, deletion protection,
  no TTL) and the `exam-prep-lab-monthly` $1 budget on the `app` cost tag.
  Outputs: `ActivityApiUrl`, `ActivityEndpoint`, `TableName`.
- `ExamPrepLabCi`: role `exam-prep-lab-github-deploy`, assumable only by GitHub OIDC tokens with
  `sub = repo:asherShores5/Exam-Prep-Lab:environment:production`; it can only assume the CDK
  bootstrap roles. Reuses the account's existing GitHub OIDC provider. Output: `DeployRoleArn`.

Ticket 10 adds Cognito, a read-only admin Lambda and `GET /admin/*` routes with a JWT authorizer
to `ExamPrepLabApi` (see the comment on `ApiStack`).

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
There is no read path on this API.

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
  `+hh:mm`), no more than 5 minutes in the future and no more than 90 days old (so the outbox
  should drop items older than that). Stored as UTC.
- `examId` must be an `id` in `quiz-app/public/exams/index.json`.
- Unknown fields anywhere are rejected. One bad Activity rejects the whole batch.
- At most one Visit per Learner per local day is the client's job; the server stores what it gets.

Responses (all `application/json`, `Cache-Control: no-store`):

- `200 {"accepted": <number of activities>}`: written in one transaction.
- `400 {"error": "invalid", "message": "<what was wrong, e.g. activities[0].examId is not a known exam>"}`:
  nothing written. Don't retry; drop the batch.
- `429` (API Gateway throttle) or `500 {"error": "internal"}`: nothing written. Safe to keep in
  the outbox and retry later.

Stored items (`PK = LEARNER#<learnerId>`):

- `SK = PROFILE`: `name`, `firstSeen` (set once), `lastSeen` (server time of the latest request).
- `SK = ACT#<at>#<random>`: the Activity's fields plus `receivedAt` (server time).
