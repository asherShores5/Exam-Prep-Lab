/**
 * Admin Page (SPEC §9.3): the owner-only list of Learners and their Activity.
 *
 * Loaded only on /admin (lazy chunk, see main.tsx), never behind the LearnerGate, and it
 * records no Activity: every request here is a GET to the read API.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { AdminApiError, createAdminApi, type LearnersResponse, type TimelineActivity, type TimelineResponse } from './api';
import { beginSignIn, clearSession, completeSignIn, getAccessToken, signOut, type AdminAuthConfig } from './auth';

export interface AdminPageConfig {
  /** Activity API base URL (VITE_ACTIVITY_API). */
  api: string;
  auth: AdminAuthConfig;
}

type Status =
  | { kind: 'starting' }
  | { kind: 'signedOut'; message?: string }
  | { kind: 'ready'; token: string };

const when = (iso: string | null | undefined) => (iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : 'unknown');

function duration(sec: number | undefined) {
  if (sec === undefined) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const passText = (passed: boolean | undefined) => (passed === undefined ? '' : passed ? 'pass' : 'fail');

function describe(a: TimelineActivity): string {
  switch (a.type) {
    case 'visit':
      return 'Visit';
    case 'exam_opened':
      return `Exam Opened ${a.examId ?? ''}`;
    case 'result':
      return [
        'Result',
        a.examId,
        a.mode,
        `${a.correct}/${a.total} (${a.percent !== undefined ? Math.round(a.percent) : '?'}%)`,
        passText(a.passed),
        duration(a.timeSpentSec),
      ]
        .filter(Boolean)
        .join(' ');
    default:
      return a.type;
  }
}

export function AdminPage({ config, fetchFn = fetch }: { config: AdminPageConfig | null; fetchFn?: typeof fetch }) {
  const [status, setStatus] = useState<Status>({ kind: 'starting' });

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    (async () => {
      const search = window.location.search;
      if (new URLSearchParams(search).has('code')) {
        const ok = await completeSignIn(config.auth, search, { fetchFn });
        // Never leave the one-time code in the address bar or history.
        window.history.replaceState(null, '', window.location.pathname);
        if (cancelled) return;
        if (!ok) {
          setStatus({ kind: 'signedOut', message: 'Sign-in did not complete. Try again.' });
          return;
        }
      }
      const token = getAccessToken();
      if (!cancelled) setStatus(token ? { kind: 'ready', token } : { kind: 'signedOut' });
    })();
    return () => {
      cancelled = true;
    };
  }, [config, fetchFn]);

  const onAuthLost = useCallback(() => {
    clearSession();
    setStatus({ kind: 'signedOut', message: 'Your session ended. Sign in again.' });
  }, []);

  const token = status.kind === 'ready' ? status.token : null;
  const api = useMemo(() => (config && token ? createAdminApi(config.api, token, fetchFn) : null), [config, token, fetchFn]);

  if (!config) {
    return (
      <Shell>
        <p className="text-gray-400">
          The Admin Page is not configured in this build (VITE_ACTIVITY_API, VITE_COGNITO_DOMAIN, VITE_COGNITO_CLIENT_ID).
        </p>
      </Shell>
    );
  }
  if (status.kind === 'starting') return <Shell><p className="text-gray-400">Loading…</p></Shell>;
  if (status.kind === 'signedOut' || !api) {
    return (
      <Shell>
        {status.kind === 'signedOut' && status.message && <p className="mb-3 text-gray-400">{status.message}</p>}
        <Button onClick={async () => window.location.assign(await beginSignIn(config.auth))}>Sign in</Button>
      </Shell>
    );
  }
  return (
    <Shell
      action={
        <Button variant="ghost" size="sm" onClick={() => window.location.assign(signOut(config.auth))}>
          Sign out
        </Button>
      }
    >
      <Learners api={api} onAuthLost={onAuthLost} />
    </Shell>
  );
}

function Shell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto p-4 text-foreground">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        {action}
      </header>
      {children}
    </main>
  );
}

type Api = ReturnType<typeof createAdminApi>;

function useErrorText(onAuthLost: () => void) {
  return useCallback(
    (e: unknown): string | null => {
      if (e instanceof AdminApiError && e.status === 401) {
        onAuthLost();
        return null;
      }
      if (e instanceof AdminApiError && e.status === 403) return 'This account is not an admin.';
      return 'Could not load. Try again later.';
    },
    [onAuthLost],
  );
}

function Learners({ api, onAuthLost }: { api: Api; onAuthLost: () => void }) {
  const [data, setData] = useState<LearnersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const errorText = useErrorText(onAuthLost);

  useEffect(() => {
    let cancelled = false;
    api.learners().then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setError(errorText(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [api, errorText]);

  if (selected) return <Timeline api={api} learnerId={selected} onBack={() => setSelected(null)} onAuthLost={onAuthLost} />;
  if (error) return <p className="text-gray-400">{error}</p>;
  if (!data) return <p className="text-gray-400">Loading Learners…</p>;
  if (data.learners.length === 0) return <p className="text-gray-400">No Learners yet.</p>;

  return (
    <>
      <h2 className="mb-2 text-sm text-gray-400">{data.learners.length} Learners</h2>
      <ul className="divide-y divide-gray-800 rounded-md border border-border bg-card" aria-label="Learners">
        {data.learners.map((l) => (
          <li key={l.learnerId}>
            <button
              type="button"
              onClick={() => setSelected(l.learnerId)}
              className="w-full p-3 text-left hover:bg-gray-800/60 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="font-medium">{l.name ?? '(no name)'}</div>
              <div className="text-sm text-gray-400">
                first {when(l.firstSeen)} · last {when(l.lastSeen)}
              </div>
              <div className="text-sm text-gray-400">
                {l.exams.length ? l.exams.join(', ') : 'no exams'} · {l.resultCount} {l.resultCount === 1 ? 'Result' : 'Results'}
              </div>
              {l.latestScores.length > 0 && (
                <div className="text-sm text-gray-300">
                  {l.latestScores
                    .map((s) => [s.examId, `${Math.round(s.percent)}%`, s.mode, passText(s.passed)].filter(Boolean).join(' '))
                    .join(' · ')}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
      {data.truncated && <p className="mt-2 text-sm text-gray-400">List is cut short: the table is bigger than one read.</p>}
    </>
  );
}

function Timeline({ api, learnerId, onBack, onAuthLost }: { api: Api; learnerId: string; onBack: () => void; onAuthLost: () => void }) {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const errorText = useErrorText(onAuthLost);

  useEffect(() => {
    let cancelled = false;
    api.activity(learnerId).then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setError(errorText(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [api, learnerId, errorText]);

  async function loadOlder() {
    if (!data?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await api.activity(learnerId, data.nextCursor);
      setData({ ...next, activities: [...data.activities, ...next.activities] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={onBack} className="mb-3">
        ← Back
      </Button>
      {error && <p className="text-gray-400">{error}</p>}
      {!data && !error && <p className="text-gray-400">Loading Activity…</p>}
      {data && (
        <>
          <h2 className="font-medium">{data.learner.name ?? '(no name)'}</h2>
          <p className="mb-3 text-sm text-gray-400">
            first {when(data.learner.firstSeen)} · last {when(data.learner.lastSeen)}
          </p>
          <ul className="divide-y divide-gray-800 rounded-md border border-border bg-card" aria-label="Activity">
            {data.activities.map((a, i) => (
              <li key={`${a.at}-${i}`} className="p-3 text-sm">
                <span className="text-gray-400">{when(a.at)}</span> <span>{describe(a)}</span>
              </li>
            ))}
          </ul>
          {data.activities.length === 0 && <p className="mt-2 text-sm text-gray-400">No Activity.</p>}
          {data.nextCursor && (
            <Button variant="outline" size="sm" className="mt-3" onClick={loadOlder} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load older'}
            </Button>
          )}
        </>
      )}
    </>
  );
}
