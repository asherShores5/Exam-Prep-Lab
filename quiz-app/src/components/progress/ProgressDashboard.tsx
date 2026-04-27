import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StorageService } from '../../services/storage';
import { computeMasteryPercentage } from '../../services/analyticsHelpers';
import type { ReviewSession, Deck, ExamAnalytics } from '../../types/index';

interface ProgressDashboardProps {
  selectedExam: string;
}

export function ProgressDashboard({ selectedExam }: ProgressDashboardProps) {
  const [reviewSessions, setReviewSessions] = useState<ReviewSession[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [analytics, setAnalytics] = useState<ExamAnalytics[string] | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [masteryPct, setMasteryPct] = useState(0);
  const [totalReviewed, setTotalReviewed] = useState(0);

  const loadData = useCallback(() => {
    // Load all decks associated with this exam
    const allDecks = StorageService.getDecks();
    const examDecks = allDecks.filter(d => d.examIds.includes(selectedExam));
    setDecks(examDecks);

    // Load review sessions for decks belonging to this exam + legacy sessions
    const examDeckIds = new Set(examDecks.map(d => d.id));
    examDeckIds.add('legacy'); // Include legacy flashcard sessions
    const allSessions = StorageService.getReviewSessions();
    const examSessions = allSessions
      .filter(s => examDeckIds.has(s.deckId))
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    setReviewSessions(examSessions);

    // Load legacy quiz analytics
    const allAnalytics = StorageService.getExamAnalytics();
    setAnalytics(allAnalytics[selectedExam] ?? null);

    // Load flashcards for this exam's decks and compute mastery
    const allCards = StorageService.getFlashcards();
    const examFlashcards = allCards.filter(c => examDeckIds.has(c.deckId));
    setMasteryPct(computeMasteryPercentage(examFlashcards));
    setTotalReviewed(examFlashcards.filter(c => c.lastReviewedAt !== undefined).length);
  }, [selectedExam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getDeckName(deckId: string): string {
    if (deckId === 'legacy') return 'All Exam Questions';
    return decks.find(d => d.id === deckId)?.name ?? 'Unknown Deck';
  }

  function formatDate(isoString: string): string {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function handleClearProgress() {
    // Delete all QuizResult records for this exam from ExamAnalytics
    const allAnalytics = StorageService.getExamAnalytics();
    delete allAnalytics[selectedExam];
    StorageService.saveExamAnalytics(allAnalytics);

    // Delete all ReviewSession records for decks associated with this exam + legacy
    const examDeckIds = new Set(decks.map(d => d.id));
    examDeckIds.add('legacy');
    const remaining = StorageService.getReviewSessions().filter(
      s => !examDeckIds.has(s.deckId)
    );
    StorageService.saveReviewSessions(remaining);

    setShowClearModal(false);
    loadData();
  }

  // ── Quiz History section ──────────────────────────────────────────────────

  const renderQuizHistory = () => {
    if (!analytics || analytics.results.length === 0) {
      return (
        <p className="text-sm text-gray-500 py-4 text-center">
          No quiz attempts yet. Take a quiz to see your history here.
        </p>
      );
    }

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };

    return (
      <div className="space-y-3">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-gray-800/50 text-center">
            <div className="text-xs text-gray-400 mb-1">Avg Score</div>
            <div className="text-lg font-semibold">{analytics.averageScore.toFixed(1)}%</div>
          </div>
          <div className="p-3 rounded-lg bg-gray-800/50 text-center">
            <div className="text-xs text-gray-400 mb-1">Best Score</div>
            <div className="text-lg font-semibold">{analytics.bestScore.toFixed(1)}%</div>
          </div>
          <div className="p-3 rounded-lg bg-gray-800/50 text-center">
            <div className="text-xs text-gray-400 mb-1">Attempts</div>
            <div className="text-lg font-semibold">{analytics.totalAttempts}</div>
          </div>
        </div>

        {/* Attempts table */}
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/50">
                <th className="text-left px-3 py-2 text-gray-400 font-medium">Date</th>
                <th className="text-right px-3 py-2 text-gray-400 font-medium">Score</th>
                <th className="text-right px-3 py-2 text-gray-400 font-medium">%</th>
                <th className="text-right px-3 py-2 text-gray-400 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {[...analytics.results].reverse().map((result, idx) => (
                <tr
                  key={idx}
                  className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20"
                >
                  <td className="px-3 py-2 text-gray-300">{formatDate(result.date)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">
                    {result.score}/{result.totalQuestions}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    <span
                      className={
                        result.percentage >= 80
                          ? 'text-green-400'
                          : result.percentage >= 60
                          ? 'text-yellow-400'
                          : 'text-red-400'
                      }
                    >
                      {result.percentage.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-400">
                    {formatTime(result.timeSpent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Review Session History section ────────────────────────────────────────

  const renderReviewHistory = () => {
    if (reviewSessions.length === 0) {
      return (
        <p className="text-sm text-gray-500 py-4 text-center">
          No review sessions yet. Complete a flashcard review to see your history here.
        </p>
      );
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              <th className="text-left px-3 py-2 text-gray-400 font-medium">Date</th>
              <th className="text-left px-3 py-2 text-gray-400 font-medium">Deck</th>
              <th className="text-right px-3 py-2 text-gray-400 font-medium">Total</th>
              <th className="text-right px-3 py-2 text-gray-400 font-medium">Known</th>
              <th className="text-right px-3 py-2 text-gray-400 font-medium">Still Learning</th>
            </tr>
          </thead>
          <tbody>
            {reviewSessions.map(session => (
              <tr
                key={session.id}
                className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20"
              >
                <td className="px-3 py-2 text-gray-300">{formatDate(session.completedAt)}</td>
                <td className="px-3 py-2 text-gray-300">{getDeckName(session.deckId)}</td>
                <td className="px-3 py-2 text-right text-gray-300">{session.totalCards}</td>
                <td className="px-3 py-2 text-right text-green-400">{session.knownCount}</td>
                <td className="px-3 py-2 text-right text-yellow-400">{session.stillLearningCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Per-domain accuracy section ───────────────────────────────────────────

  const renderDomainAccuracy = () => {
    if (!analytics || analytics.results.length === 0) {
      return (
        <p className="text-sm text-gray-500 py-4 text-center">
          No quiz data yet. Domain accuracy will appear here after you complete quizzes.
        </p>
      );
    }

    // Aggregate domain data across all quiz attempts
    const domainAggregates = new Map<string, { correct: number; total: number }>();
    
    analytics.results.forEach(result => {
      if (!result.domains) return;
      result.domains.forEach(d => {
        const existing = domainAggregates.get(d.domain) ?? { correct: 0, total: 0 };
        existing.correct += d.correct;
        existing.total += d.total;
        domainAggregates.set(d.domain, existing);
      });
    });

    if (domainAggregates.size === 0) {
      return (
        <p className="text-sm text-gray-500 py-4 text-center">
          No domain data available. Domain accuracy is tracked for quizzes with domain-tagged questions.
        </p>
      );
    }

    const domainEntries = Array.from(domainAggregates.entries()).sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className="space-y-3">
        {domainEntries.map(([domain, { correct, total }]) => {
          const percentage = total > 0 ? (correct / total) * 100 : 0;
          return (
            <div key={domain} className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-200">{domain}</span>
                <span className="text-gray-400">
                  {correct} / {total} ({percentage.toFixed(0)}%)
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    percentage >= 80 ? 'bg-green-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${percentage}%` }}
                  role="progressbar"
                  aria-valuenow={percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${domain}: ${percentage.toFixed(0)}% accuracy`}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Score Trends chart section ──────────────────────────────────────────

  const renderScoreTrends = () => {
    if (!analytics || analytics.results.length < 2) {
      return null;
    }

    const recent = analytics.results.slice(-20);
    const chartData = recent.map((result, index) => ({
      attempt: index + 1,
      score: result.percentage,
    }));

    return (
      <Card>
        <CardHeader>
          <CardTitle>Score Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="attempt"
                  label={{ value: 'Attempt', position: 'insideBottom', offset: -10 }}
                />
                <YAxis
                  label={{ value: 'Score (%)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Score']}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Flashcard Mastery section ─────────────────────────────────────────────

  const renderFlashcardMastery = () => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Flashcard Mastery</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-gray-800/50 text-center">
                <div className="text-xs text-gray-400 mb-1">Cards Reviewed</div>
                <div className="text-lg font-semibold">{totalReviewed}</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-800/50 text-center">
                <div className="text-xs text-gray-400 mb-1">Mastery</div>
                <div className="text-lg font-semibold">{masteryPct.toFixed(1)}%</div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-200">Overall Mastery</span>
                <span className="text-gray-400">{masteryPct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    masteryPct >= 80 ? 'bg-green-500' : masteryPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${masteryPct}%` }}
                  role="progressbar"
                  aria-valuenow={masteryPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Overall mastery: ${masteryPct.toFixed(1)}%`}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Quiz History */}
      <Card>
        <CardHeader>
          <CardTitle>Quiz History</CardTitle>
        </CardHeader>
        <CardContent>{renderQuizHistory()}</CardContent>
      </Card>

      {/* Score Trends (between Quiz History and Review Session History, shown when ≥2 attempts) */}
      {renderScoreTrends()}

      {/* Review Session History */}
      <Card>
        <CardHeader>
          <CardTitle>Review Session History</CardTitle>
        </CardHeader>
        <CardContent>{renderReviewHistory()}</CardContent>
      </Card>

      {/* Per-domain accuracy */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Accuracy</CardTitle>
        </CardHeader>
        <CardContent>{renderDomainAccuracy()}</CardContent>
      </Card>

      {/* Flashcard Mastery (after Domain Accuracy) */}
      {renderFlashcardMastery()}

      {/* Clear Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Clear Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 mb-4">
            Remove all quiz attempt history and review session records for this exam. This action
            cannot be undone.
          </p>
          <Button
            variant="outline"
            className="border-red-700 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            onClick={() => setShowClearModal(true)}
          >
            Clear Progress
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation modal */}
      <Modal
        isOpen={showClearModal}
        title="Clear Progress"
        message="This will permanently delete all quiz attempts and review session records for this exam. This cannot be undone."
        confirmLabel="Clear Progress"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleClearProgress}
        onCancel={() => setShowClearModal(false)}
      />
    </div>
  );
}
