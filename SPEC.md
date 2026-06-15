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

`npm test` shows **13 passing / 0 failing** (updated after §8 step 1 — Stabilize). It previously
showed 5 failing + 6 passing, where the 5 failures were **broken tests that could not be fixed by
changing source**: `src/__tests__/bug-conditions.test.ts` was exploration scaffolding for 5
historical bugs (Bug 1 = index typo, Bugs 2–5 below) whose Bug 2–5 tests asserted against
**private copies of the old buggy logic inlined into the test file**, not against the real app.

✅ **Resolved in step 1.** The suite was re-authored to import and exercise the **real** modules,
so it now genuinely guards the fixes (and goes red if one is reverted). A test setup file
(`src/__tests__/setup.ts`) wires `@testing-library/jest-dom` matchers (§5.3). Source state of the
five tracked bugs — all fixed and guarded:
- **Bug 1** — exam index id `AWS-SAP-C02` correct ✅
- **Bug 2** — answer comparison is non-mutating; extracted to `lib/answers.ts#isAnswerCorrect` ✅
- **Bug 3** — `FlashcardViewer` honors the `deckId` prop (`deckId ?? 'legacy'`) ✅
- **Bug 4** — shuffle reorders via shared `lib/shuffle.ts#shuffle` (Fisher-Yates) ✅
- **Bug 5** — `QuestionSearchPanel` duplicate check is scoped to the target deck ✅

`preservation.test.ts` (the other suite) passes and guards refactors. `npm run lint` reports 2
errors + 2 warnings (test-file `any`, an unused `_examId` param, two refresh warnings);
pre-existing, safe to clean up opportunistically.

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
- **🟢 Quiz UI distinguishes single- vs multi-select.** ✅ *Done (step 1).* Options render as
  `radio` (single) / `checkbox` (multi) with a "Select one answer" / "Select N answers" hint,
  ARIA roles, and keyboard handlers; single-select replaces instead of over-selecting. Scoring
  routes through `lib/answers.ts#isAnswerCorrect` (exact-set). Derived via `isSingleSelect`.

### P1
- **🟢 Biased shuffle.** ✅ *Done (step 1).* One shared `lib/shuffle.ts#shuffle` (Fisher-Yates);
  `App.tsx`, `QuizMode`, and `FlashcardViewer` all use it. No more `sort(() => Math.random() - 0.5)`.
- **🟢 Review Mode "Show Answer" leaks on Previous.** ✅ *Done (step 1).* Previous now resets `showAnswer`.
- **🟡 Domain features are dark for most exams.** Depend on a `domain` field most JSON lacks.
  **Fix:** hide the affordance when no exam has domains; structure for domains now (§4).

### P2
- **🟢 `selectedTags` filter persists across exam switches** in QuizMode — ✅ *Done (step 1).*
  A `useEffect` keyed on `selectedExam` resets `selectedDomain` and `selectedTags`.
- **🟢 `Array(questionCount).fill([])`** shared one array reference — ✅ *Done (step 1).* Now
  `Array.from({ length: questionCount }, () => [])`.

### Accepted (won't fix)
- **Quiz/exam-sim sessions are lost if interrupted (refresh/navigation).** Per your
  direction, this is acceptable — quizzes are meant to be completed in one sitting. No
  session-resume work for quiz mode. (Flashcard *progress*, by contrast, must persist — §3.3.)

---

## 3. Intended / Net-New Features

### 3.1 Remove Import/Export & all data editing  🟢 **P0 — DONE (§8 step 2)**
- ✅ Deleted `importExport.ts`, `ImportExportPanel.tsx`, and the dead question/deck/flashcard
  editing components (§5.2).
- ✅ The **"Data" tab is now a "Settings" tab** (`components/settings/SettingsPanel.tsx`)
  containing the **storage-usage meter** and **"Clear local data"** (with confirmation). No JSON
  import/export, no question editors. *(Theme toggle — §3.7 — still TODO; SettingsPanel has a
  placeholder note for where it lands.)*
- This is the move that "fixes data integrity": the only writable data is derived study
  state (stars, known/unknown, decks), never the questions themselves.

### 3.2 Practice-Incorrect-Only deck  🟢 **P0 — DONE (§8 step 3)**
- ✅ Source = `still-learning` study state ∪ quiz-history misses (`incorrectQuestionIds`),
  minus anything since marked `known` (`computePracticeIncorrectIds` / `getPracticeIncorrectIds`
  in `studyState.ts`). Backed by study state + analytics, not a copied card set.
- ✅ Surfaces as a "🎯 Practice Incorrect" filtered view in Flashcards **and** a "Practice What
  You Missed (N)" quick-start button on the Quiz settings screen.
- ✅ `QuizResult` gained `incorrectQuestionIds?: number[]` (additive); recorded on quiz save.

### 3.3 Flashcard overhaul: per-question study state  🟢 **P0 — DONE (§8 step 3)**
This was the core of the flashcard rework. **Model: per-question study state.**

- ✅ Each question carries a `QuestionStudyState` keyed by `(examId, questionId)`:
  `unrated` → `still-learning` → `known`, plus a `starred` flag (§3.4), `masteryLevel`,
  `lastReviewedAt`. Stored under `epl_study_state`; service in `services/studyState.ts`.
- ✅ **"Known" / "Still Learning" / "Starred" are filtered views** over study state, computed
  over the exam bank in `FlashcardsTab` — no copied card collections, no prompt-string matching.
  The old `__known__`/`__learning__` auto-decks are gone.
- ✅ **One-time migration** (`migrateAutoDecksForExam`) folds any legacy auto-deck cards into
  study state (matching prompt→id) on exam load, then drops those cards. Idempotent.
- 🟡 **Custom decks remain** but still store copied `{front, back}` content keyed by prompt
  string — migrating them to id-based membership (`Deck.questionIds`, A.3) was **deferred**
  (decided) to a follow-up. Everything else keys on `(examId, id)`.
- ✅ **Persistence:** study state survives refreshes and exam switches (single localStorage record).
- ✅ Progress dashboard mastery % + "reviewed" count read from study state.

### 3.4 Star / bookmark questions  🟢 **P0 — DONE (§8 step 3)**
- ✅ Stored as a `starred` flag on per-question study state, keyed by `(examId, id)`; **Starred**
  is a filtered view + study source in Flashcards.
- ✅ Reusable `StarToggle` (`components/flashcard/StarToggle.tsx`) reads/writes study state and is
  wired into **Flashcard viewer, Review mode, and Quiz post-quiz review**.

### 3.5 Exam Simulation mode  🟢 **P0 — DONE (§8 step 5)**
- ✅ A preset within Quiz Mode (not separate architecture): an "Exam Simulation" card on the
  Quiz screen starts a full-length, timed attempt graded pass/fail. The quiz UI already never
  reveals answers mid-attempt, satisfying "no mid-quiz answer reveal".
- ✅ Per-exam presets (`questionCount`/`timeLimitMinutes`/`passThresholdPercent`) live in
  `index.json` (`ExamIndex.sim`, Appendix A.2); `lib/examSim.ts#resolveSimPreset` falls back to
  A.5 defaults when absent and **caps count at the bank size**. Presets added for the 5 main
  exams; AWS-ADC-Prep intentionally uses the default fallback.
- ✅ Results show a PASS/FAIL badge vs threshold; `QuizResult.passThresholdPercent` is recorded
  on sim attempts. Tested (`examSim.test.ts`, incl. a guard that index.json presets are feasible).
- Subject to the "sessions lost if interrupted" acceptance (§2).

### 3.6 PWA / offline support  🟢 **P0 — DONE (§8 step 6)**
- ✅ `vite-plugin-pwa` (Workbox) generates the service worker + `manifest.webmanifest`. The app
  is installable and works offline. Configured in `vite.config.ts`.
- ✅ App shell (JS/CSS/HTML/icons) is precached (~1.2 MB); per-exam banks (~4 MB total) are
  **runtime-cached** (StaleWhileRevalidate, `exam-banks`) on first view rather than precached, so
  install stays small and any studied exam works offline. localStorage progress is unaffected.
- ✅ Real manifest (name/short_name/description, `#020817` theme, maskable icon); icons copied to
  `public/` and wired into `index.html` (favicons, apple-touch, theme-color). The old empty
  `favicon_io/site.webmanifest` was removed.
- ✅ `registerType: 'prompt'` — `src/pwa.ts` shows a "new version available → Reload" banner
  instead of silently updating. `dev-dist` gitignored.

### 3.7 Light + dark theme  🟢 **P1 — DONE (§8 step 4)**
- ✅ Token system in `src/index.css`: Tailwind's gray scale + named semantic tokens
  (`background`/`foreground`/`card`/`border`/`ring`) are backed by CSS-var RGB channels
  (`tailwind.config.js` maps them via `rgb(var(--x)/<alpha-value>)`, preserving opacity modifiers).
  The gray ramp **reverses** under light mode, so all ~212 existing `gray-*` classes flip
  automatically — no per-component churn, dark mode unchanged.
- ✅ `services/theme.ts`: `system | light | dark` preference (default **system**, per spec),
  resolves via `prefers-color-scheme`, toggles `.dark` on `<html>`, persists to `epl_theme`,
  and tracks live OS changes for 'system'. No-FOUC inline script in `index.html` applies it
  before paint.
- ✅ 3-way toggle (System/Light/Dark) in the **Settings** tab. Tested (`theme.test.ts`).
- 🟡 Follow-up: accent text (e.g. `text-blue-200`, `text-green-400`) is not yet tokenized — it's
  legible on both themes but a future contrast-polish pass could tune accents per theme.

### 3.8 Optional, low-cost niceties  🟡 **P2**
- **🟢 Minimal keyboard navigation — DONE (step 7).** Number keys select, arrows move, space/enter
  reveal/advance (`hooks/useKeyboardNav.ts`), wired into Quiz + Review.
- **🔴 "Due today" view** across decks using the existing `spacedRepetition` service. Not done.

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

### 5.1 Resolve the two-model problem → stable IDs, single shape  🟢 **P0 — DONE**
> **Part A (stable ids) — DONE:** stable integer ids on all 3127 questions across the 6 shipped
> banks. `LegacyQuestion` gained `id?: number`; `scripts/assign-ids.mjs` (idempotent,
> `npm run assign-ids`) assigns sequential 1-based ids per file; `validateExam.ts` exports
> `findIdIssues` and warns on missing/duplicate ids at load; `question-ids.test.ts` guards uniqueness.
>
> **Part B (remove canonical scaffolding) — DONE (§8 step 2):** deleted `transformLegacy.ts`
> (incl. `simpleHash`), `importExport.ts`, and the canonical `Exam`/`Question`/`QuestionType`/
> `QuizSession`/`Domain`/`DomainResult`/`AppDataExport` types; trimmed `StorageService` to the
> derived study-data surface (removed Exams/Questions/QuizSessions/SchemaVersion methods + keys).
> Now exactly **one question shape** (`LegacyQuestion`) plus the derived ID-keyed records below.
>
> **Study state (step 3) — DONE:** `QuestionStudyState` (`epl_study_state`) keys on `(examId, id)`
> for known/unknown + stars + mastery (`services/studyState.ts`). Flashcard *ratings and stars* now
> use ids. **Remaining prompt-string keying:** custom-deck `Flashcard` records (deferred) and
> `tagService.ts` still key on the prompt string.

The app previously had two parallel question models: `LegacyQuestion` (what all study flows use)
and an unused canonical `Question`/`QuizSession` model wired only into the import/export plumbing.
The canonical model is now gone.

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

### 5.2 Dead code to remove  🟢 **P1 — DONE (§8 step 2)**
All removed:
- ✅ `components/management/QuestionForm.tsx`, `QuestionList.tsx` (+ the now-empty `management/` dir)
- ✅ `components/flashcard/FlashcardForm.tsx`, `DeckForm.tsx`, `DeckList.tsx`
- ✅ `services/importExport.ts`, `ImportExportPanel.tsx`, `services/transformLegacy.ts`, and the
  import/export-only canonical methods on `StorageService`. Kept everything the stable-id +
  study flows need.

### 5.3 Other tech debt
- **🟡 Duplicated logic.** Score-trend chart, `formatTime`, analytics aggregation are
  reimplemented in `AnalyticsDisplay` and `ProgressDashboard`. Extract shared util/components.
- **🟢 Shuffle util duplicated** (§2) — ✅ *Done (step 1).* One Fisher-Yates helper in `lib/shuffle.ts`.
- **🟢 No test setup file.** ✅ *Done (step 1).* `src/__tests__/setup.ts` wires
  `@testing-library/jest-dom` matchers, referenced from `vitest.config.ts`.
- **🟡 Thin coverage.** Only `bug-conditions` + `preservation` suites; add component tests for
  the study flows, especially the new per-question study state.
- **🟡 ESLint not type-aware** (documented in `quiz-app/README.md`, not enabled).

---

## 6. UI / UX Improvements

### P1
- **🟢 Accessible answer options — DONE (step 1).** Quiz options are radios/checkboxes with
  roles + keyboard handlers; number-key selection added in step 7.
- **🟢 Quiz navigation — DONE (step 7).** Question-grid jump-to-question with answered + flagged
  indicators, and a "Flag for review" toggle, replacing strictly-linear Prev/Next.
- **🟢 Loading & empty states — DONE (step 7).** `ui/skeleton.tsx` (`QuestionSkeleton`) replaces
  the bare "Loading questions…" in Quiz/Review/Flashcards. (Friendlier empty states for
  study-state views were added in step 3.)

### P2
- **🟢 Timer UX — DONE (step 7).** Low-time warning toast at 60s + red timer; confirm-before-finish
  when questions are unanswered/flagged. (Auto-submit at 0:00 stays — can't confirm after time's up.)
- **🟡 Results richness — partial.** Pass/fail vs threshold done (§3.5); your-answer-vs-correct
  diff exists. Time-per-question still TODO.
- **🔴 Deck ergonomics.** Deck detail view, bulk add/remove, card preview. Not done.
- **🔴 Mobile polish.** 44px targets everywhere; verify swipe-vs-scroll in flashcards.
- **🟢 Consistent toasts — DONE (step 7).** `ui/toast.tsx` (`ToastProvider`/`useToast`) replaces
  the ad-hoc per-component `setTimeout` toasts in FlashcardViewer/QuestionSearchPanel.
- **🟡 Design tokens — partial.** Color tokens done in step 4; spacing/typography pass still TODO.

### Keyboard navigation (§3.8)  🟢 **DONE (step 7)**
- `hooks/useKeyboardNav.ts`: number keys 1–9 select options, ←/→ move between questions/cards,
  Space/Enter reveal-or-advance. Wired into Quiz (select/move/advance) and Review (move/reveal);
  ignores keystrokes while typing in inputs.

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

1. ✅ **Stabilize (low-risk bug fixes) — DONE.** Shared Fisher-Yates shuffle (`lib/shuffle.ts`),
   Review show-answer reset, single/multi-select UI + scoring (`lib/answers.ts`), reset filters on
   exam change, `Array.from` fix. `bug-conditions.test.ts` re-authored against real modules; test
   setup file added. `npm test` 13/13 green, build green, lint at baseline.
2. ✅ **Remove import/export & data editing + stable question IDs — DONE.** All banks carry
   unique integer ids (script + validation + tests, Appendix A.4). Import/export, the dead editor
   components, `transformLegacy`, and the canonical `Question`/`QuizSession`/`AppDataExport`
   scaffolding are deleted; Data tab → Settings tab; `StorageService` trimmed to the derived
   study-data surface; preservation tests reworked. `npm test` 25/25, build green, lint 0 errors.
   *(Migrating study state/stars to key on `(examId, id)` happens in step 3 — those records don't
   exist yet.)*
3. ✅ **Flashcard overhaul → study state (§3.3) + stars (§3.4) + practice-incorrect (§3.2) — DONE.**
   `QuestionStudyState` (`epl_study_state`) keyed on `(examId, id)`; `services/studyState.ts` with
   rate/star/views/counts, one-time auto-deck migration, and practice-incorrect source. FlashcardsTab
   shows Practice-Incorrect/Known/Still-Learning/Starred as filtered views (auto-decks removed). `StarToggle`
   wired into Flashcards + Review + Quiz review. `QuizResult.incorrectQuestionIds` recorded; "Practice What
   You Missed" quick-start in Quiz. Progress mastery reads study state. `npm test` 46/46, build green, lint
   0 errors. **Deferred:** custom-deck → id-membership migration (custom decks + tagService still key on
   prompt string).
4. ✅ **Settings tab + light/dark theme (§3.1, §3.7) — DONE.** Settings tab shipped in step 2;
   theme system added in step 4: CSS-var token ramp (gray scale reverses under light), `services/theme.ts`
   (system default, no-FOUC, persisted), 3-way toggle in Settings, `theme.test.ts`. `npm test` 55/55,
   build green, lint 0 errors. Follow-up: tokenize accent colors for per-theme contrast tuning.
5. ✅ **Exam simulation mode (§3.5) — DONE.** `ExamIndex.sim` presets in index.json (5 exams +
   default fallback), `lib/examSim.ts` (resolve + cap-to-bank + pass/fail), "Exam Simulation" card
   in Quiz with full-length timed attempt, PASS/FAIL results badge, `QuizResult.passThresholdPercent`
   recorded. `npm test` 66/66, build green, lint 0 errors.
6. ✅ **PWA / offline (§3.6) — DONE.** `vite-plugin-pwa` (prompt update), real manifest + icons,
   app-shell precache, runtime-cached exam banks (StaleWhileRevalidate). `npm test` 66/66, build
   emits `sw.js`/`manifest.webmanifest`, lint 0 errors.
7. 🟡 **UX polish (§6) + keyboard nav (§3.8) — substantially DONE.** Centralized toasts
   (`ui/toast.tsx`), loading skeletons (`ui/skeleton.tsx`), keyboard nav (`hooks/useKeyboardNav.ts`),
   quiz question-grid + flag-for-review, low-time warning + finish-confirm. `npm test` 66/66, build
   green, lint 0 errors. **Remaining §6:** deck ergonomics, mobile 44px polish, time-per-question,
   spacing/typography token pass.
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

### A.4 ID-assignment script (one-off, then pipeline step)  ✅ **DONE**

- ✅ `quiz-app/scripts/assign-ids.mjs` (`npm run assign-ids`): for each `public/exams/*.json`,
  questions lacking `id` get the next sequential integer (continuing from the file's current max,
  1-based, file order); existing ids untouched; emitted `id`-first; written as 2-space JSON + CRLF.
- ✅ Idempotent — re-running never changes an existing `id`. `--check` (`npm run assign-ids:check`)
  is a report-only CI guard that exits non-zero when a bank is out of date.
- ✅ `validateExam.ts#findIdIssues` asserts unique integer ids; surfaced as load-time warnings and
  guarded by `src/__tests__/question-ids.test.ts` (reads the real banks). "Assign ids" is documented
  as a required step in `CLAUDE.md` (Content pipeline).

### A.5 Exam-sim default fallback (when `index.json` has no `sim`)

Used by §3.5 when a preset is absent. Reasonable starting values (tune later):
`questionCount = min(60, totalQuestions)`, `timeLimitMinutes = 90`,
`passThresholdPercent = 70`.

---

*This is a living document. Update statuses and priorities as work lands.*
