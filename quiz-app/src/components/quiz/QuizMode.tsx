import { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import type { LegacyQuestion, QuizResult, QuizResultDomain, Deck, Flashcard } from '../../types';
import { StorageService } from '../../services/storage';
import { AnalyticsDisplay } from '../analytics/AnalyticsDisplay';
import { getAllTagsForExam, filterByTag } from '../../services/tagService';

// ---------------------------------------------------------------------------
// QuizMode
// ---------------------------------------------------------------------------

export interface QuizModeProps {
  questions: LegacyQuestion[];
  selectedExam: string;
}

export const QuizMode = ({ questions, selectedExam }: QuizModeProps) => {
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [showSaveIncorrect, setShowSaveIncorrect] = useState(false);
  const [saveDeckName, setSaveDeckName] = useState('');
  const [selectedSaveDeckId, setSelectedSaveDeckId] = useState<string>('');
  const [saveIncorrectDone, setSaveIncorrectDone] = useState(false);

  const availableTags = getAllTagsForExam(selectedExam);

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
    let pool = selectedDomain === 'all'
      ? questions
      : questions.filter(q => q.domain === selectedDomain);

    // Apply tag filter
    if (selectedTags.length > 0) {
      const taggedSets = selectedTags.map(tag => new Set(filterByTag(pool, selectedExam, tag).map(q => q.question)));
      pool = pool.filter(q => taggedSets.some(set => set.has(q.question)));
    }

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
      if (JSON.stringify([...answer].sort()) === JSON.stringify([...quizQuestions[idx].correctAnswers].sort())) {
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
    const domainPool = selectedDomain === 'all'
      ? questions
      : questions.filter(q => q.domain === selectedDomain);

    let filteredPool = domainPool;
    if (selectedTags.length > 0) {
      const taggedSets = selectedTags.map(tag => new Set(filterByTag(domainPool, selectedExam, tag).map(q => q.question)));
      filteredPool = domainPool.filter(q => taggedSets.some(set => set.has(q.question)));
    }

    const poolSize = filteredPool.length;

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
              {availableTags.length > 0 && (
                <div>
                  <label className="block text-sm mb-2">Tag Filter</label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setSelectedTags(prev =>
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        )}
                        className={`px-2 py-1 rounded-full text-xs border transition-colors ${
                          selectedTags.includes(tag)
                            ? 'bg-blue-900/30 border-blue-600 text-blue-200'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
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
    const percentage = (score / quizQuestions.length) * 100;
    const incorrectCount = quizQuestions.length - score;

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

    // Get available decks for "Save Incorrect to Deck" feature
    const availableDecks = StorageService.getDecks().filter(d => d.examIds.includes(selectedExam));

    function handleSaveIncorrectToDeck() {
      let targetDeckId = selectedSaveDeckId;

      // Create new deck if user typed a name
      if (!targetDeckId && saveDeckName.trim()) {
        const newDeck: Deck = {
          id: crypto.randomUUID(),
          name: saveDeckName.trim(),
          examIds: [selectedExam],
          createdAt: new Date().toISOString(),
        };
        const allDecks = StorageService.getDecks();
        StorageService.saveDecks([...allDecks, newDeck]);
        targetDeckId = newDeck.id;
      }

      if (!targetDeckId) return;

      // Collect incorrectly answered questions
      const incorrectQuestions = quizQuestions.filter((_, idx) => {
        const userAnswer = answers[idx] ?? [];
        return JSON.stringify([...userAnswer].sort()) !== JSON.stringify([...quizQuestions[idx].correctAnswers].sort());
      });

      // Get existing flashcards to avoid duplicates
      const existingFlashcards = StorageService.getFlashcards();
      const existingFronts = new Set(
        existingFlashcards.filter(f => f.deckId === targetDeckId).map(f => f.front)
      );

      // Create flashcards for incorrect questions
      const newCards: Flashcard[] = [];
      for (const q of incorrectQuestions) {
        if (existingFronts.has(q.question)) continue;
        const correctText = q.correctAnswers.map(i => q.options[i]).join(' / ');
        newCards.push({
          id: crypto.randomUUID(),
          deckId: targetDeckId,
          front: q.question,
          back: correctText + (q.explanation ? `\n\n${q.explanation}` : ''),
          masteryLevel: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      if (newCards.length > 0) {
        StorageService.saveFlashcards([...existingFlashcards, ...newCards]);
      }

      setSaveIncorrectDone(true);
      setShowSaveIncorrect(false);
    }

    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-2xl mb-4">Quiz Results</h2>
          <div className="space-y-4">
            {/* Score + pass/fail indicator */}
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-lg">
                Score: {score} / {quizQuestions.length} ({percentage.toFixed(1)}%)
              </p>
            </div>

            {/* Domain breakdown */}
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

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => setShowReview(!showReview)} variant="outline">
                {showReview ? 'Hide Review' : 'Review Questions'}
              </Button>
              {incorrectCount > 0 && !saveIncorrectDone && (
                <Button onClick={() => setShowSaveIncorrect(!showSaveIncorrect)} variant="outline">
                  Save {incorrectCount} Incorrect to Deck
                </Button>
              )}
              {saveIncorrectDone && (
                <span className="px-3 py-2 text-xs text-green-300">✓ Saved to deck</span>
              )}
              <Button
                onClick={() => {
                  setQuizStarted(false);
                  setShowResults(false);
                  setShowReview(false);
                  setShowSaveIncorrect(false);
                  setSaveDeckName('');
                  setSelectedSaveDeckId('');
                  setSaveIncorrectDone(false);
                }}
                className="flex-1"
              >
                New Quiz
              </Button>
            </div>

            {/* Save Incorrect to Deck UI */}
            {showSaveIncorrect && (
              <div className="p-4 rounded-lg border border-gray-700 bg-gray-900/40 space-y-3">
                <p className="text-sm font-medium">Save incorrect questions as flashcards</p>
                {availableDecks.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Select existing deck</label>
                    <Select value={selectedSaveDeckId} onValueChange={(value) => { setSelectedSaveDeckId(value); setSaveDeckName(''); }}>
                      <SelectTrigger><SelectValue placeholder="Choose a deck…" /></SelectTrigger>
                      <SelectContent>
                        {availableDecks.map(deck => (
                          <SelectItem key={deck.id} value={deck.id}>{deck.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Or create a new deck</label>
                  <input
                    type="text"
                    value={saveDeckName}
                    onChange={e => { setSaveDeckName(e.target.value); setSelectedSaveDeckId(''); }}
                    placeholder="New deck name…"
                    className="w-full text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-3 py-1.5 focus:outline-none focus:border-blue-500"
                    aria-label="New deck name for incorrect questions"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!selectedSaveDeckId && !saveDeckName.trim()}
                    onClick={handleSaveIncorrectToDeck}
                  >
                    Save to Deck
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowSaveIncorrect(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Post-quiz review */}
            {showReview && (
              <div className="space-y-4 mt-4">
                {quizQuestions.map((q, qIdx) => {
                  const userAnswer = answers[qIdx] ?? [];
                  const isCorrect = JSON.stringify([...userAnswer].sort()) === JSON.stringify([...q.correctAnswers].sort());
                  return (
                    <Card key={qIdx} className={isCorrect ? 'border-green-700/30' : 'border-red-700/30'}>
                      <CardContent className="pt-4 space-y-2">
                        <p className="text-sm font-medium">{qIdx + 1}. {q.question}</p>
                        {q.options.map((opt, oIdx) => {
                          const isUserSelected = userAnswer.includes(oIdx);
                          const isCorrectOption = q.correctAnswers.includes(oIdx);
                          let style = 'border-gray-700';
                          if (isCorrectOption) style = 'bg-green-900/20 border-green-600';
                          else if (isUserSelected) style = 'bg-red-900/20 border-red-600';
                          return (
                            <div key={oIdx} className={`p-2 rounded-lg border text-sm ${style}`}>{opt}</div>
                          );
                        })}
                        {q.explanation && (
                          <div className="p-2 rounded-lg bg-blue-900/20 border border-blue-700/50 text-xs text-blue-200">
                            <p className="font-semibold text-blue-300 mb-1">Explanation</p>
                            <p>{q.explanation}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
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
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
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
