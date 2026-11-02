# Exam Prep Lab

A personal study tool for certification exams, shared with a few coworkers. Pick an Exam, then
study its question Bank in Review, Quiz, Flashcards or a full-length Exam Simulation. Study
progress stays in your browser; the site only records light usage (who visited, which Exams they
opened, quiz results) so the owner can see whether it is being used.

Live: <https://exampreplab.ashershores.com>

## Repo layout

```
quiz-app/        React + TypeScript + Vite web app (the site). Exam Banks live in public/exams/.
infra/           CDK app for the small Activity API and the owner's Admin Page sign-in.
scrape/          Offline Python scripts that turn raw question dumps into Bank JSON.
unsorted-data/   Raw source Banks for future conversion (not shipped). udemy/ is local-only and gitignored.
docs/            ADRs (docs/adr/) and the first-deploy runbook (docs/DEPLOY-RUNBOOK.md).
SPEC.md          Product direction and work log. GLOSSARY.md defines the domain words.
```

## Commands

Node 22. Web app, from `quiz-app/`:

```bash
npm ci
npm run dev                # Vite dev server at http://localhost:5173
npm test                   # Vitest, one shot
npm run lint
npm run build              # type-check, then build to dist/ (includes the service worker)
npm run assign-ids:check   # fails if any Bank has Questions without a stable id
```

Infra, from `infra/` (`synth` and `deploy` pin `AWS_REGION=us-west-1` themselves):

```bash
npm ci
npm test
npm run typecheck
npm run synth
```

## Adding an exam Bank

1. Add `quiz-app/public/exams/<EXAM-ID>.json`: an array of
   `{ "question", "options", "correctAnswers", "explanation", "domain"? }` (schema in SPEC.md Appendix A).
2. Add an entry to `quiz-app/public/exams/index.json` (`id`, `name`, `path`, optional `sim` preset).
3. Run `npm run assign-ids` in `quiz-app/` to give every Question a stable id, then commit.
4. The Activity API only accepts Exam ids it knew about at deploy time, so a new Exam also needs an
   infra deploy (the CI `deploy-infra` job) before its Activity is recorded. Studying works
   either way.

## Deploys

- **Site:** AWS Amplify builds `quiz-app/` and publishes it on every merge to `main`. Response
  headers (CSP, HSTS and friends) come from `customHttp.yml` at the repo root.
- **Infra:** the `deploy-infra` job in `.github/workflows/ci.yml` runs on push to `main` after the
  tests pass. It waits in the GitHub `production` environment for the owner's approval, then
  deploys through a GitHub OIDC role (no stored AWS keys).
- First-time setup is in [docs/DEPLOY-RUNBOOK.md](docs/DEPLOY-RUNBOOK.md).

## Environment variables

Set in the Amplify build (values come from the infra stack outputs). All are optional: without
them the site still works, it just records no Activity and `/admin` says it is not configured.

```
VITE_ACTIVITY_API        Activity API base URL       (output ActivityApiUrl)
VITE_COGNITO_DOMAIN      Admin sign-in domain         (output HostedUiDomain)
VITE_COGNITO_CLIENT_ID   Admin sign-in app client id  (output ClientId)
```

## License

Apache 2.0, see [LICENSE](LICENSE).
