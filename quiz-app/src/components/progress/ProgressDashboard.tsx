import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { StorageService } from '../../services/storage';
import type { ReviewSession, Deck, ExamAnalytics } from '../../types/index';

interface ProgressDashboardProps {
  selectedExam: string;
}

export function ProgressDashboard({ selectedExam }: ProgressDashboardProps) {
  const [reviewSessions, setReviewSessions] = useState<ReviewSession[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [analytics, setAnalytics] = useState<ExamAnalytics[string] | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);

  const loadData = useCallback(() => {
    // Load all decks associated with this exam
    const allDecks = StorageService.getDecks();
    const examDecks = allDecks.filter(d => d.examIds.includes(selectedExam));
    setDecks(examDecks);

    // Load review sessions for decks belonging to this exam
    const examDeckIds = new Set(examDecks.map(d => d.id));
    const allSessions = StorageService.getReviewSessions();
    const examSessions = allSessions
      .filter(s => examDeckIds.has(s.deckId))
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    setReviewSessions(examSessions);

    // Load legacy quiz analytics
    const allAnalytics = StorageService.getExamAnalytics();
    setAnalytics(allAnalytics[selectedExam] ?? null);
  }, [selectedExam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getDeckName(deckId: string): string {
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

    // Delete all ReviewSession records for decks associated with this exam
    const examDeckIds = new Set(decks.map(d => d.id));
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
    // Domain accuracy note: the legacy QuizResult type doesn't store domain data.
    // Domain accuracy is available in the quiz results summary during a quiz session,
    // but is not persisted per-domain in ExamAnalytics. Show a note accordingly.
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        Domain accuracy is shown in the quiz results summary after each quiz.
        Per-domain history will be available once domain data is persisted in quiz sessions.
      </p>
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
