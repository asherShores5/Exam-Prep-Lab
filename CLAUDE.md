# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Active overhaul — read SPEC.md first

`SPEC.md` (repo root) is the **source of truth for product direction and planned work**. An
overhaul is in progress. Read `SPEC.md` before planning any feature work. Progress so far:

- ✅ **Step 1 (Stabilize) done** (`SPEC.md` §8): shared Fisher-Yates (`lib/shuffle.ts`), shared
  answer scoring (`lib/answers.ts`), Review show-answer reset, single/multi-select UI, filter
  reset on exam change. `bug-conditions.test.ts` re-authored against real modules.
- ✅ **Step 2 done** (`SPEC.md` §3.1/§5.1/§5.2): **Import/Export and all frontend data editing
  are removed** — the app is fully static; questions are edited by committing JSON to
  `public/exams/`. The dual question-model system is **collapsed**: the canonical
  `Question`/`QuizSession`/`AppDataExport` types and `transformLegacy` are deleted. `LegacyQuestion`
  is the only question shape, now with a **stable integer `id`** (`scripts/assign-ids.mjs`). The
  "Data" tab is now a **"Settings"** tab.
- ✅ **Step 3 (flashcard overhaul) done** (`SPEC.md` §3.2/§3.3/§3.4): **per-question study state**
  (`QuestionStudyState`, `epl_study_state`, `services/studyState.ts`) keyed on `(examId, id)`.
  Practice-Incorrect/Known/Still-Learning/Starred are **filtered views** over study state (auto-decks
  removed); ratings + the `StarToggle` (in Flashcards, Review, Quiz review) write study state by id;
  `QuizResult.incorrectQuestionIds` feeds Practice-Incorrect; Progress mastery reads study state.
  **Deferred:** custom-deck → id migration (custom decks + `tagService` still key on the prompt string).
- ✅ **Step 4 (light/dark theme) done** (`SPEC.md` §3.7): CSS-var token system in `src/index.css`
  (gray scale + semantic tokens; the gray ramp reverses under light so existing `gray-*` classes flip
  automatically), `services/theme.ts` (system default, `.dark` class, `epl_theme`, no-FOUC script in
  `index.html`), 3-way toggle in Settings. Accent colors not yet tokenized (follow-up).
- ✅ **Step 5 (Exam Simulation) done** (`SPEC.md` §3.5): per-exam `sim` presets in `index.json`
  (`ExamIndex.sim`), `lib/examSim.ts` (`resolveSimPreset` with A.5 defaults + cap-to-bank, `isPass`),
  an "Exam Simulation" card in Quiz that runs a full-length timed attempt with a PASS/FAIL result;
  `QuizResult.passThresholdPercent` records the graded threshold.
- ✅ **Step 6 (PWA / offline) done** (`SPEC.md` §3.6): `vite-plugin-pwa` in `vite.config.ts` generates
  the service worker + `manifest.webmanifest`. App shell precached; exam banks runtime-cached
  (StaleWhileRevalidate). PWA icons live in `public/`; `src/pwa.ts` registers the SW with a prompt-to-reload
  update banner (`registerType: 'prompt'`). `dev-dist`/`dist` are gitignored.
- 🟡 **Step 7 (UX polish + keyboard nav) substantially done** (`SPEC.md` §6/§3.8): centralized toasts
  (`components/ui/toast.tsx` — `ToastProvider` wraps the app in `main.tsx`, `useToast()`; replaced the
  ad-hoc per-component toasts), loading skeletons (`components/ui/skeleton.tsx`), keyboard nav
  (`hooks/useKeyboardNav.ts` in Quiz + Review), quiz question-grid + flag-for-review, low-time warning +
  finish-confirm. **Remaining §6:** deck ergonomics, mobile 44px polish, time-per-question, spacing/type tokens.

The sections below describe the codebase **as it exists today** — accurate for understanding
current code, but check `SPEC.md` for where a given subsystem is headed.

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
npm run assign-ids        # assign stable integer ids to public/exams/*.json (idempotent)
npm run assign-ids:check  # report-only; exits non-zero if any bank is missing ids
```

Run a single test file or test:

```bash
npx vitest run src/__tests__/bug-conditions.test.ts
npx vitest run -t "SAP-C02 entry should have id"
npx vitest         # watch mode
```

Deploy outside Amplify (manual S3 sync): `pwsh ./sync_to_s3.ps1` (reads `BUCKET_NAME` / AWS creds from a `.env` file in `quiz-app/`).

## Architecture

### One question model — `LegacyQuestion`

As of step 2 there is a **single question shape**: `LegacyQuestion`
(`{ id, question, options, correctAnswers, explanation, domain? }`) — the shape of the **static
exam JSON files** in `public/exams/`. Review, Quiz, and Flashcard study flows all run on
`LegacyQuestion[]` loaded at runtime from those files. The old canonical
`Exam`/`Question`/`QuizSession`/`AppDataExport` model and `transformLegacy.ts` were **deleted** —
don't reintroduce them. Persisted records in `src/types/index.ts`: the **derived, UUID-keyed**
`Deck`, `Flashcard`, `ReviewSession`, and the **`(examId, questionId)`-keyed** `QuestionStudyState`.

**Question identity:** the stable per-question identity is the pair `(examId, id)` where `id` is
the integer assigned by `scripts/assign-ids.mjs` (see Content pipeline). **Per-question study state**
(known/unknown + stars + mastery) keys on this pair via `services/studyState.ts` (`epl_study_state`).
⚠️ **Remaining legacy gap:** custom-deck `Flashcard` records still use the prompt string as identity
(`front`, the `bankMap` lookups in `FlashcardsTab.toViewerQuestions`), and `tagService.ts` keys on
the same string. Migrating *those* to `(examId, id)` is deferred follow-up work (SPEC §3.3).

### Data loading flow

`App.tsx` is the root. On mount it fetches `/exams/index.json` (the `ExamIndex[]` list), then on exam selection fetches that exam's JSON file. Every loaded file goes through `validateExamQuestions` (`validateExam.ts`), which drops malformed records and reports a skipped count rather than throwing. Adding a new exam = drop a JSON file in `public/exams/` and add an entry to `public/exams/index.json`.

### localStorage is the only persistence — go through StorageService

There is **no backend**. All user data lives in localStorage. **Components must never call `localStorage` directly** — always use `StorageService` (`src/services/storage.ts`), which centralizes keys (`STORAGE_KEYS`, all prefixed `epl_` except two legacy keys), wraps every write in quota-error handling, and dispatches a `QUOTA_EXCEEDED_EVENT` DOM event that `App.tsx` listens for to show a warning banner. (`tagService.ts` is the one exception that touches localStorage directly, using the `epl_question_tags` key.) The service exposes the derived study-data surface: `Decks`, `Flashcards`, `ReviewSessions`, `StudyState` (`epl_study_state`), the legacy `quizAnalytics`/`selectedExam` keys, plus `getStorageUsage` / `clearAllData`.

There is **no import/export** — it was removed in step 2. The "Settings" tab (`components/settings/SettingsPanel.tsx`) only shows the storage meter and a "Clear local data" action.

### Flashcards & spaced repetition

`FlashcardsTab.tsx` is the hub. As of step 3, **Known / Still Learning / Starred are filtered VIEWS** computed over the exam bank from per-question study state (`services/studyState.ts`, `epl_study_state`) — there are no longer "auto-decks" or copied cards for these. A virtual "All Exam Questions" view (ID `__all_questions__`) streams the raw legacy bank. **Custom decks** remain as user-named `Deck` records with copied `Flashcard` content (the one place still keyed by prompt string — deferred migration). On exam load, `migrateAutoDecksForExam` folds any legacy `__known__`/`__learning__` auto-deck cards into study state once. Rating "Known" increments `masteryLevel`, "Still Learning" resets it to 0 (mirrored in `spacedRepetition.ts`, which computes due dates: 0→+1d, 1→+3d, ≥2→+3×level days). The star toggle in `FlashcardViewer` flips `QuestionStudyState.starred`.

### UI conventions

- shadcn/ui-style primitives in `src/components/ui/` (Tailwind + Radix + `cva`); `cn()` from `src/lib/utils.ts` merges classes. **Light + dark themes** (step 4): colors come from CSS-var tokens in `src/index.css` (`gray-*` scale reverses under light mode; named `background`/`foreground`/`card`/`border`/`ring` tokens for new work). Theme is managed by `services/theme.ts` (`.dark` class on `<html>`). New components should use the token-backed Tailwind classes (e.g. `bg-gray-900`, `text-foreground`) rather than hardcoded hex/`bg-[#…]` so they theme correctly.
- Feature components are grouped by area: `quiz/`, `review/`, `flashcard/`, `progress/`, `management/`, `analytics/`.
- Each top-level tab is wrapped in an `ErrorBoundary` in `App.tsx` so one mode crashing doesn't take down the app.

## Testing

Vitest + jsdom + `@testing-library/react`, with `fast-check` for property tests. Matchers are wired via `src/__tests__/setup.ts` (`@testing-library/jest-dom`). The suite is **all-green** (SPEC.md "Verified baseline"). `src/__tests__/bug-conditions.test.ts` was re-authored in §8 step 1: it now imports and exercises the **real** modules (`lib/shuffle.ts`, `lib/answers.ts`, and renders `FlashcardViewer`/`QuestionSearchPanel`) instead of inlined buggy copies, so it acts as a genuine regression guard. `question-ids.test.ts` asserts every shipped bank has unique integer ids. `preservation.test.ts` guards refactors.

## Content pipeline

Shipped exam content lives in `quiz-app/public/exams/` (one JSON file per bank, listed in `index.json`). Raw source banks are in `unsorted-data/`. The previous `scrape/` Python parsers (which converted raw dumps into the `LegacyQuestion` JSON shape) were removed and can be rebuilt as needed — see SPEC.md §4 and Appendix A for the target JSON schema.

**Stable question ids (required step).** Every question carries a stable integer `id`, unique *within its file*; the app-wide identity of a question is the pair `(examId, id)` — ids are **not** globally unique across banks, and study state / stars / metadata key on that pair (SPEC.md §5.1). Files are stored as 2-space JSON with CRLF. **After adding or editing any bank, run `npm run assign-ids`** (idempotent — it only assigns ids to questions that lack one, continuing from the file's current max, and never renumbers existing questions). `npm run assign-ids:check` is a report-only CI guard. `question-ids.test.ts` fails if any shipped bank is missing/duplicating ids.
