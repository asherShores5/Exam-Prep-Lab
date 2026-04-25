import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Modal } from './components/ui/Modal';
import { Shuffle, X, Pencil, Trash2, Plus, ArrowLeft, PlayCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { LegacyQuestion, ExamIndex, QuizResult, ExamAnalytics, Question, Deck, Flashcard } from './types/index';
import { StorageService, QUOTA_EXCEEDED_EVENT, type QuotaExceededDetail } from './services/storage';
import { FlashcardViewer } from './components/flashcard/FlashcardViewer';
import { DeckList } from './components/flashcard/DeckList';
import { DeckForm } from './components/flashcard/DeckForm';
import { FlashcardForm } from './components/flashcard/FlashcardForm';
import { QuestionForm } from './components/management/QuestionForm';
import { QuestionList } from './components/management/QuestionList';
import { ImportExportPanel } from './components/management/ImportExportPanel';
import { ProgressDashboard } from './components/progress/ProgressDashboard';

const ReviewMode = ({ questions, shuffleQuestions }: { questions: LegacyQuestion[], shuffleQuestions: () => void }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  
  if (!questions.length) return <div>Loading questions...</div>;
  
  const question = questions[currentIndex];
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Question {currentIndex + 1} of {questions.length}
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={shuffleQuestions}
        >
          <Shuffle className="w-4 h-4 mr-2" />
          Shuffle
        </Button>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          <p className="text-lg mb-4">{question.question}</p>
          <div className="space-y-2">
            {question.options.map((option, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border ${
                  showAnswer
                    ? question.correctAnswers.includes(idx)
                      ? 'bg-green-900/20 border-green-600'
                      : 'border-gray-700'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                {option}
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex justify-between">
            <Button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowAnswer(!showAnswer)}
            >
              {showAnswer ? 'Hide Answer' : 'Show Answer'}
            </Button>
            <Button
              onClick={() => {
                setCurrentIndex(i => Math.min(questions.length - 1, i + 1));
                setShowAnswer(false);
              }}
              disabled={currentIndex === questions.length - 1}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const AnalyticsDisplay = ({ examId }: { examId: string }) => {
  const [analytics, setAnalytics] = useState<ExamAnalytics[string] | null>(null);
  
  useEffect(() => {
    const allAnalytics = StorageService.getExamAnalytics();
    setAnalytics(allAnalytics[examId] || null);
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
  
  // Prepare data for the chart
  const chartData = analytics.results.map((result, index) => ({
    attempt: index + 1,
    score: result.percentage,
    time: result.timeSpent / 60 // Convert to minutes
  }));
  
  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Quiz Performance Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
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
          </div>
          
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

const QuizMode = ({ questions, selectedExam }: { questions: LegacyQuestion[], selectedExam: string }) => {
  const [answers, setAnswers] = useState<number[][]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [timeLimit, setTimeLimit] = useState(30);
  const [questionCount, setQuestionCount] = useState(10);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [quizQuestions, setQuizQuestions] = useState<LegacyQuestion[]>([]);
  const [shouldSaveResult, setShouldSaveResult] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');

  // Derive distinct domain values from the loaded question set
  const availableDomains = Array.from(
    new Set(questions.map(q => q.domain).filter((d): d is string => !!d))
  ).sort();

  useEffect(() => {
    if (quizStarted && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining(time => {
          if (time <= 1) {
            setShowResults(true);
            setShouldSaveResult(true);
            return 0;
          }
          return time - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [quizStarted, timeRemaining]);

  // Moved the save result effect outside conditional render
  useEffect(() => {
    if (shouldSaveResult && showResults && selectedExam) {
      const score = calculateScore();
      const timeSpent = timeLimit * 60 - timeRemaining;
      
      const result: QuizResult = {
        date: new Date().toISOString(),
        score,
        totalQuestions: quizQuestions.length,
        timeSpent,
        percentage: (score / quizQuestions.length) * 100
      };
      
      const allAnalytics = StorageService.getExamAnalytics();
      
      const examAnalytics = allAnalytics[selectedExam] || {
        results: [],
        averageScore: 0,
        bestScore: 0,
        totalAttempts: 0,
        averageTime: 0
      };
      
      examAnalytics.results.push(result);
      examAnalytics.totalAttempts += 1;
      
      const scores = examAnalytics.results.map(r => r.percentage);
      examAnalytics.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      examAnalytics.bestScore = Math.max(...scores);
      examAnalytics.averageTime = examAnalytics.results.reduce((a, b) => a + b.timeSpent, 0) / examAnalytics.results.length;
      
      allAnalytics[selectedExam] = examAnalytics;
      StorageService.saveExamAnalytics(allAnalytics);
      
      setShouldSaveResult(false);
    }
  }, [shouldSaveResult, showResults, selectedExam, quizQuestions, timeLimit, timeRemaining]);

  const startQuiz = () => {
    const pool = selectedDomain === 'all'
      ? questions
      : questions.filter(q => q.domain === selectedDomain);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setQuizQuestions(shuffled.slice(0, questionCount));
    setTimeRemaining(timeLimit * 60);
    setAnswers(Array(questionCount).fill([]));
    setCurrentIndex(0);
    setQuizStarted(true);
    setShouldSaveResult(false);
  };

  const calculateScore = () => {
    let correct = 0;
    answers.forEach((answer, idx) => {
      if (JSON.stringify(answer.sort()) === JSON.stringify(quizQuestions[idx].correctAnswers.sort())) {
        correct++;
      }
    });
    return correct;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleAnswer = (idx: number) => {
    setAnswers(prev => {
      const newAnswers = [...prev];
      const currentAnswers = new Set(newAnswers[currentIndex]);
      
      if (currentAnswers.has(idx)) {
        currentAnswers.delete(idx);
      } else {
        currentAnswers.add(idx);
      }
      
      newAnswers[currentIndex] = Array.from(currentAnswers);
      return newAnswers;
    });
  };

  if (!quizStarted) {
    // Determine the effective pool size for the selected domain
    const poolSize = selectedDomain === 'all'
      ? questions.length
      : questions.filter(q => q.domain === selectedDomain).length;

    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl mb-6">Quiz Settings</h2>
            <div className="space-y-4">
              {availableDomains.length > 0 && (
                <div>
                  <label className="block text-sm mb-2">Domain Filter</label>
                  <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Domains</SelectItem>
                      {availableDomains.map(domain => (
                        <SelectItem key={domain} value={domain}>
                          {domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="block text-sm mb-2">Number of Questions</label>
                <Select value={questionCount.toString()} onValueChange={(value) => setQuestionCount(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 40, 50].map(num => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} Questions
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm mb-2">Time Limit (minutes)</label>
                <Select value={timeLimit.toString()} onValueChange={(value) => setTimeLimit(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60, 90].map(num => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} Minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={startQuiz}
                className="w-full mt-4"
                disabled={poolSize < questionCount}
              >
                Start Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
        <AnalyticsDisplay examId={selectedExam} />
      </div>
    );
  }

  if (showResults) {
    const score = calculateScore();
    // const timeSpent = timeLimit * 60 - timeRemaining;

    // Build per-domain accuracy breakdown
    const domainMap = new Map<string, { correct: number; total: number }>();
    quizQuestions.forEach((q, idx) => {
      const domainKey = q.domain || 'Uncategorized';
      const entry = domainMap.get(domainKey) ?? { correct: 0, total: 0 };
      entry.total += 1;
      const isCorrect = JSON.stringify((answers[idx] ?? []).sort()) === JSON.stringify([...q.correctAnswers].sort());
      if (isCorrect) entry.correct += 1;
      domainMap.set(domainKey, entry);
    });

    const hasDomainData = quizQuestions.some(q => !!q.domain);
    const domainEntries = Array.from(domainMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    
    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-2xl mb-4">Quiz Results</h2>
          <div className="space-y-4">
            <p className="text-lg">
              Score: {score} / {quizQuestions.length} ({((score / quizQuestions.length) * 100).toFixed(1)}%)
            </p>

            {hasDomainData && (
              <div>
                <h3 className="text-base font-semibold mb-2">Domain Breakdown</h3>
                <div className="space-y-2">
                  {domainEntries.map(([domain, { correct, total }]) => (
                    <div key={domain} className="flex justify-between items-center p-3 rounded-lg bg-gray-800/30">
                      <span className="text-sm font-medium">{domain}</span>
                      <span className="text-sm text-gray-300">
                        {correct} / {total} correct ({((correct / total) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={() => {
                setQuizStarted(false);
                setShowResults(false);
              }}
              className="w-full"
            >
              New Quiz
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!quizQuestions.length) return <div>Loading questions...</div>;

  const question = quizQuestions[currentIndex];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-sm text-gray-400">
        <div>Question {currentIndex + 1} of {quizQuestions.length}</div>
        <div>Time Remaining: {formatTime(timeRemaining)}</div>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          <p className="text-lg mb-4">{question.question}</p>
          <div className="space-y-2">
            {question.options.map((option, idx) => (
              <div
                key={idx}
                onClick={() => toggleAnswer(idx)}
                className={`p-3 rounded-lg border cursor-pointer ${
                  answers[currentIndex]?.includes(idx)
                    ? 'bg-blue-900/20 border-blue-600'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                {option}
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex justify-between">
            <Button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
            {currentIndex === quizQuestions.length - 1 ? (
              <Button onClick={() => {
                setShowResults(true);
                setShouldSaveResult(true);
              }}>
                Finish Quiz
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentIndex(i => Math.min(quizQuestions.length - 1, i + 1))}
              >
                Next
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};



// ---------------------------------------------------------------------------
// FlashcardsTab — deck management + review sub-views
// ---------------------------------------------------------------------------

interface FlashcardsTabProps {
  examId: string;
  legacyQuestions: LegacyQuestion[];
  shuffleLegacy: () => void;
}

const FlashcardsTab = ({ examId, legacyQuestions, shuffleLegacy }: FlashcardsTabProps) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [decks, setDecks] = useState<Deck[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  // 'manage' = deck list + card list; 'review' = FlashcardViewer
  const [deckView, setDeckView] = useState<'manage' | 'review'>('manage');

  // Form visibility states
  // null = hidden, 'new' = create form, Deck = edit form
  const [deckFormState, setDeckFormState] = useState<null | 'new' | Deck>(null);
  // null = hidden, 'new' = create form, Flashcard = edit form
  const [cardFormState, setCardFormState] = useState<null | 'new' | Flashcard>(null);

  // Delete confirmation for flashcards
  const [pendingDeleteCardId, setPendingDeleteCardId] = useState<string | null>(null);

  // ── Load from storage when exam changes ───────────────────────────────────
  useEffect(() => {
    const allDecks = StorageService.getDecks().filter(d => d.examIds.includes(examId));
    const allCards = StorageService.getFlashcards();
    setDecks(allDecks);
    setFlashcards(allCards);
    setSelectedDeckId(null);
    setDeckView('manage');
    setDeckFormState(null);
    setCardFormState(null);
  }, [examId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedDeck = decks.find(d => d.id === selectedDeckId) ?? null;
  const deckCards = selectedDeckId
    ? flashcards.filter(f => f.deckId === selectedDeckId)
    : [];

  // ── Deck CRUD ─────────────────────────────────────────────────────────────
  function handleSaveDeck(deck: Deck) {
    const allDecks = StorageService.getDecks();
    const idx = allDecks.findIndex(d => d.id === deck.id);
    const updated = idx >= 0
      ? allDecks.map(d => (d.id === deck.id ? deck : d))
      : [...allDecks, deck];
    StorageService.saveDecks(updated);
    setDecks(updated.filter(d => d.examIds.includes(examId)));
    setDeckFormState(null);
  }

  function handleDeleteDeck(deckId: string) {
    // Remove deck and all its flashcards
    const allDecks = StorageService.getDecks().filter(d => d.id !== deckId);
    const allCards = StorageService.getFlashcards().filter(f => f.deckId !== deckId);
    StorageService.saveDecks(allDecks);
    StorageService.saveFlashcards(allCards);
    setDecks(allDecks.filter(d => d.examIds.includes(examId)));
    setFlashcards(allCards);
    if (selectedDeckId === deckId) {
      setSelectedDeckId(null);
      setDeckView('manage');
    }
  }

  // ── Flashcard CRUD ────────────────────────────────────────────────────────
  function handleSaveCard(card: Flashcard) {
    const allCards = StorageService.getFlashcards();
    const idx = allCards.findIndex(c => c.id === card.id);
    const updated = idx >= 0
      ? allCards.map(c => (c.id === card.id ? card : c))
      : [...allCards, card];
    StorageService.saveFlashcards(updated);
    setFlashcards(updated);
    setCardFormState(null);
  }

  function handleDeleteCard(cardId: string) {
    const updated = StorageService.getFlashcards().filter(c => c.id !== cardId);
    StorageService.saveFlashcards(updated);
    setFlashcards(updated);
    setPendingDeleteCardId(null);
  }

  // ── Convert Flashcard[] → LegacyQuestion[] for FlashcardViewer ───────────
  function toViewerQuestions(cards: Flashcard[]): LegacyQuestion[] {
    return cards.map(c => ({
      question: c.front,
      options: [c.back],
      correctAnswers: [0],
      explanation: '',
    }));
  }

  // ── Review view ───────────────────────────────────────────────────────────
  if (deckView === 'review' && selectedDeck) {
    const viewerQuestions = toViewerQuestions(deckCards);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeckView('manage')}
            aria-label="Back to deck management"
          >
            <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
            Back
          </Button>
          <span className="text-sm text-gray-400">Reviewing: <strong className="text-gray-200">{selectedDeck.name}</strong></span>
        </div>
        {viewerQuestions.length > 0 ? (
          <FlashcardViewer
            questions={viewerQuestions}
            shuffleQuestions={() => {/* shuffle handled inside viewer */}}
          />
        ) : (
          <div className="py-10 text-center text-gray-500 text-sm">
            This deck has no cards yet. Add some cards before starting a review.
          </div>
        )}
      </div>
    );
  }

  // ── Manage view ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Deck list section ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Decks</h2>
        {deckFormState === null && (
          <Button size="sm" onClick={() => setDeckFormState('new')}>
            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            New Deck
          </Button>
        )}
      </div>

      {/* Deck create/edit form */}
      {deckFormState !== null && (
        <DeckForm
          examId={examId}
          deck={deckFormState === 'new' ? undefined : deckFormState}
          onSave={handleSaveDeck}
          onCancel={() => setDeckFormState(null)}
        />
      )}

      <DeckList
        decks={decks}
        flashcards={flashcards}
        selectedDeckId={selectedDeckId}
        onSelect={id => {
          setSelectedDeckId(id);
          setCardFormState(null);
        }}
        onEdit={deck => {
          setDeckFormState(deck);
          setCardFormState(null);
        }}
        onDelete={handleDeleteDeck}
      />

      {/* ── Cards section (shown when a deck is selected) ── */}
      {selectedDeck && (
        <div className="space-y-3 pt-2 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">
              Cards in "{selectedDeck.name}"
            </h3>
            <div className="flex items-center gap-2">
              {deckCards.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeckView('review')}
                  aria-label={`Start review session for ${selectedDeck.name}`}
                >
                  <PlayCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                  Start Review
                </Button>
              )}
              {cardFormState === null && (
                <Button size="sm" onClick={() => setCardFormState('new')}>
                  <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                  Add Card
                </Button>
              )}
            </div>
          </div>

          {/* Card create/edit form */}
          {cardFormState !== null && (
            <FlashcardForm
              deckId={selectedDeck.id}
              flashcard={cardFormState === 'new' ? undefined : cardFormState}
              onSave={handleSaveCard}
              onCancel={() => setCardFormState(null)}
            />
          )}

          {/* Card list */}
          {deckCards.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No cards yet. Add your first card above.
            </p>
          ) : (
            <ul className="space-y-2" role="list" aria-label={`Cards in ${selectedDeck.name}`}>
              {deckCards.map(card => (
                <li
                  key={card.id}
                  className="flex items-start justify-between rounded-lg border border-gray-700 px-4 py-3 bg-gray-900/40"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm font-medium truncate">{card.front}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{card.back}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit card: ${card.front}`}
                      onClick={() => setCardFormState(card)}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete card: ${card.front}`}
                      onClick={() => setPendingDeleteCardId(card.id)}
                      className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Legacy fallback (no deck selected) ── */}
      {!selectedDeck && decks.length > 0 && (
        <p className="text-xs text-gray-600 text-center pt-2">
          Select a deck above to manage its cards or start a review session.
        </p>
      )}

      {/* ── Legacy flashcard viewer (no decks at all) ── */}
      {decks.length === 0 && legacyQuestions.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-3 text-center">
            No custom decks yet — showing legacy flashcards from the exam file.
          </p>
          <FlashcardViewer questions={legacyQuestions} shuffleQuestions={shuffleLegacy} />
        </div>
      )}

      {/* Flashcard delete confirmation */}
      <Modal
        isOpen={pendingDeleteCardId !== null}
        title="Delete Flashcard"
        message="Delete this flashcard? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => pendingDeleteCardId && handleDeleteCard(pendingDeleteCardId)}
        onCancel={() => setPendingDeleteCardId(null)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// QuizApp — root component
// ---------------------------------------------------------------------------

type TabValue = 'review' | 'quiz' | 'flashcards' | 'manage' | 'progress';

const TAB_LABELS: Record<TabValue, string> = {
  review: 'Review',
  quiz: 'Quiz',
  flashcards: 'Flashcards',
  manage: 'Manage',
  progress: 'Progress',
};

const TAB_ORDER: TabValue[] = ['review', 'quiz', 'flashcards', 'manage', 'progress'];

const QuizApp = () => {
  const [examIndex, setExamIndex] = useState<ExamIndex[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [questions, setQuestions] = useState<LegacyQuestion[]>([]);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // Controlled tab state (needed for mobile nav)
  const [activeTab, setActiveTab] = useState<TabValue>('review');
  // Mobile menu open/close state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Ref for click-outside detection on mobile menu
  const mobileNavRef = useRef<HTMLDivElement>(null);

  // User-managed questions (new canonical Question type, stored in StorageService)
  const [userQuestions, setUserQuestions] = useState<Question[]>([]);
  // Form visibility: null = hidden, undefined = new, Question = edit
  const [editingQuestion, setEditingQuestion] = useState<Question | null | undefined>(null);

  // Listen for quota-exceeded events from StorageService
  const handleQuotaExceeded = useCallback((e: Event) => {
    const detail = (e as CustomEvent<QuotaExceededDetail>).detail;
    setStorageWarning(detail.message);
  }, []);

  useEffect(() => {
    window.addEventListener(QUOTA_EXCEEDED_EVENT, handleQuotaExceeded);
    return () => window.removeEventListener(QUOTA_EXCEEDED_EVENT, handleQuotaExceeded);
  }, [handleQuotaExceeded]);

  // Close mobile menu when clicking outside the nav container
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileNavRef.current && !mobileNavRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);
  
  useEffect(() => {
    // Load saved exam selection
    const savedExam = StorageService.getSelectedExam();
    if (savedExam) {
      setSelectedExam(savedExam);
    }
    
    fetch('/exams/index.json')
      .then(res => res.json())
      .then(setExamIndex)
      .catch(console.error);
  }, []);
  
  useEffect(() => {
    if (selectedExam) {
      // Save exam selection
      StorageService.saveSelectedExam(selectedExam);
      
      const exam = examIndex.find(e => e.id === selectedExam);
      if (exam) {
        fetch(exam.path)
          .then(res => res.json())
          .then(setQuestions)
          .catch(console.error);
      }

      // Load user-managed questions for this exam
      const allUserQuestions = StorageService.getQuestions();
      setUserQuestions(allUserQuestions.filter(q => q.examId === selectedExam));
      // Reset form state when exam changes
      setEditingQuestion(null);
    }
  }, [selectedExam, examIndex]);
  
  const shuffleQuestions = () => {
    setQuestions(questions => [...questions].sort(() => Math.random() - 0.5));
  };

  // ── User-managed question handlers ────────────────────────────────────────

  function handleSaveQuestion(q: Question) {
    const allStored = StorageService.getQuestions();
    const existingIdx = allStored.findIndex(s => s.id === q.id);
    let updated: Question[];
    if (existingIdx >= 0) {
      updated = allStored.map(s => (s.id === q.id ? q : s));
    } else {
      updated = [...allStored, q];
    }
    StorageService.saveQuestions(updated);
    setUserQuestions(updated.filter(s => s.examId === selectedExam));
    setEditingQuestion(null);
  }

  function handleDeleteQuestion(id: string) {
    const allStored = StorageService.getQuestions();
    const updated = allStored.filter(s => s.id !== id);
    StorageService.saveQuestions(updated);
    setUserQuestions(updated.filter(s => s.examId === selectedExam));
  }
  
  return (
    <div className="max-w-2xl mx-auto p-4">
      {storageWarning && (
        <div
          role="alert"
          className="flex items-center justify-between mb-4 px-4 py-3 rounded-lg bg-yellow-900/40 border border-yellow-600 text-yellow-200 text-sm"
        >
          <span>{storageWarning}</span>
          <button
            aria-label="Dismiss storage warning"
            onClick={() => setStorageWarning(null)}
            className="ml-4 shrink-0 text-yellow-400 hover:text-yellow-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="mb-4">
        <Select value={selectedExam} onValueChange={setSelectedExam}>
          <SelectTrigger>
            <SelectValue placeholder="Choose an exam..." />
          </SelectTrigger>
          <SelectContent>
            {examIndex.map(exam => (
              <SelectItem key={exam.id} value={exam.id}>
                {exam.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {selectedExam && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          {/* ── Desktop navigation (md and above) ── */}
          <TabsList className="hidden md:flex w-full">
            <TabsTrigger value="review" className="flex-1">Review</TabsTrigger>
            <TabsTrigger value="quiz" className="flex-1">Quiz</TabsTrigger>
            <TabsTrigger value="flashcards" className="flex-1">Flashcards</TabsTrigger>
            <TabsTrigger value="manage" className="flex-1">Manage</TabsTrigger>
            <TabsTrigger value="progress" className="flex-1">Progress</TabsTrigger>
          </TabsList>

          {/* ── Mobile navigation (below md) ── */}
          <div ref={mobileNavRef} className="flex md:hidden flex-col relative">
            {/* Mobile header bar */}
            <div className="flex items-center justify-between rounded-lg bg-gray-900/50 px-4 py-2 min-h-[44px]">
              <span className="text-sm font-medium text-gray-100">
                {TAB_LABELS[activeTab]}
              </span>
              <button
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
                aria-haspopup="true"
                onClick={() => setMobileMenuOpen(open => !open)}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-gray-300 hover:text-gray-100 hover:bg-gray-700/50 transition-colors"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <span className="text-xl leading-none" aria-hidden="true">☰</span>
                )}
              </button>
            </div>

            {/* Mobile dropdown menu */}
            {mobileMenuOpen && (
              <div
                role="menu"
                className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-gray-700 bg-gray-900 shadow-lg overflow-hidden"
              >
                {TAB_ORDER.map((tab) => (
                  <button
                    key={tab}
                    role="menuitem"
                    onClick={() => {
                      setActiveTab(tab);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center w-full px-4 min-h-[44px] text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-gray-800 text-gray-100'
                        : 'text-gray-300 hover:bg-gray-800/60 hover:text-gray-100'
                    }`}
                  >
                    {TAB_LABELS[tab]}
                    {activeTab === tab && (
                      <span className="ml-auto text-blue-400" aria-hidden="true">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="mt-4">
            <TabsContent value="review">
              <ReviewMode questions={questions} shuffleQuestions={shuffleQuestions} />
            </TabsContent>
            <TabsContent value="quiz">
              <QuizMode 
                questions={questions} 
                selectedExam={selectedExam}
              />
            </TabsContent>
            <TabsContent value="flashcards">
              <FlashcardsTab
                examId={selectedExam}
                legacyQuestions={questions}
                shuffleLegacy={shuffleQuestions}
              />
            </TabsContent>
            <TabsContent value="manage">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Manage Questions</h2>
                  {editingQuestion === null && (
                    <Button
                      size="sm"
                      onClick={() => setEditingQuestion(undefined)}
                    >
                      + Add Question
                    </Button>
                  )}
                </div>

                {/* Form: shown when editingQuestion is undefined (new) or a Question (edit) */}
                {editingQuestion !== null && (
                  <QuestionForm
                    examId={selectedExam}
                    question={editingQuestion ?? undefined}
                    onSave={handleSaveQuestion}
                    onCancel={() => setEditingQuestion(null)}
                  />
                )}

                <QuestionList
                  examId={selectedExam}
                  questions={userQuestions}
                  onEdit={q => setEditingQuestion(q)}
                  onDelete={handleDeleteQuestion}
                />

                <hr className="border-gray-700 my-2" />

                <ImportExportPanel />
              </div>
            </TabsContent>
            <TabsContent value="progress">
              <ProgressDashboard selectedExam={selectedExam} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
};

export default QuizApp;