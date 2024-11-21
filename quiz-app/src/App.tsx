import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Shuffle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Question {
  question: string;
  options: string[];
  correctAnswers: number[];
  explanation: string;
}

interface ExamIndex {
  id: string;
  name: string;
  path: string;
}

interface QuizResult {
  date: string;
  score: number;
  totalQuestions: number;
  timeSpent: number;
  percentage: number;
}

interface ExamAnalytics {
  [examId: string]: {
    results: QuizResult[];
    averageScore: number;
    bestScore: number;
    totalAttempts: number;
    averageTime: number;
  }
}

const ReviewMode = ({ questions, shuffleQuestions }: { questions: Question[], shuffleQuestions: () => void }) => {
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
    const storedAnalytics = localStorage.getItem('quizAnalytics');
    if (storedAnalytics) {
      const allAnalytics: ExamAnalytics = JSON.parse(storedAnalytics);
      setAnalytics(allAnalytics[examId] || null);
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

const QuizMode = ({ questions, selectedExam }: { questions: Question[], selectedExam: string }) => {
  const [answers, setAnswers] = useState<number[][]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [timeLimit, setTimeLimit] = useState(30);
  const [questionCount, setQuestionCount] = useState(10);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [shouldSaveResult, setShouldSaveResult] = useState(false);

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
      
      const storedAnalytics = localStorage.getItem('quizAnalytics');
      const allAnalytics = storedAnalytics ? JSON.parse(storedAnalytics) : {};
      
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
      localStorage.setItem('quizAnalytics', JSON.stringify(allAnalytics));
      
      setShouldSaveResult(false);
    }
  }, [shouldSaveResult, showResults, selectedExam, quizQuestions, timeLimit, timeRemaining]);

  const startQuiz = () => {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
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
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl mb-6">Quiz Settings</h2>
            <div className="space-y-4">
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
                disabled={questions.length < questionCount}
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
    
    return (
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-2xl mb-4">Quiz Results</h2>
          <div className="space-y-4">
            <p className="text-lg">
              Score: {score} / {quizQuestions.length} ({((score / quizQuestions.length) * 100).toFixed(1)}%)
            </p>
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

const FlashcardMode = ({ questions, shuffleQuestions }: { questions: Question[], shuffleQuestions: () => void }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  
  if (!questions.length) return <div>Loading questions...</div>;
  
  const question = questions[currentIndex];
  
  // Get only the correct answers from the options
  const correctAnswers = question.correctAnswers.map(index => question.options[index]);
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Card {currentIndex + 1} of {questions.length}
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
      
      <Card 
        className="min-h-64 cursor-pointer"
        onClick={() => setShowBack(!showBack)}
      >
        <CardContent className="pt-6 h-full flex items-center justify-center">
          {!showBack ? (
            <p className="text-lg text-center">{question.question}</p>
          ) : (
            <div className="space-y-2">
              {correctAnswers.map((answer, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border bg-green-900/20 border-green-600"
                >
                  {answer}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="flex justify-between">
        <Button
          onClick={() => {
            setCurrentIndex(i => Math.max(0, i - 1));
            setShowBack(false);
          }}
          disabled={currentIndex === 0}
        >
          Previous
        </Button>
        <Button
          onClick={() => {
            setCurrentIndex(i => Math.min(questions.length - 1, i + 1));
            setShowBack(false);
          }}
          disabled={currentIndex === questions.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

const QuizApp = () => {
  const [examIndex, setExamIndex] = useState<ExamIndex[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  
  useEffect(() => {
    // Load saved exam selection
    const savedExam = localStorage.getItem('selectedExam');
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
      localStorage.setItem('selectedExam', selectedExam);
      
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
        <Tabs defaultValue="review">
          <TabsList className="w-full">
            <TabsTrigger value="review" className="flex-1">Review</TabsTrigger>
            <TabsTrigger value="quiz" className="flex-1">Quiz</TabsTrigger>
            <TabsTrigger value="flashcards" className="flex-1">Flashcards</TabsTrigger>
          </TabsList>
          
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
              <FlashcardMode questions={questions} shuffleQuestions={shuffleQuestions} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
};

export default QuizApp;