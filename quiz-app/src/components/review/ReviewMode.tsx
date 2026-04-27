import { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Shuffle, X } from 'lucide-react';
import type { LegacyQuestion } from '../../types';
import { getTags, addTag, removeTag, getAllTagsForExam, filterByTag } from '../../services/tagService';

export interface ReviewModeProps {
  questions: LegacyQuestion[];
  shuffleQuestions: () => void;
  selectedExam: string;
}

export const ReviewMode = ({ questions, shuffleQuestions, selectedExam }: ReviewModeProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [newTag, setNewTag] = useState('');
  const [questionTags, setQuestionTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  const filteredQuestions = selectedTag
    ? filterByTag(questions, selectedExam, selectedTag)
    : questions;

  useEffect(() => {
    if (filteredQuestions.length > 0) {
      const q = filteredQuestions[currentIndex];
      if (q) {
        setQuestionTags(getTags(selectedExam, q.question));
      }
      setAllTags(getAllTagsForExam(selectedExam));
    }
  }, [currentIndex, selectedExam, questions, selectedTag, filteredQuestions.length]);

  if (!questions.length) return (
    <div className="py-10 text-center text-gray-500 text-sm">Loading questions…</div>
  );

  if (!filteredQuestions.length) return (
    <div className="space-y-4">
      {allTags.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selectedTag}
            onChange={e => { setSelectedTag(e.target.value); setCurrentIndex(0); setShowAnswer(false); }}
            className="text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 focus:outline-none focus:border-blue-500"
            aria-label="Filter by tag"
          >
            <option value="">All Questions</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      )}
      <div className="py-10 text-center text-gray-500 text-sm">No questions match the selected tag.</div>
    </div>
  );

  const question = filteredQuestions[currentIndex];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Question {currentIndex + 1} of {filteredQuestions.length}
        </div>
        <div className="flex items-center gap-2">
          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={e => { setSelectedTag(e.target.value); setCurrentIndex(0); setShowAnswer(false); }}
              className="text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 focus:outline-none focus:border-blue-500"
              aria-label="Filter by tag"
            >
              <option value="">All Questions</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={shuffleQuestions}>
            <Shuffle className="w-4 h-4 mr-2" />
            Shuffle
          </Button>
        </div>
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

          {/* Tag chips and add-tag input */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {questionTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/50 text-xs text-blue-200">
                {tag}
                <button
                  onClick={() => {
                    removeTag(selectedExam, question.question, tag);
                    setQuestionTags(getTags(selectedExam, question.question));
                    setAllTags(getAllTagsForExam(selectedExam));
                  }}
                  className="hover:text-red-300"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTag.trim()) {
                    addTag(selectedExam, question.question, newTag.trim());
                    setQuestionTags(getTags(selectedExam, question.question));
                    setAllTags(getAllTagsForExam(selectedExam));
                    setNewTag('');
                  }
                }}
                placeholder="Add tag…"
                className="text-xs rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 w-24 focus:outline-none focus:border-blue-500"
                aria-label="Add tag"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}>
              Previous
            </Button>
            <Button variant="outline" onClick={() => setShowAnswer(!showAnswer)}>
              {showAnswer ? 'Hide Answer' : 'Show Answer'}
            </Button>
            <Button
              onClick={() => { setCurrentIndex(i => Math.min(filteredQuestions.length - 1, i + 1)); setShowAnswer(false); }}
              disabled={currentIndex === filteredQuestions.length - 1}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
