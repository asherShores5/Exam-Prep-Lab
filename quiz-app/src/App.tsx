import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Modal } from './components/ui/Modal';
import { Shuffle, X, ArrowLeft, PlayCircle, Search, Plus, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { LegacyQuestion, ExamIndex, QuizResult, QuizResultDomain, ExamAnalytics, Deck, Flashcard } from './types/index';
import { StorageService, QUOTA_EXCEEDED_EVENT, type QuotaExceededDetail } from './services/storage';
import { FlashcardViewer } from './components/flashcard/FlashcardViewer';
import { ImportExportPanel } from './components/management/ImportExportPanel';
import { ProgressDashboard } from './components/progress/ProgressDashboard';

// ---------------------------------------------------------------------------
// ReviewMode
// ---------------------------------------------------------------------------

const ReviewMode = ({ questions, shuffleQuestions }: { questions: LegacyQuestion[], shuffleQuestions: () => void }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  if (!questions.length) return (
    <div className="py-10 text-center text-gray-500 text-sm">Loading questions…</div>
  );

  const question = questions[currentIndex];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Question {currentIndex + 1} of {questions.length}
        </div>
        <Button variant="outline" size="sm" onClick={shuffleQuestions}>
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
            <Button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}>
              Previous
            </Button>
            <Button variant="outline" onClick={() => setShowAnswer(!showAnswer)}>
              {showAnswer ? 'Hide Answer' : 'Show Answer'}
            </Button>
            <Button
              onClick={() => { setCurrentIndex(i => Math.min(questions.length - 1, i + 1)); setShowAnswer(false); }}
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

// ---------------------------------------------------------------------------
// AnalyticsDisplay (shown below quiz settings)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// QuizMode
// ---------------------------------------------------------------------------

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

  useEffect(() => {
    if (shouldSaveResult && showResults && selectedExam) {
      const score = calculateScore();
      const timeSpent = timeLimit * 60 - timeRemaining;

      // Build per-domain breakdown to persist with this result
      const domainMap = new Map<string, { correct: number; total: number }>();
      quizQuestions.forEach((q, idx) => {
        if (!q.domain) return;
        const entry = domainMap.get(q.domain) ?? { correct: 0, total: 0 };
        entry.total += 1;
        const isCorrect = JSON.stringify((answers[idx] ?? []).sort()) === JSON.stringify([...q.correctAnswers].sort());
        if (isCorrect) entry.correct += 1;
        domainMap.set(q.domain, entry);
      });
      const domains: QuizResultDomain[] = Array.from(domainMap.entries()).map(([domain, d]) => ({
        domain,
        correct: d.correct,
        total: d.total,
      }));

      const result: QuizResult = {
        date: new Date().toISOString(),
        score,
        totalQuestions: quizQuestions.length,
        timeSpent,
        percentage: (score / quizQuestions.length) * 100,
        ...(domains.length > 0 ? { domains } : {}),
      };

      const allAnalytics = StorageService.getExamAnalytics();
      const examAnalytics = allAnalytics[selectedExam] || {
        results: [],
        averageScore: 0,
        bestScore: 0,
        totalAttempts: 0,
        averageTime: 0,
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
      if (currentAnswers.has(idx)) currentAnswers.delete(idx);
      else currentAnswers.add(idx);
      newAnswers[currentIndex] = Array.from(currentAnswers);
      return newAnswers;
    });
  };

  if (!quizStarted) {
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Domains</SelectItem>
                      {availableDomains.map(domain => (
                        <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="block text-sm mb-2">Number of Questions</label>
                <Select value={questionCount.toString()} onValueChange={(value) => setQuestionCount(parseInt(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 40, 50].map(num => (
                      <SelectItem key={num} value={num.toString()}>{num} Questions</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm mb-2">Time Limit (minutes)</label>
                <Select value={timeLimit.toString()} onValueChange={(value) => setTimeLimit(parseInt(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60, 90].map(num => (
                      <SelectItem key={num} value={num.toString()}>{num} Minutes</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={startQuiz} className="w-full mt-4" disabled={poolSize < questionCount}>
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
            <Button onClick={() => { setQuizStarted(false); setShowResults(false); }} className="w-full">
              New Quiz
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!quizQuestions.length) return <div className="py-10 text-center text-gray-500 text-sm">Loading questions…</div>;

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
            <Button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}>
              Previous
            </Button>
            {currentIndex === quizQuestions.length - 1 ? (
              <Button onClick={() => { setShowResults(true); setShouldSaveResult(true); }}>
                Finish Quiz
              </Button>
            ) : (
              <Button onClick={() => setCurrentIndex(i => Math.min(quizQuestions.length - 1, i + 1))}>
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
// QuestionSearchPanel — fuzzy search through exam bank to add cards to a deck
// ---------------------------------------------------------------------------

interface QuestionSearchPanelProps {
  examId: string;
  questions: LegacyQuestion[];
  decks: Deck[];
  flashcards: Flashcard[];
  onCardAdded: (card: Flashcard) => void;
  onCreateDeck: (name: string) => Deck;
}

const QuestionSearchPanel = ({
  examId: _examId,
  questions,
  decks,
  flashcards,
  onCardAdded,
  onCreateDeck,
}: QuestionSearchPanelProps) => {
  const [query, setQuery] = useState('');
  const [addedToast, setAddedToast] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [showNewDeckFor, setShowNewDeckFor] = useState<number | null>(null);
  const [targetDeckId, setTargetDeckId] = useState<string>('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return questions
      .map((question, idx) => ({ question, idx }))
      .filter(({ question }) =>
        words.every(w => question.question.toLowerCase().includes(w))
      )
      .slice(0, 20);
  }, [query, questions]);

  const addedQuestions = useMemo(
    () => new Set(flashcards.map(f => f.front)),
    [flashcards]
  );

  function showToast(msg: string) {
    setAddedToast(msg);
    setTimeout(() => setAddedToast(null), 2500);
  }

  function addToDeck(question: LegacyQuestion, deckId: string) {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
    const correctText = question.correctAnswers.map(i => question.options[i]).join(' / ');
    const card: Flashcard = {
      id: crypto.randomUUID(),
      deckId,
      front: question.question,
      back: correctText,
      masteryLevel: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onCardAdded(card);
    showToast(`Added to "${deck.name}"`);
  }

  function handleCreateDeckAndAdd(question: LegacyQuestion) {
    const name = newDeckName.trim();
    if (!name) return;
    const deck = onCreateDeck(name);
    setNewDeckName('');
    setShowNewDeckFor(null);
    addToDeck(question, deck.id);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search exam questions to add to a deck…"
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          aria-label="Search exam questions"
        />
      </div>

      {addedToast && (
        <div role="status" aria-live="polite" className="px-3 py-2 rounded-lg bg-green-900/30 border border-green-700 text-green-200 text-xs text-center">
          {addedToast}
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No questions match your search.</p>
      )}

      {results.length > 0 && (
        <ul className="space-y-2" role="list">
          {results.map(({ question, idx }) => {
            const alreadyAdded = addedQuestions.has(question.question);
            const isExpanded = showNewDeckFor === idx;
            return (
              <li key={idx} className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3 space-y-2">
                <p className="text-sm text-gray-200 leading-snug">{question.question}</p>
                {question.domain && (
                  <span className="inline-block text-xs text-gray-500 bg-gray-800 rounded px-2 py-0.5">
                    {question.domain}
                  </span>
                )}
                {alreadyAdded ? (
                  <p className="text-xs text-green-500">Already in a deck</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {decks.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={targetDeckId}
                          onChange={e => setTargetDeckId(e.target.value)}
                          className="text-xs rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 focus:outline-none focus:border-blue-500"
                          aria-label="Select deck"
                        >
                          <option value="">Pick a deck…</option>
                          {decks.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <Button size="sm" disabled={!targetDeckId} onClick={() => addToDeck(question, targetDeckId)} className="text-xs h-7 px-2">
                          Add
                        </Button>
                      </div>
                    )}
                    <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setShowNewDeckFor(isExpanded ? null : idx)}>
                      <Plus className="w-3 h-3 mr-1" />
                      New Deck
                    </Button>
                  </div>
                )}
                {isExpanded && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newDeckName}
                      onChange={e => setNewDeckName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateDeckAndAdd(question); }}
                      placeholder="Deck name…"
                      className="flex-1 text-xs rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 focus:outline-none focus:border-blue-500"
                      autoFocus
                      aria-label="New deck name"
                    />
                    <Button size="sm" disabled={!newDeckName.trim()} onClick={() => handleCreateDeckAndAdd(question)} className="text-xs h-7 px-2">
                      Create & Add
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!query.trim() && (
        <p className="text-xs text-gray-600 text-center py-2">
          Type to search through {questions.length} questions in this exam.
        </p>
      )}
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
  const [decks, setDecks] = useState<Deck[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckView, setDeckView] = useState<'manage' | 'review'>('manage');
  const [manageView, setManageView] = useState<'decks' | 'search'>('decks');

  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renameDeckName, setRenameDeckName] = useState('');
  const [pendingDeleteDeckId, setPendingDeleteDeckId] = useState<string | null>(null);

  useEffect(() => {
    const allDecks = StorageService.getDecks().filter(d => d.examIds.includes(examId));
    const allCards = StorageService.getFlashcards();
    setDecks(allDecks);
    setFlashcards(allCards);
    setSelectedDeckId(null);
    setDeckView('manage');
    setManageView('decks');
    setShowNewDeckForm(false);
  }, [examId]);

  const selectedDeck = decks.find(d => d.id === selectedDeckId) ?? null;
  const deckCards = selectedDeckId ? flashcards.filter(f => f.deckId === selectedDeckId) : [];

  // ── Deck CRUD ─────────────────────────────────────────────────────────────

  function createDeck(name: string): Deck {
    const deck: Deck = {
      id: crypto.randomUUID(),
      name,
      examIds: [examId],
      createdAt: new Date().toISOString(),
    };
    const allDecks = StorageService.getDecks();
    StorageService.saveDecks([...allDecks, deck]);
    setDecks(prev => [...prev, deck]);
    return deck;
  }

  function handleCreateDeck() {
    const name = newDeckName.trim();
    if (!name) return;
    createDeck(name);
    setNewDeckName('');
    setShowNewDeckForm(false);
  }

  function handleRenameDeck(deckId: string) {
    const name = renameDeckName.trim();
    if (!name) return;
    const allDecks = StorageService.getDecks();
    const updated = allDecks.map(d => d.id === deckId ? { ...d, name } : d);
    StorageService.saveDecks(updated);
    setDecks(updated.filter(d => d.examIds.includes(examId)));
    setRenamingDeckId(null);
  }

  function handleDeleteDeck(deckId: string) {
    const allDecks = StorageService.getDecks().filter(d => d.id !== deckId);
    const allCards = StorageService.getFlashcards().filter(f => f.deckId !== deckId);
    StorageService.saveDecks(allDecks);
    StorageService.saveFlashcards(allCards);
    setDecks(allDecks.filter(d => d.examIds.includes(examId)));
    setFlashcards(allCards);
    if (selectedDeckId === deckId) { setSelectedDeckId(null); setDeckView('manage'); }
    setPendingDeleteDeckId(null);
  }

  // ── Card CRUD ─────────────────────────────────────────────────────────────

  function handleCardAdded(card: Flashcard) {
    const allCards = StorageService.getFlashcards();
    StorageService.saveFlashcards([...allCards, card]);
    setFlashcards(prev => [...prev, card]);
  }

  // Called from FlashcardViewer "Save to Deck" button
  function handleSaveCardToDeck(question: LegacyQuestion, deckId: string): boolean {
    const alreadyExists = flashcards.some(f => f.front === question.question && f.deckId === deckId);
    if (alreadyExists) return false;
    const correctText = question.correctAnswers.map(i => question.options[i]).join(' / ');
    const card: Flashcard = {
      id: crypto.randomUUID(),
      deckId,
      front: question.question,
      back: correctText,
      masteryLevel: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    handleCardAdded(card);
    return true;
  }

  // ── Convert Flashcard[] → LegacyQuestion[] for FlashcardViewer ───────────
  function toViewerQuestions(cards: Flashcard[]): LegacyQuestion[] {
    const bankMap = new Map(legacyQuestions.map(q => [q.question, q]));
    return cards.map(c => {
      const bankQ = bankMap.get(c.front);
      return {
        question: c.front,
        options: bankQ ? bankQ.options : [c.back],
        correctAnswers: bankQ ? bankQ.correctAnswers : [0],
        explanation: bankQ?.explanation ?? '',
        domain: bankQ?.domain,
      };
    });
  }

  // ── Review view ───────────────────────────────────────────────────────────

  if (deckView === 'review' && selectedDeck) {
    const viewerQuestions = toViewerQuestions(deckCards);
    
    // Build flashcard map for mastery tracking (question text -> flashcard data)
    const flashcardMap = new Map(
      deckCards.map(c => [c.front, { id: c.id, masteryLevel: c.masteryLevel }])
    );

    function handleUpdateMastery(flashcardId: string, known: boolean) {
      const allCards = StorageService.getFlashcards();
      const card = allCards.find(c => c.id === flashcardId);
      if (!card) return;
      
      // Update mastery: increment if known, reset to 0 if still learning
      const updated = allCards.map(c => 
        c.id === flashcardId 
          ? { 
              ...c, 
              masteryLevel: known ? c.masteryLevel + 1 : 0,
              lastReviewedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : c
      );
      StorageService.saveFlashcards(updated);
      setFlashcards(updated);
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDeckView('manage')} aria-label="Back to deck management">
            <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
            Back
          </Button>
          <span className="text-sm text-gray-400">
            Reviewing: <strong className="text-gray-200">{selectedDeck.name}</strong>
          </span>
        </div>
        {viewerQuestions.length > 0 ? (
          <FlashcardViewer
            questions={viewerQuestions}
            shuffleQuestions={() => {}}
            decks={decks}
            onSaveCardToDeck={handleSaveCardToDeck}
            onCreateDeck={createDeck}
            flashcardMap={flashcardMap}
            onUpdateMastery={handleUpdateMastery}
          />
        ) : (
          <div className="py-10 text-center text-gray-500 text-sm">
            This deck has no cards yet. Use "Add from Exam Bank" to populate it.
          </div>
        )}
      </div>
    );
  }

  // ── Manage view ───────────────────────────────────────────────────────────

  const manageNavBtn = (view: 'decks' | 'search', label: string) => (
    <button
      onClick={() => setManageView(view)}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        manageView === view ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 border-b border-gray-800 pb-2">
        {manageNavBtn('decks', 'My Decks')}
        {manageNavBtn('search', 'Add from Exam Bank')}
      </div>

      {/* ── Decks view ── */}
      {manageView === 'decks' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{decks.length} deck{decks.length !== 1 ? 's' : ''}</span>
            {!showNewDeckForm && (
              <Button size="sm" onClick={() => setShowNewDeckForm(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                New Deck
              </Button>
            )}
          </div>

          {showNewDeckForm && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDeckName}
                onChange={e => setNewDeckName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateDeck();
                  if (e.key === 'Escape') { setShowNewDeckForm(false); setNewDeckName(''); }
                }}
                placeholder="Deck name…"
                className="flex-1 text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-3 py-1.5 focus:outline-none focus:border-blue-500"
                autoFocus
                aria-label="New deck name"
              />
              <Button size="sm" disabled={!newDeckName.trim()} onClick={handleCreateDeck}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowNewDeckForm(false); setNewDeckName(''); }}>Cancel</Button>
            </div>
          )}

          {decks.length === 0 && !showNewDeckForm && (
            <div className="py-8 text-center text-gray-500 text-sm space-y-2">
              <p>No decks yet.</p>
              <p className="text-xs">Create a deck, then use "Add from Exam Bank" to populate it with questions.</p>
            </div>
          )}

          <ul className="space-y-2" role="list">
            {decks.map(deck => {
              const count = flashcards.filter(f => f.deckId === deck.id).length;
              const isRenaming = renamingDeckId === deck.id;
              return (
                <li key={deck.id} className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3">
                  {isRenaming ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={renameDeckName}
                        onChange={e => setRenameDeckName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameDeck(deck.id);
                          if (e.key === 'Escape') setRenamingDeckId(null);
                        }}
                        className="flex-1 text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 focus:outline-none focus:border-blue-500"
                        autoFocus
                        aria-label="Rename deck"
                      />
                      <Button size="sm" disabled={!renameDeckName.trim()} onClick={() => handleRenameDeck(deck.id)} className="text-xs h-7 px-2">Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setRenamingDeckId(null)} className="text-xs h-7 px-2">Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-200">{deck.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{count} card{count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {count > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedDeckId(deck.id); setDeckView('review'); }}
                            className="text-xs h-7 px-2"
                            aria-label={`Start review for ${deck.name}`}
                          >
                            <PlayCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            Review
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setRenamingDeckId(deck.id); setRenameDeckName(deck.name); }}
                          className="text-xs h-7 px-2 text-gray-400 hover:text-gray-200"
                          aria-label={`Rename ${deck.name}`}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPendingDeleteDeckId(deck.id)}
                          className="text-xs h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          aria-label={`Delete ${deck.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Legacy fallback: no decks yet, show all exam questions as flashcards */}
          {decks.length === 0 && legacyQuestions.length > 0 && (
            <div className="pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-3 text-center">
                No custom decks yet — showing all exam questions as flashcards.
              </p>
              <FlashcardViewer
                questions={legacyQuestions}
                shuffleQuestions={shuffleLegacy}
                decks={[]}
                onSaveCardToDeck={() => false}
                onCreateDeck={createDeck}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Add from Exam Bank view ── */}
      {manageView === 'search' && (
        <QuestionSearchPanel
          examId={examId}
          questions={legacyQuestions}
          decks={decks}
          flashcards={flashcards}
          onCardAdded={handleCardAdded}
          onCreateDeck={createDeck}
        />
      )}

      {/* Deck delete confirmation */}
      <Modal
        isOpen={pendingDeleteDeckId !== null}
        title="Delete Deck"
        message="Delete this deck and all its cards? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => pendingDeleteDeckId && handleDeleteDeck(pendingDeleteDeckId)}
        onCancel={() => setPendingDeleteDeckId(null)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// QuizApp — root component
// ---------------------------------------------------------------------------

type TabValue = 'review' | 'quiz' | 'flashcards' | 'data' | 'progress';

const TAB_LABELS: Record<TabValue, string> = {
  review: 'Review',
  quiz: 'Quiz',
  flashcards: 'Flashcards',
  data: 'Data',
  progress: 'Progress',
};

const TAB_ORDER: TabValue[] = ['review', 'quiz', 'flashcards', 'data', 'progress'];

const QuizApp = () => {
  const [examIndex, setExamIndex] = useState<ExamIndex[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [questions, setQuestions] = useState<LegacyQuestion[]>([]);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabValue>('review');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  const handleQuotaExceeded = useCallback((e: Event) => {
    const detail = (e as CustomEvent<QuotaExceededDetail>).detail;
    setStorageWarning(detail.message);
  }, []);

  useEffect(() => {
    window.addEventListener(QUOTA_EXCEEDED_EVENT, handleQuotaExceeded);
    return () => window.removeEventListener(QUOTA_EXCEEDED_EVENT, handleQuotaExceeded);
  }, [handleQuotaExceeded]);

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
    const savedExam = StorageService.getSelectedExam();
    if (savedExam) setSelectedExam(savedExam);
    fetch('/exams/index.json')
      .then(res => res.json())
      .then(setExamIndex)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedExam) {
      StorageService.saveSelectedExam(selectedExam);
      const exam = examIndex.find(e => e.id === selectedExam);
      if (exam) {
        fetch(exam.path)
          .then(res => res.json())
          .then(setQuestions)
          .catch(console.error);
      }
    }
  }, [selectedExam, examIndex]);

  const shuffleQuestions = () => {
    setQuestions(questions => [...questions].sort(() => Math.random() - 0.5));
  };

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
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          Select an exam to get started
        </label>
        <Select value={selectedExam} onValueChange={setSelectedExam}>
          <SelectTrigger>
            <SelectValue placeholder="Choose an exam..." />
          </SelectTrigger>
          <SelectContent>
            {examIndex.map(exam => (
              <SelectItem key={exam.id} value={exam.id}>{exam.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedExam && (
        <div className="mt-8 flex flex-col items-center gap-3 text-center text-gray-500">
          <PlayCircle className="w-10 h-10 opacity-30" aria-hidden="true" />
          <p className="text-sm">Choose an exam from the dropdown above to start studying.</p>
        </div>
      )}

      {selectedExam && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          {/* ── Desktop navigation ── */}
          <TabsList className="hidden md:flex w-full">
            <TabsTrigger value="review" className="flex-1">Review</TabsTrigger>
            <TabsTrigger value="quiz" className="flex-1">Quiz</TabsTrigger>
            <TabsTrigger value="flashcards" className="flex-1">Flashcards</TabsTrigger>
            <TabsTrigger value="data" className="flex-1">Data</TabsTrigger>
            <TabsTrigger value="progress" className="flex-1">Progress</TabsTrigger>
          </TabsList>

          {/* ── Mobile navigation ── */}
          <div ref={mobileNavRef} className="flex md:hidden flex-col relative">
            <div className="flex items-center justify-between rounded-lg bg-gray-900/50 px-4 py-2 min-h-[44px]">
              <span className="text-sm font-medium text-gray-100">{TAB_LABELS[activeTab]}</span>
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
            {mobileMenuOpen && (
              <div
                role="menu"
                className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-gray-700 bg-gray-900 shadow-lg overflow-hidden"
              >
                {TAB_ORDER.map((tab) => (
                  <button
                    key={tab}
                    role="menuitem"
                    onClick={() => { setActiveTab(tab); setMobileMenuOpen(false); }}
                    className={`flex items-center w-full px-4 min-h-[44px] text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-gray-800 text-gray-100'
                        : 'text-gray-300 hover:bg-gray-800/60 hover:text-gray-100'
                    }`}
                  >
                    {TAB_LABELS[tab]}
                    {activeTab === tab && <span className="ml-auto text-blue-400" aria-hidden="true">✓</span>}
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
              <QuizMode questions={questions} selectedExam={selectedExam} />
            </TabsContent>
            <TabsContent value="flashcards">
              <FlashcardsTab
                examId={selectedExam}
                legacyQuestions={questions}
                shuffleLegacy={shuffleQuestions}
              />
            </TabsContent>
            <TabsContent value="data">
              <ImportExportPanel />
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
