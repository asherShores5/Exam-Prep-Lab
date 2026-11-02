/**
 * LearnerGate — one-time "What's your name?" screen (SPEC §9.1).
 *
 * Renders its children once a Learner exists. If storage is blocked the
 * Learner lives in memory only and studying still works.
 */

import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../ui/button';
import {
  createLearner,
  getLearner,
  learnerNameError,
  LEARNER_NAME_MAX,
  type Learner,
} from '../../services/learner';

export function LearnerGate({ children }: { children: ReactNode }) {
  const [learner, setLearner] = useState<Learner | null>(() => getLearner());
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (learner) return <>{children}</>;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nameError = learnerNameError(name);
    if (nameError) {
      setError(nameError);
      return;
    }
    setLearner(createLearner(name));
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-3 rounded-lg border border-border bg-card p-6"
        noValidate
      >
        <label htmlFor="learner-name" className="block text-lg font-semibold text-foreground">
          What's your name?
        </label>
        <input
          id="learner-name"
          type="text"
          autoFocus
          autoComplete="given-name"
          maxLength={LEARNER_NAME_MAX}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? 'learner-name-error' : undefined}
          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && (
          <p id="learner-name-error" role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <Button type="submit">Continue</Button>
      </form>
    </div>
  );
}
