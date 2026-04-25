import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { Question, QuestionType } from '../../types/index';

interface QuestionFormProps {
  examId: string;
  question?: Question;
  onSave: (q: Question) => void;
  onCancel: () => void;
}

interface FormErrors {
  prompt?: string;
  options?: string;
  correctIndices?: string;
  type?: string;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export function QuestionForm({ examId, question, onSave, onCancel }: QuestionFormProps) {
  const isEdit = !!question;

  const [prompt, setPrompt] = useState(question?.prompt ?? '');
  const [type, setType] = useState<QuestionType>(question?.type ?? 'multiple-choice');
  const [options, setOptions] = useState<string[]>(
    question?.options ?? ['', '']
  );
  const [correctIndices, setCorrectIndices] = useState<number[]>(
    question?.correctIndices ?? []
  );
  const [domain, setDomain] = useState(question?.domainId ?? '');
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [errors, setErrors] = useState<FormErrors>({});

  // When type changes to MC, keep only the first selected correct index
  useEffect(() => {
    if (type === 'multiple-choice' && correctIndices.length > 1) {
      setCorrectIndices([correctIndices[0]]);
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): FormErrors {
    const errs: FormErrors = {};

    if (!prompt.trim()) {
      errs.prompt = 'Prompt is required.';
    }

    const filledOptions = options.filter(o => o.trim() !== '');
    if (filledOptions.length < MIN_OPTIONS) {
      errs.options = `At least ${MIN_OPTIONS} options are required.`;
    }

    if (correctIndices.length === 0) {
      errs.correctIndices = 'At least one correct answer must be selected.';
    } else if (type === 'multiple-choice' && correctIndices.length !== 1) {
      errs.correctIndices = 'Multiple-choice questions must have exactly one correct answer.';
    } else if (type === 'multi-select' && correctIndices.length < 2) {
      errs.correctIndices = 'Multi-select questions must have at least two correct answers.';
    }

    // Validate that all correctIndices point to non-empty options
    const outOfBounds = correctIndices.some(
      idx => idx >= options.length || !options[idx]?.trim()
    );
    if (outOfBounds && !errs.correctIndices) {
      errs.correctIndices = 'A selected correct answer points to an empty or removed option.';
    }

    return errs;
  }

  function handleOptionChange(idx: number, value: string) {
    setOptions(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function addOption() {
    if (options.length < MAX_OPTIONS) {
      setOptions(prev => [...prev, '']);
    }
  }

  function removeOption(idx: number) {
    if (options.length <= MIN_OPTIONS) return;
    setOptions(prev => prev.filter((_, i) => i !== idx));
    // Remove this index from correctIndices and shift higher indices down
    setCorrectIndices(prev =>
      prev
        .filter(ci => ci !== idx)
        .map(ci => (ci > idx ? ci - 1 : ci))
    );
  }

  function toggleCorrect(idx: number) {
    if (type === 'multiple-choice') {
      setCorrectIndices([idx]);
    } else {
      setCorrectIndices(prev =>
        prev.includes(idx) ? prev.filter(ci => ci !== idx) : [...prev, idx]
      );
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    const now = new Date().toISOString();
    const saved: Question = {
      id: question?.id ?? crypto.randomUUID(),
      examId,
      domainId: domain.trim() || undefined,
      type,
      prompt: prompt.trim(),
      options: options.map(o => o.trim()),
      correctIndices,
      explanation: explanation.trim() || undefined,
      createdAt: question?.createdAt ?? now,
      updatedAt: now,
    };

    onSave(saved);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? 'Edit Question' : 'Add Question'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="qf-prompt">
              Prompt <span aria-hidden="true" className="text-red-400">*</span>
            </label>
            <textarea
              id="qf-prompt"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-y"
              placeholder="Enter the question prompt…"
              aria-describedby={errors.prompt ? 'qf-prompt-error' : undefined}
            />
            {errors.prompt && (
              <p id="qf-prompt-error" role="alert" className="mt-1 text-xs text-red-400">
                {errors.prompt}
              </p>
            )}
          </div>

          {/* Question type */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="qf-type">
              Question Type <span aria-hidden="true" className="text-red-400">*</span>
            </label>
            <select
              id="qf-type"
              value={type}
              onChange={e => setType(e.target.value as QuestionType)}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value="multiple-choice">Multiple Choice (1 correct answer)</option>
              <option value="multi-select">Multi-Select (2+ correct answers)</option>
            </select>
          </div>

          {/* Options */}
          <div>
            <fieldset>
              <legend className="block text-sm font-medium mb-2">
                Answer Options <span aria-hidden="true" className="text-red-400">*</span>
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  {type === 'multiple-choice'
                    ? 'Select the radio button for the correct answer.'
                    : 'Check all correct answers.'}
                </span>
              </legend>

              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {/* Correct answer selector */}
                    {type === 'multiple-choice' ? (
                      <input
                        type="radio"
                        name="correct-answer"
                        checked={correctIndices.includes(idx)}
                        onChange={() => toggleCorrect(idx)}
                        aria-label={`Mark option ${idx + 1} as correct`}
                        className="shrink-0 accent-blue-500"
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={correctIndices.includes(idx)}
                        onChange={() => toggleCorrect(idx)}
                        aria-label={`Mark option ${idx + 1} as correct`}
                        className="shrink-0 accent-blue-500"
                      />
                    )}

                    <input
                      type="text"
                      value={opt}
                      onChange={e => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                      aria-label={`Option ${idx + 1} text`}
                    />

                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      disabled={options.length <= MIN_OPTIONS}
                      aria-label={`Remove option ${idx + 1}`}
                      className="shrink-0 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {errors.options && (
                <p role="alert" className="mt-1 text-xs text-red-400">
                  {errors.options}
                </p>
              )}
              {errors.correctIndices && (
                <p role="alert" className="mt-1 text-xs text-red-400">
                  {errors.correctIndices}
                </p>
              )}

              {options.length < MAX_OPTIONS && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                  className="mt-2"
                >
                  + Add Option
                </Button>
              )}
            </fieldset>
          </div>

          {/* Domain (optional) */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="qf-domain">
              Domain <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="qf-domain"
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="e.g. Security, Networking…"
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Explanation (optional) */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="qf-explanation">
              Explanation <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="qf-explanation"
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-y"
              placeholder="Explain why the correct answer is correct…"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {isEdit ? 'Save Changes' : 'Add Question'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
