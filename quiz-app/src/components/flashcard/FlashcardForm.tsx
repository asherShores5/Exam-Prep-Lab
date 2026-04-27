/**
 * FlashcardForm — create or edit a Flashcard within a Deck.
 *
 * Props:
 *  - deckId: the deck this card belongs to
 *  - flashcard: if provided, the form is in edit mode
 *  - onSave: called with the saved Flashcard
 *  - onCancel: called when the user cancels
 */

import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { Flashcard } from '../../types/index';

interface FlashcardFormProps {
  deckId: string;
  flashcard?: Flashcard;
  onSave: (flashcard: Flashcard) => void;
  onCancel: () => void;
}

export function FlashcardForm({ deckId, flashcard, onSave, onCancel }: FlashcardFormProps) {
  const [front, setFront] = useState(flashcard?.front ?? '');
  const [back, setBack] = useState(flashcard?.back ?? '');
  const [frontError, setFrontError] = useState('');
  const [backError, setBackError] = useState('');

  function validate(): boolean {
    let valid = true;

    if (!front.trim()) {
      setFrontError('Front (term or question) is required.');
      valid = false;
    } else {
      setFrontError('');
    }

    if (!back.trim()) {
      setBackError('Back (definition or answer) is required.');
      valid = false;
    } else {
      setBackError('');
    }

    return valid;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const now = new Date().toISOString();
    const saved: Flashcard = {
      id: flashcard?.id ?? crypto.randomUUID(),
      deckId,
      front: front.trim(),
      back: back.trim(),
      masteryLevel: flashcard?.masteryLevel ?? 0,
      lastReviewedAt: flashcard?.lastReviewedAt,
      createdAt: flashcard?.createdAt ?? now,
      updatedAt: now,
    };

    onSave(saved);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {flashcard ? 'Edit Flashcard' : 'New Flashcard'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Front */}
          <div>
            <label htmlFor="fc-front" className="block text-sm mb-1">
              Front <span aria-hidden="true" className="text-red-400">*</span>
              <span className="text-gray-500 font-normal ml-1">(term or question)</span>
            </label>
            <textarea
              id="fc-front"
              rows={3}
              value={front}
              onChange={e => {
                setFront(e.target.value);
                if (frontError) setFrontError('');
              }}
              placeholder="e.g. What does S3 stand for?"
              aria-required="true"
              aria-describedby={frontError ? 'fc-front-error' : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 resize-y ${
                frontError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-700 focus:ring-gray-500'
              }`}
            />
            {frontError && (
              <p id="fc-front-error" role="alert" className="mt-1 text-xs text-red-400">
                {frontError}
              </p>
            )}
          </div>

          {/* Back */}
          <div>
            <label htmlFor="fc-back" className="block text-sm mb-1">
              Back <span aria-hidden="true" className="text-red-400">*</span>
              <span className="text-gray-500 font-normal ml-1">(definition or answer)</span>
            </label>
            <textarea
              id="fc-back"
              rows={3}
              value={back}
              onChange={e => {
                setBack(e.target.value);
                if (backError) setBackError('');
              }}
              placeholder="e.g. Simple Storage Service — object storage with unlimited capacity."
              aria-required="true"
              aria-describedby={backError ? 'fc-back-error' : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 resize-y ${
                backError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-700 focus:ring-gray-500'
              }`}
            />
            {backError && (
              <p id="fc-back-error" role="alert" className="mt-1 text-xs text-red-400">
                {backError}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {flashcard ? 'Save Changes' : 'Add Card'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default FlashcardForm;
