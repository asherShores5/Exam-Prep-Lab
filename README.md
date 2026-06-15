# Exam Prep Lab

A fully static, client-side exam-preparation web app. Pick a certification exam, then study
it through Review, Quiz, and Flashcard modes with local progress tracking and analytics.
Deployed as static files (AWS Amplify / S3) at [exampreplab.com](https://www.exampreplab.com).

There is **no backend and no accounts.** Exam content is served from static JSON committed to
this repo; all user progress lives in the browser's `localStorage`.

## Documentation map

- **[CLAUDE.md](CLAUDE.md)** — architecture primer: how the code is laid out and how the
  pieces fit together (accurate for the code as it exists today).
- **[SPEC.md](SPEC.md)** — product direction and the in-progress overhaul. **Read this before
  starting feature work** — it's the source of truth for what's changing and why.

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui-style primitives (Radix) ·
Recharts · Vitest + Testing Library. State persists to `localStorage`.

## Getting started

Requires Node.js 20+ (ships with npm). All commands run from `quiz-app/`:

```bash
cd quiz-app
npm install      # first time only
npm run dev      # Vite dev server with HMR
npm run build    # tsc -b && vite build → dist/
npm run lint     # eslint .
npm test         # vitest --run (one-shot)
```

Run a single test:

```bash
npx vitest run src/__tests__/bug-conditions.test.ts
npx vitest run -t "name of the test"
```

## Project structure

```
quiz-app/
├── public/exams/        # static exam content: index.json + one JSON per exam bank
├── src/
│   ├── components/       # UI grouped by area: quiz/ review/ flashcard/ progress/ ui/ ...
│   ├── services/         # storage, validation, spaced repetition, analytics helpers
│   ├── types/            # shared TypeScript types
│   └── __tests__/        # vitest suites
└── ...config (vite, vitest, tailwind, eslint, tsconfig)

unsorted-data/           # raw source question banks (input for content conversion; not shipped)
```

## Exam content

Each exam is a JSON file in `quiz-app/public/exams/`, listed in `index.json`. Questions are
added or edited **by committing changes to these files** — the repo is the content "backend."
There is intentionally no in-app question editor. See **[SPEC.md](SPEC.md) §4 and Appendix A**
for the question/index JSON schemas.

## Deployment

Pushing to `main` triggers the AWS Amplify build (`npm ci` → `npm run build`, publishing
`dist/`). A manual S3 sync alternative is in `quiz-app/sync_to_s3.ps1` (reads bucket/credentials
from a `.env` file in `quiz-app/`).

## License

Apache 2.0 — see [LICENSE](LICENSE).
