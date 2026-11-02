# quiz-app

The Exam Prep Lab web app: React 18, TypeScript, Vite, Tailwind with shadcn/ui-style Radix
primitives, Vitest. See the root `README.md` for the project overview and `../CLAUDE.md` for the
architecture.

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173 (the Admin Page is at /admin)
npm test           # one shot; `npx vitest` for watch mode
npx vitest run src/__tests__/studyState.test.ts   # one file
npx vitest run -t "name of a test"                # one test
npm run lint
npm run build      # tsc -b && vite build -> dist/
```

To record Activity or sign in to `/admin` locally, create `.env.local` (gitignored) with
`VITE_ACTIVITY_API`, `VITE_COGNITO_DOMAIN` and `VITE_COGNITO_CLIENT_ID` from the infra stack
outputs. The API and Cognito already allow `http://localhost:5173`. Without them the app runs
normally and records nothing.

## Where things are

```
public/exams/          index.json + one Bank JSON per Exam
scripts/assign-ids.mjs stable Question ids (npm run assign-ids / assign-ids:check)
src/App.tsx            exam loading and the tabs
src/admin/             owner-only Admin Page (lazy chunk, loaded only on /admin)
src/components/        UI by area: quiz/ review/ flashcard/ progress/ settings/ learner/ ui/
src/services/          storage (all localStorage access), studyState, activity, learner, theme
src/lib/               pure helpers: shuffle, answers, examSim, quizTimer, route
src/__tests__/         Vitest suites
```

## Gotchas

- Go through `StorageService` (`src/services/storage.ts`) for every localStorage read or write.
- Components that call `useToast()` must render inside a `ToastProvider` in tests.
- Editing the inline theme script in `index.html` changes its CSP hash: `securityHeaders.test.ts`
  fails and prints the hash to put in `../customHttp.yml`.
- After adding or editing a Bank, run `npm run assign-ids`.
