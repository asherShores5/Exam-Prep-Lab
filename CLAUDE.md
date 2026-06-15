# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Active overhaul — read SPEC.md first

`SPEC.md` (repo root) is the **source of truth for product direction and planned work**. An
overhaul is in progress; several things this file documents as the current architecture are
being deliberately changed. Read `SPEC.md` before planning any feature work. Notably:

- **Import/Export and all frontend data editing are being removed** (`SPEC.md` §3.1). The app
  is fully static, client-side only; questions are edited by committing JSON to `public/exams/`.
- **The dual question-model system is being collapsed** (`SPEC.md` §5.1): the unused canonical
  `Question`/`QuizSession` scaffolding and `transformLegacy` hashing go away; questions get a
  stable integer `id` field in the JSON instead. Don't build on the canonical model.
- **Flashcards move to per-question study state** (`SPEC.md` §3.3, Appendix A.3) — Known/Still
  Learning/Starred become filtered views, not copied card collections.

The sections below describe the codebase **as it exists today** (pre-overhaul) — accurate for
understanding current code, but check `SPEC.md` for where a given subsystem is headed.

## Repository layout

This repo has two parts:

- **`quiz-app/`** — the React + TypeScript + Vite web app (the product). Almost all development happens here. Deployed at [exampreplab.com](https://www.exampreplab.com) via AWS Amplify (push to `main`).
- **`unsorted-data/`** — raw source question banks (from the ditectrev GitHub repos), kept as input for future content conversion. Not shipped, not part of the build.

> A `scrape/` directory of one-off Python parsers and an `assets/old/` vanilla-JS prototype previously existed but were removed. The scrape pipeline can be rebuilt as needed; shipped exam content lives in `quiz-app/public/exams/`.

## Commands

All app commands run from `quiz-app/`:

```bash
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build  (type-checks, then builds to dist/)
npm run lint     # eslint .
npm test         # vitest --run  (one-shot; CI mode)
```

Run a single test file or test:

```bash
npx vitest run src/__tests__/bug-conditions.test.ts
npx vitest run -t "SAP-C02 entry should have id"
npx vitest         # watch mode
```

Deploy outside Amplify (manual S3 sync): `pwsh ./sync_to_s3.ps1` (reads `BUCKET_NAME` / AWS creds from a `.env` file in `quiz-app/`).

## Architecture

### Two question type systems — know which one you're touching

The app has **two parallel data models**, and most bugs come from confusing them:

1. **`LegacyQuestion`** (`{ question, options, correctAnswers, explanation, domain? }`) — the shape of the **static exam JSON files** in `public/exams/`. The Review, Quiz, and Flashcard study flows all run on `LegacyQuestion[]` loaded at runtime from those files. This is the data the user actually studies.

2. **Canonical types** (`Exam`, `Question`, `Deck`, `Flashcard`, `QuizSession`, etc. in `src/types/index.ts`) — UUID-keyed records persisted in localStorage. Used for user-created/derived data: decks, flashcards, sessions, and import/export.

`transformLegacy.ts` bridges the two (`transformLegacyQuestion` / `toLegacyShape`). It assigns **deterministic IDs** via a string hash of `examId + question` and uses a `FIXED_EPOCH` timestamp, so the same legacy question always maps to the same canonical ID — don't replace this with `crypto.randomUUID()` or `Date.now()`.

Throughout the flashcard code, a question's `question` text (the prompt string) is used as its identity key (`questionKey`, `front`, the `bankMap` lookups in `FlashcardsTab.toViewerQuestions`). Tags (`tagService.ts`) key on the same prompt string.

### Data loading flow

`App.tsx` is the root. On mount it fetches `/exams/index.json` (the `ExamIndex[]` list), then on exam selection fetches that exam's JSON file. Every loaded file goes through `validateExamQuestions` (`validateExam.ts`), which drops malformed records and reports a skipped count rather than throwing. Adding a new exam = drop a JSON file in `public/exams/` and add an entry to `public/exams/index.json`.

### localStorage is the only persistence — go through StorageService

There is **no backend**. All user data lives in localStorage. **Components must never call `localStorage` directly** — always use `StorageService` (`src/services/storage.ts`), which centralizes keys (`STORAGE_KEYS`, all prefixed `epl_` except two legacy keys), wraps every write in quota-error handling, and dispatches a `QUOTA_EXCEEDED_EVENT` DOM event that `App.tsx` listens for to show a warning banner. (`tagService.ts` is the one exception that touches localStorage directly, using the `epl_question_tags` key.)

Import/export (`importExport.ts`) serializes/deserializes the full `AppDataExport` envelope (`schemaVersion` `'1.0'`). Replace-mode import auto-downloads a backup first; both modes validate records and skip invalid ones rather than failing the whole import.

### Flashcards & spaced repetition

`FlashcardsTab.tsx` is the hub. Decks are canonical `Deck` records; cards are `Flashcard` records. Two **auto-decks** per exam ("✓ Known" / "📖 Still Learning", IDs `__known__<examId>` / `__learning__<examId>`) are created lazily as the user rates cards, plus a virtual "All Exam Questions" deck (ID `__all_questions__`) that streams the raw legacy bank. `spacedRepetition.ts` computes due dates from `masteryLevel` (0→+1d, 1→+3d, ≥2→+3×level days); rating "Known" increments mastery, "Still Learning" resets it to 0.

### UI conventions

- shadcn/ui-style primitives in `src/components/ui/` (Tailwind + Radix + `cva`); `cn()` from `src/lib/utils.ts` merges classes. Dark mode is the only theme.
- Feature components are grouped by area: `quiz/`, `review/`, `flashcard/`, `progress/`, `management/`, `analytics/`.
- Each top-level tab is wrapped in an `ErrorBoundary` in `App.tsx` so one mode crashing doesn't take down the app.

## Testing

Vitest + jsdom + `@testing-library/react`, with `fast-check` for property tests. Note `src/__tests__/bug-conditions.test.ts` encodes *expected* (correct) behavior for known bugs and reads real files from `public/exams/` — a failure there means the bug is present/regressed, not that the test is broken. `preservation.test.ts` guards against regressions during refactors.

## Content pipeline

Shipped exam content lives in `quiz-app/public/exams/` (one JSON file per bank, listed in `index.json`). Raw source banks are in `unsorted-data/`. The previous `scrape/` Python parsers (which converted raw dumps into the `LegacyQuestion` JSON shape) were removed and can be rebuilt as needed — see SPEC.md §4 and Appendix A for the target JSON schema, including the planned per-question `id` field.
