import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPage, type AdminPageConfig } from '../admin/AdminPage';
import { isAdminPath } from '../lib/route';

const A = '3b241101-e2bb-4255-8caf-4136c566a962';
const CONFIG: AdminPageConfig = {
  api: 'https://api.example.test/',
  auth: {
    domain: 'https://exampreplab-admin.auth.us-west-1.amazoncognito.com',
    clientId: 'client123',
    redirectUri: 'http://localhost:3000/admin',
  },
};

const LEARNERS = {
  truncated: false,
  learners: [
    {
      learnerId: A, name: 'Pat', firstSeen: '2026-10-01T10:00:00.000Z', lastSeen: '2026-11-01T10:00:00.000Z',
      exams: ['AWS-SAA-C03', 'PSM-I'], resultCount: 3,
      latestScores: [
        { examId: 'PSM-I', at: '2026-10-05T10:00:00.000Z', mode: 'sim', percent: 80, passed: true },
        { examId: 'AWS-SAA-C03', at: '2026-10-03T10:00:00.000Z', mode: 'quiz', percent: 50 },
      ],
    },
  ],
};
const TIMELINE = {
  learner: { learnerId: A, name: 'Pat', firstSeen: '2026-10-01T10:00:00.000Z', lastSeen: '2026-11-01T10:00:00.000Z' },
  activities: [
    { type: 'result', at: '2026-10-05T10:00:00.000Z', examId: 'PSM-I', mode: 'sim', correct: 8, total: 10, percent: 80, passed: true, timeSpentSec: 90 },
    { type: 'exam_opened', at: '2026-10-01T10:01:00.000Z', examId: 'PSM-I' },
    { type: 'visit', at: '2026-10-01T10:00:00.000Z' },
  ],
  nextCursor: null,
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
/** A fake fetch that answers by URL. */
const route = (answer: (url: string) => Response) => vi.fn(async (input: RequestInfo | URL) => answer(String(input)));

function signedIn(token = 'AT') {
  sessionStorage.setItem('epl_admin_session', JSON.stringify({ accessToken: token, expiresAt: Date.now() + 3600_000 }));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/admin');
});
afterEach(() => vi.restoreAllMocks());

describe('the /admin route', () => {
  it.each([
    ['/admin', true],
    ['/admin/', true],
    ['/', false],
    ['/administrator', false],
    ['/exams/admin', false],
  ])('%s is the Admin Page: %s', (path, expected) => {
    expect(isAdminPath(path)).toBe(expected);
  });
});

describe('Admin Page', () => {
  it('says what is missing when the build has no admin config', () => {
    render(<AdminPage config={null} />);
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in and calls no API', () => {
    const fetchFn = vi.fn();
    render(<AdminPage config={CONFIG} fetchFn={fetchFn} />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(/what's your name/i)).not.toBeInTheDocument();
  });

  it('lists Learners with first/last seen, exams, Result count and latest scores, using the bearer token', async () => {
    signedIn();
    const fetchFn = vi.fn().mockResolvedValue(json(200, LEARNERS));
    render(<AdminPage config={CONFIG} fetchFn={fetchFn} />);

    const row = await screen.findByRole('button', { name: /Pat/ });
    expect(row).toHaveTextContent('AWS-SAA-C03, PSM-I');
    expect(row).toHaveTextContent('3 Results');
    expect(row).toHaveTextContent('PSM-I 80% sim pass');
    expect(row).toHaveTextContent('AWS-SAA-C03 50% quiz');
    expect(row).toHaveTextContent('2026-10-01');
    expect(row).toHaveTextContent('2026-11-01');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.example.test/admin/learners');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer AT' });
    // Reading the Admin Page records nothing.
    expect(fetchFn.mock.calls.every(([, i]) => (i?.method ?? 'GET') === 'GET')).toBe(true);
  });

  it("opens a Learner's Activity timeline on tap, and goes back", async () => {
    signedIn();
    const fetchFn = route((url) => (url.includes('/activity') ? json(200, TIMELINE) : json(200, LEARNERS)));
    render(<AdminPage config={CONFIG} fetchFn={fetchFn} />);

    fireEvent.click(await screen.findByRole('button', { name: /Pat/ }));
    const list = await screen.findByRole('list', { name: /activity/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Result PSM-I sim 8/10 (80%) pass 1m 30s');
    expect(items[1]).toHaveTextContent('Exam Opened PSM-I');
    expect(items[2]).toHaveTextContent('Visit');
    expect(fetchFn).toHaveBeenCalledWith(`https://api.example.test/admin/learners/${A}/activity`, expect.anything());

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByRole('button', { name: /Pat/ })).toBeInTheDocument();
  });

  it('loads older Activity with the cursor the API gave', async () => {
    signedIn();
    const fetchFn = route((url) => {
      if (!url.includes('/activity')) return json(200, LEARNERS);
      return url.includes('cursor=')
        ? json(200, { ...TIMELINE, activities: [{ type: 'visit', at: '2026-09-01T10:00:00.000Z' }], nextCursor: null })
        : json(200, { ...TIMELINE, nextCursor: 'c1' });
    });
    render(<AdminPage config={CONFIG} fetchFn={fetchFn} />);
    fireEvent.click(await screen.findByRole('button', { name: /Pat/ }));
    fireEvent.click(await screen.findByRole('button', { name: /older/i }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: /activity/i })).getAllByRole('listitem')).toHaveLength(4));
    expect(fetchFn).toHaveBeenCalledWith(`https://api.example.test/admin/learners/${A}/activity?cursor=c1`, expect.anything());
    expect(screen.queryByRole('button', { name: /older/i })).not.toBeInTheDocument();
  });

  it('drops the session and asks to sign in again when the API answers 401', async () => {
    signedIn();
    const fetchFn = vi.fn().mockResolvedValue(json(401, { message: 'Unauthorized' }));
    render(<AdminPage config={CONFIG} fetchFn={fetchFn} />);
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(sessionStorage.getItem('epl_admin_session')).toBeNull();
  });

  it('says the account is not an admin on 403', async () => {
    signedIn();
    const fetchFn = vi.fn().mockResolvedValue(json(403, { error: 'forbidden' }));
    render(<AdminPage config={CONFIG} fetchFn={fetchFn} />);
    expect(await screen.findByText(/not an admin/i)).toBeInTheDocument();
  });

  it('finishes a hosted UI callback, then cleans the code out of the address bar', async () => {
    // A sign-in was started in this tab.
    sessionStorage.setItem('epl_admin_pending', JSON.stringify({ state: 's1', verifier: 'v'.repeat(43) }));
    window.history.replaceState(null, '', '/admin?code=abc&state=s1');
    const fetchFn = route((url) =>
      url.endsWith('/oauth2/token') ? json(200, { access_token: 'AT', expires_in: 3600 }) : json(200, LEARNERS),
    );
    render(<AdminPage config={CONFIG} fetchFn={fetchFn} />);
    expect(await screen.findByRole('button', { name: /Pat/ })).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/admin');
  });
});
