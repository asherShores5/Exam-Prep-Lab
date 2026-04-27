import { useState, useEffect, useCallback, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { X, PlayCircle } from 'lucide-react';
import type { LegacyQuestion, ExamIndex } from './types/index';
import { StorageService, STORAGE_KEYS, QUOTA_EXCEEDED_EVENT, type QuotaExceededDetail } from './services/storage';
import { ImportExportPanel } from './components/management/ImportExportPanel';
import { ProgressDashboard } from './components/progress/ProgressDashboard';
import { ReviewMode } from './components/review/ReviewMode';
import { QuizMode } from './components/quiz/QuizMode';
import { FlashcardsTab } from './components/flashcard/FlashcardsTab';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { validateExamQuestions } from './services/validateExam';

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
  const [skippedCount, setSkippedCount] = useState(0);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Check storage usage on mount and warn if >80%
  useEffect(() => {
    const usage = StorageService.getStorageUsage();
    if (usage.percentage > 80) {
      setStorageWarning(`Storage is ${usage.percentage.toFixed(0)}% full. Export your data to avoid losing progress.`);
    }
  }, []);

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

  const fetchExamIndex = useCallback(() => {
    fetch('/exams/index.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setExamIndex(data);
        setLoadError(null);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(`Failed to load exam list. ${err instanceof Error ? err.message : ''}`);
      });
  }, []);

  useEffect(() => {
    fetchExamIndex();
  }, [fetchExamIndex]);

  useEffect(() => {
    if (examIndex.length === 0) return;
    const savedExam = StorageService.getSelectedExam();
    if (savedExam && examIndex.some(e => e.id === savedExam)) {
      setSelectedExam(savedExam);
    } else if (savedExam) {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_EXAM);
    }
  }, [examIndex]);

  const fetchExamQuestions = useCallback((exam: ExamIndex) => {
    fetch(exam.path)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const { valid, skipped } = validateExamQuestions(data, exam.id);
        setQuestions(valid);
        setSkippedCount(skipped);
        setLoadError(null);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(`Failed to load exam questions. ${err instanceof Error ? err.message : ''}`);
      });
  }, []);

  useEffect(() => {
    if (selectedExam) {
      StorageService.saveSelectedExam(selectedExam);
      const exam = examIndex.find(e => e.id === selectedExam);
      if (exam) {
        fetchExamQuestions(exam);
      }
    }
  }, [selectedExam, examIndex, fetchExamQuestions]);

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

      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between mb-4 px-4 py-3 rounded-lg bg-red-900/40 border border-red-600 text-red-200 text-sm"
        >
          <span>{loadError}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoadError(null);
              if (examIndex.length === 0) {
                fetchExamIndex();
              } else if (selectedExam) {
                const exam = examIndex.find(e => e.id === selectedExam);
                if (exam) fetchExamQuestions(exam);
              }
            }}
            className="ml-4 shrink-0"
          >
            Retry
          </Button>
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
              <SelectItem key={exam.id} value={exam.id}>
                {exam.name}{exam.description ? ` — ${exam.description}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {skippedCount > 0 && (
          <p className="text-xs text-yellow-400 mt-1">
            Loaded {questions.length} questions ({skippedCount} skipped due to missing data)
          </p>
        )}
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
              <ErrorBoundary fallbackTitle="Review Mode Error">
                <ReviewMode questions={questions} shuffleQuestions={shuffleQuestions} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="quiz">
              <ErrorBoundary fallbackTitle="Quiz Mode Error">
                <QuizMode questions={questions} selectedExam={selectedExam} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="flashcards">
              <ErrorBoundary fallbackTitle="Flashcards Error">
                <FlashcardsTab
                  examId={selectedExam}
                  legacyQuestions={questions}
                  shuffleLegacy={shuffleQuestions}
                />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="data">
              <ErrorBoundary fallbackTitle="Data Management Error">
                <ImportExportPanel />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="progress">
              <ErrorBoundary fallbackTitle="Progress Dashboard Error">
                <ProgressDashboard selectedExam={selectedExam} />
              </ErrorBoundary>
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
};

export default QuizApp;
