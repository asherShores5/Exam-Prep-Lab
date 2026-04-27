/**
 * FlashcardViewer — flashcard study mode with two sub-modes:
 *
 * Classic mode (default):
 *  1. Show card front (question text)
 *  2. User clicks "Reveal Answer" → correct answer(s) + explanation shown
 *  3. User clicks "Known ✓" or "Still Learning" → advances to next card
 *  4. After all cards → ReviewSummary screen
 *
 * Multiple-choice mode:
 *  1. Show question + shuffled answer options
 *  2. User selects an option → immediate feedback (correct / incorrect highlight)
 *  3. Explanation is shown below the options
 *  4. User clicks "Next" → advances; result counted as Known/Still Learning
 *  5. After all cards → ReviewSummary screen
 */

import { useState, useMemo } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Shuffle, RotateCcw, CheckCircle, BookOpen, ListChecks, CreditCard, BookmarkPlus } from 'lucide-react';
import type { LegacyQuestion, Deck } from '../../types/index';
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
// Helpers
// ---------------------------------------------------------------------------

/** Shuffle an array (Fisher-Yates) without mutating the original. */
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// MultipleChoiceCard sub-component
// ---------------------------------------------------------------------------

interface MultipleChoiceCardProps {
  question: LegacyQuestion;
  onResult: (correct: boolean) => void;
}

const MultipleChoiceCard = ({ question, onResult }: MultipleChoiceCardProps) => {
  // Shuffle options once per question render (stable via useMemo keyed to question)
  const shuffledOptions = useMemo(
    () => shuffleArray(question.options.map((text, originalIdx) => ({ text, originalIdx }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question.question]
  );

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null); // index into shuffledOptions
  const answered = selectedIdx !== null;

  const isCorrectChoice = (shuffledIdx: number) =>
    question.correctAnswers.includes(shuffledOptions[shuffledIdx].originalIdx);

  function handleSelect(idx: number) {
    if (answered) return;
    setSelectedIdx(idx);
  }

  function getOptionStyle(idx: number): string {
    const base = 'p-3 rounded-lg border text-sm transition-colors ';
    if (!answered) {
      return base + 'border-gray-700 hover:border-gray-500 cursor-pointer';
    }
    if (isCorrectChoice(idx)) {
      return base + 'bg-green-900/30 border-green-600 text-green-200';
    }
    if (idx === selectedIdx) {
      return base + 'bg-red-900/30 border-red-600 text-red-200';
    }
    return base + 'border-gray-700 opacity-50';
  }

  const wasCorrect = answered && selectedIdx !== null && isCorrectChoice(selectedIdx);

  return (
    <div className="space-y-4">
      <Card className="min-h-48">
        <CardContent className="pt-6 space-y-4">
          <p className="text-base">{question.question}</p>

          <div className="space-y-2" role="group" aria-label="Answer options">
            {shuffledOptions.map((opt, idx) => (
              <div
                key={idx}
                role="button"
                tabIndex={answered ? -1 : 0}
                aria-pressed={selectedIdx === idx}
                aria-disabled={answered}
                onClick={() => handleSelect(idx)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(idx); }}
                className={getOptionStyle(idx)}
              >
                <span className="font-mono text-xs text-gray-500 mr-2">
                  {String.fromCharCode(65 + idx)}.
                </span>
                {opt.text}
              </div>
            ))}
          </div>

          {/* Explanation — shown after answering */}
          {answered && question.explanation && (
            <div className="mt-3 p-3 rounded-lg bg-blue-900/20 border border-blue-700/50 text-sm text-blue-200">
              <p className="font-semibold text-blue-300 mb-1">Explanation</p>
              <p>{question.explanation}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {answered && (
        <Button
          className="w-full"
          size="lg"
          onClick={() => onResult(wasCorrect)}
          aria-label={wasCorrect ? 'Correct! Continue to next card' : 'Incorrect. Continue to next card'}
        >
          {wasCorrect ? (
            <><CheckCircle className="w-4 h-4 mr-2 text-green-400" /> Correct — Next</>
          ) : (
            <><BookOpen className="w-4 h-4 mr-2 text-yellow-400" /> Keep Studying — Next</>
          )}
        </Button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FlashcardViewer
// ---------------------------------------------------------------------------

type StudyMode = 'classic' | 'multiple-choice';

interface FlashcardViewerProps {
  questions: LegacyQuestion[];
  shuffleQuestions: () => void;
  /** Available decks to save a card into (from FlashcardsTab) */
  decks: Deck[];
  /** Returns true if saved, false if already exists */
  onSaveCardToDeck: (question: LegacyQuestion, deckId: string) => boolean;
  /** Create a new deck and return it */
  onCreateDeck: (name: string) => Deck;
  /** Optional: flashcard IDs mapped to their data (for mastery tracking) */
  flashcardMap?: Map<string, { id: string; masteryLevel: number }>;
  /** Optional: callback to update mastery when card is rated */
  onUpdateMastery?: (flashcardId: string, known: boolean) => void;
}

export const FlashcardViewer = ({ 
  questions, 
  shuffleQuestions, 
  decks, 
  onSaveCardToDeck, 
  onCreateDeck,
  flashcardMap,
  onUpdateMastery,
}: FlashcardViewerProps) => {
  const [studyMode, setStudyMode] = useState<StudyMode>('classic');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [stillLearningCount, setStillLearningCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);

  // Save-to-deck state
  const [saveDeckId, setSaveDeckId] = useState('');
  const [newDeckNameForSave, setNewDeckNameForSave] = useState('');
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  if (!questions.length) return (
    <div className="py-10 text-center text-gray-500 text-sm">Loading questions…</div>
  );

  // ── Current question (safe after the empty guard) ─────────────────────────
  const question = questions[currentIndex];
  const correctAnswers = question.correctAnswers.map(index => question.options[index]);

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

    if (known) setKnownCount(newKnown);
    else setStillLearningCount(newStillLearning);

    // Update mastery if this is a deck-based review
    if (flashcardMap && onUpdateMastery) {
      const flashcardData = flashcardMap.get(question.question);
      if (flashcardData) {
        onUpdateMastery(flashcardData.id, known);
      }
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
    setShowSavePanel(false);
    setSaveToast(null);
  };

  const handleModeChange = (mode: StudyMode) => {
    setStudyMode(mode);
    handleStartOver();
  };

  // ── Save-to-deck helpers ──────────────────────────────────────────────────

  function showToast(msg: string) {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 2500);
  }

  function handleSaveToDeck() {
    if (!saveDeckId) return;
    const saved = onSaveCardToDeck(question, saveDeckId);
    showToast(saved ? 'Saved to deck!' : 'Already in that deck');
    setShowSavePanel(false);
  }

  function handleCreateDeckAndSave() {
    const name = newDeckNameForSave.trim();
    if (!name) return;
    const deck = onCreateDeck(name);
    setNewDeckNameForSave('');
    const saved = onSaveCardToDeck(question, deck.id);
    showToast(saved ? `Saved to new deck "${deck.name}"` : 'Already in that deck');
    setShowSavePanel(false);
  }

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

  return (
    <div className="space-y-4">
      {/* Header row: progress + mode toggle + shuffle */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Card {currentIndex + 1} of {questions.length}
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs">
            <button
              onClick={() => handleModeChange('classic')}
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
                studyMode === 'classic'
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
              aria-pressed={studyMode === 'classic'}
              title="Classic flashcard mode"
            >
              <CreditCard className="w-3 h-3" />
              Classic
            </button>
            <button
              onClick={() => handleModeChange('multiple-choice')}
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
                studyMode === 'multiple-choice'
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
              aria-pressed={studyMode === 'multiple-choice'}
              title="Multiple choice mode"
            >
              <ListChecks className="w-3 h-3" />
              Multiple Choice
            </button>
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

      {/* Save to Deck button (only show if decks are available) */}
      {decks.length > 0 && !showSavePanel && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSavePanel(true)}
          className="w-full text-xs"
        >
          <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" />
          Save This Card to a Deck
        </Button>
      )}

      {/* Save to Deck panel */}
      {showSavePanel && (
        <Card className="border-blue-700/50 bg-blue-900/10">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-blue-200">Save to Deck</p>
              <button
                onClick={() => setShowSavePanel(false)}
                className="text-gray-400 hover:text-gray-200"
                aria-label="Close save panel"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={saveDeckId}
                onChange={e => setSaveDeckId(e.target.value)}
                className="flex-1 text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1.5 focus:outline-none focus:border-blue-500"
                aria-label="Select deck"
              >
                <option value="">Choose a deck…</option>
                {decks.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <Button size="sm" disabled={!saveDeckId} onClick={handleSaveToDeck} className="text-xs">
                Save
              </Button>
            </div>
            <div className="text-xs text-gray-400 text-center">or</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDeckNameForSave}
                onChange={e => setNewDeckNameForSave(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateDeckAndSave(); }}
                placeholder="New deck name…"
                className="flex-1 text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1.5 focus:outline-none focus:border-blue-500"
                aria-label="New deck name"
              />
              <Button size="sm" disabled={!newDeckNameForSave.trim()} onClick={handleCreateDeckAndSave} className="text-xs">
                Create & Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save toast */}
      {saveToast && (
        <div role="status" aria-live="polite" className="px-3 py-2 rounded-lg bg-green-900/30 border border-green-700 text-green-200 text-xs text-center">
          {saveToast}
        </div>
      )}

      {/* ── Multiple-choice mode ── */}
      {studyMode === 'multiple-choice' && (
        <MultipleChoiceCard
          key={currentIndex}
          question={question}
          onResult={(correct) => advanceCard(correct)}
        />
      )}

      {/* ── Classic mode ── */}
      {studyMode === 'classic' && (
        <>
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

                  {/* Explanation */}
                  {question.explanation && (
                    <div className="mt-3 p-3 rounded-lg bg-blue-900/20 border border-blue-700/50 text-sm text-blue-200">
                      <p className="font-semibold text-blue-300 mb-1">Explanation</p>
                      <p>{question.explanation}</p>
                    </div>
                  )}
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
        </>
      )}
    </div>
  );
};

export default FlashcardViewer;
