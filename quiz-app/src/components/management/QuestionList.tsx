import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Modal } from '../ui/Modal';
import type { Question } from '../../types/index';

interface QuestionListProps {
  examId: string;
  questions: Question[];
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  'multiple-choice': 'MC',
  'multi-select': 'Multi',
};

export function QuestionList({ questions, onEdit, onDelete }: QuestionListProps) {
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null);

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
        <p className="text-lg font-medium mb-1">No questions yet</p>
        <p className="text-sm">Add your first question using the form below.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((q, index) => (
        <Card key={q.id}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              {/* Question number */}
              <span className="shrink-0 mt-0.5 text-xs text-gray-500 w-6 text-right">
                {index + 1}.
              </span>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-100 leading-snug line-clamp-3">
                  {q.prompt}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* Type badge */}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      q.type === 'multiple-choice'
                        ? 'bg-blue-900/40 text-blue-300 border border-blue-700'
                        : 'bg-purple-900/40 text-purple-300 border border-purple-700'
                    }`}
                  >
                    {TYPE_LABELS[q.type] ?? q.type}
                  </span>

                  {/* Domain badge */}
                  {q.domainId && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-800 text-gray-300 border border-gray-700">
                      {q.domainId}
                    </span>
                  )}

                  {/* Options count */}
                  <span className="text-xs text-gray-500">
                    {q.options.length} options · {q.correctIndices.length} correct
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(q)}
                  aria-label={`Edit question: ${q.prompt.slice(0, 60)}`}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeletingQuestion(q)}
                  aria-label={`Delete question: ${q.prompt.slice(0, 60)}`}
                  className="text-red-400 hover:text-red-300 border-red-900 hover:border-red-700"
                >
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Modal
        isOpen={!!deletingQuestion}
        title="Delete Question"
        message={
          deletingQuestion
            ? `Are you sure you want to delete this question?\n\n"${deletingQuestion.prompt.slice(0, 120)}${deletingQuestion.prompt.length > 120 ? '…' : ''}"\n\nThis action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingQuestion) {
            onDelete(deletingQuestion.id);
            setDeletingQuestion(null);
          }
        }}
        onCancel={() => setDeletingQuestion(null)}
      />
    </div>
  );
}
