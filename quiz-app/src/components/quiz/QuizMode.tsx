import { useState, useEffect } from 'react';
import { Flag } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Modal } from '../ui/Modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import type { LegacyQuestion, QuizResult, QuizResultDomain, Deck, Flashcard, ExamSimPreset } from '../../types';
import { StorageService } from '../../services/storage';
import { AnalyticsDisplay } from '../analytics/AnalyticsDisplay';
import { getAllTagsForExam, filterByTag } from '../../services/tagService';
import { shuffle } from '../../lib/shuffle';
import { isAnswerCorrect, isSingleSelect } from '../../lib/answers';
import { resolveSimPreset, isPass } from '../../lib/examSim';
import { QuestionSkeleton } from '../ui/skeleton';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import { useToast } from '../ui/toast';
import { StarToggle } from '../flashcard/StarToggle';
import { getPracticeIncorrectIds } from '../../services/studyState';

// ---------------------------------------------------------------------------
// QuizMode
// ---------------------------------------------------------------------------

export interface QuizModeProps {
  questions: LegacyQuestion[];
  selectedExam: string;
  /** Optional Exam Simulation preset for this exam (from index.json). */
  simPreset?: ExamSimPreset;
}

export const QuizMode = ({ questions, selectedExam, simPreset }: QuizModeProps) => {
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
  // Pass threshold for the in-progress attempt; null = normal quiz (no pass/fail).
  const [simThreshold, setSimThreshold] = useState<number | null>(null);
  // Indices flagged "for review" during the in-progress attempt.
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  // Guards the one-shot low-time warning per attempt.
  const [lowTimeWarned, setLowTimeWarned] = useState(false);
  // Shows a confirm dialog when finishing with unanswered/flagged questions.
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const { toast } = useToast();
  const availableTags = getAllTagsForExam(selectedExam);

  const availableDomains = Array.from(
    new Set(questions.map(q => q.domain).filter((d): d is string => !!d))
  ).sort();

  // Reset filters when the selected exam changes — domains and tags are
  // exam-specific, so carrying them across a switch would filter against a
  // pool that no longer contains them.
  useEffect(() => {
    setSelectedDomain('all');
    setSelectedTags([]);
  }, [selectedExam]);

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

  // One-shot low-time warning toast at the 60-second mark.
  useEffect(() => {
    if (quizStarted && !showResults && !lowTimeWarned && timeRemaining > 0 && timeRemaining <= 60) {
      setLowTimeWarned(true);
      toast('Less than 1 minute remaining!', 'error');
    }
  }, [quizStarted, showResults, lowTimeWarned, timeRemaining, toast]);

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
        if (isAnswerCorrect(answers[idx] ?? [], q.correctAnswers)) entry.correct += 1;
        domainMap.set(q.domain, entry);
      });
      const domains: QuizResultDomain[] = Array.from(domainMap.entries()).map(([domain, d]) => ({
        domain,
        correct: d.correct,
        total: d.total,
      }));

      // Stable ids of questions the user got wrong — source for Practice-Incorrect (§3.2).
      const incorrectQuestionIds = quizQuestions
        .filter((q, idx) => typeof q.id === 'number' && !isAnswerCorrect(answers[idx] ?? [], q.correctAnswers))
        .map(q => q.id as number);

      const result: QuizResult = {
        date: new Date().toISOString(),
        score,
        totalQuestions: quizQuestions.length,
        timeSpent,
        percentage: (score / quizQuestions.length) * 100,
        ...(domains.length > 0 ? { domains } : {}),
        ...(incorrectQuestionIds.length > 0 ? { incorrectQuestionIds } : {}),
        ...(simThreshold !== null ? { passThresholdPercent: simThreshold } : {}),
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
  }, [shouldSaveResult, showResults, selectedExam, quizQuestions, timeLimit, timeRemaining, simThreshold]);

  /** Start a quiz from a given pool. `count` caps the question count;
   * `minutes` sets the timer; `threshold` (percent) marks this as an Exam
   * Simulation graded pass/fail, or null for a normal quiz. */
  const beginQuiz = (
    pool: LegacyQuestion[],
    count: number,
    minutes: number,
    threshold: number | null = null,
  ) => {
    const shuffled = shuffle(pool);
    const picked = shuffled.slice(0, count);
    setQuizQuestions(picked);
    setTimeRemaining(minutes * 60);
    setAnswers(Array.from({ length: picked.length }, () => []));
    setCurrentIndex(0);
    setQuizStarted(true);
    setShouldSaveResult(false);
    setSimThreshold(threshold);
    setFlagged(new Set());
    setLowTimeWarned(false);
  };

  const toggleFlag = (idx: number) => {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const finishQuiz = () => {
    setShowFinishConfirm(false);
    setShowResults(true);
    setShouldSaveResult(true);
  };

  /** Confirm before finishing if any question is unanswered or flagged. */
  const requestFinish = () => {
    const unanswered = quizQuestions.filter((_, i) => (answers[i]?.length ?? 0) === 0).length;
    if (unanswered > 0 || flagged.size > 0) setShowFinishConfirm(true);
    else finishQuiz();
  };

  const startQuiz = () => {
    let pool = selectedDomain === 'all'
      ? questions
      : questions.filter(q => q.domain === selectedDomain);

    // Apply tag filter
    if (selectedTags.length > 0) {
      const taggedSets = selectedTags.map(tag => new Set(filterByTag(pool, selectedExam, tag).map(q => q.question)));
      pool = pool.filter(q => taggedSets.some(set => set.has(q.question)));
    }

    beginQuiz(pool, questionCount, timeLimit);
  };

  /** Quick-start: quiz only the questions the user has missed/is still learning (§3.2). */
  const startPracticeIncorrect = () => {
    const ids = new Set(getPracticeIncorrectIds(selectedExam));
    const pool = questions.filter(q => typeof q.id === 'number' && ids.has(q.id));
    if (pool.length === 0) return;
    beginQuiz(pool, Math.min(pool.length, questionCount), timeLimit);
  };

  /** Exam Simulation (§3.5): full-length, real timer, graded pass/fail, no
   * mid-quiz answer reveal (the quiz UI never reveals answers mid-attempt). */
  const startExamSim = () => {
    const preset = resolveSimPreset(simPreset, questions.length);
    beginQuiz(questions, preset.questionCount, preset.timeLimitMinutes, preset.passThresholdPercent);
  };

  const calculateScore = () => {
    let correct = 0;
    answers.forEach((answer, idx) => {
      if (isAnswerCorrect(answer, quizQuestions[idx].correctAnswers)) {
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

  const selectAnswer = (idx: number, singleSelect: boolean) => {
    setAnswers(prev => {
      const newAnswers = [...prev];
      if (singleSelect) {
        // Radio behaviour: selecting an option replaces any prior choice.
        newAnswers[currentIndex] = newAnswers[currentIndex]?.includes(idx) ? [] : [idx];
      } else {
        // Checkbox behaviour: toggle the option in/out of the set.
        const currentAnswers = new Set(newAnswers[currentIndex]);
        if (currentAnswers.has(idx)) currentAnswers.delete(idx);
        else currentAnswers.add(idx);
        newAnswers[currentIndex] = Array.from(currentAnswers);
      }
      return newAnswers;
    });
  };

  // Keyboard navigation during an in-progress quiz (number keys select an
  // option, arrows move between questions, Enter advances/finishes).
  const inQuiz = quizStarted && !showResults && quizQuestions.length > 0;
  useKeyboardNav({
    enabled: inQuiz,
    onSelectOption: (idx) => {
      const q = quizQuestions[currentIndex];
      if (q && idx < q.options.length) selectAnswer(idx, isSingleSelect(q.correctAnswers));
    },
    onPrev: () => setCurrentIndex(i => Math.max(0, i - 1)),
    onNext: () => setCurrentIndex(i => Math.min(quizQuestions.length - 1, i + 1)),
    onPrimary: () => {
      if (currentIndex === quizQuestions.length - 1) {
        requestFinish();
      } else {
        setCurrentIndex(i => Math.min(quizQuestions.length - 1, i + 1));
      }
    },
  });

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

    // Practice-Incorrect quick-start availability (§3.2).
    const incorrectIds = new Set(getPracticeIncorrectIds(selectedExam));
    const incorrectPoolSize = questions.filter(q => typeof q.id === 'number' && incorrectIds.has(q.id)).length;

    // Exam Simulation preset (§3.5) — resolved against the actual bank size.
    const sim = resolveSimPreset(simPreset, questions.length);

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
              {incorrectPoolSize > 0 && (
                <Button
                  onClick={startPracticeIncorrect}
                  variant="outline"
                  className="w-full border-red-700 text-red-300 hover:bg-red-900/20"
                >
                  Practice What You Missed ({incorrectPoolSize})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Exam Simulation (§3.5) — realistic conditions from the per-exam preset. */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl mb-1">Exam Simulation</h2>
            <p className="text-sm text-gray-400 mb-4">
              Full-length, timed practice under realistic exam conditions{simPreset ? '' : ' (default settings)'}.
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-2">
                <p className="text-lg font-semibold text-gray-100">{sim.questionCount}</p>
                <p className="text-xs text-gray-400">Questions</p>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-2">
                <p className="text-lg font-semibold text-gray-100">{sim.timeLimitMinutes}m</p>
                <p className="text-xs text-gray-400">Time Limit</p>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-2">
                <p className="text-lg font-semibold text-gray-100">{sim.passThresholdPercent}%</p>
                <p className="text-xs text-gray-400">To Pass</p>
              </div>
            </div>
            <Button onClick={startExamSim} className="w-full" disabled={questions.length === 0}>
              Start Exam Simulation
            </Button>
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
      if (isAnswerCorrect(answers[idx] ?? [], q.correctAnswers)) entry.correct += 1;
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
      const incorrectQuestions = quizQuestions.filter((_, idx) =>
        !isAnswerCorrect(answers[idx] ?? [], quizQuestions[idx].correctAnswers)
      );

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
          <h2 className="text-2xl mb-4">{simThreshold !== null ? 'Exam Simulation Results' : 'Quiz Results'}</h2>
          <div className="space-y-4">
            {/* Score + pass/fail indicator */}
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-lg">
                Score: {score} / {quizQuestions.length} ({percentage.toFixed(1)}%)
              </p>
              {simThreshold !== null && (
                isPass(percentage, simThreshold) ? (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-900/30 border border-green-600 text-green-300">
                    PASS — met {simThreshold}% threshold
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-900/30 border border-red-600 text-red-300">
                    FAIL — needed {simThreshold}%
                  </span>
                )
              )}
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
                  setSimThreshold(null);
                  setFlagged(new Set());
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
                  const isCorrect = isAnswerCorrect(userAnswer, q.correctAnswers);
                  return (
                    <Card key={qIdx} className={isCorrect ? 'border-green-700/30' : 'border-red-700/30'}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{qIdx + 1}. {q.question}</p>
                          <StarToggle key={q.id ?? qIdx} examId={selectedExam} questionId={q.id} className="shrink-0 -mt-1" />
                        </div>
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

  if (!quizQuestions.length) return <QuestionSkeleton />;

  const question = quizQuestions[currentIndex];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-sm text-gray-400">
        <div>Question {currentIndex + 1} of {quizQuestions.length}</div>
        <div className={timeRemaining <= 60 ? 'text-red-400 font-semibold' : ''}>
          Time Remaining: {formatTime(timeRemaining)}
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <p className="text-lg mb-1">{question.question}</p>
          {(() => {
            const singleSelect = isSingleSelect(question.correctAnswers);
            const selectHint = singleSelect
              ? 'Select one answer'
              : `Select ${question.correctAnswers.length} answers`;
            return (
              <>
                <p className="text-xs text-gray-500 mb-3">{selectHint} · press 1–{Math.min(9, question.options.length)} to choose</p>
                <div
                  className="space-y-2"
                  role={singleSelect ? 'radiogroup' : 'group'}
                  aria-label="Answer options"
                >
                  {question.options.map((option, idx) => {
                    const selected = answers[currentIndex]?.includes(idx) ?? false;
                    return (
                      <div
                        key={idx}
                        role={singleSelect ? 'radio' : 'checkbox'}
                        tabIndex={0}
                        aria-checked={selected}
                        onClick={() => selectAnswer(idx, singleSelect)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectAnswer(idx, singleSelect);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                          selected
                            ? 'bg-blue-900/20 border-blue-600'
                            : 'border-gray-700 hover:border-gray-600'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`shrink-0 w-4 h-4 border ${
                            singleSelect ? 'rounded-full' : 'rounded'
                          } ${
                            selected ? 'bg-blue-500 border-blue-500' : 'border-gray-500'
                          }`}
                        />
                        {idx < 9 && <span className="shrink-0 font-mono text-xs text-gray-500">{idx + 1}.</span>}
                        {option}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleFlag(currentIndex)}
              aria-pressed={flagged.has(currentIndex)}
              className={flagged.has(currentIndex) ? 'border-amber-600 text-amber-300' : ''}
            >
              <Flag className={`w-4 h-4 mr-1.5 ${flagged.has(currentIndex) ? 'fill-amber-400 text-amber-400' : ''}`} aria-hidden="true" />
              {flagged.has(currentIndex) ? 'Flagged' : 'Flag for review'}
            </Button>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}>
              Previous
            </Button>
            {currentIndex === quizQuestions.length - 1 ? (
              <Button onClick={requestFinish}>
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

      {/* Question grid — jump to any question; shows answered + flagged state. */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-gray-500 mb-2">Jump to question</p>
          <div className="flex flex-wrap gap-1.5" role="list" aria-label="Question navigation">
            {quizQuestions.map((_, idx) => {
              const answered = (answers[idx]?.length ?? 0) > 0;
              const isFlagged = flagged.has(idx);
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={idx}
                  role="listitem"
                  onClick={() => setCurrentIndex(idx)}
                  aria-current={isCurrent}
                  aria-label={`Question ${idx + 1}${answered ? ', answered' : ''}${isFlagged ? ', flagged' : ''}`}
                  className={`relative w-8 h-8 rounded-md text-xs font-medium border transition-colors ${
                    isCurrent
                      ? 'border-blue-500 ring-1 ring-blue-500'
                      : 'border-gray-700 hover:border-gray-500'
                  } ${
                    answered ? 'bg-blue-900/30 text-blue-200' : 'bg-gray-800/40 text-gray-400'
                  }`}
                >
                  {idx + 1}
                  {isFlagged && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={showFinishConfirm}
        title="Finish quiz?"
        message={(() => {
          const unanswered = quizQuestions.filter((_, i) => (answers[i]?.length ?? 0) === 0).length;
          const parts: string[] = [];
          if (unanswered > 0) parts.push(`${unanswered} unanswered`);
          if (flagged.size > 0) parts.push(`${flagged.size} flagged for review`);
          return `You have ${parts.join(' and ')}. Submit anyway?`;
        })()}
        confirmLabel="Finish Quiz"
        cancelLabel="Keep Going"
        onConfirm={finishQuiz}
        onCancel={() => setShowFinishConfirm(false)}
      />
    </div>
  );
};
