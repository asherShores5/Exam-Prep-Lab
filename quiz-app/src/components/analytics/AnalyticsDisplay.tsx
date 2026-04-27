import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ExamAnalytics } from '../../types';
import { StorageService } from '../../services/storage';
import { computeStudyStreak, findFocusAreas } from '../../services/analyticsHelpers';

// ---------------------------------------------------------------------------
// AnalyticsDisplay (shown below quiz settings)
// ---------------------------------------------------------------------------

export interface AnalyticsDisplayProps {
  examId: string;
}

export const AnalyticsDisplay = ({ examId }: AnalyticsDisplayProps) => {
  const [analytics, setAnalytics] = useState<ExamAnalytics[string] | null>(null);
  const [streak, setStreak] = useState(0);
  const [focusAreas, setFocusAreas] = useState<Array<{ domain: string; percentage: number }>>([]);

  useEffect(() => {
    const allAnalytics = StorageService.getExamAnalytics();
    const examAnalytics = allAnalytics[examId] || null;
    setAnalytics(examAnalytics);

    // Compute study streak from quiz dates + review session dates
    const quizDates = examAnalytics ? examAnalytics.results.map(r => r.date) : [];
    const reviewDates = StorageService.getReviewSessions().map(s => s.completedAt);
    setStreak(computeStudyStreak(quizDates, reviewDates));

    // Compute focus areas when ≥3 attempts with domain data exist
    if (examAnalytics && examAnalytics.results.length >= 3) {
      const domainAggregates = new Map<string, { correct: number; total: number }>();
      examAnalytics.results.forEach(result => {
        if (!result.domains) return;
        result.domains.forEach(d => {
          const existing = domainAggregates.get(d.domain) ?? { correct: 0, total: 0 };
          existing.correct += d.correct;
          existing.total += d.total;
          domainAggregates.set(d.domain, existing);
        });
      });

      const domainScores = Array.from(domainAggregates.entries()).map(([domain, { correct, total }]) => ({
        domain,
        correct,
        total,
      }));

      setFocusAreas(findFocusAreas(domainScores));
    } else {
      setFocusAreas([]);
    }
  }, [examId]);

  if (!analytics || analytics.results.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="pt-6">
          <p className="text-center text-gray-400">No quiz attempts yet. Take a quiz to see your progress!</p>
        </CardContent>
      </Card>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const chartData = analytics.results.map((result, index) => ({
    attempt: index + 1,
    score: result.percentage,
    time: result.timeSpent / 60,
  }));

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Quiz Performance Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-gray-800/50">
              <div className="text-sm text-gray-400">Average Score</div>
              <div className="text-2xl font-semibold">{analytics.averageScore.toFixed(1)}%</div>
            </div>
            <div className="p-4 rounded-lg bg-gray-800/50">
              <div className="text-sm text-gray-400">Best Score</div>
              <div className="text-2xl font-semibold">{analytics.bestScore.toFixed(1)}%</div>
            </div>
            <div className="p-4 rounded-lg bg-gray-800/50">
              <div className="text-sm text-gray-400">Total Attempts</div>
              <div className="text-2xl font-semibold">{analytics.totalAttempts}</div>
            </div>
            <div className="p-4 rounded-lg bg-gray-800/50">
              <div className="text-sm text-gray-400">Study Streak</div>
              <div className="text-2xl font-semibold">{streak} day{streak !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {analytics.results.length < 2 && (
            <p className="text-sm text-gray-400 mb-4 text-center">
              More data needed for trend analysis
            </p>
          )}

          {focusAreas.length > 0 && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2 text-yellow-400">Focus Areas</h4>
              <div className="space-y-2">
                {focusAreas.map(area => (
                  <div key={area.domain} className="flex justify-between items-center p-3 rounded-lg bg-yellow-900/20 border border-yellow-700/50">
                    <span className="text-sm font-medium">{area.domain}</span>
                    <span className="text-sm text-yellow-300">{area.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="attempt" label={{ value: 'Attempt', position: 'insideBottom', offset: -10 }} />
                <YAxis label={{ value: 'Score (%)', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Score']}
                />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6">
            <h4 className="font-semibold mb-2">Recent Attempts</h4>
            <div className="space-y-2">
              {analytics.results.slice(-3).reverse().map((result, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-gray-800/30">
                  <div>
                    <div className="font-medium">{result.score}/{result.totalQuestions}</div>
                    <div className="text-sm text-gray-400">{new Date(result.date).toLocaleDateString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{result.percentage.toFixed(1)}%</div>
                    <div className="text-sm text-gray-400">{formatTime(result.timeSpent)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
