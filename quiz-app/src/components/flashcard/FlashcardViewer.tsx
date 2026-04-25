/**
 * FlashcardViewer — upgraded flashcard study mode with Known / Still Learning tracking.
 *
 * Flow:
 *  1. Show card front (question text)
 *  2. User clicks "Reveal Answer" → back is shown
 *  3. User clicks "Known ✓" or "Still Learning" → advances to next card automatically
 *  4. After all cards are rated → ReviewSummary screen is shown
 *  5. ReviewSession is saved to StorageService on completion
 */

import { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Shuffle, RotateCcw, CheckCircle, BookOpen } from 'lucide-react';
import type { LegacyQuestion } from '../../types/index';
import { StorageService } from '../../services/storage';

// ---------------------------------------------------------------------------
// ReviewSummary sub-component
// ---------------------------------------------------------------------------

interface ReviewSummaryProps {
  totalCards: number;
  knownCount: number;
  stillLearningCount: number;
  onStartOver: () => void;
}

const ReviewSummary = ({ totalCards, knownCount, stillLearningCount, onStartOver }: ReviewSummaryProps) => {
  const knownPct = totalCards > 0 ? Math.round((knownCount / totalCards) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-1">Session Complete!</h2>
        <p className="text-gray-400 text-sm">Here's how you did</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-gray-800/50">
              <div className="text-sm text-gray-400 mb-1">Total Cards</div>
              <div className="text-3xl font-bold">{totalCards}</div>
            </div>
            <div className="p-4 rounded-lg bg-green-900/30 border border-green-700">
              <div className="text-sm text-green-400 mb-1">Known</div>
              <div className="text-3xl font-bold text-green-400">{knownCount}</div>
            </div>
            <div className="p-4 rounded-lg bg-yellow-900/30 border border-yellow-700">
              <div className="text-sm text-yellow-400 mb-1">Still Learning</div>
              <div className="text-3xl font-bold text-yellow-400">{stillLearningCount}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>Known</span>
              <span>{knownPct}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${knownPct}%` }}
                role="progressbar"
                aria-valuenow={knownPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${knownPct}% of cards marked as known`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={onStartOver}
        className="w-full"
        size="lg"
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        Start Over
      </Button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// FlashcardViewer
// ---------------------------------------------------------------------------

interface FlashcardViewerProps {
  questions: LegacyQuestion[];
  shuffleQuestions: () => void;
}

export const FlashcardViewer = ({ questions, shuffleQuestions }: FlashcardViewerProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [stillLearningCount, setStillLearningCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);

  if (!questions.length) return <div>Loading questions...</div>;

  // ── Helpers ──────────────────────────────────────────────────────────────

  const saveSession = (known: number, stillLearning: number) => {
    const session = {
      id: crypto.randomUUID(),
      deckId: 'legacy',
      totalCards: questions.length,
      knownCount: known,
      stillLearningCount: stillLearning,
      shuffled: false,
      completedAt: new Date().toISOString(),
    };
    const existing = StorageService.getReviewSessions();
    StorageService.saveReviewSessions([...existing, session]);
  };

  const advanceCard = (known: boolean) => {
    const newKnown = known ? knownCount + 1 : knownCount;
    const newStillLearning = known ? stillLearningCount : stillLearningCount + 1;

    if (known) {
      setKnownCount(newKnown);
    } else {
      setStillLearningCount(newStillLearning);
    }

    const isLastCard = currentIndex === questions.length - 1;

    if (isLastCard) {
      saveSession(newKnown, newStillLearning);
      setSessionComplete(true);
    } else {
      setCurrentIndex(i => i + 1);
      setIsRevealed(false);
    }
  };

  const handleStartOver = () => {
    setCurrentIndex(0);
    setIsRevealed(false);
    setKnownCount(0);
    setStillLearningCount(0);
    setSessionComplete(false);
  };

  // ── Session complete screen ───────────────────────────────────────────────

  if (sessionComplete) {
    return (
      <ReviewSummary
        totalCards={questions.length}
        knownCount={knownCount}
        stillLearningCount={stillLearningCount}
        onStartOver={handleStartOver}
      />
    );
  }

  // ── Active session ────────────────────────────────────────────────────────

  const question = questions[currentIndex];
  const correctAnswers = question.correctAnswers.map(index => question.options[index]);

  return (
    <div className="space-y-4">
      {/* Header row: progress + shuffle */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Card {currentIndex + 1} of {questions.length}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            shuffleQuestions();
            handleStartOver();
          }}
          aria-label="Shuffle cards and restart session"
        >
          <Shuffle className="w-4 h-4 mr-2" />
          Shuffle
        </Button>
      </div>

      {/* Running tally */}
      <div className="flex gap-3 text-sm">
        <span className="flex items-center gap-1 text-green-400">
          <CheckCircle className="w-3.5 h-3.5" />
          Known: {knownCount}
        </span>
        <span className="flex items-center gap-1 text-yellow-400">
          <BookOpen className="w-3.5 h-3.5" />
          Still Learning: {stillLearningCount}
        </span>
      </div>

      {/* Card */}
      <Card className="min-h-64">
        <CardContent className="pt-6 flex flex-col items-center justify-center min-h-64">
          {/* Front — always visible */}
          <p className="text-lg text-center mb-6">{question.question}</p>

          {/* Back — shown after reveal */}
          {isRevealed && (
            <div className="w-full space-y-2 mt-2 border-t border-gray-700 pt-4">
              <p className="text-sm text-gray-400 mb-2 text-center">Answer</p>
              {correctAnswers.map((answer, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border bg-green-900/20 border-green-600 text-sm"
                >
                  {answer}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      {!isRevealed ? (
        <Button
          className="w-full"
          size="lg"
          onClick={() => setIsRevealed(true)}
        >
          Reveal Answer
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="bg-green-700 hover:bg-green-600 text-white border-0"
            onClick={() => advanceCard(true)}
            aria-label="Mark card as known"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Known ✓
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-yellow-600 text-yellow-400 hover:bg-yellow-900/20"
            onClick={() => advanceCard(false)}
            aria-label="Mark card as still learning"
          >
            <BookOpen className="w-4 h-4 mr-2" />
            Still Learning
          </Button>
        </div>
      )}
    </div>
  );
};

export default FlashcardViewer;
