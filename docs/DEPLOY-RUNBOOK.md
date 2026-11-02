# First deploy runbook (owner)

One-time steps to take the §9 work live. Run them in order, from a terminal at the repo root.
After this, infra deploys come from CI (`deploy-infra`, approved in the `production` environment)
and the site from Amplify on every merge to `main`.

## 1. GitHub first: environment and branch protection

Do this **before** merging the §9 branch to `main`. If `production` doesn't exist when the
`deploy-infra` job first runs, GitHub creates it with no reviewers.

1. Repo Settings > Environments > New environment `production`. Required reviewers: yourself.
   Deployment branches: `main` only.
2. Settings > Branches (or Rules) > protect `main`: require a pull request and the `test` and
   `infra-test` checks to pass; block force pushes and deletion.

When the merge to `main` triggers `deploy-infra`, leave it waiting (or reject it) until step 3 is
done: its OIDC role doesn't exist until the first manual deploy.

## 2. AWS login and region pin

```bash
aws login --remote --region us-west-1 --profile personal
export AWS_PROFILE=personal AWS_REGION=us-west-1 AWS_DEFAULT_REGION=us-west-1
aws sts get-caller-identity          # must show the personal account from infra/README.md
```

Check the CDK bootstrap stack and the GitHub OIDC provider exist (both are shared with your other
apps; the stack reuses the provider rather than creating one):

```bash
aws cloudformation describe-stacks --stack-name CDKToolkit --query 'Stacks[0].StackStatus'
aws iam list-open-id-connect-providers | grep token.actions.githubusercontent.com
```

If `CDKToolkit` is missing: `cd infra && npx cdk bootstrap aws://<account>/us-west-1`.

## 3. Deploy infra by hand, change sets first

```bash
cd infra
npm ci && npm test && npm run typecheck && npm run synth
npx cdk deploy --all --no-execute --require-approval never
```

In the CloudFormation console (us-west-1), open each stack's change set (`ExamPrepLabApi`,
`ExamPrepLabCi`). On a first deploy every row should be `Add`; stop if anything says `Replacement`
or touches a resource you don't recognise. Then delete those change sets and deploy:

```bash
npx cdk deploy --all
```

If it fails on the Cognito domain, the `exampreplab-admin` prefix is taken: change
`HOSTED_UI_PREFIX` in `infra/lib/api-stack.ts` and the matching domain in `customHttp.yml`.

Save the outputs:

```bash
aws cloudformation describe-stacks --stack-name ExamPrepLabApi \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output text
```

## 4. Create the admin user

```bash
POOL=<UserPoolId output>
aws cognito-idp admin-create-user --user-pool-id "$POOL" --username asher --message-action SUPPRESS
read -rs PW            # type a 16+ character password, then Enter (not echoed)
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username asher --permanent --password "$PW"
unset PW
aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username asher --group-name admins
```

## 5. Amplify env vars and redeploy

Amplify console > the app > Hosting > Environment variables, for the `main` branch:

```
VITE_ACTIVITY_API        = ActivityApiUrl output
VITE_COGNITO_DOMAIN      = HostedUiDomain output
VITE_COGNITO_CLIENT_ID   = ClientId output
```

Then redeploy `main` (vars are baked in at build time). While you're in the console, remove the
stale redirect rule for `exampreplab.com` (Hosting > Rewrites and redirects).

## 6. Pin the API host in the CSP

`customHttp.yml` (repo root) allows `https://*.execute-api.us-west-1.amazonaws.com` in
`connect-src` because the API host wasn't known before the first deploy. Replace that wildcard
with the real host from the `ActivityApiUrl` output (scheme + host only, e.g.
`https://abc123.execute-api.us-west-1.amazonaws.com`) and update the matching expectation in
`quiz-app/src/__tests__/securityHeaders.test.ts`. Run `cd quiz-app && npm test`, merge via a PR
and let Amplify redeploy.

## 7. Live checks

```bash
SITE=https://exampreplab.ashershores.com
API=<ActivityApiUrl output, no trailing slash>

# Headers: expect content-security-policy, strict-transport-security, x-content-type-options,
# referrer-policy, permissions-policy, cross-origin-opener-policy
curl -sI "$SITE/" | grep -iE 'content-security|strict-transport|x-content-type|referrer|permissions|cross-origin'

# Valid write: expect 200 {"accepted":0}. This creates a Learner named "deploy-check".
curl -s -w ' %{http_code}\n' -X POST "$API/activity" -H 'content-type: application/json' \
  -d '{"learnerId":"00000000-0000-4000-8000-000000000001","name":"deploy-check","activities":[]}'

# Invalid write: expect 400 {"error":"invalid",...}
curl -s -w ' %{http_code}\n' -X POST "$API/activity" -H 'content-type: application/json' -d '{}'

# Anonymous admin read: expect 401
curl -s -o /dev/null -w '%{http_code}\n' "$API/admin/learners"
```

Then in a browser: open the site, enter a name, open an Exam (no CSP errors in the console); open
`$SITE/admin`, sign in, and check your Learner and its Visit appear.

## 8. Hand over to CI

Approve the waiting `deploy-infra` run (or re-run it) in GitHub Actions. It should finish with no
changes. From now on, merging to `main` deploys the site, and infra after your approval.
