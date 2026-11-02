/** Client for the owner-only read API (infra/README.md, "GET /admin/*"). */

/** The newest Result for one exam, as shown in a Learner's summary. */
export interface LatestResult {
  examId: string;
  at: string;
  mode: 'quiz' | 'sim';
  percent: number;
  passed?: boolean;
}

export interface LearnerSummary {
  learnerId: string;
  name: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  exams: string[];
  resultCount: number;
  latestResults: LatestResult[];
}

export interface LearnersResponse {
  learners: LearnerSummary[];
  truncated: boolean;
}

export interface TimelineActivity {
  type: string;
  at: string;
  examId?: string;
  mode?: 'quiz' | 'sim';
  correct?: number;
  total?: number;
  percent?: number;
  passed?: boolean;
  timeSpentSec?: number;
}

export interface TimelineResponse {
  learner: Pick<LearnerSummary, 'learnerId' | 'name' | 'firstSeen' | 'lastSeen'>;
  activities: TimelineActivity[];
  nextCursor: string | null;
}

export class AdminApiError extends Error {
  constructor(readonly status: number) {
    super(`admin API answered ${status}`);
  }
}

export function createAdminApi(baseUrl: string, token: string, fetchFn: typeof fetch = fetch) {
  const base = baseUrl.replace(/\/+$/, '');
  async function get<T>(path: string): Promise<T> {
    const res = await fetchFn(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new AdminApiError(res.status);
    return (await res.json()) as T;
  }
  return {
    learners: () => get<LearnersResponse>('/admin/learners'),
    activity: (learnerId: string, cursor?: string) =>
      get<TimelineResponse>(
        `/admin/learners/${encodeURIComponent(learnerId)}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
  };
}
