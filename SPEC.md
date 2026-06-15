# Exam Prep Lab — Overhaul Spec Sheet

> Guiding documentation for the planned improvements and overhaul of the Exam Prep Lab
> web app (`quiz-app/`). Grounded in the code as of this writing — see `CLAUDE.md` for the
> architecture primer.

## Product principles (decided)

These constraints frame every decision below. They are settled, not open questions.

- **Fully static, client-side only.** No backend, no accounts, no cloud sync. Hosted as
  static files (S3/Amplify) serving content from the repo. Cheap and simple is the point.
- **Content lives in the repo.** Questions are added/edited by committing JSON files under
  `public/exams/` — the repo *is* the "backend." There is **no frontend tooling to create
  or edit questions**, and there won't be.
- **User data is local-only.** Progress, decks, stars, and study state live in
  `localStorage`. Losing it (clearing browser data) is acceptable; we optimize for a clean
  single-device experience, not durability.
- **Good UI/UX is the differentiator.** Within a static, local-only app, polish and
  thoughtful flows are where we invest.
- **No substantial new architecture.** Anything requiring a server, build-time data
  processing service, or multi-device infrastructure is out of scope.

**Legend:** 🟢 shipped · 🟡 partial / has issues · 🔴 not built · **P0** critical · **P1** high · **P2** nice-to-have

## Verified baseline (start here)

Toolchain confirmed working: Node v26.x, npm 11.x. `npm install` and `npm run build` succeed.

`npm test` shows **5 failing + 6 passing — this is the expected, known-good baseline.** The 5
failures are in `src/__tests__/bug-conditions.test.ts`, which encodes the *correct* behavior
for known bugs and is **designed to fail until each bug is fixed**. They are pre-existing, not
regressions:
- **Bug 2** — mutating `.sort()` in `QuizMode.calculateScore` (see §2 "biased/mutating sort")
- **Bug 3** — hardcoded `deckId: 'legacy'` in `FlashcardViewer.saveSession`
- **Bug 4** — shuffle no-op in deck review
- **Bug 5** — global duplicate check prevents adding a question to a second deck

If you change code and a *different* test fails — or one of these flips unexpectedly — that's a
real regression. `npm run lint` reports 2 errors + 2 warnings (mostly in test files and a unused
`_examId` param); pre-existing, safe to clean up opportunistically.

---

## 1. Current Features (baseline)

| Area | Status | Notes |
|---|---|---|
| Exam selection from static JSON index | 🟢 | `public/exams/index.json` → per-exam JSON, validated on load (`validateExam.ts`) |
| **Review Mode** | 🟢 | Step through questions, reveal answers, shuffle |
| **Quiz Mode** | 🟢 | Configurable count/time, domain + tag filters, timer, scoring, per-domain breakdown, post-quiz review, "save incorrect to deck" |
| **Flashcards Mode** | 🟡 | Decks, auto-decks, virtual "All Questions" deck, search-to-build, classic + MC modes, spaced-repetition, swipe — but persistence & identity are buggy (§2, §3) |
| **Progress Dashboard** | 🟢 | Quiz history, score trends, review history, domain accuracy, flashcard mastery, clear-progress |
| **Data (Import/Export)** | ❌ **being removed** | See §3.1 |
| Responsive + mobile nav, dark-mode | 🟢 | |
| localStorage persistence + quota warnings | 🟢 | All writes via `StorageService` |
| Error boundaries per tab | 🟢 | |

---

## 2. Bugs & Correctness Issues

Note: removing all frontend data editing (§3.1) **eliminates the class of data-integrity
bugs** that came from user-created/edited records. What remains is matching/identity and
behavioral correctness.

### P0
- **🔴 Question identity must become a stable ID.** Flashcards, stars, tags, and study state
  all need to key on a stable per-question ID, not the prompt string (today `front` /
  `question.question` is the key, which collides across exams and breaks if a prompt is
  edited in the repo). See §5.1 — this is now a **required** foundation, not optional.
- **🟡 Quiz UI doesn't distinguish single- vs multi-select.** Always a toggle; users can
  over-select on single-answer questions and silently fail exact-set scoring. **Fix:** radios
  for single, checkboxes for multi, with "Select N" hints.

### P1
- **🟡 Biased shuffle.** `App.tsx` and `QuizMode` use `sort(() => Math.random() - 0.5)`.
  A correct Fisher-Yates already exists in `FlashcardViewer`. **Fix:** one shared util.
- **🟡 Review Mode "Show Answer" leaks on Previous.** Resets on Next but not Previous.
- **🟡 Domain features are dark for most exams.** Depend on a `domain` field most JSON lacks.
  **Fix:** hide the affordance when no exam has domains; structure for domains now (§4).

### P2
- **🟡 `selectedTags` filter persists across exam switches** in QuizMode — reset on exam change.
- **🟡 `Array(questionCount).fill([])`** shares one array reference — prefer `Array.from`.

### Accepted (won't fix)
- **Quiz/exam-sim sessions are lost if interrupted (refresh/navigation).** Per your
  direction, this is acceptable — quizzes are meant to be completed in one sitting. No
  session-resume work for quiz mode. (Flashcard *progress*, by contrast, must persist — §3.3.)

---

## 3. Intended / Net-New Features

### 3.1 Remove Import/Export & all data editing  🔴 **P0**
- Delete the **Import/Export** functionality (`importExport.ts`, `ImportExportPanel.tsx`)
  and the dead question/deck/flashcard editing components (§5.2).
- The **"Data" tab becomes a "Settings" tab** containing: **theme toggle** (§3.7), the
  **storage-usage meter**, and **"Clear local data"** (with confirmation). No JSON
  import/export, no question editors.
- This is the move that "fixes data integrity": the only writable data is derived study
  state (stars, known/unknown, decks), never the questions themselves.

### 3.2 Practice-Incorrect-Only deck  🔴 **P0 (must)**
- A built-in, always-available deck/quick-start that collects questions the user has
  answered incorrectly (from quiz attempts) and/or marked "still learning."
- Surfaces as a one-click "Practice what you missed" entry in both Flashcards and Quiz.
- Backed by the per-question study state (§3.3), not a copied card set.

### 3.3 Flashcard overhaul: per-question study state  🔴 **P0 (must)**
This is the core of the flashcard rework. **Decided model: per-question study state.**

- Each question (by stable ID, scoped to its exam) carries a single **study state**:
  `unrated` → `still-learning` → `known`, plus a **starred** flag (§3.4).
- **"Known" and "Still Learning" are filtered views** over this state — not separate copied
  card collections. This kills the current card-duplication and prompt-string-matching mess.
- **Custom decks remain** as optional, user-named collections of questions (by ID) for users
  who want topic-specific grouping — but the primary, zero-effort path is known/unknown
  mastery tracking so a user can gauge subject mastery without managing decks.
- **Persistence fixed:** study state and ratings survive refreshes and exam switches
  reliably (today auto-deck state and matching are buggy).
- Mastery % and "cards reviewed" in the Progress dashboard read from this single source.

### 3.4 Star / bookmark questions  🔴 **P0 (must)**
- Any question can be starred from Review, Quiz review, and Flashcards.
- Starred questions are a filterable view and a quick-start source (study/quiz your starred).
- Stored as a flag on per-question study state (§3.3), keyed by stable ID.

### 3.5 Exam Simulation mode  🔴 **P0 (must)**
- A variant of Quiz Mode configured for realistic exam conditions: full-length question
  count, real time limit, pass/fail threshold, and **no mid-quiz answer reveal**.
- Presented as a mode/preset within Quiz (not a separate architecture). **Per-exam sim
  presets (count / time / pass threshold) live in `index.json`** alongside each exam bank's
  entry, so each exam simulates under its own realistic conditions. The app falls back to
  sensible defaults when a preset is absent.
- Subject to the "sessions lost if interrupted" acceptance (§2).

### 3.6 PWA / offline support  🔴 **P0 (must)**
- Service worker + web manifest so the app is installable and works offline. Static content +
  localStorage makes this a natural fit.
- Cache the app shell and exam JSON; offline study with local progress.
- **Note:** `quiz-app/favicon_io/site.webmanifest` exists but is unconfigured (empty `name`/
  `short_name`, default white theme color). It needs real values and wiring into `index.html`.
  Consider `vite-plugin-pwa` for the service worker + manifest generation.

### 3.7 Light + dark theme  🔴 **P1 (must)**
- Add a light theme alongside the current dark-only design; toggle lives in Settings (§3.1).
  Default to system preference. Requires a small design-token pass so colors aren't hardcoded.

### 3.8 Optional, low-cost niceties  🟡 **P2**
- **Minimal keyboard navigation** (number keys to select, arrows to move, space to reveal).
  Optional — implement where cheap, don't over-invest.
- "Due today" view across decks using the existing `spacedRepetition` service.

---

## 4. Content & Domain Metadata (structure now, populate later)

- **Structure the app to consume domain / metadata now; populate the data later.** The exam
  JSON and `Question` shape should cleanly support an optional `domain` (and room for other
  metadata) per question, and all domain-dependent features (filter, breakdown, focus areas,
  weighted exam sim) should "just work" when the data is present and gracefully hide when not.
- **Backfilling domains across all exam banks is a heavy, deferred task.** It requires manually
  (or semi-automatically) tagging every question. **Not now.** When tackled, it should be done
  by assigning **batches of questions to dedicated subagents** so no single context has to chew
  through an entire bank — explicitly a "future day" job, scoped separately.
- **More exam banks:** `unsorted-data/` holds ~25 additional banks (AWS, Azure, GCP, Scrum,
  ITIL, PRINCE2) not yet converted/wired in; only 6 ship today. Converting more is content
  work, low-architecture.
- **Scrape pipeline** (`scrape/`) stays an offline, developer-only step that emits the exam
  JSON committed to `public/exams/`. Worth tidying (§7) but not part of the app.
- **Exam index** could populate `description`/`code`/`version` (already supported by
  `ExamIndex`) and exam-sim defaults (count/time/threshold) for richer labels and presets.

---

## 5. Architecture & Technical Debt

### 5.1 Resolve the two-model problem → stable IDs, single shape  🔴 **P0**
The app currently has two parallel question models: `LegacyQuestion` (what all study flows
actually use) and an unused canonical `Question`/`QuizSession` model wired only into the
import/export plumbing.

**Decision (settled by this overhaul):**
- **Remove the import/export-only canonical scaffolding** that exists solely to serve
  export envelopes (`QuizSession` export collections, the parts of `StorageService` and
  `transformLegacy` that only feed import/export). The `simpleHash` approach is dropped — a
  hash is unnecessary.
- **Add an explicit `id` field to each question in the exam JSON.** A one-off script assigns
  a simple sequential number per exam bank to the existing well-formatted exams; **new
  questions and new banks follow the same convention** (a documented step in the content
  pipeline). The ID is part of the committed source of truth and is stable across prompt edits.
- Per-question study state (§3.3), stars (§3.4), and future per-question metadata key on this
  `id` (scoped to its exam). All client-side study records reference it.
- Net result: **one question shape** loaded from static JSON, with a stable `id`, and a small
  set of **derived, ID-keyed local records** (study state, stars, decks, quiz history).

### 5.2 Dead code to remove  🔴 **P1**
Imported nowhere (confirmed by grep; also noted in `CHANGES.md`):
- `components/management/QuestionForm.tsx`, `QuestionList.tsx`
- `components/flashcard/FlashcardForm.tsx`, `DeckForm.tsx`, `DeckList.tsx`

Plus, after §3.1 / §5.1: `services/importExport.ts`, `ImportExportPanel.tsx`, and the
import/export-only canonical methods on `StorageService` / `transformLegacy.ts` (keep only
what's needed for stable IDs).

### 5.3 Other tech debt
- **🟡 Duplicated logic.** Score-trend chart, `formatTime`, analytics aggregation are
  reimplemented in `AnalyticsDisplay` and `ProgressDashboard`. Extract shared util/components.
- **🟡 Shuffle util duplicated** (§2) — one Fisher-Yates helper in `lib/`.
- **🟡 No test setup file.** `vitest.config.ts` has empty `setupFiles`; add one wiring
  `@testing-library/jest-dom` matchers.
- **🟡 Thin coverage.** Only `bug-conditions` + `preservation` suites; add component tests for
  the study flows, especially the new per-question study state.
- **🟡 ESLint not type-aware** (documented in `quiz-app/README.md`, not enabled).

---

## 6. UI / UX Improvements

### P1
- **Accessible answer options.** Quiz/Review options are clickable `<div>`s with no `role` /
  `tabIndex` / keyboard handler. Make them proper buttons/radios/checkboxes (the flashcard
  MC card already does this correctly — use it as the pattern). Pairs with single/multi fix (§2).
- **Quiz navigation.** Question-grid / jump-to-question + "flag for review"; today it's
  strictly linear Previous/Next.
- **Loading & empty states.** Replace bare "Loading questions…" with skeletons and friendlier
  empty states.

### P2
- **Timer UX.** Low-time warning, confirmation before auto-submit on timeout.
- **Results richness.** Pass/fail vs threshold (feeds exam sim §3.5), time-per-question,
  clearer your-answer-vs-correct diff.
- **Deck ergonomics.** Deck detail view, bulk add/remove, card preview.
- **Mobile polish.** 44px targets everywhere; verify swipe-vs-scroll in flashcards.
- **Consistent toasts.** Centralize the ad-hoc per-component `setTimeout` toasts.
- **Design tokens.** Spacing/typography pass alongside the theme work (§3.7).

---

## 7. Repo Cleanup

- **🟡 Remove committed scrape artifacts** (`scrape/out.json`, `merged_questions.json`,
  `input.*`, `parsed_udemy_multiple_answers.json`) — regenerable intermediates. Keep raw
  inputs out of version control.
- **🟡 `assets/old/`** — legacy vanilla-JS prototype; archive or delete.
- **🟡 `unsorted-data/`** — pipeline input, not app code; formalize as the content source or relocate.
- **🟡 Delete dead components & import/export** (§5.2).
- **🟡 Root `README.md` is stale** — describes a `QuizApp.tsx` structure and Amplify-CLI setup
  that no longer match the current `src/` layout or `sync_to_s3.ps1`. Rewrite, and drop the
  import/export and data-management language.
- **🟡 `CHANGES.md`** — fold into this spec or a proper CHANGELOG and retire.

---

## 8. Suggested Sequencing

1. **Stabilize (low-risk bug fixes):** shared Fisher-Yates shuffle, Review show-answer reset,
   single/multi-select UI + scoring, reset filters on exam change. Add component tests as you go.
2. **Remove import/export & data editing (§3.1, §5.2)** and **introduce stable question IDs
   (§5.1).** This is the foundation everything else keys on; do it early.
3. **Flashcard overhaul → per-question study state (§3.3)**, then **stars (§3.4)** and
   **practice-incorrect (§3.2)** which build directly on it.
4. **Settings tab + light/dark theme (§3.1, §3.7).**
5. **Exam simulation mode (§3.5).**
6. **PWA / offline (§3.6).**
7. **UX polish (§6)** and optional keyboard nav (§3.8).
8. **Later / separate:** domain metadata backfill via batched subagents (§4); convert more
   exam banks.

---

## Appendix A — Implementation Context (data schemas)

Concrete shapes for the foundational tasks (steps 2–5). These are the contracts the rest of
the overhaul keys on. Field names are normative; structure them this way so features compose.

### A.1 Exam question JSON (`public/exams/<EXAM>.json`)

Today each file is a flat array of `LegacyQuestion`. Add a stable `id` and reserve optional
metadata fields. **Backward compatible:** existing fields are unchanged; `id` is added by the
ID script (A.4); `domain`/`tags` stay optional and absent until backfilled (§4).

```jsonc
[
  {
    "id": 1,                       // NEW — sequential integer, unique within this exam file, stable
    "question": "string",          // prompt text (unchanged)
    "options": ["string", "..."],  // unchanged
    "correctAnswers": [0],         // indices into options; 1 entry = single, 2+ = multi
    "explanation": "string",       // unchanged; may be ""
    "domain": "string",            // OPTIONAL — populated later (§4); omit if unknown
    "tags": ["string"]             // OPTIONAL — reserved for future metadata; omit if unused
  }
]
```

Rules:
- `id` is unique **within the exam file**. The app-wide identity of a question is the pair
  `(examId, id)` — IDs are NOT globally unique across banks.
- `id` is permanent once assigned. New questions appended to a bank take the next unused
  integer; never renumber existing questions (that would orphan local study state).
- Single- vs multi-select is derived from `correctAnswers.length` (drives the §2 UI fix).

### A.2 Exam index with sim presets (`public/exams/index.json`)

Extend each index entry with an optional `sim` preset and the already-supported descriptive
fields. Missing `sim` → app uses defaults in A.5.

```jsonc
[
  {
    "id": "AWS-SAA-C03",                 // exam id (unchanged)
    "name": "AWS Solutions Architect - Associate",
    "path": "/exams/AWS-SAA-C03.json",
    "code": "SAA-C03",                   // OPTIONAL — supported by ExamIndex, currently unused
    "description": "string",             // OPTIONAL
    "version": "string",                 // OPTIONAL
    "sim": {                             // NEW, OPTIONAL — Exam Simulation preset (§3.5)
      "questionCount": 65,
      "timeLimitMinutes": 130,
      "passThresholdPercent": 72
    }
  }
]
```

### A.3 Client-side localStorage records (derived study data)

All keyed by `(examId, questionId)`. Replaces the prompt-string matching and the copied
auto-deck cards. Continue routing **all** reads/writes through `StorageService`; add typed
methods for these. Suggested keys (keep the `epl_` prefix convention):

```ts
// epl_study_state — the single source of truth for known/unknown + stars (§3.3, §3.4)
interface QuestionStudyState {
  examId: string;
  questionId: number;
  status: 'unrated' | 'still-learning' | 'known';
  starred: boolean;
  // spaced-repetition fields (reuse spacedRepetition.ts; optional until reviewed)
  masteryLevel?: number;        // increments on "known", resets to 0 on "still-learning"
  lastReviewedAt?: string;      // ISO 8601
  updatedAt: string;            // ISO 8601
}
// stored as QuestionStudyState[] (or a Record keyed by `${examId}:${questionId}`)

// epl_decks — optional user-named collections; membership by question id (§3.3)
interface Deck {
  id: string;                   // crypto.randomUUID()
  examId: string;               // a deck belongs to one exam
  name: string;
  questionIds: number[];        // references A.1 ids — NOT copied card content
  createdAt: string;
}
```

Notes:
- **"Known" / "Still Learning" / "Starred" / "Practice Incorrect" are filtered VIEWS** over
  `epl_study_state` + quiz history — not stored collections. No card duplication.
- **Practice-incorrect (§3.2)** source = questions with `status === 'still-learning'` OR that
  appear as incorrect in `quizAnalytics` history for the exam.
- The legacy `quizAnalytics` key (quiz attempt history, `ExamAnalytics`) stays as-is; quiz
  results should additionally record **which question ids were missed** so practice-incorrect
  and per-question stats work. Extend the stored per-attempt result with an
  `incorrectQuestionIds: number[]` field (additive, backward compatible).

### A.4 ID-assignment script (one-off, then pipeline step)

- A small Node/TS script under `scrape/` (or a `quiz-app/scripts/`): for each
  `public/exams/*.json`, if a question lacks `id`, assign the next sequential integer
  (1-based) in file order; leave existing `id`s untouched; write back formatted JSON.
- Idempotent — re-running never changes an existing `id`.
- Add a validation/CI check (extend `validateExam.ts` or a build step) asserting every
  question has a unique integer `id` within its file. Document "assign ids" as a required
  step when adding a bank (§4, §7).

### A.5 Exam-sim default fallback (when `index.json` has no `sim`)

Used by §3.5 when a preset is absent. Reasonable starting values (tune later):
`questionCount = min(60, totalQuestions)`, `timeLimitMinutes = 90`,
`passThresholdPercent = 70`.

---

*This is a living document. Update statuses and priorities as work lands.*
