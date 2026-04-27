import { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Shuffle } from 'lucide-react';
import type { LegacyQuestion } from '../../types';

export interface ReviewModeProps {
  questions: LegacyQuestion[];
  shuffleQuestions: () => void;
}

export const ReviewMode = ({ questions, shuffleQuestions }: ReviewModeProps) => {
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

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
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
