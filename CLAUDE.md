# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

`SPEC.md` is the source of truth for product direction and the work log; read it before planning
feature work. Domain words (Exam, Bank, Question, Study State, Deck, Quiz, Exam Simulation, Learner,
Activity, Result, Admin Page) are defined in `GLOSSARY.md`; use them in code, docs and commits.

- SPEC §8 steps 1-7 and step 9 (§9, 2026-11) have landed: stable Question ids, Import/Export
  removed, per-question Study State, light/dark theme, Exam Simulation, PWA, UX polish, then the
  Learner gate, Activity recording with an outbox, the `infra/` Activity API, the Admin Page,
  audit bugs B1-B11 fixed test-first, `customHttp.yml` security headers, CI and Dependabot.
- Owner-only steps still open after §9 (the code is done): the first infra deploy, the Cognito
  admin user, the three Amplify env vars, branch protection and the `production` environment,
  removing the stale Amplify redirect rule, and the live header/401 checks. Runbook:
  `docs/DEPLOY-RUNBOOK.md`.
- Open follow-ups, none blocking: custom Decks and `tagService.ts` still key on the prompt string
  (migrate to `(examId, id)`, SPEC §3.3 / Appendix A.3); §6 polish (Deck ergonomics, 44px targets,
  time-per-question, spacing/type tokens, accent-color tokens); §4 domain backfill and converting
  more Banks from `unsorted-data/`.

Working style: one step at a time, propose before editing, keep tests, lint and build green, and
update SPEC.md and this section when a step lands.

## Repository layout

- **`quiz-app/`**: the React + TypeScript + Vite web app. Live at https://exampreplab.ashershores.com
  via AWS Amplify, which builds on every merge to `main`.
- **`infra/`**: CDK app (us-west-1) for the Activity API, its DynamoDB table and the admin Cognito
  pool. Contract and stacks in `infra/README.md`; reasons in `docs/adr/0001-small-backend-for-learner-activity.md`.
- **`customHttp.yml`**: Amplify response headers (CSP, HSTS, etc.).
- **`scrape/`**: offline Python scripts that convert raw dumps into Bank JSON. Not part of the build.
- **`unsorted-data/`**: raw source Banks for future conversion. `unsorted-data/udemy/` is local-only
  (gitignored).
- **`.github/workflows/ci.yml`**: app tests/lint/build/assign-ids check, infra tests/typecheck/synth,
  and the `deploy-infra` job (push to `main`, gated by the `production` environment, OIDC role).

## Commands

Web app, from `quiz-app/`:

```bash
npm run dev               # Vite dev server (http://localhost:5173; Admin Page at /admin)
npm run build             # tsc -b && vite build
npm run lint              # 0 errors, 2 known warnings
npm test                  # vitest --run
npm run assign-ids        # assign stable ids to public/exams/*.json (idempotent)
npm run assign-ids:check  # CI guard; non-zero if any Bank needs ids or reformatting
npx vitest run src/__tests__/studyState.test.ts   # one file
npx vitest run -t "name of a test"                # one test
```

Infra, from `infra/`. The dev desktop defaults to us-west-2, so any `cdk` command must pin the region:

```bash
npm test && npm run typecheck
npm run synth                                     # script pins AWS_REGION=us-west-1
AWS_REGION=us-west-1 AWS_DEFAULT_REGION=us-west-1 npx cdk diff    # needs AWS creds
```

`npm run deploy` is for CI only.

## Architecture

### One question model: `LegacyQuestion`

There is a **single question shape**: `LegacyQuestion` (`{ id, question, options, correctAnswers,
explanation, domain? }`), the shape of the static Bank files in `public/exams/`. Review, Quiz and
Flashcards all run on `LegacyQuestion[]` loaded at runtime. The old canonical
`Exam`/`Question`/`QuizSession`/`AppDataExport` model and `transformLegacy.ts` were deleted on
purpose. Persisted records in `src/types/index.ts`: the UUID-keyed `Deck`, `Flashcard`,
`ReviewSession`, and the `(examId, questionId)`-keyed `QuestionStudyState`.

**Question identity** is the pair `(examId, id)`, where `id` comes from `scripts/assign-ids.mjs`.
Study State (known/still-learning + stars + mastery) keys on it via `services/studyState.ts`
(`epl_study_state`). Remaining gap: custom-deck `Flashcard` records (`front`, the `bankMap`
lookups in `FlashcardsTab.toViewerQuestions`) and `tagService.ts` still key on the prompt string.

### Entry and data loading

`main.tsx` renders the Admin Page for `/admin` (`lib/route.ts`), loaded with `React.lazy` as its
own chunk so Learners never download it and it records no Activity. Every other path renders
`App` inside `ToastProvider` and the **Learner gate** (`components/learner/LearnerGate.tsx`): a
one-time name screen that creates `epl_learner` (`services/learner.ts`); if storage is blocked
the Learner lives in memory and studying still works.

`App.tsx` fetches `/exams/index.json`, then the selected Exam's Bank. Every Bank goes through
`validateExamQuestions` (`validateExam.ts`), which drops malformed records (including bad
`correctAnswers` and non-string options) and reports a skipped count. Exam switches clear the
questions and ignore stale responses; the exam picker is disabled while a Quiz runs, and the Quiz
tab stays mounted (`forceMount` + `hidden`) so switching tabs keeps it.

### Activity recording and the outbox

`services/activity.ts` records Visit (once per local day), Exam Opened and Result to
`POST /activity` (contract in `infra/README.md`). Every Activity is queued in
`epl_activity_outbox` (cap 200, oldest dropped, items older than 90 days dropped) and sent in
batches of 20; the outbox flushes on load and on `online`. Each item is checked against the API's
rules (`isValidActivity`) before it is queued or sent, so bad items are dropped alone. A 400 on a
multi-item batch retries each item once and drops only the ones that 400 again; network errors,
429 and 5xx keep items for retry. `activityContract.test.ts` keeps the client limits in step with
`infra/src/activity/validate.ts`. Recording never throws and never blocks studying. With
`VITE_ACTIVITY_API` unset it is a no-op.

### localStorage: always through StorageService

Study data lives only in localStorage. **Every read and write goes through `StorageService`**
(`src/services/storage.ts`), which centralizes keys (`STORAGE_KEYS`,
`epl_` prefix except two legacy keys), wraps writes in quota-error handling and dispatches
`QUOTA_EXCEEDED_EVENT` for `App.tsx`'s warning banner. Readers shape-check stored JSON and fall
back to the default, and drop array/object entries of the wrong shape. The theme preference
(`services/theme.ts`, `epl_theme`) is read before React mounts and is the one direct caller. `clearAllData` (Settings, "Clear local data") keeps the Learner, the outbox
and the last-Visit day. There is no import/export.

### Flashcards & spaced repetition

`FlashcardsTab.tsx` is the hub. Known / Still Learning / Starred / Practice Incorrect are
**filtered views** over Study State, not stored Decks. A virtual "All Exam Questions" view
(`__all_questions__`) streams the Bank. Custom Decks are user-named `Deck` records with copied
`Flashcard` content. On exam load, `migrateAutoDecksForExam` folds legacy `__known__`/`__learning__`
cards into Study State once, only after the loaded Bank matches the Exam. Rating "Known"
increments `masteryLevel`, "Still Learning" resets it to 0 (`spacedRepetition.ts`: 0→+1d, 1→+3d,
≥2→+3×level days).

### Quiz timer

Remaining time is computed from a deadline timestamp (`lib/quizTimer.ts`), not by counting
interval ticks, so background-tab throttling doesn't skew it; `timeSpent` is per attempt.

### PWA and security headers

`vite-plugin-pwa` precaches the app shell; Banks use the NetworkFirst runtime cache in
`lib/examBankCaching.ts` (only 200 JSON responses are cached). `customHttp.yml` carries the CSP
with a sha256 hash of the inline theme script in `index.html`: editing that script makes
`securityHeaders.test.ts` fail and print the new hash.

### UI conventions

- shadcn/ui-style primitives in `src/components/ui/` (Tailwind + Radix + `cva`); `cn()` from
  `src/lib/utils.ts`. Colors come from CSS-var tokens in `src/index.css` (the `gray-*` ramp
  reverses under light mode; `background`/`foreground`/`card`/`border`/`ring` for new work), so
  use token-backed classes rather than hardcoded hex. Theme: `services/theme.ts`.
- Feature components by area: `quiz/`, `review/`, `flashcard/`, `progress/`, `settings/`,
  `analytics/`, `learner/`, shared `ui/`; the Admin Page in `src/admin/`.
- Each top-level tab is wrapped in an `ErrorBoundary` in `App.tsx`.

## Testing

Vitest + jsdom + `@testing-library/react`, with `fast-check` for property tests; matchers in
`src/__tests__/setup.ts`. Baseline 2026-11-02: quiz-app **213 tests / 18 files**, infra **110
tests / 5 files**, all green. Each bug fix lands with a failing test first. Tests exercise the
real modules; never test private copies of logic inlined into a test file.

Gotcha: components that call `useToast()` (FlashcardViewer, QuestionSearchPanel, QuizMode) must
render inside a `ToastProvider` in tests, or they throw.

## Content pipeline

Banks live in `quiz-app/public/exams/` (one JSON file each, listed in `index.json`; schema in SPEC
Appendix A). Raw sources are in `unsorted-data/`; `scrape/` holds the converters.

**Stable question ids (required).** Every Question has an integer `id`, unique within its file;
ids are not unique across Banks. Files are 2-space JSON with CRLF. **After adding or editing a
Bank, run `npm run assign-ids`** (assigns ids only to Questions lacking one, never renumbers).
`question-ids.test.ts` fails on missing or duplicate ids.

**New Exam = infra deploy.** The Activity API learns valid examIds from `index.json` at synth
time (`infra/lib/exams.ts`), so a new Exam's Activity is rejected (400) until infra is redeployed.
